# PLAN_analysis-enhancements — chess

## Title
Analysis enhancements.

## Plan
- [x] Widen the 3 `/analyze` columns in `src/ui/board/ChessBoardView.tsx` from 440px to 480px:
      the grid template (`xl:grid-cols-[440px_440px_440px]`), both `w-[440px]` column divs
      (moves column, analysis column), and the board's `boardStyle: { width: '440px', height: '440px' }`.
- [x] Widen the White/Black move-badge columns in `src/ui/board/MoveTree.tsx` from `w-20` (80px)
      to `w-24` (96px) each (header `<th>`s and body `<td>`s), and update the table's fixed width
      from `w-[352px]` to `w-[384px]` to match, to relieve move-badge folding.
- [x] Widen the Eval columns in `src/ui/board/MoveTree.tsx` from `w-20` (80px) to `w-24` (96px)
      each (header `<th>`s and `EvalCell` `<td>`s), and update the table's fixed width from
      `w-[384px]` to `w-[416px]` to match (32(#) + 96(White) + 96(Eval) + 96(Black) + 96(Eval) =
      416px, still fits within the 480px column).
- [x] Center the moves table horizontally within its column in `src/ui/board/MoveTree.tsx`
      (`mx-auto` on the `<table>`), so the 48px gap splits evenly (24px each side) instead of
      sitting entirely on the right next to the scrollbar.
- [x] Remove the `xl:h-[780px] overflow-y-auto` height cap from the moves column div in
      `src/ui/board/ChessBoardView.tsx`, so the moves box grows to its full content height
      (no internal scrollbar) instead of scrolling within a fixed-height box — the page itself
      will scroll for longer games instead.
- [x] Add a "Move" column to the Masters "Top games" table (`ChessBoardView.tsx`, `filteredTopGames`
      table around line 1355) showing which move was played in that game — look up each game's
      `g.uci` against `mastersData.moves` to display its `san`, falling back to the raw `uci` string
      if no match is found.
- [x] Add click-to-filter on the Masters moves table (`ChessBoardView.tsx`, `mastersData.moves`
      table around line 1308): clicking a row sets a new `selectedMastersMove` state (by `uci`,
      toggling off on a second click of the same row, same pattern as `selectedPositionMove` in
      "Moves From This Position"). While set, filter the "Top games" list to
      `g.uci === selectedMastersMove` in addition to the existing rating filter.
- [x] Replace the static "Filters Top Games only — the move table above always covers the full
      Masters database (FIDE 2200+), which the API doesn't break down by rating." paragraph
      (`ChessBoardView.tsx:1348-1351`) with a `nextjs-shared/MyHelpField` (hover `?` icon) carrying
      the same text, placed next to the "Min rating" label.
- [x] Change the "Moves From This Position" `MyBox` title (`ChessBoardView.tsx:1238`) from
      `` `Moves From This Position — ${currentMoveLabel}` `` to just `{currentMoveLabel}`
      (e.g. `8.Nbd2`).
- [x] Change the "Masters" `MyBox` title (`ChessBoardView.tsx:1281`) from
      `` `Masters — ${currentMoveLabel}` `` to plain `'Masters'`.
- [x] Move the "Top games" section (Min rating filter + help field, table) out of the "Masters"
      `MyBox` into its own separate `MyBox` (sibling panel below Masters, not nested inside it),
      titled `'Top Games'` via the `title` prop — matching the heading format of the other panels
      — instead of the current small `<p className='text-xxs text-gray-400'>Top games</p>` label.
- [x] Widen just the analysis column (Column 3) to 600px, decoupling it from the board/moves
      columns which stay at 480px: change the grid template in `src/ui/board/ChessBoardView.tsx`
      from `xl:grid-cols-[480px_480px_480px]` to `xl:grid-cols-[480px_480px_600px]`, and the
      analysis column div from `w-[480px]` to `w-[600px]`, to give the Top Games table's White/
      Black player-name columns enough room to stop folding.
- [x] Rename the "Top Games" `MyBox` title (`ChessBoardView.tsx`) to `'Games'`.
- [x] Remove the Min rating filter entirely: delete the `mastersMinRating` state, its `MyInput`
      control, and the rating clauses (`g.white.rating >= mastersMinRating && g.black.rating >=
      mastersMinRating`) from `filteredTopGames`'s filter predicate — keep only the
      `selectedMastersMove` match. Also remove the now-unused `MASTERS_EXPLORER_MIN_RATING`
      constant from `src/lib/constants.ts` (and its import in `ChessBoardView.tsx`) and its
      mirrored entry in `src/app/owner/constants/page.tsx`. Update the empty-state message
      (currently "No Top Games at or above {mastersMinRating}.") to "No games match the selected
      move." (the only remaining way `filteredTopGames` can be empty once `topGames.length > 0`).
- [x] Since `MyBox`'s `title` prop only accepts a plain `string` (can't place a help icon beside
      it — amending `nextjs-shared` is out of scope here), place a `nextjs-shared/MyHelpField` at
      the top-right of the "Games" panel body instead (not literally beside the `<h3>` title),
      with updated text: "Live results from Lichess's Masters Explorer for this position — Lichess
      selects which games qualify as 'top', not this app; the count and selection aren't
      configurable here."
- [x] Simplify the "Position Analysis" panel's button/depth display (`ChessBoardView.tsx:1192-1227`):
      always label the idle-state button `'Analyze Position'` (removing the separate `'Resume'`
      label entirely — `deepAnalyzing ? 'Stop' : 'Analyze Position'`, dropping the
      `!deepAnalyzing && !deepAnalysisData` special case since both idle branches now render the
      same button), and remove the `Depth: {deepAnalysisData?.depth ?? 0}` readout entirely — the
      "Depth" dropdown remains the only depth indicator. The nodes/nps/time (or "From saved
      analysis") stats line and `saveAnalysisMessage` stay as they are.
- [x] Add one shared heading, `Position Analysis — {currentMoveLabel}` (plain text line, not a
      `MyBox`, e.g. `text-sm font-bold text-gray-700`), above the group of 5 position-specific
      panels in `ChessBoardView.tsx` — placed after "Game Analysis" (which stays separate, since
      it covers the whole game, not this position) and before the first of the 5. Each of the 5
      panels keeps its own `MyBox`, retitled to drop the repeated position label:
      1. `'Position Analysis — ${currentMoveLabel}'` → `'Stockfish'`
      2. `{currentMoveLabel}` (was "Moves From This Position") → `'Moves Played'`
      3. `` `Games — ${getNextMoveLabel(...)}` `` → `'Games Played'`
      4. `'Masters'` → `'Master Moves'`
      5. `'Games'` (was "Top Games") → `'Master games'`
      Also reorder panel 3 ("Games Played", currently the DB `selectedPositionMove`-scoped games
      list, today rendered last) to sit immediately after panel 2 ("Moves Played"), before panel 4
      ("Master Moves") — matching the requested 1–5 order.
- [x] Rework "Games Played" to match the "Master games" pattern — always show every one of the
      current player's games that reached this position, filtering to just the selected move
      client-side only when a "Moves Played" row is highlighted (instead of not fetching/rendering
      at all until a row is clicked):
      - `src/lib/analysis/chessdb.ts`: make `getGamesForPosition`'s `move` parameter optional;
        when omitted, drop the `AND gp.gam_move_played = $3` clause so it returns every game
        (any move) the player reached this position through.
      - `ChessBoardView.tsx`: change the `positionGames` fetch `useEffect` to run whenever
        `fen`/`player` change (remove the `selectedPositionMove` guard/dependency), calling
        `getGamesForPosition(fen, player)` with no move argument.
      - `refreshPositionPanels()`: remove its `if (selectedPositionMove)` gate — always refetch
        `positionGames`.
      - Render "Games Played" whenever `positionGames.length > 0` (same gating style as "Master
        games" on `mastersData.topGames.length > 0`), not on `selectedPositionMove`. Inside, filter
        client-side: `selectedPositionMove ? positionGames.filter(g => g.move_played ===
        selectedPositionMove) : positionGames` — same pattern as "Master games"'s
        `filteredTopGames`.
      - Update the empty-state text: "No games reached this position." when `positionGames` itself
        is empty, "No games match the selected move." when the move-filtered list is empty (matches
        "Master games"' wording).
      - Fix the stale "Moves Played" comment (currently says "across all tracked players" — the
        query is actually already scoped to just the one player, same as `getGamesForPosition`).
- [x] **Critical bug — `persistAnalysisLines`'s local React-state mirror writes the analyzed
      position's own top-line evaluation into the wrong slot of the `evaluations` array (one ply
      too deep), corrupting the *next* move's on-screen display.** Confirmed live: analyzing the
      "8...O-O-O" position (rank-1 line `hxg4` at `+2.77`, depth 40) reported "Updated 4 of 4
      positions" and a direct `SELECT` against `tpos_positions`/`teva_evaluations` confirmed the DB
      write landed correctly (`pos_id=63034`, `eva_cp=277`, `eva_depth=40` — the O-O-O position
      itself). But on screen, O-O-O's own move-list row stayed stuck at the old `+0.48 (30)`, while
      the *next* move's row (`9.Re1`) instead displayed `+2.77 (40)` — a value that belongs to
      O-O-O's position, not Re1's (Re1's own genuine DB value, written moments later by
      `deepenUncoveredMoves`, is `+0.25 (40)`).
      Root cause: `startDeepAnalysis` sets `const analyzedPly = currentPly`, where `currentPly =
      currentNode ? getPath(currentNode).length : 0` (`ChessBoardView.tsx:845`) — a **1-indexed
      count** of moves played to reach the position (also seen used this way in
      `getCurrentMoveLabel`, which explicitly does `currentPly - 1` to convert it back to a
      0-indexed ply before use). `persistAnalysisLines` then uses this same 1-indexed `ply` value
      directly as an index into `evaluations` (0-indexed, one entry per `sanMoves` ply) — writing
      one slot too far in, into whatever move comes *after* the one actually analyzed. This is a
      **display-only bug** — every database write in this session's architecture (`fen`-keyed, not
      ply-indexed) is unaffected; only the local React mirror added earlier this session
      (`ChessBoardView.tsx:696-717`) is wrong.
      Fix: change `const analyzedPly = currentPly` (line 476) to `const analyzedPly = currentPly -
      1`.
      - **Agreed (user decision): also fix the related gap in the same pass** —
        `deepenUncoveredMoves`'s own DB writes (like Re1's `+0.25 (40)` above) are genuinely correct
        but have no local React-state mirroring at all — only `refreshPositionPanels()` runs
        afterward (refreshes "Moves Played"/"Games Played", not the main move-list `evaluations`
        array), so a move it updates doesn't show its new value in the move list until the page is
        reloaded. Extend `persistAnalysisLines`'s existing local-mirror pattern (lines 696-717) into
        `deepenUncoveredMoves`: for each uncovered move it evaluates, if
        `upgradePositionEvaluation` reports success and the local `evaluations[]` entry for that
        move's own ply is stale (`existingPlyEval.depth < targetDepth`), merge an updated
        `MoveEvaluation` into `evaluations`/`tree.mainLine` the same way, so every position updates
        live as it runs, not just the ones covered by the multi-PV lines.
- [x] **Feature: change both Depth controls from a fixed dropdown to a typeable number input**
      (`MyInput type='number'` or equivalent), so arbitrary depths (e.g. 31) can be entered directly
      for testing without needing an exact dropdown option to already exist. Agreed:
      - Both Depth controls convert: the "Game Analysis" panel's `stockfishDepth` control
        (`ChessBoardView.tsx:1003-1009`, used by "Analyze Game") and the "Stockfish"/Position
        Analysis panel's `deepAnalysisDepth` control (`:1116-1121`, used by "Analyze Position").
      - Bounds: **min = `STOCKFISH_DEPTH` (16, the pipeline's own depth constant — reused, not a
        new value, per user correction: a manual analysis should never be allowed to go shallower
        than what the automated cron pipeline already guarantees for every position), max = 40**
        (agreed — matches the old dropdown's highest option as the ceiling; kept as its own
        constant, `STOCKFISH_DEPTH_INPUT_MAX`, since no existing constant already represents this
        ceiling). Out-of-range typed values clamp rather than being silently accepted.
      - **Follow-up bug (found by user testing): typing e.g. "31" was impossible** — the first
        implementation clamped on every keystroke, so typing "3" (below min 16) immediately
        snapped the field back to "16" before "1" could be typed. Root cause: this file already has
        an established correct pattern for exactly this ("From move"/"To move" number inputs,
        `ChessBoardView.tsx`) — type freely (value can transiently be `NaN` mid-typing), clamp only
        on blur — which the Depth inputs should have matched from the start but didn't.
      - **Extracted into a shared `DepthInput` component** (`src/ui/board/DepthInput.tsx`), per
        user feedback that a DD-scoped input needed in more than one place should prompt for
        confirmation before being replaced with a component, rather than silently duplicating it
        or silently extracting it — both of which happened here (duplicated first across both call
        sites in the same edit, then almost re-duplicated the bug fix a second time). Props:
        `value`, `onChange`, optional `min`/`max` (defaulting to `STOCKFISH_DEFAULTS.depth`(16)/
        `STOCKFISH_DEPTH_INPUT_MAX`(40)), optional `overrideClass`. Implements the correct
        onBlur-clamp pattern internally. Used at both call sites (Game Analysis panel, Stockfish
        panel), replacing the two duplicated inline blocks.
- [x] Change the shared heading text in `ChessBoardView.tsx` from `` `Position Analysis — ${currentMoveLabel}` ``
      (with em dash) to `` `Position Analysis ${currentMoveLabel}` `` (no dash, e.g.
      "Position Analysis 8.Nbd2") — keep the move number.
- [x] Move the "Game Analysis" `MyBox` from the top of Column 3 (Analysis) to the bottom of
      Column 1 (Board) in `ChessBoardView.tsx` — placed after the "Branch indicator" section,
      inside the board column's own `w-[480px]` div, before that div closes. Column 3 then starts
      directly with the shared "Position Analysis {move}" heading (no separate whole-game panel
      above it).
- [x] Remove the "Engine Lines" pre-populate behavior entirely — it reconstructs a fake multi-PV
      display from saved per-move data (`buildSavedAnalysisFromMoveSummary`, `ChessBoardView.tsx`
      ~line 108-150) that can disagree with the identical position's evaluation shown elsewhere on
      the page (confirmed: `O-O-O` showed `+0.48` in Engine Lines vs `+1.86` in the move list, same
      position). "Engine Lines" should only ever show genuine output from an actual "Analyze
      Position" run (live or its completed result) — nothing before that.
      - Delete the `buildSavedAnalysisFromMoveSummary` function.
      - Delete the pre-populate `useEffect` (~line 294-303, the one keyed on `[moveSummary]` that
        calls it and `setDeepAnalysisData(saved)`).
      - In the "Stockfish" panel's stats block, drop the now-dead "From saved analysis" branch
        (only ever reachable via the removed pre-populate path, since a genuine live run's
        `deepAnalysisData` always carries real timing) — just always show the nodes/nps/time line
        once `deepAnalysisData` exists.
- [x] Don't show "Master Moves" or "Master games" until a position has actually been clicked on —
      hidden entirely on initial page load (`currentNode` is `null` until a move is selected),
      not just an empty state:
      - `ChessBoardView.tsx:231-241` (the `mastersData` fetch `useEffect`): stop falling back to
        `tree?.root.fen` — only fetch when `currentNode` is set (`const fen = currentNode?.fen`;
        `if (!fen) { setMastersData(null); return }`), so nothing is fetched for the tree root.
      - Wrap the "Master Moves" `MyBox` (`:1259`) in `{currentNode && (...)}` so the panel (and its
        "No master games recorded" empty state) doesn't render at all until a move is selected.
      - "Master games" already gates on `mastersData && mastersData.topGames.length > 0`
        (`:1346`-ish) — add an explicit `currentNode &&` to that same condition too, so it can
        never show stale data if `currentNode` were ever cleared back to `null` mid-session.
- [x] In "Games Played", remove the `(current)` text badge next to the current game's row and
      highlight the row instead — add a distinct accent (e.g. `border-l-4 border-blue-500`) to the
      `<tr>` when `isCurrentGame` is true, layered on top of (not replacing) the existing pink/
      yellow `resultMismatch` background coloring.
- [x] Add a small pill legend above the "Games Played" table explaining the pink/yellow row
      coloring (matching the pill style already used in "Game Analysis", e.g. `rounded px-2 py-0.5`):
      a pink pill for "Winning position, lost/drawn" (`lostWinning`) and a yellow pill for "Losing
      position, won" (`wonLosing`) — added as a pair since they're the same color-coding system.
- [x] Add hide/show to each of the 5 "Position Analysis" panels (Stockfish, Moves Played, Games
      Played, Master Moves, Master games) in `ChessBoardView.tsx`, now that `nextjs-shared`'s
      `MyBox` supports it (`npm install` refreshed to the version with `collapsible`/`defaultOpen`
      props — confirmed present in `node_modules/nextjs-shared/src/components/MyBox.tsx`): add
      `collapsible` (and leave `defaultOpen` at its default `true`) to each of the 5 panels'
      `<MyBox>` usages so each gets the chevron-toggle title bar. "Game Analysis" (now in Column 1)
      and the "Position Analysis {move}" heading itself are unaffected — only the 5 panels.
- [x] **Critical: make `teva_evaluations` the single source of truth for "the evaluation of a
      position"**, with `tgev_game_evals`-sourced deeper analysis written back to keep it current
      (root cause of every eval-mismatch bug this session: `teva_evaluations` is genuinely
      position-deduplicated via `UNIQUE(eva_pos_id)`, but `tgev_game_evals` is per-(game,ply) with
      its own independently-writable `gev_cp`/`gev_depth` and no link back to `tpos_positions` —
      the same real position can hold two different numbers depending on which table is read):
      1. **Purge exemption** (`src/lib/analysis/purgePositions.ts`,
         `purgeStaleReachOnePositions`): exclude rows where `pos_move_num < MIN_ANALYSIS_MOVE OR
         pos_move_num > MAX_ANALYSIS_MOVE` from purge candidacy — confirmed via investigation that
         a write-back-created row (zero real `tgam_game_positions` occurrences) would otherwise
         qualify as a purge candidate almost immediately, since the reach-based grace-period check
         only protects positions the normal reach-tracked pipeline itself created. Positions outside
         the analysis range were never part of that system, so the `pos_reached <= MIN_REACH_TO_KEEP`
         rule shouldn't apply to them at all.
      2. **Get-or-create-by-FEN helper** in `src/lib/analysis/chessdb.ts` (e.g.
         `getOrCreatePosition(fen, moveNum, color)`): look up `tpos_positions` by `pos_fen`; if
         missing, insert a new row (`ON CONFLICT (pos_fen) DO NOTHING` + re-select, matching the
         existing pattern in `buildPositionTree.ts`'s `syncTposFromTgam()`), returning `pos_id`. No
         such general-purpose helper exists today — confirmed via investigation.
      3. **Extend `upgradePositionEvaluation`** with a new optional `createIfMissing?: boolean`
         (default `false`, so every existing caller is unaffected) — when `true` and no
         `tpos_positions` row exists for the FEN, use the new get-or-create helper to make one
         before upserting `teva_evaluations` (same existing depth-guard: never downgrade an
         already-deeper stored value).
      4. **`upgradePositionEvaluation` (with `createIfMissing: true`) is the single driving
         function for every position-eval write, including ones discovered on the game-eval side**
         — no separate direct `tgev_game_evals` write path is needed, since step 5's cascade
         already updates the triggering game's own ply as one of the "matching rows across every
         game." Concretely:
         - `runAnalysis` (whole-game "Analyze Game" batch pass, `ChessBoardView.tsx:412-428`)
           **already** loops over every analyzed result calling `upgradePositionEvaluation` (once
           per ply's `fenBefore`/`cpBefore`, plus once more for the range's final resulting
           position) — just add `createIfMissing: true` to both existing calls, so out-of-range
           positions get created too instead of silently no-op'ing.
         - In `persistAnalysisLines`'s "played move" block: **remove** the separate direct
           `upgradeGameEval(gdid, ply, ...)` DB call entirely — the played line's resulting
           position is already upgraded via the function's first loop (`Promise.all(lines.map(...
           upgradePositionEvaluation))`), and that upgrade's cascade (step 5) already updates this
           exact game's `tgev_game_evals` row for this ply. Keep the existing local React-state
           update (`setEvaluations`/`setTree`) for immediate UI feedback — that's independent of
           which DB function did the write.
         - `upgradeGameEval` (`src/lib/actions/games.ts`) becomes dead code once its one call site
           is removed (confirmed via grep: `ChessBoardView.tsx:685` is its only caller) — delete
           the function.
      5. **Cascade every `teva_evaluations` upgrade back out to every matching `tgev_game_evals`
         row, across every game** — because `tpos_positions` is unique per position but the same
         position can (and, given this is used to analyze recurring habits, likely will) appear in
         many different games' `tgev_game_evals`. Add this cascade centrally inside
         `upgradePositionEvaluation` itself (right after its `teva_evaluations` UPDATE succeeds),
         not just in the new write-back path, so it automatically covers every existing caller too
         (`persistAnalysisLines`'s candidate-line updates, `deepenUncoveredMoves`). Scoped to
         `gev_cp`/`gev_depth`/`gev_cp_change` only, matching `upgradeGameEval`'s own established
         scoping — never `gev_best_move`/`gev_best_move_san`/`gev_best_line`, since those describe
         the engine's recommendation *from* the position before that ply, not a property of the
         resulting position itself. A single `UPDATE ... FROM` (per-row depth-guarded via
         `WHERE gev_depth < $newDepth`) that joins each matching row to its own game's *previous*
         ply for `gev_cp_change`'s per-row computation (color-dependent sign, mirroring the
         `isWhiteMove ? cp - cpBefore : cpBefore - cp` logic `persistAnalysisLines` already uses) —
         not a per-row round-trip, since the same position can plausibly match rows across many
         games.
      6. **Refresh "Moves Played"/"Games Played" in the UI after every analysis run, not just
         "Analyze Position"** — `persistAnalysisLines` already calls `refreshPositionPanels()` at
         its end, but `runAnalysis` (the whole-game "Analyze Game" batch pass) never does, so today
         a freshly-analyzed evaluation only shows up in "Moves Played" after "Analyze Position", not
         after "Analyze Game". Add a `refreshPositionPanels()` call at the end of `runAnalysis` too,
         so both analysis paths update the visible "Moves Played"/"Games Played" panels immediately
         without needing a manual reload or navigation.
      7. **Also refresh `thab_habits.hab_move_cp` for affected habit rows**, as part of the same
         cascade inside `upgradePositionEvaluation`. `buildHabits.ts`'s own code comment already
         flags this exact scenario: `hab_move_cp` picks "the occurrence with the largest magnitude
         of change" rather than averaging, on the stated assumption that every occurrence of a
         (position, move) pair is deterministically identical today — explicitly noting this only
         stops holding "if a position gets re-evaluated at a different depth later," which is
         exactly what this fix introduces. (Note: the *displayed* habit cp — `getHabitsData`'s
         `pos_cp`/`move_cp` — is already live-joined from `teva_evaluations` at read time, so it's
         never stale; `hab_move_cp` itself only drives internal quality-filter/sort order, per
         investigation, but the user wants it kept in sync anyway, matching "when teva is updated,
         everything related updates too.") Implementation: extract `buildHabits.ts`'s aggregate+
         upsert query into a reusable form that accepts an optional `posId` scope filter (`WHERE
         gp.gam_pos_id = $posId OR gp.gam_resulting_pos_id = $posId`, matching the existing
         before/resulting-pair convention), used both by the unscoped nightly `buildHabits()` run
         and by this cascade (scoped to just the affected position) — avoiding duplicating the
         aggregate formula in two places.
      8. **Switch the move-list display to prefer `teva_evaluations`**: when loading a game's
         evaluations for display (`getGameEvals` / the tree-building effect in
         `ChessBoardView.tsx`), for each ply's resulting FEN, prefer the batched `teva_evaluations`
         lookup (via `tpos_positions.pos_fen`, one join query — not N+1) over `tgev_game_evals`'s
         own stored value whenever a `teva_evaluations` row exists and is at least as deep; fall
         back to `tgev_game_evals`'s own value only when no `teva_evaluations` row exists yet
         (out-of-range, not yet written back). This guarantees the same position shows the same
         number everywhere in the app — including confirmed by test: analyze a position deeply in
         one game, then open a *different* game that reached the identical position — its move
         list should show the same updated evaluation too (this is exactly what step 5's
         cross-game `tgev_game_evals` cascade + this display switch together guarantee).
- [x] Make "Analyze Game" (`runAnalysis`, the whole-game/From-To-range batch pass) update each
      position's related tables and panels *as it runs*, not only once the entire range finishes.
      Today `engine.analyzeGame(...)` runs the full range first (only the progress bar updates
      live), then `saveGameEvaluations`, the `upgradePositionEvaluation` loop, and
      `refreshPositionPanels()` all happen once at the very end. Change the per-ply progress
      callback (currently only calling `setAnalysisProgress`) to also call
      `upgradePositionEvaluation(..., createIfMissing: true)` for that ply's result immediately as
      it comes back from the engine, and refresh "Moves Played"/"Games Played" at some reasonable
      cadence during the run (e.g. after each ply, or throttled if that proves too chatty) rather
      than only once at the end. `saveGameEvaluations`'s single bulk delete+reinsert of
      `tgev_game_evals` for the whole range can stay as the final step (it's already an atomic
      "replace this game's row set" operation, not easily split into incremental per-ply writes
      without restructuring it) — the live part is specifically the `teva_evaluations` cascade and
      the visible panel refreshes, so the user sees each position's evaluation land as it's
      computed instead of only at the very end.
- [x] **Critical bug fix — `evaluate()` (`src/lib/stockfish.ts`) can silently capture a
      non-best-line score when `MultiPV` is left set above 1 from a prior "Analyze Position" run.**
      `startInfiniteAnalysis` (used by "Analyze Position") sends `setoption name MultiPV value
      {numLines}` (e.g. 4) and never resets it back to 1. `evaluate()` (used by "Analyze Game"'s
      `analyzeGame` and by `deepenUncoveredMoves`) reuses the same long-lived `engineRef.current`
      instance, sends `go depth N` without resetting `MultiPV`, and its info-line handler grabs
      whichever `score cp` value arrived most recently — without checking whether that line was
      `multipv 1` (the actual best line) or a secondary alternative (`multipv 2`/`3`/`4`). Once
      `MultiPV` has been left above 1 by any prior "Analyze Position" run in the same session,
      every subsequent `evaluate()` call can silently record a worse line's score instead of the
      true best line's — confirmed as the actual root cause of the `O-O-O`/`hxg4` discrepancy
      chased over this whole session (not a depth/engine-judgment artifact as first suspected).
      Fix: in `evaluate()`, explicitly send `setoption name MultiPV value 1` before searching, and
      filter incoming `info` lines to `multipv 1` only (or absent, since `multipv` isn't reported
      at all when MultiPV=1) when updating `bestCp`/`bestMove`/`bestPv` — both together, so it's
      correct even if some other future code path leaves MultiPV in a non-1 state.
- [x] "Engine Lines" always shows the top N objectively-best lines, at every `Lines` setting —
      drop the played-move-priority behavior in `processUpdate` (`ChessBoardView.tsx`) entirely,
      since the played move's evaluation is already shown in "Moves Played"/the move list, so
      there's no need to duplicate it here:
      - Replace the `if (playedSan) { ...force-include played move... } else { display =
        unique.slice(0, numLines) }` branching with just `display = unique.slice(0, numLines)`
        unconditionally.
      - Still tag `_isActualMove` on a displayed line when it happens to equal `playedSan` (so
        `AlternativeLines.tsx`'s existing highlight still works if the played move naturally lands
        in the top N) — just don't force it in when it doesn't.
      - Since a line is no longer force-added beyond the top N, `startDeepAnalysis` no longer needs
        the "+1 extra line so the played move has a chance of being included" — change
        `engine.startInfiniteAnalysis(fen, numLines + 1, maxDepth, ...)` to `numLines` exactly.
      - Widen the "Lines" dropdown (`options={['3', '4', '5']}`) to `['1', '2', '3', '4', '5']`.
- [x] **Critical — "Analyze Position" never updates the position it actually analyzed, only the
      positions one ply deeper.** `persistAnalysisLines` (`ChessBoardView.tsx`) writes each
      candidate line's score to the position *after* playing that line's move from `fen` (the
      position being analyzed) — never to `fen` itself. Since `eval(P)` is, by definition, the
      score of the best line found from P (playing the objectively-best move doesn't change a
      position's evaluation, it realizes it), the top-ranked line's score should also be written
      back to `fen` — this is the actual reason repeatedly running "Analyze Position" from a node
      can never update that node's own move-list value, at any depth, confirmed live this session
      (O-O-O stuck at `+0.48 (30)` through multiple re-runs while its own best line was found at
      `+2.66`). Fix: in `persistAnalysisLines`, after the existing per-candidate-line loop, also
      call `upgradePositionEvaluation({ fen, cp: topLine.cp, bestMove: topLine.bestMoveUci || null,
      depth, createIfMissing: true })` using the rank-1 line (`lines.find(l => l.rank === 1)`),
      writing the best-found evaluation back to the analyzed position itself — every run, not only
      when a played-move match is found (this fix is independent of the "drop played-move-priority"
      step above, which only affects *which lines are displayed*, not this missing write-back).
- [x] **Bug fix — "Analyze Position"'s own-position write-back could be silently rejected by the
      depth-guard when a value already existed at the identical depth**, even though the value
      differed (e.g. from an earlier `deepenPopularPositions` cron pass). Confirmed live: analyzing
      the position after `10.Nf1` (Black to move) found top line `Ne7` at `+0.32` depth 17 — the
      move list's own `10.Nf1` row stayed at its old `+0.60 (16)`. Direct `SELECT` confirmed the
      position already had a stored value at depth 17 (`+0.38`, from elsewhere) — `upgradePositionEvaluation`'s
      guard (`WHERE eva_depth < EXCLUDED.eva_depth`) is strict, so an equal-depth write is always
      rejected regardless of value, and the just-run analysis's own result (`+0.32`) never landed.
      Fix (per user decision): added an optional `force?: boolean` to `upgradePositionEvaluation`
      (`src/lib/analysis/chessdb.ts`) that bypasses the depth-guard on both the `teva_evaluations`
      upsert and the `tgev_game_evals` cascade — used only by `persistAnalysisLines`' own-position
      write-back (the top-ranked line's score written back to the analyzed `fen` itself), so an
      explicit, just-run "Analyze Position" always reflects its own result. Every other caller
      (cron `enrichPositionsStockfish`/`deepenPopularPositions`, `deepenUncoveredMoves`, the
      per-candidate-line loop in `persistAnalysisLines`) keeps the strict guard, so a background
      pipeline pass re-hitting the same depth tier can't cause a value to jitter between runs.
- [x] **Remove `deepenUncoveredMoves` and the live habits refresh entirely — "Analyze Position"
      should touch only what's explicitly requested, and evaluation writes should never reference
      which move was actually played.** Per user decision: a position's evaluation is a property of
      that position, independent of any game's choice of subsequent move; there is no legitimate
      reason to single out "the move actually played" for extra evaluation just because the
      multi-pv search didn't happen to cover it. What *does* need to stay in sync — the delta
      (`gam_cp_change`) between a position and its before/after neighbors — is already handled
      generically by `upgradePositionEvaluation`'s existing cascade, for every game that reached
      that exact transition, with no reference to "the played move" anywhere in that path.
      1. **Delete `deepenUncoveredMoves` entirely** (`ChessBoardView.tsx`) — its call from
         `startDeepAnalysis`'s completion handler, and the function itself (confirmed via grep: no
         other call sites). *(Partially done outside `#code` — reverted to leave-as-is per user
         choice: the call and the now-unused `analyzedMoveSummary` variable were already removed:
         `startDeepAnalysis` no longer captures `moveSummary` or calls `deepenUncoveredMoves`. The
         `deepenUncoveredMoves` function definition itself is still present but now unreferenced —
         deleting it is the remaining step.)*
      2. **Remove the live `refreshHabitsForPosition` cascade — user decision: do not update habits
         live; let the nightly `buildHabits()` pipeline rebuild pick up cp changes instead.**
         - `src/lib/analysis/chessdb.ts`: remove the `import { refreshHabitsForPosition } from
           './buildHabits'` and the `try { await refreshHabitsForPosition(posId) } catch {...}`
           block inside `upgradePositionEvaluation`. Update that function's header comment (which
           currently describes the habits cascade as one of its responsibilities) to remove that
           claim.
         - `src/lib/analysis/buildHabits.ts`: delete `refreshHabitsForPosition` entirely (becomes
           fully dead code once its one caller is removed). Simplify `fetchHabitAggregates` back to
           an unscoped-only query — drop the `posId?` parameter and the `posFilter`/conditional
           param-push logic, since nothing will call it with a position scope anymore. Update its
           header comment (currently says "shared by buildHabits ... and refreshHabitsForPosition").
- [x] **Architecture: replace `teva_evaluations` with `tpose_positions_eval`, keyed directly on
      `pos_id` (no separate surrogate identity), per full 4-table review** (`tgd → tgam → tpos →
      teva → tgev`/`thab`) — see plan discussion history for the reasoning: `eva_evaid` (teva's own
      `IDENTITY` PK) was found to have zero functional use anywhere in the codebase (every
      reference either checks `RETURNING eva_evaid`'s row-existence or uses `eva_evaid IS NULL` as
      an anti-join idiom — never the value itself), while `eva_pos_id` already uniquely identifies
      each row 1:1 with `tpos_positions`. Keying the new table directly on the position's own
      `pos_id` removes the dual-identity confusion entirely (there's only one id to reason about).
      **Phased — old table stays until everything is verified working, per user decision:**
      1. **New table schema (agreed):**
         ```sql
         CREATE TABLE public.tpose_positions_eval (
             pose_pos_id integer NOT NULL,
             pose_cp integer,
             pose_depth smallint,
             pose_best_move text
         );

         ALTER TABLE ONLY public.tpose_positions_eval
             ADD CONSTRAINT tpose_positions_eval_pkey PRIMARY KEY (pose_pos_id);
         ```
         Column order: key first, then `pose_cp`+`pose_depth` together (the evaluation and its
         confidence), `pose_best_move` last (supplementary). No separate index needed — the PK
         already indexes `pose_pos_id`. `pose_pos_id` is not `GENERATED ... IDENTITY` — its value
         is always the exact `tpos_positions.pos_id` it corresponds to, mirrored at write time.
      2. **Data migration (agreed, user has created the table manually and confirmed schema):**
         verified first that every `teva_evaluations` row has a non-null `eva_pos_id` matching a
         real `tpos_positions.pos_id` (47,680 rows, 0 nulls, 0 orphans — confirmed via direct
         `SELECT`, not assumed) — safe to migrate directly:
         ```sql
         INSERT INTO tpose_positions_eval (pose_pos_id, pose_cp, pose_depth, pose_best_move)
         SELECT eva_pos_id, eva_cp, eva_depth, eva_best_move
         FROM teva_evaluations;
         ```
         Verify row counts match afterward (`SELECT COUNT(*) FROM teva_evaluations` vs.
         `tpose_positions_eval`, both should read 47,680 as of this migration).
      3. **`scripts/schema.sql` updated** — `tpose_positions_eval` added (right after
         `tpos_positions`, matching alphabetical table ordering), matching exactly the schema
         agreed in step 1.
      4. **Every functional read/write ported from `teva_evaluations`/`eva_*` to
         `tpose_positions_eval`/`pose_*`**, confirmed via `tsc --noEmit` after each stage —
         `teva_evaluations` itself was never touched (still fully intact, per the phased
         approach):
         - `chessdb.ts`: `MoveRow`/`EvaluationRow` interfaces renamed (`eva_cp`/`eva_depth` →
           `pose_cp`/`pose_depth`; `EvaluationRow`'s `eva_evaid` field dropped entirely, replaced
           with `pose_pos_id` — matches the new table's actual PK, no separate identity to carry).
           `getMovesForPosition`, `getMoveSummaryForPosition`, `saveEvaluation`,
           `getEvaluationForPosition`, `upgradePositionEvaluation` (including its
           `recompute_cp_change` and depth-guard/`force` logic), `getPositionEvaluationsBulk`
           (output shape `{cp, bestMove, depth}` unchanged — only its internal query changed),
           `getHabitsData`, `getPositionDetail` — all repointed to `tpose_positions_eval`/`pose_*`.
         - `enrichPositionsStockfish.ts`: `countRemainingPositions`, `getResultingFensToEvaluate`,
           `bulkUpdateCpLoss`, `enrichPositionsStockfish`'s Phase 1 query, `deepenPopularPositions`,
           `countRemainingPopularPositions`, `findExistingEvals` — all ported. The `eva_evaid IS
           NULL` anti-join idiom became `pose_pos_id IS NULL` (works identically — a failed
           `LEFT JOIN` leaves every column of the unmatched side `NULL`, not just an identity
           column).
         - `purgePositions.ts`: the `DELETE FROM teva_evaluations` step now deletes from
           `tpose_positions_eval` instead.
         - `pipelineStatus.ts`: `refreshStatus`'s combined query and `refreshStep4` ported.
         - UI consumers of the renamed `MoveRow`/`EvaluationRow` fields: `ChessBoardView.tsx`
           (`m.eva_cp` → `m.pose_cp` in "Moves From This Position"), `PositionDetail.tsx`
           (`posEval?.eva_cp`/`eva_best_move` → `pose_cp`/`pose_best_move`, `m.eva_cp` →
           `m.pose_cp`). `MoveTree.tsx` uses an unrelated type (`MoveEvaluation.cp`/`.depth`) — no
           change needed.
         - Comment-only references (no functional change) updated for accuracy in `games.ts`,
           `stockfish.ts`, `ChessBoardView.tsx`, `owner/constants/page.tsx` (two `consumers`
           descriptions), `owner/pipeline/page.tsx` (`SQL_STATUS_4`/`SQL_STATUS_DEEPEN_POPULAR`
           display strings, step labels, `MyHelpStep` input/output text), `PipelineHelp.tsx`
           (`ROW_COUNT_SQL` display string, structured help text).
         - `buildHabits.ts` needed **no changes** — confirmed during the earlier 4-table review
           that it aggregates entirely from `tgam_game_positions`/`tgd_gamesdecon`/`tpos_positions`
           and never references `teva_evaluations`/`tpose_positions_eval` directly.
      5. **Deliberately deferred, not done in this pass — flagged as a separate follow-up:**
         `src/ui/dataflow/sections.tsx` and `src/ui/dataflow/PipelineDiagram.tsx` (the
         `/owner/dataflow` page's rendered documentation and diagram) still describe
         `teva_evaluations`/`eva_*` throughout — a genuinely large amount of prose across many
         sections, not a mechanical rename. Per the global CLAUDE.md rule that project
         documentation (as opposed to Claude's own working files) goes through its own
         `#plan`/`#code` gate rather than riding along with a code change, this needs its own pass
         once agreed.
      6. **Not yet done — separate, later step, only once everything above is verified working
         in the app:** drop `teva_evaluations` entirely. Requires explicit agreement first, per the
         phased approach.
- [x] **Bug fix — `runAnalysis` ("Analyze Game") wasted two DB round trips per run that its own
      cache already made unnecessary.** Found via a dev-server request log showing a duplicated
      pair of `getMoveSummaryForPosition`/`getGamesForPosition` calls after a re-analysis that
      should have found nothing to update (every ply already cached at/above the requested depth).
      Confirmed the per-ply Stockfish skip itself was correct (`stockfish.ts`'s `analyzeGame`
      checks `cachedEvals` before ever calling `evaluate()`) — the waste was in `runAnalysis`'s own
      tail end (`ChessBoardView.tsx`), not in the engine:
      1. `refreshPositionPanels()` was called twice in a row, unconditionally, doing the identical
         thing both times — deleted the redundant second call.
      2. The final resulting position's `upgradePositionEvaluation` call fired unconditionally on
         every run, even when that position was already cached at/above the requested depth (the
         depth-guard inside the function would just reject the write, but the DB round trip still
         happened for nothing) — now skipped entirely when `cachedEvals[truncateFen(finalPosition.fen)]`
         already covers it, mirroring the exact check the per-ply loop already does.
- [x] **Bug fix — `saveGameEvaluations` did one `INSERT` per ply instead of one batched
      multi-row `INSERT`.** Measured via dev-server request log: ~1895ms for a ~20-ply
      "Analyze Game" range that had nothing new to compute (every ply already cache-covered) —
      confirmed via `getPositionEvaluationsBulk` returning in 1ms that Stockfish/caching weren't
      the cause; the delay was entirely N sequential `table_write` round trips inside
      `saveGameEvaluations` (`games.ts`). Fixed by keeping the same delete-then-reinsert semantics
      (full replace of this game's row set) but batching the insert into a single multi-row
      `INSERT ... VALUES (row1),(row2),...` via `table_query`, matching the pattern already used
      elsewhere in this codebase (`insertGamePositions` in `buildPositionTree.ts`,
      `upsertHabitAggregates` in `buildHabits.ts`) — one round trip instead of N.
- [x] **Bug fix — "Analyze Game" always paid full Stockfish engine startup cost (Worker creation +
      WASM load + UCI handshake) even when a re-analysis range turned out to need zero real
      Stockfish evaluation** (every ply already cached at/above the requested depth). Fixed by
      making `StockfishEngine.analyzeGame()`'s own `.init()` lazy — called only right before the
      first position that actually needs a fresh `evaluate()` call, not unconditionally by the
      caller before `analyzeGame()` even starts. `runAnalysis` (`ChessBoardView.tsx`) still
      constructs the lightweight engine wrapper object eagerly (trivial, no `Worker` involved) but
      no longer calls `.init()` itself. Scoped to `analyzeGame()`/"Analyze Game" only — "Analyze
      Position" (`startDeepAnalysis`) always needs the engine (an explicit multi-pv search with no
      cache-skip path), so its own eager `.init()` is unchanged.
      - **Considered and withdrawn during design**: also switching the per-ply write-skip check
        (`onMoveEvaluated` callback) from comparing against local `evaluations[]` to comparing
        against `cachedEvals` instead, on the theory that local React state could be stale relative
        to the database (cross-game cascades, background cron, other tabs/sessions). **Per user
        decision, this was rejected as unlikely and not worth defending against** — cross-tab/
        cross-session staleness is the user's own responsibility to handle (refresh the other tab),
        not something the app needs to code around. Also found a genuine wrinkle arguing the same
        direction: `cachedEvals` is fetched once at the very start of a run, so for a transposition
        revisiting an identical position later in the same range, local `evaluations[]` (updated
        live during the run) can actually be *more* current than the once-fetched cache, not less.
        The `merged[idx]` check stays as it was.
- [ ] **New feature: persist "Engine Lines" multi-PV results so an expensive deep analysis (e.g.
      8+ minutes at depth 40) is never lost/re-run** — position-scoped (keyed via `tpos_positions`,
      not per-game, matching this session's whole "one position, one canonical answer" fix), new
      table, per user decision. **On hold — user decision 2026-08-18: do not code this at all until
      the real bugs just fixed (the off-by-one mirror bug and the earlier teva/tgev consistency
      work) have been tested and confirmed working.** Not a `#code` target until that testing is
      done and the user lifts the hold.
      - **New table** `telv_eval_lines` (`scripts/schema.sql` — user runs this manually via
        pgAdmin4, not executed here):
        ```sql
        CREATE TABLE public.telv_eval_lines (
            elv_elvid integer NOT NULL,
            elv_pos_id integer NOT NULL,
            elv_rank smallint NOT NULL,
            elv_cp integer NOT NULL,
            elv_depth integer NOT NULL,
            elv_best_move_uci text,
            elv_best_move_san text,
            elv_line_uci jsonb,
            elv_line_san jsonb
        );

        ALTER TABLE public.telv_eval_lines ALTER COLUMN elv_elvid ADD GENERATED BY DEFAULT AS IDENTITY;

        ALTER TABLE ONLY public.telv_eval_lines
            ADD CONSTRAINT telv_eval_lines_pkey PRIMARY KEY (elv_elvid);

        ALTER TABLE ONLY public.telv_eval_lines
            ADD CONSTRAINT telv_eval_lines_pos_rank_key UNIQUE (elv_pos_id, elv_rank);

        CREATE INDEX idx_telv_pos_id ON public.telv_eval_lines USING btree (elv_pos_id);
        ```
        One row per `(position, rank)` — rank 1 is the best line, matching (and duplicating,
        deliberately, for uniformity across ranks) what `teva_evaluations` already stores for rank
        1's cp/best-move. `elv_line_uci`/`elv_line_san` store the full continuation as JSON arrays,
        matching `tgev_game_evals.gev_best_line`'s existing `jsonb` convention. No FK (per project
        convention). **Not** included in `purgeStaleReachOnePositions`'s cleanup, per user decision
        — these rows are deliberately left orphaned if their position is ever purged, since the
        analysis work itself is valuable regardless of the position's later reach/purge status.
      - **Write path**: new `saveEvalLines(fen, depth, lines)` in `src/lib/analysis/chessdb.ts` —
        resolves/creates the position via the existing `getOrCreatePosition` helper, then upserts
        one row per line (`INSERT ... ON CONFLICT (elv_pos_id, elv_rank) DO UPDATE ... WHERE
        elv_depth < EXCLUDED.elv_depth`, same depth-guard pattern as every other write this
        session). Called from `persistAnalysisLines` (`ChessBoardView.tsx`) alongside its existing
        per-line `upgradePositionEvaluation` calls, passing the full `lines` array (not just the
        rank-1 line).
      - **Read/auto-display path**: new `getEvalLinesForPosition(fen): Promise<MultiPvResult[]>` in
        `chessdb.ts`. New `useEffect` in `ChessBoardView.tsx` (keyed on `[currentNode, tree]`, same
        trigger as the `mastersData` effect) that fetches stored lines for the current position and
        populates `deepAnalysisData` with them if found — guarded on `deepAnalysisData` being null
        (never clobbers an in-progress or just-completed live run), so selecting a position that
        already has deep stored analysis shows "Engine Lines" immediately without needing to click
        "Analyze Position" again. This is **not** a repeat of the earlier-removed buggy
        pre-populate — that one reconstructed an approximation from unrelated per-move game data;
        this one displays genuine, previously-computed multi-PV results for this exact position.
- [x] **Bug fix — a never-analyzed game showed a completely blank move list, even for positions
      it shares with an already-analyzed game** (two rounds — the first fix was itself flawed):
      - Round 1: `getGameEvals` was entirely driven by `tgev_game_evals` row count for that one
        game — a game with zero `tgev` rows (never had "Analyze Game" run on it) returned an empty
        array regardless of what `teva_evaluations` already knew about shared positions. Fixed by
        deriving the game's own FEN sequence from its PGN instead, checking `teva_evaluations` for
        every position (teva preferred, `tgev` fallback) — but this first version still **stopped
        the whole array at the first ply where neither source had data**.
      - Round 2 (user correction): `teva_evaluations` is *deliberately* a subset of positions —
        moves 1..`MIN_ANALYSIS_MOVE`-1 (opening theory) are intentionally never cached there, by
        design, not a bug. So a gap at moves 1-4 was truncating away moves 5-16+ that likely *did*
        have real teva data — confirmed live (see Changes below): a never-analyzed game sharing
        1503's opening had genuinely nothing for moves 1-3, but resolved 11 of its first 20 plies
        from `teva_evaluations` once the truncation was removed. Fixed by resolving each ply
        **independently** (a gap no longer truncates the rest) and, centrally inside
        `upgradePositionEvaluation` itself, refusing to write `teva_evaluations` for any position
        whose own FEN fullmove number is below `MIN_ANALYSIS_MOVE` — applies to every existing
        write-back call site automatically, no backfill involved (explicitly not wanted).
      - Still read-only for the *lookup* side — `getGameEvals` never creates a `teva_evaluations`
        or `tgev_game_evals` row; a ply with no record in either source is simply `undefined` in
        the returned array (not a truncation point), and downstream consumers (`ChessBoardView.tsx`
        blunder/mistake/inaccuracy counts, `existingDepthRange`, `saveGameEvaluations`) were
        audited/updated to skip `undefined` entries instead of crashing on them.
- [x] **Comprehensive variable-naming pass across `stockfish.ts`, `ChessBoardView.tsx`,
      `games.ts`, `analysisTree.ts`, `MoveTree.tsx`, `enrichPositionsStockfish.ts`,
      `analyze/page.tsx`** — per new global CLAUDE.md rule ("Composite/collection variables must
      name their source, not just their shape"), triggered by a real bug this session where a
      shape-only name (`cachedEvals`) hid that it was silently scoped to only one of two tables
      that jointly determined whether Stockfish needed to re-run. Full renaming table (see global
      CLAUDE.md's new section for the complete reasoning and the "Move vs. Ply vs. FEN" distinction):
      - `MoveEvaluation` (exported type) → `PlyEvaluation`, everywhere it's used.
      - `evaluations`/`merged` (state + working copies, pose-or-gev-or-stock blend) → `plyEvals`/
        `mergedPlyEvals`.
      - `moveEval` (callback params/locals) → `plyEval`; `onMoveEvaluated` → `onPlyEvaluated`.
      - `positionEvals` (`analyzeGame`'s internal pose-or-stock blend, N+1 entries) →
        `mergedPlyPositionEvals`.
      - `cachedEvals`/`tevaByFen` (pose-only, keyed by FEN) → `poseEvals`; `finalCached`/`cached`/
        `teva` (single pose lookups) → `finalPoseEval`/`poseEval`.
      - `rawCp`/`rawDepth` (gev-only values) → `gevCp`/`gevDepth`; `useTeva` → `usePose`.
      - `bestCp`/`bestMove`/`bestPv`/`results`/local `cp`/`pv`/`currentMaxDepth` (raw Stockfish
        engine output, pre-database — in both `stockfish.ts` and, found during the sweep,
        `enrichPositionsStockfish.ts`'s three separate `sf.evaluate()`/`engine.evaluate()` call
        sites) → `stock`-rooted: `stockBestCp`/`stockBestMove`/`stockBestPv`/`stockResultsByRank`/
        `stockCp`/`stockPv`/`stockMaxDepth`.
      - `storedEvals`/`_evaluations` (the `analyze/page.tsx` → `ChessBoardView.tsx` bridge property)
        → `storedPlyEvals`/`_plyEvals`.
      - Stale prose references to "teva"/"tgev" in comments updated to "pose"/"gev" throughout.
      - `src/ui/dataflow/sections.tsx`/`PipelineDiagram.tsx` (the `/owner/dataflow` page) initially
        left out of this pass as substantive project documentation needing its own `#plan`/`#code`
        — per user follow-up ("simply a rename exercise"), corrected in the same session: every
        `teva_evaluations`/`eva_*` reference → `tpose_positions_eval`/`pose_*`, the
        `TevaEvaluationsSection` component → `PoseEvaluationsSection`, and the diagram's `teva` node
        id/label/edges → `pose`. Confirmed zero remaining `teva` references anywhere in `src/`
        afterward.
- [x] **"Analyze Position" should also durably persist into `tgev_game_evals` for the currently-open
      game, not just `tpose_positions_eval`** — per user decision, closing the gap identified in the
      `tgev`-purpose discussion: `tgev` is the durable, never-purged, per-game safety net for
      analysis work (`pose` is deliberately incomplete and purge-vulnerable), but today only
      "Analyze Game" (`saveGameEvaluations`) actually creates new `tgev` rows — "Analyze Position"'s
      own-position write-back only touches `pose`. **The hard constraint, explicitly agreed: we
      cannot write to `tgev` for a move that was not actually played in the game** — `tgev`'s schema
      (`gev_san` `NOT NULL`, `UNIQUE(gev_gdid, gev_ply)`) is a record of one game's real history, not
      a place to store hypothetical lines.
      1. **`upgradePositionEvaluation`** (`chessdb.ts`) gets a new optional `gameContext?: { gdid:
         number; ply: number; san: string }` param. When provided, after the existing `pose`
         upsert + `gam_cp_change` recompute, also upsert `tgev_game_evals` for `(gameContext.gdid,
         gameContext.ply)`: `gev_san`/`gev_fen_after` from the caller-supplied context/`fen`,
         `gev_cp`/`gev_depth` from `data`, `gev_cp_change` computed the same way the existing
         cross-game cascade already does (`prev.gev_cp` via a same-game, `gev_ply - 1` lookup,
         sign depending on `ply % 2`). Same depth-guard/`force` semantics as the `pose` write —
         "tpose AND tgev is updated if the depth check allows," per user's own framing. The
         existing cross-game cascade (updates *other* games' already-existing rows) stays
         unchanged and runs afterward as today; it naturally no-ops against the row this new
         upsert just wrote (equal depth, guard doesn't re-fire).
      2. **`persistAnalysisLines`** (`ChessBoardView.tsx`): the own-position write-back (topLine →
         `fen` itself) always passes `gameContext: { gdid, ply: analyzedPly, san:
         tree.mainLine[analyzedPly].san }` — unambiguous, since `fen` is by construction this
         game's own position at `analyzedPly`.
      3. **`persistAnalysisLines`**'s per-candidate-line loop: only passes `gameContext` for the one
         candidate (if any) whose move matches `tree.mainLine[analyzedPly + 1]?.san` — i.e., the
         line that's actually what the game played next. Every other candidate stays `pose`-only,
         same as today, since it's a hypothetical the game didn't actually play.

## Changes
### src/ui/board/ChessBoardView.tsx
- Widened the 3-column `/analyze` layout from 440px to 480px per column: the grid template,
  the board column's `w-[440px]` div, the board's `boardStyle` width/height, the moves column div,
  and the analysis column div.
- Removed `xl:h-[780px] overflow-y-auto` from the moves column div so it grows to its full
  content height instead of scrolling internally within a fixed-height box.
- Changed the "Moves From This Position" `MyBox` title to just `{currentMoveLabel}` (dropping the
  "Moves From This Position —" prefix).
- Changed the "Masters" `MyBox` title to plain `'Masters'` (dropping the `— ${currentMoveLabel}`
  suffix).
- Added `selectedMastersMove` state; clicking a row in the Masters moves table now selects/
  deselects that move (by `uci`), highlighting it and filtering the Top Games list to it.
- Split the "Top games" section out of the Masters `MyBox` into its own sibling `MyBox` titled
  `'Top Games'`, replacing the old small `<p>Top games</p>` label.
- Added a "Move" column to the Top Games table, showing the SAN for each game's `uci` (looked up
  against `mastersData.moves`, falling back to the raw `uci` if unmatched).
- Replaced the static "Filters Top Games only…" paragraph with a `nextjs-shared/MyHelpField`
  (hover `?` icon) carrying the same text, placed next to the "Min rating" input.
- Widened the analysis column (Column 3) from 480px to 600px, decoupled from the board/moves
  columns which stay at 480px, to give the Top Games table's player-name columns room to stop
  folding.
- Renamed the "Top Games" `MyBox` title to `'Games'`.
- Removed the Min rating filter: deleted `mastersMinRating` state and its `MyInput`, leaving only
  the `selectedMastersMove` match in `filteredTopGames`'s predicate. Removed the now-unused
  `MASTERS_EXPLORER_MIN_RATING` import. Updated the empty-state message to "No games match the
  selected move."
- Moved the `MyHelpField` to the top-right of the "Games" panel body (since `MyBox`'s `title` only
  accepts a plain string), with new text describing that Lichess — not this app — selects and
  counts the "top" games.
- Simplified the "Position Analysis" panel: the idle-state button is now always labeled
  `'Analyze Position'` (dropped the separate `'Resume'` label and the
  `!deepAnalyzing && !deepAnalysisData` special case), and removed the redundant
  `Depth: {deepAnalysisData?.depth}` readout — the "Depth" dropdown is now the only depth
  indicator.
- Added a shared `Position Analysis — {currentMoveLabel}` heading (plain text, not a `MyBox`)
  above the 5 position-specific panels; "Game Analysis" stays separate above it (whole-game, not
  position-specific).
- Retitled the 5 position-specific panels to drop the repeated position label: "Stockfish"
  (was "Position Analysis — <move>"), "Moves Played" (was the bare move label), "Games Played"
  (was "Games — <move>"), "Master Moves" (was "Masters"), "Master games" (was "Games"/"Top Games").
- Reordered "Games Played" (the `selectedPositionMove`-scoped DB games list) to sit immediately
  after "Moves Played", instead of last in the column.
- Removed the now-unused `getNextMoveLabel` helper function (only caller was the old
  "Games — <move>" title).
- Reworked "Games Played" to always fetch/show every one of the player's games for this position
  (`getGamesForPosition(fen, player)`, no move argument), filtering to the selected move
  client-side (`positionGames.filter(g => g.move_played === selectedPositionMove)`) only when a
  "Moves Played" row is highlighted — matches the "Master games" pattern instead of not
  rendering at all until a row is clicked. `refreshPositionPanels()` now always refetches
  `positionGames` too (dropped its `if (selectedPositionMove)` gate). Empty states: "No games
  reached this position." vs "No games match the selected move."
- Fixed the "Moves Played" comment, which incorrectly said its query covered "all tracked
  players" — it's actually scoped to just the one player, same as `getGamesForPosition`.
- Changed the shared heading from `Position Analysis — {currentMoveLabel}` to
  `Position Analysis {currentMoveLabel}` (dropped the em dash, kept the move number).
- Moved the "Game Analysis" `MyBox` from the top of Column 3 (Analysis) to the bottom of
  Column 1 (Board), after the "Branch indicator" section — Column 3 now starts directly with the
  "Position Analysis {move}" heading and its 5 panels.
- Removed the "Engine Lines" pre-populate behavior: deleted `buildSavedAnalysisFromMoveSummary`
  and the `useEffect` that called it on `[moveSummary]`. "Engine Lines" now only ever shows
  genuine output from an actual "Analyze Position" run. Also dropped the now-dead "From saved
  analysis" branch in the stats block — the nodes/nps/time line now always shows once
  `deepAnalysisData` exists.
- "Master Moves"/"Master games" now only fetch/render once a position has actually been clicked
  (`currentNode` set): the `mastersData` fetch effect no longer falls back to `tree?.root.fen`,
  the "Master Moves" `MyBox` is wrapped in `{currentNode && (...)}`, and "Master games" gates on
  `currentNode && mastersData && mastersData.topGames.length > 0`.
- "Games Played": removed the `(current)` text badge; the current game's row now gets a
  `border-l-4 border-blue-500` accent instead, layered on top of the existing pink/yellow
  `resultMismatch` background. Added a pink/yellow pill legend above the table explaining what
  those two row colors mean ("Winning position, lost/drawn" / "Losing position, won").
- Added `collapsible` to all 5 "Position Analysis" panels' `<MyBox>` usages (Stockfish, Moves
  Played, Games Played, Master Moves, Master games), now that `nextjs-shared`'s `MyBox` supports
  it — each gets a chevron-toggle title bar, `defaultOpen` left at its default (`true`).
- `persistAnalysisLines`: added `createIfMissing: true` to its `upgradePositionEvaluation` calls;
  removed the separate direct `upgradeGameEval` DB write from the "played move" block (that
  position's `tgev_game_evals` row is now kept in sync by `upgradePositionEvaluation`'s own
  cascade instead) — the local React-state update (`setEvaluations`/`setTree`) for immediate UI
  feedback stays.
- **`persistAnalysisLines`**: fixed the actual root cause of the O-O-O "stuck value" bug — it now
  also writes the top-ranked (`rank === 1`) line's score back to `fen` itself (the position that
  was actually analyzed), not just to the positions one ply deeper reached by each candidate line.
  The local React-state mirror was updated to match — it now uses `topLine.cp` (not the old
  `playedLine.cp`, which was itself one ply too deep and was corrupting the local `cpChange`/
  `cpLoss` math by comparing across two moves' worth of change instead of one), gated on
  `existingPlyEval.depth < depth`.
- **`processUpdate`** (inside `startDeepAnalysis`): "Engine Lines" now always shows the top N
  objectively-best lines (`unique.slice(0, numLines)`) at every `Lines` setting, dropping the old
  played-move-priority branching entirely — the played move's eval is already shown in "Moves
  Played". `_isActualMove` is still tagged when a displayed line happens to match the played move
  (for `AlternativeLines.tsx`'s highlight), just never force-included.
- **`startDeepAnalysis`**: since a line is no longer force-added beyond the top N, requests exactly
  `numLines` lines from the engine instead of `numLines + 1`. Widened the "Lines" dropdown from
  `['3','4','5']` to `['1','2','3','4','5']`.
- **`runAnalysis`**: restructured to update live, ply by ply, as each result comes back from the
  engine — via `analyzeGame`'s new `onMoveEvaluated` callback — instead of only once after the
  whole From/To range finishes. Each ply's `upgradePositionEvaluation` call (fire-and-forget, not
  blocking the engine) and a `refreshPositionPanels()` call now happen as soon as that ply's result
  is available; the old post-loop `upgradePositionEvaluation` loop over every ply is gone (already
  done live) — only the range's final resulting position (never anyone's "before") still gets its
  own explicit upgrade call at the end, followed by one final `refreshPositionPanels()`.
  `saveGameEvaluations`'s single bulk delete+reinsert of the whole range stays as the final step.
- Removed the now-unused `upgradeGameEval` import (function deleted from `games.ts`) and the
  now-unused `results` destructure from `runAnalysis` (superseded by the live per-ply callback).
- `evaluations` state is now typed `(MoveEvaluation | undefined)[]` (matching `getGameEvals`'
  return type) — gaps are expected wherever `teva_evaluations` deliberately has no cached data
  (moves 1..`MIN_ANALYSIS_MOVE`-1) and neither does `tgev_game_evals` for that specific game.
  Audited every consumer for null-safety: `blunders`/`mistakes`/`inaccuracies` counts now use
  `e?.classification`; `existingDepthRange`'s depth extraction now filters out `undefined` entries
  before mapping. (`persistAnalysisLines` and `runAnalysis`'s own depth-guard checks were already
  null-safe — both already gated on the entry being truthy before reading its fields.)
- Both Depth controls (Game Analysis's `stockfishDepth`, Stockfish panel's `deepAnalysisDepth`)
  changed from a `MySelect` dropdown (fixed options `20/22/24/26/28/30/40`) to the new shared
  `DepthInput` component (see `src/ui/board/DepthInput.tsx` below), so any depth can be typed
  directly (e.g. 31) without needing a matching dropdown option to exist. Removed the now-unused
  direct `STOCKFISH_DEPTH_INPUT_MAX` import (only `DepthInput.tsx` needs it now).
- **`startDeepAnalysis`**: fixed the off-by-one bug — `analyzedPly` is now `currentPly - 1` (was
  `currentPly`, a 1-indexed move-count being used directly as a 0-indexed array index), so
  `persistAnalysisLines`' local-state mirror now writes the analyzed position's own top-line
  evaluation into its own `evaluations`/`tree.mainLine` slot instead of the next move's.
- **`deepenUncoveredMoves`**: now takes an additional `ply` parameter (the analyzed position's own
  ply, passed from `startDeepAnalysis` as `analyzedPly`) and mirrors a successful write into local
  `evaluations`/`tree.mainLine` state immediately, matching `persistAnalysisLines`' own pattern —
  but only for the one candidate (if any) whose move actually matches what was played next in the
  currently-open game (`tree.mainLine[ply + 1]?.san === row.move_played`), since most "uncovered"
  candidates belong to other games' different move choices from the same position, not this game's
  own continuation. Previously these writes were DB-only, visible in the move list only after a
  page reload.
- **`persistAnalysisLines`**: the own-position write-back (top-ranked line's score written to the
  analyzed `fen` itself) now passes `force: true` to `upgradePositionEvaluation`, so it always
  reflects a just-run analysis's result even when a value already existed at the identical depth
  from elsewhere (e.g. an earlier cron pass) — previously a same-depth-different-value write was
  silently rejected by the depth-guard, and neither the database nor the local move-list mirror
  ever updated. The per-candidate-line loop (writing one ply deeper for each displayed line) is
  unaffected — still the strict guard.
- **Deleted `deepenUncoveredMoves` entirely** (its call from `startDeepAnalysis`'s completion
  handler, and the function itself) — per user decision, a position's evaluation must never
  reference which move was actually played in any particular game; "Analyze Position" now touches
  only the explicitly-requested candidate lines and the analyzed position itself. Also removed the
  now-unused `analyzedMoveSummary` capture (`const analyzedMoveSummary = moveSummary`) from
  `startDeepAnalysis`, which existed only to feed that call.
- **`runAnalysis`**: removed the duplicate second `refreshPositionPanels()` call at the end (was
  called twice in a row, unconditionally, doing the same thing both times). The final resulting
  position's `upgradePositionEvaluation` call is now skipped entirely when `cachedEvals` already
  covers it at/above the requested depth (`finalCached.depth < depth` check), instead of firing
  unconditionally every run and relying on the depth-guard to reject the write after the fact.
- **`runAnalysis`**: no longer calls `engine.init()` itself — still constructs the lightweight
  `StockfishEngine` wrapper object if `engineRef.current` doesn't exist yet, but leaves
  initialization to `analyzeGame()`'s own lazy `init()` call, so a fully-cached re-analysis never
  pays engine startup cost.
- **`persistAnalysisLines`**: the own-position write-back (topLine → `fen` itself) now always
  passes `gameContext: { gdid, ply, san: tree.mainLine[ply].san }` to `upgradePositionEvaluation`
  (guarded on `gdid`/`tree.mainLine[ply]` existing) — unambiguous, since `fen` is by construction
  this game's own position at `ply`. The per-candidate-line loop now computes `playedNode`
  (`tree.mainLine[ply + 1]`, this game's actual next move if any) and `playedLine` (whichever
  displayed line's `bestMoveSan` matches it), and only passes `gameContext: { gdid, ply: ply + 1,
  san: playedNode.san }` for that one matching line — every other candidate stays
  `tpose_positions_eval`-only, since it's a hypothetical the game didn't actually play and
  `tgev_game_evals` must never record a move that wasn't really made.

### src/lib/stockfish.ts
- **Critical bug fix**: `evaluate()` now explicitly sends `setoption name MultiPV value 1` before
  searching, and filters incoming `info` lines to `multipv 1` (or absent) only when updating
  `bestCp`/`bestMove`/`bestPv` — previously a prior `startInfiniteAnalysis()` call on the same
  engine instance could leave `MultiPV` above 1, causing `evaluate()` to silently capture a
  secondary (non-best) line's score instead of the true best line's. Confirmed as the actual root
  cause of the O-O-O/`hxg4` depth-24-vs-30 discrepancy chased earlier this session.
- **`analyzeGame`**: refactored to build each ply's `MoveEvaluation` as soon as both its
  surrounding position evals are known (interleaved into the same loop that evaluates each
  position), instead of a separate pass after every position is evaluated — added an optional
  `onMoveEvaluated?: (moveEval, index) => void` callback, fired live for each ply as it completes.
  Output (`evaluations`/`finalPosition`) is unchanged, just computed incrementally.
- **`analyzeGame`**: removed its top-of-function `if (!this.worker || !this.ready) throw` guard —
  no longer requires the caller to have already initialized the engine. Added `if (!this.ready)
  await this.init()` immediately before its one real `this.evaluate(...)` call (inside the
  not-cached branch), so engine startup (`Worker` creation, WASM load, UCI handshake) only happens
  lazily, the first time it's genuinely needed — a re-analysis range fully covered by `cachedEvals`
  never initializes the engine at all. `evaluate()`/`startInfiniteAnalysis()` themselves are
  unchanged — still require external initialization, since "Analyze Position" always needs the
  engine regardless of caching.

### src/lib/analysis/chessdb.ts
- Made `getGamesForPosition`'s `move` parameter optional — when omitted, the `AND
  gp.gam_move_played = $3` clause is dropped so it returns every game (any move) the player
  reached this position through.
- Added `getOrCreatePosition` (private helper) — looks up `tpos_positions` by FEN, or inserts a
  new row (`pos_color`/`pos_move_num` derived directly from the FEN's own active-color/fullmove
  fields, matching `syncTposFromTgam`'s existing pattern) and returns its `pos_id`. Bug found live
  during testing: its lookup and re-select queries are textually identical, and `table_query`
  caches reads by default with no auto-invalidation on writes (this project's own documented
  gotcha) — the first lookup (before the row existed) cached an empty result, and since the INSERT
  never called `cache_clearTable`, the re-select hit that same stale cache entry and crashed on
  `created[0].pos_id` being undefined. Fixed by adding `skipCache: true` to both the lookup and
  re-select, plus a `cache_clearTable('tpos_positions', ...)` call after the insert. Also added
  `skipCache: true` to `upgradePositionEvaluation`'s own initial lookup for the same reason (a
  write-adjacent read that must never be stale).
- `upgradePositionEvaluation` is now the single driving function for every position-eval write in
  the app: added an optional `createIfMissing` param (uses `getOrCreatePosition` when no
  `tpos_positions` row exists yet); changed the `teva_evaluations` write from an `UPDATE`-only
  statement to an `INSERT ... ON CONFLICT (eva_pos_id) DO UPDATE ... WHERE
  teva_evaluations.eva_depth < EXCLUDED.eva_depth` (handles both "existing row, deeper" and
  "brand-new row" in one statement, preserving the original depth-guard); added a cascade,
  scoped to `gev_cp`/`gev_depth`/`gev_cp_change` only (never `gev_best_move*`), that updates
  every `tgev_game_evals` row for that exact position across every game, via a per-row
  depth-guarded `UPDATE ... FROM` joined to each row's own game's previous ply for `gev_cp_change`;
  added a best-effort call to `refreshHabitsForPosition` (from `buildHabits.ts`) so
  `thab_habits.hab_move_cp` stays in sync too.
- `upgradePositionEvaluation` now also refuses to write `teva_evaluations` for any position whose
  own FEN fullmove number is below `MIN_ANALYSIS_MOVE` (returns `false` immediately) — `teva` is
  deliberately never meant to cache opening theory, per user decision; centralizing this check here
  (rather than in each caller) makes it apply automatically everywhere `upgradePositionEvaluation`
  is called.
- Added an optional `force?: boolean` param — when true, bypasses the depth-guard on both the
  `teva_evaluations` upsert (`WHERE eva_depth < EXCLUDED.eva_depth` dropped) and the
  `tgev_game_evals` cascade (`AND m.gev_depth < $2` dropped), so an equal-depth value still
  overwrites instead of being silently rejected. Not set by default — every existing caller keeps
  the strict guard unless it explicitly opts in.
- Removed the live `refreshHabitsForPosition` cascade entirely (import and call) — per user
  decision, habits only ever update via the nightly `buildHabits()` pipeline rebuild, never live
  from an interactive analysis click. Updated the function's header comment to drop the habits-sync
  claim.
- Added an optional `gameContext?: { gdid: number; ply: number; san: string }` param — when given,
  upserts `tgev_game_evals` for that exact `(gdid, ply)` (insert if missing, update if present),
  with `gev_cp_change` computed the same way the existing cross-game cascade already does (a
  same-game `gev_ply - 1` lookup, sign depending on `ply % 2`). Same depth-guard/`force` semantics
  as the `tpose_positions_eval` write. Runs before the existing cross-game cascade, which naturally
  no-ops against the row this upsert just wrote (equal depth, guard doesn't re-fire). Per user
  decision: `tgev` is the durable, never-purged, per-game safety net for analysis work, so any
  position genuinely known to belong to a specific (game, ply) should land in both tables together
  — callers must only pass `gameContext` when the position is the game's own actual move at that
  ply, never for a hypothetical/unplayed line.

### src/lib/analysis/buildHabits.ts
- Refactored `buildHabits()`'s inline aggregate-query + upsert logic into two shared functions —
  `fetchHabitAggregates(posId?)` (accepted an optional position-scope filter) and
  `upsertHabitAggregates(aggregates, level)` — so the exact same formula (notably `hab_move_cp`'s
  "largest-magnitude occurrence" pick) is never duplicated between the full nightly rebuild and
  the (since-removed) scoped refresh.
- Added `refreshHabitsForPosition(posId)` — a scoped re-run of the same aggregate for just one
  position's habit rows, called from `upgradePositionEvaluation`'s cascade.
- **Reversed, per user decision**: deleted `refreshHabitsForPosition` entirely (habits must only
  ever update via the nightly `buildHabits()` rebuild, never live from an interactive analysis
  click) and simplified `fetchHabitAggregates` back to an unscoped-only query — dropped the
  `posId?` parameter and its `posFilter`/conditional param-push logic, since nothing calls it with
  a position scope anymore. Updated both functions' header comments accordingly.

### src/lib/analysis/purgePositions.ts
- `purgeStaleReachOnePositions`: added a `pos_move_num BETWEEN MIN_ANALYSIS_MOVE AND
  MAX_ANALYSIS_MOVE` condition to the purge-candidate seed query, exempting positions outside the
  normal position-tree build range (e.g. `upgradePositionEvaluation`'s write-back-created rows)
  from the reach-based purge rule, since they were never part of that reach-tracked system.

### src/lib/actions/games.ts
- Deleted `upgradeGameEval` (dead code — its one call site in `ChessBoardView.tsx` was replaced by
  `upgradePositionEvaluation`'s own cross-game cascade).
- `getGameEvals`: rewritten to be driven by the game's own FEN sequence (parsed from `gd_pgn` via
  `chess.js`), not by `tgev_game_evals` row count — a game with zero `tgev` rows (never analyzed)
  can now still show `teva_evaluations`-known positions it shares with other games. For each ply,
  `teva` is preferred whenever it has a record with depth ≥ `tgev`'s own (`getPositionEvaluationsBulk`,
  batched); `tgev`'s own value is the fallback. Return type is now `(GameEvalRow | undefined)[]` —
  a ply with no record in either source resolves to `undefined` **independently**, it no longer
  truncates the rest of the array (moves 1..`MIN_ANALYSIS_MOVE`-1 are expected gaps by design, and
  used to incorrectly cut off every move after them too). `cpBefore`/`cpChange`/`cpLoss`/
  `classification` are computed via a running fold, reset across a gap (no fabricated cpChange
  spanning an unknown ply). `gev_best_move`/`gev_best_move_san`/`gev_best_line` are always sourced
  from `tgev_game_evals` only (blank if no `tgev` row exists for that ply), since they describe the
  recommendation from the position *before* that ply, not a property of the resulting position.
  Removed the now-unused `STARTING_FEN` constant (superseded by deriving the actual starting FEN
  via `chess.js`).
- `saveGameEvaluations`: parameter type updated to `(GameEvalRow | undefined)[]`; now skips writing
  a row for `undefined` entries (no placeholder inserted) instead of assuming a dense array.
- **`saveGameEvaluations`**: batched into a single multi-row `INSERT` (via `table_query`) instead of
  one `table_write` call per ply — same delete-then-reinsert semantics, one round trip for the
  insert instead of N. Fixes a measured ~1895ms delay for a ~20-ply range with nothing new to
  compute.

### src/lib/constants.ts
- Removed the now-unused `MASTERS_EXPLORER_MIN_RATING` constant.
- Added `STOCKFISH_DEPTH_INPUT_MAX` (40) — ceiling for the two Depth number inputs in
  `ChessBoardView.tsx`. The floor deliberately reuses the existing `STOCKFISH_DEPTH` constant (16,
  the pipeline's own depth value) instead of a new constant — first implemented as a new
  `STOCKFISH_DEPTH_INPUT_MIN = 1`, corrected per user feedback (a manual analysis should never be
  allowed to go shallower than what the automated cron pipeline already guarantees for every
  position, and the value should be shared, not reinvented).

### src/app/owner/constants/page.tsx
- Removed the mirrored `MASTERS_EXPLORER_MIN_RATING` entry and import.
- Added a `STOCKFISH_DEPTH_INPUT_MAX` entry/import. Added `DepthInput.tsx` (not `ChessBoardView.tsx`
  — the actual consumer once the component was extracted) to `STOCKFISH_DEPTH`'s and
  `STOCKFISH_DEPTH_INPUT_MAX`'s `consumers` lists, and `STOCKFISH_DEPTH`'s description to note it's
  now also the Depth inputs' minimum. Added a `'DepthInput.tsx: DepthInput'` entry to the
  Functions-tab consumer-description dictionary. Fixed the now-stale
  `STOCKFISH_REANALYZE_DEFAULT_DEPTH` description, which referenced the old fixed dropdown options
  (20/22/24/26/28/30/40) that no longer exist now that the control is a number input.

### src/ui/board/DepthInput.tsx (new file)
- Shared Depth number input for `ChessBoardView.tsx`'s Game Analysis and Stockfish panels. Props:
  `value`, `onChange`, optional `min`/`max` (default `STOCKFISH_DEFAULTS.depth`(16)/
  `STOCKFISH_DEPTH_INPUT_MAX`(40)), optional `overrideClass`. Types freely (value can transiently
  be `NaN` mid-typing, matching `ChessBoardView.tsx`'s own established "From move"/"To move" input
  convention) and only clamps to min/max on blur — fixes the "can't type 31" bug that the first,
  duplicated-inline-clamp-on-every-keystroke implementation had.

### src/ui/board/MoveTree.tsx
- Widened the White/Black move-badge columns from `w-20` (80px) to `w-24` (96px), in both the
  header `<th>`s and body `<td>`s, to relieve move-badge folding.
- Updated the table's fixed width from `w-[352px]` to `w-[384px]` to match the new column widths.
- Widened the Eval columns from `w-20` (80px) to `w-24` (96px), in both the header `<th>`s and
  `EvalCell`'s `<td>`s.
- Updated the table's fixed width from `w-[384px]` to `w-[416px]` to match.
- Added `mx-auto` to the `<table>` to center it horizontally within its column, splitting the
  48px gap evenly (24px each side) instead of leaving it all on the right.

## Testing
- [ ] Open http://localhost:4050/analyze?game=1503&player=stricade and confirm all 3 columns
      (board, moves, analysis) render visibly wider than before, at 480px each.
- [ ] Browse a game with longer move notation (captures, checks, annotated blunders/mistakes,
      or moves with a repeat count like "(3)") in the moves column and confirm the White/Black
      badges no longer wrap/fold onto a second line.
- [ ] Confirm the board itself still renders correctly at the new 480px size (no clipping,
      pieces still align to squares).
- [ ] Confirm the moves table (now 416px) still fits fully within the 480px moves column with no
      horizontal overflow/scrollbar, and the Eval columns display cleanly at the new width.
- [ ] Confirm the moves table now appears centered in its column, with roughly even gaps on the
      left and right (instead of one large gap on the right next to the scrollbar).
- [ ] Confirm the moves box no longer has its own internal scrollbar — for a game with many moves,
      the box should grow taller (page scrolls) instead of showing a scrollbar within the box.
- [ ] Confirm the "Master games" table has a "Move" column showing readable move notation (e.g.
      `Ne7`), not raw UCI.
- [ ] Click a row in the "Master Moves" table and confirm "Master games" filters down to only
      games that played that move; click the same row again and confirm it clears the filter.
- [ ] Confirm the analysis column is now visibly wider (600px) than the board and moves columns
      (still 480px each), and that the "Master games" table's White/Black player names no longer
      fold/wrap.
- [ ] Confirm "Master games" has no "Min rating" input, and shows a "?" help icon at the top-right
      of the panel whose tooltip explains that Lichess selects the games shown, not this app.
- [ ] Confirm "Master games" still filters correctly when a "Master Moves" row is selected (and
      shows "No games match the selected move." if none match), now with no rating filter involved.
- [ ] Confirm the button in "Stockfish" always reads "Analyze Position" when idle (never "Resume")
      and "Stop" while running, and there is no separate "Depth: X" line next to it — only the
      "Depth" dropdown shows a depth value.
- [ ] Confirm one heading "Position Analysis 8.Nbd2" (no dash) appears above the 5 renamed panels
      (below the separate "Game Analysis" panel), and the panels appear in this order: Stockfish,
      Moves Played, Games Played, Master Moves, Master games.
- [ ] Confirm "Games Played" now shows every one of stricade's games that reached the current
      position, with no move selected in "Moves Played" (not empty/hidden by default).
- [ ] Click a row in "Moves Played" and confirm "Games Played" filters down to just that move's
      games; click the same row again and confirm it reverts to showing all games again.
- [ ] Confirm "Game Analysis" now renders below the board in Column 1 (not at the top of Column 3),
      and Column 3 starts directly with the "Position Analysis {move}" heading.
- [ ] Navigate to a position that previously showed pre-populated "Engine Lines" without pressing
      "Analyze Position" (e.g. the `O-O-O` position from game 1503) and confirm "Engine Lines" is
      now empty until you actually click "Analyze Position" — no more stale/mismatched values.
- [ ] Run "Analyze Position" once and confirm the nodes/nps/time stats line still displays
      correctly (no "From saved analysis" text should ever appear anymore).
- [ ] Open a fresh game and confirm "Master Moves" and "Master games" are not shown at all until
      you click a move; after clicking, confirm both appear.
- [ ] In "Games Played", confirm the current game's row shows a blue left-border accent instead of
      "(current)" text, and that a pink/yellow pill legend appears above the table explaining the
      row coloring.
- [ ] Confirm each of the 5 "Position Analysis" panels (Stockfish, Moves Played, Games Played,
      Master Moves, Master games) now has a clickable title with a rotating chevron, and clicking
      it collapses/expands that panel's content.
- [ ] Run "Analyze Position" at real depth on a position that recurs in more than one of stricade's
      games (e.g. an opening position), then open a *different* game that also reached that exact
      position — confirm its move list shows the same updated evaluation (the cross-game
      `tgev_game_evals` cascade + `teva_evaluations`-preferring display working together).
      Confirm "Moves Played" for that position also reflects the new value.
      Confirm "Analyze Game" (whole-game batch) also updates "Moves Played" immediately, not just
      "Analyze Position".
- [ ] Confirm the previously-reported `O-O-O` mismatch (Engine Lines vs. move list showing
      different numbers for the identical position) cannot recur: after any analysis run, every
      panel showing that position's evaluation (move list, "Moves Played", "Engine Lines") should
      agree.
- [ ] Deeply analyze a position past `MAX_ANALYSIS_MOVE` (move 16) — confirm the write-back still
      succeeds (`upgradePositionEvaluation` with `createIfMissing` creates a `tpos_positions` row
      for it) and that the value is not silently swept by the next purge run (verify via a
      `SELECT` against `tpos_positions`/`teva_evaluations` for that FEN, or by re-opening the game
      and confirming the value is still there).
- [ ] Confirm `npx tsc --noEmit` and `npm run build` both still pass (already verified during
      implementation, but re-confirm after any further changes before commit).
- [ ] Select a position (e.g. White's move 8, `Nbd2`, the position right before `O-O-O` in game
      1503) and run "Analyze Position" — confirm the move list's own row for the move that led
      there (`Nbd2`) is unaffected, but the row for the move about to be played next (`O-O-O`)
      updates once you select *that* position and re-run from there. Confirm the position's own
      evaluation (not just the position one ply deeper) changes to match the top engine line.
- [ ] Run "Analyze Position" once, then run "Analyze Game" on a range in the *same* browser tab
      session afterward — confirm the resulting values are consistent with what a fresh multi-PV
      "Analyze Position" run reports for the same positions (the `MultiPV` reset in `evaluate()`
      should prevent "Analyze Game" from silently picking up a non-best-line score).
- [ ] Run "Analyze Game" over a multi-move range and confirm "Moves Played" (and the move list)
      update ply by ply as the run progresses, not only once the whole range finishes.
- [ ] Set "Lines" to `1` and `2` in the "Stockfish" panel and confirm both are selectable and show
      the expected number of engine lines, with no played-move forced into the list.
- [ ] Confirm stopping an "Analyze Position" run early (the "Stop" button) still updates the
      analyzed position's own evaluation and its "Moves Played" entry, at whatever depth was
      actually reached when stopped.
- [ ] Open a game that shares its opening with an already-analyzed game (e.g. game 1503) but has
      never itself had "Analyze Game" run — confirm moves 1-4 (or so) are blank (expected — teva
      never caches those), but moves from roughly 5 onward show real evaluations wherever
      `teva_evaluations` knows that position, even for plies scattered among still-blank ones (no
      truncation at the first gap).
- [ ] Confirm that just loading a never-analyzed game does **not** create any new
      `teva_evaluations`/`tgev_game_evals` rows — this fix is read-only (spot-check via a `SELECT`
      count before/after loading, or by confirming the game's `tgev_game_evals` row count stays 0).
- [ ] Run "Analyze Game" over a range that includes moves 1-4 — confirm `tgev_game_evals` gets rows
      for those moves (comprehensive per-game record, as always), but `teva_evaluations` does
      **not** get any new/updated row for those specific early positions (verify via `SELECT`, or
      by confirming a different game sharing that exact opening still shows no teva-sourced value
      for moves 1-4 afterward).
- [ ] Confirm "Game Analysis" summary counts (blunders/mistakes/inaccuracies) and "Saved at depth"
      still compute correctly on a game whose `evaluations` array has gaps (no crash, no incorrect
      count from a phantom `undefined` entry).
- [ ] Confirm both Depth controls (Game Analysis panel, Stockfish panel) now show a typeable number
      input instead of a dropdown, and typing a value not previously in the old dropdown list (e.g.
      31) is accepted and used for the next analysis run.
- [ ] Confirm typing a value below 16 or above 40 into either Depth input clamps to 16/40 rather
      than being silently accepted as-is.
- [ ] Run "Analyze Position" on a position and, without reloading the page, confirm the analyzed
      position's own move-list row updates to the new top-line evaluation immediately (not the
      *next* move's row) — this is the off-by-one bug fix.
- [ ] Run "Analyze Position" on a Black-to-move position whose own row already shows a value at
      the same depth the run will reach (e.g. re-run at the same Depth setting twice in a row) —
      confirm the row updates to match the rank-1 line's score both times, not just the first.
- [ ] Confirm "Analyze Position" no longer touches any position beyond the requested lines and the
      analyzed position itself — the actually-played move should only update if it happens to be
      one of the requested lines (`deepenUncoveredMoves` was deleted per user decision).
- [x] Confirmed by user: renamed `teva_evaluations` to `zzz_teva_evaluations_deprecated` in the
      live database and the app continued working correctly — verifies no functional code
      reference to the old table name survived the migration.
- [ ] Run "Analyze Game" ("Re-analyse") over a range where every ply is already cached at/above
      the requested depth — confirm the dev server log shows only one
      `getMoveSummaryForPosition`/`getGamesForPosition` pair (not two), and no
      `upgradePositionEvaluation` call for the final position (since it's already covered by
      `cachedEvals`).
- [ ] Run that same fully-cached "Re-analyse" and confirm it now completes in well under a
      second (previously ~1.9s) — the dev server log should show a single `saveGameEvaluations`
      call with one `INSERT` (not N), and no Stockfish engine startup if this is the first
      analysis action of the session.
- [ ] On the first analysis action of a fresh page load, run "Analyze Position" (not "Analyze
      Game") and confirm the engine still initializes normally (unaffected by the lazy-init
      change, which is scoped to "Analyze Game" only).
- [ ] Run "Analyze Position" on a position that's actually part of the currently-open game, on a
      game that has never had "Analyze Game" run on it (zero `tgev_game_evals` rows) — confirm a
      `tgev_game_evals` row now gets created for that ply (verify via `SELECT`), not just a
      `tpose_positions_eval` update.
      Then run it again with "Lines" set to more than 1, where one of the displayed lines happens
      to match this game's actual next move — confirm only *that* line's write includes
      `gameContext` (i.e., only that one candidate's resulting position gets a `tgev_game_evals`
      row for this game) and no other candidate line creates one.
