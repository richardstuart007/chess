# PLAN_function-headers-and-order — chess

## Title
Run function-headers and function-order on this project

## Plan
- [x] Audit every .ts/.tsx file under src/ (136 files) for: missing main header, helper functions lacking a bordered title/description/Params/Returns header, named `const` arrow functions, and helper/main ordering out of top-down order. Record the per-file findings in Changes.
- [x] function-order pass: convert convertible `const` arrow named functions to `function` declarations (leave useCallback/useMemo and inline prop/argument callbacks as arrows), then reorder out-of-order files (useEffects → main function → helpers by first use). One move/conversion at a time, `npx tsc --noEmit` after each.
- [x] function-headers pass: for files with a single main export, add/reformat the numbered 1)/2)/3) main header (between directive and imports, double-equals border, no fabricated NOTES/CHANGE HISTORY). Multi-export action/utility modules with no single main export keep plain per-function headers.
- [x] function-headers pass (helpers): add title + description + Params/Returns to every helper missing them; leave already-complete headers untouched.
- [x] Multi-export modules (decision: helpers at the bottom is fine): move private helpers below the exports in lib/actions/masterPlayers.ts, lib/analysis/enrichPositionsStockfish.ts, lib/backNav.ts, lib/fide/fidePipeline.ts, lib/fide/fideStaging.ts, lib/master/importHistoricalGames.ts, lib/parsePgn.ts. One move at a time, `npx tsc --noEmit` after each.
- [x] Final `npx tsc --noEmit`, and confirm via `git diff` that changes are comment/ordering only.

## Changes
### Audit (step 1)
- 136 .ts/.tsx files under src/ (excluding .d.ts). 111 already have a numbered main header; 25 don't, and most of those are multi-export action/utility modules with no single main export (correctly left with plain per-function headers).
- Scripted scan (scratchpad, not committed): 67 files need work — ~176 helper functions with no bordered header, ~157 functions with parameters but no `Params:` in their header, 8 files with a non-exported function declared above the first exported one (ordering candidates: masterPlayers.ts, enrichPositionsStockfish.ts, backNav.ts, fidePipeline.ts, fideStaging.ts, importHistoricalGames.ts, parsePgn.ts, PipelineDiagram.tsx). Heaviest: app/owner pipeline pages (~61 missing headers), lib/actions, lib/analysis, ui/board, ui/games.
- 7 `const` arrow-function hits: 4 converted (below); `stockfish.ts` `handler` left as an arrow — its body uses `this.worker`, so a `function` declaration would change `this` binding; `existingDepthRange` in ChessBoardView_shared.tsx / MasterGameView_master.tsx is an IIFE computing a value, not a named function.

### src/app/analyze/page.tsx
- `oppositeResult` converted from a `const` arrow to a `function` declaration (body unchanged)

### src/ui/analysis/PositionDetail.tsx
- `pct` converted from a `const` arrow to a `function` declaration (body unchanged)

### src/ui/charts/RatingChart.tsx
- `tickFormatter` and `labelFormatter` converted from `const` arrows to `function` declarations, moved below the component's `return` (first-use order), each with a full header

### src/ui/dataflow/PipelineDiagram.tsx
- `DiagramNode`, `pos`, `edge` moved below the main `PipelineDiagram` function (first-use order); hoisting keeps the module-scope `NODE_TYPES`/`NODES`/`EDGES` consts working. Existing comment text folded into full bordered headers (Params/Returns added)

### function-headers pass (comment-only changes across 66 files)
- Added or completed a bordered title + description + `Params:`/`Returns:` header on every helper function that lacked one — including functions nested inside effects/components (about 175 missing headers and about 155 missing `Params:` sections found by the audit; re-running the audit afterwards finds none left). Existing headers that already had a description only had `Params:`/`Returns:` merged in; their text was left as-is.
- Existing looser comments were folded into the new bordered header text, not dropped: e.g. the banner-style comments in lib/analysisTree.ts, and the loose comments above `handleSelectOpening`, `handleRefresh` (OpeningScoreChart, TerminationChart, graph), `handleRatingClick`, `buildHref`, `handleMasterClick`, `openMasterGame`, `findNextHandle`, `togglePriority`, `handleRunAll` (pipelinegames).
- Files touched: app/ (analyze, analyzemaster, endings, graph, habits, openings, owner/*), lib/ (actions/*, analysis/*, fide/*, master/*, analysisTree, backNav, chesscom, constants, fen, hooks, logStep, parsePgn, stockfish), ui/ (analysis, board, charts, dataflow, filters, games, player, owner, AppNav, AppShell, HomeDashboard).
- lib/analysis/enrichPositionsStockfish.ts: the file's opening description block sat above `countRemainingPositions` although it describes `enrichPositionsStockfish` (it was evidently left behind when two helpers were added above that function). Moved it onto `enrichPositionsStockfish` and gave `countRemainingPositions` its own header.
- src/ui/board/MiniBoard.tsx: the only single-component file lacking the numbered main header — converted to `1) DESCRIPTION` (Parameters/Returns) + `2) NOTES` (the existing memoization note), positioned between `'use client'` and the imports.
- The 25 files with no numbered main header are otherwise multi-export action/utility modules (or a class file, stockfish.ts) with no single main function, so they keep plain per-function headers (per the function-headers skill).
- Descriptions were written from each function's signature, its existing comments and (for the ones checked) its body; where a behaviour wasn't confirmed in the code the wording is deliberately generic (e.g. "runs every step in order"). Worth a skim in the diff, especially the owner pipeline pages' handlers.
- No `3) CHANGE HISTORY` entries were added (pure audit pass — the skill forbids fabricating history).

### src/app/analyze/page.tsx, src/ui/analysis/PositionDetail.tsx (follow-up to the arrow conversions above)
- Gave the converted nested `oppositeResult` and `pct` full headers; in analyze/page.tsx the comment that used to sit above `oppositeResult` was split — the part about deriving the opposite result went into its header, the "Build a ChessComGame-shaped object…" line stayed above the code it describes.

### Verification
- `npx tsc --noEmit`: clean after every batch and at the end.
- `git diff` with comment and blank lines stripped shows only the four arrow→function conversions, the two moved blocks in RatingChart.tsx and PipelineDiagram.tsx (identical bodies), and nothing else.

### Ordering — multi-export modules (decision: helpers at the bottom is fine)
- Moved every private (non-exported) helper below the last export, keeping each helper's own header and their relative order: lib/backNav.ts (readStack, writeStack), lib/actions/masterPlayers.ts (combineName), lib/fide/fidePipeline.ts (findUnlinkedRowByName), lib/fide/fideStaging.ts (splitFideName), lib/parsePgn.ts (getHeader), lib/master/importHistoricalGames.ts (getHeader, splitIntoGames, splitPgnPlayerName, parseHistoricalDate, resolveHistoricalMasterIdentifiers), lib/analysis/enrichPositionsStockfish.ts (countRemainingPositions, getResultingFensToEvaluate, popularPositionTierSql, getGamesNeedingFinalEval, findExistingEvals — the last three sat between exports, not just above the first). Function declarations hoist, so behaviour is unchanged. `npx tsc --noEmit` clean after each file.

## Testing
- [ ] Open a game on /analyze (from the Games tab) and confirm the game loads and both players' results show correctly (covers the converted oppositeResult)
- [ ] Open a position from Habits (/position/[id]) and confirm the "Your Moves" tab's White% / Draw% / Black% columns still show percentages (covers the converted pct)
- [ ] Open the Graph tab and confirm the rating chart renders, x-axis tick labels look right, and hovering a point shows a full date in the tooltip (covers the converted tickFormatter / labelFormatter)
- [ ] Open /owner/dataflow and confirm the pipeline diagram still renders with all boxes and arrows (covers the reordered DiagramNode / pos / edge)
- [ ] Skim `git diff` for a few of the owner pipeline pages (app/owner/pipeline*/page.tsx) and lib/actions/pipelineStatus.ts and check the new header descriptions read accurately — they were written from signatures and surrounding code, not run
- [ ] Open a page that uses the moved helpers (e.g. Owner > Pipeline > Masters and Historical Games, and the Games tab) and confirm nothing errors
