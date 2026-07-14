# PLAN_habits-page-fixes — chess

## Title
Habits page fixes

## Plan
- [x] Deep analysis "Stop" no longer hides best-moves results; add Resume button; clear results on node navigation
- [x] Add `getCurrentPositionFen()` helper as the single source of truth for "current position"; fix `startDeepAnalysis` to use it (was wrongly using `fenBefore`); reuse it at the multi-PV button call site
- [x] Depth dropdown options → 16/20/25/30, default 20; Lines dropdown options → 3/4/5
- [x] Deep Analysis gets its own independent Depth (30/40/Infinite, default 30) and Lines (3/4/5, default 3) controls, separate from the shared ones; engine stops automatically at the chosen depth cap instead of always running infinite
- [x] Merge "Analyse Position" and "Deep analyze this position" into one "Analyze Position" feature (always streaming, own Depth `20/30/40/Infinite`/Lines controls, clickable output, keeps played-move highlight); remove the now-unused shared Lines dropdown from "Analyze all moves"
- [x] Remove the "Explore: ON/OFF" toggle button — exploration (piece dragging, click-to-explore) is now always on
- [x] Split the single "Stockfish" box into "Game Analysis" and "Position Analysis" boxes so the two distinct functions are visually separated; nest Engine Lines results inside the Position Analysis box
- [x] Move this plan file from `.claude/PLAN_habits-page-fixes.md` to `docs/PLAN_habits-page-fixes.md` — live test of the dot-directory glob-matching hypothesis (see `.claude/CLAUDE.md`)
- [x] Second test edit (Test A) — confirming this location stays silent
- [x] Move the "Analyzing..." progress panel and analysis-error/Retry block into the "Game Analysis" box (they were rendering as separate top-level boxes after "Position Analysis")
- [x] Game Analysis re-analyze move range: From/To full-move selectors so a deeper re-analysis doesn't have to redo the whole game from move 1; merges into existing evaluations rather than replacing them. (Combining Stockfish analysis with `teva_evaluations` was discussed and explicitly dropped for now — not part of this change.)
- [x] `tgev_game_evals`: replaced `gev_chesscom_uuid`/`gev_player` with a single `gev_gdid` column (references `tgd_gamesdecon.gd_gdid` — not a DB-level FK, per convention). Table was dropped and recreated (no data preservation needed — this table is fully regenerable from `/analyze`), not migrated in place.

## Changes

### src/ui/board/ChessBoardView.tsx
- `handleSelectNode`: now also calls `setDeepAnalysisData(null)` when stopping analysis due to navigating to a different node, since stale results shouldn't display for a position the user has left.
- Deep-analysis panel: render condition changed from `!deepAnalyzing` to `!deepAnalyzing && !deepAnalysisData` so results (depth/nodes/nps/time/best-move lines) stay visible after Stop instead of disappearing.
- Added a "Resume" button (calls `startDeepAnalysis`) shown in place of "Stop" once analysis is stopped but results are still present.
- Added `getCurrentPositionFen()` — single source of truth for "the position currently on the board" (`currentNode?.fen ?? tree?.root.fen`).
- `startDeepAnalysis`: fixed to call `getCurrentPositionFen()` instead of incorrectly using `currentNode?.fenBefore` (was analyzing the position *before* the last move — alternatives to the move just played — instead of the position on the board, inconsistent with "Analyse Position" and "Analyze all moves").
- "Analyse Position" (multi-PV) button handler: now calls `getCurrentPositionFen()` instead of re-deriving `currentNode?.fen ?? tree?.root.fen` inline.
- `handleSelectPvLine` and `runAnalysis` were left as-is: the former needs the tree *node* (not just its fen) to attach a branch, and the latter batch-evaluates the whole main line rather than "the current position" — neither duplicates the pattern the helper consolidates.
- Depth dropdown options changed from `['10','12','14','16','18','20','22']` to `['16','20','25','30']`.
- Lines dropdown options changed from `['1','2','3','4','5']` to `['3','4','5']`.

- Deep analysis section: added its own Depth (`30`/`40`/`Infinite`, default `30`) and Lines (`3`/`4`/`5`, default `3`) dropdowns, independent of the shared Depth/Lines controls above.
- `startDeepAnalysis`: now reads `deepAnalysisMultiPv`/`deepAnalysisDepth` (instead of the shared `stockfishMultiPv`) and passes the chosen depth cap to `engine.startInfiniteAnalysis`; passes `() => setDeepAnalyzing(false)` as the new `onComplete` callback so the Stop/Resume button correctly reflects "finished" whether the user clicked Stop or the engine auto-completed at the depth cap.
- `ChessBoardViewProps`: added `deepAnalysisDepth`, `deepAnalysisMultiPv`, `onDeepAnalysisDepthChange`, `onDeepAnalysisMultiPvChange`.

### src/app/analyze/page.tsx
- Added `deepAnalysisDepth`/`deepAnalysisMultiPv` state (defaults from `STOCKFISH_DEFAULTS`), passed down to `ChessBoardView` alongside the existing shared Stockfish settings.

### src/lib/stockfish.ts
- `STOCKFISH_DEFAULTS.depth` fallback changed from `16` to `20` to match the new Depth dropdown default.
- Added `STOCKFISH_DEFAULTS.deepAnalysisDepth` (fallback `30`) and `STOCKFISH_DEFAULTS.deepAnalysisMultiPv` (fallback `3`).
- `startInfiniteAnalysis`: new `maxDepth: number | 'infinite'` parameter — sends `go depth N` instead of always `go infinite` unless `'infinite'` is chosen. New optional `onComplete` callback fires when the engine's `bestmove` line arrives, whether from a manual Stop or reaching the depth cap.
- Removed `STOCKFISH_DEFAULTS.multiPv` and `evaluateMultiPV()` — both dead code once the merge below removed their only caller (`fetchMultiPv`).

## Merge: "Analyse Position" + "Deep analyze this position" → one "Analyze Position" feature

### src/ui/board/ChessBoardView.tsx
- Removed `multiPvResults`/`multiPvLoading` state and the `engineBusy` ref (both only used by the now-removed `fetchMultiPv`).
- Removed `fetchMultiPv` entirely; its filter-illegal → dedupe → sort → played-move-reorder-and-highlight logic was ported into `startDeepAnalysis`'s `processUpdate`, now re-applied on every live update from the streaming engine (not just once at the end of a one-shot call), so the actually-played move is still guaranteed visible and highlighted amber even in the merged streaming flow.
- `startDeepAnalysis` rewritten as a single flow (dropped the duplicated engine-init/already-init branches); requests `numLines + 1` lines so the played move has room to appear; still passes `onComplete: () => setDeepAnalyzing(false)`.
- Replaced the `useEffect` that cleared `multiPvResults`/`multiPvLoading` on `[currentNode, explorationMode]` with one that stops analysis (if running) and clears `deepAnalysisData` on any `[currentNode]` change — centralizes the "position changed → drop stale results" rule that used to live only in `handleSelectNode`. `handleSelectNode` simplified back to just `goToNode(node)`.
- Deep Analysis Depth dropdown options changed from `['30','40','Infinite']` to `['20','30','40','Infinite']` (default stays `30`).
- Button renamed "Deep analyze this position" → "Analyze Position"; section renamed from "Deep analysis" to "Analyze Position".
- The static, non-clickable inline line list (depth/cp/move/line divs) was replaced by the reusable `<AlternativeLines results={deepAnalysisData?.lines ?? []} loading={deepAnalyzing && !deepAnalysisData} positionPly={currentPly} onSelectLine={handleSelectPvLine} />` — analysis results are now clickable to explore on the board, same as the old "Analyse Position" output.
- Deleted the old `explorationMode`-gated "Engine lines" block: the separate "Analyse Position" button and its `AlternativeLines` call driven by `multiPvResults` — fully replaced by the merged panel above (now ungated from `explorationMode`).
- Removed the now-unused shared **Lines** dropdown from the "Analyze all moves" settings row (nothing reads `stockfishMultiPv` any more — `runAnalysis` only ever used Depth). Removed `stockfishMultiPv`/`onStockfishMultiPvChange` from `ChessBoardViewProps` and the component signature.

### src/app/analyze/page.tsx
- Removed `stockfishMultiPv` state and the `stockfishMultiPv`/`onStockfishMultiPvChange` props passed to `ChessBoardView`.

## Remove "Explore: ON/OFF" toggle button

### src/ui/board/ChessBoardView.tsx
- Removed the `explorationMode` state entirely (it always defaulted to `true` and nothing ever toggled it false besides the button being removed).
- `handlePieceDrop`: dropped the `!explorationMode` check — piece dragging is now always allowed (still gated on `!tree`).
- Board's `allowDragging` prop changed from `explorationMode` to a fixed `true`.
- Removed the two `setExplorationMode(true)` calls in the mount effect (now-dead resets).
- Removed the "Explore: ON/OFF" `MyButton` from the Stockfish summary row.

## Split "Stockfish" box into "Game Analysis" / "Position Analysis"

### src/ui/board/ChessBoardView.tsx
- The single `<MyBox title='Stockfish'>` wrapping everything (summary, batch Depth/Re-analyze, position Depth/Lines/Resume/stats) is now two boxes: `<MyBox title='Game Analysis'>` (summary + batch Depth + Re-analyze button) and `<MyBox title='Position Analysis'>` (position Depth/Lines + Resume/Stop + stats).
- `<AlternativeLines>` moved from a separate top-level element after the box into the end of the `Position Analysis` box, so its "Engine Lines" results render as a nested sub-section of the box that produced them instead of a disconnected box below.

## Move "Analyzing..." progress/error into "Game Analysis" box

### src/ui/board/ChessBoardView.tsx
- The "Analyzing..." progress `MyBox` (progress bar + move counter, shown while `runAnalysis` is running) and the `analysisError`/Retry block were both separate top-level elements rendered after the "Position Analysis" box. Moved both inside the "Game Analysis" box, right after the Re-analyze button — the progress panel keeps its own nested "Analyzing..." sub-box (matching the Engine Lines precedent); the error block was merged in flat (no title, just text + Retry button) since it's a single line, not worth its own titled sub-box.

## Game Analysis: re-analyze move range (From/To)

### src/ui/board/ChessBoardView.tsx
- Added `fromMove`/`toMove` state (full move numbers, White-anchored), reset to the whole game's range (1 → last full move) whenever a new game/position loads in the mount effect.
- Added `totalFullMoves`/`fullMoveOptions` derived values for populating the range dropdowns.
- Added "From move"/"To move" `MySelect` dropdowns in the "Game Analysis" box, shown only once `evaluations.length > 0` (re-analyze case) — first-time "Analyze all moves" always covers the whole game, per the agreed design.
- `runAnalysis` rewritten: on re-analyze, slices `tree.mainLine` to the selected full-move range (converted to ply indices), anchors the slice's first FEN off the position immediately before the range (or `tree.root.fen` if the range starts at move 1), and calls `engine.analyzeGame` only on that slice — this is what actually saves time on a deep re-analysis instead of always redoing the whole game including move 1.
- Results are merged into the existing `evaluations` array at the correct indices (not replacing it), so evaluations outside the selected range are preserved; `tree.mainLine[i].evaluation` is updated the same way. Removed the `setEvaluations([])` that used to clear everything at the start of every run — stale-but-valid results now stay visible/usable during a partial re-run instead of flashing to "No analysis yet".
- `saveGameEvaluations` is always called with the full merged array, never the partial slice — `saveGameEvaluations` deletes and re-inserts by array position (`games.ts:96`), so saving a partial array would have silently wiped the DB's evaluations for every move outside the re-analyzed range.
- Re-analyze button label reflects the selected range: "Re-analyze all (depth N)" when the range covers the whole game, "Re-analyze moves X–Y (depth N)" when narrowed.
- Explicitly out of scope, discussed and dropped for now: combining this with the position-tree pipeline's `teva_evaluations` table (separate system — no FEN column, no depth column, keyed by deduplicated position not game+move, only covers moves 4–16). Revisit as its own design topic later if wanted.

## tgev_game_evals: replace gev_chesscom_uuid/gev_player with gev_gdid

Table dropped and recreated (SQL run manually by the user in pgAdmin4) — no data preservation
needed since `/analyze` is the table's only reader/writer (verified: no other route, cron job, or
pipeline script references `tgev_game_evals`, confirmed by grep across the whole project). A
"rename the table entirely" idea was raised and then explicitly withdrawn — table name stays
`tgev_game_evals`, only the identifying columns changed.

### src/lib/actions/games.ts
- `saveGameEvaluations(gdid: number, evaluations)` — dropped the `player` string parameter;
  deletes/inserts keyed on `gev_gdid` alone instead of `(gev_chesscom_uuid, gev_player)`.
- `getGameEvals(gdid: number)` — same change, dropped the `player` parameter.

### src/app/analyze/page.tsx
- Renamed the `gameRef` state (was `gd_chesscom_uuid`, a string) to `gdid` (now `gd_gdid`, a
  number) — matching the global "variable naming matches the Data Dictionary value" convention
  added this session. The pre-existing raw URL-param local variable (also previously named
  `gameId`, the string from `searchParams.get('game')`) was renamed to `gdidParam` to free up the
  name for the new numeric state — same underlying concept (this game's ID), different
  representations (raw URL string vs. the resolved numeric `gd_gdid`).
- Updated the `getGameEvals`/`saveGameEvaluations` call sites and the prop passed to
  `ChessBoardView` accordingly.

### src/ui/board/ChessBoardView.tsx
- `ChessBoardViewProps.gameRef?: string` → `gdid?: number`; component signature and the
  `saveGameEvaluations` call site updated to match (also drops `username` as an argument there,
  since `gdid` already implies the player).

### scripts/schema.sql
- `tgev_game_evals` block updated to match the new table: `gev_gdid` replaces
  `gev_chesscom_uuid`/`gev_player` in the same position (right after the PK); unique constraint is
  now `(gev_gdid, gev_move_num)`; single index `idx_tgev_gdid` replaces the old two
  (`idx_tgev_game`, `idx_tgev_player`); identity column no longer carries a hardcoded
  `START WITH`/custom sequence name, since the table was freshly recreated rather than altered.
