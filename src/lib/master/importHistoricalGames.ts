'use server'

//==================================================================================================
//  1) DESCRIPTION
//    importHistoricalGames — bulk PGN-file import of a historical games collection (e.g. the World
//    Chess Championship 1886-2018 collection, or a future collection such as Morphy games) directly
//    into tmgd_gamesdecon, bypassing the chess.com-sync path entirely (wk_mgr_gamesraw/
//    deconstructGames_Master are untouched — that path expects a real chess.com API JSON blob and
//    UUID, neither of which exists for a plain PGN file). Two independently re-runnable pipeline
//    steps, mirroring the FIDE pipeline's stage shape (see fideStaging.ts):
//      uploadHistoricalPgn        — stage 1: splits an uploaded PGN blob into individual games,
//                                    stages them in wk_hpg_historicalpgnraw under a collection label.
//      deconstructHistoricalGames — stage 2: parses every staged game's headers, auto-creates any
//                                    missing tmst_master_players rows, and inserts into
//                                    tmgd_gamesdecon. Downstream, the existing (unmodified)
//                                    buildPositionTree_Master/syncTposFromTgam_Master reuse this
//                                    output exactly as they would for a chess.com-synced game.
//
//    Design decisions agreed with the user (see docs/plans/PLAN_world-championship-games.md):
//      - One tmgd_gamesdecon row per game — White is always mgd_player. The Black-side participant
//        (also possibly a tracked master) won't see this game in their own Moves/Games Played list
//        via mgd_player, matching the existing chess.com-sync dedup convention's own accepted gap.
//      - A historical player with no chess.com account gets mst_chesscom_handle = NULL; mgd_player/
//        mgd_white_username/mgd_black_username fall back to a normalized full-name slug
//        (historicalPlayerSlug) for that player instead of a real handle. A player who already has a
//        real handle keeps using it, so their existing games/queries are unaffected.
//      - No chess.com UUID exists, so mgd_chesscom_uuid stays NULL; re-run idempotency uses a
//        natural key (White + Black + end_time + Round) instead.
//==================================================================================================

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { countMoves, parsePgnOpening, normalizeTermination } from '../parsePgn'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from '../actions/pipelineLog'
import { historicalPlayerSlug } from '../historicalPlayerSlug'
import { HISTORICAL_TIME_CLASS, MIN_ANALYSIS_MOVE_Master, PIPELINE_TYPE_HISTORICALGAMES } from '../constants'

const HISTORICAL_RAW_TABLE = 'wk_hpg_historicalpgnraw'
const MASTER_PLAYERS_TABLE = 'tmst_master_players'
const MASTER_DECON_TABLE = 'tmgd_gamesdecon'

//
//  A game with fewer half-moves than this can never produce a trackable position
//  (buildPositionTree_Master's analysis window starts at MIN_ANALYSIS_MOVE_Master) — same
//  computation deconstructGames_Master uses, not an independently tunable value.
//
const HISTORICAL_MIN_TRACKABLE_HALF_MOVES = (MIN_ANALYSIS_MOVE_Master - 1) * 2

type ExistingMaster = { mstid: number; firstName: string; lastName: string; chesscomHandle: string | null }

//----------------------------------------------------------------------------------
//  getHeader — extract a single PGN header value by tag name (generic, not chess.com-specific)
//----------------------------------------------------------------------------------
function getHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))
  return match?.[1] ?? ''
}

//----------------------------------------------------------------------------------
//  splitIntoGames — splits a multi-game PGN blob into individual game texts, on the boundary
//  right before each "[Event " tag
//----------------------------------------------------------------------------------
function splitIntoGames(pgnText: string): string[] {
  return pgnText
    .split(/\n(?=\[Event )/)
    .map(g => g.trim())
    .filter(g => g.length > 0)
}

//----------------------------------------------------------------------------------
//  splitPgnPlayerName — a PGN White/Black header is "Firstname [Middle...] Lastname"; the last
//  space-separated word becomes the surname, everything before it the first/middle name(s). A
//  single-word name (no space) becomes an empty first name, matching splitFideName's fallback
//  (fidePipeline.ts) for the same no-separator case.
//----------------------------------------------------------------------------------
function splitPgnPlayerName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim()
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) return { firstName: '', lastName: trimmed }
  return { firstName: trimmed.slice(0, lastSpace).trim(), lastName: trimmed.slice(lastSpace + 1).trim() }
}

//----------------------------------------------------------------------------------
//  parseHistoricalDate — PGN Date header "YYYY.MM.DD" (unknown parts as "??") to a unix-seconds
//  UTC-midnight timestamp for mgd_end_time. Returns null if unparseable (game is then skipped —
//  mgd_end_time is NOT NULL). The real date, unmodified — mgd_end_time is bigint, so any real
//  historical date (including pre-1901 games, which overflow a 32-bit integer) fits exactly.
//----------------------------------------------------------------------------------
function parseHistoricalDate(dateHeader: string): number | null {
  const match = dateHeader.match(/^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const month = match[2] === '??' ? 1 : parseInt(match[2], 10)
  const day = match[3] === '??' ? 1 : parseInt(match[3], 10)
  return Math.floor(Date.UTC(year, month - 1, day) / 1000)
}

//----------------------------------------------------------------------------------
//  resolveHistoricalMasterIdentifiers — given every unique (firstName, lastName) pair appearing
//  as White/Black across the batch, returns a "firstName|lastName" (lowercased) -> identifier map,
//  where identifier is the master's real chess.com handle if it already has one, else its
//  historicalPlayerSlug. Matches an existing tmst_master_players row by surname (case-insensitive),
//  disambiguating by first name only on a surname collision — mirrors fidePipeline.ts's
//  findUnlinkedRowByName, except it matches against every existing row (not only fideid-less ones),
//  since a historical player may already be a fully-linked master under a spelling variant of their
//  first name (e.g. PGN "Alexey Shirov" vs. the already-tracked "Alexei Shirov"). Inserts a new,
//  handle-less tmst_master_players row for any name with no match.
//----------------------------------------------------------------------------------
async function resolveHistoricalMasterIdentifiers(names: { firstName: string; lastName: string }[]): Promise<Map<string, string>> {
  const existingResult = await table_fetch({
    caller: 'resolveHistoricalMasterIdentifiers',
    table: MASTER_PLAYERS_TABLE,
    columns: ['mst_mstid', 'mst_first_name', 'mst_last_name', 'mst_chesscom_handle'],
    skipCache: true
  })
  const existing: ExistingMaster[] = existingResult.ok
    ? existingResult.data.map((r: any) => ({
        mstid: Number(r.mst_mstid),
        firstName: (r.mst_first_name as string) ?? '',
        lastName: r.mst_last_name as string,
        chesscomHandle: (r.mst_chesscom_handle as string) ?? null
      }))
    : []
  if (!existingResult.ok) {
    write_logging({
      lg_functionname: 'resolveHistoricalMasterIdentifiers',
      lg_caller: 'resolveHistoricalMasterIdentifiers',
      lg_msg: 'Failed to fetch existing master players: ' + existingResult.error,
      lg_severity: 'E'
    })
  }

  const uniqueNames = new Map<string, { firstName: string; lastName: string }>()
  for (const n of names) uniqueNames.set(`${n.firstName.toLowerCase()}|${n.lastName.toLowerCase()}`, n)

  const identifierMap = new Map<string, string>()

  for (const [key, { firstName, lastName }] of uniqueNames) {
    const bySurname = existing.filter(e => e.lastName.toLowerCase() === lastName.toLowerCase())
    let match: ExistingMaster | null = null
    if (bySurname.length === 1) match = bySurname[0]
    else if (bySurname.length > 1) {
      const byFirstNameToo = bySurname.filter(e => e.firstName.toLowerCase() === firstName.toLowerCase())
      if (byFirstNameToo.length === 1) match = byFirstNameToo[0]
    }

    if (match) {
      identifierMap.set(key, match.chesscomHandle ?? historicalPlayerSlug(match.firstName, match.lastName))
      continue
    }

    const insertResult = await table_write({
      caller: 'resolveHistoricalMasterIdentifiers',
      table: MASTER_PLAYERS_TABLE,
      columnValuePairs: [
        { column: 'mst_first_name', value: firstName || null },
        { column: 'mst_last_name', value: lastName },
        { column: 'mst_fideid', value: null },
        { column: 'mst_grade', value: null },
        { column: 'mst_priority', value: false },
        { column: 'mst_chesscom_handle', value: null }
      ]
    })
    if (!insertResult.ok) {
      write_logging({
        lg_functionname: 'resolveHistoricalMasterIdentifiers',
        lg_caller: 'resolveHistoricalMasterIdentifiers',
        lg_msg: `Failed to insert new master player ${firstName} ${lastName}: ` + insertResult.error,
        lg_severity: 'E'
      })
    }
    identifierMap.set(key, historicalPlayerSlug(firstName, lastName))
  }

  return identifierMap
}

//==================================================================================================
//  1) DESCRIPTION
//    uploadHistoricalPgn — pipeline stage 1. Splits an uploaded PGN blob (one or more files'
//    worth, already concatenated) into individual games and stages them in
//    wk_hpg_historicalpgnraw under the given collection label. Truncates the staging table first
//    (mirrors downloadFideZip's own single-row-workfile truncate) — a new upload always replaces
//    whatever was staged from a previous, already-deconstructed collection.
//
//    Parameters:
//      collection   — display label for this batch (e.g. "World Chess Championship 1886-2018")
//      pgnText      — raw PGN text, one or more games, in standard multi-game PGN format
//      level        — logging call-hierarchy depth (default 1)
//      forceNewRun  — allocate a new pipeline run id instead of joining the current one
//
//    Returns:
//      staged — number of individual games written to wk_hpg_historicalpgnraw
//==================================================================================================
export async function uploadHistoricalPgn(
  collection: string,
  pgnText: string,
  level: number = 1,
  forceNewRun: boolean = true
): Promise<{ staged: number }> {
  await logStart('uploadHistoricalPgn', 'historicalGamesPipelineRoute', `staging "${collection}"`, level)
  const t0 = Date.now()

  const games = splitIntoGames(pgnText)

  await table_truncate(HISTORICAL_RAW_TABLE, 'uploadHistoricalPgn', true, level, 'I')

  let staged = 0
  for (const pgn of games) {
    const writeResult = await table_write({
      caller: 'uploadHistoricalPgn',
      table: HISTORICAL_RAW_TABLE,
      columnValuePairs: [
        { column: 'hpg_collection', value: collection },
        { column: 'hpg_pgn', value: pgn }
      ]
    })
    if (writeResult.ok) staged++
    else {
      write_logging({
        lg_functionname: 'uploadHistoricalPgn',
        lg_caller: 'uploadHistoricalPgn',
        lg_msg: 'Failed to stage a historical game: ' + writeResult.error,
        lg_severity: 'E'
      })
    }
  }

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 1, subStep: 'a', stepName: 'Upload PGN Collection', pipelineType: PIPELINE_TYPE_HISTORICALGAMES,
    inputTable: collection, inputRecs: games.length,
    outputTable: HISTORICAL_RAW_TABLE, outputRecs: staged,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'uploadHistoricalPgn', lg_caller: 'historicalGamesPipelineRoute',
    lg_msg: `Staged ${staged}/${games.length} games for "${collection}"`, lg_severity: 'I'
  })
  await logEnd('uploadHistoricalPgn', 'historicalGamesPipelineRoute', `${staged} staged`, level)
  return { staged }
}

//==================================================================================================
//  1) DESCRIPTION
//    deconstructHistoricalGames — pipeline stage 2. Reads every wk_hpg_historicalpgnraw row,
//    parses each game's PGN headers directly (no chess.com JSON involved), auto-creates any
//    missing tmst_master_players rows for White/Black names not already matched to an existing
//    master, and inserts into tmgd_gamesdecon. Downstream, buildPositionTree_Master/
//    syncTposFromTgam_Master (unmodified) pick these rows up exactly like any chess.com-synced
//    game.
//
//    Parameters:
//      level        — logging call-hierarchy depth (default 1)
//      forceNewRun  — allocate a new pipeline run id instead of joining the current one
//
//    Returns:
//      processed — games successfully inserted into tmgd_gamesdecon
//      skipped   — games skipped (too short to be trackable, unparseable date, or already present
//                  — natural-key dedup on White + Black + end_time + Round, since there's no
//                  chess.com UUID to dedup on)
//      errors    — games that failed to insert
//==================================================================================================
export async function deconstructHistoricalGames(
  level: number = 1,
  forceNewRun: boolean = false
): Promise<{ processed: number; skipped: number; errors: number }> {
  await logStart('deconstructHistoricalGames', 'historicalGamesPipelineRoute', 'deconstructing staged historical games', level)
  const t0 = Date.now()

  const rawResult = await table_fetch({
    caller: 'deconstructHistoricalGames',
    table: HISTORICAL_RAW_TABLE,
    skipCache: true
  })
  if (!rawResult.ok) {
    write_logging({
      lg_functionname: 'deconstructHistoricalGames',
      lg_caller: 'deconstructHistoricalGames',
      lg_msg: 'Failed to fetch staged historical games: ' + rawResult.error,
      lg_severity: 'E'
    })
    await logEnd('deconstructHistoricalGames', 'historicalGamesPipelineRoute', 'failed to fetch staged games', level)
    return { processed: 0, skipped: 0, errors: 0 }
  }

  const existingResult = await table_fetch({
    caller: 'deconstructHistoricalGames_existing',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_round', operator: 'IS NOT NULL', value: null }],
    columns: ['mgd_white_username', 'mgd_black_username', 'mgd_end_time', 'mgd_round'],
    skipCache: true
  })
  const existingKeys = new Set(
    existingResult.ok
      ? existingResult.data.map((r: any) => `${r.mgd_white_username}|${r.mgd_black_username}|${r.mgd_end_time}|${r.mgd_round}`)
      : []
  )

  //
  //  Parse headers for every staged game up front, so every unique player name across the whole
  //  batch can be resolved/created in one pass (resolveHistoricalMasterIdentifiers) before any
  //  tmgd_gamesdecon row is written.
  //
  const parsedGames = rawResult.data.map((row: any) => {
    const pgn = row.hpg_pgn as string
    const white = splitPgnPlayerName(getHeader(pgn, 'White'))
    const black = splitPgnPlayerName(getHeader(pgn, 'Black'))
    return {
      pgn,
      white, black,
      event: getHeader(pgn, 'Event'),
      round: getHeader(pgn, 'Round'),
      date: getHeader(pgn, 'Date'),
      result: getHeader(pgn, 'Result'),
      eco: getHeader(pgn, 'ECO'),
      termination: getHeader(pgn, 'Termination')
    }
  })

  const identifierMap = await resolveHistoricalMasterIdentifiers(
    parsedGames.flatMap((g: any) => [g.white, g.black])
  )

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const g of parsedGames) {
    try {
      if (countMoves(g.pgn) <= HISTORICAL_MIN_TRACKABLE_HALF_MOVES) { skipped++; continue }

      const endTime = parseHistoricalDate(g.date)
      if (endTime === null) { skipped++; continue }

      const whiteId = identifierMap.get(`${g.white.firstName.toLowerCase()}|${g.white.lastName.toLowerCase()}`)!
      const blackId = identifierMap.get(`${g.black.firstName.toLowerCase()}|${g.black.lastName.toLowerCase()}`)!

      const naturalKey = `${whiteId}|${blackId}|${endTime}|${g.round}`
      if (existingKeys.has(naturalKey)) { skipped++; continue }
      existingKeys.add(naturalKey)

      let playerResult = 'draw'
      if (g.result === '1-0') playerResult = 'win'
      else if (g.result === '0-1') playerResult = 'loss'

      const writeResult = await table_write({
        caller: 'deconstructHistoricalGames',
        table: MASTER_DECON_TABLE,
        columnValuePairs: [
          { column: 'mgd_white_username', value: whiteId },
          { column: 'mgd_black_username', value: blackId },
          { column: 'mgd_white_rating', value: 0 },
          { column: 'mgd_black_rating', value: 0 },
          { column: 'mgd_player', value: whiteId },
          { column: 'mgd_player_color', value: 'white' },
          { column: 'mgd_player_result', value: playerResult },
          { column: 'mgd_opponent_username', value: blackId },
          { column: 'mgd_opponent_rating', value: 0 },
          { column: 'mgd_time_class', value: HISTORICAL_TIME_CLASS },
          { column: 'mgd_time_control', value: null },
          { column: 'mgd_is_rated', value: true },
          { column: 'mgd_termination', value: g.termination ? normalizeTermination(g.termination) : null },
          { column: 'mgd_end_time', value: endTime },
          { column: 'mgd_eco_code', value: g.eco || null },
          { column: 'mgd_opening_name', value: null },
          { column: 'mgd_game_url', value: null },
          { column: 'mgd_opening_moves', value: parsePgnOpening(g.pgn) },
          { column: 'mgd_pgn', value: g.pgn },
          { column: 'mgd_chesscom_uuid', value: null },
          { column: 'mgd_event', value: g.event || null },
          { column: 'mgd_round', value: g.round || null }
        ],
        skipCache: true
      })
      if (!writeResult.ok) {
        write_logging({
          lg_functionname: 'deconstructHistoricalGames',
          lg_caller: 'deconstructHistoricalGames',
          lg_msg: `Failed to write historical decon row (${whiteId} vs ${blackId}, ${g.date}): ` + writeResult.error,
          lg_severity: 'E'
        })
        errors++
        continue
      }
      processed++
    } catch (err) {
      write_logging({
        lg_functionname: 'deconstructHistoricalGames',
        lg_caller: 'deconstructHistoricalGames',
        lg_msg: `Error deconstructing historical game (${g.white.firstName} ${g.white.lastName} vs ${g.black.firstName} ${g.black.lastName}, ${g.date}): ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 2, subStep: 'a', stepName: 'Deconstruct Historical Games', pipelineType: PIPELINE_TYPE_HISTORICALGAMES,
    inputTable: HISTORICAL_RAW_TABLE, inputRecs: parsedGames.length,
    outputTable: MASTER_DECON_TABLE, outputRecs: processed,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'deconstructHistoricalGames', lg_caller: 'historicalGamesPipelineRoute',
    lg_msg: `${processed} ${MASTER_DECON_TABLE} rows inserted, ${skipped} skipped, ${errors} errors`, lg_severity: 'I'
  })
  await logEnd('deconstructHistoricalGames', 'historicalGamesPipelineRoute', `${processed} processed, ${skipped} skipped, ${errors} errors`, level)

  return { processed, skipped, errors }
}

//----------------------------------------------------------------------------------
//  refreshHistoricalStatus — step 1/2's own status for the Owner Pipeline page: games
//  currently staged (awaiting deconstruction), and how many historical games (mgd_round IS NOT
//  NULL — the marker no chess.com-synced row ever has) already exist in tmgd_gamesdecon.
//----------------------------------------------------------------------------------
export async function refreshHistoricalStatus(): Promise<{ staged: number; decon: number }> {
  const result = await table_query({
    caller: 'refreshHistoricalStatus', table: HISTORICAL_RAW_TABLE, params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM ${HISTORICAL_RAW_TABLE}) AS staged,
      (SELECT COUNT(*) FROM ${MASTER_DECON_TABLE} WHERE mgd_round IS NOT NULL) AS decon`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshHistoricalStatus',
      lg_caller: 'refreshHistoricalStatus',
      lg_msg: 'Failed to fetch historical import status: ' + result.error,
      lg_severity: 'E'
    })
    return { staged: 0, decon: 0 }
  }
  const r = result.data[0] ?? {}
  return { staged: parseInt(r.staged ?? '0'), decon: parseInt(r.decon ?? '0') }
}
