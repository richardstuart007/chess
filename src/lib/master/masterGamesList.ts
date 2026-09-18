'use server'

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import type { Filter } from 'nextjs-shared/structures'
import { Chess } from 'chess.js'
import { GAME_LIST_ROWS_DEFAULT_Master, MASTER_GAMES_FOR_FEN_LIMIT } from '../constants'
import { getMasterHandleNameMap, getMasterPlayers } from '../actions/masterPlayers'
import { truncateFen } from '../fen'
import { classifyMove } from '../stockfish'
import { getPositionEvaluationsBulk_shared, getFenEvalsWithFallback_shared, upgradePositionEvaluation_shared } from '../analysis/chessdb_shared'
import { objectiveGameResult } from '../objectiveGameResult'
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
  move_played:       string
  move_uci:          string | null
  times:             number
  white:             number
  draws:             number
  black:             number
  avgOpponentRating: number
  cp:                number | null
  depth:             number | null
}

export type MasterFenGameHit = {
  mgd_mgdid:      number
  move_played:    string
  white_username: string
  black_username: string
  white_rating:   number
  black_rating:   number
  date:           string   // ISO YYYY-MM-DD, matching chessdb_player.ts's PositionGameHit.date
  player:         string   // the tracked master's chess.com handle (matches white_username or black_username)
  result:         string   // objective chess result: '1-0' | '0-1' | '½-½' — never player-perspective
  termination:    string | null
}

//----------------------------------------------------------------------------------
//  getMasterPositionByFen — looks up tmpos_positions' mpos_id/mpos_reached for an exact FEN.
//  Shared by getMasterGamesForFen, fetchMasterGamesForFenPage, and getMasterGamesForFenCount so
//  this lookup isn't duplicated three times.
//----------------------------------------------------------------------------------
async function getMasterPositionByFen(fen: string): Promise<{ posId: number; reached: number } | null> {
  const posResult = await table_query({
    caller: 'getMasterPositionByFen',
    table: 'tmpos_positions',
    query: `SELECT mpos_id, mpos_reached FROM tmpos_positions WHERE mpos_fen = $1`,
    params: [truncateFen(fen)],
    skipCache: true
  })
  if (!posResult.ok || posResult.data.length === 0) {
    if (!posResult.ok) {
      write_logging({
        lg_functionname: 'getMasterPositionByFen',
        lg_caller: 'getMasterPositionByFen',
        lg_msg: 'Failed to fetch master position: ' + posResult.error,
        lg_severity: 'E'
      })
    }
    return null
  }
  return {
    posId:   posResult.data[0].mpos_id,
    reached: parseInt(posResult.data[0].mpos_reached ?? '0')
  }
}

//----------------------------------------------------------------------------------
//  fetchMasterGamesForFenPage — one page of games from synced master players reaching this exact
//  FEN, real server-side pagination (mirrors fetchGamesForPosition_player). Used by
//  MasterGamesDbPanel's pagination footer — independent of getMasterGamesForFen's capped
//  moves-breakdown fetch below, which stays unpaginated (paging a per-move aggregate makes no
//  sense).
//----------------------------------------------------------------------------------
export async function fetchMasterGamesForFenPage(fen: string, page: number, itemsPerPage: number, move?: string): Promise<MasterFenGameHit[]> {
  const position = await getMasterPositionByFen(fen)
  if (!position) return []

  const offset = (page - 1) * itemsPerPage
  const params: (number | string)[] = [position.posId]
  const moveFilter = move ? `AND g.mgam_move_played = $${params.push(move)}` : ''
  params.push(itemsPerPage, offset)
  const gamesResult = await table_query({
    caller: 'fetchMasterGamesForFenPage',
    table: 'tmgam_game_positions',
    query: `
      SELECT g.mgam_move_played, g.mgam_move_uci,
             d.mgd_mgdid, d.mgd_white_username, d.mgd_black_username,
             d.mgd_white_rating, d.mgd_black_rating,
             d.mgd_player, d.mgd_player_color, d.mgd_player_result,
             d.mgd_opponent_rating, d.mgd_termination, d.mgd_end_time
      FROM tmgam_game_positions g
      JOIN tmgd_gamesdecon d ON d.mgd_mgdid = g.mgam_mgdid
      WHERE g.mgam_pos_id = $1
        ${moveFilter}
      ORDER BY d.mgd_end_time DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
    skipCache: true
  })
  if (!gamesResult.ok) {
    write_logging({
      lg_functionname: 'fetchMasterGamesForFenPage',
      lg_caller: 'fetchMasterGamesForFenPage',
      lg_msg: 'Failed to fetch master games page for position: ' + gamesResult.error,
      lg_severity: 'E'
    })
    return []
  }

  return gamesResult.data.map((r: any) => ({
    mgd_mgdid:      r.mgd_mgdid,
    move_played:    r.mgam_move_played,
    white_username: r.mgd_white_username,
    black_username: r.mgd_black_username,
    white_rating:   r.mgd_white_rating,
    black_rating:   r.mgd_black_rating,
    date:           new Date(r.mgd_end_time * 1000).toISOString().slice(0, 10),
    player:         r.mgd_player,
    result:         objectiveGameResult(r.mgd_player_color, r.mgd_player_result),
    termination:    r.mgd_termination ?? null
  }))
}

//----------------------------------------------------------------------------------
//  getMasterGamesForFenCount — total row count for fetchMasterGamesForFenPage's same position and
//  move filter. With no move filter, mpos_reached is already the exact count reaching this
//  position (see getMasterPositionByFen), so no query is needed; a move filter needs its own
//  COUNT(*) since mpos_reached covers every move, not just the filtered one.
//----------------------------------------------------------------------------------
export async function getMasterGamesForFenCount(fen: string, move?: string): Promise<number> {
  const position = await getMasterPositionByFen(fen)
  if (!position) return 0
  if (!move) return position.reached

  const countResult = await table_query({
    caller: 'getMasterGamesForFenCount',
    table: 'tmgam_game_positions',
    query: `SELECT COUNT(*)::int AS total FROM tmgam_game_positions WHERE mgam_pos_id = $1 AND mgam_move_played = $2`,
    params: [position.posId, move],
    skipCache: true
  })
  if (!countResult.ok) {
    write_logging({
      lg_functionname: 'getMasterGamesForFenCount',
      lg_caller: 'getMasterGamesForFenCount',
      lg_msg: 'Failed to fetch master games count for position: ' + countResult.error,
      lg_severity: 'E'
    })
    return 0
  }
  return countResult.data.length > 0 ? Number(countResult.data[0].total) : 0
}

//----------------------------------------------------------------------------------
//  getMasterGamesForFen — every recorded occurrence of an exact FEN across all synced
//  master players, via tmpos_positions (mpos_fen, unique-indexed) -> tmgam_game_positions
//  (mgam_pos_id, indexed) -> tmgd_gamesdecon (mgam_mgdid). Returns both a per-move
//  breakdown (mirrors buildHabits' move-grouping shape) and the raw per-game rows,
//  so callers can render either a summary table or a full game list from one fetch. Each
//  move's cp/depth come from getFenEvalsWithFallback_shared against that move's resulting
//  FEN (tmgev_game_evals first, tpose_positions_eval fallback) — null if neither has it.
//----------------------------------------------------------------------------------
export async function getMasterGamesForFen(fen: string, limit: number = MASTER_GAMES_FOR_FEN_LIMIT): Promise<{
  reached: number
  moves:   MasterFenMoveBreakdown[]
  games:   MasterFenGameHit[]
}> {
  const position = await getMasterPositionByFen(fen)
  if (!position) return { reached: 0, moves: [], games: [] }
  const { posId, reached } = position

  const gamesResult = await table_query({
    caller: 'getMasterGamesForFen_games',
    table: 'tmgam_game_positions',
    query: `
      SELECT g.mgam_move_played, g.mgam_move_uci, g.mgam_resulting_fen,
             d.mgd_mgdid, d.mgd_white_username, d.mgd_black_username,
             d.mgd_white_rating, d.mgd_black_rating,
             d.mgd_player, d.mgd_player_color, d.mgd_player_result,
             d.mgd_opponent_rating, d.mgd_termination, d.mgd_end_time
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
    white_rating:   r.mgd_white_rating,
    black_rating:   r.mgd_black_rating,
    date:           new Date(r.mgd_end_time * 1000).toISOString().slice(0, 10),
    player:         r.mgd_player,
    result:         objectiveGameResult(r.mgd_player_color, r.mgd_player_result),
    termination:    r.mgd_termination ?? null
  }))

  // Dedup by mgdid per move (a transposition can revisit the same position+move within
  // one game) and tally the OBJECTIVE white/draw/black outcome — never the tracked
  // master's own personal win/loss, which would mix perspectives across games where
  // different masters (or the same master as different colors) reached this move.
  const byMove = new Map<string, { move_uci: string | null; resultingFen: string | null; gdids: Set<number>; white: number; draws: number; black: number; ratingSum: number }>()
  for (const r of gamesResult.data) {
    const key = r.mgam_move_played as string
    const entry = byMove.get(key) ?? { move_uci: r.mgam_move_uci, resultingFen: r.mgam_resulting_fen ?? null, gdids: new Set<number>(), white: 0, draws: 0, black: 0, ratingSum: 0 }
    if (!entry.gdids.has(r.mgd_mgdid)) {
      entry.gdids.add(r.mgd_mgdid)
      entry.ratingSum += r.mgd_opponent_rating ?? 0
      const objResult = objectiveGameResult(r.mgd_player_color, r.mgd_player_result)
      if (objResult === '1-0') entry.white++
      else if (objResult === '0-1') entry.black++
      else entry.draws++
    }
    byMove.set(key, entry)
  }

  // Eval is resolved per move's resulting FEN — the same position regardless of which game
  // reached it, so a bulk fallback lookup (tmgev_game_evals first, tpose_positions_eval
  // second) covers every move in one round trip.
  const evalFens = [...byMove.values()].map(e => e.resultingFen).filter((f): f is string => f != null)
  const fenEvals = evalFens.length > 0 ? await getFenEvalsWithFallback_shared(evalFens, 'master') : {}

  const moves: MasterFenMoveBreakdown[] = [...byMove.entries()]
    .map(([move_played, e]) => {
      const fenEval = e.resultingFen ? fenEvals[truncateFen(e.resultingFen)] : undefined
      return {
        move_played,
        move_uci: e.move_uci,
        times: e.gdids.size,
        white: e.white,
        draws: e.draws,
        black: e.black,
        avgOpponentRating: e.gdids.size > 0 ? Math.round(e.ratingSum / e.gdids.size) : 0,
        cp: fenEval?.cp ?? null,
        depth: fenEval?.depth ?? null
      }
    })
    .sort((a, b) => b.times - a.times)

  return { reached, moves, games }
}

export type SyncedMasterPlayer = { handle: string; name: string; grade: number | null }

//----------------------------------------------------------------------------------
//  getSyncedMasterPlayers — distinct mgd_player handles actually present in
//  tmgd_gamesdecon, each paired with its real name and grade (merged in from
//  tmst_master_players, primary database — no cross-database join possible), for
//  MasterPlayerSelect's scope='synced' option (only masters with real data to filter
//  by, as opposed to scope='all', every known master regardless of sync status).
//  Returned in whatever order the DISTINCT query yields — MasterPlayerSelect does its
//  own alphabetical-by-name sort on the result, so sorting here too would be pointless.
//
//  Change history:
//    2026-08-28 — row now carries `grade`; result sorted grade-descending instead of
//                 alphabetical by handle (FilterMasterPlayerSelect shows "Name (grade)")
//    2026-09-15 — dropped the grade-descending sort (now sorted by the caller,
//                 MasterPlayerSelect, alphabetically by name) after merging
//                 FilterMasterPlayerSelect into MasterPlayerSelect
//----------------------------------------------------------------------------------
export async function getSyncedMasterPlayers(): Promise<SyncedMasterPlayer[]> {
  const result = await table_query({
    caller: 'getSyncedMasterPlayers',
    table: MASTER_DECON_TABLE,
    // DISTINCT on LOWER(mgd_player), not the bare column — mgd_player is supposed to always be
    // stored lowercase (see AppNav.tsx's handleMasterClick), but a case-variant value from a
    // data-entry slip would otherwise pass DISTINCT as a second, separate row, then resolve to
    // the exact same display name via infoMap's .toLowerCase() lookup below — showing as a
    // duplicate in the filter dropdown even though it's the same master.
    query: `SELECT DISTINCT LOWER(mgd_player) AS mgd_player FROM ${MASTER_DECON_TABLE} ORDER BY LOWER(mgd_player)`,
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
  return players
}

//----------------------------------------------------------------------------------
//  upsertGameEval_master — upsert a single ply's Stockfish eval into tmgev_game_evals
//  (secondary database), called incrementally as each ply completes during
//  MasterGameView_master's "Analyze Game"/"Re-analyse" (and from a single-ply "Analyze
//  Position" write-back) — so an interrupted run keeps whatever's already finished,
//  instead of losing it all the way the previous whole-array delete-then-reinsert
//  (saveMasterGameEvaluations_master) did. Depth-guarded, mirrors games.ts's
//  upsertGameEval_player. Also tops up tpose_positions_eval (primary database) for this
//  one ply's own resulting position via upgradePositionEvaluation_shared with
//  createIfMissing:false — a master game may deepen a position the tracked player has
//  already reached, but never creates a new tpos_positions row of its own — matching
//  what the old whole-array function did per row, just scoped to the one row now
//  actually being written instead of re-running it over the entire game every call.
//----------------------------------------------------------------------------------
export async function upsertGameEval_master(mgdid: number, ply: number, e: GameEvalRow): Promise<void> {
  await table_query({
    caller: 'upsertGameEval_master',
    table: 'tmgev_game_evals',
    query: `
      INSERT INTO tmgev_game_evals
        (mgev_mgdid, mgev_ply, mgev_san, mgev_fen_after, mgev_cp, mgev_cp_change, mgev_best_move, mgev_best_move_san, mgev_best_line, mgev_depth)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (mgev_mgdid, mgev_ply) DO UPDATE
        SET mgev_san = EXCLUDED.mgev_san, mgev_fen_after = EXCLUDED.mgev_fen_after, mgev_cp = EXCLUDED.mgev_cp,
            mgev_cp_change = EXCLUDED.mgev_cp_change, mgev_best_move = EXCLUDED.mgev_best_move,
            mgev_best_move_san = EXCLUDED.mgev_best_move_san, mgev_best_line = EXCLUDED.mgev_best_line,
            mgev_depth = EXCLUDED.mgev_depth
        WHERE tmgev_game_evals.mgev_depth < EXCLUDED.mgev_depth
    `,
    params: [mgdid, ply, e.san, truncateFen(e.fen), e.cp, e.cpChange, e.bestMove, e.bestMoveSan, JSON.stringify(e.bestLineSans), e.depth],
    isupdate: true
  })

  await upgradePositionEvaluation_shared({
    fen: e.fen,
    cp: e.cp,
    bestMove: e.bestMove || null,
    depth: e.depth,
    createIfMissing: false
  })
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
