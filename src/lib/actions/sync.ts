'use server'

import { table_write } from 'nextjs-shared/table_write'
import { table_delete } from 'nextjs-shared/table_delete'
import { INCLUDED_TIME_CLASSES } from '../constants'
import { getPlayers, getPlayerLastSyncedEndTime, markPlayerSynced, updatePlayerRating } from './players'
import { deconstructGames } from './deconstruct'

const GAMES_TABLE = 'tgr_gamesraw'

//----------------------------------------------------------------------------------
//  insertRawGame — insert one raw game row; returns true if inserted, false if already existed
//----------------------------------------------------------------------------------
async function insertRawGame(data: {
  player_username: string
  chesscom_uuid: string
  raw_data: object
  pgn?: string | null
  end_time: number
  time_class: string
}): Promise<boolean> {
  const rows = await table_write({
    caller: 'insertRawGame',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_player', value: data.player_username.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_pgn', value: data.pgn ?? null },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ],
    conflictColumn: 'gr_chesscom_uuid, gr_player'
  })
  return rows.length > 0
}

//----------------------------------------------------------------------------------
//  getLatestGameEndTime — resume cutoff for a player, read from tpl_players
//  (not tgr_gamesraw) so tgr_gamesraw can be archived/truncated independently
//----------------------------------------------------------------------------------
async function getLatestGameEndTime(playerUsername: string): Promise<number | null> {
  return getPlayerLastSyncedEndTime(playerUsername)
}

//----------------------------------------------------------------------------------
//  initSync — fetch chess.com archive list; optionally clear existing games first
//----------------------------------------------------------------------------------
export async function initSync(
  playerUsername: string,
  syncType: 'full_replace' | 'refresh'
): Promise<{ archives: string[]; latestEndTime: number | null }> {
  const username = playerUsername.toLowerCase()

  //
  //  tgr_gamesraw is a per-run transaction/staging table — cleared for this
  //  player before every sync (not just full_replace), since resume-cutoff now
  //  comes from tpl_players.pl_last_synced_end_time, not this table's contents.
  //
  await table_delete({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: username }],
    caller: 'initSync_clearStaging'
  })

  const latestEndTime = syncType === 'refresh'
    ? await getLatestGameEndTime(username)
    : null

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Failed to fetch archives for ${username}`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  return { archives, latestEndTime }
}

//----------------------------------------------------------------------------------
//  syncArchive — download one monthly archive and insert new games
//----------------------------------------------------------------------------------
export async function syncArchive(params: {
  username: string
  archiveUrl: string
  syncType: 'full_replace' | 'refresh'
  latestEndTime: number | null
}): Promise<{ inserted: number; skipped: number; total: number }> {
  const { username, archiveUrl, syncType, latestEndTime } = params

  try {
    if (syncType === 'refresh' && latestEndTime) {
      const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
      if (match) {
        const archiveDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
        const latestDate = new Date(latestEndTime * 1000)
        if (archiveDate < new Date(latestDate.getFullYear(), latestDate.getMonth())) {
          return { inserted: 0, skipped: 0, total: 0 }
        }
      }
    }

    const monthRes = await fetch(archiveUrl)
    if (!monthRes.ok) return { inserted: 0, skipped: 0, total: 0 }

    const { games } = await monthRes.json() as { games: any[] }
    const standardGames = games
      .filter((g: any) => g.rules === 'chess' && g.pgn && INCLUDED_TIME_CLASSES.includes(g.time_class))
      .sort((a: any, b: any) => a.end_time - b.end_time)

    let inserted = 0
    let skipped = 0

    for (const game of standardGames) {
      const uuid = game.uuid || game.url
      if (!uuid) continue

      if (syncType === 'refresh' && latestEndTime && game.end_time <= latestEndTime) {
        skipped++
        continue
      }

      const wasInserted = await insertRawGame({
        player_username: username,
        chesscom_uuid: uuid,
        raw_data: game,
        pgn: game.pgn ?? null,
        end_time: game.end_time,
        time_class: game.time_class || ''
      })
      if (wasInserted) inserted++
      else skipped++
    }

    return { inserted, skipped, total: games.length }
  } catch (error) {
    console.error(`Error syncing archive ${archiveUrl}:`, error)
    return { inserted: 0, skipped: 0, total: 0 }
  }
}

//----------------------------------------------------------------------------------
//  runGameSync — full game sync for all players. Called directly from the pipeline
//  UI as a Server Action (no HTTP/auth layer needed) and from api/cron/sync/route.ts
//  (which keeps its own CRON_SECRET check for the external scheduled trigger).
//----------------------------------------------------------------------------------
export async function runGameSync(): Promise<{
  players: { username: string; inserted: number; deconstructed: number }[]
  totalInserted: number
  totalDeconstructed: number
}> {
  const players = await getPlayers()
  const summary: { username: string; inserted: number; deconstructed: number }[] = []

  for (const player of players) {
    const username = player.username
    let totalInserted = 0

    try {
      const { archives, latestEndTime } = await initSync(username, 'refresh')

      for (const archiveUrl of archives) {
        const result = await syncArchive({ username, archiveUrl, syncType: 'refresh', latestEndTime })
        totalInserted += result.inserted
      }

      const { processed } = await deconstructGames(username, 0)
      await updatePlayerRating(username)
      await markPlayerSynced(username, Math.floor(Date.now() / 1000))
      summary.push({ username, inserted: totalInserted, deconstructed: processed })
    } catch (err) {
      console.error(`runGameSync: failed for ${username}:`, err)
      summary.push({ username, inserted: totalInserted, deconstructed: 0 })
    }
  }

  const totalInserted       = summary.reduce((s, p) => s + p.inserted, 0)
  const totalDeconstructed  = summary.reduce((s, p) => s + p.deconstructed, 0)

  return { players: summary, totalInserted, totalDeconstructed }
}
