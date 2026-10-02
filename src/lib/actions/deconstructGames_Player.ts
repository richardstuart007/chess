'use server'

//==================================================================================================
//  1) DESCRIPTION
//    deconstructGames_Player — process raw games into tgd_gamesdecon for one player.
//
//    Parameters:
//      playerParam — player handle
//      limit       — max games to process (0 = no limit)
//      timeClasses — time classes to include (default INCLUDED_TIME_CLASSES_Player)
//
//    Returns:
//      processed — games successfully deconstructed
//      skipped   — games skipped (no PGN, too short to be trackable, or gd_chesscom_uuid already
//                  in tgd_gamesdecon)
//      errors    — games that failed to deconstruct
//
//  2) NOTES
//    gd_chesscom_uuid is the game's unique key across all players — gd_player is not part of
//    it. Each game's uuid is looked up in tgd_gamesdecon, uncached, immediately before the game
//    is deconstructed; a game already there is counted as skipped, and a failed lookup is
//    counted as an error and the game is not written.
//
//  3) CHANGE HISTORY
//    2026-10-02 — the batch read now bypasses the cache and matches on gd_chesscom_uuid alone
//                 (was uuid + player, cached); added the per-game uuid lookup before each
//                 write — a cached batch read had re-inserted 206 games on a repeated sync
//==================================================================================================

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
    query: `SELECT r.* FROM ${RAW_TABLE} r WHERE r.gr_player = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid) ORDER BY r.gr_end_time DESC ${limitClause}`,
    params: [player, ...timeClasses],
    table: RAW_TABLE,
    level: 2,
    severity: 'I',
    skipCache: true
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

      const deconstructable = await isDeconstructable_Player(rawData)
      if (!deconstructable) {
        skipped++
        continue
      }

      //
      //  gd_chesscom_uuid is unique across all players — look it up, uncached, immediately
      //  before deconstructing, so a game already in tgd_gamesdecon is never written twice
      //
      const existing = await table_fetch({
        caller: 'deconstructGames_Player',
        table: DECON_TABLE,
        columns: ['gd_gdid'],
        whereColumnValuePairs: [{ column: 'gd_chesscom_uuid', value: row.gr_chesscom_uuid }],
        limit: 1,
        skipCache: true
      })
      if (!existing.ok) {
        await write_logging({
          lg_functionname: 'deconstructGames_Player',
          lg_caller: 'gameSyncPipeline',
          lg_msg: `Game ${row.gr_chesscom_uuid} not deconstructed, uuid lookup failed: ` + existing.error,
          lg_severity: 'E'
        })
        errors++
        continue
      }
      if (existing.data.length > 0) {
        skipped++
        continue
      }

      const pgn = rawData.pgn
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
//  isDeconstructable_Player — whether a raw game would be written to tgd_gamesdecon
//
//  The single source of the deconstruct skip rules: a game with no PGN, or too short
//  to reach MIN_ANALYSIS_MOVE_Player, is validly skipped. Shared with refreshStep1 so
//  the pipeline status never counts a validly skipped game as pending. Async only
//  because every export of a 'use server' file must be.
//
//  Params:
//    rawData — the parsed chess.com game JSON (wk_gr_gamesraw.gr_raw_data)
//
//  Returns:
//    true if the game has a PGN with more than MIN_TRACKABLE_HALF_MOVES half-moves
//----------------------------------------------------------------------------------
export async function isDeconstructable_Player(rawData: { pgn?: string }): Promise<boolean> {
  const pgn = rawData?.pgn
  const deconstructable = !!pgn && countMoves(pgn) > MIN_TRACKABLE_HALF_MOVES
  return deconstructable
}

//----------------------------------------------------------------------------------
//  upsertEcoReference — insert an ECO code → opening name mapping if not present
//
//  Params:
//    ecoCode — the ECO code
//    openingName — the opening name for that ECO code
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
      //
      //  Ignore duplicate key errors (race condition)
      //
    }
  }
}

//----------------------------------------------------------------------------------
//  getUndeconstructedCount — count raw games not yet deconstructed for a player
//
//  Params:
//    player — the tracked player's username
//    timeClasses — time classes to count (default INCLUDED_TIME_CLASSES_Player)
//
//  Returns:
//    the number of raw games with no matching deconstructed row
//----------------------------------------------------------------------------------
export async function getUndeconstructedCount(
  player: string,
  timeClasses: string[] = INCLUDED_TIME_CLASSES_Player
): Promise<number> {
  const inPlaceholders = timeClasses.map((_, i) => `$${i + 2}`).join(', ')
  const result = await table_query({
    caller: 'getUndeconstructedCount',
    table: RAW_TABLE,
    query: `SELECT COUNT(*) FROM ${RAW_TABLE} r WHERE r.gr_player = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid)`,
    params: [player.toLowerCase(), ...timeClasses],
    skipCache: true
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
  const count = Number(result.data[0].count)
  return count
}

//----------------------------------------------------------------------------------
//  getDeconstructedCount — count deconstructed games for a player
//
//  Params:
//    player — the tracked player's username (lowercased before the lookup)
//
//  Returns:
//    the number of deconstructed games for that player
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
