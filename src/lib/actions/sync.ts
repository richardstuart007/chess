'use server'

//==================================================================================================
//  1) DESCRIPTION
//    runGameSync — full game sync for all players. Called directly from the pipeline UI as a
//    Server Action (no HTTP/auth layer needed) and from api/cron/sync/route.ts (which keeps its
//    own CRON_SECRET check for the external scheduled trigger). For each tracked player: fetches
//    chess.com archives since that player's own resume cutoff (initSync/syncArchive), inserts new
//    raw games, deconstructs them, and updates the player's rating.
//
//    Returns:
//      players            — per-player summary (player, inserted, deconstructed)
//      totalInserted      — raw games inserted across all players
//      totalDeconstructed — games deconstructed across all players
//
//  2) NOTES
//    wk_gr_gamesraw is a workfile — truncated fresh at the start of every full run (not per
//    player), then downloaded into for whichever players get synced. Safe because the resume
//    cutoff comes from tpl_players.pl_last_synced_end_time, not this table's contents.
//==================================================================================================

import { table_write } from 'nextjs-shared/table_write'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from './pipelineLog'
import { INCLUDED_TIME_CLASSES_Player, PIPELINE_TYPE_GAMES } from '../constants'
import { getPlayers, getPlayerLastSyncedEndTime, markPlayerSynced, updatePlayerRating } from './players'
import { deconstructGames_Player } from './deconstructGames_Player'

const GAMES_TABLE = 'wk_gr_gamesraw'

export async function runGameSync(): Promise<{
  players: { player: string; inserted: number; deconstructed: number }[]
  totalInserted: number
  totalDeconstructed: number
}> {
  const players = await getPlayers(true, 1, 'I')
  await logStart('runGameSync', 'vercelCronSync', `game sync for ${players.length} players`, 1)
  const summary: { player: string; inserted: number; deconstructed: number }[] = []
  let errors = 0
  let totalRead = 0
  let queryMs = 0
  let fetchMs = 0
  let deconstructMs = 0
  let ratingsMs = 0

  //
  //  wk_gr_gamesraw is a workfile — truncated fresh at the start of every full run
  //  (not per player), then downloaded into for whichever players get synced below.
  //  Safe because the resume cutoff comes from tpl_players.pl_last_synced_end_time,
  //  not this table's contents.
  //
  await table_truncate(GAMES_TABLE, 'runGameSync', true)

  for (const p of players) {
    const player = p.player
    let totalInserted = 0
    await logStart('runGameSync', 'runGameSync', `syncing ${player}`, 2)

    try {
      const tQuery0 = Date.now()
      const { archives, latestEndTime } = await initSync(player, 'refresh')
      queryMs += Date.now() - tQuery0

      const tFetch0 = Date.now()
      for (const archiveUrl of archives) {
        const result = await syncArchive({ player, archiveUrl, syncType: 'refresh', latestEndTime })
        totalInserted += result.inserted
        totalRead     += result.total
      }
      fetchMs += Date.now() - tFetch0

      const tDecon0 = Date.now()
      const { processed } = await deconstructGames_Player(player, 0)
      deconstructMs += Date.now() - tDecon0

      const tRatings0 = Date.now()
      await updatePlayerRating(player)
      ratingsMs += Date.now() - tRatings0

      await markPlayerSynced(player, Math.floor(Date.now() / 1000))
      summary.push({ player, inserted: totalInserted, deconstructed: processed })
      await logEnd('runGameSync', 'runGameSync', `${player}: ${totalInserted} inserted, ${processed} deconstructed`, 2)
    } catch (err) {
      console.error(`runGameSync: failed for ${player}:`, err)
      await write_logging({
        lg_functionname: 'runGameSync',
        lg_caller: 'runGameSync',
        lg_msg: `runGameSync failed for ${player}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      summary.push({ player, inserted: totalInserted, deconstructed: 0 })
      errors++
      await logEnd('runGameSync', 'runGameSync', `${player}: failed — ` + (err as Error).message, 2)
    }
  }

  const totalInserted       = summary.reduce((s, p) => s + p.inserted, 0)
  const totalDeconstructed  = summary.reduce((s, p) => s + p.deconstructed, 0)

  await logPipelineStep({ step: 1, subStep: 'a', stepName: 'Query chess.com API', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'tpl_players', inputRecs: players.length, outputTable: 'chess.com API', outputRecs: totalRead, durationMs: queryMs, forceNewRun: true })
  await logPipelineStep({ step: 1, subStep: 'b', stepName: 'Fetch & Insert Raw Games', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'chess.com API', inputRecs: totalRead, outputTable: 'wk_gr_gamesraw', outputRecs: totalInserted, durationMs: fetchMs, forceNewRun: false })
  await logPipelineStep({ step: 1, subStep: 'c', stepName: 'Deconstruct Games', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'wk_gr_gamesraw', inputRecs: totalInserted, outputTable: 'tgd_gamesdecon', outputRecs: totalDeconstructed, durationMs: deconstructMs, forceNewRun: false })
  await logPipelineStep({ step: 1, subStep: 'd', stepName: 'Update Player Ratings', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'tgd_gamesdecon', inputRecs: totalDeconstructed, outputTable: 'tplr_player_ratings', outputRecs: players.length - errors, durationMs: ratingsMs, forceNewRun: false })
  await logEnd('runGameSync', 'vercelCronSync', `${summary.length} players processed, ${totalInserted} inserted, ${totalDeconstructed} deconstructed`, 1)

  return { players: summary, totalInserted, totalDeconstructed }
}

//----------------------------------------------------------------------------------
//  initSync — fetch chess.com archive list; optionally clear existing games first
//----------------------------------------------------------------------------------
export async function initSync(
  playerParam: string,
  syncType: 'full_replace' | 'refresh'
): Promise<{ archives: string[]; latestEndTime: number | null }> {
  const player = playerParam.toLowerCase()
  await logStart('initSync', 'gameSyncPipeline', `fetching archive list for ${player} (${syncType})`, 2)

  const latestEndTime = syncType === 'refresh'
    ? await getLatestGameEndTime(player)
    : null

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${player}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Failed to fetch archives for ${player}`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  await logEnd('initSync', 'gameSyncPipeline', `${archives.length} archives found, resume cutoff ${latestEndTime}`, 2)
  return { archives, latestEndTime }
}

//----------------------------------------------------------------------------------
//  getLatestGameEndTime — resume cutoff for a player, read from tpl_players
//  (not wk_gr_gamesraw) so wk_gr_gamesraw can be archived/truncated independently
//----------------------------------------------------------------------------------
async function getLatestGameEndTime(player: string): Promise<number | null> {
  return getPlayerLastSyncedEndTime(player)
}

//----------------------------------------------------------------------------------
//  syncArchive — download one monthly archive and insert new games
//----------------------------------------------------------------------------------
export async function syncArchive(params: {
  player: string
  archiveUrl: string
  syncType: 'full_replace' | 'refresh'
  latestEndTime: number | null
}): Promise<{ inserted: number; skipped: number; total: number }> {
  const { player, archiveUrl, syncType, latestEndTime } = params
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
      .filter((g: any) => g.rules === 'chess' && g.pgn && INCLUDED_TIME_CLASSES_Player.includes(g.time_class))
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
        player,
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
//  insertRawGame — insert one raw game row; returns true if inserted, false if already existed
//----------------------------------------------------------------------------------
async function insertRawGame(data: {
  player: string
  chesscom_uuid: string
  raw_data: object
  pgn?: string | null
  end_time: number
  time_class: string
}): Promise<boolean> {
  const result = await table_write({
    caller: 'insertRawGame',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_player', value: data.player.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_pgn', value: data.pgn ?? null },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ],
    conflictColumn: 'gr_chesscom_uuid, gr_player',
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'insertRawGame',
      lg_caller: 'insertRawGame',
      lg_msg: 'Failed to insert raw game ' + data.chesscom_uuid + ': ' + result.error,
      lg_severity: 'E'
    })
    return false
  }
  return result.data.length > 0
}
