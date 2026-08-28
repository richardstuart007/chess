'use server'

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { table_delete } from 'nextjs-shared/table_delete'
import { write_logging } from 'nextjs-shared/write_logging'
import type { Filter } from 'nextjs-shared/structures'
import { Chess } from 'chess.js'
import { GAME_LIST_ROWS_DEFAULT_Master, MASTER_GAMES_FOR_FEN_LIMIT } from '../constants'
import { getMasterHandleNameMap, getMasterPlayers } from '../actions/masterPlayers'
import { truncateFen } from '../fen'
import { classifyMove } from '../stockfish'
import { getPositionEvaluationsBulk_shared, upgradePositionEvaluation_shared } from '../analysis/chessdb_shared'
import type { GameEvalRow } from '../actions/games'

const MASTER_DECON_TABLE = 'tmgd_gamesdecon'

//----------------------------------------------------------------------------------
//  getMasterGameById — reads from tmgd_gamesdecon, matched by its own
//  permanent mgd_mgdid. Mirrors games.ts's getGameById.
//----------------------------------------------------------------------------------
export async function getMasterGameById(mgdid: number) {
  const result = await table_fetch({
    caller: 'getMasterGameById',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_mgdid', value: mgdid }]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterGameById',
      lg_caller: 'getMasterGameById',
      lg_msg: 'Failed to fetch master game ' + mgdid + ': ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  const row = result.data[0] ?? null
  if (!row) return null

  const nameMap = await getMasterHandleNameMap()
  return { ...row, mgd_player_name: nameMap[(row.mgd_player as string).toLowerCase()] ?? row.mgd_player }
}

export type MasterGameFilters = {
  mgdid?: number
  player?: string
  opponent?: string
  opponentRatingMin?: number
  opponentRatingMax?: number
  result?: string
  termination?: string[]
  color?: string
  timeClass?: string
  opening?: string
  openingNameExact?: string
  eco?: string
  dateFrom?: string
  dateTo?: string
}

//----------------------------------------------------------------------------------
//  buildMasterGameFilters — mirrors games.ts's buildFilters
//----------------------------------------------------------------------------------
function buildMasterGameFilters(filters: MasterGameFilters): Filter[] {
  const result: Filter[] = []

  if (filters.mgdid) {
    result.push({ column: 'mgd_mgdid', operator: '=', value: filters.mgdid })
  }
  if (filters.player) {
    result.push({ column: 'mgd_player', operator: '=', value: filters.player.toLowerCase() })
  }
  if (filters.opponent) {
    result.push({ column: 'mgd_opponent_username', operator: 'LIKE', value: filters.opponent })
  }
  const ratingOverlap = filters.opponentRatingMin && filters.opponentRatingMax &&
    filters.opponentRatingMin > filters.opponentRatingMax
  if (!ratingOverlap) {
    if (filters.opponentRatingMin)
      result.push({ column: 'mgd_opponent_rating', operator: '>=', value: filters.opponentRatingMin })
    if (filters.opponentRatingMax)
      result.push({ column: 'mgd_opponent_rating', operator: '<=', value: filters.opponentRatingMax })
  }
  if (filters.result) {
    result.push({ column: 'mgd_player_result', operator: '=', value: filters.result })
  }
  if (filters.termination && filters.termination.length > 0) {
    result.push({ column: 'mgd_termination', operator: 'IN', value: filters.termination })
  }
  if (filters.color) {
    result.push({ column: 'mgd_player_color', operator: '=', value: filters.color })
  }
  if (filters.timeClass) {
    result.push({ column: 'mgd_time_class', operator: '=', value: filters.timeClass })
  }
  if (filters.opening) {
    result.push({ column: 'mgd_opening_name', operator: 'LIKE', value: filters.opening })
  }
  if (filters.openingNameExact) {
    result.push({ column: 'mgd_opening_name', operator: '=', value: filters.openingNameExact })
  }
  if (filters.eco) {
    result.push({ column: 'mgd_eco_code', operator: 'LIKE', value: filters.eco })
  }
  if (filters.dateFrom) {
    const unixFrom = Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    result.push({ column: 'mgd_end_time', operator: '>=', value: unixFrom })
  }
  if (filters.dateTo) {
    const unixTo = Math.floor(new Date(filters.dateTo + 'T23:59:59').getTime() / 1000)
    result.push({ column: 'mgd_end_time', operator: '<=', value: unixTo })
  }

  return result
}

//----------------------------------------------------------------------------------
//  fetchFilteredMasterGames — mirrors games.ts's fetchFilteredGames, against
//  tmgd_gamesdecon (secondary database)
//----------------------------------------------------------------------------------
export async function fetchFilteredMasterGames(
  filters: MasterGameFilters,
  page: number,
  itemsPerPage: number = GAME_LIST_ROWS_DEFAULT_Master
) {
  const filterArray = buildMasterGameFilters(filters)
  const offset = (page - 1) * itemsPerPage

  const result = await fetchFiltered({
    table: MASTER_DECON_TABLE,
    filters: filterArray,
    orderBy: 'mgd_end_time DESC',
    limit: itemsPerPage > 0 ? itemsPerPage : undefined,
    offset,
    caller: 'fetchFilteredMasterGames'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'fetchFilteredMasterGames',
      lg_caller: 'fetchFilteredMasterGames',
      lg_msg: 'Failed to fetch filtered master games: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }

  const nameMap = await getMasterHandleNameMap()
  return result.data.map((row: any) => ({
    ...row,
    mgd_player_name: nameMap[(row.mgd_player as string).toLowerCase()] ?? row.mgd_player
  }))
}

//----------------------------------------------------------------------------------
//  getMasterGamesPageCount — mirrors games.ts's getGamesPageCount
//----------------------------------------------------------------------------------
export async function getMasterGamesPageCount(
  filters: MasterGameFilters,
  itemsPerPage: number = GAME_LIST_ROWS_DEFAULT_Master
): Promise<number> {
  const filterArray = buildMasterGameFilters(filters)
  const result = await fetchTotalPages({
    table: MASTER_DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'getMasterGamesPageCount'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterGamesPageCount',
      lg_caller: 'getMasterGamesPageCount',
      lg_msg: 'Failed to fetch master games page count: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}

export type MasterFenMoveBreakdown = {
  move_played: string
  move_uci:    string | null
  times:       number
  wins:        number
  losses:      number
  draws:       number
  avgOpponentRating: number
}

export type MasterFenGameHit = {
  mgd_mgdid:      number
  move_played:    string
  white_username: string
  black_username: string
  year:           number
  player:         string   // the tracked master's chess.com handle (matches white_username or black_username)
  result:         string   // objective chess result: '1-0' | '0-1' | '½-½' — never player-perspective
}

//----------------------------------------------------------------------------------
//  objectiveResult — derives '1-0'/'0-1'/'½-½' from the tracked master's own color +
//  result, since mgd_player_result is stored relative to whichever side mgd_player
//  played, which callers can't otherwise tell apart from White/Black in the UI.
//----------------------------------------------------------------------------------
function objectiveResult(playerColor: string, playerResult: string): string {
  if (playerResult === 'draw') return '½-½'
  const playerWon = playerResult === 'win'
  const whiteWon = (playerColor === 'white' && playerWon) || (playerColor === 'black' && !playerWon)
  return whiteWon ? '1-0' : '0-1'
}

//----------------------------------------------------------------------------------
//  getMasterGamesForFen — every recorded occurrence of an exact FEN across all synced
//  master players, via tmpos_positions (mpos_fen, unique-indexed) -> tmgam_game_positions
//  (mgam_pos_id, indexed) -> tmgd_gamesdecon (mgam_mgdid). Returns both a per-move
//  breakdown (mirrors buildHabits' move-grouping shape) and the raw per-game rows,
//  so callers can render either a summary table or a full game list from one fetch.
//----------------------------------------------------------------------------------
export async function getMasterGamesForFen(fen: string, limit: number = MASTER_GAMES_FOR_FEN_LIMIT): Promise<{
  reached: number
  moves:   MasterFenMoveBreakdown[]
  games:   MasterFenGameHit[]
}> {
  const posResult = await table_query({
    caller: 'getMasterGamesForFen_position',
    table: 'tmpos_positions',
    query: `SELECT mpos_id, mpos_reached FROM tmpos_positions WHERE mpos_fen = $1`,
    params: [truncateFen(fen)],
    skipCache: true
  })
  if (!posResult.ok || posResult.data.length === 0) {
    if (!posResult.ok) {
      write_logging({
        lg_functionname: 'getMasterGamesForFen',
        lg_caller: 'getMasterGamesForFen_position',
        lg_msg: 'Failed to fetch master position: ' + posResult.error,
        lg_severity: 'E'
      })
    }
    return { reached: 0, moves: [], games: [] }
  }
  const posId   = posResult.data[0].mpos_id
  const reached = parseInt(posResult.data[0].mpos_reached ?? '0')

  const gamesResult = await table_query({
    caller: 'getMasterGamesForFen_games',
    table: 'tmgam_game_positions',
    query: `
      SELECT g.mgam_move_played, g.mgam_move_uci,
             d.mgd_mgdid, d.mgd_white_username, d.mgd_black_username,
             d.mgd_player, d.mgd_player_color, d.mgd_player_result,
             d.mgd_opponent_rating, d.mgd_end_time
      FROM tmgam_game_positions g
      JOIN tmgd_gamesdecon d ON d.mgd_mgdid = g.mgam_mgdid
      WHERE g.mgam_pos_id = $1
      ORDER BY d.mgd_end_time DESC
      LIMIT $2
    `,
    params: [posId, limit],
    skipCache: true
  })
  if (!gamesResult.ok) {
    write_logging({
      lg_functionname: 'getMasterGamesForFen',
      lg_caller: 'getMasterGamesForFen_games',
      lg_msg: 'Failed to fetch master games for position: ' + gamesResult.error,
      lg_severity: 'E'
    })
    return { reached, moves: [], games: [] }
  }

  const games: MasterFenGameHit[] = gamesResult.data.map((r: any) => ({
    mgd_mgdid:      r.mgd_mgdid,
    move_played:    r.mgam_move_played,
    white_username: r.mgd_white_username,
    black_username: r.mgd_black_username,
    year:           new Date(r.mgd_end_time * 1000).getUTCFullYear(),
    player:         r.mgd_player,
    result:         objectiveResult(r.mgd_player_color, r.mgd_player_result)
  }))

  const byMove = new Map<string, { move_uci: string | null; times: number; wins: number; losses: number; draws: number; ratingSum: number }>()
  for (const r of gamesResult.data) {
    const key = r.mgam_move_played as string
    const entry = byMove.get(key) ?? { move_uci: r.mgam_move_uci, times: 0, wins: 0, losses: 0, draws: 0, ratingSum: 0 }
    entry.times++
    entry.ratingSum += r.mgd_opponent_rating ?? 0
    if (r.mgd_player_result === 'win') entry.wins++
    else if (r.mgd_player_result === 'loss') entry.losses++
    else if (r.mgd_player_result === 'draw') entry.draws++
    byMove.set(key, entry)
  }
  const moves: MasterFenMoveBreakdown[] = [...byMove.entries()]
    .map(([move_played, e]) => ({
      move_played,
      move_uci: e.move_uci,
      times: e.times,
      wins: e.wins,
      losses: e.losses,
      draws: e.draws,
      avgOpponentRating: e.times > 0 ? Math.round(e.ratingSum / e.times) : 0
    }))
    .sort((a, b) => b.times - a.times)

  return { reached, moves, games }
}

export type SyncedMasterPlayer = { handle: string; name: string; grade: number | null }

//----------------------------------------------------------------------------------
//  getSyncedMasterPlayers — distinct mgd_player handles actually present in
//  tmgd_gamesdecon, each paired with its real name and grade (merged in from
//  tmst_master_players, primary database — no cross-database join possible), for the
//  Masters Games list's Player filter (as opposed to MasterPlayerSelect, which lists
//  every known master player regardless of whether they've been synced — this only
//  lists ones with real data to filter by). Sorted by grade descending (NULLS last).
//
//  Change history:
//    2026-08-28 — row now carries `grade`; result sorted grade-descending instead of
//                 alphabetical by handle (FilterMasterPlayerSelect shows "Name (grade)")
//----------------------------------------------------------------------------------
export async function getSyncedMasterPlayers(): Promise<SyncedMasterPlayer[]> {
  const result = await table_query({
    caller: 'getSyncedMasterPlayers',
    table: MASTER_DECON_TABLE,
    query: `SELECT DISTINCT mgd_player FROM ${MASTER_DECON_TABLE} ORDER BY mgd_player`,
    params: [],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getSyncedMasterPlayers',
      lg_caller: 'getSyncedMasterPlayers',
      lg_msg: 'Failed to fetch synced master players: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }

  //
  //  One pass over every known master to build handle (lowercased) → { name, grade }.
  //
  const allMasters = await getMasterPlayers('')
  const infoMap: Record<string, { name: string; grade: number | null }> = {}
  for (const m of allMasters) {
    if (m.chesscomHandle) {
      infoMap[m.chesscomHandle.toLowerCase()] = {
        name: m.firstName ? `${m.firstName} ${m.lastName}` : m.lastName,
        grade: m.grade
      }
    }
  }

  const players = result.data.map((r: any) => {
    const handle = r.mgd_player as string
    const info = infoMap[handle.toLowerCase()]
    return { handle, name: info?.name ?? handle, grade: info?.grade ?? null }
  })
  players.sort((a, b) => (b.grade ?? -Infinity) - (a.grade ?? -Infinity))
  return players
}

//----------------------------------------------------------------------------------
//  saveMasterGameEvaluations_master — write per-move Stockfish evals from
//  MasterGameView_master's "Analyze Game" to tmgev_game_evals (secondary database,
//  this game's own durable cache — mirrors games.ts's saveGameEvaluations_player
//  exactly). For any ply whose FEN already exists in the primary database's
//  tpos_positions, also tops up tpose_positions_eval via
//  upgradePositionEvaluation_shared with createIfMissing:false — a master game may
//  deepen a position the tracked player has already reached, but never creates a
//  new tpos_positions row of its own.
//----------------------------------------------------------------------------------
export async function saveMasterGameEvaluations_master(mgdid: number, evaluations: (GameEvalRow | undefined)[]): Promise<void> {
  await table_delete({
    caller: 'saveMasterGameEvaluations_master_delete',
    table: 'tmgev_game_evals',
    whereColumnValuePairs: [{ column: 'mgev_mgdid', value: mgdid }],
    skipCache: true
  })

  const rows = evaluations
    .map((e, ply) => ({ e, ply }))
    .filter((r): r is { e: GameEvalRow; ply: number } => r.e != null)
  if (rows.length === 0) return

  const values = rows.map((_, idx) => {
    const b = idx * 10
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`
  }).join(',')
  const params = rows.flatMap(({ e, ply }) => [
    mgdid, ply, e.san, truncateFen(e.fen), e.cp, e.cpChange, e.bestMove, e.bestMoveSan, JSON.stringify(e.bestLineSans), e.depth
  ])

  await table_query({
    caller: 'saveMasterGameEvaluations_master_insert',
    table: 'tmgev_game_evals',
    query: `
      INSERT INTO tmgev_game_evals
        (mgev_mgdid, mgev_ply, mgev_san, mgev_fen_after, mgev_cp, mgev_cp_change, mgev_best_move, mgev_best_move_san, mgev_best_line, mgev_depth)
      VALUES ${values}
    `,
    params,
    isupdate: true
  })

  for (const { e } of rows) {
    await upgradePositionEvaluation_shared({
      fen: e.fen,
      cp: e.cp,
      bestMove: e.bestMove || null,
      depth: e.depth,
      createIfMissing: false
    })
  }
}

//----------------------------------------------------------------------------------
//  getMasterGameEvals_master — per-ply evals for display, preferring
//  tpose_positions_eval (the primary database's shared position cache) over
//  tmgev_game_evals' own stored value wherever pose has an equal-or-deeper record,
//  falling back to tmgev's own value otherwise. Mirrors games.ts's
//  getGameEvals_player exactly, against this master game's own PGN/tmgev_game_evals
//  (secondary database) — the getPositionEvaluationsBulk_shared call reaches the
//  primary database separately, never in a single cross-database join.
//----------------------------------------------------------------------------------
export async function getMasterGameEvals_master(mgdid: number): Promise<(GameEvalRow | undefined)[]> {
  const gameResult = await table_fetch({
    caller: 'getMasterGameEvals_master_pgn',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_mgdid', value: mgdid }],
    columns: ['mgd_pgn'],
    skipCache: true
  })
  if (!gameResult.ok) {
    write_logging({
      lg_functionname: 'getMasterGameEvals_master',
      lg_caller: 'getMasterGameEvals_master_pgn',
      lg_msg: 'Failed to fetch master game PGN for ' + mgdid + ': ' + gameResult.error,
      lg_severity: 'E'
    })
    return []
  }
  const pgn = gameResult.data[0]?.mgd_pgn as string | undefined
  if (!pgn) return []

  const g = new Chess()
  try {
    g.loadPgn(pgn)
  } catch {
    return []
  }
  const sanMoves = g.history()
  if (sanMoves.length === 0) return []

  const g2 = new Chess()
  const fens = [g2.fen()]
  for (const san of sanMoves) {
    g2.move(san)
    fens.push(g2.fen())
  }

  const tmgevResult = await table_fetch({
    caller: 'getMasterGameEvals_master',
    table: 'tmgev_game_evals',
    whereColumnValuePairs: [{ column: 'mgev_mgdid', value: mgdid }],
    orderBy: 'mgev_ply',
    columns: ['mgev_ply', 'mgev_cp', 'mgev_best_move', 'mgev_best_move_san', 'mgev_best_line', 'mgev_depth'],
    skipCache: true
  })
  if (!tmgevResult.ok) {
    write_logging({
      lg_functionname: 'getMasterGameEvals_master',
      lg_caller: 'getMasterGameEvals_master',
      lg_msg: 'Failed to fetch master game evals for ' + mgdid + ': ' + tmgevResult.error,
      lg_severity: 'E'
    })
    return []
  }
  const tmgevByPly = new Map<number, any>()
  for (const r of tmgevResult.data) tmgevByPly.set(Number(r.mgev_ply), r)

  const poseEvals = await getPositionEvaluationsBulk_shared(fens)

  const result: (GameEvalRow | undefined)[] = []
  // Tracks the last ply that actually resolved to a real value — cpChange/cpBefore are
  // only meaningful relative to the immediately preceding ply, so a gap resets this
  // rather than letting a stale cp leak across it.
  let cpBefore = 0
  let havePrevCp = false

  for (let i = 0; i < sanMoves.length; i++) {
    const tmgevRow = tmgevByPly.get(i)
    const poseEval = poseEvals[truncateFen(fens[i + 1])]

    if (!tmgevRow && !poseEval) {
      result.push(undefined)
      havePrevCp = false
      continue
    }

    const mgevCp = tmgevRow?.mgev_cp ?? 0
    const mgevDepth = tmgevRow?.mgev_depth ?? 0
    const usePose = poseEval != null && poseEval.depth >= mgevDepth
    const cp = usePose ? poseEval.cp : mgevCp
    const depth = usePose ? poseEval.depth : mgevDepth

    const isWhiteMove = i % 2 === 0
    const cpChange = havePrevCp ? (isWhiteMove ? cp - cpBefore : cpBefore - cp) : 0
    const cpLoss = Math.max(0, -cpChange)

    result.push({
      san:           sanMoves[i],
      fen:           fens[i + 1],
      fenBefore:     fens[i],
      cp,
      cpBefore:      havePrevCp ? cpBefore : cp,
      bestMove:      tmgevRow?.mgev_best_move     ?? '',
      bestMoveSan:   tmgevRow?.mgev_best_move_san ?? '',
      bestLineSans:  Array.isArray(tmgevRow?.mgev_best_line) ? tmgevRow.mgev_best_line : [],
      cpLoss,
      cpChange,
      classification: classifyMove(cpLoss),
      depth
    })
    cpBefore = cp
    havePrevCp = true
  }

  return result
}
