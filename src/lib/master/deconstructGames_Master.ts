'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { write_logging } from 'nextjs-shared/write_logging'
import { parsePgnHeaders, parsePgnOpening, countMoves, normalizeTermination } from '../parsePgn'
import { upsertEcoReference } from '../actions/deconstructGames_Player'
import { logStart, logEnd } from '../logStep'
import { MIN_ANALYSIS_MOVE_Master } from '../constants'

const MASTER_RAW_TABLE = 'wk_mgr_gamesraw'
const MASTER_DECON_TABLE = 'tmgd_gamesdecon'

//
//  A game with fewer half-moves than this can never produce a trackable position
//  (buildPositionTree_Master's analysis window starts at MIN_ANALYSIS_MOVE_Master) —
//  mirrors deconstruct.ts's MIN_TRACKABLE_HALF_MOVES, own constant since master and
//  player pipelines never share tuning values.
//
const MASTER_MIN_TRACKABLE_HALF_MOVES = (MIN_ANALYSIS_MOVE_Master - 1) * 2

//----------------------------------------------------------------------------------
//  deconstructGames_Master — processes every wk_mgr_gamesraw row (every player,
//  no filter) not yet in tmgd_gamesdecon (matched on mgd_chesscom_uuid alone —
//  globally unique across chess.com, no player qualifier needed). Called internally
//  by syncMasterGames right after each player's own download — never a standalone
//  pipeline step, so (mirroring deconstructGames_Player) it does not log its own
//  logPipelineStep entry; the caller does. Reads/writes the master-games tables
//  (secondary database) — tec_ecoreference stays shared in the primary database,
//  reused via upsertEcoReference unchanged.
//----------------------------------------------------------------------------------
export async function deconstructGames_Master(
  level: number = 1
): Promise<{ processed: number; skipped: number; errors: number; rawScanned: number }> {
  await logStart('deconstructGames_Master', 'masterGamesPipelineRoute', 'deconstructing all outstanding raw games', level)

  const rawResult = await table_fetch({
    caller: 'deconstructGames_Master',
    table: MASTER_RAW_TABLE,
    skipCache: true
  })
  if (!rawResult.ok) {
    write_logging({
      lg_functionname: 'deconstructGames_Master',
      lg_caller: 'deconstructGames_Master',
      lg_msg: 'Failed to fetch master raw games: ' + rawResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructGames_Master', 'masterGamesPipelineRoute', 'failed to fetch raw games', level)
    return { processed: 0, skipped: 0, errors: 0, rawScanned: 0 }
  }

  const existingResult = await table_fetch({
    caller: 'deconstructGames_Master_existing',
    table: MASTER_DECON_TABLE,
    columns: ['mgd_chesscom_uuid'],
    skipCache: true
  })
  if (!existingResult.ok) {
    write_logging({
      lg_functionname: 'deconstructGames_Master',
      lg_caller: 'deconstructGames_Master_existing',
      lg_msg: 'Failed to fetch existing master decon rows: ' + existingResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructGames_Master', 'masterGamesPipelineRoute', 'failed to fetch existing decon rows', level)
    return { processed: 0, skipped: 0, errors: 0, rawScanned: 0 }
  }
  const existingUuids = new Set(existingResult.data.map((r: any) => r.mgd_chesscom_uuid))

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rawResult.data) {
    if (existingUuids.has(row.mgr_chesscom_uuid)) continue
    try {
      const rawData = typeof row.mgr_raw_data === 'string'
        ? JSON.parse(row.mgr_raw_data)
        : row.mgr_raw_data

      const pgn = rawData.pgn
      if (!pgn) {
        skipped++
        continue
      }

      if (countMoves(pgn) <= MASTER_MIN_TRACKABLE_HALF_MOVES) {
        skipped++
        continue
      }

      const headers = parsePgnHeaders(pgn)
      const player = row.mgr_player

      const whiteUsername = (rawData.white?.username ?? '').toLowerCase()
      const blackUsername = (rawData.black?.username ?? '').toLowerCase()
      const isWhite = whiteUsername === player
      const playerColor = isWhite ? 'white' : 'black'

      const playerSide = isWhite ? rawData.white : rawData.black
      const opponentSide = isWhite ? rawData.black : rawData.white
      let playerResult = 'draw'
      if (playerSide?.result === 'win') playerResult = 'win'
      else if (opponentSide?.result === 'win') playerResult = 'loss'

      const writeResult = await table_write({
        caller: 'deconstructGames_Master',
        table: MASTER_DECON_TABLE,
        columnValuePairs: [
          { column: 'mgd_white_username', value: whiteUsername },
          { column: 'mgd_black_username', value: blackUsername },
          { column: 'mgd_white_rating', value: rawData.white?.rating ?? 0 },
          { column: 'mgd_black_rating', value: rawData.black?.rating ?? 0 },
          { column: 'mgd_player', value: player },
          { column: 'mgd_player_color', value: playerColor },
          { column: 'mgd_player_result', value: playerResult },
          { column: 'mgd_opponent_username', value: isWhite ? blackUsername : whiteUsername },
          { column: 'mgd_opponent_rating', value: (isWhite ? rawData.black?.rating : rawData.white?.rating) ?? 0 },
          { column: 'mgd_time_class', value: rawData.time_class ?? '' },
          { column: 'mgd_time_control', value: headers.timeControl },
          { column: 'mgd_is_rated', value: rawData.rated ?? true },
          { column: 'mgd_termination', value: normalizeTermination(headers.termination) },
          { column: 'mgd_end_time', value: row.mgr_end_time },
          { column: 'mgd_eco_code', value: headers.eco },
          { column: 'mgd_opening_name', value: headers.openingName },
          { column: 'mgd_game_url', value: rawData.url ?? '' },
          { column: 'mgd_opening_moves', value: parsePgnOpening(pgn) },
          { column: 'mgd_pgn', value: pgn },
          { column: 'mgd_chesscom_uuid', value: row.mgr_chesscom_uuid }
        ],
        skipCache: true
      })
      if (!writeResult.ok) {
        write_logging({
          lg_functionname: 'deconstructGames_Master',
          lg_caller: 'deconstructGames_Master',
          lg_msg: 'Failed to write master decon row for ' + row.mgr_chesscom_uuid + ': ' + writeResult.error,
          lg_severity: 'E'
        })
        errors++
        continue
      }

      if (headers.eco && headers.openingName) {
        await upsertEcoReference(headers.eco, headers.openingName)
      }

      processed++
    } catch (err) {
      write_logging({
        lg_functionname: 'deconstructGames_Master',
        lg_caller: 'deconstructGames_Master',
        lg_msg: `Error deconstructing master game ${row.mgr_chesscom_uuid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  write_logging({
    lg_functionname: 'deconstructGames_Master',
    lg_caller: 'deconstructGames_Master',
    lg_msg: `${processed} ${MASTER_DECON_TABLE} rows inserted, ${skipped} skipped, ${errors} errors`,
    lg_severity: 'I'
  })

  await logEnd('deconstructGames_Master', 'masterGamesPipelineRoute', `${processed} processed, ${skipped} skipped, ${errors} errors`, level)

  return { processed, skipped, errors, rawScanned: rawResult.data.length }
}
