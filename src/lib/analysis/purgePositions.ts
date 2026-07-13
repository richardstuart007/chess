'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { PURGE_REACH_GRACE_DAYS, MIN_REACH_TO_KEEP, PURGE_ROW_CAP, MAX_REFINEMENT_ITERATIONS } from '../constants'

//----------------------------------------------------------------------------------
//  purgeStaleReachOnePositions — EXPLICIT EXCEPTION to the "no destructive SQL in
//  automation" rule, user-approved (see chess project .claude/CLAUDE.md). Deletes
//  tpos_positions/tgam_game_positions/teva_evaluations rows for positions reached by
//  MIN_REACH_TO_KEEP games or fewer, once every one of those occurrences is at least
//  PURGE_REACH_GRACE_DAYS old. Sets tgd_gamesdecon.gd_positions_purged on any game left
//  with zero tgam_game_positions rows, so buildPositionTree never mistakes a purged
//  game for an unprocessed one and resurrects what was just removed.
//
//  Candidate refinement: a position can independently qualify by reach/age yet still
//  be needed as the after-position of a tgam row whose own before-position doesn't
//  qualify — that row would survive the purge, so the position can't actually be
//  deleted without leaving that row referencing something gone. The candidate set,
//  materialized in tpur_workfile (truncated at the start of every run — always holds
//  only the current run's data, an inspectable snapshot until the next run), is
//  refined before any deletes run, repeating until stable since excluding one
//  candidate can change whether another, dependent on it, should also be excluded.
//  Once stable, every row touching a final candidate — as its own before or as an
//  after pointing to it — is guaranteed to be deleted by the gam_pos_id-based delete
//  below, so no null-out/flag step is needed afterward.
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

  // Stage 1 — cheap, indexed reach filter. Stage 2 — join only that small candidate
  // set to confirm every occurrence (before or resulting side) is outside the grace
  // period; NOT EXISTS rather than a single date check so this stays correct if
  // MIN_REACH_TO_KEEP is ever raised further (multiple occurrences, all must be old).
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
          WHERE (g.gam_pos_id = p.pos_id OR g.gam_resulting_pos_id = p.pos_id)
            AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
        )
      LIMIT ${PURGE_ROW_CAP}
    `,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tpur_workfile',
    level, isupdate: true, severity: 'D'
  })

  const logId = await startPipelineLog(5, 'Purge Stale Positions', insertRes.rowCount ?? 0)

  if (!insertRes.rowCount) {
    await completePipelineLog(logId, 0, 0, 0, Date.now() - t0)
    await logEnd('purgeStaleReachOnePositions', 'analysisCronRoute', '0 positions eligible', level)
    return { purged: 0 }
  }

  // Refine: repeatedly exclude any candidate still needed as the after-position of a
  // row whose own before-position isn't (currently) also a candidate — that row would
  // survive, so the candidate must stay. Each pass re-checks against the latest
  // (already-refined) workfile, so excluding one candidate correctly cascades to any
  // other candidate that depended on it.
  for (let iteration = 0; iteration < MAX_REFINEMENT_ITERATIONS; iteration++) {
    const refineRes = await db.query({
      caller: 'purgeStaleReachOnePositions_refine',
      query: `
        DELETE FROM tpur_workfile wc
        WHERE EXISTS (
          SELECT 1
          FROM tgam_game_positions g
          WHERE g.gam_resulting_pos_id = wc.pur_pos_id
            AND (g.gam_pos_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM tpur_workfile wc2 WHERE wc2.pur_pos_id = g.gam_pos_id
            ))
        )
      `,
      params: [],
      functionName: 'purgeStaleReachOnePositions',
      table: 'tpur_workfile',
      level, isupdate: true, severity: 'D'
    })
    if (!refineRes.rowCount) break
  }

  const finalCountRes = await db.query({
    caller: 'purgeStaleReachOnePositions_count',
    query: `SELECT COUNT(*) AS cnt FROM tpur_workfile`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tpur_workfile',
    level, severity: 'D'
  })
  const purgedCount = parseInt(finalCountRes.rows[0]?.cnt ?? '0')

  if (purgedCount === 0) {
    await completePipelineLog(logId, 0, 0, 0, Date.now() - t0)
    await logEnd('purgeStaleReachOnePositions', 'analysisCronRoute', '0 positions eligible after refinement', level)
    return { purged: 0 }
  }

  // 1. Delete evaluations for the refined purge set
  await db.query({
    caller: 'purgeStaleReachOnePositions_evals',
    query: `DELETE FROM teva_evaluations WHERE eva_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'teva_evaluations',
    level, isupdate: true, severity: 'D'
  })

  // 2. Full-delete tgam rows where the before-position is in the refined purge set —
  // refinement guarantees this also correctly accounts for every row that had one of
  // these positions as its after-side, since those rows' own before is in this same
  // set too (otherwise refinement would have excluded the position).
  await db.query({
    caller: 'purgeStaleReachOnePositions_tgam',
    query: `DELETE FROM tgam_game_positions WHERE gam_pos_id IN (SELECT pur_pos_id FROM tpur_workfile)`,
    params: [],
    functionName: 'purgeStaleReachOnePositions',
    table: 'tgam_game_positions',
    level, isupdate: true, severity: 'D'
  })

  // 3. Resurrection guard — stamp any game now left with zero tgam rows
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

  // 4. Delete the purged tpos_positions rows themselves — no null-out/flag step
  // needed; refinement already guarantees no surviving row references any of these.
  // tpur_workfile itself is intentionally left populated — an inspectable record of
  // exactly what this run purged, until the next run truncates it.
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
