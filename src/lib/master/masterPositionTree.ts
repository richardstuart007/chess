'use server'

import { Chess } from 'chess.js'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { cache_clearTable } from 'nextjs-shared/userCache_store'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep } from '../actions/pipelineLog'
import { logStart, logEnd } from '../logStep'
import { MASTER_MIN_ANALYSIS_MOVE, MASTER_MAX_ANALYSIS_MOVE, MASTER_POSITION_INSERT_CHUNK_SIZE, PIPELINE_TYPE_MASTERGAMES } from '../constants'
import { truncateFen } from '../fen'

const MASTER_DECON_TABLE = 'tmgd_mastergamesdecon'
const MASTER_POSITIONS_TABLE = 'tmps_masterpositions'
const MASTER_GAME_POSITIONS_TABLE = 'tmgp_mastergamepositions'

interface MasterGameRecord {
  mgdid: number
  pgn:   string
}

interface MasterPositionRecord {
  mgdid:        number
  posFen:       string
  movePlayed:   string
  moveUci:      string | null
  resultingFen: string | null
  moveNum:      number
}

//----------------------------------------------------------------------------------
//  getMasterPositionsFromGame — pure chess.js, no DB. Mirrors buildPositionTree's
//  getPositionsFromGame, scoped to MASTER_MIN_ANALYSIS_MOVE/MASTER_MAX_ANALYSIS_MOVE.
//  No "too short" sentinel — this POC always does a full truncate+rebuild, so there's
//  no NOT EXISTS resumability to preserve.
//----------------------------------------------------------------------------------
function getMasterPositionsFromGame(
  game: MasterGameRecord,
  minHalfMove: number,
  maxHalfMove: number
): MasterPositionRecord[] {
  if (!game.pgn) return []

  const chess = new Chess()
  try { chess.loadPgn(game.pgn) } catch { return [] }

  const history = chess.history({ verbose: true })
  const replay  = new Chess()
  const records: MasterPositionRecord[] = []

  for (let i = 0; i < Math.min(history.length, maxHalfMove); i++) {
    const fen  = truncateFen(replay.fen())
    const move = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    const moveNum = Math.ceil((i + 1) / 2)
    replay.move(move.san)
    const resultingFen = truncateFen(replay.fen())

    if (i >= minHalfMove) {
      records.push({
        mgdid:        game.mgdid,
        posFen:       fen,
        movePlayed:   move.san,
        moveUci,
        resultingFen,
        moveNum
      })
    }
  }

  return records
}

//----------------------------------------------------------------------------------
//  buildMasterPositionTree — POC scope: full truncate-and-rebuild of
//  tmgp_mastergamepositions/tmps_masterpositions from every tmgd_mastergamesdecon row
//  for one master player. Admin-triggered rebuild (via the /owner/mastergames POC
//  page), not an ordinary app request path — the table_truncate use case its own docs
//  call out. Safe to re-run any time; always reflects exactly what's currently in
//  tmgd_mastergamesdecon for this player.
//----------------------------------------------------------------------------------
export async function buildMasterPositionTree(
  chesscomHandle: string,
  level: number = 1,
  forceNewRun?: boolean
): Promise<{ gamesProcessed: number; positions: number; gamePositions: number }> {
  const player = chesscomHandle.toLowerCase()
  await logStart('buildMasterPositionTree', 'masterGamesPipelineRoute', `building master position tree for ${player}`, level)
  const t0 = Date.now()
  const minHalfMove = (MASTER_MIN_ANALYSIS_MOVE - 1) * 2
  const maxHalfMove = MASTER_MAX_ANALYSIS_MOVE * 2

  const gamesResult = await table_fetch({
    caller: 'buildMasterPositionTree',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_player', value: player }],
    columns: ['mgd_mgdid', 'mgd_pgn'],
    skipCache: true
  })
  if (!gamesResult.ok) {
    write_logging({
      lg_functionname: 'buildMasterPositionTree',
      lg_caller: 'buildMasterPositionTree',
      lg_msg: 'Failed to fetch master decon games for ' + player + ': ' + gamesResult.error,
      lg_severity: 'E'
    })
    await logEnd('buildMasterPositionTree', 'masterGamesPipelineRoute', 'failed to fetch decon games', level)
    return { gamesProcessed: 0, positions: 0, gamePositions: 0 }
  }
  const games: MasterGameRecord[] = gamesResult.data.map((r: any) => ({ mgdid: r.mgd_mgdid, pgn: r.mgd_pgn ?? '' }))

  const truncateGamePositionsResult = await table_truncate(MASTER_GAME_POSITIONS_TABLE, 'buildMasterPositionTree', true)
  const truncatePositionsResult = await table_truncate(MASTER_POSITIONS_TABLE, 'buildMasterPositionTree', true)
  if (!truncateGamePositionsResult.ok || !truncatePositionsResult.ok) {
    write_logging({
      lg_functionname: 'buildMasterPositionTree',
      lg_caller: 'buildMasterPositionTree',
      lg_msg: 'Failed to truncate master position tables: ' +
        [truncateGamePositionsResult, truncatePositionsResult].filter(r => !r.ok).map(r => r.error).join('; '),
      lg_severity: 'E'
    })
    await logEnd('buildMasterPositionTree', 'masterGamesPipelineRoute', 'failed to truncate tables', level)
    return { gamesProcessed: games.length, positions: 0, gamePositions: 0 }
  }
  cache_clearTable(MASTER_GAME_POSITIONS_TABLE, 'buildMasterPositionTree')
  cache_clearTable(MASTER_POSITIONS_TABLE, 'buildMasterPositionTree')

  const allRecords: MasterPositionRecord[] = []
  for (const game of games) {
    allRecords.push(...getMasterPositionsFromGame(game, minHalfMove, maxHalfMove))
  }

  for (let start = 0; start < allRecords.length; start += MASTER_POSITION_INSERT_CHUNK_SIZE) {
    const chunk = allRecords.slice(start, start + MASTER_POSITION_INSERT_CHUNK_SIZE)
    const values = chunk.map((_, i) => {
      const b = i * 6
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`
    }).join(',')
    const params = chunk.flatMap(r => [r.mgdid, r.posFen, r.movePlayed, r.moveUci, r.resultingFen, r.moveNum])
    const insertResult = await table_query({
      caller: 'buildMasterPositionTree_insertGamePositions',
      table: MASTER_GAME_POSITIONS_TABLE,
      query: `
        INSERT INTO ${MASTER_GAME_POSITIONS_TABLE}
          (mgp_mgdid, mgp_pos_fen, mgp_move_played, mgp_move_uci, mgp_resulting_fen, mgp_move_num)
        VALUES ${values}
      `,
      params,
      isupdate: true
    })
    if (!insertResult.ok) {
      write_logging({
        lg_functionname: 'buildMasterPositionTree',
        lg_caller: 'buildMasterPositionTree_insertGamePositions',
        lg_msg: 'Failed to insert master game-position rows: ' + insertResult.error,
        lg_severity: 'E'
      })
      await logEnd('buildMasterPositionTree', 'masterGamesPipelineRoute', 'failed to insert game-position rows', level)
      return { gamesProcessed: games.length, positions: 0, gamePositions: 0 }
    }
  }

  const ensureResult = await table_query({
    caller: 'buildMasterPositionTree_ensurePositions',
    table: MASTER_POSITIONS_TABLE,
    query: `
      INSERT INTO ${MASTER_POSITIONS_TABLE} (mps_fen, mps_color, mps_move_num, mps_reached)
      SELECT DISTINCT fen, split_part(fen, ' ', 2), NULL::integer, 0 FROM (
        SELECT mgp_pos_fen AS fen FROM ${MASTER_GAME_POSITIONS_TABLE} WHERE mgp_pos_fen IS NOT NULL
        UNION
        SELECT mgp_resulting_fen AS fen FROM ${MASTER_GAME_POSITIONS_TABLE} WHERE mgp_resulting_fen IS NOT NULL
      ) t
      ON CONFLICT (mps_fen) DO NOTHING
    `,
    params: [],
    isupdate: true
  })
  if (!ensureResult.ok) {
    write_logging({
      lg_functionname: 'buildMasterPositionTree',
      lg_caller: 'buildMasterPositionTree_ensurePositions',
      lg_msg: 'Failed to ensure master positions: ' + ensureResult.error,
      lg_severity: 'E'
    })
    await logEnd('buildMasterPositionTree', 'masterGamesPipelineRoute', 'failed to ensure master positions', level)
    return { gamesProcessed: games.length, positions: 0, gamePositions: allRecords.length }
  }

  await table_query({
    caller: 'buildMasterPositionTree_backfillPosId',
    table: MASTER_GAME_POSITIONS_TABLE,
    query: `
      UPDATE ${MASTER_GAME_POSITIONS_TABLE} g
      SET mgp_pos_id = p.mps_id
      FROM ${MASTER_POSITIONS_TABLE} p
      WHERE g.mgp_pos_fen = p.mps_fen
    `,
    params: [],
    isupdate: true
  })

  await table_query({
    caller: 'buildMasterPositionTree_backfillResultingPosId',
    table: MASTER_GAME_POSITIONS_TABLE,
    query: `
      UPDATE ${MASTER_GAME_POSITIONS_TABLE} g
      SET mgp_resulting_pos_id = p.mps_id
      FROM ${MASTER_POSITIONS_TABLE} p
      WHERE g.mgp_resulting_fen = p.mps_fen
    `,
    params: [],
    isupdate: true
  })

  await table_query({
    caller: 'buildMasterPositionTree_recomputeReached',
    table: MASTER_POSITIONS_TABLE,
    query: `
      UPDATE ${MASTER_POSITIONS_TABLE} p
      SET mps_reached = (
        SELECT COUNT(DISTINCT mgp_mgdid) FROM ${MASTER_GAME_POSITIONS_TABLE}
        WHERE mgp_pos_id = p.mps_id AND mgp_move_num > 0
      ),
      mps_move_num = (
        SELECT MIN(mgp_move_num) FROM ${MASTER_GAME_POSITIONS_TABLE} WHERE mgp_pos_id = p.mps_id
      )
    `,
    params: [],
    isupdate: true
  })

  const positionsCountResult = await table_query({
    caller: 'buildMasterPositionTree_count',
    table: MASTER_POSITIONS_TABLE,
    query: `SELECT COUNT(*) AS cnt FROM ${MASTER_POSITIONS_TABLE}`,
    params: [],
    skipCache: true
  })
  if (!positionsCountResult.ok) {
    write_logging({
      lg_functionname: 'buildMasterPositionTree',
      lg_caller: 'buildMasterPositionTree_count',
      lg_msg: 'Failed to count master positions: ' + positionsCountResult.error,
      lg_severity: 'E'
    })
  }
  const positions = positionsCountResult.ok ? parseInt(positionsCountResult.data[0]?.cnt ?? '0') : 0

  write_logging({
    lg_functionname: 'buildMasterPositionTree',
    lg_caller: 'buildMasterPositionTree',
    lg_msg: `${player}: ${games.length} games processed, ${positions} positions, ${allRecords.length} game-positions`,
    lg_severity: 'I'
  })

  await logPipelineStep({
    step: 3, subStep: 'a', stepName: 'Build Master Position Tree', pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: MASTER_DECON_TABLE, inputRecs: games.length,
    outputTable: MASTER_POSITIONS_TABLE, outputRecs: positions,
    durationMs: Date.now() - t0, forceNewRun
  })
  await logEnd('buildMasterPositionTree', 'masterGamesPipelineRoute', `${games.length} games processed, ${positions} positions`, level)

  return { gamesProcessed: games.length, positions, gamePositions: allRecords.length }
}
