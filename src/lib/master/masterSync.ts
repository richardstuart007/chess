'use server'

import { table_write } from 'nextjs-shared/table_write'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep } from '../actions/pipelineLog'
import { logStart, logEnd } from '../logStep'
import { deconstructGames_Master } from './deconstructGames_Master'
import { INCLUDED_TIME_CLASSES_Master, PIPELINE_TYPE_MASTERGAMES } from '../constants'

const MASTER_GAMES_TABLE = 'wk_mgr_gamesraw'

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
//  syncMasterGames — one player, one calendar year. Downloads every
//  chess.com monthly archive for that year, keeps only standard chess
//  (rules === 'chess', excludes chess960/variants) games in
//  INCLUDED_TIME_CLASSES_Master, and inserts them into wk_mgr_gamesraw. No resume
//  cursor — always a fresh pull for the given year, safe to re-run (ON CONFLICT DO
//  NOTHING on the chess.com uuid). Also runs deconstructGames_Master immediately
//  afterward, in the same call — mirrors runGameSync bundling Deconstruct Games
//  into its own Step 1, since wk_mgr_gamesraw is a workfile with no independent
//  value between a download and its deconstruction.
//----------------------------------------------------------------------------------
export async function syncMasterGames(
  chesscomHandle: string,
  year: number,
  level: number = 1,
  forceNewRun?: boolean,
  truncateFirst?: boolean
): Promise<{ inserted: number; skipped: number; total: number; deconstructed: number }> {
  const player = chesscomHandle.toLowerCase()
  await logStart('syncMasterGames', 'masterGamesPipelineRoute', `syncing ${player}/${year}`, level)

  //
  //  wk_mgr_gamesraw is a workfile — truncated fresh once at the start of the
  //  whole run (gated by truncateFirst, set only for the first player in a
  //  multi-player batch), not per player, then downloaded into for whichever
  //  players get synced.
  //
  if (truncateFirst) {
    await table_truncate(MASTER_GAMES_TABLE, 'syncMasterGames', true, level)
  }

  const tQuery0 = Date.now()
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
    return { inserted: 0, skipped: 0, total: 0, deconstructed: 0 }
  }
  const { archives } = await archivesRes.json() as { archives: string[] }
  const yearArchives = archives.filter(url => url.includes(`/games/${year}/`))
  const queryMs = Date.now() - tQuery0

  let inserted = 0
  let skipped = 0
  let total = 0

  const tFetch0 = Date.now()
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
      g.rules === 'chess' && g.pgn && INCLUDED_TIME_CLASSES_Master.includes(g.time_class)
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

  const fetchMs = Date.now() - tFetch0

  write_logging({
    lg_functionname: 'syncMasterGames',
    lg_caller: 'syncMasterGames',
    lg_msg: `${player}/${year}: ${inserted} inserted, ${skipped} skipped, ${total} total standard games found`,
    lg_severity: 'I'
  })

  const tDecon0 = Date.now()
  const decon = await deconstructGames_Master(level)
  const deconstructMs = Date.now() - tDecon0

  await logPipelineStep({
    step: 1, subStep: 'a', stepName: `${chesscomHandle}: Query chess.com API`, pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: 'chess.com API', inputRecs: yearArchives.length,
    outputTable: 'chess.com API', outputRecs: total,
    durationMs: queryMs, forceNewRun
  })
  await logPipelineStep({
    step: 1, subStep: 'b', stepName: `${chesscomHandle}: Fetch & Insert Raw Games`, pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: 'chess.com API', inputRecs: total,
    outputTable: 'wk_mgr_gamesraw', outputRecs: inserted,
    durationMs: fetchMs, forceNewRun: false
  })
  await logPipelineStep({
    step: 1, subStep: 'c', stepName: `${chesscomHandle}: Deconstruct Master Games`, pipelineType: PIPELINE_TYPE_MASTERGAMES,
    inputTable: 'wk_mgr_gamesraw', inputRecs: decon.rawScanned,
    outputTable: 'tmgd_gamesdecon', outputRecs: decon.processed,
    durationMs: deconstructMs, forceNewRun: false
  })
  await logEnd('syncMasterGames', 'masterGamesPipelineRoute', `${inserted} inserted, ${skipped} skipped, ${total} total, ${decon.processed} deconstructed`, level)

  return { inserted, skipped, total, deconstructed: decon.processed }
}
