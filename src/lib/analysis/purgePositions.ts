'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { table_query } from 'nextjs-shared/table_query'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from '../actions/pipelineLog'
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
export async function purgeStaleReachOnePositions(level: number = 1, forceNewRun?: boolean): Promise<{ purged: number }> {
  await logStart('purgeStaleReachOnePositions', 'purgeRoute', 'checking for stale low-reach positions', level)
  const t0 = Date.now()

  // Always start clean — tpur_workfile holds only the current run's candidates.
  await table_truncate('tpur_workfile', 'purgeStaleReachOnePositions', true, level, 'D')

  // Stage 1 — cheap, indexed reach filter. Stage 2 — confirm every occurrence (before
  // and resulting side, checked as two separate NOT EXISTS rather than one OR'd
  // condition so each can use its own single-column index — idx_tgam_pos_id /
  // idx_tgam_resulting_pos_id — instead of forcing the planner to reconcile an OR
  // across two different indexed columns) is outside the grace period. NOT EXISTS
  // rather than a single date check so this stays correct if MIN_REACH_TO_KEEP is ever
  // raised further (multiple occurrences, all must be old).
  const insertRes = await table_query({
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
      RETURNING pur_pos_id
    `,
    params: [],
    table: 'tpur_workfile',
    level, isupdate: true, severity: 'D'
  })

  const purgedCount = insertRes.length

  if (!purgedCount) {
    const durationMs = Date.now() - t0
    await logPipelineStep({ step: 4, subStep: 'a', stepName: 'Purge teva_evaluations', inputTable: 'tpos_positions', inputRecs: 0, outputTable: 'teva_evaluations', outputRecs: 0, durationMs, forceNewRun })
    await logPipelineStep({ step: 4, subStep: 'b', stepName: 'Purge tgam_game_positions', inputTable: 'tpos_positions', inputRecs: 0, outputTable: 'tgam_game_positions', outputRecs: 0, durationMs, forceNewRun: false })
    await logPipelineStep({ step: 4, subStep: 'c', stepName: 'Purge tpos_positions', inputTable: 'tpos_positions', inputRecs: 0, outputTable: 'tpos_positions', outputRecs: 0, durationMs, forceNewRun: false })
    await logPipelineStep({ step: 4, subStep: 'd', stepName: 'Purge tgd_gamesdecon guard', inputTable: 'tpos_positions', inputRecs: 0, outputTable: 'tgd_gamesdecon', outputRecs: 0, durationMs, forceNewRun: false })
    await logEnd('purgeStaleReachOnePositions', 'purgeRoute', '0 positions eligible', level)
    return { purged: 0 }
  }

  // 1. Delete evaluations for the candidate set
  const evalsRes = await table_query({
    caller: 'purgeStaleReachOnePositions_evals',
    query: `DELETE FROM teva_evaluations WHERE eva_pos_id IN (SELECT pur_pos_id FROM tpur_workfile) RETURNING eva_evaid`,
    params: [],
    table: 'teva_evaluations',
    level, isupdate: true, severity: 'D'
  })

  // 2. Full-delete tgam rows whose own before-position is a candidate.
  const tgamDeleteRes = await table_query({
    caller: 'purgeStaleReachOnePositions_tgam_delete',
    query: `DELETE FROM tgam_game_positions WHERE gam_pos_id IN (SELECT pur_pos_id FROM tpur_workfile) RETURNING gam_gamid`,
    params: [],
    table: 'tgam_game_positions',
    level, isupdate: true, severity: 'D'
  })

  // 3. Null out the resulting-position reference on any surviving row (its own
  // before-position wasn't a candidate, so the row stays — only the now-dangling
  // pointer is cleared). gam_resulting_fen is nulled in the same statement — left
  // alone, syncTposFromTgam's backfill query can't tell "never linked yet" apart from
  // "deliberately purged" and recreates the exact position just deleted, which then
  // re-qualifies for purge immediately (same old, low-reach position) — a
  // self-perpetuating resurrection cycle. Clearing the FEN here removes what that
  // backfill query keys off.
  const tgamNullRes = await table_query({
    caller: 'purgeStaleReachOnePositions_tgam_null',
    query: `
      UPDATE tgam_game_positions
      SET gam_resulting_pos_id = NULL, gam_resulting_fen = NULL
      WHERE gam_resulting_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)
      RETURNING gam_gamid
    `,
    params: [],
    table: 'tgam_game_positions',
    level, isupdate: true, severity: 'D'
  })

  // 4. Resurrection guard — stamp any game now left with zero tgam rows
  const guardRes = await table_query({
    caller: 'purgeStaleReachOnePositions_guard',
    query: `
      UPDATE tgd_gamesdecon d
      SET gd_positions_purged = true
      WHERE NOT d.gd_positions_purged
        AND NOT EXISTS (SELECT 1 FROM tgam_game_positions g WHERE g.gam_gdid = d.gd_gdid)
      RETURNING d.gd_gdid
    `,
    params: [],
    table: 'tgd_gamesdecon',
    level, isupdate: true, severity: 'D'
  })

  // 5. Delete the purged tpos_positions rows themselves — safe unconditionally now:
  // every reference to them was either removed with its row (step 2) or nulled out
  // (step 3). tpur_workfile itself is intentionally left populated — an inspectable
  // record of exactly what this run purged, until the next run truncates it.
  const tposRes = await table_query({
    caller: 'purgeStaleReachOnePositions_tpos',
    query: `DELETE FROM tpos_positions WHERE pos_id IN (SELECT pur_pos_id FROM tpur_workfile) RETURNING pos_id`,
    params: [],
    table: 'tpos_positions',
    level, isupdate: true, severity: 'D'
  })

  const durationMs = Date.now() - t0
  await logPipelineStep({ step: 4, subStep: 'a', stepName: 'Purge teva_evaluations', inputTable: 'tpos_positions', inputRecs: purgedCount, outputTable: 'teva_evaluations', outputRecs: evalsRes.length, durationMs, forceNewRun })
  await logPipelineStep({ step: 4, subStep: 'b', stepName: 'Purge tgam_game_positions', inputTable: 'tpos_positions', inputRecs: purgedCount, outputTable: 'tgam_game_positions', outputRecs: tgamDeleteRes.length + tgamNullRes.length, durationMs, forceNewRun: false })
  await logPipelineStep({ step: 4, subStep: 'c', stepName: 'Purge tpos_positions', inputTable: 'tpos_positions', inputRecs: purgedCount, outputTable: 'tpos_positions', outputRecs: tposRes.length, durationMs, forceNewRun: false })
  await logPipelineStep({ step: 4, subStep: 'd', stepName: 'Purge tgd_gamesdecon guard', inputTable: 'tpos_positions', inputRecs: purgedCount, outputTable: 'tgd_gamesdecon', outputRecs: guardRes.length, durationMs, forceNewRun: false })

  await write_logging({
    lg_functionname: 'purgeStaleReachOnePositions',
    lg_caller: 'purgeRoute',
    lg_msg: `Purged ${purgedCount} stale low-reach positions (pos_reached <= ${MIN_REACH_TO_KEEP}, ${PURGE_REACH_GRACE_DAYS}+ day grace period)`,
    lg_severity: 'I'
  })

  await logEnd('purgeStaleReachOnePositions', 'purgeRoute', `${purgedCount} positions purged`, level)
  return { purged: purgedCount }
}
