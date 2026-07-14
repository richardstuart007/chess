'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { PURGE_REACH_GRACE_DAYS, MIN_REACH_TO_KEEP } from '../constants'

//----------------------------------------------------------------------------------
//  purgeStaleReachOnePositions — EXPLICIT EXCEPTION to the "no destructive SQL in
//  automation" rule, user-approved (see chess project .claude/CLAUDE.md). Deletes
//  tpos_positions/tgam_game_positions/teva_evaluations rows for positions reached by
//  MIN_REACH_TO_KEEP games or fewer, once every one of those occurrences is at least
//  PURGE_REACH_GRACE_DAYS old. Sets tgd_gamesdecon.gd_positions_purged on any game left
//  with zero tgam_game_positions rows, so buildPositionTree never mistakes a purged
//  game for an unprocessed one and resurrects what was just removed.
//
//  Dangling-reference handling follows the standard before/resulting-pair rule (see
//  .claude/CLAUDE.md): full-delete a tgam row when its own before-position is a
//  candidate; otherwise, if only its resulting-position is a candidate, null out just
//  that reference and keep the row. No cross-candidate dependency check is needed —
//  each candidate is safe to process independently of which other candidates are in
//  the same run, so there's no per-run row cap; every eligible candidate is purged.
//----------------------------------------------------------------------------------
export async function purgeStaleReachOnePositions(level: number = 1): Promise<{ purged: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  await logStart('purgeStaleReachOnePositions', 'analysisCronRoute', 'checking for stale low-reach positions', level)
  const t0 = Date.now()

  // Always start clean — tpur_workfile holds only the current run's candidates.
  await db.query({
    caller: 'purgeStaleReachOnePositions_truncate',
    query: `TRUNCATE TABLE tpur_workfile`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tpur_workfile',
    level, isupdate: true, severity: 'D'
  })

  // Stage 1 — cheap, indexed reach filter. Stage 2 — confirm every occurrence (before
  // and resulting side, checked as two separate NOT EXISTS rather than one OR'd
  // condition so each can use its own single-column index — idx_tgam_pos_id /
  // idx_tgam_resulting_pos_id — instead of forcing the planner to reconcile an OR
  // across two different indexed columns) is outside the grace period. NOT EXISTS
  // rather than a single date check so this stays correct if MIN_REACH_TO_KEEP is ever
  // raised further (multiple occurrences, all must be old).
  const insertRes = await db.query({
    caller: 'purgeStaleReachOnePositions_seed',
    query: `
      INSERT INTO tpur_workfile (pur_pos_id, pur_pos_fen, pur_pos_reached)
      SELECT p.pos_id, p.pos_fen, p.pos_reached
      FROM tpos_positions p
      WHERE p.pos_reached <= ${MIN_REACH_TO_KEEP}
        AND NOT EXISTS (
          SELECT 1
          FROM tgam_game_positions g
          JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
          WHERE g.gam_pos_id = p.pos_id
            AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
        )
        AND NOT EXISTS (
          SELECT 1
          FROM tgam_game_positions g
          JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
          WHERE g.gam_resulting_pos_id = p.pos_id
            AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
        )
    `,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tpur_workfile',
    level, isupdate: true, severity: 'D'
  })

  const purgedCount = insertRes.rowCount ?? 0
  const logId = await startPipelineLog(5, 'Purge Stale Positions', purgedCount)

  if (!purgedCount) {
    await completePipelineLog(logId, 0, 0, 0, Date.now() - t0)
    await logEnd('purgeStaleReachOnePositions', 'analysisCronRoute', '0 positions eligible', level)
    return { purged: 0 }
  }

  // 1. Delete evaluations for the candidate set
  await db.query({
    caller: 'purgeStaleReachOnePositions_evals',
    query: `DELETE FROM teva_evaluations WHERE eva_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'teva_evaluations',
    level, isupdate: true, severity: 'D'
  })

  // 2. Full-delete tgam rows whose own before-position is a candidate.
  await db.query({
    caller: 'purgeStaleReachOnePositions_tgam_delete',
    query: `DELETE FROM tgam_game_positions WHERE gam_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tgam_game_positions',
    level, isupdate: true, severity: 'D'
  })

  // 3. Null out the resulting-position reference on any surviving row (its own
  // before-position wasn't a candidate, so the row stays — only the now-dangling
  // pointer is cleared).
  await db.query({
    caller: 'purgeStaleReachOnePositions_tgam_null',
    query: `
      UPDATE tgam_game_positions
      SET gam_resulting_pos_id = NULL
      WHERE gam_resulting_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)
    `,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tgam_game_positions',
    level, isupdate: true, severity: 'D'
  })

  // 4. Resurrection guard — stamp any game now left with zero tgam rows
  await db.query({
    caller: 'purgeStaleReachOnePositions_guard',
    query: `
      UPDATE tgd_gamesdecon d
      SET gd_positions_purged = true
      WHERE NOT d.gd_positions_purged
        AND NOT EXISTS (SELECT 1 FROM tgam_game_positions g WHERE g.gam_gdid = d.gd_gdid)
    `,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tgd_gamesdecon',
    level, isupdate: true, severity: 'D'
  })

  // 5. Delete the purged tpos_positions rows themselves — safe unconditionally now:
  // every reference to them was either removed with its row (step 2) or nulled out
  // (step 3). tpur_workfile itself is intentionally left populated — an inspectable
  // record of exactly what this run purged, until the next run truncates it.
  await db.query({
    caller: 'purgeStaleReachOnePositions_tpos',
    query: `DELETE FROM tpos_positions WHERE pos_id IN (SELECT pur_pos_id FROM tpur_workfile)`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tpos_positions',
    level, isupdate: true, severity: 'D'
  })

  await completePipelineLog(logId, purgedCount, 0, 0, Date.now() - t0)

  await write_logging({
    lg_functionname: 'purgeStaleReachOnePositions',
    lg_caller: 'analysisCronRoute',
    lg_msg: `Purged ${purgedCount} stale low-reach positions (pos_reached <= ${MIN_REACH_TO_KEEP}, ${PURGE_REACH_GRACE_DAYS}+ day grace period)`,
    lg_severity: 'I'
  })

  await logEnd('purgeStaleReachOnePositions', 'analysisCronRoute', `${purgedCount} positions purged`, level)
  return { purged: purgedCount }
}
