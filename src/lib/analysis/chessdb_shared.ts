'use server'

// ============================================================================
// Analysis DB helpers — shared: used by both tracked-player and master-game
// analysis. See chessdb_player.ts for the player-only counterparts (Moves
// Played/Games Played queries, Habits, position detail).
//
// Simple single-table ops use nextjs-shared generic functions:
//   table_fetch  — SELECT (cached)
//   table_upsert — INSERT … ON CONFLICT DO UPDATE SET col = EXCLUDED.col
//   table_count  — SELECT COUNT(*)
//
// Complex queries (multi-join, arithmetic upserts, COALESCE in SET) use
// table_query — raw SQL, no caching, with logging.
// ============================================================================

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_count }  from 'nextjs-shared/table_count'
import { table_query }  from 'nextjs-shared/table_query'
import { cache_clearTable } from 'nextjs-shared/userCache_store'
import { write_logging } from 'nextjs-shared/write_logging'
import { truncateFen }  from '../fen'
import { MIN_ANALYSIS_MOVE_Player } from '../constants'

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
}

export interface EvaluationRow {
  pose_pos_id: number
  pose_cp: number | null
  pose_best_move: string | null
  pose_depth: number
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getPositionCount_shared — total number of positions
//----------------------------------------------------------------------------------
export async function getPositionCount_shared(): Promise<number> {
  const result = await table_count({ table: 'tpos_positions', caller: 'getPositionCount_shared' })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getPositionCount_shared',
      lg_caller: 'getPositionCount_shared',
      lg_msg: 'Failed to count positions: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveEvaluation_shared — upsert a Stockfish evaluation for a position or move
//----------------------------------------------------------------------------------
export async function saveEvaluation_shared(data: {
  posId: number
  cp: number | null
  bestMove: string | null
  depth: number
}): Promise<void> {
  await table_upsert({
    caller: 'saveEvaluation_shared',
    table: 'tpose_positions_eval',
    columnValuePairs: [
      { column: 'pose_pos_id',    value: data.posId },
      { column: 'pose_cp',        value: data.cp },
      { column: 'pose_best_move', value: data.bestMove },
      { column: 'pose_depth',     value: data.depth }
    ],
    conflictColumns: ['pose_pos_id'],
    skipCache: true
  })
}

//----------------------------------------------------------------------------------
//  getEvaluationForPosition_shared — the Stockfish evaluation for a position
//----------------------------------------------------------------------------------
export async function getEvaluationForPosition_shared(posId: number): Promise<EvaluationRow | null> {
  const result = await table_fetch({
    caller: 'getEvaluationForPosition_shared',
    table: 'tpose_positions_eval',
    whereColumnValuePairs: [{ column: 'pose_pos_id', value: posId }]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getEvaluationForPosition_shared',
      lg_caller: 'getEvaluationForPosition_shared',
      lg_msg: 'Failed to fetch evaluation for position ' + posId + ': ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  return result.data[0] as EvaluationRow ?? null
}

//----------------------------------------------------------------------------------
//  getOrCreatePosition — look up tpos_positions by FEN; if missing, insert a new row.
//  pos_color/pos_move_num are derived directly from the FEN's own active-color and
//  fullmove-counter fields — same "derive from the FEN itself" pattern
//  buildPositionTree_Player.ts's syncTposFromTgam_Player() already uses for pos_color. Used by
//  upgradePositionEvaluation_shared's createIfMissing path to write back evaluations for
//  positions outside the normal position-tree build range (MIN_ANALYSIS_MOVE_Player..
//  MAX_ANALYSIS_MOVE_Player) — those rows are exempted from purgeStaleReachOnePositions by
//  pos_move_num, since they were never part of the reach-tracked habit system.
//----------------------------------------------------------------------------------
async function getOrCreatePosition(truncatedFen: string): Promise<number> {
  const existing = await table_query({
    caller: 'getOrCreatePosition_lookup',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncatedFen],
    skipCache: true
  })
  if (!existing.ok) {
    write_logging({
      lg_functionname: 'getOrCreatePosition',
      lg_caller: 'getOrCreatePosition_lookup',
      lg_msg: 'Failed to look up position ' + truncatedFen + ': ' + existing.error,
      lg_severity: 'E'
    })
    throw new Error('getOrCreatePosition: lookup failed — ' + existing.error)
  }
  if (existing.data[0]?.pos_id) return existing.data[0].pos_id as number

  const parts = truncatedFen.split(' ')
  const color = parts[1] ?? null
  const moveNum = parseInt(parts[5] ?? '', 10)

  await table_query({
    caller: 'getOrCreatePosition_insert',
    table: 'tpos_positions',
    query: `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_move_num, pos_reached)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (pos_fen) DO NOTHING
    `,
    params: [truncatedFen, color, Number.isFinite(moveNum) ? moveNum : null],
    isupdate: true
  })

  cache_clearTable('tpos_positions', 'getOrCreatePosition')

  const created = await table_query({
    caller: 'getOrCreatePosition_reselect',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncatedFen],
    skipCache: true
  })
  if (!created.ok) {
    write_logging({
      lg_functionname: 'getOrCreatePosition',
      lg_caller: 'getOrCreatePosition_reselect',
      lg_msg: 'Failed to re-select newly created position ' + truncatedFen + ': ' + created.error,
      lg_severity: 'E'
    })
    throw new Error('getOrCreatePosition: re-select failed — ' + created.error)
  }
  return created.data[0].pos_id as number
}

//----------------------------------------------------------------------------------
//  upgradePositionEvaluation_shared — the single driving function for every position-eval
//  write in the app. Upserts tpose_positions_eval for the position (creating a
//  tpos_positions row too, via getOrCreatePosition, when createIfMissing is true and
//  the position falls outside the batch pipeline's normal tracked range) and, on a
//  successful upgrade:
//    - if gameContext is given, also upserts tgev_game_evals for that exact (gdid, ply)
//      — insert if missing, update if present. tgev is the durable, never-purged,
//      per-game record of analysis work (unlike tpose, which is deliberately incomplete
//      and purge-vulnerable), so any position genuinely reachable from a known (game,
//      ply) should land in both together. Callers must only pass gameContext when the
//      position being written is actually the game's own move at that ply — never for a
//      hypothetical/unplayed line, since tgev's schema (gev_san NOT NULL,
//      UNIQUE(gev_gdid, gev_ply)) is a record of what the game really played, not a
//      place to store alternatives.
//    - cascades the new value out to every *other* tgev_game_evals row for this exact
//      position, across every other game — the same position can (and, since this data
//      is used to detect recurring habits, likely will) recur in many games, each with
//      its own independently-writable gev_cp/gev_depth, so a canonical tpose_positions_eval
//      upgrade must propagate to all of them, not just the game that triggered it. Scoped
//      to gev_cp/gev_depth/gev_cp_change only — gev_best_move* describes the
//      recommendation from the position BEFORE that ply, not a property of the resulting
//      position, so it's left untouched.
//  thab_habits is deliberately NOT refreshed here — per user decision, habits only ever
//  update via the nightly buildHabits() pipeline rebuild, never live from an interactive
//  analysis click.
//  Only when the new depth exceeds what's stored (per position, and per tgev row).
//  Recomputes gam_cp_change for the affected tgam_game_positions rows deliberately via
//  a direct query, not bulkUpdateCpLoss(), since that logs a pipeline step and would
//  make every interactive analyze click look like a new pipeline run on Owner > Pipeline.
//----------------------------------------------------------------------------------
export async function upgradePositionEvaluation_shared(data: {
  fen: string
  cp: number
  bestMove: string | null
  depth: number
  createIfMissing?: boolean
  // Bypasses the depth-guard below (the tpose_positions_eval upsert, the gameContext
  // upsert, and the tgev cascade), so an equal-depth value still overwrites, not just a
  // strictly deeper one. Reserved for the interactive "Analyze Position" own-position
  // write-back (persistAnalysisLines) — an explicit, just-run analysis should always
  // land, even if a background pipeline pass had already reached the identical depth
  // with a different value. Never set by automated/cron callers, which keep the strict
  // guard so a repeat pass at the same depth tier can't cause the stored value to jitter
  // between runs.
  force?: boolean
  // The exact (game, ply) this position corresponds to, when known — see the function
  // header above for the hard constraint on when this may be passed.
  gameContext?: { gdid: number; ply: number; san: string }
}): Promise<boolean> {
  // tpose_positions_eval deliberately never caches opening theory (moves 1..MIN_ANALYSIS_MOVE_Player-1) —
  // checked here, centrally, so every caller gets this exclusion automatically rather than
  // each write-back site needing to remember it. The FEN's own fullmove-counter field (6th
  // token) is used directly, same "derive from the FEN itself" pattern as pos_color/pos_move_num
  // in getOrCreatePosition.
  const moveNum = parseInt(data.fen.split(' ')[5] ?? '', 10)
  if (Number.isFinite(moveNum) && moveNum < MIN_ANALYSIS_MOVE_Player) return false

  const truncated = truncateFen(data.fen)
  const posResult = await table_query({
    caller: 'upgradePositionEvaluation_lookup',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncated],
    skipCache: true
  })
  if (!posResult.ok) {
    write_logging({
      lg_functionname: 'upgradePositionEvaluation_shared',
      lg_caller: 'upgradePositionEvaluation_lookup',
      lg_msg: 'Failed to look up position ' + truncated + ': ' + posResult.error,
      lg_severity: 'E'
    })
    return false
  }
  let posId = posResult.data[0]?.pos_id as number | undefined
  if (!posId) {
    if (!data.createIfMissing) return false
    posId = await getOrCreatePosition(truncated)
  }

  const depthGuard = data.force ? '' : 'WHERE tpose_positions_eval.pose_depth < EXCLUDED.pose_depth'
  const updatedResult = await table_query({
    caller: 'upgradePositionEvaluation_update',
    table: 'tpose_positions_eval',
    query: `
      INSERT INTO tpose_positions_eval (pose_pos_id, pose_cp, pose_best_move, pose_depth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (pose_pos_id) DO UPDATE
        SET pose_cp = EXCLUDED.pose_cp, pose_best_move = EXCLUDED.pose_best_move, pose_depth = EXCLUDED.pose_depth
        ${depthGuard}
      RETURNING pose_pos_id
    `,
    params: [posId, data.cp, data.bestMove, data.depth],
    isupdate: true
  })
  if (!updatedResult.ok) {
    write_logging({
      lg_functionname: 'upgradePositionEvaluation_shared',
      lg_caller: 'upgradePositionEvaluation_update',
      lg_msg: 'Failed to upsert position evaluation for pos_id ' + posId + ': ' + updatedResult.error,
      lg_severity: 'E'
    })
    return false
  }
  if (updatedResult.data.length === 0) return false

  await table_query({
    caller: 'upgradePositionEvaluation_recompute_cp_change',
    table: 'tgam_game_positions',
    query: `
      UPDATE tgam_game_positions gp
      SET gam_cp_change =
        CASE WHEN p.pos_color = 'w'
          THEN e_after.pose_cp  - e_before.pose_cp
          ELSE e_before.pose_cp - e_after.pose_cp
        END
      FROM tpos_positions p,
           tpose_positions_eval e_before,
           tpose_positions_eval e_after
      WHERE gp.gam_pos_id          = p.pos_id
        AND e_before.pose_pos_id    = gp.gam_pos_id
        AND e_after.pose_pos_id     = gp.gam_resulting_pos_id
        AND gp.gam_resulting_pos_id IS NOT NULL
        AND e_before.pose_cp IS NOT NULL
        AND e_after.pose_cp  IS NOT NULL
        AND (gp.gam_pos_id = $1 OR gp.gam_resulting_pos_id = $1)
    `,
    params: [posId],
    isupdate: true
  })

  if (data.gameContext) {
    const gameContextDepthGuard = data.force ? '' : 'WHERE tgev_game_evals.gev_depth < EXCLUDED.gev_depth'
    await table_query({
      caller: 'upgradePositionEvaluation_gev_upsert',
      table: 'tgev_game_evals',
      query: `
        INSERT INTO tgev_game_evals (gev_gdid, gev_ply, gev_san, gev_fen_after, gev_cp, gev_depth, gev_cp_change)
        VALUES ($1, $2::smallint, $3, $4, $5, $6,
          CASE WHEN $2 % 2 = 0
            THEN $5 - COALESCE((SELECT gev_cp FROM tgev_game_evals WHERE gev_gdid = $1 AND gev_ply = $2 - 1), 0)
            ELSE COALESCE((SELECT gev_cp FROM tgev_game_evals WHERE gev_gdid = $1 AND gev_ply = $2 - 1), 0) - $5
          END)
        ON CONFLICT (gev_gdid, gev_ply) DO UPDATE
          SET gev_cp = EXCLUDED.gev_cp, gev_depth = EXCLUDED.gev_depth, gev_cp_change = EXCLUDED.gev_cp_change
          ${gameContextDepthGuard}
      `,
      params: [data.gameContext.gdid, data.gameContext.ply, data.gameContext.san, truncated, data.cp, data.depth],
      isupdate: true
    })
  }

  const cascadeDepthGuard = data.force ? '' : 'AND m.gev_depth < $2'
  await table_query({
    caller: 'upgradePositionEvaluation_cascade_tgev',
    table: 'tgev_game_evals',
    query: `
      UPDATE tgev_game_evals t
      SET gev_cp = $1,
          gev_depth = $2,
          gev_cp_change = CASE
            WHEN m.gev_ply % 2 = 0 THEN $1 - COALESCE(prev.gev_cp, 0)
            ELSE COALESCE(prev.gev_cp, 0) - $1
          END
      FROM (SELECT gev_gdid, gev_ply, gev_depth FROM tgev_game_evals WHERE gev_fen_after = $3) AS m
      LEFT JOIN tgev_game_evals prev ON prev.gev_gdid = m.gev_gdid AND prev.gev_ply = m.gev_ply - 1
      WHERE t.gev_gdid = m.gev_gdid AND t.gev_ply = m.gev_ply ${cascadeDepthGuard}
    `,
    params: [data.cp, data.depth, truncated],
    isupdate: true
  })

  cache_clearTable('tpose_positions_eval', 'upgradePositionEvaluation_shared')
  cache_clearTable('tgam_game_positions', 'upgradePositionEvaluation_shared')
  cache_clearTable('tgev_game_evals', 'upgradePositionEvaluation_shared')

  return true
}

//----------------------------------------------------------------------------------
//  getPositionEvaluationsBulk_shared — batched tpose_positions_eval lookup for a list
//  of FENs, keyed by truncated FEN (matching every other position lookup in this
//  file). Used by runAnalysis() to skip re-running Stockfish on positions already
//  cached deep enough, instead of one lookup per position.
//----------------------------------------------------------------------------------
export async function getPositionEvaluationsBulk_shared(fens: string[]): Promise<Record<string, { cp: number; bestMove: string | null; depth: number }>> {
  const truncated = fens.map(truncateFen)
  const queryResult = await table_query({
    caller: 'getPositionEvaluationsBulk_shared',
    table: 'tpose_positions_eval',
    query: `
      SELECT p.pos_fen, e.pose_cp, e.pose_best_move, e.pose_depth
      FROM tpos_positions p
      JOIN tpose_positions_eval e ON e.pose_pos_id = p.pos_id
      WHERE p.pos_fen = ANY($1) AND e.pose_cp IS NOT NULL AND e.pose_depth IS NOT NULL
    `,
    // table_query's params type doesn't declare array elements (needed for = ANY($1)),
    // even though the underlying driver handles them fine — narrow cast, not a real risk
    params: [truncated] as unknown as string[]
  })
  if (!queryResult.ok) {
    write_logging({
      lg_functionname: 'getPositionEvaluationsBulk_shared',
      lg_caller: 'getPositionEvaluationsBulk_shared',
      lg_msg: 'Failed to fetch bulk position evaluations: ' + queryResult.error,
      lg_severity: 'E'
    })
    return {}
  }
  const rows = queryResult.data as { pos_fen: string; pose_cp: number; pose_best_move: string | null; pose_depth: number }[]

  const result: Record<string, { cp: number; bestMove: string | null; depth: number }> = {}
  for (const row of rows) {
    result[row.pos_fen] = { cp: row.pose_cp, bestMove: row.pose_best_move, depth: row.pose_depth }
  }
  return result
}
