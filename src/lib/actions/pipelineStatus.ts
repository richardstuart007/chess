'use server'

//----------------------------------------------------------------------------------
//  getPipelineStatus — single-query count of processed/remaining rows for all steps
//----------------------------------------------------------------------------------
export type PipelineStatus = {
  pending:              number
  gamesdecon:           number
  treeGamesProcessed:   number
  treeGamesRemaining:   number
  positions:            number
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
        (SELECT COUNT(*) FROM tgd_gamesdecon WHERE gd_pgn IS NOT NULL)               AS tree_games_eligible,
        (SELECT COUNT(*) FROM tgd_gamesdecon d
         WHERE d.gd_pgn IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM tgam_game_positions
             WHERE gam_gdid = d.gd_gdid
           ))                                                                        AS tree_games_remaining,
        (SELECT COUNT(*) FROM tpos_positions)                                        AS positions,
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
  allProcessed: number; allRemaining: number; allPositions: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const res = await db.query({
    caller: 'refreshStep3', params: [], functionName: 'refreshStep3',
    query: `SELECT
      (SELECT COUNT(*) FROM tgd_gamesdecon WHERE gd_pgn IS NOT NULL)                 AS all_eligible,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       WHERE d.gd_pgn IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid)) AS all_remaining,
      (SELECT COUNT(*) FROM tpos_positions)                                         AS all_positions`
  })
  const r = res.rows[0]
  const allEligible  = parseInt(r.all_eligible  ?? '0')
  const allRemaining = parseInt(r.all_remaining ?? '0')
  return {
    allProcessed: allEligible - allRemaining, allRemaining, allPositions: parseInt(r.all_positions ?? '0')
  }
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
       WHERE e.eva_evaid IS NULL)                                                          AS remaining`
  })
  const r = res.rows[0]
  return {
    evaluated: parseInt(r.evaluated ?? '0'),
    remaining: parseInt(r.remaining ?? '0'),
  }
}
