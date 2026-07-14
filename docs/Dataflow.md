# Dataflow

## Pipeline overview

```flow
side [chess.com API](#chess-com-api) {#flow-chesscom} {top}
side [`tpl_players`](#tpl_players) {#flow-tpl} {top}
side [Game Sync](#tgr_gamesraw) {#flow-gamesync}
side [`tgr_gamesraw`](#tgr_gamesraw) {#flow-tgr} {table} {pair}
side [Deconstruct Games](#tgd_gamesdecon) {#flow-deconstruct}
side [`tgd_gamesdecon`](#tgd_gamesdecon) {#flow-tgd} {table} {pair}
side [Build Game Positions](#tgam_game_positions) {#flow-buildtree}
side [`tgam_game_positions`](#tgam_game_positions) {#flow-tgam} {table} {pair}
side [bulkUpdateCpLoss](#bulk-update-cp-loss) {#flow-bulkupdate} {process} {pair}
side [Sync Position Tree](#tpos_positions) {#flow-synctpos}
side [`tpos_positions`](#tpos_positions) {#flow-tpos} {table} {pair}
side [Purge](#purge) {#flow-purge} {process} {pair}
side [Evaluate Positions](#teva_evaluations) {#flow-evaluate}
side [`teva_evaluations`](#teva_evaluations) {#flow-teva} {table} {pair}
edge flow-tpl -> flow-gamesync
edge flow-chesscom -> flow-gamesync
edge flow-gamesync -> flow-tgr
edge flow-tgr -> flow-deconstruct
edge flow-deconstruct -> flow-tgd
edge flow-tgd -> flow-buildtree
edge flow-buildtree -> flow-tgam
edge flow-tgam -> flow-synctpos
edge flow-synctpos -> flow-tpos
edge flow-tpos -> flow-evaluate
edge flow-evaluate -> flow-teva
edge flow-purge -> flow-tgam
edge flow-purge -> flow-tpos
edge flow-purge -> flow-teva
edge flow-bulkupdate -> flow-tgam
```

## `tpl_players` {#tpl_players}

### Purpose

One row per tracked player: identity, display metadata, and the sync resume cutoff
(`pl_last_synced_end_time`) that lets `tgr_gamesraw` be wiped every run without losing
incremental-sync progress.

### Input

[chess.com API](#chess-com-api) — one-time, when a player is added via the Maintenance page.

### Processing

#### Summary

A player row is created once, from chess.com's profile and stats; after that, only the sync
cutoff timestamp is ever updated.

#### Details

1. Add player - Maintenance Page
2. Sync cutoff - update `pl_last_synced_end_time`

### Output

`pl_last_synced_end_time` (read by `initSync` as the resume cutoff) and the player list itself
(read by `getPlayers`).

### Consumers

#### Home dashboard / game sync

`getPlayers` — the player list driving both the UI and the cron sync loop.

#### tgr_gamesraw

`initSync` reads `pl_last_synced_end_time` to decide where to resume (see
[tgr_gamesraw](#tgr_gamesraw)'s Processing).

### Rules/gotchas

`pl_avatar` and `pl_display_name` are set once at add-time and never refreshed afterward — no code
path calls `upsertPlayer` again for an existing player. (`pl_rating_blitz` used to have the same
issue, plus was never actually written by the one real call site in the first place — dropped
2026-07-15.) The rating actually shown on the Home dashboard comes from a separate table,
`tplr_player_ratings`, kept fresh by the daily `updatePlayerRating` cron step.

`pl_avatar` stores chess.com's own hosted image URL as text, not a downloaded copy — `PlayerProfile.tsx`
renders it as `<img src={pl_avatar}>` directly. The app never fetches this image again after add-time,
but it still depends on chess.com continuing to serve that exact URL indefinitely. See
`.claude/CLAUDE.md` Outstanding items for the suggestion to store the image itself.

## chess.com API {#chess-com-api}

### Purpose

Source of all game and player data for the whole pipeline — every synced game, plus a player's
profile and ratings when first added. External system, not a table — Input/Processing don't apply
the way they do for the rest of this doc.

### Output

Three endpoints, all under `https://api.chess.com/pub`:
- `/player/{username}/games/archives` + each monthly archive — full game list (PGN, players,
  ratings, time class, result) — [`sync.ts`](../src/lib/actions/sync.ts)
- `/player/{username}` — profile (avatar, display name) — `fetchPlayer` in
  [`chesscom.ts`](../src/lib/chesscom.ts)
- `/player/{username}/stats` — ratings per time class — `fetchPlayerStats` in
  [`chesscom.ts`](../src/lib/chesscom.ts)

### Consumers

#### Game sync

`sync.ts`'s `initSync`/`syncArchive` — feeds `tgr_gamesraw`.

#### Add player

Maintenance page (`fetchPlayer`/`fetchPlayerStats`) — feeds `tpl_players`, one-time at add.

## `tgr_gamesraw` {#tgr_gamesraw}

### Purpose

Stage a player's freshly-downloaded chess.com games for one sync run; not a historical archive.
It's fully cleared and rewritten on *every* sync (not just "full replace") — the resume cutoff
comes from `tpl_players.pl_last_synced_end_time`, not this table's own contents, specifically so
it can be wiped/archived freely without breaking incremental sync (CLAUDE.md lesson 1). At any
moment it only holds the current run's games for whichever player is mid-sync.

### Input

[chess.com API](#chess-com-api)

### Processing

#### Summary

Clears the player's existing rows, then re-downloads and inserts every game from the resume point
forward.

#### Details

1. Clear staging - deletes the player's rows first, every sync (not just "refresh")
2. Fetch archive list - on refresh, resume cutoff comes from [`tpl_players`](#tpl_players)
3. Download + insert - only rules-chess games in an included time class; skips anything at/before
   the cutoff

### Output

`tgr_gamesraw` itself: one row per game — raw JSON, PGN, end time, time class.

### Consumers

#### tgd_gamesdecon

`deconstructGames` reads every row not yet present there.

#### Maintenance page

`getGameCount` (`games.ts`) — total game count per player, shown on `/owner/maintenance`.

### Rules/gotchas

"Refresh" sync still fully clears staging first, not additive — easy to assume otherwise from the
name. `games.ts` also has its own `getRecentGames`/`insertRawGame` on this table, but they're dead
code (never imported anywhere) — the live sync path uses `sync.ts`'s own versions instead.

## `tgd_gamesdecon` {#tgd_gamesdecon}

### Purpose

Parses each raw chess.com game into structured, queryable columns — opening, ECO code, result,
ratings, termination, time class. The first point where a game becomes visible to the games list
and the analysis pipeline.

### Input

[`tgr_gamesraw`](#tgr_gamesraw)

### Processing

#### Summary

Reads raw games not yet deconstructed, skips ones too short to ever produce a trackable position,
parses PGN headers, and writes one row per game.

#### Details

1. Select - rows not yet in `tgd_gamesdecon` (matched on `gd_chesscom_uuid` + `gd_player`)
2. Skip - no `pgn` field, or 6 or fewer half-moves (can never reach `MIN_ANALYSIS_MOVE`)
3. Parse + insert - PGN headers, opening, termination, per-player color/result/opponent

### Output

`tgd_gamesdecon` — one row per game. Also upserts `tec_ecoreference` (ECO code → opening name) as
a side effect whenever both are present — write-only today, nothing reads it back yet.

### Consumers

#### tgam_game_positions

`buildPositionTree` replays `gd_pgn`.

#### Home dashboard

Games list, rating chart, opening/termination stats — all read via `games.ts`.

#### tpl_players

`updatePlayerRating` reads the latest rating per time class.

### Rules/gotchas

A game is skipped once it's 6 or fewer half-moves — not just true zero-move games. The threshold
is derived from `MIN_ANALYSIS_MOVE`, not hardcoded, so it moves automatically if that constant
changes.

## `tgam_game_positions` {#tgam_game_positions}

### Purpose

**Produce a centipawn change per tracked-player move.**

Each row captures one ply — the tracked player's own turn only. In standard chess notation a
"move" is White's ply plus Black's reply (two plies sharing one move number); a `tgam` row
brackets just one side of that: `gam_pos_fen` is the board right before the tracked player's ply,
`gam_resulting_fen` is right after it, before the opponent replies. That before/after pair is what
makes `gam_cp_change` measurable once both FENs are evaluated.

### Input

`tgd_gamesdecon`

### Processing

#### Summary

Creates a `tpos_positions` record for each position — the "before" position and, separately, the
"after" position — for every tracked-player move.

#### Details

1. *Insert (Phase A)* — Replays `gd_pgn` move-by-move with chess.js
   ([`getPositionsFromGame`](../src/lib/analysis/buildPositionTree.ts#L40)), deriving the
   before/after FEN for each of the tracked player's own plies. Writes one `INSERT` per whole game
   (chunked by game, not row count, so it stays atomic per game). FEN text goes straight into
   `gam_pos_fen`/`gam_resulting_fen`; `gam_pos_id`/`gam_resulting_pos_id` are left `NULL`.
2. *Backfill (Phase B, `syncTposFromTgam`)* — idempotent, re-runnable any time. Fills
   `gam_pos_id`/`gam_resulting_pos_id` by FEN match against `tpos_positions`, creating missing
   `tpos_positions` rows as needed.
3. *CP-change backfill (`bulkUpdateCpLoss`)* — separate pipeline stage, own cron step. Fills
   `gam_cp_change` once both the before and after position have a `teva_evaluations` row.

### Output

`tpos_positions`

One record created (or matched) for each of the "before" and "after" positions of every
tracked-player move — see Processing above for how the FEN match/create is done.

### Consumers

#### Habits page

[`chessdb.ts`](../src/lib/analysis/chessdb.ts) — queries `tgam_game_positions` directly and live
for per-move win/loss/avg-CP breakdowns (`mov_wins`, `mov_losses`, `mov_avg_cp`).

#### Evaluate Positions, Phase 2

[`enrichPositionsStockfish.ts`](../src/lib/analysis/enrichPositionsStockfish.ts) — discovers its
worklist by joining through `gam_resulting_pos_id`.

#### Purge

[`purgePositions.ts`](../src/lib/analysis/purgePositions.ts) — deletes rows by `gam_pos_id`
membership in the refined candidate set.

#### tpos_positions

Phase B derives/backfills itself from unresolved tgam rows (see Processing above).

### Rules/gotchas

- A revisited position (transposition/repetition within the same game) is **not** deduped — it
  gets its own row each time. `pos_reached` counts `DISTINCT gam_gdid`, so this doesn't inflate
  reach counts, but it does mean move-frequency queries see every visit.
- `pos_reached` (on `tpos_positions`) is the *sum* of two separately-deduplicated counts —
  `COUNT(DISTINCT gam_gdid)` where `gam_pos_id` matches, plus `COUNT(DISTINCT gam_gdid)` where
  `gam_resulting_pos_id` matches ([`buildPositionTree.ts:174-193`](../src/lib/analysis/buildPositionTree.ts#L174-L193)).
  It is **not** a single distinct-game count across both sides: if the same game reaches a position
  once as a "before" position and once as an "after" position (e.g. a repeated position later in
  the same game), that one game is counted twice. **Assessed as a bug** (2026-07-14) — not yet
  fixed; see `.claude/CLAUDE.md` Outstanding items.
- Purge only full-deletes a row when `gam_pos_id` is in the candidate set — never based on
  `gam_resulting_pos_id` alone (the before-position can still be in scope even when the
  after-position isn't).

## `tpos_positions` {#tpos_positions}

### Purpose

The deduplicated position tree — one row per unique board position (FEN) reached by any
tracked-player move or its immediate result, with `pos_reached` counting how often. The shared
substrate both Habits/Quiz and Stockfish evaluation are built on.

### Input

[`tgam_game_positions`](#tgam_game_positions)

### Processing

#### Summary

Derived entirely from `tgam_game_positions` — never written to directly by the live pipeline.
Idempotent: safe to re-run any time, only touches rows still unresolved.

#### Details

1. Ensure - insert any missing position for a FEN referenced by an unresolved tgam row
2. Backfill - fill `gam_pos_id`/`gam_resulting_pos_id` by FEN match, capturing which positions
   were touched
3. Recompute - `pos_reached`/`pos_move_num` only for the positions touched this run

### Output

`pos_reached` (recomputed count), `pos_move_num` (earliest move number ever reached at — see
Rules/gotchas), `pos_color` (derived from the FEN itself).

### Consumers

#### Evaluate Positions

`enrichPositionsStockfish.ts` (server batch pipeline) and `EvalProgress.tsx` (browser-run, also on
`/owner/pipeline`) — two separate paths, both order by `pos_reached DESC`.

#### Purge

`purgePositions.ts` — candidate query starts from `pos_reached <= MIN_REACH_TO_KEEP`.

#### Position Detail page

`getPositionDetail` (`chessdb.ts`).

### Rules/gotchas

- `pos_move_num` is a "first-known" value, not a fixed property of the position — recomputed
  (never just written once) every time the position is touched again, since the same position can
  be reached at different move numbers via transposition in different games.
- `pos_ply_count` is unused/`NULL` on the live write path — `chessdb.ts` has its own
  `upsertPosition` that would set it, but that function is dead code, never called.
- **Resolved (2026-07-12):** ~319k rows previously had a wrong `pos_reached` (mostly stale, a small
  fraction truly orphaned) because the old design wrote `tpos_positions` *before*
  `tgam_game_positions` across four separate non-transactional steps — a partial failure left them
  out of sync with no way to self-heal. One-time manual SQL repair; the current design (tgam as
  source of truth, tpos fully derived/idempotent) removes the underlying cause.
- See also the `pos_reached` double-counting issue noted under
  [tgam_game_positions](#tgam_game_positions)'s Rules/gotchas — same root computation, referenced
  here since this is the table it writes to.

## Purge {#purge}

### Purpose

Delete low-value positions — and everything that depends on them — once they've had a fair chance
to repeat and didn't, so the position tree doesn't grow forever. Runs automatically on the daily
cron, *before* Evaluate Positions/Update CP Change, so Stockfish time is never spent evaluating a
position that's about to be deleted.

### Input

[`tpos_positions`](#tpos_positions) — candidates start from `pos_reached <= MIN_REACH_TO_KEEP`.

### Processing

#### Summary

A cheap candidate query, a refinement pass to protect positions still needed elsewhere, then
ordered deletes across four tables.

#### Details

1. Candidate query - indexed filter on `pos_reached` first, then confirm every occurrence is older
   than `PURGE_REACH_GRACE_DAYS` by joining through `tgam_game_positions` → `tgd_gamesdecon`
2. Refine - repeatedly exclude any candidate still needed as the after-position of a row whose
   before-position isn't also a candidate, looping until stable (a single pass isn't enough)
3. Delete - `teva_evaluations` → `tgam_game_positions` (`gam_pos_id` in the set) → stamp
   `tgd_gamesdecon.gd_positions_purged` on emptied games → `tpos_positions`

### Output

Rows removed from `teva_evaluations`, `tgam_game_positions`, `tpos_positions`.
`tgd_gamesdecon.gd_positions_purged` set true on any game left with zero `tgam` rows.

### Consumers

#### tgam_game_positions (Build Position Tree)

`buildPositionTree` checks `gd_positions_purged` alongside its own `NOT EXISTS` check, so a purged
game is never mistaken for an unprocessed one (see Rules/gotchas).

#### Status queries

`pipelineStatus.ts` checks the same flag for its counts.

### Rules/gotchas

- The candidate query is deliberately cheap-filter-first (reach, then age) rather than starting
  from "every old game" — most of `tgd_gamesdecon` is older than the grace period at any given
  time, so filtering by reach first is far cheaper.
- Refinement is a JS-side loop over id arrays, not a database temp table — `nextjs-shared/db`
  opens a new connection per query call, so a temp table from one call is invisible to the next.
- `gd_positions_purged` is a resurrection guard, confirmed live not theoretical: deleting its
  precursor without a replacement once caused 3,136 already-purged games to be silently
  reprocessed and their purged positions regenerated from scratch.
- A per-run row cap (`PURGE_ROW_CAP`) guards against a logic bug inflating the candidate set.

## `teva_evaluations` {#teva_evaluations}

### Purpose

One Stockfish evaluation per unique position — centipawn score (normalized to white's
perspective) and best move. The evaluation layer Habits, Quiz, Position Detail, and cp-change are
all built on.

### Input

[`tpos_positions`](#tpos_positions)

### Processing

#### Summary

Evaluates unevaluated positions with Stockfish, most-reached first, writing one row per position.

#### Details

1. Phase 1 - straight from `tpos_positions`, `pos_reached > MIN_REACH_TO_KEEP`, most-reached first
2. Phase 2 - resulting positions discovered via `gam_resulting_pos_id`, not reach-ordered
3. Normalize - Stockfish reports from the side-to-move's perspective; flipped to white's here

### Output

`teva_evaluations` — one row per position (`eva_pos_id` unique, upserted so re-runs are safe):
centipawn score, best move (UCI). No search depth is actually stored, despite what the
`/owner/pipeline` help text says.

### Consumers

#### bulkUpdateCpLoss

Reads both the before and after position's evaluation to compute `gam_cp_change` (see
[tgam_game_positions](#tgam_game_positions)).

#### Habits / Quiz / Position Detail

CP scores and best moves for drill data and the position detail page.

### Rules/gotchas

- Two separate Stockfish engines depending on environment: the native binary (`STOCKFISH_PATH`
  set, local dev, multi-threaded) or the WASM package (production/Vercel, the only one that
  actually runs there, single-threaded so slower).
- Two separate places trigger this evaluation logic: the server batch pipeline
  (`enrichPositionsStockfish`) and a browser-run alternative (`EvalProgress.tsx`, also on
  `/owner/pipeline`) — both write through the same `saveEvaluation` upsert.
- `getEvaluationForPosition` (`chessdb.ts`) is dead code — never called.
- Both evaluation phases filter out `pos_reached <= MIN_REACH_TO_KEEP` — belt-and-suspenders
  alongside running after Purge: Purge already removes old, low-reach positions before this step
  runs, and the filter here also protects a low-reach position still inside its grace period (not
  yet purge-eligible, but not worth spending Stockfish time on either). Dynamic, not permanent — a
  position at reach `1` today becomes eligible again the moment a later game reaches it a second
  time.

## `bulkUpdateCpLoss` {#bulk-update-cp-loss}

### Purpose

Backfill `tgam_game_positions.gam_cp_change` once both sides of a move have an evaluation —
decoupled from Evaluate Positions, its own pipeline step and trigger (own cron step, own
`/owner/pipeline` panel, own `/api/analysis/update-cp-change` route).

### Input

[`teva_evaluations`](#teva_evaluations)

### Processing

Single `UPDATE`, scoped to `gam_cp_change IS NULL` so it never re-touches already-computed rows:
`gam_cp_change` = after-eval minus before-eval, sign-flipped for Black so it's always from the
tracked player's own perspective.

### Output

`tgam_game_positions.gam_cp_change`

### Consumers

Same as [tgam_game_positions](#tgam_game_positions)'s Consumers — same column, same readers.

### Rules/gotchas

- Only fires once both `gam_pos_id` and `gam_resulting_pos_id` have a `teva_evaluations` row — a
  move whose after-position never gets evaluated (e.g. reach too low) keeps `gam_cp_change`
  permanently `NULL`.
- **Fixed 2026-07-12:** the original query had no `IS NULL` guard and rewrote the entire computed
  set on every run.
