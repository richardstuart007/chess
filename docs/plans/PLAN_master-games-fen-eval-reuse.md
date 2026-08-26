# PLAN_master-games-fen-eval-reuse — chess

## Title
Master games FEN evaluation reuse

## Plan
- [x] Add `tmgev_game_evals` table to `scripts/schema.sql` (secondary/master database section) —
      minimal-diff copy of `tgev_game_evals`, renaming every `gev_*` column to `mgev_*` and
      `gev_gdid` to `mgev_mgdid` (references `tmgd_gamesdecon.mgd_mgdid`). Same shape:
      `mgev_mgevid` (PK, IDENTITY), `mgev_mgdid`, `mgev_ply`, `mgev_san`, `mgev_fen_after`,
      `mgev_cp`, `mgev_best_move`, `mgev_best_move_san`, `mgev_best_line` (jsonb), `mgev_depth`,
      `mgev_cp_change`; UNIQUE `(mgev_mgdid, mgev_ply)`; index on `mgev_mgdid`. No columns
      dropped or added versus `tgev_game_evals`.
- [x] User runs the `CREATE TABLE`/index/constraint SQL for `tmgev_game_evals` manually via
      pgAdmin4, against the secondary (master) database, plus an `INSERT INTO xrtg_routing`
      row (`rtg_table='tmgev_game_evals'`, `rtg_dbkey='POSTGRES_URL1'`) against the **primary**
      database so `table_query`/`table_fetch` route calls to it automatically — discovered during
      execution: multi-database routing (per `nextjs-shared/CONSUMING_PROJECTS.md` §2a) requires
      an explicit `xrtg_routing` row per relocated table, not just the table's physical existence
      in the secondary database. Confirmed run by the user.
- [x] Add a read function to fetch/merge `tmgev_game_evals` for a given `mgdid` — implemented as
      `getMasterGameEvals`, a minimal-diff copy of `games.ts`'s `getGameEvals` (rebuilds the FEN
      sequence from `tmgd_gamesdecon.mgd_pgn`, merges `tmgev_game_evals` with
      `getPositionEvaluationsBulk`, preferring whichever has the deeper depth per ply).
- [x] Add a write function to persist a game's evaluated plies into `tmgev_game_evals` —
      implemented as `saveMasterGameEvaluations`, a minimal-diff copy of `games.ts`'s
      `saveGameEvaluations` (full delete-then-reinsert of the game's row set, one batched
      multi-row INSERT), rather than a single-ply upsert as originally worded — this matches the
      actual existing pattern being mirrored (`saveGameEvaluations`), which is a whole-game batch
      write, not a per-ply upsert. Also loops over the evaluated plies afterward, calling
      `upgradePositionEvaluation({ ..., createIfMissing: false })` for the top-up write.
- [x] In `MasterGameView.tsx`, on mount/game change: fetch cached `tmgev_game_evals` rows for the
      current `mgdid` and cached `tpos_positions`/`tpose_positions_eval` evals (via
      `getPositionEvaluationsBulk`) for the game's FENs; hydrate `plyEvals`/tree from whichever is
      available; only run live Stockfish for plies covered by neither.
- [x] In `runAnalysis()`, after analysis completes: for each evaluated ply, if the FEN already
      exists in `tpos_positions`, top up `tpose_positions_eval` via `upgradePositionEvaluation({
      fen, cp, bestMove, depth, createIfMissing: false })` (never creates a new `tpos_positions`
      row). Unconditionally persist the full ply set into `tmgev_game_evals` via
      `saveMasterGameEvaluations`.
- [x] Updated the file header comment in `MasterGameView.tsx` to reflect the new, narrower rule:
      read-only cache lookups against `tpos_positions`/`tpose_positions_eval` (via
      `getPositionEvaluationsBulk`) and top-up-only writes via `upgradePositionEvaluation({
      createIfMissing: false })` are now allowed; writes that create new positions, or any
      player-scoped join (`getMovePlayCounts`, `fetchGamesForPosition`), remain off-limits. Added
      a `3) CHANGE HISTORY` entry.
- [x] No new constant was introduced, so no Constants page update was needed.

## Changes

### scripts/schema.sql
- Added `tmgev_game_evals` (secondary/master database section) — minimal-diff copy of
  `tgev_game_evals`: every `gev_*` column renamed to `mgev_*`, `gev_gdid` → `mgev_mgdid`
  (references `tmgd_gamesdecon.mgd_mgdid`), same `UNIQUE(mgdid, ply)` constraint and index on
  `mgdid`. No columns added or dropped.

### src/lib/master/masterGamesList.ts
- Added `saveMasterGameEvaluations(mgdid, evaluations)` — mirrors `games.ts`'s
  `saveGameEvaluations` exactly (delete-then-batch-reinsert into `tmgev_game_evals`), then loops
  over the evaluated plies calling `upgradePositionEvaluation({ ..., createIfMissing: false })` to
  top up the primary database's shared `tpose_positions_eval` for any FEN that already exists in
  `tpos_positions` — the agreed Option B write: never creates a new `tpos_positions` row.
- Added `getMasterGameEvals(mgdid)` — mirrors `games.ts`'s `getGameEvals` exactly: rebuilds the
  game's FEN sequence from `tmgd_gamesdecon.mgd_pgn`, reads `tmgev_game_evals`, and merges in
  `getPositionEvaluationsBulk` (primary database), preferring whichever side has the deeper
  recorded depth per ply.
- New imports: `table_delete` (nextjs-shared), `Chess` (chess.js), `classifyMove` (`../stockfish`),
  `getPositionEvaluationsBulk`/`upgradePositionEvaluation` (`../analysis/chessdb`), and the
  `GameEvalRow` type (`../actions/games`).

### src/ui/board/MasterGameView.tsx
- Rewrote the file header (`1) DESCRIPTION`/`2) NOTES`) to describe the new caching behavior, and
  added a `3) CHANGE HISTORY` entry.
- The PGN-parse mount effect now also calls `getMasterGameEvals(row.mgd_mgdid)` after building the
  tree, hydrating `plyEvals` and each `tree.mainLine[i].evaluation` from whatever's already cached
  — no Stockfish call. Guarded with a `cancelled` flag (mirrors the existing Lichess-explorer
  effect's pattern) so a fast game switch can't let a stale fetch overwrite newer state.
- `runAnalysis()` now fetches `getPositionEvaluationsBulk(fens)` before calling
  `engine.analyzeGame(...)` and passes it as the `poseEvals` argument (previously always
  `undefined`) — `analyzeGame` already had built-in support for skipping Stockfish on
  cache-hit positions, just never wired up here. After analysis completes, calls
  `saveMasterGameEvaluations(row.mgd_mgdid, mergedPlyEvals)` to persist the full result.
- New imports: `getPositionEvaluationsBulk` (`@/src/lib/analysis/chessdb`),
  `getMasterGameEvals`/`saveMasterGameEvaluations` (`@/src/lib/master/masterGamesList`).

## Plan (continued — shared Game Analysis panel)
- [x] Create `src/ui/board/GameAnalysisPanel.tsx` — shared component extracted from the
      near-identical "Game Analysis" `MyBox` block duplicated in `ChessBoardView.tsx` and
      `MasterGameView.tsx`. Props: `variant: 'player' | 'master'`, `plyEvals`, `analyzing`,
      `analysisProgress`, `depth`/`onDepthChange`, `existingDepthRange` (`string | null`),
      `fromMove`/`toMove`/`totalFullMoves` + `onFromMoveChange`/`onToMoveChange`, `onRunAnalysis`,
      `analysisResultMessage`, `analysisError`. All props required (no optional/omittable ones) —
      every feature is now shown for both variants. Progress display unified to the dedicated
      progress-bar box (previously player-only) and the retry-on-error button is now shown for
      both variants (previously player-only). `variant` is accepted but not yet branched on in
      render — reserved for future intentional divergence, per explicit agreement.
- [x] Update `ChessBoardView.tsx` to render `<GameAnalysisPanel variant="player" .../>` in place
      of its inline JSX — pure extraction, no behavior change (all state/handlers already exist:
      `plyEvals`, `analyzing`, `analysisProgress`, `stockfishDepth`, `existingDepthRange`,
      `fromMove`/`toMove`/`totalFullMoves`, `runAnalysis`, `analysisResultMessage`,
      `analysisError`). Removed the now-unused local `blunders`/`mistakes`/`inaccuracies`
      variables (moved inside `GameAnalysisPanel`).
- [x] Add matching state to `MasterGameView.tsx`: `fromMove`/`toMove` (defaults mirroring
      `ChessBoardView`'s mount effect — `min(5, totalFullMoves)`/`totalFullMoves` once cached
      evals exist, else `1`/`totalFullMoves`), `analysisResultMessage`, and an `existingDepthRange`
      computation (mirrors `ChessBoardView`'s exactly, off `plyEvals`/`fromMove`/`toMove`).
- [x] Rewrote `MasterGameView.tsx`'s `runAnalysis()` to mirror `ChessBoardView.tsx`'s exactly:
      slices `fens`/`sans` to the selected `fromMove`/`toMove` range when re-analyzing (full game
      on first analysis), live per-ply `upgradePositionEvaluation({ ..., createIfMissing: false })`
      call as each ply resolves (skipping any ply whose existing depth is already deeper), a
      final-position `upgradePositionEvaluation({ ..., createIfMissing: false })` call for the
      range's last resulting position, and `saveMasterGameEvaluations(row.mgd_mgdid,
      mergedPlyEvals)` at the end (always — no `gdid`-optionality needed, unlike player's
      `if (gdid)` guard). `createIfMissing` stays `false` throughout (vs. player's `true`) — the
      one deliberate, permanent divergence. Skipped copying `ChessBoardView`'s `console.log`
      diagnostic timing lines (its own header comment marks them temporary/debug) and skipped any
      `refreshPositionPanels()` equivalent (master's own panels — `MasterMovesDbPanel`/
      `MasterGamesDbPanel` — read from `tmpos_positions`/`tmgam_game_positions`, unrelated to
      Stockfish eval data).
- [x] Updated `MasterGameView.tsx`'s render to use `<GameAnalysisPanel variant="master" .../>` in
      place of its inline JSX. Removed the now-unused local `blunders`/`mistakes`/`inaccuracies`
      variables and the direct `DepthInput` import (both now only inside `GameAnalysisPanel`).

## Changes (continued — shared Game Analysis panel)

### src/ui/board/GameAnalysisPanel.tsx (new)
- New shared component extracted from the near-identical "Game Analysis" panel duplicated in
  `ChessBoardView.tsx` and `MasterGameView.tsx`. Every prop required (no optional/omittable
  props): badges, `DepthInput` + `existingDepthRange`, From/To move-range selector (shown once
  `plyEvals.length > 0`), Analyze/Re-analyse button, `analysisResultMessage`, a unified
  progress-bar box (previously player-only), and an error message + Retry button (previously
  player-only) — both now shown for either variant. Accepts `variant: 'player' | 'master'`
  (rendered as a `data-variant` attribute) but doesn't yet branch render on it — reserved for
  future intentional divergence per explicit agreement.

### src/ui/board/ChessBoardView.tsx
- Replaced the inline "Game Analysis" `MyBox` block with `<GameAnalysisPanel variant="player" .../>`
  — pure extraction, no behavior change. Removed the now-unused `blunders`/`mistakes`/
  `inaccuracies` locals. Added the `GameAnalysisPanel` import.

### src/ui/board/MasterGameView.tsx
- Added `fromMove`/`toMove`/`analysisResultMessage` state and an `existingDepthRange` computation,
  both mirroring `ChessBoardView.tsx` exactly.
- Rewrote `runAnalysis()` to support range-restricted re-analysis (mirrors `ChessBoardView.tsx`'s
  `runAnalysis` exactly), with `createIfMissing: false` kept throughout (vs. player's `true`) and
  no `refreshPositionPanels()`-equivalent call.
- Replaced the inline "Game Analysis" `MyBox` block with `<GameAnalysisPanel variant="master" .../>`.
  Removed the now-unused `blunders`/`mistakes`/`inaccuracies` locals and the direct `DepthInput`
  import. Added `upgradePositionEvaluation`, `truncateFen`, and `GameAnalysisPanel` imports.

## Plan (continued — player/master/shared naming convention + component/file split)

**Naming convention agreed:** any function/component that is only ever used for tracked-player
games gets an `_player` suffix; only ever used for master games gets `_master`; genuinely used by
both gets `_shared`. Suffix only — never a prefix, never collapsing two different names onto a
shared root (each thing keeps its own existing name, the suffix is just appended). Something
already unambiguous without a suffix (e.g. `MasterMovesDbPanel` — "Master" *is* its actual subject
matter, not a stand-in for "the master variant of a shared MovesDbPanel", and it has no
player-side counterpart to be confused with) is left alone. Scope for this pass: only the files
this session has already touched or discussed — not a full codebase sweep.

- [ ] **DEFERRED — Extract the Moves Played / Games Played panel out of
      `ChessBoardView_shared.tsx`** into its own new `_player`-suffixed component (e.g.
      `MovesGamesPlayedPanel_player.tsx`) — this is the *only* genuinely player-scoped logic
      remaining inside that file (built on `getMovePlayCounts_player`/`fetchGamesForPosition_player`,
      joined against `tgam_game_positions` by `player`). Deliberately not done in this pass —
      deeply coupled to several interdependent effects (moveSummary fetch, positionGames
      fetch+pagination, a reset-on-change ref) and to `refreshPositionPanels()` (called from both
      `runAnalysis` and `persistAnalysisLines`), so it needs its own dedicated, independently
      testable pass rather than being folded into an already-large rename sweep. State/props it
      will need: `moveSummary`, `selectedPositionMove`/`setSelectedPositionMove`, `positionGames`,
      `positionGamesTotalRows`, `positionGamesPage`/`setPositionGamesPage`,
      `positionGamesRowsPerPage`/`setPositionGamesRowsPerPage`, `gdid`, and the
      router-push-on-row-click behavior. See the Outstanding Item in this project's
      `.claude/CLAUDE.md` for the related future master-scoped equivalent.
- [x] **Renamed `ChessBoardView.tsx` → `ChessBoardView_shared.tsx`** (component `ChessBoardView` →
      `ChessBoardView_shared`) — the Moves Played/Games Played extraction above is deferred, so
      this file still contains that player-only panel for now (flagged in its own header `2)
      NOTES`); every other part of the file (board rendering, drag-to-explore, tree/keyboard nav,
      deep analysis, `GameAnalysisPanel_shared` usage, Chess.com Games search, Master Moves/Games
      Lichess panels) is genuinely shared. Updated `/analyze/page.tsx`.
- [x] **Renamed `MasterGameView.tsx` → `MasterGameView_master.tsx`** (component `MasterGameView` →
      `MasterGameView_master`) — kept its own existing name, just the suffix appended. Updated
      `/analyzemaster/page.tsx`.
- [ ] **DEFERRED — Give `MasterGameView_master` the feature-parity items agreed earlier in this
      thread**: draggable board (`allowDragging`/`onPieceDrop`, build-your-own-variation support),
      move-classification square highlighting, the deep/infinite Stockfish analysis panel
      (`startDeepAnalysis`/`AlternativeLines_shared`), the Chess.com Games live search panel, a
      Copy FEN button, and the "Final eval" line in the game-info row. Deliberately not done in
      this pass, for the same reason as the Moves Played/Games Played extraction above — this is
      substantial net-new functionality (not a mechanical rename), better done as its own
      dedicated, testable pass. Any DB write introduced by these (e.g. saving deep-analysis lines)
      must keep `createIfMissing: false`, matching every other write in `MasterGameView_master`.
      Moves Played/Games Played is explicitly **not** part of this future parity pass — no
      master-side data source exists for it yet (separate outstanding item).
- [x] **Renamed `GameAnalysisPanel.tsx` → `GameAnalysisPanel_shared.tsx`** (component
      `GameAnalysisPanel` → `GameAnalysisPanel_shared`). Updated both call sites
      (`ChessBoardView_shared.tsx`, `MasterGameView_master.tsx`).
- [x] **Renamed `DepthInput.tsx` → `DepthInput_shared.tsx`**, `MoveTree.tsx` → `MoveTree_shared.tsx`,
      `AlternativeLines.tsx` → `AlternativeLines_shared.tsx` (components renamed to match). Updated
      every call site (`ChessBoardView_shared.tsx`, `MasterGameView_master.tsx`,
      `GameAnalysisPanel_shared.tsx`).
- [x] **Split `src/lib/analysis/chessdb.ts` into `chessdb_shared.ts` and `chessdb_player.ts`**,
      renaming every export with its scope suffix:
      - `chessdb_shared.ts`: `getPositionCount_shared`, `saveEvaluation_shared`,
        `getEvaluationForPosition_shared`, `upgradePositionEvaluation_shared`,
        `getPositionEvaluationsBulk_shared`, plus the shared types `PositionRow`/`EvaluationRow`.
      - `chessdb_player.ts`: `getMovesForPosition_player`, `getMovePlayCounts_player`,
        `getMoveSummaryForPosition_player`, `fetchGamesForPosition_player`,
        `getGamesForPositionCount_player`, `gamePositionExists_player` (queries
        `tgam_game_positions` by `gdid`, so player-only by construction even without an explicit
        `player` param), `getHabitsData_player`, `getHabitsCount_player`, `dismissHabit_player`,
        `undismissHabit_player`, `getPositionDetail_player`, plus the player-scoped types
        `MoveRow`/`PositionGameHit`. Habits functions live here (not a separate `habits.ts`).
      - Updated every import across the codebase that referenced `chessdb.ts` or any of these old
        names: `enrichPositionsStockfish.ts`, `position/[id]/page.tsx`, `PositionDetail.tsx`,
        `habits/page.tsx`, `games.ts`, `masterGamesList.ts`, `ChessBoardView_shared.tsx`,
        `MasterGameView_master.tsx`, plus documentation references in `owner/constants/page.tsx`
        and `dataflow/sections.tsx`.
- [x] **Renamed in `src/lib/actions/games.ts`**: `getGameEvals` → `getGameEvals_player`,
      `saveGameEvaluations` → `saveGameEvaluations_player`. File itself stays `games.ts` (out of
      scope for this pass) — noted loose end: the shared `GameEvalRow` type still lives in this
      player-named file even after this rename.
- [x] **Renamed in `src/lib/master/masterGamesList.ts`**: `getMasterGameEvals` →
      `getMasterGameEvals_master`, `saveMasterGameEvaluations` → `saveMasterGameEvaluations_master`.
- [x] Updated file header comments (`1) DESCRIPTION`/`2) NOTES`/`3) CHANGE HISTORY`) on
      `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`; ran `npx tsc --noEmit` clean
      after the full rename/split sweep.

## Testing
- [ ] Open `/mastergames`, pick a game, and open its analysis view (`/analyzemaster?game=...`).
      Confirm the board/move list loads as before.
- [ ] Click "Analyze Game" on a master game you haven't analyzed before. Confirm progress runs and
      blunders/mistakes/inaccuracies badges populate as before.
- [ ] Navigate away (back to `/mastergames`) and reopen the same master game. Confirm the
      evaluation badges and per-move eval numbers in the move tree now appear immediately on load
      — without clicking "Analyze Game" again — proving `tmgev_game_evals` hydration is working.
- [ ] Pick a master game that shares early-opening moves with one of your own tracked-player games
      (same ECO/opening) and analyze it. Then check (via a `SELECT`-prefixed read against the
      primary database) whether `tpose_positions_eval` picked up a depth/value for that shared
      FEN, confirming the Option B top-up path fired.
- [ ] Confirm no new `tpos_positions` rows were created purely from master-game analysis (row
      count in `tpos_positions` should not grow from clicking "Analyze Game" on a master game with
      no primary-DB overlap).
- [ ] Open `/analyze` for one of your own tracked-player games and confirm the "Game Analysis"
      panel looks and behaves exactly as before (badges, depth, saved-depth text, From/To range
      selector, Analyze/Re-analyse button, progress bar, result message, error/retry) — this is
      the same JSX, just now rendered through the shared `GameAnalysisPanel` component.
- [ ] On `/analyzemaster`, after a first full analysis, confirm master games now also show the
      From/To move-range selector and a "Saved at depth" indicator (previously player-only),
      the progress-bar box instead of inline button text, and a result summary message
      ("Updated N plies...") after a run.
- [ ] On `/analyzemaster`, re-analyze only a sub-range (e.g. From move 10 To move 15) and confirm
      only that range's evaluations change — moves outside the range keep their existing badges/
      eval numbers, matching the player-side range-restriction behavior.
- [ ] Open `/position/[id]` (any position detail page, optionally with `?player=`) and confirm it
      loads as before — exercises the renamed `getPositionDetail_player`/`chessdb_player.ts`.
- [ ] Open `/habits` and confirm the list loads, filters work, and dismiss/undismiss still work —
      exercises `getHabitsData_player`/`getHabitsCount_player`/`dismissHabit_player`/
      `undismissHabit_player`.
- [ ] `npx tsc --noEmit` already confirmed clean after the full rename/split sweep.

## Changes (continued — player/master/shared naming convention + component/file split)

### Renamed files (git mv, content otherwise unchanged apart from the renames below)
- `ChessBoardView.tsx` → `ChessBoardView_shared.tsx` (component `ChessBoardView` →
  `ChessBoardView_shared`)
- `MasterGameView.tsx` → `MasterGameView_master.tsx` (component `MasterGameView` →
  `MasterGameView_master`)
- `GameAnalysisPanel.tsx` → `GameAnalysisPanel_shared.tsx`
- `DepthInput.tsx` → `DepthInput_shared.tsx`
- `MoveTree.tsx` → `MoveTree_shared.tsx`
- `AlternativeLines.tsx` → `AlternativeLines_shared.tsx`
- `src/lib/analysis/chessdb.ts` → split into `chessdb_shared.ts` (5 exports, all `_shared`-suffixed)
  and `chessdb_player.ts` (11 exports, all `_player`-suffixed)

### src/lib/actions/games.ts
- Renamed `getGameEvals` → `getGameEvals_player`, `saveGameEvaluations` → `saveGameEvaluations_player`
  (including their internal `caller`/logging strings). Updated the `chessdb` import to
  `getPositionEvaluationsBulk_shared` from `chessdb_shared.ts`.

### src/lib/master/masterGamesList.ts
- Renamed `getMasterGameEvals` → `getMasterGameEvals_master`, `saveMasterGameEvaluations` →
  `saveMasterGameEvaluations_master` (including internal `caller`/logging strings). Updated the
  `chessdb` import to `getPositionEvaluationsBulk_shared`/`upgradePositionEvaluation_shared` from
  `chessdb_shared.ts`.

### src/ui/board/ChessBoardView_shared.tsx
- Renamed component `ChessBoardView` → `ChessBoardView_shared`. Updated every internal call to the
  renamed `chessdb_player.ts`/`chessdb_shared.ts`/`games.ts` functions and every renamed shared
  component (`GameAnalysisPanel_shared`, `DepthInput_shared`, `MoveTree_shared`,
  `AlternativeLines_shared`). Updated header comment to note the Moves Played/Games Played
  extraction is agreed but deferred (still player-only logic living in this otherwise-shared file).

### src/ui/board/MasterGameView_master.tsx
- Renamed component `MasterGameView` → `MasterGameView_master`. Updated every internal call to the
  renamed `chessdb_shared.ts`/`masterGamesList.ts` functions and renamed shared components
  (`GameAnalysisPanel_shared`, `MoveTree_shared`). Added a `3) CHANGE HISTORY` entry and a `2)
  NOTES` line flagging the still-deferred feature-parity items (draggable board, deep analysis,
  Chess.com search).

### src/app/analyze/page.tsx, src/app/analyzemaster/page.tsx
- Updated imports/JSX to `ChessBoardView_shared`/`MasterGameView_master` and
  `getGameEvals_player`.

### src/app/position/[id]/page.tsx, src/ui/analysis/PositionDetail.tsx, src/app/habits/page.tsx, src/lib/analysis/enrichPositionsStockfish.ts
- Updated imports to the split `chessdb_shared.ts`/`chessdb_player.ts` and the renamed functions
  each file actually uses.

### src/app/owner/constants/page.tsx, src/ui/dataflow/sections.tsx
- Updated consumer-string/prose references to match the renamed files and functions (left one
  pre-existing historical "Resolved" note in `sections.tsx` about a since-deleted function
  unchanged, since it accurately describes what was true at that time).
