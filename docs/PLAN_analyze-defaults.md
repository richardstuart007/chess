# Analyze route: From-move default, Position Analysis depth options, teva depth merge-back, db-access cleanup

## Plan

### Database access cleanup — replace raw db.query()/sql() with the correct table_ function
Global rule added to `~/.claude/CLAUDE.md` (Coding Conventions): always use `nextjs-shared`'s
`table_fetch`/`table_write`/`table_update`/`table_upsert`/`table_delete`/`table_count`/
`table_check`, or `table_query` for genuinely complex queries — never call `sql()`/`db.query()`
directly. Caching rule: `tgev_game_evals` gets `skipCache: true` on every converted call (tight
read-your-own-write coupling to a specific user's own analysis action); everywhere else keeps
normal default caching — teva/tgam/habits/pipeline-status stateness is accepted as harmless,
equivalent to waiting for the next cron pass.

- [x] `games.ts` `saveGameEvaluations()`: DELETE → `table_delete`; per-row INSERT loop →
      `table_write`. Both `skipCache: true`.
- [x] `games.ts` `getGameEvals()`: SELECT → `table_fetch` (equality WHERE + `orderBy` +
      explicit `columns`). `skipCache: true`.
- [x] `games.ts` `getOpeningScores()`/`getTerminationStats()`/`getPlayerRatingOverTime()`: GROUP
      BY + aggregates + CASE WHEN → `table_query` (too complex for typed helpers). Default caching.
- [x] `games.ts` `backfillOpeningMoves()`: SELECT (`gd_player = $1 AND gd_opening_moves IS NULL
      LIMIT $2`) → `table_fetch` (its WHERE builder already supports `IS NULL`); per-row UPDATE →
      `table_update` (single equality WHERE); remaining-count → `table_query` (gap #3 — `table_count`
      doesn't support `IS NULL`). Default caching.
- [x] `games.ts` `getEarliestGameDate()`: `MIN(...)` aggregate + `IN` → `table_query`. Default caching.
- [x] `enrichPositionsStockfish.ts`: all 4 raw `db.query()` calls (`countRemainingPositions`,
      `getResultingFensToEvaluate`, phase-1 SELECT in `enrichPositionsStockfish`,
      `bulkUpdateCpLoss`) → `table_query` (LEFT JOIN/IS NULL, DISTINCT+JOIN, multi-table
      UPDATE...FROM). Default caching. `bulkUpdateCpLoss` needed `RETURNING gp.gam_gdid` added
      (see gap #5 below — `table_query` doesn't expose `rowCount`).
- [x] `buildPositionTree.ts`: both raw calls (`syncTposFromTgam`'s backlog/ensure/backfill
      queries, `buildPositionTree`'s main query), plus `insertGamePositions`/
      `recomputePosReachedByIds` (previously took a threaded `db` param — now call `table_query`
      directly, `db` param removed from both signatures and their call sites) → `table_query`
      (UNION-based INSERT...SELECT, multi-table UPDATE...FROM...RETURNING). Default caching.
- [x] `buildHabits.ts`: aggregate SELECT → `table_query`; chunked multi-row upsert → stays
      `table_query` (gap #1 — no batch upsert helper exists yet), `RETURNING hab_habid` added
      (gap #5).
- [x] `purgePositions.ts`: `TRUNCATE TABLE tpur_workfile` → `table_truncate` (already existed,
      simply wasn't used). The rest (correlated NOT EXISTS INSERT...SELECT, two
      DELETE...WHERE IN (subquery), UPDATE...WHERE IN (subquery) with extra column nulling,
      UPDATE...NOT EXISTS, DELETE...WHERE IN (subquery)) → `table_query` (gap #2 — no
      IN-subquery support), all five needed `RETURNING` added (gap #5). Default caching.
- [x] `pipelineStatus.ts`: all raw calls (`getPipelineStatus`, `refreshStep1`, `refreshStep3`,
      `refreshTposStatus`, `refreshStep4`, `refreshCpChangeStatus`, `refreshHabitsStatus`,
      `refreshPurgeStatus`) → `table_query` (multi-subquery dashboard-status SELECTs). Default
      caching.
- [x] `deconstruct.ts`: `getUndeconstructedCount()` and `deconstructGames()`'s main SELECT
      (correlated NOT EXISTS) → `table_query`. Default caching.
- [x] `diag/route.ts`: two plain `COUNT(*)` queries → `table_count`; the `DISTINCT ... LIMIT`
      query → `table_fetch` (`distinct: true, columns: ['gr_player'], limit: 10`).
- [x] `players.ts` `updatePlayerRating()`: SELECT with `CASE WHEN` in the column list →
      `table_query`. Default caching. (Rest of this file already correctly uses typed helpers.)
- [x] `pipelineLog.ts` (all 4 functions — found mid-execution, missing from the original audit):
      `resolvePipRunId`/`getPipelineRates`/`getLatestPipelineRuns` → `table_query` (default
      caching); `logPipelineStep`'s INSERT → `table_query` with `isupdate: true` (already had
      `RETURNING pip_pipid`, no gap-#5 change needed).

**Gap #5 found mid-execution, not in the original four**: `table_query` only returns `rows`, not
`rowCount` — several pipeline functions relied on `res.rowCount` from bare UPDATE/DELETE with no
`RETURNING`. Fixed by adding `RETURNING <column>` to each and using `rows.length` instead —
`bulkUpdateCpLoss`, `buildHabits`'s batch upsert, and all five of `purgeStaleReachOnePositions`'s
DELETE/UPDATE statements. Also found: `table_query`'s `params` type doesn't declare array
elements (needed for `= ANY($1)`) — narrow `as unknown as number[]` cast in
`recomputePosReachedByIds`, flagged inline rather than reshaping the query.

### tgev_game_evals redesign — ply naming, drop derivable columns, cp_change
- [x] Give schema SQL in chat (not run by Claude): rename `gev_move_num` → `gev_ply`, add
      `gev_cp_change integer`, backfill it from existing `gev_cp`/`gev_cp_before` + ply parity,
      then drop `gev_cp_before`, `gev_cp_loss`, `gev_classification`, `gev_fen_before`.
- [x] `scripts/schema.sql`: update `tgev_game_evals` to match (rename, add `gev_cp_change`,
      remove the four dropped columns).
- [x] `stockfish.ts`: `MoveEvaluation` keeps `cpBefore`/`fenBefore`/`cpLoss`/`classification`
      (still needed for live in-session UI) and gains `cpChange` (signed, mover-relative,
      computed alongside `cpLoss` in `analyzeGame()` from the same before/after values —
      `classifyMove()` stays as-is, fed by the still-derived `cpLoss`).
- [x] `games.ts`: `GameEvalRow` drops `fenBefore`/`cpBefore`/`cpLoss`/`classification`, gains
      `cpChange`. `saveGameEvaluations()` writes the reduced column set (`gev_ply` instead of
      `gev_move_num`, `gev_cp_change` instead of `gev_cp_loss`/`gev_classification`, no
      `gev_fen_before`).
- [x] `games.ts`: `getGameEvals()` selects the reduced column set and reconstructs the full
      `MoveEvaluation` shape in JS — `cpBefore`/`fenBefore` from the previous row in the same
      result array (ply 0 uses `cp = 0` and the standard starting FEN), `cpLoss` from
      `Math.max(0, -cpChange)`, `classification` from the existing `classifyMove()` (imported
      from `stockfish.ts` — verified it has no module-level browser-only side effects, safe to
      import into this server action).
- [x] `ChessBoardView.tsx`: no consumer-facing change needed — it already reads `MoveEvaluation`
      objects, which keep the same shape; confirmed via type-check.

### Remove no-game ("free analysis") route
- [x] `PositionDetail.tsx`: delete the "Analyze this position" button that navigated to
      `/analyze?mode=free&fen=...` with no `game=` param.
- [x] `analyze/page.tsx`: drop `isFree`/`startFen`/`mode=free`/`fen` handling; a missing `game`
      param now always falls into the existing "No game specified" error path.
- [x] `ChessBoardView.tsx`: `game` prop becomes required (drop `?`); remove `startFen` prop,
      `isFreeAnalysis`, the "Free Analysis" badge, the mount effect's no-game branch, every
      `isFreeAnalysis`/`!isFreeAnalysis` conditional (collapse to the "has game" side), and
      `isValidFen()` (dead code once its only caller — the no-game branch — is gone).

### teva_evaluations depth + merge-back from /analyze
- [x] Give schema SQL in chat (not run by Claude): add `eva_depth` to `teva_evaluations`,
      backfill existing rows to 16, no `NOT NULL` (matches `tgev_game_evals.gev_depth`
      precedent; enforced by TypeScript signatures instead of a DB constraint per user
      decision).
- [x] `scripts/schema.sql`: add `eva_depth smallint` to the `teva_evaluations` definition.
- [x] `chessdb.ts`: add `eva_depth` to `EvaluationRow`; add `depth` (required) to
      `saveEvaluation()`'s input and INSERT columns.
- [x] `chessdb.ts`: new `upgradePositionEvaluation({ fen, cp, bestMove, depth })` — looks up
      `pos_id` by FEN, conditionally updates `teva_evaluations` only if `eva_depth < depth`,
      and if it upgraded, immediately recomputes `gam_cp_change` for the affected
      `tgam_game_positions` rows (both `gam_pos_id` and `gam_resulting_pos_id` sides) via a
      scoped query — deliberately NOT reusing `bulkUpdateCpLoss()`, since that calls
      `logPipelineStep()` and would make every interactive analyze click look like a new
      pipeline run on the Owner > Pipeline page (`getLatestPipelineRuns()` only ever shows the
      single latest `pip_run_id`).
- [x] `enrichPositionsStockfish.ts`: pass the batch job's own `depth` into `saveEvaluation()`.
- [x] `ChessBoardView.tsx` `runAnalysis()`: after saving evaluations, call
      `upgradePositionEvaluation()` for each result's "before" position
      (`fenBefore`/`cpBefore`/`bestMove`/`depth`) — best-effort, silently caught.
- [x] `ChessBoardView.tsx` `startDeepAnalysis()`: track the top-ranked line (already
      white-perspective, already UCI) per update in a ref; on completion, call
      `upgradePositionEvaluation()` once for the analyzed FEN at the depth actually reached.

### Analyze route: From-move default and Position Analysis depth options
- [x] `ChessBoardView.tsx` mount effect (game load path): when the loaded game already has
      stored evaluations, default `fromMove` to `min(5, totalFullMoves)` instead of `1`.
- [x] `ChessBoardView.tsx` `runAnalysis()`: after a first-time full analysis completes
      (`isReanalyze` was `false`), set `fromMove` to `min(5, totalFullMoves)` so the next
      re-analyze defaults to move 5 instead of move 1.
- [x] `ChessBoardView.tsx` Position Analysis depth dropdown: change options from
      `['20', '30', '40', 'Infinite']` to `['20', '22', '24', '26', '28', '30', '40']`
      (Infinite dropped per user decision).

## Changes
### ~/.claude/CLAUDE.md (global)
- Added "Database access — always use the shared `table_` functions" under Coding Conventions:
  never call `sql()`/`db.query()` directly or build a project-local query wrapper; use
  `table_fetch`/`table_write`/`table_update`/`table_upsert`/`table_delete`/`table_count`/
  `table_check`, or `table_query` for genuinely complex queries; flag any real gap before
  writing raw SQL rather than working around it silently.

### Database access cleanup (12 files, every raw db.query()/sql() call site converted)
- **games.ts**: `saveGameEvaluations()` → `table_delete` + `table_write` (both `skipCache: true`);
  `getGameEvals()` → `table_fetch` (`skipCache: true`); `getOpeningScores`/`getTerminationStats`/
  `getPlayerRatingOverTime`/`getEarliestGameDate` → `table_query`; `backfillOpeningMoves` →
  `table_fetch` + `table_update` + `table_query` (its remaining-count hit gap #3).
- **enrichPositionsStockfish.ts**: all 4 raw calls → `table_query`; `bulkUpdateCpLoss` gained
  `RETURNING gp.gam_gdid` (gap #5) since it needed the affected-row count.
- **buildPositionTree.ts**: `insertGamePositions`/`recomputePosReachedByIds` no longer take a
  threaded `db` param — call `table_query` directly instead (call sites updated); both raw calls
  in `syncTposFromTgam`/`buildPositionTree` → `table_query`;
  `recomputePosReachedByIds`'s `= ANY($1)` array param needed a narrow cast (`table_query`'s
  `params` type doesn't declare array elements).
- **buildHabits.ts**: aggregate SELECT → `table_query`; chunked batch upsert → `table_query`
  with `RETURNING hab_habid` added (gap #5; no batch-upsert helper exists yet — gap #1).
- **purgePositions.ts**: `TRUNCATE` → `table_truncate` (existing helper, simply unused before);
  the other 5 statements → `table_query`, each gaining a `RETURNING` column (gap #5) since all
  relied on `rowCount` for pipeline logging.
- **pipelineStatus.ts**: all 8 functions → `table_query` (multi-subquery dashboard-status reads).
- **pipelineLog.ts** (missed in the original audit, found and fixed mid-execution): all 4
  functions → `table_query`.
- **deconstruct.ts**: `getUndeconstructedCount`/`deconstructGames`'s main SELECT → `table_query`.
- **diag/route.ts**: two `COUNT(*)` → `table_count`; the `DISTINCT ... LIMIT` → `table_fetch`.
- **players.ts**: `updatePlayerRating`'s SELECT → `table_query` (rest of file already correct).
- **Gaps found, all deliberately left on `table_query` for now** (per-file notes above cover
  which lines): #1 no batch/multi-row upsert helper; #2 no `IN (subquery)` support (only
  `IN (literal array)`); #3 `table_count` missing `IS NULL`/`IS NOT NULL` (unlike `table_fetch`);
  #4 `table_update`'s WHERE is equality-only, no operators at all (latent, nothing currently
  blocked by it); #5 `table_query` doesn't expose `rowCount`, and its `params` type doesn't
  declare array elements for `= ANY($1)`. All five are candidates for a future `nextjs-shared`
  session, not blockers for this project.

### scripts/schema.sql
- Added `eva_depth smallint` to `teva_evaluations` (no `NOT NULL` — matches the existing
  `tgev_game_evals.gev_depth` precedent; run manually in pgAdmin4:
  `ALTER TABLE teva_evaluations ADD COLUMN eva_depth smallint;` then
  `UPDATE teva_evaluations SET eva_depth = 16;`).
- `tgev_game_evals`: renamed `gev_move_num` → `gev_ply` (and its unique constraint's column
  reference), dropped `gev_cp_before`/`gev_cp_loss`/`gev_classification`/`gev_fen_before`
  (all cheaply derivable — see below), added `gev_cp_change integer` (signed, mover-relative,
  replaces `cp_loss` as the one stored delta). Run manually in pgAdmin4:
  ```sql
  ALTER TABLE tgev_game_evals RENAME COLUMN gev_move_num TO gev_ply;
  ALTER TABLE tgev_game_evals ADD COLUMN gev_cp_change integer;
  UPDATE tgev_game_evals
  SET gev_cp_change = CASE WHEN gev_ply % 2 = 0
    THEN gev_cp - gev_cp_before
    ELSE gev_cp_before - gev_cp
  END;
  ALTER TABLE tgev_game_evals DROP COLUMN gev_cp_before;
  ALTER TABLE tgev_game_evals DROP COLUMN gev_cp_loss;
  ALTER TABLE tgev_game_evals DROP COLUMN gev_classification;
  ALTER TABLE tgev_game_evals DROP COLUMN gev_fen_before;
  ```

### src/lib/stockfish.ts
- `MoveEvaluation` gained `cpChange` (signed, mover-relative — positive = good for the mover,
  matching `tgam_game_positions.gam_cp_change`'s convention).
- `analyzeGame()`: computes `cpChange` directly from the before/after white-perspective cp
  values; `cpLoss` is now derived from it (`Math.max(0, -cpChange)`) instead of being computed
  independently with its own floor.
- `classifyMove()` exported (was module-private) so `games.ts` can reuse it to derive
  classification live instead of reading a stored column.
- `ChessBoardView.tsx`'s dead `evaluateNodePosition()` (never called anywhere, confirmed via
  search) updated to the same `cpChange`-first pattern purely for type-correctness.

### src/lib/actions/games.ts
- `GameEvalRow` drops `fenBefore`/`cpBefore`/`cpLoss`/`classification` as independently-carried
  fields conceptually, gains `cpChange` — but the type itself still carries all of
  `MoveEvaluation`'s fields since callers pass/receive that full shape; only the DB columns
  actually read/written shrank.
- `saveGameEvaluations()`: writes the reduced column set (`gev_ply`, `gev_cp_change`, no
  `gev_fen_before`/`gev_cp_before`/`gev_cp_loss`/`gev_classification`).
- `getGameEvals()`: selects the reduced column set and reconstructs `cpBefore`/`fenBefore` from
  the previous row already present in the same fetched array (ply 0 uses `cp = 0` and a new
  local `STARTING_FEN` constant — the standard chess starting position, not a tunable value so
  it stays local rather than going in a constants file), `cpLoss` via `Math.max(0, -cpChange)`,
  and `classification` via the now-exported `classifyMove()`.

### src/app/analyze/page.tsx
- Removed `isFree`/`startFen`/`mode=free`/`fen` query-param handling entirely — a game is now
  always required; added a `!game` guard before rendering `ChessBoardView` (also narrows the
  type now that its `game` prop is required).

### src/ui/analysis/PositionDetail.tsx
- Removed the "Analyze this position" button (the only entry point into the no-game analysis
  route) and its now-unused `MyButton` import.

### src/ui/board/ChessBoardView.tsx
- `game` prop is now required; removed `startFen` prop, `isFreeAnalysis`, the "Free Analysis"
  badge, the mount effect's no-game branch (dedented the remaining branch, no behavior change
  for the game case), every `isFreeAnalysis`/`!isFreeAnalysis` conditional (collapsed to the
  "has game" side), and `isValidFen()` (dead code once its only caller was removed).

### src/lib/analysis/chessdb.ts
- `EvaluationRow` gained `eva_depth: number`.
- `saveEvaluation()` now requires `depth` and writes it to `eva_depth`.
- New `upgradePositionEvaluation({ fen, cp, bestMove, depth })`: looks up `tpos_positions` by
  FEN, upgrades `teva_evaluations` only if the new depth exceeds the stored one, and on upgrade
  immediately recomputes `gam_cp_change` for the affected `tgam_game_positions` rows via a
  scoped query (not `bulkUpdateCpLoss()`, to avoid writing a spurious `tpip_pipelinelog` run on
  every interactive analyze click).

### src/lib/analysis/enrichPositionsStockfish.ts
- `saveEvaluation()` call now passes the batch job's own `depth` (previously omitted, so
  `eva_depth` would have gone unset for pipeline-written rows).

### src/ui/analysis/EvalProgress.tsx
- `saveEvaluation()` call now passes its own `depth` prop (this component's browser-driven
  batch-eval path was a second caller of `saveEvaluation` found only via the type-check after
  `depth` became required).

### src/ui/board/ChessBoardView.tsx
- Mount effect: `fromMove` now defaults to `Math.min(5, totalFullMoves)` when the loaded game
  already has stored evaluations (was always `1`); `toMove` computed via the same
  `totalFullMoves` value instead of a duplicate inline expression.
- `runAnalysis()`: after a first-time full analysis (`!isReanalyze`) completes, `fromMove` is
  set to `Math.min(5, totalFullMoves)` so the re-analyze range defaults to move 5 onward.
- Position Analysis depth `MySelect`: options changed to
  `['20', '22', '24', '26', '28', '30', '40']`, dropping `'Infinite'`.
- `runAnalysis()`: after saving evaluations, loops over `results` and calls
  `upgradePositionEvaluation()` for each move's "before" FEN/cp/bestMove/depth (best-effort,
  silently caught per move).
- `startDeepAnalysis()`: added `latestDeepResultRef` tracking the top-ranked (true best, not
  display-reordered) line from each `processUpdate` tick; on engine completion, calls
  `upgradePositionEvaluation()` once for the analyzed FEN at the depth actually reached.
