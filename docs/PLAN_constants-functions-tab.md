# PLAN_constants-functions-tab — chess

## Title
Add a "Functions" tab to /owner/constants, reverse-indexing which constants/env vars each function uses. Resurrects the 4 items deferred out of scope from PLAN_pipeline-remaining-column-cleanup.md (commit a00a5a7) and lost when that plan file was deleted prematurely with them still unchecked (commit 6754ba3).

## Plan
- [x] Fix the 4 inconsistent `consumers` entries in `src/app/owner/constants/page.tsx` that don't follow either parseable convention (bare file path, no `: functionName` and no `(module scope)`):
  - `DEFAULT_BATCH_SIZE`: `'api/analysis/build-tree/route.ts'` → `'api/analysis/build-tree/route.ts: GET'`; `'api/analysis/evaluate-positions/route.ts'` → `'api/analysis/evaluate-positions/route.ts: GET'`; `'api/analysis/evaluate-game-endings/route.ts'` → `'api/analysis/evaluate-game-endings/route.ts: GET'`
  - `CRON_DEEPEN_POPULAR_BATCH_SIZE`: `'api/analysis/deepen-popular-positions/route.ts'` → `'api/analysis/deepen-popular-positions/route.ts: GET'`
  - `STOCKFISH_DEPTH`: `'api/analysis/evaluate-positions/route.ts'` → `'api/analysis/evaluate-positions/route.ts: GET'`; `'api/analysis/evaluate-game-endings/route.ts'` → `'api/analysis/evaluate-game-endings/route.ts: GET'`
  - `PIPELINE_CRON_SCHEDULE`: `'owner/pipeline/page.tsx: PipelinePage (JOB_GROUPS schedule display)'` → `'owner/pipeline/page.tsx: PipelinePage'` (drop the redundant trailing detail so this reference matches the identical `PipelinePage` reference used by other constants, instead of forking into a separate row in the new Functions tab)
- [x] In `src/ui/owner/ConstantsViewer.tsx`, add a reverse-index builder function `buildFunctionIndex(sections: ConstantSection[]): { usedIn: string; names: string[] }[]` that:
  - Walks every section's every entry's `consumers` array
  - Skips any consumer string equal to `'none yet'` (placeholder meaning "not used anywhere")
  - If a string ends in `" (module scope)"` with no `": "`, treats the whole string as one reference
  - Otherwise splits on `": "` into a file part and a comma-separated functions part, producing one reference (`"file: functionName"`) per function
  - Groups by reference, collecting the (deduplicated, sorted) list of constant/env-var names that reference it
  - Returns the result sorted alphabetically by reference
- [x] Add a third top-level tab, **"Functions"**, to `ConstantsViewer.tsx`'s `Tab` union (`'constants' | 'env' | 'functions'`) and tab bar, alongside "Constants" and ".env" — one combined tab (not split by Constants vs .env), since a function can use both a constant and an env var and should show both together in one row.
- [x] When the "Functions" tab is active: hide the section-pill row entirely (this view is flat, not split into sections — a function can span multiple sections' constants), and render a new flat table built from `buildFunctionIndex([...constantsSections, ...envSections])`, columns **"Used In"** (the reference string) and **"Constants / Env Vars Used"** (the matched names — inline if short, behind the existing `PopoverButton` "Show" pattern if long, consistent with the existing "Used by" column's behavior).

- [x] Rename the Functions tab table's column headings: "Used In" → **"Functions"**, "Constants / Env Vars Used" → **"Constants/.ENV"**.
- [x] Change `buildFunctionIndex`'s return shape so each matched name carries its origin (constant vs .env var) instead of one merged `names: string[]` — call the builder with `constantsSections` and `envSections` kept separate (not pre-merged into one array) so origin is known per name, e.g. `names: { name: string; isEnv: boolean }[]`.
- [x] Color-code each name in the "Constants/.ENV" column by origin, matching this page's existing blue accent (`text-blue-600`/`text-blue-700`, already used for constants-tab UI elements): constants render in blue, .env vars render in red (`text-red-600`/`text-red-700`) — applies both to the inline-list rendering and the names listed inside the "Show" popover.
- [x] Increase the column spacing in the Functions table (wider gap between the "Functions" and "Constants/.ENV" columns than the current `pr-4`) so the two columns read as clearly separated — a modest bump (e.g. `pr-8`/`pr-10`) rather than a specific agreed pixel value, since this is a visual spacing tweak, not a functional constraint.

- [x] Fix the Functions column overlapping the Constants/.ENV column: `FunctionIndexTable`'s first column (`th`/`td`) is `table-fixed` with a locked `w-96` width plus `whitespace-nowrap`, so a long "Functions" value (e.g. `api/analysis/evaluate-positions/route.ts: GET`) doesn't wrap or grow the column — it overflows past the fixed boundary and renders on top of the second column. Fix: widen the first column's fixed width (e.g. `w-96` → `w-[32rem]`) and replace `whitespace-nowrap` with `break-words` so long entries wrap onto additional lines within their own column instead of overflowing — same pattern already used by `SectionTable`'s Description column.
- [x] Split the "Constants/.ENV" heading into two separately colored words with no `/` separator: "Constants" in blue (`text-blue-700`, matching the constants name color used in the body), ".ENV" in red (`text-red-700`, matching the .env name color used in the body) — e.g. `<span className='text-blue-700'>Constants</span> <span className='text-red-700'>.ENV</span>` in the `th`.

- [ ] Add a `FUNCTION_DESCRIPTIONS: Record<string, string>` map to `src/app/owner/constants/page.tsx`, keyed by the exact resolved `usedIn` reference string `buildFunctionIndex` produces (so lookups are a direct match, no re-parsing), one entry per function/module-scope reference currently in `CONSTANTS_SECTIONS`/`envSections`' `consumers` arrays. Each description is the function's existing comment-header text (or, for `(module scope)` / bare-file entries with no single function, a one-line summary of what that file/module does), extracted from the source rather than invented:
  ```ts
  const FUNCTION_DESCRIPTIONS: Record<string, string> = {
    'sync.ts: syncArchive': 'Downloads one chess.com monthly archive and inserts new games into tgr_gamesraw, skipping already-synced ones.',
    'players.ts: updatePlayerRating': "Saves each player's latest rating per time class into tplr_player_ratings from their most recent deconstructed game.",
    'deconstruct.ts: getUndeconstructedCount': 'Counts raw games in tgr_gamesraw not yet deconstructed into tgd_gamesdecon for a player.',
    'deconstruct.ts: deconstructGames': 'Parses raw chess.com games into structured rows in tgd_gamesdecon, extracting opening, result, ratings, and termination.',
    'players.ts: getPlayers': 'Returns all registered players (username, display name) ordered alphabetically, default player pinned first.',
    'graph/page.tsx: GraphContent': 'Rating Graph page content — player/date/time-class filters driving the RatingChart, with sessionStorage-persisted filter state.',
    'GameList.tsx: GameList': 'Paginated, filterable table of deconstructed games with drill-down into an individual game for analysis.',
    'OpeningScoreChart.tsx: OpeningScoreChart': 'Bar chart of win-rate by opening (ECO/name), with drill-down into the games behind a selected bar.',
    'TerminationChart.tsx: TerminationChart': 'Stacked bar chart of win/loss counts by game termination type, filterable by colour and date.',
    'games.ts: getTerminationStats': 'Aggregates win/loss/total counts per termination type for a set of players from tgd_gamesdecon.',
    'HabitsTable.tsx: HabitsTable': 'Filterable table of recurring move habits (good/bad) with mini boards, stats, and dismiss/restore controls.',
    'buildHabits.ts: buildHabits': 'Full recompute of recurring move habits per (player, position, move) into thab_habits, preserving dismissed flags.',
    'habits/page.tsx: HabitsContent': "Habits page content — paginated, filterable table of a player's recurring good/bad moves sourced from thab_habits.",
    'buildPositionTree.ts: buildPositionTree': 'Replays new games with chess.js to record per-move positions into tgam_game_positions, then syncs tpos_positions.',
    'pipelineStatus.ts: refreshHabitsStatus': 'Total/dismissed/remaining row counts for thab_habits, where remaining is genuinely new (player, position, move) combinations.',
    'owner/pipeline/page.tsx (module scope)': 'Client component module for the Owner Pipeline page — imports pipeline actions/status functions and defines job-group/SQL display constants used by PipelinePage.',
    'deconstruct.ts (module scope)': 'Server actions module that deconstructs raw chess.com games into tgd_gamesdecon and upserts ECO code/opening-name references.',
    'ChessBoardView.tsx: ChessBoardView': 'Interactive game analysis board — move tree, Stockfish batch/position analysis, and position-history panels for one game.',
    'purgePositions.ts: purgeStaleReachOnePositions': 'Deletes stale low-reach positions (and dependent rows) once every occurrence is past the grace period.',
    'pipelineStatus.ts: refreshPurgeStatus': 'Counts positions currently eligible for purgeStaleReachOnePositions, mirroring its own eligibility criteria.',
    'enrichPositionsStockfish.ts: countRemainingPositions': 'Counts tpos_positions rows above the reach floor that still lack a teva_evaluations row.',
    'enrichPositionsStockfish.ts: getResultingFensToEvaluate': 'Fetches resulting positions from tgam_game_positions still missing a Stockfish evaluation.',
    'enrichPositionsStockfish.ts: enrichPositionsStockfish': 'Batch-evaluates unevaluated positions with Stockfish and writes centipawn scores/best moves into teva_evaluations.',
    'pipelineStatus.ts: refreshStep4': 'Counts evaluated positions and remaining unevaluated positions above the reach floor for the Evaluate Positions step.',
    'pipelineStatus.ts: refreshCpChangeStatus': 'Counts tgam_game_positions rows still pending a computed centipawn-change value.',
    'chessdb.ts: getGamesForPosition': "Lists a player's games that reached a given position by a given move, with result-mismatch flags.",
    'enrichPositionsStockfish.ts: popularPositionTierSql': 'Builds the shared SQL CASE/threshold for popular-position depth tiers, kept in sync with the constant.',
    'enrichPositionsStockfish.ts: deepenPopularPositions': 'Re-evaluates already-evaluated popular positions at a deeper Stockfish depth per their reach tier.',
    'enrichPositionsStockfish.ts: evaluateGameEndings': "Evaluates each game's true final position with Stockfish (reusing tree evals where possible) into tgd_gamesdecon.gd_final_eval.",
    'owner/pipeline/page.tsx: PipelinePage': 'Owner Pipeline page — runs and monitors every analysis pipeline step (sync, tree build, purge, evaluate, habits, etc.).',
    'api/analysis/build-tree/route.ts: GET': 'API route that runs buildPositionTree for a batch of games and returns the result as JSON.',
    'api/analysis/evaluate-positions/route.ts: GET': 'API route that runs enrichPositionsStockfish for a batch of positions and returns the result as JSON.',
    'api/analysis/evaluate-game-endings/route.ts: GET': 'API route that runs evaluateGameEndings for a batch of games and returns the result as JSON.',
    'api/analysis/deepen-popular-positions/route.ts: GET': 'API route that runs deepenPopularPositions for a batch of positions and returns the result as JSON.',
    'buildPositionTree.ts: insertGamePositions': 'Bulk-inserts parsed per-move position records into tgam_game_positions, chunked without splitting a game across chunks.',
    'games.ts: fetchFilteredGames': 'Fetches a filtered, paginated page of deconstructed games from tgd_gamesdecon.',
    'games.ts: getGamesPageCount': "Returns total page count for fetchFilteredGames' same filter set, for pagination.",
    'PipelineLogTable.tsx: fetchdata': 'Fetches a filtered, paginated page of tpip_pipelinelog rows plus total page count for the log table.',
    'AppShell.tsx: loadAll': 'Loads all players plus their profile and rating data to populate the shared PlayerProfile header cards.',
    'DeconstructButton.tsx: handleCheckCounts': 'Fetches and displays remaining vs. already-deconstructed game counts for a player.',
    'DeconstructButton.tsx: handlePopulate': 'Runs deconstructGames for a player at the selected batch size and refreshes the counts/result display.',
    'stockfish.ts: STOCKFISH_DEFAULTS': 'Groups Stockfish tuning constants (depth, blunder/mistake/inaccuracy thresholds, hash, line length) into one default object.',
    'ConstantsViewer.tsx: renderValue': "Renders a constant's value inline, or behind a Show popover if it's an object or exceeds the display length limit.",
    'nextjs-shared/src/tables/db.ts': 'Defines and lazily initializes the shared Postgres query handler (Neon pool or local Client), used via the exported sql() function.',
    'nextjs-shared/next.config.mjs': 'Next.js config for the nextjs-shared package itself, exposing POSTGRES_URL and POSTGRES_DATABASE_LOCATION as env vars.',
    'lib/sync-games.ts': "Standalone CLI script that connects to Postgres directly and syncs one player's full chess.com game archive into tgr_gamesraw.",
    'lib/deconstruct-games.ts': "Standalone CLI script that connects to Postgres directly and deconstructs a player's blitz raw games into tgd_gamesdecon/tec_ecoreference.",
    'src/app/layout.tsx': 'Root Next.js layout — sets up fonts, metadata, the dev header, and wraps every page in AppShell.',
    'nextjs-shared/src/tables/tableGeneric/write_logging.ts': 'Exports write_logging, which inserts an application log row into xlg_logging (or falls back to console output).',
    'src/app/api/cron/sync/route.ts': 'Cron-triggered API route, auth-checked via CRON_SECRET, that runs runGameSync for all players.',
    'lib/cron-sync.ts': 'Standalone CLI script that calls the local /api/cron/sync endpoint with the CRON_SECRET bearer token.',
    'src/lib/analysis/enrichPositionsStockfish.ts': 'Server actions module implementing the Stockfish engine wrappers and batch position/game-ending evaluation pipeline steps.'
  }
  ```
  Pass this map into `ConstantsViewer` as a new `functionDescriptions` prop.
- [x] In `src/ui/owner/ConstantsViewer.tsx`, thread `functionDescriptions: Record<string, string>` through as a new `ConstantsViewer` prop, and pass each `FunctionIndexEntry`'s looked-up description (`functionDescriptions[entry.usedIn]`, falling back to an empty string if a reference somehow has none) into `FunctionIndexTable`/`FunctionIndexNames`.
- [x] Change the "Constants/.ENV" column to always render as a popup (drop the current inline-vs-popover length check — every row gets a "Show" button, since the popup now also carries the description). Inside the popup: the function's description text first, then the matched constants/env vars **one per line** (already a `<ul>`/`<li>` list — keep the existing blue/red color-coding per name), replacing the current inline comma-joined rendering entirely.

### src/app/owner/constants/page.tsx
- Fixed the 4 `consumers` entries that didn't follow either parseable convention: appended `: GET` to the 4 bare route-file references under `DEFAULT_BATCH_SIZE`, `CRON_DEEPEN_POPULAR_BATCH_SIZE`, and `STOCKFISH_DEPTH` (confirmed each route file exports its handler as `GET`), and trimmed `PIPELINE_CRON_SCHEDULE`'s reference down to `'owner/pipeline/page.tsx: PipelinePage'` so it merges with the identical `PipelinePage` reference used by other constants instead of forking into its own Functions-tab row.

### src/ui/owner/ConstantsViewer.tsx
- Added `buildFunctionIndex(sections)`, walking every section's `consumers` arrays into one row per function/module-scope reference (skipping `'none yet'`, splitting multi-function `"file: fnA, fnB"` entries into separate references, treating `"... (module scope)"` strings as a single reference), grouping the (deduplicated, sorted) constant/env-var names each reference uses, sorted alphabetically by reference.
- Added `FunctionIndexTable`, a flat two-column table ("Used In" / "Constants / Env Vars Used") rendering the index — names inline when short, behind the existing `PopoverButton` "Show" pattern when the joined list exceeds `VALUE_DISPLAY_MAX_LENGTH`, matching the existing "Used by" column's behavior.
- Extended `Tab` to `'constants' | 'env' | 'functions'` and added a third `AppTab` ("Functions") to the top-level tab bar.
- When the Functions tab is active, the section-pill row is hidden and `FunctionIndexTable` renders `buildFunctionIndex(constantsSections, envSections)` instead of a per-section `SectionTable`.
- Renamed the Functions tab's column headings to "Functions" and "Constants/.ENV", and widened the gap between them (`pr-4` → `pr-10` on both the header and first-column cells).
- `buildFunctionIndex` now takes `constantsSections` and `envSections` as separate arguments (rather than one pre-merged array) and tags each matched name with `isEnv`, so origin survives into the render layer.
- Added `FunctionIndexNames`, extracted from `FunctionIndexTable`'s cell rendering, which color-codes each name blue (`text-blue-700`, constants) or red (`text-red-700`, .env vars) — both in the inline comma-separated rendering and inside the "Show" popover's list.
- Fixed the Functions column overlapping the second column: widened the first column's fixed width (`w-96` → `w-[32rem]`) and swapped `whitespace-nowrap` for `break-words`, so long entries wrap within their own column instead of overflowing onto the next.
- Split the second column's heading into `<span className='text-blue-700'>Constants</span> <span className='text-red-700'>.ENV</span>` — no `/` separator, colors matching the body's constant/env-var name coloring.

### src/app/owner/constants/page.tsx
- Added `FUNCTION_DESCRIPTIONS: Record<string, string>`, one entry per function/module-scope reference currently in `CONSTANTS_SECTIONS`/`envSections`, keyed by the exact resolved `usedIn` string `buildFunctionIndex` produces. Each description was extracted from that function's existing comment header in its source file (or a one-line summary of the module for bare-file/`(module scope)` entries with no single function) rather than invented.
- Passed `FUNCTION_DESCRIPTIONS` into `ConstantsViewer` as the new `functionDescriptions` prop.

### src/ui/owner/ConstantsViewer.tsx
- `ConstantsViewer` now accepts and forwards a `functionDescriptions: Record<string, string>` prop down to `FunctionIndexTable`.
- Replaced `FunctionIndexNames` with `FunctionIndexPopup`: every row in the Functions tab's second column now always renders behind a "Show" popup (the previous inline-vs-popover length check is gone) — the popup shows the function's description (looked up via `functionDescriptions[entry.usedIn]`) followed by its matched constants/env vars one per line, still color-coded blue (constants) / red (.env).

## Testing
- [x] Open /owner/constants and confirm a third "Functions" tab appears alongside "Constants" and ".env".
- [x] Click the Functions tab and confirm the section-pill row disappears and a flat table appears instead, with column headings "Functions" and "Constants" (blue) ".ENV" (red, no slash), with a visibly wider gap between them than the other tabs' columns.
- [x] Confirm rows are sorted alphabetically by "Functions", and that entries like `owner/pipeline/page.tsx: PipelinePage` show a combined, deduplicated list of every constant/env var that function uses (not split into separate rows for the same function).
- [x] Confirm a long "Functions" value (e.g. a route path with a function name) wraps onto additional lines within its own column instead of overlapping the second column.
- [x] Confirm every row's second column shows a "Show" button (no more inline comma-separated list, even for rows with only one or two names).
- [x] Click a "Show" button and confirm the popup shows a one-line description of the function first, then its matched constants/env vars listed one per line (not comma-separated), each colored blue (constants) or red (.env vars).
- [x] Spot-check a few rows against the actual code (e.g. `buildPositionTree.ts: buildPositionTree`, `owner/pipeline/page.tsx: PipelinePage`) to confirm the shown description matches what that function/module actually does.
- [x] Confirm a module-scope reference (e.g. `owner/pipeline/page.tsx (module scope)`) shows as its own single row, not merged with the `PipelinePage` function row.
- [x] Switch back to the Constants and .env tabs and confirm the section-pill row and per-section tables still work exactly as before (no regression from the tab-bar/state changes).
- [x] Confirmed via `npx tsc --noEmit` (clean) that all changes type-check.
