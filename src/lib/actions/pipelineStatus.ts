'use server'

import { table_query } from 'nextjs-shared/table_query'
import { MIN_REACH_TO_KEEP, PURGE_REACH_GRACE_DAYS, MIN_ANALYSIS_MOVE, HABITS_MIN_REACH_FLOOR } from '../constants'
import { countRemainingPopularPositionsByTier } from '../analysis/enrichPositionsStockfish'

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
  const rows = await table_query({
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
    skipCache: true
  })

  const r = rows[0]
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
  const rows = await table_query({
    caller: 'refreshStep1', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE NOT EXISTS (
         SELECT 1 FROM tgd_gamesdecon d
         WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player
       ))                                     AS pending,
      (SELECT COUNT(*) FROM tgd_gamesdecon)    AS all_decon`
  })
  const r = rows[0]
  return { pending: parseInt(r.pending ?? '0'), allDecon: parseInt(r.all_decon ?? '0') }
}

export async function refreshStep3(): Promise<{
  allProcessed: number; allRemaining: number
}> {
  const rows = await table_query({
    caller: 'refreshStep3', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tgd_gamesdecon)                                         AS all_eligible,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       WHERE NOT d.gd_positions_purged
         AND NOT EXISTS (SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid)) AS all_remaining`
  })
  const r = rows[0]
  const allEligible  = parseInt(r.all_eligible  ?? '0')
  const allRemaining = parseInt(r.all_remaining ?? '0')
  return {
    allProcessed: allEligible - allRemaining, allRemaining
  }
}

export async function refreshTposStatus(): Promise<{ positions: number; unresolved: number }> {
  const rows = await table_query({
    caller: 'refreshTposStatus', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tpos_positions)                                AS positions,
      (SELECT COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL)  AS unresolved`
  })
  const r = rows[0]
  return { positions: parseInt(r.positions ?? '0'), unresolved: parseInt(r.unresolved ?? '0') }
}

export async function refreshStep4(): Promise<{ evaluated: number; remaining: number }> {
  const rows = await table_query({
    caller: 'refreshStep4', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM teva_evaluations)                                          AS evaluated,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
       WHERE e.eva_evaid IS NULL AND p.pos_reached > ${MIN_REACH_TO_KEEP})                 AS remaining`
  })
  const r = rows[0]
  return {
    evaluated: parseInt(r.evaluated ?? '0'),
    remaining: parseInt(r.remaining ?? '0'),
  }
}

export async function refreshCpChangeStatus(): Promise<{ pending: number }> {
  const rows = await table_query({
    caller: 'refreshCpChangeStatus', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS pending
      FROM tgam_game_positions gp
      JOIN tpos_positions pb ON pb.pos_id = gp.gam_pos_id
      JOIN tpos_positions pa ON pa.pos_id = gp.gam_resulting_pos_id
      WHERE gp.gam_cp_change IS NULL
        AND pb.pos_reached > ${MIN_REACH_TO_KEEP} AND pa.pos_reached > ${MIN_REACH_TO_KEEP}`
  })
  const r = rows[0]
  return {
    pending: parseInt(r.pending ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  refreshPurgeStatus — "eligible" mirrors exactly what purgeStaleReachOnePositions()
//  would actually purge: naive reach/age candidates. No refinement needed — the purge
//  itself no longer excludes candidates based on cross-references, it nulls out the
//  dangling reference instead (see purgePositions.ts). Read-only — does not touch
//  tpur_workfile, which stays a snapshot of the last actual purge run.
//----------------------------------------------------------------------------------
//----------------------------------------------------------------------------------
//  refreshHabitsStatus — total/dismissed row counts for thab_habits, plus a genuine
//  "remaining" count: brand-new (player, position, move) combinations that meet
//  buildHabits.ts's own criteria but have no thab_habits row yet at all — as opposed
//  to existing habits just getting their stats routinely refreshed, which isn't
//  "remaining work" in the backlog sense. Same aggregation shape buildHabits_select
//  already runs, plus a LEFT JOIN to isolate never-yet-materialized combinations.
//----------------------------------------------------------------------------------
export async function refreshHabitsStatus(): Promise<{ total: number; dismissed: number; remaining: number }> {
  const rows = await table_query({
    caller: 'refreshHabitsStatus', params: [MIN_ANALYSIS_MOVE, HABITS_MIN_REACH_FLOOR], skipCache: true,
    query: `
      WITH candidates AS (
        SELECT d.gd_player AS player, gp.gam_pos_id AS pos_id, gp.gam_move_played AS move_san
        FROM tgam_game_positions gp
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        JOIN tpos_positions p ON p.pos_id = gp.gam_pos_id
        WHERE gp.gam_move_num >= $1
          AND p.pos_color = CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END
        GROUP BY d.gd_player, gp.gam_pos_id, gp.gam_move_played
        HAVING COUNT(*) >= $2
      )
      SELECT
        (SELECT COUNT(*) FROM thab_habits)                        AS total,
        (SELECT COUNT(*) FROM thab_habits WHERE hab_dismissed)     AS dismissed,
        (SELECT COUNT(*) FROM candidates c
         LEFT JOIN thab_habits h
           ON h.hab_player = c.player AND h.hab_pos_id = c.pos_id AND h.hab_move_san = c.move_san
         WHERE h.hab_habid IS NULL)                                AS remaining
    `
  })
  const r = rows[0]
  return {
    total:     parseInt(r.total     ?? '0'),
    dismissed: parseInt(r.dismissed ?? '0'),
    remaining: parseInt(r.remaining ?? '0')
  }
}

//----------------------------------------------------------------------------------
//  refreshGameEndingsStatus — evaluated/remaining counts for tgd_gamesdecon.gd_final_eval,
//  independent of the position-tree pipeline entirely (reads tgd_gamesdecon directly).
//----------------------------------------------------------------------------------
export async function refreshGameEndingsStatus(): Promise<{ evaluated: number; remaining: number }> {
  const rows = await table_query({
    caller: 'refreshGameEndingsStatus', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tgd_gamesdecon WHERE gd_final_eval IS NOT NULL)  AS evaluated,
      (SELECT COUNT(*) FROM tgd_gamesdecon WHERE gd_final_eval IS NULL)      AS remaining`
  })
  const r = rows[0]
  return {
    evaluated: parseInt(r.evaluated ?? '0'),
    remaining: parseInt(r.remaining ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  refreshDeepenPopularStatus — per-tier backlog breakdown for the Deepen Popular
//  Positions step, delegating to the same tiered subquery the batch itself uses
//  (single source of truth for the POPULAR_POSITION_DEPTH_TIERS-based WHERE clause).
//----------------------------------------------------------------------------------
export async function refreshDeepenPopularStatus(): Promise<{ tiers: { depth: number; remaining: number }[] }> {
  const tiers = await countRemainingPopularPositionsByTier()
  return { tiers }
}

export async function refreshPurgeStatus(): Promise<{ eligible: number }> {
  const candidatesRes = await table_query({
    caller: 'refreshPurgeStatus_find', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS cnt
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
        )`
  })
  return { eligible: parseInt(candidatesRes[0]?.cnt ?? '0') }
}
