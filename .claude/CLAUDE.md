# chess — project skill file

## Origin and purpose

This project consolidates and replaces two prior projects:
- **`nextjs-chess`** (`C:\Users\richa\claude\github\nextjs-chess`) — the original chess app: game sync, game browsing, single-game Stockfish analysis (`tsa_savedanalyses`, `tgev_game_evals`), player ratings, auth.
- **`next-chess-analysis`** (`C:\Users\richa\claude\github\next-chess-analysis`) — a pattern-analysis pipeline forked/scaffolded from `nextjs-chess`: position-tree building, reach-based habit detection, batch Stockfish evaluation, Habits/Quiz/Position Detail UI.

Since the fork, both projects have independently synced the *same* chess.com players' games into separately-evolved copies of `tgr_gamesraw`/`tgd_gamesdecon`, and their schemas/conventions have drifted apart. Rather than reconciling two live, diverged databases, this project does a **fresh sync from chess.com** and rebuilds cleanly — porting over the lessons below and (selectively, TBD) already-built analysis data from `next-chess-analysis`.

**Do not treat this as a from-scratch product.** Read both source projects' code before designing anything — most of what's needed already exists and works; the point of the rebuild is a clean, unified schema and function set, not new functionality.

## What's different between the two source projects (chess vs. analysis)

TBD — to be filled in collaboratively with the user, who knows both projects' current functional scope in detail. Do not assume; ask before designing.

## Critical lessons from the next-chess-analysis cleanup session — read before designing the schema

These were discovered the hard way over a long session. Rediscovering them will cost real time — read this list first.

1. **The chess.com sync "refresh" cutoff has a hidden dependency.** `nextjs-shared/chess/sync.ts`'s `getLatestGameEndTime()` reads `MAX(gr_end_time) FROM tgr_gamesraw` to know where incremental sync resumes. If this project doesn't keep raw game JSON/PGN indefinitely (likely, given `tgr_gamesraw` is otherwise unused after deconstruction), that cutoff logic needs to read from somewhere else *before* any truncation/archiving happens — e.g., a `latest_synced_end_time` column on a one-row-per-player table — or every sync will look like "no history" and re-fetch + re-insert the entire chess.com archive.

2. **Table naming conventions** (per the global CLAUDE.md, apply here too): `t` + 3-char identifier + `_` + name for project tables (`x` + 3-char for `nextjs-shared`-owned tables). The 3-char identifier must be unique across the *entire* schema — check before creating a table. Surrogate primary keys should follow `{prefix}_{prefix}id` (e.g. `gam_gamid`, `gd_gdid`) — `next-chess-analysis` had real drift here (`eva_id`→`eva_evaid`, `qui_id`→`qui_quiid` fixed late; `tpos_positions.pos_id` was left as an accepted, scale-driven exception, not fixed). Get this right from row one in the new schema — it's far more painful to fix after data accumulates.

3. **Position "reach" must count both directions.** If tracking "how often has this exact board position been reached," it can happen either as a tracked player's own deliberate move choice, or as the position immediately after any tracked move (the opponent's resulting position). A position can be one thing in one game and the other in a different game — the true reach count is the sum of both, not either alone. See `recomputePosReached()` in `next-chess-analysis/src/lib/analysis/buildPositionTree.ts` for a reference implementation.

4. **Any "before/resulting position" pair table has two independent references that need independent purge/archive handling.** If a row references both a "before" position and a "resulting" position (two different surrogate IDs), never delete/archive the row based on either reference alone — a row can have an out-of-scope resulting position while its before-position is still very much in scope (and vice versa). Rule: full-delete only when the *before* reference is out of scope; null out just the resulting reference otherwise, keep the row.

5. **Any reach-based (or similar "no repeating pattern") purge needs a grace period.** A position always starts at reach=1 the moment it's first created. A purge rule of "delete reach=1 positions" applied without a time floor would delete every newly-tried opening before it ever gets a second chance to repeat. Solution used: only purge if the position's one occurrence is 30+ days old (derived from the game's own end-time, no extra column needed). Whatever the new design's equivalent concept is, give it the same protection.

6. **Move-number ceiling, data-verified (re-verify with fresh data before trusting the exact number)**: in `next-chess-analysis`'s dataset, 0% of positions past move ~18 had ever been reached more than 3 times — repeat/habit value drops off sharply starting around move 14-16. Worth tracking positions only up to a data-justified ceiling (was 16 there) rather than an arbitrary high number — avoids generating large amounts of data that will only ever need purging later. Re-derive this from scratch in the new project once real data exists; don't just copy the number blindly.

7. **`pg_stat_user_tables.n_live_tup` is a stale estimate, not a live count.** It only updates when `ANALYZE`/autovacuum runs. A table can show 0 rows despite having real data if it's never been analyzed. Always check `last_analyze`/`last_autoanalyze` before trusting a row-count query, or just run `ANALYZE` first.

8. **A client-side Bash/psql timeout does not kill the server-side Postgres query.** If a long-running query appears to time out from a tool call, check `pg_stat_activity` (`WHERE state != 'idle'`) afterward and `pg_terminate_backend()` anything still running — otherwise it silently keeps consuming CPU/I/O and can badly slow down later, unrelated queries (this caused real confusion more than once).

9. **Per-move/per-occurrence breakdowns (e.g., "which move did I play from this position, how often, what was the win rate") typically have no cache — they're computed live from raw occurrence rows every time.** If any archiving/pruning strategy removes raw occurrence rows, this kind of breakdown silently loses historical detail for archived games, even though aggregate stats (like total reach) can survive fine if cached separately. Decide up front whether this is an acceptable tradeoff (breakdown only reflects non-archived/recent data) or whether a frozen aggregate needs designing in — don't leave this undecided until users notice the numbers changed.

10. **Postgres `IDENTITY` surrogate keys never reuse deleted IDs.** This makes dangling foreign-style references safe by construction — a stale reference can never accidentally start pointing at a different, unrelated row later. Useful to know when deciding whether a cleanup step is strictly necessary vs. just good hygiene.

## Global conventions

This project is a normal Next.js project under `C:\Users\richa\claude\github` — all conventions from `C:\Users\richa\.claude\CLAUDE.md` (global) apply as-is: plan-by-default workflow, all DB schema/data changes as SQL given in chat and run manually via pgAdmin4 (never executed by Claude, never scripted), `scripts/schema.sql` as the single source of truth, the full coding-convention set (function headers, comment format, `GENERATED BY DEFAULT AS IDENTITY`, etc.).

### Constants page (`/owner/constants`) must be updated whenever `constants.ts` changes

`src/app/owner/constants/page.tsx` is a **manually-curated mirror** of `src/lib/constants.ts` — it
is not auto-generated, so adding/removing/renaming a constant there does nothing to the Constants
page by itself. **Whenever a constant is added, removed, or renamed in `src/lib/constants.ts`, the
corresponding entry in `CONSTANTS_SECTIONS`  (or `envSections` for `.env` vars) in
`src/app/owner/constants/page.tsx` must be added/removed/updated in the same change** — import,
`ConstantSection` entry, description, and `consumers` list, following the existing pattern for
every other constant on that page. This applies automatically as part of any plan step that adds a
constant — it does not need to be called out as a separate plan step every time, the same way
`scripts/schema.sql` updates are an automatic part of any plan step that adds a table.

**Consumer-string format matters, not just for humans reading the page.** Each `consumers` entry
must follow one of two shapes, since the Constants page's "Functions" tabs reverse-index this exact
text to show, per function, which constants/env vars it uses:
- `"file.ts: functionName"` (or `"file.ts: functionName1, functionName2"` for more than one) — the
  standard case, a constant used inside a specific named function.
- `"file.ts (module scope)"` — when the constant is referenced at a file's top level / module
  scope, not inside any named function.

Never write a bare file path with neither a `: functionName` nor a `(module scope)` suffix — it
breaks the reverse-index parsing on the Functions tabs. (A real incident: four consumer entries
added in the cron-constants session — `DEFAULT_BATCH_SIZE`, `CRON_DEEPEN_POPULAR_BATCH_SIZE`,
`STOCKFISH_DEPTH`'s new route entries — were written as bare `'api/analysis/.../route.ts'` strings
with no function name, inconsistent with every other entry on the page.)

### sessionStorage keys — always prefix with `SESSION_STORAGE_PREFIX`

Every `sessionStorage` key in this project (filter drafts, pagination state, the back-navigation
stack, etc.) must be built from `SESSION_STORAGE_PREFIX` (`'rs7_chess_'`, in `src/lib/constants.ts`)
— e.g. `` `${SESSION_STORAGE_PREFIX}habits_filters` ``, `` `${SESSION_STORAGE_PREFIX}back_stack` ``.
Never write a raw, unprefixed string key directly. The prefix namespaces this project's keys against
any other app that might share the same browser origin (e.g. during local dev on `localhost`), and
keeps every key visually identifiable as this project's own when inspecting `sessionStorage` in
devtools.

### Deliberate exception: `purgeStaleReachOnePositions` runs a real, automated `DELETE`

`src/lib/analysis/purgePositions.ts`'s `purgeStaleReachOnePositions()`, wired into
`/api/analysis/cron/route.ts`, is a **user-approved, explicit exception** to the global rule
"never embed data-destructive operations in code or automation." It deletes
`tpos_positions`/`tgam_game_positions`/`teva_evaluations` rows for positions reached by
`MIN_REACH_TO_KEEP` games or fewer, once every occurrence is `PURGE_REACH_GRACE_DAYS` days old
(both constants in `src/lib/constants.ts`), running unattended on the existing daily analysis cron
schedule. This was a deliberate design decision (not an oversight) after evaluating three options —
auto-compute-report-only, this real-automation approach, and soft-delete/flag — the user chose real
automation, with safety rails: originally a per-run row cap (`PURGE_ROW_CAP`), removed permanently
(2026-07-15, user decision) after the redesign below made per-candidate correctness independent of
batch size — a bug at 50,000 rows and a bug at the full eligible set require the same
rebuild-from-scratch recovery either way, so the cap wasn't actually limiting risk, only the pace of
clearing the backlog. Every step is still logged via `write_logging`/`logStart`/`logEnd` same as the
rest of the pipeline. **Do not "fix" this
by reverting to a report-only/manual-SQL pattern without asking first** — it's intentional, not a
violation to clean up. See `C:\Users\richa\.claude\plans\2-build-position-tree-swift-ritchie.md` for
the full design history, including a live-observed bug (deleting the purge's own resurrection-guard
marker without a replacement caused 3,136 already-purged games to be silently reprocessed and their
purged positions regenerated) that's why `tgd_gamesdecon.gd_positions_purged` exists and must
never be removed without also removing/redesigning the guard it provides. **Dangling-reference
handling (redesigned 2026-07-15)**: candidates are the reach/age-eligible set only (no
cross-candidate refinement) — a `tgam_game_positions` row is full-deleted if its own before-position
is a candidate, or has just its resulting-position reference nulled out (row kept) if only that side
is a candidate, following the standard before/resulting-pair rule (see the Purge section of
`docs/Dataflow.md`). An earlier version tried to protect candidate positions from deletion via an
iterative fixpoint refinement instead of nulling the reference — same end result (no dangling
references), far more complex and, once the both-ply backfill roughly doubled edge density, too slow
to run at all (multi-minute stalls even with adequate indexing). Replaced rather than optimized
further, since the null-out rule was already the documented design intent for this exact
two-reference-pair problem shape.

## Open decisions — to be made with the user, not assumed

- Exact function/database choices: which existing functions from `nextjs-shared`, `nextjs-chess`, and `next-chess-analysis` get ported as-is, rewritten, or dropped entirely.
- Whether this project fully replaces both source projects, or has a narrower scope (e.g., analysis-only, with `nextjs-chess` continuing to exist for non-analysis features).
- Archive/purge strategy specifics for this project (frozen aggregates vs. accepted historical-detail-loss tradeoffs — see lesson 9).
- Whether/how to migrate `next-chess-analysis`'s already-built analysis data (`tpos_positions`/`teva_evaluations` — expensive Stockfish work) versus starting that fresh too. If migrating, game IDs need remapping from old to new via the stable natural key (player username + chess.com UUID), since a fresh sync assigns new surrogate IDs.

**Do not make any of the above decisions unilaterally. Ask the user first — this project's whole premise is deliberate, collaborative design, not a default carried over from either source project.**

## Outstanding items

- **Store the player avatar image on the app, not just its chess.com URL** (identified 2026-07-14;
  partially done 2026-08-28 — `PLAN_master-avatars-grade-filter`) — the 2 tracked players and the
  4 top master cards now have their avatar downloaded once into `public/avatars/` and resolved from
  constants at render time (no chess.com CDN request): `PLAYER_AVATARS` (`pl_player` → filename) for
  the tracked-player cards in `AppShell`, `MASTER_AVATARS` (`mst_chesscom_handle` → filename) for the
  master cards in `AppNav`, both sharing `AVATAR_DIR`. `tpl_players.pl_avatar` is kept only as a
  fallback for a future tracked player not in `PLAYER_AVATARS`; `tmst_master_players` has no avatar
  column. **Still open:** no add-time hook does this automatically (the 6 files were downloaded
  manually during that plan), no coverage for the other ~145 master rows, and no refresh mechanism.
  A future add-player flow should download the image at add-time rather than storing the URL. See the
  `tpl_players` section of [docs/Dataflow.md](../docs/Dataflow.md), Rules/gotchas, for the full
  write-up.

- **Preset/known-player selection for the "Chess.com Games" panel's Player 1/2 filters**
  (identified 2026-08-19, not to be done now) — the panel's `p1`/`p2` filters (see
  `docs/plans/PLAN_display-fen-analysis-panel.md` / its archived copy) are plain free-text
  inputs. Idea for later: let the user pick from a curated list of well-known players (e.g. Magnus Carlsen,
  Alireza Firouzja) instead of typing a name, to more easily search for games between specific
  strong players from the current position/opening. Not designed further — would need the actual
  player-name list confirmed with the user (per the "never hardcode a list without confirmation"
  rule) and a decision on dropdown vs. free-text-with-
  autocomplete.

- **Extract `ChessBoardView_shared.tsx`/`MasterGameView_master.tsx`'s remaining inline panels into
  separate shared components** (identified 2026-08-26, updated 2026-08-26 after
  `PLAN_master-game-view-parity`, not to be done now) — `ChessBoardView_shared.tsx` still has six
  panels built as inline JSX rather than separate components: Stockfish, Moves Played, Games
  Played, Master Moves (Lichess), Master Games (Lichess), and Chess.com Games. Per the user's
  stated general rule: a panel showing data independent of the other panels on a route should be
  its own component, both for readability (splits a large file into legible chunks) and
  reusability (lets the same panel be dropped onto another route). All six of these now also exist
  on `MasterGameView_master.tsx`/`/analyzemaster` (full feature parity achieved by
  `PLAN_master-game-view-parity`) — but as their own **separately duplicated inline JSX**, not a
  shared component reused by both views, so the original "split into components" motivation is now
  stronger, not resolved: any future tweak to one of these six panels has to be made in both files
  by hand. Note some of these panels (Stockfish in particular) are currently tightly coupled to a
  dozen-plus pieces of each file's own local state/handlers (`deepAnalysisDepth`, `deepAnalyzing`,
  `saveAnalysisMessage`, `handleSelectPvLine`, `getCurrentPositionFen()`, `fenCopied`, etc.), so
  extraction will need a real prop surface designed per panel, not just a mechanical JSX cut —
  mirrors the `GameAnalysisPanel_shared` extraction (see
  `docs/archive/PLAN_master-games-fen-eval-reuse.md`) as the precedent for how to do this. Moves
  Played/Games Played specifically are no longer inherently player-scoped — `chessdb_master.ts`
  (added by `PLAN_master-game-view-parity`) provides a master-scoped mirror
  (`getMoveSummaryForPosition_master`/`fetchGamesForPosition_master`/
  `getGamesForPositionCount_master`, via `tmpos_positions`/`tmgam_game_positions`/
  `tmgd_gamesdecon`), so an eventual shared panel component would take its data-fetching functions
  as props (or a `variant` switch) rather than being genuinely unbuildable for master, as this item
  previously said.

- **Master box: small "top masters" mini-panel** (identified 2026-08-27, not to be done now) —
  once the Player box shows the tracked-player cards (see `PLAN_master-game-view-parity`'s nav
  restructure), the user suggested the Master box could eventually show something analogous: a
  small panel with a picture and grade for the top 3 (or so) synced masters. Not designed further
  — would need a data source (likely top-N `tmst_master_players` by `mst_grade`), a decision on
  which masters qualify as "top" (highest grade? most games synced?), and layout/sizing to match
  the Master box's own height.
