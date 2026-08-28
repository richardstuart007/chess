'use server'

// ============================================================================
// Analysis DB helpers — master-only: every function here is scoped to one
// tracked master's own synced games (tmgam_game_positions/tmgd_gamesdecon
// joins, filtered by mgd_player), querying the secondary database. Mirrors
// chessdb_player.ts's move/game-position functions exactly, translated to the
// tm*-prefixed tables — see chessdb_shared.ts for the position/eval functions
// used by both player and master analysis.
//
// tpose_positions_eval (the Stockfish eval cache) lives in the PRIMARY
// database, while tmpos_positions/tmgam_game_positions/tmgd_gamesdecon live
// in the SECONDARY database — so unlike chessdb_player.ts's single-query SQL
// joins, getMoveSummaryForPosition_master resolves eval data as a second,
// separate step (via chessdb_shared.ts's getPositionEvaluationsBulk_shared),
// merged in by FEN — the same two-step shape masterGamesList.ts's
// getMasterGameEvals_master already uses.
// ============================================================================

import { table_query }  from 'nextjs-shared/table_query'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalRows } from 'nextjs-shared/fetchTotalRows'
import type { Filter, JoinParams } from 'nextjs-shared/structures'
import { write_logging } from 'nextjs-shared/write_logging'
import { truncateFen }  from '../fen'
import { getPositionEvaluationsBulk_shared } from './chessdb_shared'

export interface MasterMoveRow {
  move_played: string
  move_uci:    string | null
  mov_times:   number
  mov_wins:    number
  mov_losses:  number
  pose_cp:     number | null
  pose_depth:  number | null
}

//----------------------------------------------------------------------------------
//  getMovePlayCounts_master — how many times each move was played from a set of
//  positions by one master, one round trip. Keyed by the same truncated FEN
//  tmpos_positions.mpos_fen stores, so callers must truncate their own FEN
//  lookups the same way before matching keys. Mirrors
//  getMovePlayCounts_player exactly, against the secondary database's tm*
//  tables.
//----------------------------------------------------------------------------------
export async function getMovePlayCounts_master(fens: string[], masterPlayer: string): Promise<Record<string, Record<string, number>>> {
  const uniqueFens = [...new Set(fens.map(truncateFen))]
  if (uniqueFens.length === 0) return {}

  const params: (string | number)[] = []
  const fenPlaceholders = uniqueFens
    .map(f => { params.push(f); return `$${params.length}` })
    .join(', ')
  params.push(masterPlayer.toLowerCase())
  const playerPlaceholder = `$${params.length}`

  const queryResult = await table_query({
    caller: 'getMovePlayCounts_master',
    table: 'tmpos_positions',
    query: `
      SELECT p.mpos_fen, gp.mgam_move_played, COUNT(*)::int AS times
      FROM tmpos_positions p
      JOIN tmgam_game_positions gp ON gp.mgam_pos_id = p.mpos_id
      JOIN tmgd_gamesdecon d ON d.mgd_mgdid = gp.mgam_mgdid
      WHERE p.mpos_fen IN (${fenPlaceholders})
        AND gp.mgam_move_num > 0
        AND d.mgd_player = ${playerPlaceholder}
      GROUP BY p.mpos_fen, gp.mgam_move_played
    `,
    params
  })
  if (!queryResult.ok) {
    write_logging({
      lg_functionname: 'getMovePlayCounts_master',
      lg_caller: 'getMovePlayCounts_master',
      lg_msg: 'Failed to fetch move play counts: ' + queryResult.error,
      lg_severity: 'E'
    })
    return {}
  }
  const rows = queryResult.data as { mpos_fen: string; mgam_move_played: string; times: number }[]

  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!result[row.mpos_fen]) result[row.mpos_fen] = {}
    result[row.mpos_fen][row.mgam_move_played] = Number(row.times)
  }
  return result
}

//----------------------------------------------------------------------------------
//  getMoveSummaryForPosition_master — one row per move played from this exact
//  position, scoped to the given master. Mirrors
//  getMoveSummaryForPosition_player's shape, but as two steps instead of one
//  SQL join — see the file header for why: (1) the move/count/win/loss
//  group-by query against the secondary database, returning each move's
//  resulting FEN; (2) a bulk eval lookup against the primary database, merged
//  in by FEN.
//----------------------------------------------------------------------------------
export async function getMoveSummaryForPosition_master(fen: string, masterPlayer: string): Promise<MasterMoveRow[]> {
  const result = await table_query({
    caller: 'getMoveSummaryForPosition_master',
    table: 'tmpos_positions',
    query: `
      SELECT
        gp.mgam_move_played                                   AS move_played,
        gp.mgam_move_uci                                      AS move_uci,
        COUNT(*)::int                                         AS mov_times,
        COUNT(*) FILTER (WHERE d.mgd_player_result = 'win')::int  AS mov_wins,
        COUNT(*) FILTER (WHERE d.mgd_player_result = 'loss')::int AS mov_losses,
        MAX(gp.mgam_resulting_fen)                            AS resulting_fen
      FROM tmpos_positions p
      JOIN tmgam_game_positions gp ON gp.mgam_pos_id = p.mpos_id
      JOIN tmgd_gamesdecon d ON d.mgd_mgdid = gp.mgam_mgdid
      WHERE p.mpos_fen = $1
        AND gp.mgam_move_num > 0
        AND d.mgd_player = $2
      GROUP BY gp.mgam_move_played, gp.mgam_move_uci
      ORDER BY mov_times DESC
    `,
    params: [truncateFen(fen), masterPlayer.toLowerCase()]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMoveSummaryForPosition_master',
      lg_caller: 'getMoveSummaryForPosition_master',
      lg_msg: 'Failed to fetch move summary for position: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  const rows = result.data as { move_played: string; move_uci: string | null; mov_times: number; mov_wins: number; mov_losses: number; resulting_fen: string | null }[]

  const resultingFens = rows.map(r => r.resulting_fen).filter((f): f is string => f != null)
  const poseEvals = await getPositionEvaluationsBulk_shared(resultingFens)

  return rows.map(r => {
    const pose = r.resulting_fen ? poseEvals[truncateFen(r.resulting_fen)] : undefined
    return {
      move_played: r.move_played,
      move_uci:    r.move_uci,
      mov_times:   r.mov_times,
      mov_wins:    r.mov_wins,
      mov_losses:  r.mov_losses,
      pose_cp:     pose?.cp ?? null,
      pose_depth:  pose?.depth ?? null
    }
  })
}

export interface MasterPositionGameHit {
  player:         string
  move_played:    string
  move_num:       number | null
  playerResult:   string | null
  mgdid:          number | null
  date:           string | null
  opponentRating: number | null
  termination:    string | null
}

//
//  Shared join/filter shape for fetchGamesForPosition_master/getGamesForPositionCount_master
//  — the exact same Filter[] must drive both, or the reported total and the fetched
//  page disagree. Mirrors chessdb_player.ts's POSITION_GAMES_JOINS/buildPositionGamesFilters.
//
const MASTER_POSITION_GAMES_JOINS: JoinParams[] = [
  { table: 'tmgam_game_positions', on: 'mgam_pos_id = mpos_id' },
  { table: 'tmgd_gamesdecon', on: 'mgd_mgdid = mgam_mgdid' }
]

function buildMasterPositionGamesFilters(fen: string, masterPlayer: string, move?: string): Filter[] {
  const filters: Filter[] = [
    { column: 'mpos_fen', operator: '=', value: truncateFen(fen) },
    { column: 'mgam_move_num', operator: '>', value: 0 },
    { column: 'mgd_player', operator: '=', value: masterPlayer.toLowerCase() }
  ]
  if (move) filters.push({ column: 'mgam_move_played', operator: '=', value: move })
  return filters
}

function mapMasterPositionGameRow(r: any): MasterPositionGameHit {
  return {
    player:         r.mgd_player,
    move_played:    r.mgam_move_played,
    move_num:       r.mgam_move_num != null ? Number(r.mgam_move_num) : null,
    playerResult:   r.mgd_player_result ?? null,
    mgdid:          r.mgd_mgdid != null ? Number(r.mgd_mgdid) : null,
    date:           r.mgd_end_time != null ? new Date(Number(r.mgd_end_time) * 1000).toISOString().slice(0, 10) : null,
    opponentRating: r.mgd_opponent_rating != null ? Number(r.mgd_opponent_rating) : null,
    termination:    r.mgd_termination ?? null
  }
}

//----------------------------------------------------------------------------------
//  fetchGamesForPosition_master — one page of the given master's games that reached
//  this exact position, optionally narrowed (server-side) to games where a specific
//  move was played next. Mirrors fetchGamesForPosition_player exactly, against the
//  secondary database's tm* tables. No finalEval/resultMismatch fields — master has
//  no equivalent of gd_final_eval (see PLAN_master-game-view-parity for why).
//----------------------------------------------------------------------------------
export async function fetchGamesForPosition_master(
  fen: string,
  masterPlayer: string,
  page: number,
  itemsPerPage: number,
  move?: string
): Promise<MasterPositionGameHit[]> {
  const offset = (page - 1) * itemsPerPage
  const result = await fetchFiltered({
    table: 'tmpos_positions',
    joins: MASTER_POSITION_GAMES_JOINS,
    filters: buildMasterPositionGamesFilters(fen, masterPlayer, move),
    orderBy: 'mgd_end_time DESC',
    limit: itemsPerPage,
    offset,
    caller: 'fetchGamesForPosition_master'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'fetchGamesForPosition_master',
      lg_caller: 'fetchGamesForPosition_master',
      lg_msg: 'Failed to fetch games for position: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data.map(mapMasterPositionGameRow)
}

//----------------------------------------------------------------------------------
//  getGamesForPositionCount_master — total row count for
//  fetchGamesForPosition_master's same filter set
//----------------------------------------------------------------------------------
export async function getGamesForPositionCount_master(fen: string, masterPlayer: string, move?: string): Promise<number> {
  const result = await fetchTotalRows({
    table: 'tmpos_positions',
    joins: MASTER_POSITION_GAMES_JOINS,
    filters: buildMasterPositionGamesFilters(fen, masterPlayer, move),
    caller: 'getGamesForPositionCount_master'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getGamesForPositionCount_master',
      lg_caller: 'getGamesForPositionCount_master',
      lg_msg: 'Failed to fetch games count for position: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}
