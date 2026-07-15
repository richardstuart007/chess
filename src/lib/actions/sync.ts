'use server'

import { table_write } from 'nextjs-shared/table_write'
import { table_delete } from 'nextjs-shared/table_delete'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from './pipelineLog'
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
    conflictColumn: 'gr_chesscom_uuid, gr_player',
    skipCache: true
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
  await logStart('initSync', 'gameSyncPipeline', `fetching archive list for ${username} (${syncType})`, 2)

  //
  //  tgr_gamesraw is a per-run transaction/staging table — cleared for this
  //  player before every sync (not just full_replace), since resume-cutoff now
  //  comes from tpl_players.pl_last_synced_end_time, not this table's contents.
  //
  await table_delete({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: username }],
    caller: 'initSync_clearStaging',
    skipCache: true,
    level: 2,
    severity: 'D'
  })

  const latestEndTime = syncType === 'refresh'
    ? await getLatestGameEndTime(username)
    : null

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Failed to fetch archives for ${username}`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  await logEnd('initSync', 'gameSyncPipeline', `${archives.length} archives found, resume cutoff ${latestEndTime}`, 2)
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
  await logStart('syncArchive', 'gameSyncPipeline', `downloading archive ${archiveUrl}`, 2)

  try {
    if (syncType === 'refresh' && latestEndTime) {
      const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
      if (match) {
        const archiveDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
        const latestDate = new Date(latestEndTime * 1000)
        if (archiveDate < new Date(latestDate.getFullYear(), latestDate.getMonth())) {
          await logEnd('syncArchive', 'gameSyncPipeline', `${archiveUrl}: before resume cutoff, skipped`, 2)
          return { inserted: 0, skipped: 0, total: 0 }
        }
      }
    }

    const monthRes = await fetch(archiveUrl)
    if (!monthRes.ok) {
      await logEnd('syncArchive', 'gameSyncPipeline', `${archiveUrl}: fetch failed (${monthRes.status})`, 2)
      return { inserted: 0, skipped: 0, total: 0 }
    }

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

    await logEnd('syncArchive', 'gameSyncPipeline', `${inserted} inserted, ${skipped} skipped, ${games.length} total games`, 2)
    return { inserted, skipped, total: games.length }
  } catch (error) {
    console.error(`Error syncing archive ${archiveUrl}:`, error)
    await write_logging({
      lg_functionname: 'syncArchive',
      lg_caller: 'runGameSync',
      lg_msg: `Error syncing archive ${archiveUrl}: ` + (error as Error).message,
      lg_severity: 'E'
    })
    await logEnd('syncArchive', 'gameSyncPipeline', `${archiveUrl}: failed — ` + (error as Error).message, 2)
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
  const players = await getPlayers(true, 1, 'D')
  await logStart('runGameSync', 'vercelCronSync', `game sync for ${players.length} players`, 1)
  const t0 = Date.now()
  const summary: { username: string; inserted: number; deconstructed: number }[] = []
  let errors = 0
  let totalRead = 0

  for (const player of players) {
    const username = player.username
    let totalInserted = 0
    await logStart('runGameSync', 'runGameSync', `syncing ${username}`, 2)

    try {
      const { archives, latestEndTime } = await initSync(username, 'refresh')

      for (const archiveUrl of archives) {
        const result = await syncArchive({ username, archiveUrl, syncType: 'refresh', latestEndTime })
        totalInserted += result.inserted
        totalRead     += result.total
      }

      const { processed } = await deconstructGames(username, 0)
      await updatePlayerRating(username)
      await markPlayerSynced(username, Math.floor(Date.now() / 1000))
      summary.push({ username, inserted: totalInserted, deconstructed: processed })
      await logEnd('runGameSync', 'runGameSync', `${username}: ${totalInserted} inserted, ${processed} deconstructed`, 2)
    } catch (err) {
      console.error(`runGameSync: failed for ${username}:`, err)
      await write_logging({
        lg_functionname: 'runGameSync',
        lg_caller: 'runGameSync',
        lg_msg: `runGameSync failed for ${username}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      summary.push({ username, inserted: totalInserted, deconstructed: 0 })
      errors++
      await logEnd('runGameSync', 'runGameSync', `${username}: failed — ` + (err as Error).message, 2)
    }
  }

  const totalInserted       = summary.reduce((s, p) => s + p.inserted, 0)
  const totalDeconstructed  = summary.reduce((s, p) => s + p.deconstructed, 0)
  const durationMs          = Date.now() - t0

  await logPipelineStep({ step: 1, subStep: 'a', stepName: 'Query chess.com API', inputTable: 'tpl_players', inputRecs: players.length, outputTable: 'chess.com API', outputRecs: totalRead, durationMs })
  await logPipelineStep({ step: 1, subStep: 'b', stepName: 'Fetch & Insert Raw Games', inputTable: 'chess.com API', inputRecs: totalRead, outputTable: 'tgr_gamesraw', outputRecs: totalInserted, durationMs, forceNewRun: false })
  await logPipelineStep({ step: 1, subStep: 'c', stepName: 'Deconstruct Games', inputTable: 'tgr_gamesraw', inputRecs: totalInserted, outputTable: 'tgd_gamesdecon', outputRecs: totalDeconstructed, durationMs, forceNewRun: false })
  await logPipelineStep({ step: 1, subStep: 'd', stepName: 'Update Player Ratings', inputTable: 'tgd_gamesdecon', inputRecs: totalDeconstructed, outputTable: 'tplr_player_ratings', outputRecs: players.length - errors, durationMs, forceNewRun: false })
  await logEnd('runGameSync', 'vercelCronSync', `${summary.length} players processed, ${totalInserted} inserted, ${totalDeconstructed} deconstructed`, 1)

  return { players: summary, totalInserted, totalDeconstructed }
}
