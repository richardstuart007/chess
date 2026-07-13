'use server'

import { MIN_REACH_TO_KEEP, PURGE_REACH_GRACE_DAYS, MAX_REFINEMENT_ITERATIONS } from '../constants'

//----------------------------------------------------------------------------------
//  getPipelineStatus — single-query count of processed/remaining rows for all steps
//----------------------------------------------------------------------------------
export type PipelineStatus = {
  pending:              number
  gamesdecon:           number
  treeGamesProcessed:   number
  treeGamesRemaining:   number
  positions:            number
  positionsUnresolved:  number
  gamePositions:        number
  evaluated:            number
  evaluationsRemaining: number
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const res = await db.query({
    caller: 'getPipelineStatus',
    query: `
      SELECT
        (SELECT COUNT(*) FROM tgr_gamesraw r
         WHERE NOT EXISTS (
           SELECT 1 FROM tgd_gamesdecon d
           WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player
         ))                                                                          AS pending,
        (SELECT COUNT(*) FROM tgd_gamesdecon)                                        AS gamesdecon,
        (SELECT COUNT(*) FROM tgd_gamesdecon)                                        AS tree_games_eligible,
        (SELECT COUNT(*) FROM tgd_gamesdecon d
         WHERE NOT d.gd_positions_purged
           AND NOT EXISTS (
             SELECT 1 FROM tgam_game_positions
             WHERE gam_gdid = d.gd_gdid
           ))                                                                        AS tree_games_remaining,
        (SELECT COUNT(*) FROM tpos_positions)                                        AS positions,
        (SELECT COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL)          AS positions_unresolved,
        (SELECT COUNT(*) FROM tgam_game_positions)                                   AS game_positions,
        (SELECT COUNT(*) FROM teva_evaluations)                                       AS evaluated,
        (SELECT COUNT(*) FROM tpos_positions p
         LEFT JOIN teva_evaluations e
           ON e.eva_pos_id = p.pos_id
         WHERE e.eva_evaid IS NULL)                                                     AS evaluations_remaining
    `,
    params: [],
    functionName: 'getPipelineStatus'
  })

  const r = res.rows[0]
  const treeGamesEligible = parseInt(r.tree_games_eligible ?? '0')
  const treeGamesRemaining = parseInt(r.tree_games_remaining ?? '0')
  return {
    pending:              parseInt(r.pending             ?? '0'),
    gamesdecon:           parseInt(r.gamesdecon           ?? '0'),
    treeGamesProcessed:   treeGamesEligible - treeGamesRemaining,
    treeGamesRemaining,
    positions:            parseInt(r.positions            ?? '0'),
    positionsUnresolved:  parseInt(r.positions_unresolved ?? '0'),
    gamePositions:        parseInt(r.game_positions       ?? '0'),
    evaluated:            parseInt(r.evaluated            ?? '0'),
    evaluationsRemaining: parseInt(r.evaluations_remaining ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  Per-step refresh functions — each queries only that step's tables
//----------------------------------------------------------------------------------

export async function refreshStep1(): Promise<{ pending: number; allDecon: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const res = await db.query({
    caller: 'refreshStep1', params: [], functionName: 'refreshStep1',
    query: `SELECT
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE NOT EXISTS (
         SELECT 1 FROM tgd_gamesdecon d
         WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player
       ))                                     AS pending,
      (SELECT COUNT(*) FROM tgd_gamesdecon)    AS all_decon`
  })
  const r = res.rows[0]
  return { pending: parseInt(r.pending ?? '0'), allDecon: parseInt(r.all_decon ?? '0') }
}

export async function refreshStep3(): Promise<{
  allProcessed: number; allRemaining: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const res = await db.query({
    caller: 'refreshStep3', params: [], functionName: 'refreshStep3',
    query: `SELECT
      (SELECT COUNT(*) FROM tgd_gamesdecon)                                         AS all_eligible,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       WHERE NOT d.gd_positions_purged
         AND NOT EXISTS (SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid)) AS all_remaining`
  })
  const r = res.rows[0]
  const allEligible  = parseInt(r.all_eligible  ?? '0')
  const allRemaining = parseInt(r.all_remaining ?? '0')
  return {
    allProcessed: allEligible - allRemaining, allRemaining
  }
}

export async function refreshTposStatus(): Promise<{ positions: number; unresolved: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const res = await db.query({
    caller: 'refreshTposStatus', params: [], functionName: 'refreshTposStatus',
    query: `SELECT
      (SELECT COUNT(*) FROM tpos_positions)                                AS positions,
      (SELECT COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL)  AS unresolved`
  })
  const r = res.rows[0]
  return { positions: parseInt(r.positions ?? '0'), unresolved: parseInt(r.unresolved ?? '0') }
}

export async function refreshStep4(): Promise<{ evaluated: number; remaining: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db   = await sql()
  const res  = await db.query({
    caller: 'refreshStep4', params: [], functionName: 'refreshStep4',
    query: `SELECT
      (SELECT COUNT(*) FROM teva_evaluations)                                          AS evaluated,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
       WHERE e.eva_evaid IS NULL AND p.pos_reached > ${MIN_REACH_TO_KEEP})                 AS remaining`
  })
  const r = res.rows[0]
  return {
    evaluated: parseInt(r.evaluated ?? '0'),
    remaining: parseInt(r.remaining ?? '0'),
  }
}

export async function refreshCpChangeStatus(): Promise<{ pending: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const res = await db.query({
    caller: 'refreshCpChangeStatus', params: [], functionName: 'refreshCpChangeStatus',
    query: `SELECT COUNT(*) AS pending
      FROM tgam_game_positions gp
      JOIN tpos_positions pb ON pb.pos_id = gp.gam_pos_id
      JOIN tpos_positions pa ON pa.pos_id = gp.gam_resulting_pos_id
      WHERE gp.gam_cp_change IS NULL
        AND pb.pos_reached > ${MIN_REACH_TO_KEEP} AND pa.pos_reached > ${MIN_REACH_TO_KEEP}`
  })
  const r = res.rows[0]
  return {
    pending: parseInt(r.pending ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  refreshPurgeStatus — "eligible" mirrors exactly what purgeStaleReachOnePositions()
//  would actually purge: naive reach/age candidates, refined via the same iterative
//  loop (excluding any candidate still needed as the after-position of a row whose
//  own before isn't also a candidate, repeated until stable). Read-only — does not
//  touch tpur_workfile, which stays a snapshot of the last actual purge run.
//----------------------------------------------------------------------------------
export async function refreshPurgeStatus(): Promise<{ eligible: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const candidatesRes = await db.query({
    caller: 'refreshPurgeStatus_find', params: [], functionName: 'refreshPurgeStatus',
    query: `SELECT p.pos_id
      FROM tpos_positions p
      WHERE p.pos_reached <= ${MIN_REACH_TO_KEEP}
        AND NOT EXISTS (
          SELECT 1
          FROM tgam_game_positions g
          JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
          WHERE (g.gam_pos_id = p.pos_id OR g.gam_resulting_pos_id = p.pos_id)
            AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
        )`
  })
  let posIds = candidatesRes.rows.map((r: any) => Number(r.pos_id))
  if (posIds.length === 0) return { eligible: 0 }

  for (let iteration = 0; iteration < MAX_REFINEMENT_ITERATIONS; iteration++) {
    const excludeRes = await db.query({
      caller: 'refreshPurgeStatus_refine', params: [posIds], functionName: 'refreshPurgeStatus',
      query: `SELECT DISTINCT g.gam_resulting_pos_id AS pos_id
        FROM tgam_game_positions g
        WHERE g.gam_resulting_pos_id = ANY($1)
          AND (g.gam_pos_id IS NULL OR NOT (g.gam_pos_id = ANY($1)))`
    })
    if (excludeRes.rows.length === 0) break
    const excludeSet = new Set(excludeRes.rows.map((r: any) => Number(r.pos_id)))
    posIds = posIds.filter((id: number) => !excludeSet.has(id))
    if (posIds.length === 0) break
  }

  return { eligible: posIds.length }
}
