# PLAN_compact-pipeline-panels — chess

## Title
Compact pipeline step panels: merge title and status onto one row

## Plan
- [x] For each of the 8 step panels on `src/app/owner/pipeline/page.tsx` (Game Sync, Build Game
      Positions, Sync Position Tree, Purge Stale Positions, Evaluate Positions, Update CP Change,
      Build Habits, Evaluate Game Endings): merge the title row (`h3` + `MyHelpStep` + refresh
      button) and the status row (pending/remaining/eligible/total counts + ETA + `StatusBadge` +
      `MyHelp` SQL link) into a single `flex flex-wrap items-center gap-2` row, removing the
      separate `bg-gray-50` bordered block below the title. Status content stays visually grouped
      via a thin separator (e.g. a `·` or `|` span) between the refresh button and the counts,
      consistent across all 8 panels.
- [x] Verify each panel still wraps sensibly on a narrow viewport (`flex-wrap` allows the status
      cluster to drop to a second line if the container is too narrow for one line, rather than
      overflowing)
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision)
Consistent "remaining" label across all 8 panels; real remaining count for Build Habits

## Plan (revision)
- [x] Relabel the status count in 4 panels from their current wording to `remaining` (display text
      only — underlying state field names like `s1.pending`/`s3b.unresolved`/`sPurge.eligible`/
      `sCp.pending` stay as-is, this is a label change not a rename):
      - Step 1 (Game Sync): `pending` → `remaining`
      - Step 3 (Sync Position Tree): `unresolved` → `remaining`
      - Step 4 (Purge Stale Positions): `eligible now` → `remaining`
      - Step 6 (Update CP Change): `to be updated` → `remaining`
      - Steps 2, 5, 8 already say `remaining` — untouched
- [x] Step 7 (Build Habits) gains a genuine `remaining` count — brand-new `(player, position,
      move)` combinations that meet `buildHabits.ts`'s own criteria (`gam_move_num >=
      MIN_ANALYSIS_MOVE`, position color matches player color, reached `HABITS_MIN_REACH_FLOOR`+
      times) but have no corresponding `thab_habits` row yet at all — as opposed to existing
      habits just getting their stats routinely refreshed, which isn't "remaining work" in the
      backlog sense. `pipelineStatus.ts`'s `refreshHabitsStatus()` gains this as a new `remaining`
      field (same aggregation shape as `buildHabits_select`, `LEFT JOIN thab_habits ... WHERE
      hab_habid IS NULL`), keeping `total`/`dismissed` as supplementary context alongside it
- [x] `SQL_STATUS_HABITS` (pipeline page) updated to show the new remaining-count query instead of
      the current total/dismissed-only query
- [x] Step 7's status line: `remaining: N` shown first (consistent position with the other 7
      panels), `total`/`dismissed` kept alongside as extra context
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 2)
Batch the Evaluate Game Endings reuse lookup; add skipCache: true across the whole pipeline subsystem

## Plan (revision 2)
Full audit confirmed a widespread pre-existing bug: `table_query` caches every read by default
(no expiry — in-memory, cleared only by server restart), and nearly every pipeline/maintenance
status or backlog read across this codebase was missing `skipCache: true`. Two findings are
especially severe: `resolvePipRunId`'s queries are fully static (no varying params), so runs could
be logged under a stale, non-incrementing run ID indefinitely; `buildHabits_select`'s params
(`MIN_ANALYSIS_MOVE`, `HABITS_MIN_REACH_FLOOR`) never change, so Build Habits could have been
silently recomputing from the same stale dataset every run, never seeing newly-synced games.

- [x] `enrichPositionsStockfish.ts`: replace the per-game `findExistingEval` loop with a single
      batched `findExistingEvals(truncatedFens[], level)` — one `pos_fen IN (...)` lookup for the
      whole run's distinct final positions (same pattern as `getMovePlayCounts`), instead of one
      round trip per game. Also batch the reuse `UPDATE` writes into one chunked multi-row
      `UPDATE ... FROM (VALUES ...)` statement (chunked via `POSITION_INSERT_CHUNK_SIZE`, mirroring
      `insertGamePositions`'s pattern) instead of one `UPDATE` per game
- [x] Add `skipCache: true` to every read identified in the audit:
      - `pipelineStatus.ts`: `getPipelineStatus`, `refreshStep1`, `refreshStep3`,
        `refreshTposStatus`, `refreshStep4`, `refreshCpChangeStatus`, `refreshHabitsStatus`,
        `refreshGameEndingsStatus`, `refreshPurgeStatus`
      - `pipelineLog.ts`: `resolvePipRunId` (both query branches), `getPipelineRates`,
        `getLatestPipelineRuns`
      - `buildPositionTree.ts`: `backlogRes`, `gamesRes`, `snapRes`
      - `enrichPositionsStockfish.ts`: `countRemainingPositions`, `getResultingFensToEvaluate`,
        `posRes` (in `enrichPositionsStockfish`), the new `findExistingEvals`,
        `getGamesNeedingFinalEval`, and the remaining-count query in `evaluateGameEndings`
      - `buildHabits.ts`: `buildHabits_select`
      - `chessdb.ts`: `getPositionsToEvaluate` (both branches)
- [x] `purgePositions.ts` confirmed already clean (every call is a write, `isupdate: true` already
      bypasses cache) — no changes needed there
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes

### src/app/owner/pipeline/page.tsx
- All 8 step panels (Game Sync, Build Game Positions, Sync Position Tree, Purge Stale Positions,
  Evaluate Positions, Update CP Change, Build Habits, Evaluate Game Endings): merged the title row
  (`h3` + `MyHelpStep` + refresh button) and the status row (pending/remaining/eligible/total +
  ETA + `StatusBadge` + `MyHelp` SQL link) into one `flex flex-wrap items-center gap-2` row,
  separated by a `·` span after the refresh button. Removed the separate `bg-gray-50` bordered
  status block under each title. `flex-wrap` lets the status cluster drop to a second line on
  narrow viewports instead of overflowing.

### src/lib/analysis/enrichPositionsStockfish.ts (revision 2)
- `evaluateGameEndings`'s Phase 1 restructured: PGN replay stays per-game (in-memory, no DB calls),
  but the exact-match reuse lookup is now one batched `findExistingEvals()` call (`pos_fen IN
  (...)`) across every distinct final position in the run, and reuse writes are now one chunked
  multi-row `UPDATE ... FROM (VALUES ...)` per `POSITION_INSERT_CHUNK_SIZE` chunk — replacing what
  was one query + one UPDATE per game (up to hundreds of rapid sequential round trips per run,
  which was tripping a connection reset under load).
- Added `skipCache: true` to every read: `countRemainingPositions`, `getResultingFensToEvaluate`,
  `posRes` (in `enrichPositionsStockfish`), `findExistingEvals`, `getGamesNeedingFinalEval`, and
  `evaluateGameEndings`'s remaining-count query.

### src/lib/actions/pipelineStatus.ts (revision 2)
- Added `skipCache: true` to all 9 functions (`getPipelineStatus`, `refreshStep1`, `refreshStep3`,
  `refreshTposStatus`, `refreshStep4`, `refreshCpChangeStatus`, `refreshHabitsStatus`,
  `refreshGameEndingsStatus`, `refreshPurgeStatus`) — previously every one of these cached
  indefinitely (no cache expiry), so the pipeline page's status/refresh buttons could have been
  showing stale counts since the first call in the server process's lifetime.

### src/lib/actions/pipelineLog.ts (revision 2)
- Added `skipCache: true` to `resolvePipRunId` (both query branches — this one was especially
  severe, since both branches are fully static with no varying params, risking every pipeline run
  being logged under the same non-incrementing run ID), `getPipelineRates`, `getLatestPipelineRuns`.

### src/lib/analysis/buildPositionTree.ts (revision 2)
- Added `skipCache: true` to `backlogRes`, `gamesRes`, `snapRes`.

### src/lib/analysis/buildHabits.ts (revision 2)
- Added `skipCache: true` to `buildHabits_select` — this one was also especially severe, since its
  params (`MIN_ANALYSIS_MOVE`, `HABITS_MIN_REACH_FLOOR`) never change between runs, risking Build
  Habits silently recomputing from the same stale dataset every run, never seeing newly-synced
  games.

### src/lib/analysis/chessdb.ts (revision 2)
- Added `skipCache: true` to both branches of `getPositionsToEvaluate` (used by the browser-side
  EvalProgress evaluator).

### src/app/owner/pipeline/page.tsx (revision)
- Relabeled 4 panels' status count to `remaining`: Game Sync (`pending`), Sync Position Tree
  (`unresolved`), Purge Stale Positions (`eligible now`), Update CP Change (`to be updated`).
  Display text only — underlying state field names unchanged.
- Step 7 (Build Habits): status line now shows `remaining: N` first (with a `StatusBadge`, matching
  every other panel), `total`/`dismissed` kept alongside as extra context. `SQL_STATUS_HABITS`
  rewritten to show the new remaining-count query. `sHabits` state type gained `remaining`.

### src/lib/actions/pipelineStatus.ts (revision)
- `refreshHabitsStatus()` gained a genuine `remaining` count — brand-new `(player, position, move)`
  combinations meeting `buildHabits.ts`'s own criteria (`gam_move_num >= MIN_ANALYSIS_MOVE`, color
  match, `HABITS_MIN_REACH_FLOOR`+ reach) with no `thab_habits` row yet, via a `WITH candidates ...
  LEFT JOIN thab_habits ... WHERE hab_habid IS NULL` query — same aggregation shape
  `buildHabits_select` already runs, plus the existence check. `total`/`dismissed` unchanged.

## Title (revision 3)
Fix "Games — <move>" / "Game History" ordering: gd_gdid doesn't correlate with game date

## Plan (revision 3)
Confirmed via live data: `gd_gdid` (the surrogate `IDENTITY` key) does **not** correlate with
actual chronological game date — a panel ordered `gd_gdid DESC` showed dates running from
2012 to 2025 in *ascending* order (lowest ID = most recent game, highest ID = oldest). The
"latest game first" ordering added in an earlier revision was wrong for both panels that use it.

- [x] `chessdb.ts`'s `getGamesForPosition`: `ORDER BY d.gd_gdid DESC` → `ORDER BY d.gd_end_time DESC`
      (the actual game timestamp — genuine chronological latest-first)
- [x] `chessdb.ts`'s `getPositionDetail`'s games query: same fix, `ORDER BY d.gd_gdid DESC` →
      `ORDER BY d.gd_end_time DESC` (same wrong assumption was applied there too)
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 3)

### src/lib/analysis/chessdb.ts
- `getGamesForPosition` and `getPositionDetail`'s games query: `ORDER BY d.gd_gdid DESC` →
  `ORDER BY d.gd_end_time DESC` in both — the surrogate ID doesn't correlate with actual game date,
  confirmed via live data (lowest ID was the most recent game, highest ID the oldest).

## Title (revision 4)
Build Habits panel: drop total/dismissed, show only remaining

## Plan (revision 4)
- [x] `src/app/owner/pipeline/page.tsx`'s Step 7 status line: remove the `total: <strong>...`  and
      `dismissed: <strong>...` spans entirely — `remaining: N` (with its `StatusBadge`) is the only
      count shown, matching every other panel's single-count format
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 5)
"Games — <move>" panel: highlight rows where the result contradicts the final position

## Plan (revision 5)
Convert `gd_final_eval` (always White's-perspective) to the tracked player's own perspective via
`gd_player_color`, then flag a row when the recorded result contradicts a decisive final position —
either direction: lost despite a winning final position (the classic timeout-while-winning case),
or won despite a losing one (opponent likely resigned/timed out from a bad spot). Threshold ±200cp.
Whole-row light-pink highlight, not just one cell.

- [x] `constants.ts`: add `RESULT_MISMATCH_CP_THRESHOLD = 200`
- [x] `chessdb.ts`: `getGamesForPosition`'s query adds `d.gd_player_color` to the SELECT list;
      `PositionGameHit` gains `resultMismatch: boolean`, computed in the mapping:
      `playerEval = gd_player_color === 'black' ? -finalEval : finalEval`, then
      `resultMismatch = finalEval != null && ((result === 'loss' && playerEval >=
      RESULT_MISMATCH_CP_THRESHOLD) || (result === 'win' && playerEval <=
      -RESULT_MISMATCH_CP_THRESHOLD))`
- [x] `ChessBoardView.tsx`'s "Games — `<move>`" table: each `<tr>` gets `bg-pink-50` (and a
      `hover:bg-pink-100` in place of the usual `hover:bg-gray-50`) when `g.resultMismatch` is true
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 6)
"Games — <move>" panel: reorder columns

## Plan (revision 6)
- [x] `ChessBoardView.tsx`'s "Games — `<move>`" table: reorder columns (header row + each `<td>`)
      from the current Result / Date / Opp Rating / Termination / Final Eval / Game to Date / Game /
      Opp Rating / Termination / Final Eval / Result
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 4)

### src/app/owner/pipeline/page.tsx
- Step 7 (Build Habits) status line: removed the `total`/`dismissed` spans — `remaining: N` (with
  its `StatusBadge`) is now the only count shown, matching every other panel.

## Changes (revision 5)

### src/lib/constants.ts
- Added `RESULT_MISMATCH_CP_THRESHOLD = 200`.

### src/lib/analysis/chessdb.ts
- `getGamesForPosition`'s query adds `d.gd_player_color`; `PositionGameHit` gains
  `resultMismatch: boolean`, computed by converting `gd_final_eval` to the tracked player's own
  perspective and flagging a decisive (±200cp) contradiction with the recorded result, either
  direction (lost while winning, or won while losing).

### src/ui/board/ChessBoardView.tsx (revision 5)
- "Games — `<move>`" table: each row gets a light-pink background (`bg-pink-50` /
  `hover:bg-pink-100`) when `resultMismatch` is true.

## Changes (revision 6)

### src/ui/board/ChessBoardView.tsx (revision 6)
- "Games — `<move>`" table: column order changed from Result / Date / Opp Rating / Termination /
  Final Eval / Game to Date / Game / Opp Rating / Termination / Final Eval / Result.

## Title (revision 7)
Split the single result-mismatch highlight into two distinct scenarios/colors

## Plan (revision 7)
- [x] `src/lib/analysis/chessdb.ts`: change `PositionGameHit.resultMismatch` from `boolean` to
      `'lostWinning' | 'wonLosing' | null` (mutually exclusive — a game is never both). In
      `getGamesForPosition`'s mapping, compute it as `'lostWinning'` when `result === 'loss' &&
      playerEval >= RESULT_MISMATCH_CP_THRESHOLD`, `'wonLosing'` when `result === 'win' &&
      playerEval <= -RESULT_MISMATCH_CP_THRESHOLD`, else `null`.
- [x] `src/ui/board/ChessBoardView.tsx`: "Games — `<move>`" table row highlight — pink
      (`bg-pink-50`/`hover:bg-pink-100`) for `'lostWinning'` (player was winning but the recorded
      result is a loss), yellow (`bg-yellow-50`/`hover:bg-yellow-100`) for `'wonLosing'` (player was
      losing but the recorded result is a win), no highlight otherwise.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 7)

### src/lib/analysis/chessdb.ts (revision 7)
- `PositionGameHit.resultMismatch` changed from `boolean` to `'lostWinning' | 'wonLosing' | null`.
- `getGamesForPosition`'s mapping now distinguishes the two mismatch directions instead of
  collapsing both into one flag.

### src/ui/board/ChessBoardView.tsx (revision 7)
- "Games — `<move>`" table row highlight split into two colors: pink (`bg-pink-50`/
  `hover:bg-pink-100`) for `lostWinning`, yellow (`bg-yellow-50`/`hover:bg-yellow-100`) for
  `wonLosing`, no highlight otherwise.

## Title (revision 8)
Scope "Moves From This Position" (Times/Win%/Eval) to the current player, matching the Games panel

## Plan (revision 8)
Confirmed mismatch: `getMoveSummaryForPosition` aggregates Times/Win%/Eval across all tracked
players, while `getGamesForPosition` (the Games panel underneath) was already scoped to just the
current player — so a move's "Times" count could be far higher than the number of games actually
listed below it. User chose to scope the Moves panel to the current player to match.

- [x] `src/lib/analysis/chessdb.ts`: add a `player: string` parameter to
      `getMoveSummaryForPosition(fen, player)`, add `AND d.gd_player = $2` to its WHERE clause
      (param `player.toLowerCase()`), same pattern as `getGamesForPosition`/`getMovePlayCounts`.
- [x] `src/ui/board/ChessBoardView.tsx`: pass `username` into `getMoveSummaryForPosition(fen,
      username)`, add `username` to that effect's dependency array (`[currentNode, tree,
      username]`).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 8)

### src/lib/analysis/chessdb.ts (revision 8)
- `getMoveSummaryForPosition` gained a `player: string` parameter and `AND d.gd_player = $2` filter,
  scoping Times/Win%/Eval to the current player instead of aggregating across all tracked players.

### src/ui/board/ChessBoardView.tsx (revision 8)
- Passes `username` into `getMoveSummaryForPosition(fen, username)`; added `username` to that
  effect's dependency array.

## Title (revision 9)
Scope the Games panel query to the selected move, so POSITION_GAMES_LIMIT applies per-move

## Plan (revision 9)
Root cause found: `getGamesForPosition` fetches up to `POSITION_GAMES_LIMIT` (50) games for the
*whole position across every move combined*, ordered by date, and the Games panel then filters
that result client-side by the clicked move. For a position with well over 50 total games across
all its moves, the 50-row budget gets eaten by whichever moves happen to have the most recent
games, silently undercounting less-recently-played moves (observed: Bd6 shows 23 in "Moves From
This Position" but only 10 games listed, because 113 other games for other moves at this same
position pushed 13 of Bd6's own games out of the date-ordered top 50). Fix: scope the query to the
selected move. User explicitly declined to repurpose `POSITION_GAMES_LIMIT` (a whole-position cap)
into a per-move cap — chose no cap at all on the per-move query for now, since a single move's game
count is unlikely to be huge. `POSITION_GAMES_LIMIT` becomes unused after this change and is
removed from `src/lib/constants.ts`.

- [x] `src/lib/analysis/chessdb.ts`: add a required `move: string` parameter to
      `getGamesForPosition(fen, player, move, excludeGdid?)`, add `AND gp.gam_move_played = $3` to
      its WHERE clause (renumbering the optional `excludeGdid` placeholder after it). Drop the
      `LIMIT ${POSITION_GAMES_LIMIT}` clause entirely (no cap) and its now-unused import.
- [x] `src/lib/constants.ts`: remove the now-unused `POSITION_GAMES_LIMIT` constant and its comment
      block.
- [x] `src/ui/board/ChessBoardView.tsx`: change the "Games From This Position" effect to fetch only
      when `selectedPositionMove` is set (clearing `positionGames` to `[]` when it's `null`),
      keyed on `[selectedPositionMove, currentNode, tree, gdid, username]`, calling
      `getGamesForPosition(fen, username, selectedPositionMove, gdid)`. Remove the client-side
      `.filter(g => g.move_played === selectedPositionMove)` in the Games panel render — the
      fetched array is already scoped to that move, so it renders `positionGames` directly.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 9)

### src/lib/analysis/chessdb.ts (revision 9)
- `getGamesForPosition` gained a required `move: string` parameter and `AND gp.gam_move_played =
  $3` filter; the `LIMIT ${POSITION_GAMES_LIMIT}` clause and its import were removed (no cap).

### src/lib/constants.ts (revision 9)
- Removed the now-unused `POSITION_GAMES_LIMIT` constant and its comment block.

### src/ui/board/ChessBoardView.tsx (revision 9)
- "Games From This Position" effect now fetches only when `selectedPositionMove` is set, scoped to
  that move via `getGamesForPosition(fen, username, selectedPositionMove, gdid)`.
- Removed the client-side `.filter(g => g.move_played === selectedPositionMove)` — the fetched
  array is already scoped to the selected move.

## Title (revision 10)
Draws from a winning position also flagged pink; darken the pink shade

## Plan (revision 10)
User decision: a draw reached from a decisive winning final position (per `gd_final_eval`) shares
the same `lostWinning` pink category as an outright loss from a winning position — both mean "the
winning position wasn't converted to a win." The pink shade also becomes one step darker
(`bg-pink-50`/`hover:bg-pink-100` → `bg-pink-100`/`hover:bg-pink-200`).

- [x] `src/lib/analysis/chessdb.ts`: in `getGamesForPosition`'s mapping, change the `lostWinning`
      condition from `result === 'loss' && playerEval >= RESULT_MISMATCH_CP_THRESHOLD` to
      `(result === 'loss' || result === 'draw') && playerEval >= RESULT_MISMATCH_CP_THRESHOLD`.
- [x] `src/ui/board/ChessBoardView.tsx`: darken the `lostWinning` row highlight from
      `bg-pink-50 hover:bg-pink-100` to `bg-pink-100 hover:bg-pink-200`.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 10)

### src/lib/analysis/chessdb.ts (revision 10)
- `lostWinning` now also triggers on a draw (in addition to a loss) from a decisive winning final
  position.

### src/ui/board/ChessBoardView.tsx (revision 10)
- `lostWinning` row highlight darkened from `bg-pink-50 hover:bg-pink-100` to
  `bg-pink-100 hover:bg-pink-200`.

## Title (revision 11)
Unify Game Analysis and Position Analysis depth options; default both to 24

## Plan (revision 11)
Game Analysis's Depth dropdown (`['16', '20', '25', '30']`, default via `NEXT_PUBLIC_STOCKFISH_DEPTH`,
currently `16` in `.env`) and Position Analysis's Depth dropdown (`['20', '22', '24', '26', '28',
'30', '40']`, default via `NEXT_PUBLIC_STOCKFISH_DEEP_ANALYSIS_DEPTH`, currently unset so falls back
to the hardcoded `30` in `stockfish.ts`) become the same option list, both defaulting to `24`.

- [x] `src/ui/board/ChessBoardView.tsx`: change Game Analysis's Depth `MySelect` options from
      `['16', '20', '25', '30']` to `['20', '22', '24', '26', '28', '30', '40']` (matching Position
      Analysis exactly).
- [x] `.env`: change `NEXT_PUBLIC_STOCKFISH_DEPTH` from `16` to `24` — this env var currently
      overrides `STOCKFISH_DEFAULTS.depth`'s hardcoded fallback, so the fallback alone wouldn't take
      effect without this change.
- [x] `src/lib/stockfish.ts`: change `STOCKFISH_DEFAULTS.depth`'s hardcoded fallback from `'20'` to
      `'24'` (keeps the code default in sync with the agreed value, in case the env var is ever
      unset) and `STOCKFISH_DEFAULTS.deepAnalysisDepth`'s hardcoded fallback from `'30'` to `'24'`
      (no `.env` entry currently overrides this one, so this change takes effect directly).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 12)
Remove the redundant per-line "check" (move play count) button from Engine Lines

## Plan (revision 12)
User decision: the "Moves From This Position" panel already shows Times/Win%/Eval for every move
actually played from a position, making each Engine Line's on-demand "check" button (`MoveCountCheck`
in `AlternativeLines.tsx`) redundant for that common case. Accepted losing the one edge case it
covered (a candidate move never played at all, which "check" could reveal as `(0)`) in exchange for
a simpler, less cluttered Engine Lines row.

- [x] `src/ui/board/AlternativeLines.tsx`: remove the `MoveCountCheck` function, its usage in the
      results row, the now-unused `getMovePlayCount` import, and the now-unused `positionFen`/
      `username` props (and their destructuring) from `AlternativeLinesProps`.
- [x] `src/ui/board/ChessBoardView.tsx`: remove the now-unused `positionFen`/`username` props from
      the `<AlternativeLines>` call site.
- [x] `src/lib/analysis/chessdb.ts`: remove the now-unused `getMovePlayCount` export (no remaining
      callers after the above).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 13)
"Save Analysis" button — push every displayed Engine Line's evaluation into teva_evaluations

## Plan (revision 13)
Currently only one row ever gets upgraded when Position Analysis stops: the current ("before")
position's own `teva_evaluations` row, using only the top engine line
(`ChessBoardView.tsx:495`). None of the other displayed Engine Lines' *resulting* positions (the
positions shown in "Moves From This Position") are ever written back, so that panel can stay stuck
at an old, shallower depth even after a much deeper live analysis has been run and displayed.

User decision: rather than doing this automatically every time analysis stops (background cost,
harder to reason about), add an explicit "Save Analysis" button that saves the currently-displayed
Engine Lines on demand. Scope explicitly excludes `thab_habits`: `getHabitsData`'s displayed eval
already reads live from `teva_evaluations` via `hab_resulting_pos_id`
(`chessdb.ts:544`), so it benefits automatically with no extra work; the frozen `hab_move_cp`
column (used only for the good/bad quality filter and sort order) is intentionally left stale until
the next full Build Habits run — not addressed by this change.

- [x] `src/ui/board/ChessBoardView.tsx`: add a "Save Analysis" button to the Position Analysis box
      (near the Depth/Lines controls), enabled whenever `deepAnalysisData` has at least one line
      (available regardless of whether the search is still running or has stopped — reflects
      whatever's currently displayed). On click, for each line in `deepAnalysisData.lines`:
      compute the resulting FEN by applying `line.bestMoveUci` to the current position via
      `chess.js` (same from/to/promotion parsing pattern as `uciToSan` in `stockfish.ts`), then call
      `upgradePositionEvaluation({ fen: resultingFen, cp: line.cp, bestMove: line.lineUci[1] ?? null,
      depth: deepAnalysisData.depth })`. Existing depth-guard (only upgrades if deeper) and
      cp_change cascade in `upgradePositionEvaluation` apply unchanged — no changes needed there.
      Await all calls (`Promise.all`), then show a brief status message (e.g. "Updated N of M
      positions") using a new local state var, following the existing `saveMessage` pattern already
      used elsewhere in this component.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 11)

### src/ui/board/ChessBoardView.tsx (revision 11)
- Game Analysis's Depth options changed from `['16', '20', '25', '30']` to `['20', '22', '24', '26',
  '28', '30', '40']`, matching Position Analysis.

### .env (revision 11)
- `NEXT_PUBLIC_STOCKFISH_DEPTH` changed from `16` to `24`.

### src/lib/stockfish.ts (revision 11)
- `STOCKFISH_DEFAULTS.depth`'s hardcoded fallback changed from `'20'` to `'24'`;
  `STOCKFISH_DEFAULTS.deepAnalysisDepth`'s hardcoded fallback changed from `'30'` to `'24'`.

## Changes (revision 12)

### src/ui/board/AlternativeLines.tsx (revision 12)
- Removed `MoveCountCheck`, its usage in the results row, the `getMovePlayCount` import, `useState`
  import (no longer needed), and the `positionFen`/`username` props.

### src/ui/board/ChessBoardView.tsx (revision 12)
- Removed the now-unused `positionFen`/`username` props from the `<AlternativeLines>` call site.

### src/lib/analysis/chessdb.ts (revision 12)
- Removed the now-unused `getMovePlayCount` export and updated two stale comment references to it.

## Changes (revision 13)

### src/ui/board/ChessBoardView.tsx (revision 13)
- Added `savingAnalysis`/`saveAnalysisMessage` state and `saveDeepAnalysisLines()`, which computes
  each displayed Engine Line's resulting FEN and calls `upgradePositionEvaluation` for it.
- Added a "Save Analysis" button + status message to the Position Analysis box.

## Title (revision 14)
Include the current game in the Games panel, marked as current, so the count matches "Times"

## Plan (revision 14)
`getGamesForPosition` currently excludes the currently-open game (via `excludeGdid`), so the "Games
— <move>" panel's row count is always one less than "Moves From This Position"'s Times count for
whichever move the current game actually played. User decision: stop excluding it — show it like any
other game, just visually marked as the current one.

- [x] `src/lib/analysis/chessdb.ts`: remove `getGamesForPosition`'s `excludeGdid` parameter and its
      `excludeFilter` SQL clause entirely (no longer used once nothing excludes the current game).
- [x] `src/ui/board/ChessBoardView.tsx`: stop passing `gdid` as the exclusion argument to
      `getGamesForPosition(fen, username, selectedPositionMove)` (drop the 4th argument). In the
      Games panel row render, mark the row where `g.gameId === gdid` as current — add a small
      `(current)` label next to the Game number (not a background color, so it doesn't interfere
      with the existing pink/yellow `resultMismatch` highlighting on the same row).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 14)

### src/lib/analysis/chessdb.ts (revision 14)
- Removed `getGamesForPosition`'s `excludeGdid` parameter and its `excludeFilter` SQL clause.

### src/ui/board/ChessBoardView.tsx (revision 14)
- `getGamesForPosition` call no longer excludes the current game; removed unused `gdid` from that
  effect's dependency array.
- Games panel row now shows `(current)` next to the Game number when `g.gameId === gdid`.

## Title (revision 15)
Clear the relevant table cache when upgradePositionEvaluation actually upgrades a row

## Plan (revision 15)
Confirmed via direct DB query: "Save Analysis" correctly upgrades `teva_evaluations` (the Ne7
example's row is genuinely at depth 24, +0.01, matching Engine Lines exactly). The UI still showed
the old +0.09 because `getMoveSummaryForPosition` (and other display reads joining
`teva_evaluations`) cache their result with no expiry, and nothing invalidates that cache when
`upgradePositionEvaluation` writes. `nextjs-shared` already exports a purpose-built
`cache_clearTable(tableName)` (`userCache_store.ts`) that clears every cached entry referencing a
given table — reuse that rather than adding `skipCache: true` to the display reads (which would
lose caching for the common, non-just-analyzed case).

- [x] `src/lib/analysis/chessdb.ts`: import `cache_clearTable` from `nextjs-shared/userCache_store`.
      In `upgradePositionEvaluation`, after a successful upgrade (`updated.length > 0`, right after
      the `gam_cp_change` recompute step), call `cache_clearTable('teva_evaluations')` and
      `cache_clearTable('tgam_game_positions')` — covers every display read that joins either table
      (Moves From This Position, Games panel, Position Detail, Habits), and applies to both existing
      callers of `upgradePositionEvaluation` (the per-game "Analyze Game" upgrade and the new "Save
      Analysis" button), not just one of them.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 15)

### src/lib/analysis/chessdb.ts (revision 15)
- Imported `cache_clearTable` from `nextjs-shared/userCache_store`.
- `upgradePositionEvaluation` now clears the `teva_evaluations` and `tgam_game_positions` cache
  entries after a successful upgrade, so display reads (Moves From This Position, Games panel,
  Position Detail, Habits) reflect the upgraded value immediately instead of a stale cached copy.

## Title (revision 16)
Re-fetch Moves/Games after Save Analysis; show tgev depth; guard re-analyze against downgrades;
push the final resulting position of a Game Analysis run into teva too

## Plan (revision 16)
Four related fixes discovered while testing the Save Analysis / re-analyze flow:

1. **Save Analysis didn't visibly update the panels** — confirmed via direct DB query that the
   write and cache-clear (revision 15) both worked correctly; the real gap is that "Moves From This
   Position" (`moveSummary`) and the Games panel (`positionGames`) are React state that only
   re-fetches when `[currentNode, tree, username]` change — clicking "Save Analysis" changes none
   of those, so the client never re-requests the now-fresh data.
2. **`tgev_game_evals` has no depth guard at all**, unlike `teva_evaluations` — re-analyzing at a
   shallower depth than what's already saved silently downgrades the Move Tree display for that
   range. User decision: mirror teva's own guard — skip overwriting (in both `merged` state and the
   saved DB rows) any ply whose existing depth is already `>=` the new run's depth, and report how
   many plies were actually updated vs skipped, same status-message pattern as Save Analysis.
   Requires showing the *existing* depth on the panel first, so the guard's behavior is visible
   before re-analyzing.
3. **The final resulting position of a Game Analysis run is never pushed to `teva_evaluations`.**
   The existing loop only ever calls `upgradePositionEvaluation` with each move's *before* position
   (chained: ply i's before = ply i-1's after), so every position in the range gets covered except
   the very last one (nothing after it supplies a "before" reference for it). `analyzeGame` already
   computes this position's own cp/best move internally (`positionEvals[positionEvals.length - 1]`)
   but never returns it.

- [x] `src/ui/board/ChessBoardView.tsx`: after `saveDeepAnalysisLines()` completes, re-run the same
      fetch logic used by the `moveSummary` and `positionGames` effects for the current
      fen/username/selectedPositionMove (simplest: extract each effect's fetch body into a small
      local function and call it both from the effect and from `saveDeepAnalysisLines`'s completion).
- [x] `src/lib/stockfish.ts`: change `analyzeGame`'s return type from `MoveEvaluation[]` to
      `{ evaluations: MoveEvaluation[]; finalPosition: { fen: string; cp: number; bestMove: string } }`,
      populating `finalPosition` from `fens[fens.length - 1]` and `positionEvals[positionEvals.length - 1]`.
- [x] `src/ui/board/ChessBoardView.tsx` (`runAnalysis`): destructure `{ evaluations: results,
      finalPosition }` from the new return shape. Change the `merged`-building loop to skip
      overwriting (both `merged[idx]` and `tree.mainLine[idx].evaluation`) any ply whose existing
      `.depth` is `>= results[i].depth`, counting updated vs skipped plies. After the existing
      per-move `upgradePositionEvaluation` loop, add one more call for `finalPosition` (same guarded
      upgrade, no special-casing needed beyond what `upgradePositionEvaluation` already does). Show
      a status message (e.g. "Updated N plies, kept M at deeper depth") using a new local state var.
- [x] `src/ui/board/ChessBoardView.tsx`: near the Depth selector in the Game Analysis box, when
      `evaluations.length > 0`, show the existing saved depth for the currently-selected From/To
      range (single value if uniform across that range, `min–max` if mixed).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 17)
"Update Positions" button — push the whole game's already-saved tgev_game_evals into teva_evaluations

## Plan (revision 17)
The automatic per-move `upgradePositionEvaluation` loop in `runAnalysis()` only ever processes
plies from a run that just happened. Nothing re-syncs an already-saved `tgev_game_evals` record
analyzed in the past (before this mechanism existed, or where a push silently failed/was skipped
because the position wasn't tracked in `tpos_positions` yet at the time). Since `evaluations`
(loaded via `getGameEvals`) already holds every ply's own `fenBefore`/`cpBefore`/`bestMove`/`depth`,
this is a pure DB-to-DB sync — no new Stockfish run required.

- [x] `src/ui/board/ChessBoardView.tsx`: add an "Update Positions" button to the Game Analysis box,
      enabled whenever `evaluations.length > 0` (independent of whether a re-analysis just ran).
      On click, for every ply in `evaluations`, call `upgradePositionEvaluation({ fen:
      e.fenBefore, cp: e.cpBefore, bestMove: e.bestMove, depth: e.depth })` (each ply's own stored
      depth, since different plies may have been saved at different depths over time — not a
      single shared depth like a live run). Also push the game's final position (last ply's `fen`/
      `cp`, `bestMove: null` — no "best move" is known for it, since nothing was ever searched from
      there). Await all (`Promise.all`), then show a status message ("Updated N of M positions"),
      following the same pattern as the Position Analysis "Save Analysis" button. Also call the
      shared Moves/Games re-fetch function (see revision 16, step 1) on completion — this button
      has the exact same client-refresh gap Save Analysis had, since it doesn't touch
      `currentNode`/`tree` either.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 18)
"Save Analysis" also pushes the played line back into tgev_game_evals for the current ply

## Plan (revision 18)
Gap found while checking cross-consistency of all three evaluation sources (`teva_evaluations`,
`tgev_game_evals` from Game Analysis, and Position Analysis's live Engine Lines): "Save Analysis"
only ever writes to the shared `teva_evaluations` table. One of its displayed lines is always the
actual move played in this game (marked `_isActualMove`), whose resulting position is exactly
`tree.mainLine[currentPly]` — the same ply tracked in `tgev_game_evals`. Right now that ply's Move
Tree display never learns about the deeper Position Analysis result, even though the shared
position table now knows it. User confirmed a scoped fix: update only `gev_cp`/`gev_depth` for that
one ply (not `gev_best_move` — that field describes the engine's recommendation *from the position
before* this move, an unrelated piece of data that Position Analysis, run on the *resulting*
position, has no bearing on).

- [x] `src/lib/actions/games.ts`: add `upgradeGameEval(gdid, ply, cp, depth)` — a guarded single-row
      update mirroring `upgradePositionEvaluation`'s pattern (`table_query`, since the `gev_depth <
      $2` comparison doesn't fit `table_update`'s equality-only where clauses):
      `UPDATE tgev_game_evals SET gev_cp = $1, gev_depth = $2 WHERE gev_gdid = $3 AND gev_ply = $4
      AND gev_depth < $2 RETURNING gev_gdid`. Returns whether it actually upgraded.
- [x] `src/ui/board/ChessBoardView.tsx` (`saveDeepAnalysisLines`): identify the line where
      `(line as any)._isActualMove === true`. If found, `gdid` is set, and `currentPly <
      evaluations.length`, call `upgradeGameEval(gdid, currentPly, line.cp, deepAnalysisData.depth)`.
      If it returns true, recompute that ply's `cpChange`/`cpLoss`/`classification` from the
      existing stored `cpBefore` (unchanged) and the new `cp` (`isWhiteMove = currentPly % 2 === 0`,
      same formula as `analyzeGame`), update `evaluations[currentPly]` and
      `tree.mainLine[currentPly].evaluation`, and call `setTree({ ...tree })` — this also naturally
      re-triggers the Moves/Games panel re-fetch effects (they depend on `tree`), same as a full
      Game Analysis run already does.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 16)

### src/lib/stockfish.ts (revision 16)
- `analyzeGame` now returns `{ evaluations, finalPosition }` instead of a bare array — `finalPosition`
  exposes the last position's own cp/best move, previously computed internally but never returned.

### src/ui/board/ChessBoardView.tsx (revision 16)
- Added `refreshPositionPanels()`, re-fetching Moves From This Position / Games panel for whatever's
  currently displayed — called from `saveDeepAnalysisLines`.
- `runAnalysis` destructures `{ evaluations: results, finalPosition }`; the merge loop now skips any
  ply whose existing depth is already `>=` the new run's depth, reporting updated-vs-skipped counts
  via a new `analysisResultMessage` state. Also pushes `finalPosition` through
  `upgradePositionEvaluation` after the existing per-move loop.
- Added `existingDepthRange`, showing the saved depth (or `min–max` if mixed) for the currently
  selected From/To range next to the Depth selector.

## Changes (revision 17)

### src/ui/board/ChessBoardView.tsx (revision 17)
- Added `updateAllPositions()` and an "Update Positions" button in the Game Analysis box — pushes
  every ply in `evaluations` (plus the game's final position) through `upgradePositionEvaluation`,
  shows an "Updated N of M positions" message, then calls `refreshPositionPanels()`.

## Changes (revision 18)

### src/lib/actions/games.ts (revision 18)
- Added `upgradeGameEval(gdid, ply, cp, depth)` — guarded single-row update to `tgev_game_evals`
  (`gev_cp`/`gev_depth` only), mirroring `upgradePositionEvaluation`'s depth-guard pattern.

### src/ui/board/ChessBoardView.tsx (revision 18)
- `saveDeepAnalysisLines` now also identifies the Engine Line matching the actually-played move
  and, if it improves on the existing depth for `evaluations[currentPly]`, calls `upgradeGameEval`
  and updates `evaluations`/`tree.mainLine[currentPly].evaluation` client-side to match.

## Title (revision 19)
"To move" selector: fixed options 10 / 15 / All instead of every move number

## Plan (revision 19)
- [x] `src/ui/board/ChessBoardView.tsx`: change the "To move" `MySelect` options from
      `fullMoveOptions` to `['10', '15', 'All']`. `value` shows `'All'` when `toMove >=
      totalFullMoves`, else `String(toMove)`. `onChange` sets `toMove` to `totalFullMoves` when
      `'All'` is selected, else the parsed number. "From move" is unchanged (still every move
      number via `fullMoveOptions`).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 19)

### src/ui/board/ChessBoardView.tsx (revision 19)
- "To move" selector now offers fixed options `10`/`15`/`All` instead of every move number.

## Title (revision 20)
Simplify the re-analyze button label to just "Re-analyse"

## Plan (revision 20)
- [x] `src/ui/board/ChessBoardView.tsx`: when `evaluations.length > 0`, the button label becomes a
      fixed `'Re-analyse'` instead of `Re-analyze all (depth N)` / `Re-analyze moves X–Y (depth N)`.
      The first-time case (`evaluations.length === 0`) stays `'Analyze all moves'`, unchanged.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 20)

### src/ui/board/ChessBoardView.tsx (revision 20)
- Re-analyze button label simplified to a fixed `'Re-analyse'` (was showing dynamic move
  range/depth text).

## Title (revision 21)
Rename "Update Positions" button label to "Save to database"

## Plan (revision 21)
- [x] `src/ui/board/ChessBoardView.tsx`: rename the Game Analysis box's "Update Positions" button
      label to `'Save to database'` (idle state; `'Updating...'` while in progress stays as-is,
      unless that should change too — function/handler name (`updateAllPositions`) and status
      message text (`Updated N of M positions`) are unaffected, this is a label-only change).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 21)

### src/ui/board/ChessBoardView.tsx (revision 21)
- "Update Positions" button label renamed to "Save to database" (idle state only).

## Title (revision 22)
Remove the "Save to database" button — redundant with Re-analyse's automatic teva push

## Plan (revision 22)
User decision: remove it entirely rather than keep it for the historical-backfill case (older
`tgev_game_evals` rows never auto-pushed, or positions untracked in `tpos_positions` at the time of
original analysis) — Re-analyse already pushes every ply it computes into `teva_evaluations`
automatically, and that's the primary path going forward.

- [x] `src/ui/board/ChessBoardView.tsx`: remove the `updatingPositions`/`updatePositionsMessage`
      state, the `updateAllPositions()` function, and the "Save to database" button + status
      message block from the Game Analysis box. `upgradeGameEval` (used by "Save Analysis" for the
      played-line ply, revision 18) and `upgradePositionEvaluation` are unaffected — only this
      button's own handler is removed.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 23)
Remove "Save Analysis" button — Position Analysis pushes to teva/tgev automatically on completion

## Plan (revision 23)
User decision: the full "Save Analysis" behavior (every displayed line → `teva_evaluations`, the
played line → `tgev_game_evals`) should run automatically whenever a Position Analysis run
finishes, not require a manual click. "Finishes" means the engine sends `bestmove` — which fires
both when the target depth is reached naturally *and* when analysis is stopped early (the "Stop"
button, or the automatic stop when navigating to a different position mid-run both send `stop`,
which per UCI always triggers an immediate `bestmove` reply) — so the automatic push happens either
way, using whatever depth was actually reached.

**Stale-closure risk, and how it's avoided:** the existing top-line-only auto-push already runs
inside `startInfiniteAnalysis`'s `onComplete` callback, which is created once when analysis starts
and does not see later state updates — that's why `latestDeepResultRef` exists (a ref, updated
synchronously on every `processUpdate`, read at completion instead of stale state). Extending this
to the full line set needs the same treatment, *plus* one new risk: if the user navigates to a
different position while analysis is still running, `currentPly`/`evaluations`/`tree` will already
reflect the *new* position by the time `onComplete` actually fires (asynchronously, after the
engine's `bestmove` arrives) — so reading them fresh at completion time could push the tgev update
to the wrong ply. Fix: capture `fen` and the analyzed ply (`currentPly` at the moment analysis
*started*) once, into local variables closed over by `onComplete`, instead of reading current state
when it fires. `gdid` doesn't need this treatment — it's a stable prop for the component's whole
lifetime (a different game means a different mounted instance).

- [x] `src/ui/board/ChessBoardView.tsx`: replace `latestDeepResultRef` with a ref that captures the
      full displayed line set each `processUpdate` (e.g. `latestAnalysisLinesRef: { lines:
      MultiPvResult[]; depth: number } | null`, set from `display`/`update.depth` — same place the
      old ref was updated).
- [x] `startDeepAnalysis()`: capture `const analyzedPly = currentPly` alongside the existing `fen`
      capture, before calling `engine.startInfiniteAnalysis`. Replace the `onComplete` callback's
      body with a call to a new `persistAnalysisLines(fen, analyzedPly, lines, depth)` function
      (reading `latestAnalysisLinesRef.current` for `lines`/`depth`), instead of the old
      single-line `upgradePositionEvaluation` call.
- [x] Extract the current `saveDeepAnalysisLines()` body into `persistAnalysisLines(fen: string,
      ply: number, lines: MultiPvResult[], depth: number)`, parameterized instead of reading
      `deepAnalysisData`/`currentPly` from component state — same logic otherwise (push every line
      to teva, push the played line to tgev via `upgradeGameEval` if `ply < evaluations.length`,
      call `refreshPositionPanels()`). Keep `saveAnalysisMessage` state for passive feedback (no
      "Saving..." state needed since there's no button to disable).
- [x] Remove the "Save Analysis" `MyButton` and `savingAnalysis` state from the Position Analysis
      box; keep displaying `saveAnalysisMessage` once `persistAnalysisLines` finishes.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 22)

### src/ui/board/ChessBoardView.tsx (revision 22)
- Removed `updatingPositions`/`updatePositionsMessage` state, `updateAllPositions()`, and the
  "Save to database" button + status message from the Game Analysis box.

## Changes (revision 23)

### src/ui/board/ChessBoardView.tsx (revision 23)
- Replaced `latestDeepResultRef` (top line only) with `latestAnalysisLinesRef` (full displayed line
  set + depth), updated on every `processUpdate`.
- `startDeepAnalysis()` now captures `analyzedPly` before starting, and its `onComplete` callback
  calls the new `persistAnalysisLines(fen, analyzedPly, lines, depth)` instead of a single-line
  `upgradePositionEvaluation` call.
- Extracted `saveDeepAnalysisLines()`'s body into `persistAnalysisLines(fen, ply, lines, depth)`,
  parameterized instead of reading `deepAnalysisData`/`currentPly` from state — same behavior
  (push every line to teva, push the played line to tgev, refresh panels), now running
  automatically whenever a Position Analysis run completes (reaches target depth, or is stopped
  early) instead of requiring a manual click.
- Removed the "Save Analysis" button and `savingAnalysis` state; `saveAnalysisMessage` still shows
  once the automatic save finishes.

## Title (revision 24)
New pipeline step 9: "Deepen Popular Positions" — re-evaluate high-reach positions at greater depth

## Plan (revision 24)
New batch step, agreed tiers (reach → target depth, evaluated highest-first, only upgrades if the
position's current `eva_depth` is below its tier's target):
- `pos_reached >= 50` → depth 30
- `pos_reached >= 30` → depth 24
- `pos_reached >= 10` → depth 22

Reuses the existing guarded-upgrade mechanism (`upgradePositionEvaluation`'s `eva_depth < new_depth`
check, plus its automatic `gam_cp_change` cascade and cache-clear) — no new SQL needed for the write
itself, only for selecting which positions qualify and at what depth.

- [x] `src/lib/constants.ts`: add `POPULAR_POSITION_DEPTH_TIERS: { minReach: number; depth: number
      }[]`, ordered highest-`minReach`-first: `[{ minReach: 50, depth: 30 }, { minReach: 30, depth:
      24 }, { minReach: 10, depth: 22 }]`.
- [x] `src/lib/analysis/enrichPositionsStockfish.ts`: add `deepenPopularPositions(opts: { limit?:
      number; level?: number; forceNewRun?: boolean })`. Backlog query (wrapped subquery so the
      per-row `target_depth` CASE expression can be filtered on):
      ```sql
      SELECT * FROM (
        SELECT p.pos_id, p.pos_fen, p.pos_color, p.pos_reached, e.eva_depth,
          CASE
            WHEN p.pos_reached >= 50 THEN 30
            WHEN p.pos_reached >= 30 THEN 24
            WHEN p.pos_reached >= 10 THEN 22
          END AS target_depth
        FROM tpos_positions p
        JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
        WHERE p.pos_reached >= 10
      ) sub
      WHERE sub.eva_depth < sub.target_depth
      ORDER BY sub.pos_reached DESC
      LIMIT $1
      ```
      (tier values pulled from `POPULAR_POSITION_DEPTH_TIERS`, not hand-duplicated, so the query
      stays in sync if the constant ever changes). For each row, evaluate at that row's own
      `target_depth` (not a single uniform depth for the whole batch — genuinely different per
      row, unlike the existing "Evaluate Positions" step) using the same native-binary/WASM engine
      selection already used by `enrichPositionsStockfish`, then call `upgradePositionEvaluation({
      fen: row.pos_fen, cp: whiteCp, bestMove, depth: row.target_depth })`. Log via
      `logPipelineStep({ step: 9, ... })`, following the exact same structure as
      `enrichPositionsStockfish`/`evaluateGameEndings`.
- [x] `src/app/api/analysis/deepen-popular-positions/route.ts` (new): mirrors
      `evaluate-positions/route.ts`, calling `deepenPopularPositions`.
- [x] `vercel.json`: new cron entry, e.g. `{ "path":
      "/api/analysis/deepen-popular-positions?limit=100", "schedule": "40 5 * * *" }` (after the
      existing Evaluate Game Endings slot).
- [x] `src/lib/actions/pipelineStatus.ts`: add `refreshDeepenPopularStatus(): Promise<{ remaining:
      number }>`, using the same tiered subquery (as a `COUNT(*)` instead of a row list),
      `skipCache: true` per the maintenance-reads convention.
- [x] `src/lib/actions/pipelineLog.ts`: add `step9` to `getPipelineRates`'s return type and SQL
      (same `rateN` pattern as the existing steps).
- [x] `src/app/owner/pipeline/page.tsx`: new step 9 panel, same compact merged title/status layout
      as the other 8 panels, showing `remaining` + ETA + `StatusBadge` + SQL help link, manual
      trigger button.
- [x] `src/ui/analysis/PipelineHelp.tsx`: new STEPS entry describing the tiered-depth design.
- [x] `docs/Dataflow.md`: new section + flow-diagram entry for this step (per the project's
      "project docs go through #plan/#code" rule — covered here since we're already in one).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 24)

### src/lib/constants.ts (revision 24)
- Added `POPULAR_POSITION_DEPTH_TIERS` (reach → depth tiers: 50→30, 30→24, 10→22).

### src/lib/analysis/enrichPositionsStockfish.ts (revision 24)
- Added `popularPositionTierSql()` (private helper, builds the shared CASE SQL from the tiers
  constant), `deepenPopularPositions()` (the batch step, reusing `upgradePositionEvaluation`), and
  `countRemainingPopularPositions()` (backlog count, shared query shape with the batch).

### src/app/api/analysis/deepen-popular-positions/route.ts (new, revision 24)
- New route mirroring `evaluate-positions/route.ts`, calling `deepenPopularPositions`.

### vercel.json (revision 24)
- New cron entry for `/api/analysis/deepen-popular-positions`.

### src/lib/actions/pipelineStatus.ts (revision 24)
- Added `refreshDeepenPopularStatus()`.

### src/lib/actions/pipelineLog.ts (revision 24)
- Added `step9` to `getPipelineRates`'s return type and SQL.

### src/app/owner/pipeline/page.tsx (revision 24)
- Added the step 9 "Deepen Popular Positions" job group, status state, refresh function, run
  handler, `Run All` wiring, `SQL_STATUS_DEEPEN_POPULAR`, and panel.

### src/ui/analysis/PipelineHelp.tsx (revision 24)
- Added the step 9 STEPS entry.

### docs/Dataflow.md (revision 24)
- Added the "Deepen Popular Positions" flow node/edges and full section.

## Title (revision 25)
Remove the browser-side "Evaluate Positions" button from the Evaluate Positions panel

## Plan (revision 25)
User decision: the client-side (`EvalProgress`) evaluation path isn't run by cron — only the
server-side path (`enrichPositionsStockfish` via "Run Server Evaluate") is — so having a second,
inconsistent trigger mechanism on the same panel should go. `EvalProgress` and
`getPositionsToEvaluate` have no other callers, so both become dead code once this is removed.

- [x] `src/app/owner/pipeline/page.tsx`: remove the `<EvalProgress>` element, its import, the
      `posBrowserDone` state and its "Browser evaluation complete." message from the step 5 panel.
- [x] `src/ui/analysis/EvalProgress.tsx`: delete the file (no remaining callers).
- [x] `src/lib/analysis/chessdb.ts`: remove the now-unused `getPositionsToEvaluate` export (no
      remaining callers after the above).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 25)

### src/app/owner/pipeline/page.tsx (revision 25)
- Removed the `<EvalProgress>` element, its import, and the `posBrowserDone` state/message from the
  step 5 panel — only "Run Server Evaluate" remains.

### src/ui/analysis/EvalProgress.tsx (revision 25)
- Deleted (no remaining callers).

### src/lib/analysis/chessdb.ts (revision 25)
- Removed the now-unused `getPositionsToEvaluate` export.

## Title (revision 26)
New single "Run Pipeline" box (params + Run All + every step, one line each) replacing the old
"Global parameters" box and the 9 individual per-step boxes; "Pipeline Jobs" box unchanged apart
from losing its "Run All" button

## Plan (revision 26)
Final two-box structure for the page:

1. **"Pipeline Jobs" box** — unchanged except it no longer has its own "Run All" button; keeps its
   own refresh (↻) button and the jobs-summary table.
2. **New "Run Pipeline" box** — replaces both the old "Global parameters" box and the 9 individual
   per-step `<MyBox>` wrappers. Contents, top to bottom, all inside this one box:
   - Depth / Batch / "Refresh All Stats" row (currently the "Global parameters" box's content)
   - The `handleRunAll`/`runAllRunning` "Run All" button, moved here from "Pipeline Jobs"
   - Each of the 9 step panels (1, 2a, 2b, Purge, 4b/CP Change, 7/Habits, 8/Game Endings,
     9/Deepen Popular), every one collapsed onto a single `flex flex-wrap items-center gap-2` line
     — title + `MyHelpStep` + refresh + `remaining`/ETA + `StatusBadge` + SQL `MyHelp` link +
     action button(s) all on that one line — separated from each other by a thin divider
     (`border-t border-gray-100 pt-2`, omitted before the first step). Each step's action-button
     idle label becomes a uniform `'Run'` (was `'Run Game Sync'`, `'Run Purge'`, `'Run Server
     Evaluate'`, `'Evaluate Game Endings'`, `'Deepen Popular Positions'`, etc.); each button's own
     in-progress label (`'Syncing...'`, `'Purging...'`, `'Running...'`, etc.) is unchanged.
     Result/error messages below each step's row are unaffected structurally, just no longer
     inside that step's own box.

This is otherwise a uniform, mechanical transformation — same content, same handlers, same state
for every step, just re-laid-out and re-parented into the one new box.

- [x] `src/app/owner/pipeline/page.tsx`: remove the "Global parameters" `<MyBox>` and the 9
      individual step `<MyBox>` wrappers; create one new `<MyBox title="Run Pipeline">` (or
      equivalent) containing, in order: the Depth/Batch/Refresh-All-Stats row, the "Run All"
      button, then the 9 merged single-line step rows with dividers between them.
- [x] Remove the "Run All" button from the "Pipeline Jobs" box (moved into the new box above); that
      box keeps its own refresh (↻) button and the jobs-summary table.
- [x] Standardize every step's action-button idle label to `'Run'`.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 26)

### src/app/owner/pipeline/page.tsx (revision 26)
- Removed the standalone "Global parameters" box and the 9 individual per-step `<MyBox>` wrappers.
- Removed "Run All" from the "Pipeline Jobs" box (now just its refresh button + table).
- Added a new "Run Pipeline" box containing, in order: Depth/Batch/"Refresh All Stats" row, "Run
  All" button, then all 9 steps as single-line rows (title/help/refresh/remaining/ETA/badge/SQL
  link/action button all on one line), separated by `border-t border-gray-100 pt-2` dividers.
- Every step's action-button idle label standardized to `'Run'` (in-progress labels unchanged).

## Title (revision 27)
Match "Run" button height to the SQL button; fix refresh button height not actually shrinking;
make "Run All" red

## Plan (revision 27)
Root cause confirmed by reading `myMergeClasses` (`node_modules/nextjs-shared/src/components/
MyMergeClasses.ts:92`): an override class only replaces a default class when both share the same
variant prefix. The refresh (↻) buttons' existing override (`h-auto ...`, no `md:` prefix) only
replaces the default's base `h-6` — it never touches `md:h-8`, which survives unreplaced and still
governs height at desktop widths. That's the actual bug behind "refresh needs to reduce in size"
— it's not fully overridden today. The 9 "Run" buttons have no height override at all, so they sit
at full default height (`h-6 md:h-8`) versus the SQL button (`MyHelp`'s default), which has no
`h-*` class at all — just `px-1.5 py-0.5 leading-none`.

- [x] `src/app/owner/pipeline/page.tsx`: for each of the 9 step "Run" buttons, add `h-auto md:h-auto
      px-1.5 py-0.5 leading-none` to their `overrideClass` (kept alongside each button's existing
      conditional background class, e.g. `bg-orange-300 hover:bg-orange-300` while running) —
      matches the SQL button's compact height at every breakpoint.
- [x] For each of the 9 step refresh (↻) buttons, add `md:h-auto` to their existing `overrideClass`
      (already has `h-auto ... px-1.5 py-0.5 leading-none`) — actually clears the leftover
      `md:h-8` that survives today.
- [x] Add `overrideClass='bg-red-500 hover:bg-red-600'` to the "Run All" button (currently plain
      `<MyButton>`, inheriting the default blue).
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 28)
Lay out each pipeline step as a grid row (number / description / help / refresh / remaining / status / sql / run) instead of a flex-wrap line

## Plan (revision 28)
Replace each step's `flex flex-wrap items-center gap-2` row with a CSS grid row, same 8 fields as a
column each, so they align vertically across all 9 steps regardless of how long a step's title or
help text is — a flex-wrap row can't guarantee that today, since row length varies per step.

Column template (applied identically to all 9 step rows):
`grid grid-cols-[1.5rem_1fr_auto_auto_5rem_auto_auto_auto] items-center gap-x-2`
1. Number (e.g. "1.") — split out from the title text
2. Description (the rest of the title, e.g. "Game Sync — All Players") — `1fr`, so columns 3-8
   always start at the same horizontal position regardless of title length
3. Help (`MyHelpStep` popover trigger)
4. Refresh (↻ button)
5. Remaining count — the ETA text (where present) folds into this same cell, right after the
   count, instead of its own separate element
6. Status (`StatusBadge`)
7. SQL (`MyHelp` button)
8. Run (action button)

The `·` separator dot currently used between the refresh button and the remaining count is dropped
— grid column boundaries replace its visual-grouping purpose, so it's no longer needed.

User decision: add a header row labeling each column, matching the existing "Pipeline Jobs" table's
pattern (which already has `<thead>`/`<th>` column headers) — using the same grid template so the
header cells align with the data cells beneath them.

- [x] `src/app/owner/pipeline/page.tsx`: add one header row above the 9 steps, using the same
      `grid grid-cols-[1.5rem_1fr_auto_auto_5rem_auto_auto_auto]` template, labeling each column
      ("Step", "Description", "Help", "Refresh", "Remaining", "Status", "SQL", "Run") in a muted
      style consistent with the Jobs table's `<th>` styling (`text-gray-400 font-medium`).
- [x] For each of the 9 step rows, replace the `flex flex-wrap items-center gap-2` wrapper with the
      grid template above, splitting each step's `<h3>` title into a number cell and a description
      cell, dropping the `·` divider, and moving each ETA span into the same cell as its
      remaining-count span. All existing handlers/state/content are unchanged — only the
      wrapping/positioning changes.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 27)

### src/app/owner/pipeline/page.tsx (revision 27)
- Added `h-auto md:h-auto px-1.5 py-0.5 leading-none` to all 9 "Run" buttons' `overrideClass`.
- Added `md:h-auto` to all 9 refresh (↻) buttons' `overrideClass` (previously only `h-auto`, which
  per `myMergeClasses`'s variant-matching rule never replaced the default's `md:h-8`).
- "Run All" button now has `overrideClass='bg-red-500 hover:bg-red-600'`.

## Changes (revision 28)

### src/app/owner/pipeline/page.tsx (revision 28)
- Added a header row (Step/Description/Help/Refresh/Remaining/Status/SQL/Run) using the grid
  template `grid-cols-[1.5rem_1fr_auto_auto_5rem_auto_auto_auto]`.
- Converted all 9 step rows from `flex flex-wrap` to the same grid template, splitting each title
  into number + description cells, dropping the `·` divider, and folding each ETA span into its
  remaining-count cell.

## Title (revision 29)
Replace the 9 separate CSS Grid rows with one real `<table>` — columns don't actually align across
independent grid containers

## Plan (revision 29)
Root cause: each step row from revision 28 is its own separate `<div className='grid ...'>`.
CSS Grid computes `auto`-sized columns per container — even with the identical `grid-cols-[...]`
string on every row, columns like Help/Refresh/Status/SQL/Run size to that one row's own content
and can drift apart when content width differs (e.g. "Completed" vs "Incomplete" in the status
badge, or differing digit counts in the remaining count). A real `<table>` computes column widths
collectively across every row in the same table, guaranteeing alignment — exactly what the
existing "Pipeline Jobs" box already uses for its own job list.

- [x] `src/app/owner/pipeline/page.tsx`: replace the header-row `<div>` and all 9 step-row `<div>`s
      with a single `<table className='w-full text-xs'>`, `<thead>` with one `<tr>` of `<th
      className='text-left font-medium ...'>` cells (Step/Description/Help/Refresh/Remaining/
      Status/SQL/Run, matching the Pipeline Jobs table's own header styling), and `<tbody>` with
      one `<tr>` per step, each cell as a plain `<td>` (`text-left` where relevant) containing
      exactly the same content/handlers as today — no behavior changes, only the wrapping markup
      changes from grid `<div>`s to real table cells.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 29)

### src/app/owner/pipeline/page.tsx (revision 29)
- Replaced the header `<div>` and all 9 step `<div>`s with a single `<table>` (`<thead>` with
  left-aligned `<th>` column labels, `<tbody>` with one `<tr>` per step and result/error messages
  as a `colSpan={8}` row beneath) — columns now align correctly since widths are computed
  collectively across the whole table, unlike the independent grid containers from revision 28.

## Title (revision 30)
Move "Run All" out of the top params row, into the table header's "Run" column

## Plan (revision 30)
- [x] `src/app/owner/pipeline/page.tsx`: remove the `handleRunAll`/`runAllRunning` "Run All" button
      from the Depth/Batch/"Refresh All Stats" row. Replace the table header's plain `'Run'` text
      label (`<th>`) with the "Run All" `<MyButton>` itself, so it sits directly above the column
      of individual per-step "Run" buttons, aligned in that same column.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 31)
Fold the "Server-side Evaluate" help popover into step 5's main Help; remove it from beside Run

## Plan (revision 31)
- [x] `src/app/owner/pipeline/page.tsx`: remove the second `<MyHelp label='Help' title='Server-side
      Evaluate' ...>` popover next to step 5's "Run" button. Fold its content ("Evaluates positions
      using the native Stockfish binary on the server. Faster than browser WASM, no tab required.")
      into step 5's main `MyHelpStep`'s `processing` text, alongside the existing description.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 32)
Move the "Pipeline Jobs" refresh button to the right of the title, after "Run #N"

## Plan (revision 32)
`MyBox`'s `title` prop only accepts a plain string (`node_modules/nextjs-shared/src/components/
MyBox.tsx:6`) — there's no way to place a button inside it via that prop. Fix: stop passing the
title through `MyBox`'s `title` prop; render it manually as the box's first child instead, in a
flex row alongside the refresh button, matching `MyBox`'s own default title styling
(`text-xs font-bold mb-2`) so it looks the same as before.

- [x] `src/app/owner/pipeline/page.tsx`: change `<MyBox title={...}>` to plain `<MyBox>`. Add a
      `<h3 className='text-xs font-bold'>Pipeline Jobs —</h3>` as the first element in the existing
      `flex items-center gap-2 mb-2` row, immediately before the refresh button (the "Run #N" part
      becomes the new dropdown from revision 33, replacing the static text). Also add `md:h-auto`
      to this refresh button's `overrideClass` (missed in revision 27's pass, which only covered
      the 9 step-row refresh buttons) for the same compact-height fix.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 33)
"Run #" becomes a dropdown of the last 5 runs, descending, defaulting to latest

## Plan (revision 33)
Currently `getLatestPipelineRuns()` always shows the single highest `pip_run_id`'s rows, with no
way to look back at an earlier run. Add a run-picker: a dropdown listing the last 5 distinct
`pip_run_id` values (descending, most recent first), defaulting to the latest. Selecting an older
run re-fetches that run's rows into the same jobs table below — the table still only ever shows
one run's data at a time (per the existing 2026-07-16 decision not to mix run_ids in one table),
just letting the user pick *which* one.

- [x] `src/lib/actions/pipelineLog.ts`: add `getRecentRunIds(limit: number = 5): Promise<number[]>`
      — `SELECT DISTINCT pip_run_id FROM tpip_pipelinelog ORDER BY pip_run_id DESC LIMIT $1`,
      `skipCache: true`. Add an optional `runId?: number` parameter to `getLatestPipelineRuns` —
      when provided, filter `WHERE pip_run_id = $1` instead of the current `(SELECT MAX(pip_run_id)
      ...)` subquery; behavior is unchanged when omitted.
- [x] `src/app/owner/pipeline/page.tsx`: add `recentRunIds`/`selectedRunId` state. `doRefreshRuns()`
      now also calls `getRecentRunIds()`, sets `recentRunIds`, defaults `selectedRunId` to the
      first (latest) id, and fetches that run's rows. Add a new `handleSelectRunId(runId: number)`
      that sets `selectedRunId` and re-fetches just that run's rows (no change to
      `recentRunIds`/other state). Replace the static "Run #N" text with a `<MySelect>` populated
      from `recentRunIds` (formatted as `Run #N`), `value={String(selectedRunId)}`,
      `onChange={e => handleSelectRunId(parseInt(e.target.value, 10))}`, placed where the old "Run
      #N" text was (right after "Pipeline Jobs —").
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 30)

### src/app/owner/pipeline/page.tsx (revision 30)
- Removed "Run All" from the Depth/Batch/"Refresh All Stats" row; it's now the `<th>` content of
  the "Run Pipeline" table's "Run" column, sitting directly above the per-step Run buttons.

## Changes (revision 31)

### src/app/owner/pipeline/page.tsx (revision 31)
- Removed the extra "Server-side Evaluate" `<MyHelp>` popover next to step 5's Run button; its
  content is now folded into step 5's main `MyHelpStep` `processing` text.

## Changes (revision 32)

### src/app/owner/pipeline/page.tsx (revision 32)
- "Pipeline Jobs" no longer uses `MyBox`'s `title` prop (string-only, couldn't hold a button);
  title is now a manual `<h3>` alongside the refresh button. Also added the missed `md:h-auto` fix
  to this refresh button.

## Changes (revision 33)

### src/lib/actions/pipelineLog.ts (revision 33)
- Added `getRecentRunIds(limit = 5)` — last N distinct `pip_run_id`s, descending.
- `getLatestPipelineRuns` gained an optional `runId` parameter; filters by it when provided,
  otherwise unchanged (defaults to the max run id).

### src/app/owner/pipeline/page.tsx (revision 33)
- Added `recentRunIds`/`selectedRunId` state. `doRefreshRuns()` now also refreshes the run-id list
  and defaults to the latest; new `handleSelectRunId(runId)` re-fetches just that run's rows.
- Replaced the static "Run #N" text with a `<MySelect>` populated from `recentRunIds`, letting the
  user pick among the last 5 runs.

## Title (revision 34)
Fold each step's result/error message into its own "Result" column instead of a separate row

## Plan (revision 34)
Confirmed: every one of the 9 steps in the "Run Pipeline" table has the identical pattern — a
`colSpan={8}` `<tr>` that only renders when that step has a result or error to show (`syncResult`,
`treeResult`, `tposResult`, `purgeResult`, `posError`/`posResult`, `cpResult`, `habitsResult`,
`gameEndingsError`/`gameEndingsResult`, `deepenPopularError`/`deepenPopularResult`). That's the only
thing creating a second line anywhere in this table — no other hidden elements do it.

- [x] `src/app/owner/pipeline/page.tsx`: add a "Result" `<th>` between "SQL" and "Run" in the
      table header. For each of the 9 steps, move that step's result/error message content into a
      new `<td>` in that same position on the step's own `<tr>` (same conditional logic and styling
      as today, just relocated), and delete the separate `colSpan={8}` message row entirely — every
      step is now always exactly one line.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 34)

### src/app/owner/pipeline/page.tsx (revision 34)
- Added a "Result" column between "SQL" and "Run" in the "Run Pipeline" table. Moved each of the 9
  steps' result/error message into that column on the step's own row, and deleted the separate
  `colSpan={8}` message rows — every step is now always exactly one line.

## Title (revision 35)
Move "Refresh All Stats" above the "Refresh" column, renamed to just "Refresh"

## Plan (revision 35)
Same pattern as "Run All" (revision 30) — move the button out of the Depth/Batch row and into the
table header's own column, this time "Refresh".

- [x] `src/app/owner/pipeline/page.tsx`: remove the `doRefreshAll`/`refreshAllLoading` "Refresh All
      Stats" button from the Depth/Batch row (Depth/Batch inputs stay there). Replace the "Refresh"
      `<th>`'s plain text label with that same `<MyButton>`, relabeled `'Refresh'` (idle) /
      `'Refreshing…'` (loading, unchanged), so it sits directly above the column of individual
      per-step refresh (↻) buttons.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 35)

### src/app/owner/pipeline/page.tsx (revision 35)
- Removed "Refresh All Stats" from the Depth/Batch row; it's now the `<th>` content of the "Refresh"
  column, relabeled "Refresh", sitting directly above the per-step refresh (↻) buttons.

## Title (revision 36)
Change step 9's SQL popover to show the per-tier breakdown instead of a single COUNT(*)

## Plan (revision 36)
Display-only change — `SQL_STATUS_DEEPEN_POPULAR` is shown in a `<MyHelp>` popover for the user's
own reference/copy-paste, independent of the actual `countRemainingPopularPositions()` query.
Replace it with the per-tier breakdown query already given in chat (groups by tier, showing a
separate `remaining` count per tier instead of one combined total).

- [x] `src/app/owner/pipeline/page.tsx`: replace `SQL_STATUS_DEEPEN_POPULAR`'s query text with:
      ```sql
      SELECT
        CASE
          WHEN p.pos_reached >= 50 THEN '50+ (depth 30)'
          WHEN p.pos_reached >= 30 THEN '30-49 (depth 24)'
          WHEN p.pos_reached >= 10 THEN '10-29 (depth 22)'
        END AS tier,
        COUNT(*) AS remaining
      FROM tpos_positions p
      JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE p.pos_reached >= 10
        AND e.eva_depth < CASE
          WHEN p.pos_reached >= 50 THEN 30
          WHEN p.pos_reached >= 30 THEN 24
          WHEN p.pos_reached >= 10 THEN 22
        END
      GROUP BY tier
      ORDER BY MIN(p.pos_reached) DESC;
      ```
      As a literal string (not derived from `POPULAR_POSITION_DEPTH_TIERS` like the actual query
      is) — this is display text the user asked for verbatim, not a query Claude executes.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes (revision 36)

### src/app/owner/pipeline/page.tsx (revision 36)
- Replaced `SQL_STATUS_DEEPEN_POPULAR`'s query text with the per-tier breakdown (grouped by tier,
  showing a separate `remaining` count per tier), as a literal string.
- Removed the now-unused `POPULAR_POSITION_DEPTH_TIERS` import (no longer referenced in this file).
