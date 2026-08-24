'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_count } from 'nextjs-shared/table_count'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { parsePgnHeaders, parsePgnOpening, countMoves, normalizeTermination } from '../parsePgn'
import { INCLUDED_TIME_CLASSES_Player, MIN_ANALYSIS_MOVE_Player } from '../constants'

const RAW_TABLE = 'wk_gr_gamesraw'
const DECON_TABLE = 'tgd_gamesdecon'
const ECO_TABLE = 'tec_ecoreference'

//
//  A game with fewer half-moves than this can never produce a trackable
//  position (buildPositionTree_Player's analysis window starts at MIN_ANALYSIS_MOVE_Player)
//  — not a "game" for this app's purposes, so it's never written to tgd_gamesdecon.
//
const MIN_TRACKABLE_HALF_MOVES = (MIN_ANALYSIS_MOVE_Player - 1) * 2

//----------------------------------------------------------------------------------
//  getUndeconstructedCount — count raw games not yet deconstructed for a player
//----------------------------------------------------------------------------------
export async function getUndeconstructedCount(
  player: string,
  timeClasses: string[] = INCLUDED_TIME_CLASSES_Player
): Promise<number> {
  const inPlaceholders = timeClasses.map((_, i) => `$${i + 2}`).join(', ')
  const result = await table_query({
    caller: 'getUndeconstructedCount',
    table: RAW_TABLE,
    query: `SELECT COUNT(*) FROM ${RAW_TABLE} r WHERE r.gr_player = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player)`,
    params: [player.toLowerCase(), ...timeClasses]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getUndeconstructedCount',
      lg_caller: 'getUndeconstructedCount',
      lg_msg: 'Failed to count undeconstructed games for ' + player + ': ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return Number(result.data[0].count)
}

//----------------------------------------------------------------------------------
//  getDeconstructedCount — count deconstructed games for a player
//----------------------------------------------------------------------------------
export async function getDeconstructedCount(player: string): Promise<number> {
  const result = await table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player', value: player.toLowerCase() }],
    caller: 'getDeconstructedCount'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getDeconstructedCount',
      lg_caller: 'getDeconstructedCount',
      lg_msg: 'Failed to count deconstructed games for ' + player + ': ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  deconstructGames_Player — process raw games into tgd_gamesdecon
//----------------------------------------------------------------------------------
export async function deconstructGames_Player(
  playerParam: string,
  limit: number,
  timeClasses: string[] = INCLUDED_TIME_CLASSES_Player
): Promise<{ processed: number; skipped: number; errors: number }> {
  const player = playerParam.toLowerCase()
  await logStart('deconstructGames_Player', 'gameSyncPipeline', `deconstructing raw games for ${player}`, 2)

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const inPlaceholders = timeClasses.map((_, i) => `$${i + 2}`).join(', ')
  const rawGamesResult = await table_query({
    caller: 'deconstructGames_Player',
    query: `SELECT r.* FROM ${RAW_TABLE} r WHERE r.gr_player = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player) ORDER BY r.gr_end_time DESC ${limitClause}`,
    params: [player, ...timeClasses],
    table: RAW_TABLE,
    level: 2,
    severity: 'I'
  })
  if (!rawGamesResult.ok) {
    write_logging({
      lg_functionname: 'deconstructGames_Player',
      lg_caller: 'deconstructGames_Player',
      lg_msg: 'Failed to fetch raw games for ' + player + ': ' + rawGamesResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructGames_Player', 'gameSyncPipeline', `failed to fetch raw games: ${rawGamesResult.error}`, 2)
    return { processed: 0, skipped: 0, errors: 0 }
  }
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rawGamesResult.data) {
    try {
      const rawData = typeof row.gr_raw_data === 'string'
        ? JSON.parse(row.gr_raw_data)
        : row.gr_raw_data

      const pgn = rawData.pgn
      if (!pgn) {
        skipped++
        continue
      }

      if (countMoves(pgn) <= MIN_TRACKABLE_HALF_MOVES) {
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

      await table_write({
        caller: 'deconstructGames_Player',
        table: DECON_TABLE,
        columnValuePairs: [
          { column: 'gd_white_username', value: whiteUsername },
          { column: 'gd_black_username', value: blackUsername },
          { column: 'gd_white_rating', value: rawData.white?.rating ?? 0 },
          { column: 'gd_black_rating', value: rawData.black?.rating ?? 0 },
          { column: 'gd_player', value: player },
          { column: 'gd_player_color', value: playerColor },
          { column: 'gd_player_result', value: playerResult },
          { column: 'gd_opponent_username', value: isWhite ? blackUsername : whiteUsername },
          { column: 'gd_opponent_rating', value: (isWhite ? rawData.black?.rating : rawData.white?.rating) ?? 0 },
          { column: 'gd_time_class', value: rawData.time_class ?? '' },
          { column: 'gd_time_control', value: headers.timeControl },
          { column: 'gd_is_rated', value: rawData.rated ?? true },
          { column: 'gd_termination', value: normalizeTermination(headers.termination) },
          { column: 'gd_end_time', value: row.gr_end_time },
          { column: 'gd_eco_code', value: headers.eco },
          { column: 'gd_opening_name', value: headers.openingName },
          { column: 'gd_game_url', value: rawData.url ?? '' },
          { column: 'gd_opening_moves', value: parsePgnOpening(pgn) },
          { column: 'gd_pgn', value: pgn },
          { column: 'gd_chesscom_uuid', value: row.gr_chesscom_uuid }
        ],
        skipCache: true
      })

      if (headers.eco && headers.openingName) {
        await upsertEcoReference(headers.eco, headers.openingName)
      }

      processed++
    } catch (err) {
      console.error(`Error deconstructing game ${row.gr_chesscom_uuid}:`, err)
      await write_logging({
        lg_functionname: 'deconstructGames_Player',
        lg_caller: 'gameSyncPipeline',
        lg_msg: `Error deconstructing game ${row.gr_chesscom_uuid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  await logEnd('deconstructGames_Player', 'gameSyncPipeline', `${processed} ${DECON_TABLE} rows inserted, ${skipped} skipped, ${errors} errors`, 2)
  return { processed, skipped, errors }
}

//----------------------------------------------------------------------------------
//  upsertEcoReference — insert an ECO code → opening name mapping if not present
//----------------------------------------------------------------------------------
export async function upsertEcoReference(ecoCode: string, openingName: string): Promise<void> {
  const existing = await table_fetch({
    caller: 'upsertEcoReference',
    table: ECO_TABLE,
    whereColumnValuePairs: [
      { column: 'ec_eco_code', value: ecoCode },
      { column: 'ec_opening_name', value: openingName }
    ],
    limit: 1,
    skipCache: true
  })
  if (!existing.ok) {
    write_logging({
      lg_functionname: 'upsertEcoReference',
      lg_caller: 'upsertEcoReference',
      lg_msg: 'Failed to check existing ECO reference ' + ecoCode + ': ' + existing.error,
      lg_severity: 'E'
    })
    return
  }

  if (existing.data.length === 0) {
    try {
      await table_write({
        caller: 'upsertEcoReference',
        table: ECO_TABLE,
        columnValuePairs: [
          { column: 'ec_eco_code', value: ecoCode },
          { column: 'ec_opening_name', value: openingName }
        ],
        skipCache: true
      })
    } catch {
      // Ignore duplicate key errors (race condition)
    }
  }
}
