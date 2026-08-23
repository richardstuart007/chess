'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { truncateFen } from '../fen'

const MASTER_POSITIONS_TABLE = 'tmps_masterpositions'

export interface MasterMoveRow {
  move_played: string
  move_uci:    string | null
  mov_times:   number
  mov_wins:    number
  mov_losses:  number
}

//----------------------------------------------------------------------------------
//  getMasterMovesForPosition — every move played by a synced master player from an
//  exact position, aggregated from tmgp_mastergamepositions. Single-query join within
//  the secondary database only — never reaches into the primary database (tmst_
//  master_players), so the no-cross-database-join constraint never applies here.
//  Optional player filter narrows to one master player's own games once more than one
//  is synced; omitted for now (POC has only Magnus Carlsen).
//----------------------------------------------------------------------------------
export async function getMasterMovesForPosition(fen: string, player?: string): Promise<MasterMoveRow[]> {
  const params: string[] = [truncateFen(fen)]
  const playerFilter = player ? `AND d.mgd_player = $2` : ''
  if (player) params.push(player.toLowerCase())

  const result = await table_query({
    caller: 'getMasterMovesForPosition',
    table: MASTER_POSITIONS_TABLE,
    query: `
      SELECT sub.move_played, sub.move_uci, sub.mov_times, sub.mov_wins, sub.mov_losses
      FROM (
        SELECT
          gp.mgp_move_played                                    AS move_played,
          gp.mgp_move_uci                                       AS move_uci,
          COUNT(*)::int                                         AS mov_times,
          COUNT(*) FILTER (WHERE d.mgd_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE d.mgd_player_result = 'loss')::int AS mov_losses
        FROM tmps_masterpositions p
        JOIN tmgp_mastergamepositions gp ON gp.mgp_pos_id = p.mps_id
        JOIN tmgd_mastergamesdecon d ON d.mgd_mgdid = gp.mgp_mgdid
        WHERE p.mps_fen = $1
          AND gp.mgp_move_num > 0
          ${playerFilter}
        GROUP BY gp.mgp_move_played, gp.mgp_move_uci
      ) sub
      ORDER BY sub.mov_times DESC
    `,
    params
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterMovesForPosition',
      lg_caller: 'getMasterMovesForPosition',
      lg_msg: 'Failed to fetch master moves for position: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data as MasterMoveRow[]
}
