# PLAN_pipelinegames-run-dropdown-number-only — chess

## Title
Show run number only (no "Run #" prefix) in pipelinegames Run dropdown

## Plan
- [x] In [src/app/owner/pipelinegames/page.tsx](../../src/app/owner/pipelinegames/page.tsx) (around lines 561-563), change the `MySelect` for run selection so options/value are the plain run id (e.g. `String(id)`) instead of `` `Run #${id}` ``, and update `onChange` to `parseInt(e.target.value, 10)` without the `.replace('Run #', '')` call.
- [x] In the `useEffect`/`load()` on mount ([page.tsx:271-299](../../src/app/owner/pipelinegames/page.tsx#L271-L299)), stop auto-calling the six expensive `refresh*Status()` functions (`refreshStep4`, `refreshCpChangeStatus`, `refreshPurgeStatus`, `refreshHabitsStatus`, `refreshGameEndingsStatus`, `refreshDeepenPopularStatus`) on page load. Keep `getPlayers()`, `getPipelineStatus()` (steps 1/3/3b), and the run-id/runs loading as-is. Leave the six affected steps' state unset (rendering as "—", matching the existing `n(undefined)` fallback) until the user clicks that row's `↻` or the global "Refresh" button.
- [x] Schema: add `pip_pipeline_type character varying(16) NOT NULL` to `tpip_pipelinelog`, positioned between `pip_run_id` and `pip_step` (per user decision — logical grouping over a plain append). Per user decision, existing `tpip_pipelinelog` data is disposable, so this is a plain `DROP TABLE` + recreate from the updated `scripts/schema.sql` (including its `pip_pipid` identity sequence and primary key) — no backup snapshot, no copy-back/backfill needed. All SQL given in chat for the user to run manually via pgAdmin4, per project convention — never run by Claude.
- [x] Add `scripts/schema.sql` update for `tpip_pipelinelog` reflecting the new column and position.
- [x] Add new named constants `PIPELINE_TYPE_GAMES = 'games'` and `PIPELINE_TYPE_MASTERS = 'masters'` to [src/lib/constants.ts](../../src/lib/constants.ts) (module scope).
- [x] In [src/lib/actions/pipelineLog.ts](../../src/lib/actions/pipelineLog.ts):
  - `logPipelineStep()` gains a required `pipelineType: string` param, included in the `INSERT` and passed through to `resolvePipRunId()`.
  - `resolvePipRunId()` gains a required `pipelineType` param; both its allocator and non-allocator `MAX(pip_run_id)` queries add `WHERE pip_pipeline_type = $1`, so a step only ever allocates/joins a run within its own pipeline type (per user decision — fixes the run-join side, not just the read side).
  - `getRecentRunIds()` and `getLatestPipelineRuns()` gain a required `pipelineType` param and filter by it, so a run belonging to the other pipeline type can never be selected.
- [x] Update all 15 `logPipelineStep()` call sites to pass the new required `pipelineType` param: `PIPELINE_TYPE_GAMES` in [src/lib/actions/sync.ts](../../src/lib/actions/sync.ts) (4 calls), [src/lib/analysis/buildPositionTree.ts](../../src/lib/analysis/buildPositionTree.ts) (3 calls), [src/lib/analysis/purgePositions.ts](../../src/lib/analysis/purgePositions.ts) (8 calls), [src/lib/analysis/enrichPositionsStockfish.ts](../../src/lib/analysis/enrichPositionsStockfish.ts) (7 calls), [src/lib/analysis/buildHabits.ts](../../src/lib/analysis/buildHabits.ts) (1 call); `PIPELINE_TYPE_MASTERS` in [src/lib/fide/fideStaging.ts](../../src/lib/fide/fideStaging.ts) (3 calls) and [src/lib/fide/fidePipeline.ts](../../src/lib/fide/fidePipeline.ts) (2 calls).
- [x] Update [src/app/owner/pipelinegames/page.tsx](../../src/app/owner/pipelinegames/page.tsx) to pass `PIPELINE_TYPE_GAMES` to `getRecentRunIds()`/`getLatestPipelineRuns()`.
- [x] Update [src/app/owner/pipelinemasters/page.tsx](../../src/app/owner/pipelinemasters/page.tsx) to pass `PIPELINE_TYPE_MASTERS` to `getRecentRunIds()`/`getLatestPipelineRuns()` (same latent bug exists there in reverse — a games run could currently show up on the masters page).
- [x] Add the two new constants to `CONSTANTS_SECTIONS` in [src/app/owner/constants/page.tsx](../../src/app/owner/constants/page.tsx) per project convention (import, section entry, description, `consumers` list in the `"file.ts: functionName"` format).
- [x] In [src/lib/actions/pipelineLog.ts](../../src/lib/actions/pipelineLog.ts), change `getRecentRunIds()`'s return type from `number[]` to `{ runId: number; created: string }[]` — `SELECT pip_run_id, MIN(pip_created) AS pip_created FROM tpip_pipelinelog WHERE pip_pipeline_type = $1 GROUP BY pip_run_id ORDER BY pip_run_id DESC LIMIT $2` (earliest sub-step's timestamp for that run — per user, any one of a run's dates is fine).
- [x] In [src/app/owner/pipelinegames/page.tsx](../../src/app/owner/pipelinegames/page.tsx), change `recentRunIds` state from `number[]` to `{ runId: number; created: string }[]`, update all `getRecentRunIds()` call sites accordingly, and change the Run `MySelect` to pass `options={recentRunIds.map(r => ({ value: String(r.runId), label: `${r.runId} — ${new Date(r.created).toLocaleDateString()}` }))}` (date only, no time) instead of plain `String(id)` labels. `value`/`onChange` keep working of off the plain run id string.
- [x] In [src/app/owner/pipelinemasters/page.tsx](../../src/app/owner/pipelinemasters/page.tsx), update `recentRunIds` state/usages to match `getRecentRunIds()`'s new `{ runId, created }[]` return shape (`ids.map(r => r.runId)` where a bare id list is still needed) so the project still compiles — this page's own dropdown display is out of scope here and keeps its current `Run #<id>` format.
- [x] In [src/lib/constants.ts](../../src/lib/constants.ts), change `POPULAR_POSITION_DEPTH_TIERS` (per user-agreed values) from:
  ```ts
  { minReach: 50, depth: 30 },
  { minReach: 30, depth: 24 },
  { minReach: 10, depth: 22 }
  ```
  to:
  ```ts
  { minReach: 50, depth: 30 },
  { minReach: 30, depth: 24 },
  { minReach: 20, depth: 22 },
  { minReach: 10, depth: 20 }
  ```
  Fully data-driven elsewhere (`popularPositionTierSql()`, `countRemainingPopularPositionsByTier()`, and the Step 9 UI tier breakdown in pipelinegames/page.tsx all iterate the array), so no other code changes are needed — the new d20 tier appears automatically. Also updated the Step 9 `MyHelpStep` `processing` text (hardcoded the old tier values in prose) to match.
- [x] In the `useEffect`/`load()` on mount ([page.tsx](../../src/app/owner/pipelinegames/page.tsx)), also drop the `getPipelineStatus()` call and its `setS1`/`setS3`/`setS3b` usages — so Steps 1-3 start at "—" on load too, matching Steps 4-9. Keep `getPlayers()`, `getPipelineRates()` (used for ETA display), and the run-id/runs loading as-is.

## Changes
### src/app/owner/pipelinegames/page.tsx
- Run-selector `MySelect` now uses plain run id strings for `options`/`value` instead of `Run #<id>`, so the dropdown displays just the number. `onChange` parses `e.target.value` directly since it's no longer prefixed.
- On mount, `load()` no longer calls `refreshStep4`, `refreshCpChangeStatus`, `refreshPurgeStatus`, `refreshHabitsStatus`, `refreshGameEndingsStatus`, or `refreshDeepenPopularStatus`. Steps 4, CP Change, Purge, Habits, Game Endings, and Deepen Popular now render "—" (unset) until the user clicks that row's `↻` or the global "Refresh" button — page load only fetches players, the combined `getPipelineStatus()` (steps 1/3/3b), and recent runs.
- `getRecentRunIds()`/`getLatestPipelineRuns()` calls now pass `PIPELINE_TYPE_GAMES`, so the Run selector and Jobs summary table can never show a masters-pipeline run.
- Run `MySelect` now shows `{runId} — {date}` labels (date only, no time) instead of the bare run number, using `recentRunIds`' new `{runId, created}` shape; widened `overrideClass` from `w-28` to `w-40` to fit the longer label.

### src/app/owner/pipelinemasters/page.tsx
- `getRecentRunIds()`/`getLatestPipelineRuns()` calls now pass `PIPELINE_TYPE_MASTERS` (same latent cross-pipeline bug fixed here too).
- `recentRunIds` state and its Run `MySelect` updated to match `getRecentRunIds()`'s new `{runId, created}[]` return shape; display format (`Run #<id>`) unchanged — out of scope for this page.

### scripts/schema.sql
- `tpip_pipelinelog` gains `pip_pipeline_type character varying(16) NOT NULL`, positioned between `pip_run_id` and `pip_step`; identity sequence reset to `START WITH 1` since the table is being dropped and recreated empty.

### src/lib/constants.ts
- New constants `PIPELINE_TYPE_GAMES = 'games'` and `PIPELINE_TYPE_MASTERS = 'masters'`.
- `POPULAR_POSITION_DEPTH_TIERS` d22 tier's `minReach` changed 10 → 20; new d20 tier added for `minReach: 10`. Step 9's tier breakdown, SQL, and Constants page all read this constant directly, so they now show/use all 4 tiers automatically.

### src/app/owner/pipelinegames/page.tsx (Step 9 help text)
- Step 9's `MyHelpStep` `processing` text updated to describe the new 4-tier breakdown (was hardcoded prose describing the old 3 tiers).

### src/app/owner/pipelinegames/page.tsx (load-on-mount, steps 1-3)
- `load()` no longer calls `getPipelineStatus()`; Steps 1 (`s1`), 2 (`s3`), and 3 (`s3b`) now start unset ("—") on page load like Steps 4-9, populating only on `↻`/"Refresh". Removed the now-unused `getPipelineStatus`/`PipelineStatus` import.

### src/lib/actions/pipelineLog.ts
- `logPipelineStep()` and `resolvePipRunId()` now take a required `pipelineType` param; `resolvePipRunId()`'s run-id allocation and join queries are scoped `WHERE pip_pipeline_type = $1` (each pipeline type gets its own independent run-id sequence). `getRecentRunIds()` and `getLatestPipelineRuns()` take a required `pipelineType` param and filter by it.

### src/lib/actions/sync.ts, src/lib/analysis/buildPositionTree.ts, src/lib/analysis/purgePositions.ts, src/lib/analysis/enrichPositionsStockfish.ts, src/lib/analysis/buildHabits.ts
- All `logPipelineStep()` calls now pass `pipelineType: PIPELINE_TYPE_GAMES`.

### src/lib/fide/fideStaging.ts, src/lib/fide/fidePipeline.ts
- All `logPipelineStep()` calls now pass `pipelineType: PIPELINE_TYPE_MASTERS`.

### src/app/owner/constants/page.tsx
- Added `PIPELINE_TYPE_GAMES`/`PIPELINE_TYPE_MASTERS` entries to `CONSTANTS_SECTIONS`.

## Testing
- [ ] **Run the schema SQL below manually via pgAdmin4 first** (drops and recreates `tpip_pipelinelog` — existing pipeline log history will be lost, per your go-ahead)
- [ ] Open http://localhost:4052/owner/pipelinegames and confirm the run dropdown next to "Pipeline Jobs —" shows each run as "{number} — {date}" (e.g. "42 — Aug 22, 2026"), date only, no time
- [ ] Run a games-pipeline step (e.g. Step 1 "Run") and confirm it logs successfully and appears correctly in the Jobs summary table and Run dropdown
- [ ] Open http://localhost:4052/owner/pipelinemasters, run a FIDE step, and confirm it logs and appears correctly there — and confirm it does NOT show up on the pipelinegames page's Run dropdown/Jobs summary, and vice versa
- [ ] Reload http://localhost:4052/owner/pipelinegames and confirm it loads noticeably faster, and that Steps 4, 6 (CP Change), Purge, 7 (Habits), 8 (Game Endings), and 9 (Deepen Popular) show "—" for Processed/Remaining until refreshed
- [ ] Click each of those rows' `↻` and confirm the stats populate correctly
- [ ] Click the global "Refresh" button and confirm all steps (including 1/3/3b) refresh correctly
- [ ] On Step 9 (Deepen Popular Positions), click `↻` and confirm the tier breakdown now shows 4 tiers — `d30`, `d24`, `d22`, `d20` — with real counts, and that the "Help" text describes reach thresholds 50/30/20/10 → depths 30/24/22/20
- [ ] Reload pipelinegames and confirm Steps 1, 2, and 3 (in the "Run Pipeline" panel) now also show "—" for Processed/Remaining/Status on load, same as Steps 4-9 — no row shows "Completed" until refreshed
- [ ] Click Step 1/2/3's `↻` individually and confirm they populate correctly; click the global "Refresh" and confirm all 9 rows populate

## Manual SQL — run via pgAdmin4 (drops and recreates `tpip_pipelinelog`; existing log history is lost)

```sql
DROP TABLE public.tpip_pipelinelog;

CREATE TABLE public.tpip_pipelinelog (
    pip_pipid integer NOT NULL,
    pip_run_id integer DEFAULT 0 NOT NULL,
    pip_pipeline_type character varying(16) NOT NULL,
    pip_step smallint NOT NULL,
    pip_sub_step character varying(1) NOT NULL,
    pip_step_name character varying(64) DEFAULT ''::character varying NOT NULL,
    pip_input_table character varying(64),
    pip_input_recs integer DEFAULT 0 NOT NULL,
    pip_output_table character varying(64),
    pip_output_recs integer DEFAULT 0 NOT NULL,
    pip_duration_ms integer DEFAULT 0 NOT NULL,
    pip_created timestamp DEFAULT now() NOT NULL
);

ALTER TABLE public.tpip_pipelinelog ALTER COLUMN pip_pipid ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.tpip_pipelinelog_pip_pipid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.tpip_pipelinelog
    ADD CONSTRAINT tpip_pipelinelog_pkey PRIMARY KEY (pip_pipid);
```
