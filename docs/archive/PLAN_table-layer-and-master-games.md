# PLAN_table-layer-and-master-games — chess

## Title
Table return-value migration, table_query logging fix, master games position database (POC), and
converting it (plus the FIDE masters pipeline) to proper pipeline pages

## Plan

Three pieces of work, tracked together since they'll be committed together.

### 1. Update table_ return values

nextjs-shared 2.1.81 changed every `table_*`/`fetch*` function to return `TableResult<T>`
(`{ ok, data, error }`) instead of the raw value, never throwing. Approach agreed: unwrap at the
direct call site, preserving each function's existing return type/contract so no downstream
caller (other action functions, UI components) needs to change. On `!result.ok`, log via
`write_logging` (severity `'E'`, message `'<consequence>: ' + result.error`) and return the same
safe default the function implicitly returned before (`[]` for a list, `0` for a count, `null` for
a single row/lookup). Fire-and-forget writes (`table_write`/`table_update`/`table_delete` calls
whose result was never consumed before) are left as-is — out of scope, since they don't fail to
compile and adding new failure handling there is a behavior change beyond this migration.

- [x] src/lib/actions/masterPlayers.ts
- [x] src/lib/actions/games.ts
- [x] src/lib/actions/players.ts
- [x] src/lib/actions/deconstruct.ts
- [x] src/lib/actions/fidePipelineStatus.ts
- [x] src/lib/actions/pipelineLog.ts
- [x] src/lib/actions/pipelineStatus.ts
- [x] src/lib/actions/sync.ts
- [x] src/lib/analysis/chessdb.ts
- [x] src/lib/analysis/buildHabits.ts
- [x] src/lib/analysis/buildPositionTree.ts
- [x] src/lib/analysis/enrichPositionsStockfish.ts
- [x] src/lib/analysis/purgePositions.ts
- [x] src/lib/fide/fidePipeline.ts
- [x] src/lib/fide/fideStaging.ts
- [x] src/app/api/analysis/diag/route.ts
- [x] src/ui/analysis/PipelineLogTable.tsx
- [x] src/ui/AppShell.tsx (no edit needed — fixed transitively by players.ts)
- [x] src/ui/charts/OpeningScoreChart.tsx (no edit needed — fixed transitively by games.ts)
- [x] src/ui/charts/RatingChart.tsx (no edit needed — fixed transitively by games.ts)
- [x] src/ui/games/GameList.tsx (no edit needed — fixed transitively by games.ts)
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm the full migration compiles clean

### 2. Populate table_query's table param

`table_query`'s `table` param drives both `cache_clearTable`'s invalidation and the `Table:`
column shown in the xlg_logging viewer (confirmed via log entry #149 — `getMoveSummaryForPosition`'s
`cache_set`/`cache_get` entries have an empty `Table:` column). `table_query`'s own docs mark
`table` optional for genuine multi-table joins with no single canonical table, but in practice this
project always has one obvious "main"/driving table per join (the one the rest of the query hangs
off), so every call site below gets that table populated — no query logic changes, just adding the
missing `table:` line to each options object. Fixed a bug in chess's own logging visibility, not in
`nextjs-shared`.

- [x] `src/lib/analysis/chessdb.ts:92` `getMovesForPosition` → `table: 'tgam_game_positions'`
- [x] `src/lib/analysis/chessdb.ts:144` `getMovePlayCounts` → `table: 'tpos_positions'`
- [x] `src/lib/analysis/chessdb.ts:186` `getMoveSummaryForPosition` → `table: 'tpos_positions'`
- [x] `src/lib/analysis/chessdb.ts:799` `getHabitsData` → `table: 'thab_habits'`
- [x] `src/lib/analysis/chessdb.ts:880` `getHabitsCount` → `table: 'thab_habits'`
- [x] `src/lib/analysis/chessdb.ts:990` `getPositionDetail` (moves query) → `table: 'tgam_game_positions'`
- [x] `src/lib/analysis/chessdb.ts:1018` `getPositionDetail` (game count query) → `table: 'tgam_game_positions'`
- [x] `src/lib/analysis/chessdb.ts:1030` `getPositionDetail` (games query) → `table: 'tgam_game_positions'`
- [x] `src/lib/analysis/buildPositionTree.ts:383` `buildPositionTree_snap` → `table: 'tgam_game_positions'`
- [x] `src/lib/analysis/enrichPositionsStockfish.ts:484` `countRemainingPopularPositions` → `table: 'tpos_positions'`
- [x] `src/lib/analysis/enrichPositionsStockfish.ts:527` `countRemainingPopularPositionsByTier` → `table: 'tpos_positions'`
- [x] `src/lib/fide/fideStaging.ts:178` `parseFideXml_count` → `table: 'tfxm_fide_xml'`
- [x] `src/lib/actions/fidePipelineStatus.ts:11` `refreshFideZipStatus` → `table: 'tfzp_fide_zip'`
- [x] `src/lib/actions/fidePipelineStatus.ts:32` `refreshFideXmlStatus` → `table: 'tfxm_fide_xml'`
- [x] `src/lib/actions/fidePipelineStatus.ts:54` `refreshFideParsedStatus` → `table: 'tfpl_fide_players'`
- [x] `src/lib/actions/fidePipelineStatus.ts:77` `refreshFideTaggedCount` → `table: 'tmst_master_players'`
- [x] `src/lib/actions/pipelineStatus.ts:29` `getPipelineStatus` → `table: 'tgr_gamesraw'`
- [x] `src/lib/actions/pipelineStatus.ts:90` `refreshStep1` → `table: 'tgr_gamesraw'`
- [x] `src/lib/actions/pipelineStatus.ts:117` `refreshStep3` → `table: 'tgd_gamesdecon'`
- [x] `src/lib/actions/pipelineStatus.ts:145` `refreshTposStatus` → `table: 'tpos_positions'`
- [x] `src/lib/actions/pipelineStatus.ts:166` `refreshStep4` → `table: 'tpose_positions_eval'`
- [x] `src/lib/actions/pipelineStatus.ts:192` `refreshCpChangeStatus` → `table: 'tgam_game_positions'`
- [x] `src/lib/actions/pipelineStatus.ts:233` `refreshHabitsStatus` → `table: 'tgam_game_positions'`
- [x] `src/lib/actions/pipelineStatus.ts:278` `refreshGameEndingsStatus` → `table: 'tgd_gamesdecon'`
- [x] `src/lib/actions/pipelineStatus.ts:312` `refreshPurgeStatus_find` → `table: 'tpos_positions'`
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything still compiles clean

### 3. Master games position database (proof of concept — Magnus Carlsen, 2026)

Builds a pre-computed position index for master players' own chess.com games, mirroring the
existing raw→deconstruct→position-tree pipeline used for tracked players, but stored in a new
**second physical database** (`local_chess_masters` locally, `POSTGRES_URL1`) via nextjs-shared's
multi-database routing (`xrtg_routing`). This replaces the old idea of live-scanning a master
player's entire chess.com history per FEN lookup (far too slow) with an indexed local query.
Scoped as a proof of concept: **Magnus Carlsen only, 2026 games only**, to prove the pipeline works
end-to-end before expanding to the other 148 tracked master players.

**Verified against real chess.com data before writing this plan:** chess.com's `time_class` field
is only ever `bullet`/`blitz`/`rapid`/`daily` — no `classical` value exists — and Magnus's recent
archives include `chess960` variant games alongside standard `chess`, which must be filtered out
(`rules === 'chess'`) exactly like the existing player-sync pipeline already does.

**Agreed constants** (`src/lib/constants.ts`, new "Master Games" section — never reused from the
player-pipeline's own constants, per explicit instruction that master-domain naming must stay
visibly distinct):
- `MASTER_INCLUDED_TIME_CLASSES = ['blitz', 'rapid']` (bullet excluded; `'daily'` not included —
  confirmed by the user)
- `MASTER_MIN_ANALYSIS_MOVE = 4` (same starting value as `MIN_ANALYSIS_MOVE`, own constant)
- `MASTER_MAX_ANALYSIS_MOVE = 16` (same starting value as `MAX_ANALYSIS_MOVE`, own constant)
- `MASTER_POSITION_INSERT_CHUNK_SIZE = 500` (same starting value as `POSITION_INSERT_CHUNK_SIZE`,
  own constant)

**New tables** (all in the **secondary** database — `local_chess_masters` — none in primary), keyed
by the lowercased chess.com username string (`mgr_player`/`mgd_player`), never by `mst_mstid`, so no
query ever needs to join back to `tmst_master_players` in the primary database:

| Table | Mirrors | Notes |
|---|---|---|
| `tmgr_mastergamesraw` | `tgr_gamesraw` | Per-run staging: raw PGN/JSON from chess.com |
| `tmgd_mastergamesdecon` | `tgd_gamesdecon` | One row per game — no `gd_positions_purged`/`gd_final_eval` equivalents (no purge, no eval feature for this POC) |
| `tmps_masterpositions` | `tpos_positions` | FEN → reach count |
| `tmgp_mastergamepositions` | `tgam_game_positions` | Per-game (position, move-played) rows — no `gam_cp_change` equivalent |

`tmps_masterpositions`/`tmgp_mastergamepositions` both live in the secondary DB, so
`getMasterMovesForPosition` can join them in one SQL statement exactly like the existing
`getMovesForPosition` does — the no-cross-database-join constraint only bites when a query would
need to reach into the primary database at the same time (e.g. resolving `mst_mstid` → player name),
which this design avoids entirely by keying everything off the username string instead.

No `tpur_workfile`/purge equivalent (a position reached only once by a master player is exactly the
interesting signal here, not noise to discard) and no `mst_last_synced_end_time` sync-cursor column
yet (deferred — the POC always does a fresh one-year pull, not an incremental resume; needed once
this expands beyond a single bounded year).

- [x] Add the 4 new constants to `src/lib/constants.ts` ("Master Games" section) and mirror them
      into `src/app/owner/constants/page.tsx` per project convention
- [x] Add the 4 new table definitions to `scripts/schema.sql` (source of truth for structure, even
      though these tables physically live in the secondary database)
- [x] Give the user, in chat, the exact `CREATE TABLE` SQL for the 4 tables (to run against
      `local_chess_masters`) and the `INSERT INTO xrtg_routing` rows (to run against `local_chess`,
      the primary DB, since routing control always lives there) — never run by Claude
- [x] Build `src/lib/master/masterSync.ts` — `syncMasterGames(chesscomHandle, year)`: fetches that
      player's chess.com archives for the given year only, filters `rules === 'chess'` and
      `MASTER_INCLUDED_TIME_CLASSES.includes(time_class)`, inserts into `tmgr_mastergamesraw`
- [x] Build `src/lib/master/masterDeconstruct.ts` — `deconstructMasterGames(chesscomHandle)`: mirrors
      `deconstructGames`, reads `tmgr_mastergamesraw`, writes `tmgd_mastergamesdecon`; reuses the
      existing shared `tec_ecoreference` table in the primary database unchanged (a second,
      independent `table_write` call, not a join)
- [x] Build `src/lib/master/masterPositionTree.ts` — `buildMasterPositionTree(chesscomHandle)`:
      mirrors `buildPositionTree`, replays each deconstructed game's PGN and populates
      `tmps_masterpositions`/`tmgp_mastergamepositions` for plies within
      `MASTER_MIN_ANALYSIS_MOVE`..`MASTER_MAX_ANALYSIS_MOVE`
- [x] Build `src/lib/master/masterChessdb.ts` — `getMasterMovesForPosition(fen)`: single-query join
      (within the secondary database) returning every move played from that FEN across synced
      master games, with counts — mirrors `getMovesForPosition`'s shape
- [x] Add a minimal POC trigger page `src/app/owner/mastergames/page.tsx`: a button that runs
      sync → deconstruct → build-tree in sequence for the hardcoded POC target
      (`chesscomHandle = 'magnuscarlsen'`, `year = 2026`) and shows the resulting row counts, plus a
      FEN input that calls `getMasterMovesForPosition` and displays the result — proves the pipeline
      end-to-end without building any permanent UI yet
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 4. Convert master games POC (and the FIDE masters pipeline) to proper pipeline pages

The POC's single "run everything, log to a flat list" button made a real bug hard to notice (see
below) — no per-step status/error visibility. Converting to the same
`logPipelineStep`/run-id/status-table structure `/owner/pipelinemasters` already uses fixes that.

**Bug found and fixed while testing the POC, before this conversion started:** `buildMasterPositionTree`'s
"ensure positions" INSERT (`SELECT DISTINCT fen, split_part(fen, ' ', 2), NULL, 0 FROM (...)`) failed
with `column "mps_move_num" is of type integer but expression is of type text` — the bare `NULL`
literal didn't pick up its target column's type through the wrapping subquery. First real POC run
produced 739 games / 19121 game-positions but **0** positions, silently returning early on the
caught error. Fixed by casting explicitly (`NULL::integer`).

**Agreed constants:**
- `PIPELINE_TYPE_MASTERGAMES = 'mastergames'` — own pipeline type, not reusing
  `PIPELINE_TYPE_MASTERS`, so its Run # history stays separate
- Both the new master-games pipeline and the existing FIDE masters pipeline number their own steps
  starting from **1** (not offset blocks like the old 10-14) — `pip_pipeline_type` already scopes
  Run # history separately per pipeline, so the offset was never structurally necessary

- [x] Renumber the FIDE masters pipeline: `fideStaging.ts`/`fidePipeline.ts`'s `logPipelineStep`
      calls and header comments (10→1, 11→2, 12→3, 13→4, 14→5), `pipelinemasters/page.tsx`'s
      `STEPS` array and `MyHelpStep`/`td` display strings, and `/owner/constants`'s
      `FUNCTION_DESCRIPTIONS` "(pipeline step N)" mentions
- [x] Add `PIPELINE_TYPE_MASTERGAMES` to `constants.ts`, mirror into `/owner/constants`, and add it
      to `pipelineLog.ts`'s local `PipelineType` union (was hardcoded to just games/masters)
- [x] Add `src/lib/master/masterGamesPipelineStatus.ts` — `refreshMasterSyncStatus`/
      `refreshMasterDeconStatus`/`refreshMasterTreeStatus`, mirroring `fidePipelineStatus.ts`'s
      per-step count queries against the 4 master tables
- [x] Rewrite `masterSync.ts`/`masterDeconstruct.ts`/`masterPositionTree.ts` to accept
      `level`/`forceNewRun`, wrap with `logStart`/`logEnd`, and call `logPipelineStep` (step 1/2/3)
      at the end — they previously didn't log to the pipeline at all
- [x] Add API routes `/api/mastergames/sync`, `/api/mastergames/deconstruct`,
      `/api/mastergames/build-tree` — mirror `/api/fide/*`'s thin wrapper pattern
- [x] Add `src/app/owner/pipelinemastergames/page.tsx` — same `STEPS`/Jobs-summary/Run-All
      structure as `pipelinemasters/page.tsx`, scoped to the POC target
      (`magnuscarlsen`/`2026`, page-local constants, not project constants — POC scaffolding)
- [x] Simplify `src/app/owner/mastergames/page.tsx` down to just the FEN-lookup panel (the
      sync/deconstruct/build-tree buttons are superseded by the new pipeline page)
- [x] Update the Owner Tools list: split the old single "Master Games (POC)" entry into
      "Pipeline (Master Games POC)" (new pipeline page) and "Master Games — FEN Lookup" (existing
      route, now lookup-only)
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 5. Masters Games — its own browsable list, own route

Mirrors the existing player `GameList`, but for synced master games. Deliberately its own top-level
route (`/mastergames`, added to `AppNav.tsx`'s `SECTIONS`) rather than a home-page tab, so it can't
be confused with the existing tracked-player Games list.

**Agreed design:**
- Local filter state only (opponent/date/color/time-class/result/termination/opening/ECO) — **not**
  wired into the shared global `?dateFrom=`/`?opening=`/`?eco=` filters Games/Graph/Openings/
  Endings/Habits share, since master games are a separate dataset with their own date range/opening
  mix, not the tracked player's
- No player-select filter yet (only Magnus Carlsen synced so far — add back once more master
  players are synced)
- Rows are not clickable, no "Analyze" button — no master-game analyze page exists yet
- New `MASTER_GAME_LIST_ROWS_DEFAULT`/`MASTER_GAME_LIST_ROWS_OPTIONS` constants (own values, never
  reusing `GAME_LIST_ROWS_DEFAULT`/`GAME_LIST_ROWS_OPTIONS`) — layout width constants
  (`WIDTH_OPPONENT`, `WIDTH_OPENING`, etc.) are reused as-is, since those are generic styling
  tokens, not a master/player business-logic distinction

- [x] Add `MASTER_GAME_LIST_ROWS_DEFAULT`/`MASTER_GAME_LIST_ROWS_OPTIONS` to `constants.ts`, mirror
      into `/owner/constants`
- [x] Add `fetchFilteredMasterGames`/`getMasterGamesPageCount`/`MasterGameFilters` to a new
      `src/lib/master/masterGamesList.ts`, mirroring `games.ts`'s "Filtered + Paginated" section
      against `tmgd_mastergamesdecon`
- [x] Add `src/ui/games/MasterGameList.tsx`, mirroring `GameList.tsx` minus the player-select
      filter and the row click-through/Analyze button
- [x] Add `src/app/mastergames/page.tsx` (top-level route, `'use client'` + `Suspense`, mirrors
      `habits/page.tsx`'s wrapper shape) rendering `MasterGameList`
- [x] Add "Masters Games" → `/mastergames` to `AppNav.tsx`'s `SECTIONS` and its `activeKey` check
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 6. Click-to-view a master game — its own route, not /analyze

`ChessBoardView.tsx` (1646 lines) was audited before deciding this — `/analyze`'s write-back paths
(`saveGameEvaluations`, `upgradePositionEvaluation`) write into the primary database's shared,
FEN-keyed `tpos_positions`/`tgev_game_evals`, and its "Moves From This Position"/"Games Played"
panels are scoped to the tracked player. Reusing it for a master game risks `gdid`/`mgdid` numeric
collision (separate auto-increment sequences in separate databases) and would let analyzing a
master game corrupt the tracked player's own position-tree reach counts. A `readOnly` mode flag
would need to guard ~6 scattered call sites in an already-huge file — real risk of missing one.
Decided: a new, deliberately small component that never imports the write-back functions at all,
so it's structurally incapable of touching the tracked player's data, not just "disabled by a flag."

**Confirmed feasible before building:** `buildTree(history, fens, plyEvals)` accepts an empty
`plyEvals` array fine, and `MoveTree.tsx` has zero DB imports and renders correctly with no
evaluation data — so a plain move-list view needs no Stockfish involvement at all.

- [x] Add `getMasterGameById(mgdid)` to `masterGamesList.ts`, mirroring `games.ts`'s `getGameById`
- [x] Add `src/ui/board/MasterGameView.tsx` — board (`react-chessboard`) + `MoveTree` (built once via
      `buildTree(history, fens, [])`, no evals) + prev/next navigation, a header (white/black
      usernames/ratings, date, time class, result, termination, opening/ECO), and the Lichess
      Masters Explorer panel (`getMastersExplorer` — external API, no DB dependency). Never imports
      `saveGameEvaluations`/`upgradePositionEvaluation`/`getMovePlayCounts`/`fetchGamesForPosition`
- [x] Add `src/app/analyzemaster/page.tsx` (`?game=<mgdid>`, mirrors `/analyze/page.tsx`'s
      `'use client'`/`Suspense` shape), back nav pointing to `/mastergames`
- [x] Make `MasterGameList.tsx` rows clickable, navigating to `/analyzemaster?game=${mgd_mgdid}`
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

**Revised after review:** user asked why any saved evaluations were needed at all, since
`StockfishEngine.analyzeGame` is pure client-side computation independent of any DB — confirmed
(only the *saving*, `saveGameEvaluations`/`upgradePositionEvaluation`, was DB-bound). Dropped the
planned new `tmge_mastergameevals` table entirely; added a live "Game Analysis" panel instead
(`StockfishEngine`, `DepthInput` reused as-is, blunder/mistake/inaccuracy summary via
`plyEvals`/`MoveTree`'s existing `node.evaluation` rendering) with **zero persistence** — every
visit recomputes fresh, results live only in component state. Also kept the Lichess Masters
Explorer panel (reversing an earlier "drop it" suggestion — user said it's fine as-is).

- [x] Add live Stockfish analysis to `MasterGameView.tsx`: `StockfishEngine`/`DepthInput` reused
      as-is, `runAnalysis()` mirrors `ChessBoardView`'s but with no DB cache passed in and no save
      call afterward — annotations flow into `tree.mainLine[i].evaluation` for `MoveTree` to render,
      blunder/mistake/inaccuracy summary computed from local `plyEvals` state only
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

**Also found while reviewing task 6's list layout:** `AppShell.tsx`'s `PlayerHeader` (the tracked-
player selector cards — `stricade`/`astarrboy`) renders on every page except `/owner/*`, but had no
special case for the two new master-games pages — so it was showing tracked-player cards on
`/mastergames`/`/analyzemaster`, which don't apply to master data at all.

- [x] Update `AppShell.tsx`: on `/mastergames` and `/analyzemaster`, render `AppNav` directly
      (keeps the Games/Habits/Graph/Openings/Endings/Masters Games tab bar) but skip `PlayerHeader`
      entirely (no tracked-player cards) — a third case alongside the existing "everywhere" and
      "`/owner/*`" cases. `AppNav` uses `useSearchParams()`, which needs its own `Suspense`
      boundary — previously always satisfied via `PlayerHeader`'s own wrapper; the new direct
      render needed the same `<Suspense fallback={null}>` or the build failed
      (`missing-suspense-with-csr-bailout`) prerendering both new routes.
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 7. Pipeline (Master Games POC) — dropdowns for master player + year

The pipeline page had `magnuscarlsen`/`2026` hardcoded as local page constants. Replaced with two
selectors so any of the 149 known master players and any of the last 7 years can be picked.

**Agreed:**
- Year range: **2020–2026** (own constant `MASTER_GAMES_SYNC_YEARS`, most recent first)
- The master-player dropdown is a **reusable component** (`MasterPlayerSelect.tsx`,
  `src/ui/filters/`), not inlined in the pipeline page — self-fetches its own options from
  `getMasterPlayers('', true)` (sorted by grade, only rows with a chess.com handle), value = the
  handle. Includes a blank "Select a master..." placeholder so the page doesn't silently default
  to whichever master happens to sort first.

- [x] Add `MASTER_GAMES_SYNC_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]` to `constants.ts`,
      mirror into `/owner/constants`
- [x] Add `src/ui/filters/MasterPlayerSelect.tsx` — reusable master-player picker, mirrors the
      existing `*Select` component pattern (`ColorSelect`/`ResultSelect`), built on `FilterSelect`
- [x] Update `pipelinemastergames/page.tsx`: replace `POC_CHESSCOM_HANDLE`/`POC_YEAR` constants
      with `selectedHandle`/`selectedYear` state driving `MasterPlayerSelect` + a `FilterSelect`
      Year dropdown (`MASTER_GAMES_SYNC_YEARS`); all 3 step handlers and Run/Run All buttons now
      use the selected values and are disabled until a master is chosen
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 8. Masters Games list — Player filter (allow "All")

`MasterGameList.tsx` had no way to narrow the list down to one synced master player once more than
one gets synced — needed a filter, defaulting to "All".

- [x] Add `getSyncedMasterPlayers(): Promise<string[]>` to `masterGamesList.ts` — distinct
      `mgd_player` values actually present in `tmgd_mastergamesdecon` (server-side, `skipCache: true`)
- [x] Add `player?: string` to `MasterGameFilters`, and the matching push in
      `buildMasterGameFilters` (`mgd_player = <lowercased value>`)
- [x] Add `src/ui/filters/FilterMasterPlayerSelect.tsx` — self-fetches `getSyncedMasterPlayers()`,
      "All" option first, built on the existing `FilterSelect`/`MySelect` primitive (distinct from
      `MasterPlayerSelect.tsx`, which lists every known master regardless of sync state)
- [x] Wire `FilterMasterPlayerSelect` into `MasterGameList.tsx`'s Player filter cell
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 9. Show master players' real names, not just their chess.com handle

Every place a master player was displayed showed their raw chess.com handle
(`mgd_player`/`mgd_white_username`/`mgd_black_username`) instead of their real name, even though
the name is already known (`tmst_master_players.mst_first_name`/`mst_last_name`, primary database).
Handle was shown in: `MasterGameList.tsx`'s Player column, `FilterMasterPlayerSelect`'s option
labels, and `MasterGameView.tsx`'s player-side header (whichever side is the tracked master).

**Agreed approach** (cross-database merge required — `tmgd_mastergamesdecon` lives in the secondary
DB, `tmst_master_players` in the primary DB, so this can never be a SQL join): fetch master names
via the existing `getMasterPlayers('')` (primary DB) and merge onto the secondary-DB rows in app
code, keyed by `mst_chesscom_handle` ↔ `mgd_player` (case-insensitive). Opponent side stays as
username — no name available for an arbitrary opponent. New derived/merged field (not itself a DB
column): `mgd_player_name` (DD root `mgd_player` + `_name` suffix).

- [x] Add `getMasterHandleNameMap()` to `masterPlayers.ts` — handle (lowercased) → display name,
      built from `getMasterPlayers('')`
- [x] `masterGamesList.ts`: `getSyncedMasterPlayers()` now returns `{ handle, name }[]`;
      `getMasterGameById`/`fetchFilteredMasterGames` attach `mgd_player_name` to each row
- [x] `FilterMasterPlayerSelect.tsx`: option label is the real name, value stays the handle
- [x] `MasterGameList.tsx`: Player column shows `mgd_player_name`
- [x] `MasterGameView.tsx`: bottom-player header (always the tracked master) shows
      `mgd_player_name` instead of a color-based username lookup; opponent side unchanged
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 10. MasterGameList — Analyze button + show name alongside handle

Two corrections after testing task 9: (1) `MasterGameList.tsx` was missing the "Analyze" button
`GameList.tsx` has in its last column (row click alone isn't the full parity target); (2) task 9
replaced the handle with the real name instead of showing both together.

**Agreed:**
- `MasterGameList.tsx`'s last `<td>` gets a `MyButton` ("Analyze", `e.stopPropagation()`, same
  `/analyzemaster?game=...` navigation as the row click) — mirrors `GameList.tsx`'s button exactly
  (same classes/label).
- Display format `Name (handle)` in `MasterGameList.tsx`'s Player column and
  `MasterGameView.tsx`'s bottom-player header.
- `FilterMasterPlayerSelect`'s dropdown stays **name-only** (not `Name (handle)`) — it's a picker,
  not a data display, and the handle isn't needed to choose a player.

- [x] Add an "Analyze" `MyButton` to `MasterGameList.tsx`'s last column, mirroring `GameList.tsx`
- [x] `MasterGameList.tsx` Player column: `{row.mgd_player_name} ({row.mgd_player})`
- [x] `MasterGameView.tsx` bottom-player header: `{row.mgd_player_name} ({row.mgd_player})`
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

### 11. Owner page — Routing Maintenance tab

Documented pattern from `nextjs-shared/CONSUMING_PROJECTS.md`'s "Multi-Database Routing" section:
any project using multi-database routing (this project already does — `xrtg_routing`, POSTGRES_URL1
for the master-games tables) should add `OwnerRoutingMaintenance` as a tab on its own `/owner` page,
the same way `OwnerTableLogging`/`OwnerTableCache` are already added. Gives write/edit-in-place/
delete on `xrtg_routing` rows with no manual SQL needed for day-to-day changes.

- [x] `src/app/owner/page.tsx`: import `OwnerRoutingMaintenance` from `nextjs-shared/OwnerRoutingMaintenance`
      and add `{ label: 'Routing Maintenance', content: <OwnerRoutingMaintenance /> }` to the `tabs` array
- [x] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

## Changes

### src/lib/actions/masterPlayers.ts
- `getMasterPlayerNames`, `getMasterPlayers`, `findNextMasterPlayerHandle`: unwrap `table_fetch`'s
  `TableResult`, log via `write_logging` (severity `E`) and return `[]`/`null` on failure.

### src/lib/actions/games.ts
- `getGameCount`, `getRecentGames`, `getGameById`, `getLatestGameEndTime`, `insertRawGame`,
  `getGameEvals` (both `table_fetch` calls), `getDeconGames`, `getDeconGameCount`,
  `fetchFilteredGames`, `getGamesPageCount`, `getOpeningScores`, `getTerminationStats`,
  `backfillOpeningMoves` (both the `table_fetch` and the `table_query` count), `getEarliestGameDate`,
  `getPlayerRatingOverTime`: unwrap `TableResult`, log via `write_logging` on failure, preserve each
  function's existing return type (`[]`/`0`/`null` on failure).

### src/lib/actions/players.ts
- `getPlayer`, `getPlayerRatings`, `updatePlayerRating` (per-time-class `table_query`),
  `getPlayerLastSyncedEndTime`, `getPlayers`: unwrap `TableResult`, log via `write_logging` on
  failure, preserve existing return types.

### src/lib/actions/deconstruct.ts
- `getUndeconstructedCount`, `getDeconstructedCount`, `deconstructGames` (raw games `table_query`,
  now also closing out `logEnd` on failure), `upsertEcoReference` (`table_fetch` existence check):
  unwrap `TableResult`, log via `write_logging` on failure.

### src/lib/actions/fidePipelineStatus.ts
- All four `refreshFide*Status`/`refreshFideTaggedCount` functions: unwrap `table_query`'s
  `TableResult`, log via `write_logging` on failure, return the same zeroed default shape. Also
  populated `table:` on all 4 call sites (task 2).

### src/lib/actions/pipelineLog.ts
- `resolvePipRunId`, `logPipelineStep`, `getPipelineRates`, `getLatestPipelineRuns`,
  `getRecentRunIds`: unwrap `table_query`'s `TableResult`, log via `write_logging` on failure.

### src/lib/actions/pipelineStatus.ts
- `getPipelineStatus`, `refreshStep1`, `refreshStep3`, `refreshTposStatus`, `refreshStep4`,
  `refreshCpChangeStatus`, `refreshHabitsStatus`, `refreshGameEndingsStatus`,
  `refreshPurgeStatus`: unwrap `table_query`'s `TableResult`, log via `write_logging` on failure,
  return the same zeroed default shape. Also populated `table:` on all 9 call sites (task 2), and
  fixed a `result` naming collision in `getPipelineStatus` (renamed the unwrap variable to
  `queryResult` to avoid a block-scope redeclaration against the pre-existing `const result` return
  object).

### src/lib/actions/sync.ts
- `insertRawGame` (local, `table_write`): unwrap `TableResult`, log via `write_logging` on
  failure, return `false`.

### src/lib/analysis/chessdb.ts
- `getPositionCount`, `getMovesForPosition`, `getMovePlayCounts`, `getMoveSummaryForPosition`,
  `fetchGamesForPosition`, `getGamesForPositionCount`, `getEvaluationForPosition`,
  `getOrCreatePosition` (lookup + reselect — **throws** on failure instead of a safe default,
  since a position id has no safe sentinel value and downstream callers require a real id),
  `upgradePositionEvaluation` (lookup + upsert, returns `false` on failure), `getPositionEvaluationsBulk`,
  `gamePositionExists` (`table_check`'s `.data.found`), `getHabitsData`, `getHabitsCount`,
  `getPositionDetail` (5-way `Promise.all`, checks all 5 `.ok` together): unwrap `TableResult`, log
  via `write_logging` on failure, preserve existing return types. Also populated `table:` on all 8
  `table_query` call sites that were missing it (task 2).

### src/lib/analysis/buildHabits.ts
- `fetchHabitAggregates`, `upsertHabitAggregates` (per-chunk upsert): unwrap `TableResult`, log via
  `write_logging` on failure.

### src/lib/analysis/buildPositionTree.ts
- `syncTposFromTgam` (backlog count, before/resulting id backfill — aborts and logs `logEnd` on
  backfill failure), `buildPositionTree` (games fetch — returns zeroed result on failure; snapshot
  counts — logs but continues with 0): unwrap `TableResult`, log via `write_logging` on failure.
  Also populated `table:` on the `buildPositionTree_snap` call site (task 2).

### src/lib/analysis/enrichPositionsStockfish.ts
- `countRemainingPositions`, `getResultingFensToEvaluate`, `bulkUpdateCpLoss`,
  `enrichPositionsStockfish` (phase-1 fetch), `deepenPopularPositions` (candidate select),
  `countRemainingPopularPositions`, `countRemainingPopularPositionsByTier`,
  `getGamesNeedingFinalEval`, `findExistingEvals`, `evaluateGameEndings` (remaining count): unwrap
  `TableResult`, log via `write_logging` on failure, preserve existing return types/defaults. Also
  populated `table:` on the two `countRemainingPopularPositions*` call sites (task 2).

### src/lib/analysis/purgePositions.ts
- `purgeStaleReachOnePositions` (all 6 `table_query` steps — seed, evals delete, tgam delete, tgam
  null-out, resurrection guard, tpos delete): unwrap `TableResult`, log via `write_logging` and
  abort the run (`logEnd` + `return { purged: 0 }`) on any step's failure, since this is the
  project's one destructive-automation exception and a partial failure mid-chain must not silently
  continue past it.

### src/lib/fide/fidePipeline.ts
- `findUnlinkedRowByName`, `populateFideTopPlayers` (candidates fetch — now throws with the real
  error instead of a generic empty-table message when the query itself fails; per-candidate
  `linked` lookup inside the existing try/catch), `refreshFideRatings` (linked players fetch,
  ratings fetch): unwrap `TableResult`, log via `write_logging` on failure.

### src/lib/fide/fideStaging.ts
- `unzipFideZip` (zip row fetch), `parseFideXml` (chunk count, per-batch XML read): unwrap
  `TableResult`, throwing/logging on failure consistent with each function's existing
  empty-table-throws pattern. Also populated `table:` on the `parseFideXml_count` call site
  (task 2).

### src/app/api/analysis/diag/route.ts
- Unwraps all 3 parallel `table_count`/`table_fetch` results, returning a 500 with the combined
  error message if any failed.

### src/ui/analysis/PipelineLogTable.tsx
- `fetchdata()`: unwraps `fetchFiltered`/`fetchTotalPages`/`fetchTotalRows`, throwing into the
  existing `catch` block on failure (existing console.error handling unchanged).

### src/ui/AppShell.tsx, src/ui/charts/OpeningScoreChart.tsx, src/ui/charts/RatingChart.tsx, src/ui/games/GameList.tsx
- No direct edits — each called an already-fixed `src/lib/actions/{players,games}.ts` function, so
  their type errors resolved transitively once those functions were unwrapped. AppShell.tsx's
  reported error turned out to be a stale `tsconfig.tsbuildinfo` incremental-build cache, not a
  real type error — deleted the file and it was gone.

### src/lib/constants.ts, src/app/owner/constants/page.tsx (task 3)
- Added `MASTER_INCLUDED_TIME_CLASSES`, `MASTER_MIN_ANALYSIS_MOVE`, `MASTER_MAX_ANALYSIS_MOVE`,
  `MASTER_POSITION_INSERT_CHUNK_SIZE` (new "Master Games" section); mirrored into the Constants
  page along with `POSTGRES_URL1`.

### scripts/schema.sql (task 3)
- Added the 4 new master-games tables (`tmgr_mastergamesraw`, `tmgd_mastergamesdecon`,
  `tmps_masterpositions`, `tmgp_mastergamepositions`), labeled as living in the secondary database.

### src/lib/master/masterSync.ts (new, task 3)
- `syncMasterGames(chesscomHandle, year)`: downloads chess.com archives for one player/year,
  filters `rules === 'chess'` and `MASTER_INCLUDED_TIME_CLASSES`, inserts into
  `tmgr_mastergamesraw` via `insertMasterRawGame` (ON CONFLICT DO NOTHING, mirrors `sync.ts`'s
  `insertRawGame`).

### src/lib/master/masterDeconstruct.ts (new, task 3)
- `deconstructMasterGames(chesscomHandle)`: mirrors `deconstructGames`, reads
  `tmgr_mastergamesraw`/writes `tmgd_mastergamesdecon`, skips already-deconstructed rows via an
  existing-uuid set, reuses `upsertEcoReference` (now exported from `deconstruct.ts`) against the
  shared primary-database `tec_ecoreference` table.

### src/lib/parsePgn.ts, src/lib/actions/deconstruct.ts (task 3)
- Moved `normalizeTermination` from `deconstruct.ts` into `parsePgn.ts` — `deconstruct.ts` is a
  `'use server'` file where every export must be async, so it couldn't export this plain sync
  function once `masterDeconstruct.ts` needed to reuse the exact same termination-mapping logic
  instead of duplicating it. `deconstruct.ts` now imports it back from `parsePgn.ts`, no behavior
  change.

### src/lib/master/masterPositionTree.ts (new, task 3)
- `buildMasterPositionTree(chesscomHandle)`: full truncate-and-rebuild of
  `tmgp_mastergamepositions`/`tmps_masterpositions` from every `tmgd_mastergamesdecon` row for one
  player — admin-triggered rebuild (the documented `table_truncate` use case), not an incremental
  batch pipeline like the player-side `buildPositionTree`/`syncTposFromTgam`, since the POC always
  processes one player's full dataset in one run. Replays each game's PGN via chess.js
  (`getMasterPositionsFromGame`, mirrors `getPositionsFromGame`), bulk-inserts scoped to
  `MASTER_MIN_ANALYSIS_MOVE`..`MASTER_MAX_ANALYSIS_MOVE`, then ensures/backfills
  `tmps_masterpositions` and recomputes `mps_reached` — all within the secondary database.

### src/lib/master/masterChessdb.ts (new, task 3)
- `getMasterMovesForPosition(fen, player?)`: single-query join (within the secondary database only)
  returning every move played from a FEN across synced master games, with win/loss counts — mirrors
  `getMovesForPosition`'s shape, no eval join (no eval table for this POC).

### src/app/owner/mastergames/page.tsx, src/app/owner/page.tsx (new page, task 3 — later simplified in task 4)
- Task 3: new POC trigger page — a button running sync → deconstruct → build-tree in sequence for
  the hardcoded POC target, plus a FEN-lookup panel. Task 4 removed the run buttons (superseded by
  the new pipeline page) — see below.

### Bug fix found while testing the task 3 POC, before task 4 started
- `src/lib/master/masterPositionTree.ts`: `buildMasterPositionTree`'s "ensure positions" INSERT
  failed with `column "mps_move_num" is of type integer but expression is of type text` — a bare
  `NULL` literal in a `SELECT DISTINCT ... FROM (subquery)` didn't pick up its target column's type.
  First real run produced 739 games / 19121 game-positions but 0 positions, silently returning
  early on the caught error — exactly the kind of failure a proper pipeline's per-step status
  table would have surfaced immediately, which is why task 4 happened next. Fixed by casting
  explicitly (`NULL::integer`).

### src/lib/constants.ts, src/app/owner/constants/page.tsx (task 4)
- Added `PIPELINE_TYPE_MASTERGAMES`; mirrored into the Constants page along with updated
  consumer lists for `MASTER_INCLUDED_TIME_CLASSES`/`MASTER_MIN_ANALYSIS_MOVE`/
  `MASTER_MAX_ANALYSIS_MOVE` (now also consumed by the new pipeline page) and renumbered
  "(pipeline step N)" mentions for the FIDE functions.

### src/lib/actions/pipelineLog.ts (task 4)
- Added `PIPELINE_TYPE_MASTERGAMES` to the local `PipelineType` union (was hardcoded to just
  games/masters).

### src/lib/fide/fideStaging.ts, src/lib/fide/fidePipeline.ts (task 4)
- Renumbered every `logPipelineStep` call and header comment: Download FIDE Zip 10→1, Unzip FIDE
  File 11→2, Parse FIDE XML 12→3, Populate FIDE Top Players 13→4, Refresh FIDE Ratings 14→5. Same
  `PIPELINE_TYPE_MASTERS`, no other behavior change.

### src/app/owner/pipelinemasters/page.tsx (task 4)
- Updated `STEPS` array and every `MyHelpStep`/`td` step-number display string to match the 1-5
  renumbering above.

### src/lib/master/masterGamesPipelineStatus.ts (new, task 4)
- `refreshMasterSyncStatus`/`refreshMasterDeconStatus`/`refreshMasterTreeStatus`: per-step row/
  position counts for the master-games pipeline's Run Pipeline status column, mirroring
  `fidePipelineStatus.ts`'s pattern.

### src/lib/master/masterSync.ts, masterDeconstruct.ts, masterPositionTree.ts (task 4)
- Added `level`/`forceNewRun` params, `logStart`/`logEnd` wrapping, and a `logPipelineStep` call
  (steps 1/2/3, `PIPELINE_TYPE_MASTERGAMES`) at the end of each — previously these functions ran
  without ever recording a pipeline-log entry. Also added a missing error log on
  `buildMasterPositionTree`'s final position-count query, which previously swallowed a failure
  silently (defaulting `positions` to `0` with no trace).

### src/app/api/mastergames/sync/route.ts, deconstruct/route.ts, build-tree/route.ts (new, task 4)
- Thin GET wrappers wiring `player`/`year`/`level`/`newRun` query params to the three functions
  above, mirroring `/api/fide/*`'s pattern exactly.

### src/app/owner/pipelinemastergames/page.tsx (new, task 4)
- Full pipeline control panel — Jobs summary (Run # selector, per-step last-run stats from
  `tpip_pipelinelog`), Run Pipeline table (per-step status/result/error/Run button), and Run All —
  same structure as `pipelinemasters/page.tsx`, scoped to the hardcoded POC target
  (`magnuscarlsen`/`2026`, page-local constants).

### src/app/owner/mastergames/page.tsx (task 4)
- Simplified down to just the FEN-lookup panel — the sync/deconstruct/build-tree buttons moved to
  the new pipeline page.

### src/app/owner/page.tsx (task 4)
- Tools list: split the old single "Master Games (POC)" entry into "Pipeline (Master Games POC)"
  (new pipeline page) and "Master Games — FEN Lookup" (existing route, now lookup-only).

### src/lib/constants.ts, src/app/owner/constants/page.tsx (task 5)
- Added `MASTER_GAME_LIST_ROWS_DEFAULT`/`MASTER_GAME_LIST_ROWS_OPTIONS`; mirrored into the
  Constants page.

### src/lib/master/masterGamesList.ts (new, task 5)
- `MasterGameFilters`, `fetchFilteredMasterGames`, `getMasterGamesPageCount`: mirrors `games.ts`'s
  "Filtered + Paginated" section against `tmgd_mastergamesdecon` (secondary database) — no
  `players` array param (no player-select filter yet).

### src/ui/games/MasterGameList.tsx (new, task 5)
- Browsable/filterable master-games list — mirrors `GameList.tsx`'s filter row (opponent/date/
  color/time-class/result/termination/opening/ECO) and pagination footer, but every filter is
  local component state (not wired into the shared global `?dateFrom=`/`?opening=`/`?eco=`
  filters), no player-select filter, rows not clickable (no master-game analyze page exists yet).

### src/app/mastergames/page.tsx (new, task 5)
- New top-level route rendering `MasterGameList`, mirrors `habits/page.tsx`'s
  `'use client'`/`Suspense` wrapper shape.

### src/ui/AppNav.tsx (task 5)
- Added "Masters Games" → `/mastergames` to `SECTIONS` and the `activeKey` check.

### src/lib/master/masterGamesList.ts (task 6)
- Added `getMasterGameById(mgdid)`, mirroring `games.ts`'s `getGameById`.

### src/ui/board/MasterGameView.tsx (new, task 6)
- Read-only board/move-list view for one master game — header, `react-chessboard` (non-
  interactive, `allowDragging: false`), `MoveTree` navigation (main-line-only tree built with an
  empty `plyEvals` array, no Stockfish), keyboard navigation (arrows/Home/End), and the Lichess
  Masters Explorer panels ("Master Moves"/"Master Games", external API). Deliberately never
  imports any write-back or tracked-player-scoped function.

### src/app/analyzemaster/page.tsx (new, task 6)
- New route, `?game=<mgdid>`, mirrors `/analyze/page.tsx`'s `'use client'`/`Suspense` wrapper
  shape and loading/error states; back nav points to `/mastergames`.

### src/ui/games/MasterGameList.tsx (task 6)
- Rows are now clickable (`cursor-pointer`, hover highlight), navigating to
  `/analyzemaster?game=${mgd_mgdid}`.

### src/ui/board/MasterGameView.tsx (revised, task 6)
- Added a live "Game Analysis" panel: `StockfishEngine`/`DepthInput` (both reused as-is, no new
  code), `runAnalysis()` calls `engine.analyzeGame` with no DB cache and no save afterward —
  results exist only in local `plyEvals`/`tree` state, recomputed fresh on every visit. Kept the
  Lichess Masters Explorer panel (a "drop it" suggestion made mid-review was reversed — confirmed
  fine as-is). No new table, no new save/read functions — the originally-proposed
  `tmge_mastergameevals` table was dropped entirely once confirmed unnecessary.

### src/ui/AppShell.tsx (task 6)
- Added a third case (alongside "everywhere" and "`/owner/*`"): on `/mastergames`/`/analyzemaster`,
  render `AppNav` directly (Suspense-wrapped) but skip `PlayerHeader`'s tracked-player selector
  cards entirely — they don't apply to master-games data.

### src/lib/constants.ts, src/app/owner/constants/page.tsx (task 7)
- Added `MASTER_GAMES_SYNC_YEARS`; mirrored into the Constants page.

### src/ui/filters/MasterPlayerSelect.tsx (new, task 7)
- Reusable master-player picker — self-fetches `getMasterPlayers('', true)`, value = chess.com
  handle, blank placeholder option, built on the existing `FilterSelect` primitive.

### src/app/owner/pipelinemastergames/page.tsx (task 7)
- Replaced the hardcoded `POC_CHESSCOM_HANDLE`/`POC_YEAR` constants with `selectedHandle`/
  `selectedYear` state driven by `MasterPlayerSelect` + a Year `FilterSelect`
  (`MASTER_GAMES_SYNC_YEARS`). All 3 step handlers and the Run/Run All buttons now use the
  selected values and are disabled until a master is chosen.

### src/lib/master/masterGamesList.ts (task 8)
- Added `getSyncedMasterPlayers()`, `player?: string` on `MasterGameFilters`, and the matching
  filter push in `buildMasterGameFilters`.

### src/ui/filters/FilterMasterPlayerSelect.tsx (new, task 8)
- Player filter for `MasterGameList.tsx`, "All" option first, options self-fetched from
  `getSyncedMasterPlayers()`, built on `FilterSelect` (→ `MySelect`).

### src/ui/games/MasterGameList.tsx (task 8)
- Wired `FilterMasterPlayerSelect` into the filter row's Player cell, bound to
  `draftFilters.player`/`updateFilter('player', ...)`.

### src/lib/actions/masterPlayers.ts (task 9)
- Added `getMasterHandleNameMap()`: handle (lowercased) → display name, from `getMasterPlayers('')`.

### src/lib/master/masterGamesList.ts (task 9)
- `getSyncedMasterPlayers()` now returns `SyncedMasterPlayer[]` (`{ handle, name }`) instead of
  bare handle strings. `getMasterGameById`/`fetchFilteredMasterGames` now attach `mgd_player_name`
  to every row, merged in from `getMasterHandleNameMap()`.

### src/ui/filters/FilterMasterPlayerSelect.tsx (task 9)
- Option label is now the master's real name (value is still the handle, since that's what
  `mgd_player` filters on).

### src/ui/games/MasterGameList.tsx (task 9)
- Player column now shows `row.mgd_player_name` instead of the raw handle.

### src/ui/board/MasterGameView.tsx (task 9)
- `MasterGameRow` gained `mgd_player_name`. The bottom-player header (always the tracked master,
  regardless of color) now shows it directly instead of a `playerColor`-based
  `mgd_white_username`/`mgd_black_username` lookup. Opponent (top) side unchanged.

### src/ui/games/MasterGameList.tsx (task 10)
- Added `MyButton` import; last column now has an "Analyze" button matching `GameList.tsx`
  (`e.stopPropagation()`, same navigation as the row click). Player column now shows
  `Name (handle)` instead of name-only.

### src/ui/board/MasterGameView.tsx (task 10)
- Bottom-player header now shows `Name (handle)` instead of name-only.

### src/app/owner/page.tsx (task 11)
- Added `OwnerRoutingMaintenance` import and a "Routing Maintenance" tab to the `tabs` array,
  per `nextjs-shared/CONSUMING_PROJECTS.md`'s documented pattern for projects using multi-database
  routing (`xrtg_routing`) — gives write/edit-in-place/delete on routing rows with no manual SQL.

## Testing
- [ ] Confirmed via `npx tsc --noEmit` (clean, 0 errors) and `npm run build` (successful production
      build, all 33 routes generated) — no user-facing behavior change from tasks 1/2, this was a
      type-safety migration to match nextjs-shared 2.1.81's new `TableResult<T>` return shape plus
      a logging-visibility fix.
- [ ] Spot-check a few pages that exercise the touched code paths still work normally: `/analyze`
      (games list, opening scores, rating chart — `games.ts`, `chessdb.ts`), `/habits`
      (`chessdb.ts`'s habits queries), `/owner/pipelinegames` and `/owner/pipelinemasters`
      (pipeline status/log panels — `pipelineStatus.ts`, `pipelineLog.ts`, `fidePipeline.ts`,
      `fideStaging.ts`), `/owner/masterplayers` (`masterPlayers.ts`).
- [ ] If convenient, trigger one pipeline step that hits the destructive purge path
      (`purgeStaleReachOnePositions` via `/owner/pipelinegames`) to confirm it still runs and logs
      normally — this function's failure handling changed the most (aborts and logs on any step
      failure instead of the old implicit behavior).
- [ ] Open `/owner/logging`, trigger a page that uses one of the fixed functions (e.g. `/analyze`
      for `getMoveSummaryForPosition`/`getMovesForPosition`, or `/habits` for `getHabitsData`), and
      confirm the corresponding `cache_get`/`cache_set`/`table_query` log rows now show a populated
      `Table:` column instead of blank.
- [x] Master games POC (task 3): manual SQL run against `local_chess_masters`/`local_chess`,
      confirmed — first real run surfaced the `mps_move_num` type bug (see the bug-fix Changes
      entry above), now fixed.
- [ ] Master games pipeline (task 4): open `/owner/pipelinemastergames`, click "Run All", confirm
      all 3 steps go green with non-zero counts in both the Jobs summary and Run Pipeline status
      column (in particular: Build Master Position Tree should now show a non-zero `positions`
      count, confirming the earlier bug is actually fixed this time, not just silently swallowed).
      Then open `/owner/mastergames` and FEN-lookup the starting position
      (`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`) — confirm it returns a sensible
      move list with counts.
- [ ] FIDE masters pipeline renumbering (task 4): open `/owner/pipelinemasters` and confirm the
      Jobs summary / Run Pipeline table still show steps 1-5 correctly (previous run history logged
      under the old 10-14 numbering will no longer match — that's expected, just historical data
      under a different `pip_step` value, not a data-loss concern). Run one step to confirm new
      rows log correctly under the new numbers.
- [ ] Masters Games list (task 5): open `/mastergames` from the top nav, confirm the synced
      Magnus Carlsen games (from task 4's pipeline run) appear, paginated. Try each filter
      (opponent/date/color/time-class/result/termination/opening/ECO) and confirm results narrow
      correctly, and that this page's filters are independent of the Games/Graph/Openings/Endings/
      Habits shared `?dateFrom=`/`?opening=`/`?eco=` state (changing one doesn't affect the other).
- [ ] Master game view (task 6): click a row on `/mastergames`, confirm `/analyzemaster?game=...`
      loads the board with correct starting orientation/players/result. Step through moves via
      the move list, Prev/Next buttons, and arrow keys — confirm the board updates correctly.
      Click a move to see the "Master Moves"/"Master Games (Lichess)" panels populate. Click
      "Analyze Game" and confirm progress updates, then blunder/mistake/inaccuracy counts and
      per-move annotations appear in the move list — then navigate away and back to the same game
      and confirm the analysis is gone (recomputes fresh, nothing persisted, as designed). Confirm
      the back-nav link returns to `/mastergames`. Most importantly: after running analysis on a
      master game, spot-check that `/analyze` (a real tracked-player game) and its own "Analyze
      Game" Stockfish write-back still work exactly as before — confirming this view genuinely
      never touched the primary database's position tree.
- [ ] Header layout (task 6): confirm `/mastergames` and `/analyzemaster` show the top tab bar
      (Games/Habits/Graph/Openings/Endings/Masters Games) but **no** tracked-player cards
      (`stricade`/`astarrboy`) above it, while every other page (Games, Habits, Graph, Openings,
      Endings) still shows both exactly as before.
- [ ] Pipeline dropdowns (task 7): open `/owner/pipelinemastergames`, confirm the Master dropdown
      lists master players (grade-sorted, blank placeholder first) and Run/Run All stay disabled
      until one is picked. Pick a different master (or the same one) and a year, run the pipeline,
      confirm the synced games match the selected master/year — not still hardcoded to Magnus/2026.
- [ ] Player filter (task 8): open `/mastergames`, confirm the Player filter dropdown shows "All"
      plus every synced master handle, defaults to "All" (no narrowing), and picking a specific
      master + clicking Filter narrows the list to only that player's games.
- [ ] Master real names (task 9): on `/mastergames`, confirm the Player filter dropdown shows real
      names (e.g. "Magnus Carlsen"), not chess.com handles.
- [ ] Analyze button + name+handle display (task 10): on `/mastergames`, confirm the Player column
      shows `Name (handle)` (e.g. "Magnus Carlsen (magnuscarlsen)") and the last column has a
      working "Analyze" button (in addition to the row itself still being clickable). Open a game
      via `/analyzemaster` and confirm the bottom (tracked-master) player box shows
      `Name (handle)`, while the opponent (top) box still shows only their chess.com username.
- [ ] Routing Maintenance tab (task 11): open `/owner`, confirm a new "Routing Maintenance" tab
      appears, lists the existing `xrtg_routing` rows (the 4 master-games tables → `POSTGRES_URL1`),
      and that edit-in-place/delete work without needing manual SQL.
