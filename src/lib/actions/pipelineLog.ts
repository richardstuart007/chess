'use server'

import { table_query } from 'nextjs-shared/table_query'

//----------------------------------------------------------------------------------
//  resolvePipRunId — step 1a (the very first sub-step of Fetch & Insert Raw Games)
//  always allocates a new run id (max + 1), same as any standalone manual step click
//  (forceNew) since neither forms part of a coordinated run. Every other invocation
//  joins the current run by reusing the highest run id already allocated — this is
//  what ties the daily scheduled cron's independent, uncoordinated invocations
//  together, and also what lets Run All's later steps join the run id 1a just
//  allocated moments earlier.
//----------------------------------------------------------------------------------
async function resolvePipRunId(step: number, subStep: string, forceNew: boolean = false): Promise<number> {
  const isAllocator = step === 1 && subStep === 'a'
  const rows = await table_query({
    caller:       'resolvePipRunId',
    table:        'tpip_pipelinelog',
    query:        (isAllocator || forceNew)
      ? `SELECT COALESCE(MAX(pip_run_id), 0) + 1 AS run_id FROM tpip_pipelinelog`
      : `SELECT COALESCE(MAX(pip_run_id), 1) AS run_id FROM tpip_pipelinelog`,
    params:       []
  })
  return rows[0].run_id as number
}

//----------------------------------------------------------------------------------
//  logPipelineStep — single INSERT once a step (or one table-write within a
//  multi-table step) has finished; every column is already known by then, so there's
//  no need for the old two-phase start/complete design.
//----------------------------------------------------------------------------------
export async function logPipelineStep(params: {
  step:         number
  subStep:      string
  stepName:     string
  inputTable:   string
  inputRecs:    number
  outputTable:  string
  outputRecs:   number
  durationMs:   number
  forceNewRun?: boolean
}): Promise<number> {
  const runId = await resolvePipRunId(params.step, params.subStep, params.forceNewRun)
  const rows = await table_query({
    caller:       'logPipelineStep',
    table:        'tpip_pipelinelog',
    query:        `
      INSERT INTO tpip_pipelinelog
        (pip_step, pip_sub_step, pip_step_name, pip_run_id, pip_input_table, pip_input_recs, pip_output_table, pip_output_recs, pip_duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING pip_pipid
    `,
    params:       [
      params.step, params.subStep, params.stepName, runId,
      params.inputTable, params.inputRecs, params.outputTable, params.outputRecs,
      params.durationMs
    ],
    isupdate:     true
  })
  return rows[0].pip_pipid as number
}

//----------------------------------------------------------------------------------
//  getPipelineRates — avg ms/item for each step, last 10 completed runs per step.
//  Rows with pip_output_recs = 0 are excluded (nothing to divide by). Grouped by
//  pip_step only, not pip_sub_step — steps 1 and 3 blend heterogeneous sub-steps into
//  one approximate rate, which is acceptable for a rough ETA estimate.
//----------------------------------------------------------------------------------
export async function getPipelineRates(): Promise<{
  step1: number | null
  step2: number | null
  step3: number | null
  step4: number | null
  step5: number | null
  step6: number | null
}> {
  const rows = await table_query({
    caller: 'getPipelineRates',
    table: 'tpip_pipelinelog',
    query: `
      SELECT
        SUM(CASE WHEN pip_step = 1 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 1 AND rn <= 10 THEN pip_output_recs END), 0) AS rate1,
        SUM(CASE WHEN pip_step = 2 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 2 AND rn <= 10 THEN pip_output_recs END), 0) AS rate2,
        SUM(CASE WHEN pip_step = 3 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 3 AND rn <= 10 THEN pip_output_recs END), 0) AS rate3,
        SUM(CASE WHEN pip_step = 4 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 4 AND rn <= 10 THEN pip_output_recs END), 0) AS rate4,
        SUM(CASE WHEN pip_step = 5 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 5 AND rn <= 10 THEN pip_output_recs END), 0) AS rate5,
        SUM(CASE WHEN pip_step = 6 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 6 AND rn <= 10 THEN pip_output_recs END), 0) AS rate6
      FROM (
        SELECT pip_step, pip_output_recs, pip_duration_ms,
               ROW_NUMBER() OVER (PARTITION BY pip_step ORDER BY pip_pipid DESC) AS rn
        FROM tpip_pipelinelog
        WHERE pip_output_recs > 0
      ) ranked
    `,
    params:       []
  })
  const r = rows[0]
  return {
    step1: r.rate1 != null ? Number(r.rate1) : null,
    step2: r.rate2 != null ? Number(r.rate2) : null,
    step3: r.rate3 != null ? Number(r.rate3) : null,
    step4: r.rate4 != null ? Number(r.rate4) : null,
    step5: r.rate5 != null ? Number(r.rate5) : null,
    step6: r.rate6 != null ? Number(r.rate6) : null,
  }
}

//----------------------------------------------------------------------------------
//  getLatestPipelineRuns — every row belonging to the single highest pip_run_id, for
//  the Pipeline page jobs summary table (full expanded view, one row per sub-step).
//  Reverted from a per-step "latest run regardless of run_id" version (user decision,
//  2026-07-16): showing each step's own latest run meant the table could mix rows
//  from different run_ids under one "Run #N" header, which read as misleading even
//  though each individual row was accurate — user preferred the table only ever
//  reflect one single run's data, accepting that a standalone single-step click
//  (which allocates its own new run_id) will make every other step show "—" until
//  the next coordinated run repopulates them all together.
//----------------------------------------------------------------------------------
export async function getLatestPipelineRuns(): Promise<{
  pip_step:        number
  pip_sub_step:    string
  pip_step_name:   string
  pip_created:     string
  pip_run_id:      number
  pip_input_table: string
  pip_input_recs:  number
  pip_output_table: string
  pip_output_recs: number
  pip_duration_ms: number
}[]> {
  const rows = await table_query({
    caller:       'getLatestPipelineRuns',
    table:        'tpip_pipelinelog',
    query:        `
      SELECT
        pip_step, pip_sub_step, pip_step_name, pip_created, pip_run_id,
        pip_input_table, pip_input_recs, pip_output_table, pip_output_recs,
        pip_duration_ms
      FROM tpip_pipelinelog
      WHERE pip_run_id = (SELECT MAX(pip_run_id) FROM tpip_pipelinelog)
      ORDER BY pip_step, pip_sub_step
    `,
    params:       []
  })
  return rows
}
