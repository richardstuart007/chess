# PLAN_habits-dismiss-materialized-table — chess

## Title
Materialize Habits into thab_habits (pipeline-built) with a per-habit "dismiss, don't show again" flag

## Plan
- [x] `scripts/schema.sql` — add the new `thab_habits` table definition (placed alphabetically
      after `tgr_gamesraw`, before `tpip_pipelinelog`):
      - `hab_habid` — IDENTITY PK
      - `hab_player` — varchar(64) NOT NULL
      - `hab_pos_id` — integer NOT NULL
      - `hab_move_san` — text NOT NULL
      - `hab_move_uci` — text
      - `hab_move_num` — integer
      - `hab_move_times` — integer NOT NULL
      - `hab_move_wins` — integer NOT NULL
      - `hab_move_losses` — integer NOT NULL
      - `hab_move_cp` — numeric(6,2)
      - `hab_dismissed` — boolean DEFAULT false NOT NULL
      - `hab_dismissed_at` — timestamp with time zone
      - UNIQUE (`hab_player`, `hab_pos_id`, `hab_move_san`)
      - INDEX `idx_thab_player` on `hab_player`
- [x] User runs the corresponding `CREATE TABLE`/`CREATE UNIQUE INDEX`/`CREATE INDEX` SQL manually
      via pgAdmin4 (provided in chat once this step is reached — never executed by Claude).
- [x] `src/lib/constants.ts` — add `HABITS_MIN_REACH_FLOOR = 2`: the loosest reach threshold baked
      into the build step (matches the lowest option in the Habits page's "Min Reached" dropdown),
      so every dropdown option (2/3/5/10) can still filter the materialized rows at read time via
      `hab_move_times >= $N`.
- [x] New `src/lib/analysis/buildHabits.ts` (`'use server'`) — `buildHabits()`: full recompute each
      run (no incremental cursor — an aggregate's own average can change as new games arrive, so
      there is no safe "already processed" cursor the way row-insertion steps have one). Aggregates
      `tgam_game_positions` joined to `tgd_gamesdecon` (`GROUP BY gd_player, gam_pos_id,
      gam_move_played`, filtered to `gam_move_num >= MIN_ANALYSIS_MOVE`, `HAVING COUNT(*) >=
      HABITS_MIN_REACH_FLOOR AND AVG(gam_cp_change) < 0` — same shape as today's
      `getHabitsData`/`getHabitsCount` query, minus the player/color/minReached filters, which move
      to read time). Writes via `table_query` (`isupdate: true`) as a single `INSERT ... SELECT ...
      ON CONFLICT (hab_player, hab_pos_id, hab_move_san) DO UPDATE SET` that updates only
      `hab_move_uci`, `hab_move_num`, `hab_move_times`, `hab_move_wins`, `hab_move_losses`,
      `hab_move_cp` — **`hab_dismissed`/`hab_dismissed_at` are never in the `SET` clause**, so a
      dismissed habit's flag survives every rebuild even though its stats keep refreshing. Calls
      `cache_clearTable('thab_habits', ...)` afterward (raw `table_query` writes aren't cache-aware).
      Logs via `logStart`/`logEnd`/`write_logging`/`logPipelineStep`, matching the other steps'
      pattern.
- [x] New `src/app/api/analysis/build-habits/route.ts` — GET handler calling `buildHabits()`,
      same shape as `update-cp-change/route.ts`.
- [x] `src/lib/actions/pipelineLog.ts` / `src/lib/actions/pipelineStatus.ts` — add
      `refreshHabitsStatus()` returning `{ total, dismissed }` row counts from `thab_habits`, for
      the pipeline page's status line.
- [x] `src/app/owner/pipeline/page.tsx` — add Step 7 "Build Habits" `MyBox` (status badge/refresh
      button, `MyHelpStep` description, "Run Build Habits" button hitting the new route); add it to
      `JOB_GROUPS` (schedule `9am`) and to the end of `handleRunAll`'s sequence.
- [x] `src/ui/analysis/PipelineHelp.tsx` — add a `STEPS` entry for step 7 (Build Habits); add
      `thab_habits` to `ROW_COUNT_SQL`.
- [x] `vercel.json` — add `{ "path": "/api/analysis/build-habits", "schedule": "0 9 * * *" }` after
      the existing `update-cp-change` entry.
- [x] `src/lib/analysis/chessdb.ts` — rewrite `getHabitsData`/`getHabitsCount` to read from
      `thab_habits` (joined to `tpos_positions` for `pos_fen`/`pos_color`, `LEFT JOIN
      teva_evaluations` for `pos_cp`) filtered by `hab_player = $1`, `NOT hab_dismissed`,
      `hab_move_times >= $minReached`, optional `pos_color = $color` — drop the old 3-table live
      aggregation and the `minMove` query param (now baked into `buildHabits`'s `WHERE` at build
      time, matching the UI's single fixed option). Add `dismissHabit(player, posId, moveSan)` using
      `table_update` on `thab_habits` (sets `hab_dismissed = true`, `hab_dismissed_at = now()`).
- [x] `src/ui/analysis/HabitsTable.tsx` — add a small "Dismiss" control per row that calls
      `dismissHabit` and stops propagation to the row's own `onClick` (which navigates to Position
      Detail); on success, removes the row from the table via a callback prop.
- [x] `src/app/habits/page.tsx` — pass a `handleDismiss` callback into `HabitsTable` that calls
      `dismissHabit`, then removes the row from local `rows` state and decrements `totalCount` so
      the pagination footer stays consistent without a full refetch.
- [x] Post-implementation fixes (found while trying it live): `hab_move_cp` widened from
      `numeric(6,2)` (overflowed on large mate-score-derived CP swings) to `integer`, with rounding
      moved from SQL `ROUND()` into `buildHabits.ts` itself (user preference — no DB-level
      rounding). This changed `buildHabits()` from one `INSERT ... SELECT` statement into a plain
      `SELECT` (raw, unrounded `AVG`) followed by a chunked, parameterized bulk
      `INSERT ... VALUES ... ON CONFLICT` built from JS-side rounded values.
- [x] Added a "Show dismissed" toggle + undo path (user decision, via explicit choice — originally
      built one-way): `undismissHabit(player, posId, moveSan)` in `chessdb.ts`;
      `getHabitsData`/`getHabitsCount` gain a `dismissed?: boolean` filter (defaults to `false`);
      `HabitsTable` takes `dismissedView`/`onToggleDismiss` instead of a dismiss-only callback,
      showing "↺ Restore" instead of "✕ Dismiss" in that column when viewing dismissed rows;
      `habits/page.tsx` adds `showDismissed` state (persisted alongside the other filters) and a
      toggle button, routing the row-level action to `dismissHabit` or `undismissHabit` depending
      on which view is active.
- [x] Redefined `hab_move_cp` from `AVG(gam_cp_change)` to the single occurrence with the largest
      magnitude of change (`ORDER BY ABS(gam_cp_change) DESC`, keeping its real sign) — user
      clarification that `gam_cp_change` is a signed change, not a loss, and for a fixed
      `(position, move)` pair every occurrence is actually the same deterministic value today (same
      before/after positions, one evaluation each per `teva_evaluations`), so this only behaves
      differently from the old average if that determinism ever stops holding. `hab_move_cp` stays
      `numeric(6,2)` (reverted from the `integer` detour) with `HABITS_MOVE_CP_CLAMP` doing the
      overflow protection in `buildHabits.ts` instead of a wider column.
- [x] Fixed a bug found while testing: the Pipeline Jobs summary table didn't refresh after any
      individual step button (not unique to Build Habits — none of the 7 step handlers called
      `doRefreshRuns()` on their own, only "Run All" and the manual `↻`). Added `doRefreshRuns()` to
      all 7 (`handleGameSync`, `handleBuildTree`, `handleSyncTpos`, `handlePurge`,
      `handleEvaluatePositions`, `handleUpdateCp`, `handleBuildHabits`) for consistency.
- [x] Root-caused the deeper bug behind the above: standalone step clicks default
      `forceNewRun=true`, which `resolvePipRunId` (`pipelineLog.ts`) turns into a **brand-new**
      `pip_run_id` regardless of step number — and `getLatestPipelineRuns()` only showed rows
      belonging to the single highest `pip_run_id`, so a solo click made every other step/sub-step
      vanish ("—") until the next coordinated run repopulated them all under one shared run_id.
      Fixed by redefining `getLatestPipelineRuns()` to fetch each `(step, sub-step)`'s own most
      recent row (`ROW_NUMBER() OVER (PARTITION BY pip_step, pip_sub_step ORDER BY pip_pipid DESC)
      = 1`) instead of filtering to one shared run_id — immune to this class of bug regardless of
      whether steps ran together or individually. The "Run #N" table header became informational
      only (`Math.max(...runs.map(r => r.pip_run_id))`), since rows can now each belong to a
      different run_id.
- [x] Removed the `title` prop from every per-step `<MyHelp label='SQL' ... />` status-SQL popover
      (7 call sites) — user preference: the popover should show only the raw copyable SQL, no
      heading text mixed in above it.
- [x] Reverted the per-step "latest run" change above (user decision, after seeing it live): showing
      each step's own latest run meant the table could display rows from different run_ids under
      one "Run #N" header (e.g. steps 1-6 from run #11, step 7 from run #12), which read as
      misleading even though each row was individually accurate. `getLatestPipelineRuns()` and the
      "Run #N" header are back to filtering on a single shared `pip_run_id` — the accepted
      trade-off is that a standalone single-step click (own new run_id) again shows "—" for every
      other step until the next coordinated run.
- [x] Changed the whole cron schedule from hourly gaps (3am-9am) to 20-minute gaps (3:00am, 3:20am,
      3:40am, 4:00am, 4:20am, 4:40am, 5:00am) across all 7 steps — user decision, unrelated to the
      Habits work itself but touched the same `vercel.json`/pipeline page files.

## Changes

### scripts/schema.sql
- Added the `thab_habits` table definition, placed alphabetically after `tgr_gamesraw` and before
  `tpip_pipelinelog`: `hab_habid` (IDENTITY PK), `hab_player`, `hab_pos_id`, `hab_move_san`,
  `hab_move_uci`, `hab_move_num`, `hab_move_times`, `hab_move_wins`, `hab_move_losses`,
  `hab_move_cp`, `hab_dismissed` — plus a `UNIQUE (hab_player, hab_pos_id, hab_move_san)`
  constraint and `idx_thab_player` index. `hab_dismissed_at` was dropped from the design mid-build
  (user decision — no timestamp column wanted); the user already ran the original `CREATE TABLE`
  including it and was given a follow-up `ALTER TABLE thab_habits DROP COLUMN hab_dismissed_at;`
  to run manually.
- `hab_move_cp` went through several type changes while troubleshooting a "numeric field overflow"
  error live: `numeric(6,2)` → `numeric(8,2)` → `integer`, before settling back on `numeric(6,2)`
  once the real fix (clamping the value in `buildHabits.ts` via `HABITS_MOVE_CP_CLAMP`, rather than
  widening the column) was identified — mate scores are normalized to +-10000
  (`enrichPositionsStockfish.ts`), so a single real `gam_cp_change` swing can exceed a fixed-width
  numeric column regardless of rounding/averaging. The user ran the corresponding `ALTER TABLE`
  manually via pgAdmin4 at each step, alongside the original `CREATE TABLE`/constraint/index SQL.

### src/lib/constants.ts
- Added `HABITS_MIN_REACH_FLOOR = 2` — the loosest reach threshold baked into `buildHabits`'s
  `HAVING` clause, matching the lowest option in the Habits page's "Min Reached" dropdown so every
  dropdown option (2/3/5/10) still works at read time via `hab_move_times >= $N`.

### src/lib/analysis/buildHabits.ts (new)
- `buildHabits(level, forceNewRun)` — full recompute + upsert into `thab_habits` every run (no
  incremental cursor: a habit's own average CP loss can change as new games arrive for a move
  already in the table, not just add new rows). Aggregates `tgam_game_positions` joined to
  `tgd_gamesdecon`/`tpos_positions`, `GROUP BY gd_player, gam_pos_id, gam_move_played`, filtered to
  `gam_move_num >= MIN_ANALYSIS_MOVE` and the tracked player's own turn (`pos_color` check), `HAVING
  COUNT(*) >= HABITS_MIN_REACH_FLOOR AND AVG(gam_cp_change) < 0`. Writes via a raw `db.query`
  (`isupdate: true`) — same pattern as `purgePositions.ts`/`buildPositionTree.ts`, not the cached
  `table_query` helper, since this is a write. `hab_dismissed` is never in the upsert's `SET`
  clause, so a dismissed habit's flag survives every rebuild. Logs via
  `logStart`/`logEnd`/`write_logging`/`logPipelineStep` (step 7, sub-step 'a'), matching the other
  pipeline steps.
- Revised after a live "numeric field overflow" error and a follow-up preference against DB-level
  rounding: the aggregate query became a plain `SELECT` fetched into JS as `HabitAggregate[]`,
  followed by a separate, chunked (`POSITION_INSERT_CHUNK_SIZE`), parameterized
  `INSERT ... VALUES ... ON CONFLICT ... DO UPDATE SET` (helper `chunkRows`, plain fixed-size
  chunking — no grouping constraint needed, unlike `buildPositionTree`'s `chunkByGame`).
- `move_cp` itself was then redefined: instead of `AVG(gam_cp_change)`, the `SELECT` now picks
  `(ARRAY_AGG(gam_cp_change ORDER BY ABS(gam_cp_change) DESC))[1]` — the real signed value of the
  occurrence with the largest magnitude of change — computed in a subquery so the outer query can
  filter `WHERE move_cp < 0` (replacing the old `HAVING AVG(gam_cp_change) < 0`; `HAVING COUNT(*) >=
  $2` stays in the inner query). The JS side clamps that value to +-`HABITS_MOVE_CP_CLAMP` (no
  longer needs `Math.round()` — the picked value is already a whole number, since `gam_cp_change`
  itself always is).

### src/app/api/analysis/build-habits/route.ts (new)
- GET handler calling `buildHabits()`, same shape as `update-cp-change/route.ts`.

### src/lib/actions/pipelineStatus.ts
- Added `refreshHabitsStatus()` returning `{ total, dismissed }` row counts from `thab_habits`.

### src/lib/actions/pipelineLog.ts
- Briefly rewrote `getLatestPipelineRuns()` to fetch each `(pip_step, pip_sub_step)`'s own most
  recent row (window function) instead of every row sharing the single highest `pip_run_id`, then
  reverted it back to the original single-run_id filter after live testing showed the mixed-run
  display read as misleading (user decision) — net change to this function: none.

### src/app/owner/pipeline/page.tsx
- Added `sHabits`/`sHabitsLoading` state, `doRefreshHabits()`, and wired both into `doRefreshAll`
  and the initial load effect.
- Added `handleBuildHabits()` (hits `/api/analysis/build-habits`) and a Step 7 "Build Habits"
  `MyBox` (status line showing total/dismissed counts + SQL help, `MyHelpStep` description, "Run
  Build Habits" button) — no `StatusBadge`/ETA, since this step is a full recompute with no
  "remaining" concept, unlike the incremental steps above it.
- Added a `{ step: 7, groupLabel: 'Build Habits', schedule: '9am', ... }` entry to `JOB_GROUPS` and
  `handleBuildHabits(false)` to the end of `handleRunAll`'s sequence.
- Updated the Step 7 `MyHelpStep` wording after `hab_move_cp` was redefined: "average CP change" →
  "largest-magnitude occurrence... not an average" throughout.
- Added `doRefreshRuns()` to `handleGameSync`, `handleBuildTree`, `handleSyncTpos`, `handlePurge`,
  `handleEvaluatePositions`, `handleUpdateCp`, and `handleBuildHabits` so the Pipeline Jobs summary
  table refreshes after any individual step button, not just "Run All"/the manual `↻` (pre-existing
  gap across all 7 handlers, not specific to Build Habits).
- Briefly changed the "Pipeline Jobs" `MyBox` title from `runs[0].pip_run_id` to
  `Math.max(...runs.map(r => r.pip_run_id))`, then reverted it back to `runs[0].pip_run_id`
  alongside the `pipelineLog.ts` revert above — net change: none.
- Removed the `title` prop from all 7 `<MyHelp label='SQL' ... />` status-SQL popovers (user
  preference — raw copyable SQL only, no heading text).
- Updated `JOB_GROUPS`' `schedule` labels to match the new 20-minute cron gaps (`3:00am` ...
  `5:00am`) and the file's own comment referencing "3am-8am".

### src/ui/analysis/PipelineHelp.tsx
- Added a `STEPS` entry for step 7 (Build Habits) and a `thab_habits` row to `ROW_COUNT_SQL`.
- Updated the step 7 wording to match the `hab_move_cp` redefinition (worst-occurrence, not average).

### vercel.json
- Added `{ "path": "/api/analysis/build-habits", "schedule": "0 9 * * *" }` after the
  `update-cp-change` entry (later re-scheduled — see below).
- Changed all 7 cron schedules from hourly (3am-9am) to 20-minute gaps: `0 3`, `20 3`, `40 3`,
  `0 4`, `20 4`, `40 4`, `0 5` (`build-habits` now `0 5 * * *`).

### src/lib/analysis/chessdb.ts
- Rewrote `getHabitsData`/`getHabitsCount` to read from `thab_habits` (joined to `tpos_positions`
  for `pos_fen`/`pos_color`, `LEFT JOIN teva_evaluations` for `pos_cp`) filtered by `hab_player`,
  `hab_dismissed = $dismissed`, `hab_move_times >= $minReached`, optional `pos_color = $color` —
  replacing the old live 3-table aggregation. Dropped the `minMove` query param (now baked into
  `buildHabits`'s `WHERE` at build time) and the now-unused `MIN_ANALYSIS_MOVE` import.
  `buildHabitsFilter` gained a `dismissed?: boolean` option (default `false`) alongside
  player/color/minReached.
- Added `dismissHabit(player, posId, moveSan)` and `undismissHabit(player, posId, moveSan)`, both
  using `table_update` on `thab_habits` (toggle `hab_dismissed` true/false — no timestamp column
  per the schema change above).
- Added the `table_update` import.

### src/ui/analysis/HabitsTable.tsx
- Added `dismissedView`/`onToggleDismiss` props (replacing a dismiss-only `onDismiss`) and a small
  button in a new last column per row; its click handler stops propagation (so it doesn't also
  trigger the row's navigate-to-Position-Detail `onClick`) and calls
  `onToggleDismiss(row.pos_id, row.move_san)`. Shows "✕" (dismiss) normally, "↺" (restore) when
  `dismissedView` is true; empty-state message also varies by view.
- Updated the "CP" column help text to match the `hab_move_cp` redefinition (largest-magnitude
  occurrence, not an average).

### src/app/habits/page.tsx
- Imported `dismissHabit`/`undismissHabit`; added `showDismissed` state (persisted alongside the
  other filters in `STORAGE_KEY`, resets `currentPage` to 1 on change like the other filters) and
  a "Show dismissed" toggle button. `getHabitsData`/`getHabitsCount` calls pass
  `dismissed: showDismissed`; dropped `minMove` (kept as a UI-only, single-option dropdown — no
  longer forwarded to the query). Added `handleToggleDismiss(posId, moveSan)` that calls
  `dismissHabit` or `undismissHabit` depending on `showDismissed`, then removes the row from local
  `rows` state and decrements `totalCount` either way (no full refetch/page shift for the other
  rows still on screen). Footer label switches between "bad" and "dismissed" moves to match the
  active view.
