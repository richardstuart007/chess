# PLAN_pipeline-run-all-and-cron-cleanup — chess

## Title
Pipeline page: Run All + jobs summary table; retire the stale owner/cron page

## Plan
- [x] Add `pip_created` timestamp and `pip_run_id` columns to `tpip_pipelinelog` — SQL to run
      manually via pgAdmin4:
  ALTER TABLE tpip_pipelinelog ADD COLUMN pip_created timestamp DEFAULT NOW() NOT NULL;
  ALTER TABLE tpip_pipelinelog ADD COLUMN pip_run_id integer NOT NULL DEFAULT 0;
  Update `scripts/schema.sql` to match.
- [x] `src/lib/actions/pipelineLog.ts` — add a `resolvePipRunId(step: number): Promise<number>`
      function: for `step === 1` (Game Sync) returns `COALESCE(MAX(pip_run_id), 0) + 1` (allocates a
      new run id); for every other step returns `COALESCE(MAX(pip_run_id), 1)` (reuses the current
      highest run id — the `COALESCE` only matters for the bootstrap case where a non-step-1 job
      runs before any step 1 row exists yet). `startPipelineLog` calls this first and passes the
      result into its existing `INSERT` as a plain parameter. No call-site changes needed elsewhere
      — `step` is already passed by every caller of `startPipelineLog`.
- [x] `src/lib/actions/pipelineLog.ts` — add a `getLatestPipelineRuns()` action returning the most
      recent `tpip_pipelinelog` row per `pip_step` (1–6), including `pip_created` and `pip_run_id`.
- [x] `src/ui/analysis/PipelineLogTable.tsx` — add `pip_created` and `pip_run_id` to the row type
      and render them as new columns ("Created", "Run").
- [x] `src/app/owner/pipeline/page.tsx` — add a jobs summary table above the existing per-step boxes:
      one row per job (Game Sync, Build Position Tree, Sync tpos, Purge Stale Positions, Evaluate
      Positions, Update CP Change) showing its scheduled time (static, from `vercel.json`), last run
      time (`pip_created`), processed/errors/duration from `getLatestPipelineRuns()`, and a status
      badge. Existing per-step boxes (help, SQL, ETA, individual run buttons) stay unchanged below it.
- [x] `src/app/owner/pipeline/page.tsx` — add a "Run All" button that sequentially calls the existing
      handlers in schedule order: `handleGameSync` → `handleBuildTree` → `handleSyncTpos` →
      `handlePurge` → `handleEvaluatePositions` → `handleUpdateCp`. Continues past a failed step
      (matches how the 6 independently-scheduled crons already behave in production). Refreshes the
      summary table and stats after each step.
- [x] Delete `/owner/cron`: `src/app/owner/cron/page.tsx`, its nav entry in `src/app/owner/page.tsx`,
      and now-unused backing code `src/lib/actions/cron.ts` (`runCronSync`) and
      `src/lib/actions/cronAnalysis.ts` (`runCronAnalysis`) — both fully superseded by the Pipeline
      page (which already calls the correct, complete implementations for each of the 6 steps).
- [x] Delete the orphaned bundle route `src/app/api/analysis/cron/route.ts` — no longer referenced
      by `vercel.json` since the 6 steps were split into independent scheduled crons.
- [x] Clean up stale `'analysisCronRoute'` log-caller labels left over from the deleted bundle route:
      - `src/lib/analysis/buildPositionTree.ts` — remove the now-dead `level === 1 ? 'analysisCronRoute' : 'runCronAnalysis'`
        branch (the `runCronAnalysis` side becomes unreachable once `cronAnalysis.ts` is deleted);
        use a single accurate caller label.
      - `src/lib/analysis/enrichPositionsStockfish.ts` and `src/lib/analysis/purgePositions.ts` —
        replace the hardcoded `'analysisCronRoute'` caller label with an accurate one, since that
        route no longer exists.
- [x] Remove `pip_date_from`/`pip_date_to` from `tpip_pipelinelog` and the whole date-range filter
      capability behind them — confirmed dead in practice: no caller (Pipeline page buttons or any
      of the 6 scheduled crons) ever passes `dateFrom`/`dateTo` today. Plain `DROP COLUMN` (no
      reorder dance needed — dropping doesn't care about column position), SQL given in chat only,
      run manually via pgAdmin4:
  ALTER TABLE tpip_pipelinelog DROP COLUMN pip_date_from;
  ALTER TABLE tpip_pipelinelog DROP COLUMN pip_date_to;
      - `scripts/schema.sql` — remove both columns from `tpip_pipelinelog`.
      - `src/lib/actions/pipelineLog.ts` — remove `dateFrom`/`dateTo` params from `startPipelineLog`
        and from its `INSERT` column list/params.
      - `src/lib/analysis/buildPositionTree.ts` — remove `dateFrom`/`dateTo` from `buildPositionTree`'s
        opts, its date-range `WHERE` branch, and its `startPipelineLog` call args.
      - `src/lib/analysis/enrichPositionsStockfish.ts` — remove `dateFrom`/`dateTo` from
        `enrichPositionsStockfish`'s opts and its internal helpers (`countRemainingPositions`,
        `countEvaluatedPositions`, `getResultingFensToEvaluate`), their date-range `WHERE` branches,
        and the `startPipelineLog` call args. (Not touching `chessdb.ts`'s `getPositionsToEvaluate`
        — separate, unrelated browser-evaluation feature that also happens to take `dateFrom`/`dateTo`,
        but isn't called with them either and isn't part of the pipeline-log system.)
      - `src/app/api/analysis/build-tree/route.ts` and `src/app/api/analysis/evaluate-positions/route.ts`
        — remove reading `dateFrom`/`dateTo` search params and passing them through.
      - `src/ui/analysis/PipelineLogTable.tsx` — remove `pip_date_from`/`pip_date_to` from the row
        type and the detail-panel display (the main grid never showed them).
- [x] `src/ui/analysis/PipelineLogTable.tsx` — add a "Run" filter (equality on `pip_run_id`), same
      pattern as the existing Step/Step Name filters. Always exclude `pip_run_id = 0` from the base
      query (unconditional, not tied to the filter input) — those are pre-migration historical rows
      that never belonged to a real run, so they'd otherwise show up as noise mixed into any
      run-grouped view.
- [x] Move the `pip_run_id = 0` exclusion — it belongs on `/owner/pipeline`'s summary table, not the
      full history log:
      - `src/ui/analysis/PipelineLogTable.tsx` — remove the unconditional `pip_run_id <> 0` filter;
        the log page shows full history, including pre-migration rows (the Run filter input stays,
        so `0` can still be searched for explicitly).
      - `src/lib/actions/pipelineLog.ts` — `getLatestPipelineRuns()` excludes `pip_run_id = 0` rows,
        so a step whose most recent row predates the migration shows as "no run since migration"
        rather than a misleading `Run: 0`.
- [x] Pipeline Jobs summary table refinements:
      - `src/lib/actions/pipelineLog.ts` — `getLatestPipelineRuns()` now scopes to the single highest
        `pip_run_id` (excluding 0) instead of each step's own latest row independently, so a step
        that didn't execute in the latest run shows as missing (`—`) rather than falling back to an
        older run's data.
      - `src/app/owner/pipeline/page.tsx` — box title shows the run id ("Pipeline Jobs — Run #N")
        instead of a per-row Run column, since all returned rows now share one run id. Duration
        displayed in rounded seconds instead of raw ms; Processed/Errors/Duration all comma-formatted
        via `.toLocaleString()`.
- [x] Pipeline Jobs table polish: "Duration" header renamed to "Duration(s)" (unit moved out of the
      cell values), and Processed/Errors/Duration columns right-aligned instead of centered.
- [x] Renumber pip_step 4/5 to match actual execution order, and renumber the on-page display labels
      to match:
      - `src/lib/analysis/purgePositions.ts` — `startPipelineLog(5, 'Purge Stale Positions', ...)` → `4`
      - `src/lib/analysis/enrichPositionsStockfish.ts` — `startPipelineLog(4, 'Evaluate Positions', ...)` → `5`
      - `src/app/owner/pipeline/page.tsx` — `JOBS` constant: Purge step 5→4, Evaluate step 4→5 (drop
        the now-unneeded comment about the mismatch); Evaluate box's ETA switches `rates?.step4` →
        `rates?.step5`; box headers/`MyHelpStep` titles renumbered: Build Game Positions "2a"→"2",
        Sync Position Tree "2b"→"3", Purge "3"→"4", Evaluate "4"→"5", Update CP Change "4b"→"6"
        (Game Sync "1" unchanged).
      - `src/ui/analysis/PipelineHelp.tsx` — `num` field renumbered the same way: '2a'→'2', '2b'→'3',
        '3'→'4', '4'→'5', '4b'→'6' ('1' unchanged).
      - Pipeline Jobs summary table's Job cell now shows `{job.step}. {job.label}` (e.g. "1. Game
        Sync"), matching the per-step box numbering below it.
      - Historical `tpip_pipelinelog` rows keep their old step numbers as-is (no `UPDATE` run) — user
        did not confirm wanting the one-time historical swap, so left for a future ask if wanted.
- [x] Standalone manual step clicks (not part of Run All) allocate their own fresh run id instead of
      joining whichever run id currently happens to be highest:
      - `src/lib/actions/pipelineLog.ts` — `resolvePipRunId(step, forceNew = false)`: allocates fresh
        (`MAX + 1`) when `step === 1` *or* `forceNew` is true; otherwise reuses `MAX` (unchanged).
        `startPipelineLog` gains an optional `forceNewRun?: boolean` param, passed through.
      - `src/lib/analysis/buildPositionTree.ts` (`buildPositionTree`, `syncTposFromTgam`),
        `src/lib/analysis/enrichPositionsStockfish.ts` (`enrichPositionsStockfish`,
        `bulkUpdateCpLoss`), `src/lib/analysis/purgePositions.ts`
        (`purgeStaleReachOnePositions`) — each gains an optional `forceNewRun?: boolean` opt, passed
        to their `startPipelineLog` call. `runGameSync`/Game Sync is untouched — already always
        allocates fresh unconditionally (`step === 1`), regardless of caller.
      - `src/app/api/analysis/build-tree/route.ts`, `sync-tpos/route.ts`, `purge/route.ts`,
        `evaluate-positions/route.ts`, `update-cp-change/route.ts` — each reads an optional
        `?newRun=true` query param and passes it through. No param (as the real scheduled cron
        always calls bare) → unchanged reuse-`MAX` behavior.
      - `src/app/owner/pipeline/page.tsx` — `handleBuildTree`, `handleSyncTpos`, `handlePurge`,
        `handleEvaluatePositions`, `handleUpdateCp` each gain a `forceNewRun: boolean = true` param;
        their own button's `onClick` calls with no argument (defaults to forcing fresh); `handleRunAll`
        explicitly calls each with `forceNewRun: false` so they join the run Game Sync just started.
- [x] Fix the Purge/Sync resurrection cycle: `tgam_game_positions` stores the resulting position's
      FEN as literal text (`gam_resulting_fen`), independent of `gam_resulting_pos_id`. When Purge
      nulls a surviving row's `gam_resulting_pos_id` (dual-reference rule — before-position not a
      candidate, so the row stays, only the dangling pointer is cleared), it left `gam_resulting_fen`
      untouched. `syncTposFromTgam`'s backfill query can't distinguish "never linked yet" from
      "deliberately purged and nulled" — both look identical — so it recreates the exact position
      just purged. Being the same old, low-reach position, it's immediately purge-eligible again,
      so it gets deleted next Purge run — a self-perpetuating churn (observed live: 61,786
      resurrected and 61,759 re-purged in a single Run All, with 78,918 more dangling rows queued up
      for next time). Confirmed via read-only diagnostics, not a guess.
      - `src/lib/analysis/purgePositions.ts` — step 3's `UPDATE` now also nulls `gam_resulting_fen`
        alongside `gam_resulting_pos_id`, removing what `syncTposFromTgam`'s backfill query keys off
        (confirmed no other code reads `gam_resulting_fen` once `gam_resulting_pos_id` is resolved).
      - One-time data correction — SQL given in chat, run manually via pgAdmin4, no rush (current
        data isn't wrong, just primed to resurrect once more on the next Sync):
  UPDATE tgam_game_positions
  SET gam_resulting_fen = NULL
  WHERE gam_resulting_pos_id IS NULL AND gam_resulting_fen IS NOT NULL;
      - Verify after both land: click "Sync Position Tree" once (Processed should be small/near-zero,
        not another huge number); click "Run Purge" (eligible count should be small and sane).
- [x] Fix the Sync Position Tree "Processed" metric — it currently reports `touchedPosIds.length`
      (positions actually touched this run), which is what revealed the resurrection bug as a huge
      number but is the wrong metric going forward. Should report the unresolved backlog size
      *before* this run started instead (mirrors Build Position Tree's existing before/after
      snapshot pattern via `pip_start`/`pip_remaining`):
      - `src/lib/analysis/buildPositionTree.ts`'s `syncTposFromTgam` — add a
        `SELECT COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL OR gam_resulting_pos_id
        IS NULL` count at the very start of the function (before Step 1's INSERT/backfill runs);
        pass that count to `completePipelineLog` as the `processed` value instead of
        `touchedPosIds.length`. The function's own return value (`positionsSynced`) and the Sync
        Position Tree box's "Done — X positions synced" message stay unchanged — those still
        reflect actual work done, a legitimately different number from the pipeline-log metric.
- [x] Drop the resulting-side of the reach count — with every ply now recorded, a position's
      "resulting" occurrence in one record is the same physical reach as the next record's "before"
      occurrence in that game, so counting both sides double-counts. Terminal/truncated positions
      (checkmate/resignation, or the `MAX_ANALYSIS_MOVE` cutoff) will now always read as low-reach
      since they're never anyone's "before" — accepted as inconsequential per user decision.
      - `src/lib/analysis/buildPositionTree.ts`'s `recomputePosReachedByIds` — both the `pos_reached`
        and `pos_move_num` subqueries drop `OR gam_resulting_pos_id = p.pos_id`, counting/deriving
        from `gam_pos_id = p.pos_id` only.
      - One-time full recompute — SQL given in chat, run manually via pgAdmin4 (existing rows keep
        their old both-sides value until touched again otherwise). Expect a large batch of positions
        to become newly purge-eligible in one shot afterward — correct under the new formula, not a
        bug, similar in shape to the earlier resurrection-bug purge spike:
  UPDATE tpos_positions p
  SET pos_reached = (
    SELECT COUNT(DISTINCT gam_gdid)
    FROM tgam_game_positions
    WHERE gam_pos_id = p.pos_id AND gam_move_num > 0
  ),
  pos_move_num = (
    SELECT MIN(gam_move_num)
    FROM tgam_game_positions
    WHERE gam_pos_id = p.pos_id
  );
- [x] Pipeline page status lines — drop the total/cumulative stat from each box, keeping only the
      actionable pending/remaining/unresolved value (plus status badge and SQL link, unchanged):
      - Step 1 (Game Sync) — drop `tgd_gamesdecon: X`, keep `pending: Y`.
      - Step 2 (Build Game Positions) — drop `processed: X`, keep `remaining: Y`.
      - Step 2b (Sync Position Tree) — drop `positions: X`, keep `unresolved: Y`.
      - Step 4 (Evaluate Positions) — drop `evaluated: X`, keep `remaining: Y`.
      - Purge Stale Positions and Update CP Change already show only one number each — no change.
- [x] Fix `syncTposFromTgam`'s `backlogBefore` metric — it counts `gam_pos_id IS NULL OR
      gam_resulting_pos_id IS NULL`, but `gam_resulting_pos_id IS NULL` now also matches rows Purge
      deliberately killed (their `gam_resulting_fen` is nulled too, so they'll never actually
      resolve) — inflating the Pipeline Jobs "Processed" number with permanently-dead rows instead
      of genuine pending work. `refreshTposStatus()`'s own "unresolved" stat (shown in the Sync
      Position Tree box) already only counts `gam_pos_id IS NULL` — match that definition exactly.
      - `src/lib/analysis/buildPositionTree.ts`'s `syncTposFromTgam` — `backlogBefore` query becomes
        `SELECT COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL` (drop the `OR
        gam_resulting_pos_id IS NULL` half).
- [x] Replace `pip_processed` (and the vestigial `pip_start`/`pip_finish`/`pip_attempted`/
      `pip_remaining`/`pip_skipped`, all either superseded or never actually populated) with a
      proper input/output-records model, one row per table actually written to. Schema already
      migrated (table cleared, user ran the DROP/CREATE manually):
      `pip_sub_step varchar(1)` (nullable), `pip_input_table varchar(64)`, `pip_input_recs integer`,
      `pip_output_table varchar(64)`, `pip_output_recs integer`; `pip_errors` kept (real signal for
      Game Sync/Build Position Tree/Evaluate Positions, honestly-always-zero for the other 3).
      Full step/sub-step breakdown, all sharing one `pip_run_id`/`pip_step` group per macro operation:

      | Step | Sub | Writes | input_recs | output_recs |
      |---|---|---|---|---|
      | 1 | a | chess.com API → `tgr_gamesraw` | games read from archives | games inserted |
      | 1 | b | `tgr_gamesraw` → `tgd_gamesdecon` | games inserted | games deconstructed |
      | 1 | c | `tgd_gamesdecon` → `tplr_player_ratings` | games deconstructed | players rated |
      | 2 | — | `tgd_gamesdecon` → `tgam_game_positions` | games fetched | position-records written |
      | 3 | a | `tgam_game_positions` → `tpos_positions` | unresolved backlog | positions touched |
      | 3 | b | `tgam_game_positions` → `tgam_game_positions` | unresolved backlog | rows backfilled |
      | 4 | a | `tpos_positions` → `teva_evaluations` | candidates found | evaluations deleted |
      | 4 | b | `tpos_positions` → `tgam_game_positions` | candidates found | rows deleted + nulled |
      | 4 | c | `tpos_positions` → `tpos_positions` | candidates found | positions deleted |
      | 4 | d | `tpos_positions` → `tgd_gamesdecon` | candidates found | games flagged purged |
      | 5 | — | `tpos_positions` → `teva_evaluations` | positions considered | evaluations saved |
      | 6 | — | `tgam_game_positions` → `tgam_game_positions` | rows matching criteria | rows updated |

      Only step 1a ever allocates a fresh run id (`resolvePipRunId`'s special case becomes
      `step === 1 && subStep === 'a'`); every other sub-step, including 1b/1c and 3b/4b-4d, always
      joins — for any step producing multiple records, only its *first* `logPipelineStep` call
      passes the caller's real `forceNewRun`, every subsequent call in that same execution hardcodes
      `forceNewRun: false` so they land on the same run id the first one just established.

      - `src/lib/actions/pipelineLog.ts` — collapse `startPipelineLog`/`completePipelineLog` (the
        two-phase design existed only to support the now-removed before/after snapshot columns)
        into a single `logPipelineStep(params)` call, issuing one `INSERT` with every column already
        known. `getLatestPipelineRuns()` returns *every* row belonging to the single highest
        `pip_run_id`, not one per step — full expanded view, per user decision. `getPipelineRates()`
        sums `pip_output_recs` instead of the removed `pip_processed`.
      - `src/lib/actions/sync.ts`'s `runGameSync` — accumulate `totalRead` (sum of each
        `syncArchive` call's `result.total`, not currently tracked) alongside the existing
        `totalInserted`/`totalDeconstructed`; log 3 records (1a/1b/1c) instead of the current single
        players-counted one.
      - `src/lib/analysis/buildPositionTree.ts`'s `buildPositionTree` — log 1 record (step 2, no
        sub-step): input = `games.length`, output = `totalPositions`.
      - `src/lib/analysis/buildPositionTree.ts`'s `syncTposFromTgam` — log 2 records (3a/3b): 3a's
        output is `touchedPosIds.length` (restoring what the earlier `backlogBefore`-only fix
        removed — both numbers now get their own column instead of picking one); 3b's output is
        `beforeRes.rowCount + resultingRes.rowCount` (tgam rows actually backfilled).
      - `src/lib/analysis/purgePositions.ts` — capture `.rowCount` from all 5 existing DB
        statements (currently discarded) and log 4 records (4a-4d) instead of 1.
      - `src/lib/analysis/enrichPositionsStockfish.ts`'s `enrichPositionsStockfish` — log 1 record
        (step 5): input = `allFensToEval.length`, output = `processed`.
      - `src/lib/analysis/enrichPositionsStockfish.ts`'s `bulkUpdateCpLoss` — log 1 record (step 6):
        input = output = `rowCount` (single atomic `UPDATE`, no partial-failure concept).
      - `src/ui/analysis/PipelineLogTable.tsx` — row type and columns updated to the new shape:
        Step (step+sub_step combined, e.g. "1a"), Input (table: recs), Output (table: recs), Errors,
        Duration — dropping Attempted/Processed/Start/Remaining/Finish/Skipped entirely.
      - `src/app/owner/pipeline/page.tsx` — `JOBS` constant expands from 6 entries to 12 (one per
        step/sub-step row above); Pipeline Jobs summary table shows every row for the latest run id
        (full expanded view), with Input/Output columns replacing the old single Processed column.
      - `SQL_STATUS_1`/`SQL_STATUS_3`/`SQL_STATUS_3B`/`SQL_STATUS_4` — trim to match what's actually
        displayed (drop the total/cumulative `UNION ALL` branch each still carries after the earlier
        status-line simplification); `SQL_STATUS_PURGE` — strip its leading `--` comment (pure SQL).
- [x] Remove `pip_errors` entirely (user decision, after the earlier real-vs-always-zero discussion)
      and split each Input/Output cell's `table: recs` string into two separate columns, matching
      the actual underlying data shape (`pip_input_table`/`pip_input_recs`/`pip_output_table`/
      `pip_output_recs` are already 4 independent columns; only the display concatenated them):
      - `scripts/schema.sql` / manual SQL: `ALTER TABLE tpip_pipelinelog DROP COLUMN pip_errors;`.
      - `src/lib/actions/pipelineLog.ts` — `logPipelineStep` drops the `errors` param and column;
        `getLatestPipelineRuns()` drops `pip_errors` from its `SELECT`/return type.
      - All 6 step functions — dropped `errors`/`pip_errors` from their `logPipelineStep` calls
        (the local `errors` variables themselves are kept where still used for the function's own
        return value or log messages, unrelated to the removed column).
      - `src/ui/analysis/PipelineLogTable.tsx` — Errors column removed; Input/Output split into
        "Input Table"/"Input Recs"/"Output Table"/"Output Recs" (4 columns instead of 2).
      - `src/app/owner/pipeline/page.tsx` — same 4-column split in the Pipeline Jobs summary;
        `StatusBadge`'s `complete` prop can no longer read `pip_errors === 0` (column gone) — now
        just `run ? true : null` (a logged row means the step ran to completion; an unhandled
        exception before `logPipelineStep` would mean no row at all).
- [x] Restructure the Pipeline Jobs summary into grouped headings, per user request: each of the 6
      macro steps is a bold heading row, with its sub-steps (if more than one) listed beneath in
      normal weight; `Step` and `Sub` (sub-step) split into their own columns instead of the
      combined "1a" cell.
      - `src/app/owner/pipeline/page.tsx` — replaced the flat 12-entry `JOBS` array with a hardcoded
        `JOB_GROUPS` structure (6 groups, each with a `groupLabel`, `schedule`, and a `subJobs` list)
        — easier to manage as one nested object than a flat list, per user preference.
      - Groups with exactly one sub-job (Build Position Tree, Evaluate Positions, Update CP Change)
        render as a single bold row (heading and data combined — a separate blank heading above a
        lone data row would just be redundant). Groups with 2+ sub-jobs (Game Sync, Sync Position
        Tree, Purge Stale Positions) render a bold heading row (Step/Job/Schedule only) followed by
        one normal-weight row per sub-job.
- [x] `pip_sub_step` must never be null/empty — every process gets a sub-step value, using `'a'` for
      macro steps that only ever write one record (steps 2, 5, 6):
      - `scripts/schema.sql` / manual SQL (2 existing rows backfilled first, confirmed via read-only
        diagnostic — steps 2 and 6): `UPDATE tpip_pipelinelog SET pip_sub_step = 'a' WHERE
        pip_sub_step IS NULL OR pip_sub_step = '';` then `ALTER TABLE tpip_pipelinelog ALTER COLUMN
        pip_sub_step SET NOT NULL;`.
      - `src/lib/actions/pipelineLog.ts` — `subStep` param made required (not `string | null`) in
        `resolvePipRunId`, `logPipelineStep`, and `getLatestPipelineRuns()`'s return type.
      - `src/lib/analysis/buildPositionTree.ts` (`buildPositionTree`),
        `src/lib/analysis/enrichPositionsStockfish.ts` (`enrichPositionsStockfish`,
        `bulkUpdateCpLoss`) — each single-record `logPipelineStep` call now passes `subStep: 'a'`.
      - `src/app/owner/pipeline/page.tsx` — `JOB_GROUPS`'s three single-subJob groups (Build Position
        Tree, Evaluate Positions, Update CP Change) changed from `subStep: null` to `subStep: 'a'`;
        `subJobs` type narrowed from `string | null` to `string`.
      - `src/app/owner/pipeline/page.tsx`'s `LatestRun` type and `src/ui/analysis/
        PipelineLogTable.tsx`'s `PipelineLogRow` type — `pip_sub_step` narrowed from `string | null`
        to `string`; `stepLabel()`'s now-dead `?? ''` fallback removed.
- [x] Every process must log a pipeline step even when there's nothing to process — Evaluate
      Positions (step 5) had a zero-FENs early-return path that skipped logging entirely:
      - `src/lib/analysis/enrichPositionsStockfish.ts`'s `enrichPositionsStockfish` — moved `t0` to
        immediately after `logStart` (before any DB queries) and added a `logPipelineStep` call
        (`subStep: 'a'`, `inputRecs: 0`, `outputRecs: 0`) to the `allFensToEval.length === 0`
        early-return branch, so it logs before returning instead of silently skipping. Removed the
        now-duplicate `t0` declaration further down the function.
- [x] Step 1 (Game Sync) expands from 3 sub-steps to 4 to make `tpl_players` a genuine first hop in
      the value chain, rather than leaving `chess.com API` as an input with no matching prior
      output. Every hop now flows output-becomes-next-input exactly, except the chess.com API call
      itself (2 players in, however many games the accounts have played out) — an unavoidable
      fan-out inherent to calling an external API with a short list and getting back a long one, not
      a modeling gap:
      | Sub | Input Table | Input Recs | Output Table | Output Recs |
      |---|---|---|---|---|
      | a | `tpl_players` | players synced this run | `chess.com API` | games read from archives |
      | b | `chess.com API` | games read from archives | `tgr_gamesraw` | games inserted |
      | c | `tgr_gamesraw` | games inserted | `tgd_gamesdecon` | games deconstructed |
      | d | `tgd_gamesdecon` | games deconstructed | `tplr_player_ratings` | players rated |
      - `src/lib/actions/sync.ts`'s `runGameSync` — relabeled sub-steps b/c/d from the old a/b/c, and
        added a new leading `logPipelineStep` call for sub-step a (`tpl_players` → `chess.com API`,
        input = `players.length`, output = `totalRead`). Only sub-step a can allocate a fresh run
        id (unchanged condition — it's still the first sub-step of step 1).
      - `src/app/owner/pipeline/page.tsx` — `JOB_GROUPS`'s step 1 `subJobs` expands from 3 entries
        to 4, adding `{ subStep: 'a', label: 'Query chess.com API' }` ahead of the renamed/relettered
        existing three.
- [x] Run All keeps the Pipeline Jobs summary table live as it progresses, instead of jumping
      straight to the final state once every step has finished:
      - `src/app/owner/pipeline/page.tsx`'s `handleRunAll` — clears `runs` (`setRuns([])`) at the
        very start so the table doesn't show the previous run's stale rows while the new run hasn't
        logged anything yet, then calls the existing `doRefreshRuns()` after each step (not just once
        at the end) — same `getLatestPipelineRuns()` re-fetch each individual handler already uses
        for its own status box, just also invoked between Run All's steps.

## Changes

### scripts/schema.sql
- Added `pip_created timestamp DEFAULT now() NOT NULL` and `pip_run_id integer DEFAULT 0 NOT NULL`
  to `tpip_pipelinelog`, with `pip_run_id` positioned right after `pip_pipid` (matches the
  save/recreate/copy-back SQL given in chat, since Postgres can't reorder columns via `ALTER TABLE
  ADD COLUMN`).

### src/lib/actions/pipelineLog.ts
- Added `resolvePipRunId(step)`: step 1 (Game Sync) allocates a new run id (`MAX + 1`); every other
  step joins the current run (`MAX`).
- `startPipelineLog` now resolves and stores `pip_run_id` on every inserted row.
- Added `getLatestPipelineRuns()` — most recent `tpip_pipelinelog` row per step, for the Pipeline
  page's new jobs summary table.

### src/ui/analysis/PipelineLogTable.tsx
- Added `pip_created` and `pip_run_id` to the row type; rendered as new "Created" and "Run" columns
  in both the table and the detail panel.

### src/app/owner/pipeline/page.tsx
- Added a `JOBS` constant (schedule order per `vercel.json`, since it differs from the internal
  `pip_step` numbering — Purge is step 5 but scheduled before Evaluate, step 4).
- Added a "Pipeline Jobs" summary table (one row per scheduled job: schedule time, last run,
  processed/errors/duration, status) above the existing per-step boxes.
- Added a "Run All" button (`handleRunAll`) that calls the 6 existing step handlers in schedule
  order, continuing past a failed step, then refreshes the summary table.
- Updated three `MyHelpStep`/help-text strings (Purge, Evaluate Positions, Update CP Change) that
  referenced the now-deleted `/api/analysis/cron` bundle route — each now names its own real
  scheduled route.

### src/app/owner/cron/page.tsx, src/lib/actions/cron.ts, src/lib/actions/cronAnalysis.ts
- Deleted — fully superseded by the Pipeline page, which already calls the correct, complete
  implementation for each of the 6 steps (the old page's "Analysis Pipeline" button only ran
  `buildPositionTree`, skipping 4 of the 5 analysis steps).

### src/app/api/analysis/cron/route.ts
- Deleted — the old bundled 5-step route, no longer referenced by `vercel.json` since those steps
  were split into independent scheduled crons.

### src/app/owner/page.tsx
- Removed the `/owner/cron` nav entry; updated the Pipeline entry's description to mention Run All
  and per-job status.

### src/lib/analysis/buildPositionTree.ts
- Removed the dead `level === 1 ? 'analysisCronRoute' : 'runCronAnalysis'` branch (the
  `runCronAnalysis` side is unreachable now that `cronAnalysis.ts` is deleted); caller label is now
  the accurate `'buildTreeRoute'`.

### src/lib/analysis/purgePositions.ts
- Replaced the stale `'analysisCronRoute'` caller label (4 occurrences) with `'purgeRoute'`.

### src/lib/analysis/enrichPositionsStockfish.ts
- Replaced the stale `'analysisCronRoute'` caller label (4 occurrences) with
  `'evaluatePositionsRoute'`.

### src/lib/actions/sync.ts
- Replaced the stale `'runCronSync'` caller label in `syncArchive`'s error handler with
  `'runGameSync'`, its only real caller now that `cron.ts` is deleted.

### src/ui/analysis/PipelineHelp.tsx
- Updated the same three help-text strings (Purge, Evaluate Positions, Update CP Change) that
  referenced the deleted `/api/analysis/cron` bundle route.

### scripts/schema.sql
- Removed `pip_date_from`/`pip_date_to` from `tpip_pipelinelog` (dropped manually via pgAdmin4 —
  a leftover restriction from early development when the full ~37,000-game history couldn't be
  processed in one go; no longer needed now that the historical backlog has been processed, and no
  caller — Pipeline page buttons or any of the 6 scheduled crons — ever passed a date range anyway).

### src/lib/actions/pipelineLog.ts
- Removed `dateFrom`/`dateTo` params from `startPipelineLog` and its `INSERT`.

### src/lib/analysis/buildPositionTree.ts
- Removed `dateFrom`/`dateTo` from `buildPositionTree`'s opts and its game-fetch `WHERE` clause.
- Simplified the processed/remaining snapshot query — its date bounds were always full-range
  (`0` to `now()`) once `dateFrom`/`dateTo` could no longer be supplied, so the bounds were dead
  weight; removed them along with the now-unused `fromTs`/`toTs`.
- Removed `dateFrom`/`dateTo` from the `startPipelineLog` call.

### src/lib/analysis/enrichPositionsStockfish.ts
- Removed `dateFrom`/`dateTo` and their `WHERE`-clause branches from `enrichPositionsStockfish`,
  `countRemainingPositions`, `countEvaluatedPositions`, and `getResultingFensToEvaluate` — each now
  always runs the previously-conditional "no date filter" query path.
- Removed `dateFrom`/`dateTo` from the `startPipelineLog` call.

### src/app/api/analysis/build-tree/route.ts, src/app/api/analysis/evaluate-positions/route.ts
- Removed reading `dateFrom`/`dateTo` search params and passing them through.

### src/ui/analysis/PipelineLogTable.tsx
- Removed `pip_date_from`/`pip_date_to` from the row type and the detail-panel display.
- Added a "Run" filter input (equality on `pip_run_id`), same pattern as Step/Step Name.
- Removed the unconditional `pip_run_id <> 0` exclusion added here in error — this page shows full
  history including pre-migration rows; the Run filter can still search for `0` explicitly. The
  exclusion belongs on the Pipeline page's summary table instead (see `pipelineLog.ts` below).

### src/lib/actions/pipelineLog.ts
- `getLatestPipelineRuns()` now excludes `pip_run_id = 0` rows, so a step whose most recent row
  predates the run-id migration shows as no run yet (`—` on the Pipeline page) rather than a
  misleading `Run: 0`.
- `getLatestPipelineRuns()` now scopes to the single highest `pip_run_id` (`WHERE pip_run_id =
  (SELECT MAX(pip_run_id) ...)`) instead of each step's own latest row independently — a step that
  didn't execute in the latest run is now simply absent from the result instead of showing stale
  data from an older run.

### src/app/owner/pipeline/page.tsx
- Pipeline Jobs box title now shows the run id ("Pipeline Jobs — Run #N", from `runs[0].pip_run_id`
  since all returned rows share one run) instead of a per-row Run column.
- Duration now displayed as rounded seconds (`Math.round(pip_duration_ms / 1000)`) instead of raw
  ms; Processed/Errors/Duration all comma-formatted via `.toLocaleString()`.
- "Duration" header renamed to "Duration(s)" (unit moved out of the cell values); Processed/Errors/
  Duration columns right-aligned instead of centered.
- `JOBS` constant: Purge now step 4, Evaluate now step 5 (matches their corrected `pip_step` values
  and actual schedule order); dropped the comment explaining the old mismatch.
- Evaluate box's ETA now reads `rates?.step5` instead of `rates?.step4`.
- Box headers/`MyHelpStep` titles renumbered 1-6 to match: "2a"→"2", "2b"→"3", "3"→"4", "4"→"5",
  "4b"→"6" (Game Sync "1" unchanged).
- Pipeline Jobs summary table's Job cell now shows `{job.step}. {job.label}`.

### src/lib/analysis/purgePositions.ts
- `startPipelineLog` call now uses step 4 (was 5), matching its actual position in the schedule
  (6am, before Evaluate at 7am).

### src/lib/analysis/enrichPositionsStockfish.ts
- `startPipelineLog` call now uses step 5 (was 4), matching its actual position in the schedule.

### src/ui/analysis/PipelineHelp.tsx
- `num` field renumbered to match: '2a'→'2', '2b'→'3', '3'→'4', '4'→'5', '4b'→'6' ('1' unchanged).

### src/lib/actions/pipelineLog.ts
- `resolvePipRunId(step, forceNew = false)` — allocates a fresh run id when `step === 1` *or*
  `forceNew` is true; otherwise reuses `MAX` as before. `startPipelineLog` gains an optional
  `forceNewRun?: boolean` param, passed through.

### src/lib/analysis/buildPositionTree.ts
- `buildPositionTree` and `syncTposFromTgam` each gain an optional `forceNewRun?: boolean` opt,
  passed to their `startPipelineLog` call.

### src/lib/analysis/enrichPositionsStockfish.ts
- `enrichPositionsStockfish` and `bulkUpdateCpLoss` each gain an optional `forceNewRun?: boolean`
  opt, passed to their `startPipelineLog` call.

### src/lib/analysis/purgePositions.ts
- `purgeStaleReachOnePositions` gains an optional `forceNewRun?: boolean` param, passed to its
  `startPipelineLog` call.

### src/app/api/analysis/build-tree/route.ts, sync-tpos/route.ts, purge/route.ts, evaluate-positions/route.ts, update-cp-change/route.ts
- Each reads an optional `?newRun=true` query param and passes it through as `forceNewRun`. No param
  (as the real scheduled cron always calls bare) leaves the existing reuse-`MAX` behavior unchanged.

### src/app/owner/pipeline/page.tsx
- `handleBuildTree`, `handleSyncTpos`, `handlePurge`, `handleEvaluatePositions`, `handleUpdateCp`
  each gain a `forceNewRun: boolean = true` param, appending `?newRun=true` to their fetch when set.
  Their own buttons now call them via `() => handleX()` (no argument, defaults to forcing fresh).
- `handleRunAll` explicitly calls each of the 5 with `forceNewRun: false` so they join the run id
  Game Sync (step 1) just allocated, instead of each starting a new one of their own.

### src/lib/analysis/purgePositions.ts
- Step 3's `UPDATE` now also nulls `gam_resulting_fen` alongside `gam_resulting_pos_id`, fixing a
  live-observed resurrection cycle: `syncTposFromTgam`'s backfill query couldn't tell "never linked
  yet" apart from "deliberately purged," so it was recreating exactly the positions Purge had just
  deleted (61,786 resurrected and 61,759 re-purged in one Run All, with 78,918 more dangling rows
  queued up). One-time data correction SQL given in chat, to be run manually via pgAdmin4, to clear
  the FEN on rows already dangling from before this fix.

### src/lib/analysis/buildPositionTree.ts
- `syncTposFromTgam` now counts the unresolved backlog (`gam_pos_id IS NULL OR gam_resulting_pos_id
  IS NULL`) before the backfill runs, and logs that as `pip_processed` instead of
  `touchedPosIds.length` — the Pipeline Jobs summary now reports "how much was pending before this
  run" rather than "how much this run touched," which spiked misleadingly whenever a large
  dangling-reference backlog got resolved in one pass. The function's own return value
  (`positionsSynced`) and the Sync Position Tree box's "Done — X positions synced" message are
  unchanged — those still reflect actual work done.
- `recomputePosReachedByIds` now computes `pos_reached`/`pos_move_num` from the "before" side
  (`gam_pos_id`) only, dropping `OR gam_resulting_pos_id = p.pos_id` from both subqueries — every
  ply is recorded now, so a resulting occurrence in one record is the same reach as the next
  record's before occurrence in that game, and counting both double-counts. Terminal/truncated
  positions (a game's final ply, or the `MAX_ANALYSIS_MOVE` cutoff) now always read as low-reach —
  accepted as inconsequential per user decision. One-time full-table recompute SQL given in chat,
  to be run manually via pgAdmin4 — existing rows keep their old both-sides value until touched
  again otherwise, and running it is expected to make a large batch of positions newly
  purge-eligible in one shot (correct under the new formula).

### src/app/owner/pipeline/page.tsx
- Dropped the total/cumulative stat from each status line, keeping only the actionable value:
  Step 1 drops `tgd_gamesdecon: X` (keeps `pending`), Step 2 drops `processed: X` (keeps
  `remaining`), Step 2b drops `positions: X` (keeps `unresolved`), Step 4 drops `evaluated: X`
  (keeps `remaining`). Purge Stale Positions and Update CP Change already showed only one number
  each — unchanged.

### src/lib/analysis/buildPositionTree.ts
- `syncTposFromTgam`'s `backlogBefore` query drops `OR gam_resulting_pos_id IS NULL`, now matching
  `refreshTposStatus()`'s "unresolved" stat exactly (`gam_pos_id IS NULL` only). The resulting-side
  half was inflating the Pipeline Jobs "Processed" number with rows Purge had deliberately killed
  (their `gam_resulting_fen` is nulled too, so they're permanently dead, not pending work).

### scripts/schema.sql
- `tpip_pipelinelog` fully redesigned (table cleared and recreated manually by user): removed
  `pip_start`/`pip_finish`/`pip_attempted`/`pip_processed`/`pip_remaining`/`pip_skipped` (superseded
  or never actually populated); added `pip_sub_step varchar(1)` (nullable), `pip_input_table
  varchar(64)`, `pip_input_recs integer`, `pip_output_table varchar(64)`, `pip_output_recs integer`.
  `pip_errors` kept (real signal for 3 of the steps).

### src/lib/actions/pipelineLog.ts
- Collapsed `startPipelineLog`/`completePipelineLog` (two-phase design existed only to support the
  now-removed before/after snapshot columns) into a single `logPipelineStep(params)` call — one
  `INSERT` per table actually written to, every column already known by then.
- `resolvePipRunId(step, subStep, forceNew)` — allocator condition is now `step === 1 && subStep ===
  'a'` (the very first sub-step of the very first schedule slot), not a bare `step === 1`.
- `getLatestPipelineRuns()` returns every row belonging to the single highest `pip_run_id` (full
  expanded view, per user decision — not one collapsed row per macro step).
- `getPipelineRates()` sums `pip_output_recs` instead of the removed `pip_processed`.

### src/lib/actions/sync.ts
- `runGameSync` accumulates `totalRead` (sum of each `syncArchive` call's `result.total`, not
  previously tracked) and logs 3 records instead of 1: 1a (chess.com API → `tgr_gamesraw`), 1b
  (`tgr_gamesraw` → `tgd_gamesdecon`), 1c (`tgd_gamesdecon` → `tplr_player_ratings`, output =
  `players.length - errors`). Only 1a's `logPipelineStep` call can allocate a fresh run id; 1b/1c
  hardcode `forceNewRun: false` so they join it.

### src/lib/analysis/buildPositionTree.ts
- `buildPositionTree` logs 1 record (step 2, no sub-step): input = `games.length`, output =
  `totalPositions`.
- `syncTposFromTgam` logs 2 records: 3a (`tgam_game_positions` → `tpos_positions`, output =
  `touchedPosIds.length` — restoring what the earlier `backlogBefore`-only fix removed, both numbers
  now get their own column) and 3b (`tgam_game_positions` → `tgam_game_positions`, output =
  `beforeRes.rowCount + resultingRes.rowCount`). Only 3a can allocate; 3b hardcodes
  `forceNewRun: false`.
- The vestigial `snapProcessed`/`snapRemaining` values in `buildPositionTree` are kept since they
  still feed the function's own return value (`treeBuilt`/`remaining`, used by the UI's "Done"
  message), not just the old logging.

### src/lib/analysis/purgePositions.ts
- Captured `.rowCount` from all 5 existing DB statements (previously discarded) and now logs 4
  records instead of 1: 4a (`tpos_positions` → `teva_evaluations`), 4b (`tpos_positions` →
  `tgam_game_positions`, output = delete + null-out counts combined), 4c (`tpos_positions` →
  `tpos_positions`), 4d (`tpos_positions` → `tgd_gamesdecon`, the resurrection-guard flag update).
  All 4 share `input_recs = purgedCount`. Only 4a can allocate; 4b-4d hardcode
  `forceNewRun: false`. The zero-candidates early-return path now also logs all 4 records (with
  zeros) instead of skipping logging entirely.

### src/lib/analysis/enrichPositionsStockfish.ts
- `enrichPositionsStockfish` logs 1 record (step 5): input = `allFensToEval.length`, output =
  `processed`. Removed the now-fully-unused `countEvaluatedPositions` function and the
  `evaluatedBefore`/`remainingBefore` computation that only ever fed the old logging.
- `bulkUpdateCpLoss` logs 1 record (step 6): input = output = `rowCount` (single atomic `UPDATE`,
  no partial-failure concept).

### src/ui/analysis/PipelineLogTable.tsx
- Row type and columns updated to the new shape: Step (step + sub_step combined, e.g. "1a"), Step
  Name, Created, Input (`table: recs`), Output (`table: recs`), Errors, Duration — dropping
  Attempted/Processed/Start/Remaining/Finish/Skipped entirely. Detail panel updated to match.

### src/app/owner/pipeline/page.tsx
- `JOBS` constant expands from 6 entries to 12 (one per step/sub-step), each with its own
  `subStep` field; matching logic in the summary table becomes `pip_step === job.step &&
  pip_sub_step === job.subStep`.
- Pipeline Jobs summary table: "Processed" column replaced with "Input"/"Output" columns (`table:
  recs` format); Job cell now shows `{step}{subStep ?? ''}. {label}` (e.g. "1a. Fetch & Insert Raw
  Games").
- `SQL_STATUS_1`/`SQL_STATUS_3`/`SQL_STATUS_3B`/`SQL_STATUS_4` trimmed to match what's actually
  displayed (each had still carried a total/cumulative `UNION ALL` branch left over from the
  earlier status-line simplification). `SQL_STATUS_PURGE` — stripped its leading `--` comment.

### scripts/schema.sql
- Removed `pip_errors` from `tpip_pipelinelog` (dropped manually via pgAdmin4).

### src/lib/actions/pipelineLog.ts
- `logPipelineStep` no longer accepts/writes `errors`/`pip_errors`. `getLatestPipelineRuns()` no
  longer selects it.

### src/lib/actions/sync.ts, src/lib/analysis/buildPositionTree.ts, src/lib/analysis/enrichPositionsStockfish.ts
- Dropped `errors`/`pip_errors` from each `logPipelineStep` call (the local `errors` variables
  themselves are kept where still used elsewhere in the function — return values, log messages).

### src/ui/analysis/PipelineLogTable.tsx (errors removal + column split)
- Errors column removed. Input/Output split into 4 separate columns ("Input Table", "Input Recs",
  "Output Table", "Output Recs") instead of one concatenated `table: recs` string each.

### src/app/owner/pipeline/page.tsx (errors removal + column split)
- Same 4-column split in the Pipeline Jobs summary table. `StatusBadge`'s `complete` prop changed
  from `run.pip_errors === 0` to `run ? true : null`, since the errors column no longer exists.

### src/app/owner/pipeline/page.tsx (grouped headings restructure)
- Replaced the flat 12-entry `JOBS` array with a hardcoded `JOB_GROUPS` structure: 6 groups, each
  with `step`, `groupLabel`, `schedule`, and a `subJobs` list (`subStep`/`label` pairs) — one nested
  object instead of a flat list, per user preference.
- Pipeline Jobs summary table rewritten to render grouped, per `JOB_GROUPS`: a group with exactly
  one sub-job (Build Position Tree, Evaluate Positions, Update CP Change) renders as a single bold
  row (heading and data combined); a group with 2+ sub-jobs (Game Sync, Sync Position Tree, Purge
  Stale Positions) renders a bold heading row (Step/Job/Schedule only, rest blank via `colSpan`)
  followed by one normal-weight row per sub-job, indented (`pl-4`).
- `Step` and `Sub` split into their own table columns instead of the combined "1a" cell.
- Imported `Fragment` from `react` to return a heading row + its sub-job rows as one keyed group
  from a single `.map()` callback (a bare `<>` shorthand fragment can't carry the `key` prop a
  multi-element map result needs).

### scripts/schema.sql
- `pip_sub_step` changed from nullable to `NOT NULL` — every process now always logs a real
  sub-step value, `'a'` for macro steps with only one record. Manual SQL given in chat: backfill
  the 2 existing null/empty rows (steps 2 and 6) to `'a'`, then add the `NOT NULL` constraint.

### src/lib/actions/pipelineLog.ts
- `subStep` is now a required `string` (not `string | null`) in `resolvePipRunId`, `logPipelineStep`,
  and `getLatestPipelineRuns()`'s return type.

### src/lib/analysis/buildPositionTree.ts, src/lib/analysis/enrichPositionsStockfish.ts
- `buildPositionTree`, `enrichPositionsStockfish`, and `bulkUpdateCpLoss` — their single-record
  `logPipelineStep` calls now pass `subStep: 'a'` instead of omitting it.

### src/lib/analysis/enrichPositionsStockfish.ts (zero-FENs logging fix)
- `enrichPositionsStockfish`'s zero-FENs early-return path now logs a step (`inputRecs: 0`,
  `outputRecs: 0`) instead of returning without logging at all — every invocation now produces a
  pipeline row, even a no-op one. `t0` moved to the top of the function (right after `logStart`) so
  the early-return path can report a real duration; the later duplicate `t0` declaration was removed.

### src/app/owner/pipeline/page.tsx, src/ui/analysis/PipelineLogTable.tsx
- `JOB_GROUPS`'s three single-subJob groups (Build Position Tree, Evaluate Positions, Update CP
  Change) changed from `subStep: null` to `subStep: 'a'`; `subJobs` type, `LatestRun.pip_sub_step`,
  and `PipelineLogRow.pip_sub_step` all narrowed from `string | null` to `string`.
  `PipelineLogTable.tsx`'s `stepLabel()` dropped its now-dead `?? ''` fallback.

### src/lib/actions/sync.ts
- `runGameSync` now logs 4 sub-steps instead of 3, making `tpl_players` the genuine first hop:
  new sub-step a (`tpl_players` → `chess.com API`, input = `players.length`, output = `totalRead`);
  the former a/b/c relabeled to b/c/d unchanged otherwise (`chess.com API` → `tgr_gamesraw` →
  `tgd_gamesdecon` → `tplr_player_ratings`). Restores an exact output-becomes-next-input chain
  through the whole step, with the one unavoidable exception being sub-step a's own input (players)
  vs. output (games) — the chess.com API call is inherently a fan-out, not a chainable 1:1 count.

### src/app/owner/pipeline/page.tsx
- `JOB_GROUPS`'s step 1 `subJobs` expands from 3 to 4: added `{ subStep: 'a', label: 'Query
  chess.com API' }` ahead of the renamed/relettered existing three (`Fetch & Insert Raw Games`
  b, `Deconstruct Games` c, `Update Player Ratings` d).

### src/app/owner/pipeline/page.tsx (Run All live refresh)
- `handleRunAll` now clears `runs` at the start (`setRuns([])`) and calls `doRefreshRuns()` after
  every individual step instead of once at the end — the Pipeline Jobs summary table (and its
  "Run #N" title) now fills in live as Run All progresses instead of jumping straight to the final
  state once all 6 steps finish.
