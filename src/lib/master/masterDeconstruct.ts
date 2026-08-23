'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { write_logging } from 'nextjs-shared/write_logging'
import { parsePgnHeaders, parsePgnOpening, countMoves, normalizeTermination } from '../parsePgn'
import { upsertEcoReference } from '../actions/deconstruct'
import { logPipelineStep } from '../actions/pipelineLog'
import { logStart, logEnd } from '../logStep'
import { MASTER_MIN_ANALYSIS_MOVE, PIPELINE_TYPE_MASTERGAMES } from '../constants'

const MASTER_RAW_TABLE = 'tmgr_mastergamesraw'
const MASTER_DECON_TABLE = 'tmgd_mastergamesdecon'

//
//  A game with fewer half-moves than this can never produce a trackable position
//  (buildMasterPositionTree's analysis window starts at MASTER_MIN_ANALYSIS_MOVE) —
//  mirrors deconstruct.ts's MIN_TRACKABLE_HALF_MOVES, own constant since master and
//  player pipelines never share tuning values.
//
const MASTER_MIN_TRACKABLE_HALF_MOVES = (MASTER_MIN_ANALYSIS_MOVE - 1) * 2

//----------------------------------------------------------------------------------
//  deconstructMasterGames — POC scope: processes every tmgr_mastergamesraw row for
//  one master player not yet in tmgd_mastergamesdecon. Mirrors deconstructGames, but
//  reads/writes the master-games tables (secondary database) — tec_ecoreference stays
//  shared in the primary database, reused via upsertEcoReference unchanged.
//----------------------------------------------------------------------------------
export async function deconstructMasterGames(
  chesscomHandle: string,
  level: number = 1,
  forceNewRun?: boolean
): Promise<{ processed: number; skipped: number; errors: number }> {
  const player = chesscomHandle.toLowerCase()
  await logStart('deconstructMasterGames', 'masterGamesPipelineRoute', `deconstructing raw games for ${player}`, level)
  const t0 = Date.now()

  const rawResult = await table_fetch({
    caller: 'deconstructMasterGames',
    table: MASTER_RAW_TABLE,
    whereColumnValuePairs: [{ column: 'mgr_player', value: player }],
    skipCache: true
  })
  if (!rawResult.ok) {
    write_logging({
      lg_functionname: 'deconstructMasterGames',
      lg_caller: 'deconstructMasterGames',
      lg_msg: 'Failed to fetch master raw games for ' + player + ': ' + rawResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructMasterGames', 'masterGamesPipelineRoute', 'failed to fetch raw games', level)
    return { processed: 0, skipped: 0, errors: 0 }
  }

  const existingResult = await table_fetch({
    caller: 'deconstructMasterGames_existing',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_player', value: player }],
    columns: ['mgd_chesscom_uuid'],
    skipCache: true
  })
  if (!existingResult.ok) {
    write_logging({
      lg_functionname: 'deconstructMasterGames',
      lg_caller: 'deconstructMasterGames_existing',
      lg_msg: 'Failed to fetch existing master decon rows for ' + player + ': ' + existingResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructMasterGames', 'masterGamesPipelineRoute', 'failed to fetch existing decon rows', level)
    return { processed: 0, skipped: 0, errors: 0 }
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
        caller: 'deconstructMasterGames',
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
          lg_functionname: 'deconstructMasterGames',
          lg_caller: 'deconstructMasterGames',
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
        lg_functionname: 'deconstructMasterGames',
        lg_caller: 'deconstructMasterGames',
        lg_msg: `Error deconstructing master game ${row.mgr_chesscom_uuid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  write_logging({
    lg_functionname: 'deconstructMasterGames',
    lg_caller: 'deconstructMasterGames',
    lg_msg: `${player}: ${processed} ${MASTER_DECON_TABLE} rows inserted, ${skipped} skipped, ${errors} errors`,
    lg_severity: 'I'
  })

  await logPipelineStep({
    step: 2, subStep: 'a', stepName: 'Deconstruct Master Games', pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: MASTER_RAW_TABLE, inputRecs: rawResult.data.length,
    outputTable: MASTER_DECON_TABLE, outputRecs: processed,
    durationMs: Date.now() - t0, forceNewRun
  })
  await logEnd('deconstructMasterGames', 'masterGamesPipelineRoute', `${processed} processed, ${skipped} skipped, ${errors} errors`, level)

  return { processed, skipped, errors }
}
