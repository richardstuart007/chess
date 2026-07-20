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
side [Build Habits](#thab_habits) {#flow-buildhabits}
side [`thab_habits`](#thab_habits) {#flow-thab} {table} {pair}
side [Evaluate Game Endings](#evaluate-game-endings) {#flow-gameendings} {process} {pair}
side [Deepen Popular Positions](#deepen-popular-positions) {#flow-deepenpopular} {process} {pair}
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
edge flow-tgam -> flow-buildhabits
edge flow-buildhabits -> flow-thab
edge flow-gameendings -> flow-tgd
edge flow-teva -> flow-deepenpopular
edge flow-deepenpopular -> flow-teva
edge flow-deepenpopular -> flow-tgam
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

#### Shared PlayerProfile header / game sync

`getPlayers` — the player list driving both the cron sync loop and the shared PlayerProfile
header/nav (`AppShell.tsx`, rendered from the root layout), which reads `getPlayer`/
`getPlayerRatings` per player once and shows it above every page except `/owner/*`. Player
selection there writes to a shared `?player=` URL query param, which `HomeDashboard`, the Habits
page, and the Graph page all read instead of each keeping their own player-selection state.

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

Games list, opening/termination stats — all read via `games.ts`. Which player's games show is
read from the shared `?player=` URL param (see `tpl_players` Consumers above), not local state.

#### Graph page

Own top-level page/route (`/graph`, separate from the Home dashboard's tab set) — reads
`fetchFilteredGames` live via `games.ts` for the "Rating Over Time" chart, same as Home
dashboard's Games list does, but with its own filter state (date range/time class/records limit;
player comes from the shared `?player=` param, same as every other page) instead of the shared
`GameFilterPanel`/filters object. Separated the same way Habits was (own route, own filters) —
but unlike Habits, not backed by a materialized/pipeline-built table, since this query is a plain
indexed read, not an expensive derived computation. The `AppNav`/PlayerProfile header itself is no
longer rendered per-page — it comes from the root layout's `AppShell` (see `tpl_players`
Consumers).

#### tpl_players

`updatePlayerRating` reads the latest rating per time class.

### Rules/gotchas

A game is skipped once it's 6 or fewer half-moves — not just true zero-move games. The threshold
is derived from `MIN_ANALYSIS_MOVE`, not hardcoded, so it moves automatically if that constant
changes.

## `tgam_game_positions` {#tgam_game_positions}

### Purpose

**Produce a centipawn change per ply.**

Each row captures one ply — either side's turn, not just the tracked player's own. In standard
chess notation a "move" is White's ply plus Black's reply (two plies sharing one move number); a
`tgam` row brackets just one side of that: `gam_pos_fen` is the board right before the ply,
`gam_resulting_fen` is right after it, before the reply. That before/after pair is what makes
`gam_cp_change` measurable once both FENs are evaluated — and it's computed purely from whoever's
turn it was at `gam_pos_fen` (`tpos_positions.pos_color`), so the same logic already works for
either side with no tracked-player-specific handling. Queries that must stay scoped to the tracked
player's own moves (the Habits page) filter explicitly on `pos_color` vs. the game's player color;
queries about the position generally (Position Detail) intentionally don't.

### Input

`tgd_gamesdecon`

### Processing

#### Summary

Creates a `tpos_positions` record for each position — the "before" position and, separately, the
"after" position — for every ply.

#### Details

1. *Insert (Phase A)* — Replays `gd_pgn` move-by-move with chess.js
   ([`getPositionsFromGame`](../src/lib/analysis/buildPositionTree.ts#L40)), deriving the
   before/after FEN for every ply in the analysis window (both sides). Writes one `INSERT` per
   whole game (chunked by game, not row count, so it stays atomic per game). FEN text goes straight
   into `gam_pos_fen`/`gam_resulting_fen`; `gam_pos_id`/`gam_resulting_pos_id` are left `NULL`.
2. *Backfill (Phase B, `syncTposFromTgam`)* — idempotent, re-runnable any time. Fills
   `gam_pos_id`/`gam_resulting_pos_id` by FEN match against `tpos_positions`, creating missing
   `tpos_positions` rows as needed.
3. *CP-change backfill (`bulkUpdateCpLoss`)* — separate pipeline stage, own cron step. Fills
   `gam_cp_change` once both the before and after position have a `teva_evaluations` row.

### Output

`tpos_positions`

One record created (or matched) for each of the "before" and "after" positions of every
ply — see Processing above for how the FEN match/create is done.

### Consumers

#### Position Detail / Analyze page

[`chessdb.ts`](../src/lib/analysis/chessdb.ts) — `getMovesForPosition`/`getMoveSummaryForPosition`
query `tgam_game_positions` directly and live for per-move win/loss/CP breakdowns (`mov_wins`,
`mov_losses`, `mov_result_cp` — the resulting position's own Stockfish eval, looked up directly via
`gam_resulting_pos_id`, not averaged). Used by the Position Detail page's "Your Moves" tab and the
Analyze page's "Moves From This Position" panel — not the Habits page itself, which reads the
separate materialized [`thab_habits`](#thab_habits) table instead.

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
- `pos_reached` (on `tpos_positions`) is one `COUNT(DISTINCT gam_gdid)` over the union of both
  sides — `gam_pos_id` matches OR `gam_resulting_pos_id` matches
  ([`buildPositionTree.ts:160-187`](../src/lib/analysis/buildPositionTree.ts#L160-L187)) — so a
  game that reaches a position once as a "before" position and once as an "after" position (e.g. a
  repeated position later in the same game) still only counts once. **Fixed** (2026-07-14) — was
  previously a sum of two independently-deduplicated counts, which double-counted that case.
- Purge only full-deletes a row when `gam_pos_id` is in the candidate set — never based on
  `gam_resulting_pos_id` alone (the before-position can still be in scope even when the
  after-position isn't).
- Every ply is recorded (both sides), not just the tracked player's own — see Purpose above. A row
  has no column identifying whose move it was; that's derived at query time by comparing
  `tpos_positions.pos_color` (whose turn it was at `gam_pos_fen`) against the game's player color
  on `tgd_gamesdecon`.

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
- **Resolved (2026-07-14):** `pos_ply_count` was unused/`NULL` on the live write path — only the
  dead, never-called `upsertPosition` (`chessdb.ts`) ever set it. Column and function both removed.
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

A cheap candidate query, then ordered deletes across four tables — no cross-candidate refinement;
dangling references are handled by nulling out the specific pointer, not by protecting the position.

#### Details

1. Candidate query - indexed filter on `pos_reached` first, then confirm every occurrence is older
   than `PURGE_REACH_GRACE_DAYS` by joining through `tgam_game_positions` → `tgd_gamesdecon`
   (capped to `PURGE_ROW_CAP` rows, plain `LIMIT` on the seed — safe, since no candidate's
   eligibility depends on which other candidates are in the same batch)
2. Delete - `teva_evaluations` → `tgam_game_positions` full-deleted where `gam_pos_id` is a
   candidate → `tgam_game_positions.gam_resulting_pos_id` nulled out (row kept) where only that
   side is a candidate → stamp `tgd_gamesdecon.gd_positions_purged` on emptied games →
   `tpos_positions`

### Output

Rows removed from `teva_evaluations`, `tgam_game_positions`, `tpos_positions`.
`tgam_game_positions.gam_resulting_pos_id` nulled out (row kept) on rows whose before-position
wasn't a candidate. `tgd_gamesdecon.gd_positions_purged` set true on any game left with zero
`tgam` rows.

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
- No cross-candidate refinement — each candidate is independently safe to process regardless of
  which other candidates are in the same batch, since dangling references are resolved by nulling
  out the specific pointer (on the referencing row) rather than protecting the referenced position
  from deletion. An earlier design used an iterative fixpoint refinement loop instead; replaced
  (2026-07-15) once it became too slow at scale (multi-minute stalls) and was more complex than the
  documented before/resulting-pair rule actually requires.
- `gd_positions_purged` is a resurrection guard, confirmed live not theoretical: deleting its
  precursor without a replacement once caused 3,136 already-purged games to be silently
  reprocessed and their purged positions regenerated from scratch.
- No per-run row cap (removed 2026-07-15) — every eligible candidate is purged in one run. The
  earlier cap (`PURGE_ROW_CAP`) limited pace, not risk: since candidates are processed
  independently, a logic bug would be equally catastrophic (rebuild-from-scratch) whether it
  affected a capped batch or the full set, so the cap wasn't actually bounding blast radius.

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

## `thab_habits` {#thab_habits}

### Purpose

One row per `(player, position, move played)` recurring habit — **both good and bad**, not just
mistakes. The materialized aggregation the Habits page reads instead of live-aggregating
`tgam_game_positions` on every request.

### Input

[`tgam_game_positions`](#tgam_game_positions) joined to `tgd_gamesdecon` (player/color/result) and
`tpos_positions` (color match) — every tracked-player move at `move_num >= MIN_ANALYSIS_MOVE`.

### Processing

#### Summary

Full recompute every run, not incremental — a habit's stats can change as new games arrive for a
move already in the table, so there's no safe "already processed" cursor the way row-insertion
steps have one.

#### Details

1. Aggregate - group by `(player, pos_id, move_san)`, keep only groups reached
   `HABITS_MIN_REACH_FLOOR`+ times, filtered to the position's own color matching the player's
   color (so opponent moves are excluded)
2. `move_cp` - the single largest-magnitude `gam_cp_change` occurrence (sign kept), not an average
   — see Rules/gotchas
3. `resulting_pos_id` - deterministic per `(position, move)` group, captured for the eval-lookup
   join at read time (not stored as a delta itself)
4. Upsert - keyed on `(player, pos_id, move_san)`; never touches `hab_dismissed`, so a dismissed
   habit stays dismissed across every future rebuild even as its stats keep refreshing

### Output

`thab_habits` — times played, wins, losses, `hab_move_cp` (internal detection/sort signal only,
never displayed directly), `hab_resulting_pos_id`, `hab_dismissed` flag.

### Consumers

#### Habits page

`getHabitsData`/`getHabitsCount` ([`chessdb.ts`](../src/lib/analysis/chessdb.ts)) — read
`thab_habits` directly. The Bad/Good quality filter (default Bad) reads `hab_move_cp`'s sign;
default sort is `ABS(hab_move_cp) DESC` ("Biggest impact first"). The displayed "Eval" column comes
from a join through `hab_resulting_pos_id` → `teva_evaluations.eva_cp` — never `hab_move_cp` itself.

### Rules/gotchas

- Both good and bad recurring moves are stored — "habit" isn't synonymous with "mistake" (the
  `WHERE move_cp < 0` filter was removed 2026-07-19).
- `hab_move_cp` is clamped to ±`HABITS_MOVE_CP_CLAMP` to stay within its `numeric(6,2)` column
  precision, since mate scores are normalized to ±10000 and can exceed it.
- No incremental "remaining" backlog exists the way other steps have one, since this is a full
  recompute — the Owner > Pipeline page instead shows a genuine count of brand-new
  `(player, position, move)` combinations not yet captured at all, computed via the same
  aggregation shape plus a `LEFT JOIN thab_habits ... WHERE hab_habid IS NULL`.

## Evaluate Game Endings {#evaluate-game-endings}

### Purpose

Evaluate each game's **actual final position** — not capped at `MAX_ANALYSIS_MOVE` like the rest of
the pipeline — the only place in the app that reflects how a game actually ended, rather than its
early tracked moves.

### Input

[`tgd_gamesdecon`](#tgd_gamesdecon) — games whose `gd_final_eval` is still `NULL`, latest games
(`gd_gdid DESC`) first.

### Processing

#### Summary

Two phases: reuse an existing tracked-position eval when the game's true final position happens to
already be evaluated (free), then fall back to a fresh Stockfish evaluation, spread across
concurrent engine instances, for the rest.

#### Details

1. Replay - `chess.js` replays each game's full `gd_pgn` to its true final position (no move cap)
2. Reuse (Phase 1) - one batched exact-FEN lookup against `tpos_positions`/`teva_evaluations` for
   the whole run; if a game's final position is already tracked/evaluated (common for games ending
   within the first `MAX_ANALYSIS_MOVE` moves), its `eva_cp` is copied directly via one batched
   multi-row `UPDATE` — no Stockfish call
3. Fresh evaluate (Phase 2) - whatever wasn't reused is evaluated with Stockfish, normalized to
   white's perspective, spread across `GAME_ENDINGS_CONCURRENCY` concurrent engine instances on the
   native-binary path (real OS-process parallelism); single-instance on the WASM path (production),
   since `lite-single` has no worker-thread offload

### Output

`tgd_gamesdecon.gd_final_eval` — Stockfish evaluation (white perspective) of each game's actual
final position.

### Consumers

#### Analyze page

`ChessBoardView.tsx`'s "Games — `<move>`" panel's Final Eval column, via `getGamesForPosition`
([`chessdb.ts`](../src/lib/analysis/chessdb.ts)).

### Rules/gotchas

- Entirely independent of `tpos_positions`/`tgam_game_positions` as a pipeline dependency — reads
  and writes `tgd_gamesdecon` directly. Own cron step (`/api/analysis/evaluate-game-endings`), own
  `/owner/pipeline` panel (step 8).
- Every read here (the reuse lookup, the remaining-count check) must run with `skipCache: true` —
  see the pipeline-wide caching audit/fix (2026-07-19): `table_query` caches every read by default
  with no expiry, which is never correct for a live maintenance/backlog check.
- Endings-tab (aggregate win/loss-by-termination chart) display of this data is intentionally out
  of scope so far — planned as separate future work.

## Deepen Popular Positions {#deepen-popular-positions}

### Purpose

Give frequently-reached positions a deeper (more trustworthy) Stockfish evaluation than the default
batch depth, in proportion to how popular they actually are — a position reached hundreds of times
deserves better analysis than one reached just above the purge threshold.

### Input

[`tpos_positions`](#tpos_positions) joined to [`teva_evaluations`](#teva_evaluations) — positions
already evaluated whose `pos_reached` qualifies for a deeper `POPULAR_POSITION_DEPTH_TIERS` tier
than their current `eva_depth`.

### Processing

#### Summary

Tiered re-evaluation: the more a position has been reached, the deeper it gets re-analyzed, up to
three tiers.

#### Details

1. `POPULAR_POSITION_DEPTH_TIERS` (`src/lib/constants.ts`) — `pos_reached >= 50` → depth 30,
   `>= 30` → depth 24, `>= 10` → depth 22
2. Backlog query assigns each candidate row its own qualifying tier's `target_depth` via a `CASE`
   expression, filtering to only rows where `eva_depth < target_depth`
3. Each qualifying position is re-evaluated with Stockfish at *its own* `target_depth` — not one
   uniform depth for the whole batch, since different rows can qualify for different tiers
4. Merged via `upgradePositionEvaluation` — the same guarded upgrade (only if deeper) and
   `gam_cp_change` cascade used everywhere else this function is called (Analyze page's Game/
   Position Analysis)

### Output

`teva_evaluations` — `eva_cp`/`eva_best_move`/`eva_depth` upgraded for qualifying positions;
`tgam_game_positions.gam_cp_change` recomputed for rows touching an upgraded position (via
`upgradePositionEvaluation`'s existing cascade).

### Consumers

Every reader of `teva_evaluations` benefits automatically once a position is upgraded — Moves From
This Position, the Analyze page's Position Detail view, and the Habits eval column (joined live via
`hab_resulting_pos_id`).

### Rules/gotchas

- Reuses `upgradePositionEvaluation` rather than a new guarded-UPDATE — no new write logic, only new
  logic for *which* positions qualify and at what depth.
- The backlog-count query (`/owner/pipeline` panel, step 9) and the batch's own selection query
  share the same tier-derived SQL (`popularPositionTierSql()` in
  `enrichPositionsStockfish.ts`), so they can't drift out of sync with each other or with
  `POPULAR_POSITION_DEPTH_TIERS`.
- Own cron step (`/api/analysis/deepen-popular-positions`), own `/owner/pipeline` panel (step 9).
