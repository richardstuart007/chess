'use server'

import { table_write } from 'nextjs-shared/table_write'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep } from '../actions/pipelineLog'
import { logStart, logEnd } from '../logStep'
import { MASTER_INCLUDED_TIME_CLASSES, PIPELINE_TYPE_MASTERGAMES } from '../constants'

const MASTER_GAMES_TABLE = 'tmgr_mastergamesraw'

//----------------------------------------------------------------------------------
//  insertMasterRawGame — insert one raw master game row; returns true if inserted,
//  false if already existed (ON CONFLICT DO NOTHING)
//----------------------------------------------------------------------------------
async function insertMasterRawGame(data: {
  player: string
  chesscom_uuid: string
  raw_data: object
  pgn?: string | null
  end_time: number
  time_class: string
}): Promise<boolean> {
  const result = await table_write({
    caller: 'insertMasterRawGame',
    table: MASTER_GAMES_TABLE,
    columnValuePairs: [
      { column: 'mgr_player', value: data.player.toLowerCase() },
      { column: 'mgr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'mgr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'mgr_pgn', value: data.pgn ?? null },
      { column: 'mgr_end_time', value: data.end_time },
      { column: 'mgr_time_class', value: data.time_class }
    ],
    conflictColumn: 'mgr_chesscom_uuid, mgr_player',
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'insertMasterRawGame',
      lg_caller: 'insertMasterRawGame',
      lg_msg: 'Failed to insert master raw game ' + data.chesscom_uuid + ': ' + result.error,
      lg_severity: 'E'
    })
    return false
  }
  return result.data.length > 0
}

//----------------------------------------------------------------------------------
//  syncMasterGames — POC scope: one player, one calendar year. Downloads every
//  chess.com monthly archive for that year, keeps only standard chess
//  (rules === 'chess', excludes chess960/variants) games in
//  MASTER_INCLUDED_TIME_CLASSES, and inserts them into tmgr_mastergamesraw. No resume
//  cursor — always a fresh pull for the given year, safe to re-run (ON CONFLICT DO
//  NOTHING on the chess.com uuid).
//----------------------------------------------------------------------------------
export async function syncMasterGames(
  chesscomHandle: string,
  year: number,
  level: number = 1,
  forceNewRun?: boolean
): Promise<{ inserted: number; skipped: number; total: number }> {
  const player = chesscomHandle.toLowerCase()
  await logStart('syncMasterGames', 'masterGamesPipelineRoute', `syncing ${player}/${year}`, level)
  const t0 = Date.now()

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${player}/games/archives`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  })
  if (!archivesRes.ok) {
    write_logging({
      lg_functionname: 'syncMasterGames',
      lg_caller: 'syncMasterGames',
      lg_msg: 'Failed to fetch archive list for ' + player + ': HTTP ' + archivesRes.status,
      lg_severity: 'E'
    })
    await logEnd('syncMasterGames', 'masterGamesPipelineRoute', 'failed to fetch archive list', level)
    return { inserted: 0, skipped: 0, total: 0 }
  }
  const { archives } = await archivesRes.json() as { archives: string[] }
  const yearArchives = archives.filter(url => url.includes(`/games/${year}/`))

  let inserted = 0
  let skipped = 0
  let total = 0

  for (const archiveUrl of yearArchives) {
    const monthRes = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    if (!monthRes.ok) {
      write_logging({
        lg_functionname: 'syncMasterGames',
        lg_caller: 'syncMasterGames',
        lg_msg: 'Failed to fetch archive ' + archiveUrl + ': HTTP ' + monthRes.status,
        lg_severity: 'E'
      })
      continue
    }
    const { games } = await monthRes.json() as { games: any[] }
    const standardGames = games.filter((g: any) =>
      g.rules === 'chess' && g.pgn && MASTER_INCLUDED_TIME_CLASSES.includes(g.time_class)
    )
    total += standardGames.length

    for (const game of standardGames) {
      const uuid = game.uuid || game.url
      if (!uuid) continue
      const wasInserted = await insertMasterRawGame({
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
  }

  write_logging({
    lg_functionname: 'syncMasterGames',
    lg_caller: 'syncMasterGames',
    lg_msg: `${player}/${year}: ${inserted} inserted, ${skipped} skipped, ${total} total standard games found`,
    lg_severity: 'I'
  })

  await logPipelineStep({
    step: 1, subStep: 'a', stepName: 'Sync Master Games', pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: 'chess.com API', inputRecs: total,
    outputTable: 'tmgr_mastergamesraw', outputRecs: inserted,
    durationMs: Date.now() - t0, forceNewRun
  })
  await logEnd('syncMasterGames', 'masterGamesPipelineRoute', `${inserted} inserted, ${skipped} skipped, ${total} total`, level)

  return { inserted, skipped, total }
}
