# PLAN_fen-normalization — chess

## Title
FEN normalization: centralize 4-field truncation/expansion, resolve legacy 6-field inconsistency

## Plan
- [x] Create `src/lib/fen.ts` with two exported functions:
  - `truncateFen(fen: string): string` — keep only the 4 positional fields (piece placement,
    active color, castling rights, en passant target); moved verbatim from the 3 duplicated
    copies (`buildPositionTree.ts`, `chessdb.ts`, `ChessBoardView.tsx`).
  - `expandFen(fen4: string): string` — append a hardcoded halfmove clock `0` and fullmove number
    `1` to produce a full 6-field FEN; neither value is meaningful to this app (no 50-move-rule
    tracking, no consumer reads fullmove number back out of a FEN), so no caller-supplied override
    is needed.
- [x] Replace the 3 duplicated `truncateFen()` definitions in `buildPositionTree.ts`, `chessdb.ts`,
  and `ChessBoardView.tsx` with an import from `src/lib/fen.ts`; remove the local copies.
- [x] Normalize `tgev_game_evals.gev_fen_after` to 4-field: truncate `e.fen` before storing in
  `saveGameEvaluations` ([games.ts:119](../src/lib/actions/games.ts#L119)).
- [x] Normalize `tsa_savedanalyses.sa_starting_fen` to 4-field: truncate `data.starting_fen` before
  storing in `saveAnalysisLine` ([games.ts:190](../src/lib/actions/games.ts#L190)).
- [x] Truncate the `STARTING_FEN` constant ([games.ts:11](../src/lib/actions/games.ts#L11)) to
  4-field to match, since it's used as the `fenBefore` fallback alongside `gev_fen_after` values.
- [x] Check all read/consumption sites of `gev_fen_after` and `sa_starting_fen` (board rendering,
  chess.js construction, any FEN comparison) to confirm 4-field values flow through cleanly —
  expected to be a non-issue since chess.js/board rendering already tolerate 4-field elsewhere,
  but verify no site expects a real halfmove/fullmove value from these two columns specifically.
- [x] Provide backfill SQL in chat (not run by Claude) to truncate existing
  `gev_fen_after`/`sa_starting_fen` rows to 4-field, for the user to run manually via pgAdmin4.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions.
- [x] Fix `upgradePositionEvaluation()`'s FEN comparison (`chessdb.ts`) — truncate the incoming
  FEN before matching against `tpos_positions.pos_fen`, so the lookup actually matches.

## Changes

### src/lib/fen.ts (new)
- Added `truncateFen()` (4-field truncation) and `expandFen()` (fixed `0 1` expansion back to
  6-field) as the single shared FEN-normalization utility, replacing 3 duplicated copies.

### src/lib/analysis/buildPositionTree.ts
- Removed local `truncateFen()`; now imports it from `../fen`.

### src/lib/analysis/chessdb.ts
- Removed local `truncateFen()`; now imports it from `../fen`.

### src/ui/board/ChessBoardView.tsx
- Removed local `truncateFen()`; now imports it from `@/src/lib/fen`.

### src/lib/actions/games.ts
- `saveGameEvaluations` now truncates `e.fen` before storing into `gev_fen_after`.
- `saveAnalysisLine` now truncates `data.starting_fen` before storing into `sa_starting_fen`.
- `STARTING_FEN` constant truncated to 4-field (drops trailing `0 1`) to match, since it's used
  as the `fenBefore` fallback alongside `gev_fen_after` values in `getGameEvals`.
- Verified no downstream consumer of `gev_fen_after`/`sa_starting_fen` needs 6 fields:
  `getGameEvals`'s returned `fen`/`fenBefore` are only ever attached as display metadata on
  `MoveEvaluation` objects (`/analyze` page → `ChessBoardView`'s `game._evaluations`), never fed
  into `chess.js`/board construction; `getSavedAnalyses` (which reads `sa_starting_fen`) has no
  current caller anywhere in the app.

### Backfill SQL (not run by Claude — run manually via pgAdmin4 after taking a backup)
```sql
UPDATE tgev_game_evals
SET gev_fen_after = array_to_string((string_to_array(gev_fen_after, ' '))[1:4], ' ')
WHERE gev_fen_after IS NOT NULL;

UPDATE tsa_savedanalyses
SET sa_starting_fen = array_to_string((string_to_array(sa_starting_fen, ' '))[1:4], ' ')
WHERE sa_starting_fen IS NOT NULL;
```
Both are idempotent — safe to re-run, and a no-op on rows already 4-field.

### src/lib/analysis/chessdb.ts (fix)
- `upgradePositionEvaluation()` was comparing an incoming FEN directly against
  `tpos_positions.pos_fen` without truncating it first. Both of its callers
  (`ChessBoardView.tsx`, lines ~319 and ~444) pass a full 6-field FEN sourced from the live
  analysis tree (`chess.js`'s `.fen()`), which can never string-match `pos_fen`'s 4-field values —
  so the lookup silently found nothing and the "merge a deeper live /analyze evaluation into
  teva_evaluations" feature was a no-op. Now truncates via `truncateFen()` before the lookup, so it
  matches correctly.
