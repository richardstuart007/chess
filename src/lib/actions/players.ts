'use server'

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_update } from 'nextjs-shared/table_update'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_query }  from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { DEFAULT_PLAYER, INCLUDED_TIME_CLASSES } from '../constants'

const TABLE        = 'tpl_players'
const RATINGS_TABLE = 'tplr_player_ratings'

export async function getPlayer(player: string, skipCache = false, level = 1, severity = 'I') {
  const result = await table_fetch({
    caller: 'getPlayer',
    table: TABLE,
    whereColumnValuePairs: [{ column: 'pl_player', value: player.toLowerCase() }],
    skipCache,
    level,
    severity
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getPlayer',
      lg_caller: 'getPlayer',
      lg_msg: 'Failed to fetch player ' + player + ': ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  return result.data[0] ?? null
}

//----------------------------------------------------------------------------------
//  upsertPlayerRating — store the latest rating for a given time class
//----------------------------------------------------------------------------------
export async function upsertPlayerRating(
  player: string,
  timeClass: string,
  rating: number,
  skipCache = false,
  level = 1,
  severity = 'I'
): Promise<void> {
  await table_upsert({
    caller: 'upsertPlayerRating',
    table: RATINGS_TABLE,
    columnValuePairs: [
      { column: 'plr_player',   value: player.toLowerCase() },
      { column: 'plr_time_class', value: timeClass },
      { column: 'plr_rating',     value: rating }
    ],
    conflictColumns: ['plr_player', 'plr_time_class'],
    skipCache,
    level,
    severity
  })
}

//----------------------------------------------------------------------------------
//  getPlayerRatings — returns all stored ratings for a player keyed by time class
//----------------------------------------------------------------------------------
export async function getPlayerRatings(player: string): Promise<Record<string, number>> {
  const fetchResult = await table_fetch({
    caller: 'getPlayerRatings',
    table: RATINGS_TABLE,
    whereColumnValuePairs: [{ column: 'plr_player', value: player.toLowerCase() }]
  })
  if (!fetchResult.ok) {
    write_logging({
      lg_functionname: 'getPlayerRatings',
      lg_caller: 'getPlayerRatings',
      lg_msg: 'Failed to fetch player ratings for ' + player + ': ' + fetchResult.error,
      lg_severity: 'E'
    })
    return {}
  }
  const result: Record<string, number> = {}
  for (const row of fetchResult.data) {
    result[row.plr_time_class] = row.plr_rating
  }
  return result
}

//----------------------------------------------------------------------------------
//  updatePlayerRating — called from cron; saves latest game rating per time class
//----------------------------------------------------------------------------------
export async function updatePlayerRating(player: string): Promise<void> {
  await logStart('updatePlayerRating', 'gameSyncPipeline', `updating ${RATINGS_TABLE} for ${player}`, 2)
  let updated = 0
  for (const timeClass of INCLUDED_TIME_CLASSES) {
    const result = await table_query({
      caller: 'updatePlayerRating',
      query: `SELECT CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END AS rating
              FROM tgd_gamesdecon
              WHERE gd_player = $1 AND gd_time_class = $2
              ORDER BY gd_end_time DESC LIMIT 1`,
      params: [player.toLowerCase(), timeClass],
      table: 'tgd_gamesdecon',
      level: 2,
      severity: 'I'
    })
    if (!result.ok) {
      write_logging({
        lg_functionname: 'updatePlayerRating',
        lg_caller: 'updatePlayerRating',
        lg_msg: 'Failed to fetch latest rating for ' + player + '/' + timeClass + ': ' + result.error,
        lg_severity: 'E'
      })
      continue
    }
    if (result.data.length > 0) {
      await upsertPlayerRating(player, timeClass, Number(result.data[0].rating), true, 2, 'D')
      updated++
    }
  }
  await logEnd('updatePlayerRating', 'gameSyncPipeline', `${updated} time classes updated`, 2)
}

//----------------------------------------------------------------------------------
//  getPlayerLastSyncedEndTime — last successful sync cutoff for a player, used to
//  resume chess.com downloads independent of tgr_gamesraw's own contents (so that
//  table can be archived/truncated without breaking incremental sync)
//----------------------------------------------------------------------------------
export async function getPlayerLastSyncedEndTime(player: string): Promise<number | null> {
  const result = await table_fetch({
    caller: 'getPlayerLastSyncedEndTime',
    table: TABLE,
    whereColumnValuePairs: [{ column: 'pl_player', value: player.toLowerCase() }],
    columns: ['pl_last_synced_end_time'],
    skipCache: true,
    level: 2,
    severity: 'I'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getPlayerLastSyncedEndTime',
      lg_caller: 'getPlayerLastSyncedEndTime',
      lg_msg: 'Failed to fetch last synced end time for ' + player + ': ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  return result.data[0]?.pl_last_synced_end_time ?? null
}

//----------------------------------------------------------------------------------
//  markPlayerSynced — stamp the current time as this player's sync cutoff, called
//  after a successful sync run completes
//----------------------------------------------------------------------------------
export async function markPlayerSynced(player: string, endTime: number): Promise<void> {
  await logStart('markPlayerSynced', 'gameSyncPipeline', `stamping sync cutoff for ${player}`, 2)
  const existing = await getPlayer(player, true, 2, 'D')
  if (!existing) {
    await logEnd('markPlayerSynced', 'gameSyncPipeline', `${player}: player not found, skipped`, 2)
    return
  }
  await table_update({
    caller: 'markPlayerSynced',
    table: TABLE,
    columnValuePairs: [{ column: 'pl_last_synced_end_time', value: endTime }],
    whereColumnValuePairs: [{ column: 'pl_plid', value: existing.pl_plid }],
    skipCache: true,
    level: 2,
    severity: 'I'
  })
  await logEnd('markPlayerSynced', 'gameSyncPipeline', `pl_last_synced_end_time set to ${endTime}`, 2)
}

export async function getPlayers(skipCache = false, level = 1, severity = 'I'): Promise<{ player: string; display_name: string | null }[]> {
  const result = await table_fetch({
    caller: 'getPlayers',
    table: TABLE,
    orderBy: 'pl_player ASC',
    skipCache,
    level,
    severity
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getPlayers',
      lg_caller: 'getPlayers',
      lg_msg: 'Failed to fetch players: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  const mapped = result.data.map((r: any) => ({
    player: r.pl_player,
    display_name: r.pl_display_name ?? null
  }))
  return mapped.sort((a: { player: string }, b: { player: string }) =>
    a.player === DEFAULT_PLAYER ? -1 : b.player === DEFAULT_PLAYER ? 1 : 0
  )
}
