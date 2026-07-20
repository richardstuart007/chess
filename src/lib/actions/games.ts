'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_count } from 'nextjs-shared/table_count'
import { table_delete } from 'nextjs-shared/table_delete'
import { table_update } from 'nextjs-shared/table_update'
import { table_query } from 'nextjs-shared/table_query'
import { classifyMove } from '@/src/lib/stockfish'
import { truncateFen } from '@/src/lib/fen'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'

export type GameEvalRow = {
  san: string
  fen: string
  fenBefore: string
  cp: number
  cpBefore: number
  bestMove: string
  bestMoveSan: string
  bestLineSans: string[]
  cpLoss: number
  cpChange: number
  classification: string
  depth: number
}

const GAMES_TABLE = 'tgr_gamesraw'
const DECON_TABLE = 'tgd_gamesdecon'
const SAVED_TABLE = 'tsa_savedanalyses'

// -----------------------------------------------------------------------
// Games
// -----------------------------------------------------------------------

export async function getGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: playerUsername.toLowerCase() }],
    caller: 'getGameCount'
  })
}

export async function getRecentGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getRecentGames',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit
  })
}

//----------------------------------------------------------------------------------
//  getGameById — reads from tgd_gamesdecon, matched by its own permanent gd_gdid
//----------------------------------------------------------------------------------
export async function getGameById(gameId: number) {
  const rows = await table_fetch({
    caller: 'getGameById',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_gdid', value: gameId }]
  })
  return rows[0] ?? null
}

export async function getLatestGameEndTime(playerUsername: string): Promise<number | null> {
  const rows = await table_fetch({
    caller: 'getLatestGameEndTime',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit: 1,
    columns: ['gr_end_time']
  })
  return rows[0]?.gr_end_time ?? null
}

export async function insertRawGame(data: {
  player_username: string
  chesscom_uuid: string
  raw_data: object
  pgn?: string | null
  end_time: number
  time_class: string
}) {
  return table_write({
    caller: 'insertRawGame',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_player', value: data.player_username.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_pgn', value: data.pgn ?? null },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ]
  })
}

//----------------------------------------------------------------------------------
//  saveGameEvaluations — write per-move Stockfish evals from /analyze to tgev_game_evals
//----------------------------------------------------------------------------------
export async function saveGameEvaluations(gdid: number, evaluations: GameEvalRow[]): Promise<void> {
  await table_delete({
    caller: 'saveGameEvaluations_delete',
    table: 'tgev_game_evals',
    whereColumnValuePairs: [{ column: 'gev_gdid', value: gdid }],
    skipCache: true
  })
  for (let i = 0; i < evaluations.length; i++) {
    const e = evaluations[i]
    await table_write({
      caller: 'saveGameEvaluations_insert',
      table: 'tgev_game_evals',
      columnValuePairs: [
        { column: 'gev_gdid', value: gdid },
        { column: 'gev_ply', value: i },
        { column: 'gev_san', value: e.san },
        { column: 'gev_fen_after', value: truncateFen(e.fen) },
        { column: 'gev_cp', value: e.cp },
        { column: 'gev_cp_change', value: e.cpChange },
        { column: 'gev_best_move', value: e.bestMove },
        { column: 'gev_best_move_san', value: e.bestMoveSan },
        { column: 'gev_best_line', value: JSON.stringify(e.bestLineSans) },
        { column: 'gev_depth', value: e.depth }
      ],
      skipCache: true
    })
  }
}

//----------------------------------------------------------------------------------
//  getGameEvals — fetch stored per-move evals from tgev_game_evals
//----------------------------------------------------------------------------------
export async function getGameEvals(gdid: number): Promise<GameEvalRow[]> {
  const rows = await table_fetch({
    caller: 'getGameEvals',
    table: 'tgev_game_evals',
    whereColumnValuePairs: [{ column: 'gev_gdid', value: gdid }],
    orderBy: 'gev_ply',
    columns: ['gev_san', 'gev_fen_after', 'gev_cp', 'gev_cp_change', 'gev_best_move', 'gev_best_move_san', 'gev_best_line', 'gev_depth'],
    skipCache: true
  })
  return rows.map((r: any, i: number) => {
    const cp = r.gev_cp ?? 0
    const cpChange = r.gev_cp_change ?? 0
    const cpLoss = Math.max(0, -cpChange)
    return {
      san:           r.gev_san,
      fen:           r.gev_fen_after,
      fenBefore:     i === 0 ? STARTING_FEN : rows[i - 1].gev_fen_after,
      cp,
      cpBefore:      i === 0 ? 0 : (rows[i - 1].gev_cp ?? 0),
      bestMove:      r.gev_best_move    ?? '',
      bestMoveSan:   r.gev_best_move_san ?? '',
      bestLineSans:  Array.isArray(r.gev_best_line) ? r.gev_best_line : [],
      cpLoss,
      cpChange,
      classification: classifyMove(cpLoss),
      depth:         r.gev_depth ?? 0
    }
  })
}

//----------------------------------------------------------------------------------
//  upgradeGameEval — merge a deeper evaluation into one existing tgev_game_evals
//  ply, only if the new depth exceeds what's stored. Scoped to gev_cp/gev_depth
//  only — gev_best_move describes the engine's recommendation from the position
//  before this move, unrelated to a resulting-position evaluation. Mirrors
//  upgradePositionEvaluation's guard/pattern for teva_evaluations.
//----------------------------------------------------------------------------------
export async function upgradeGameEval(gdid: number, ply: number, cp: number, depth: number): Promise<boolean> {
  const updated = await table_query({
    caller: 'upgradeGameEval_update',
    table: 'tgev_game_evals',
    query: `
      UPDATE tgev_game_evals
      SET gev_cp = $1, gev_depth = $2
      WHERE gev_gdid = $3 AND gev_ply = $4 AND gev_depth < $2
      RETURNING gev_gdid
    `,
    params: [cp, depth, gdid, ply],
    isupdate: true
  })
  return updated.length > 0
}

// -----------------------------------------------------------------------
// Saved Analyses
// -----------------------------------------------------------------------

export async function saveAnalysisLine(data: {
  game_id?: number
  title: string
  notes?: string
  line_pgn: string
  line_moves: object[]
  starting_fen: string
  starting_ply: number
  eco_code?: string
  opening_name?: string
}) {
  return table_write({
    caller: 'saveAnalysisLine',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_gdid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'line' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_line_pgn', value: data.line_pgn },
      { column: 'sa_line_moves', value: JSON.stringify(data.line_moves) },
      { column: 'sa_starting_fen', value: truncateFen(data.starting_fen) },
      { column: 'sa_starting_ply', value: data.starting_ply },
      { column: 'sa_eco_code', value: data.eco_code ?? '' },
      { column: 'sa_opening_name', value: data.opening_name ?? '' }
    ]
  })
}

export async function saveAnalysisTree(data: {
  game_id?: number
  title: string
  notes?: string
  tree_data: object
}) {
  return table_write({
    caller: 'saveAnalysisTree',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_gdid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'full_tree' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_tree_data', value: JSON.stringify(data.tree_data) }
    ]
  })
}

export async function getSavedAnalyses(gameId: number) {
  return table_fetch({
    caller: 'getSavedAnalyses',
    table: SAVED_TABLE,
    whereColumnValuePairs: [{ column: 'sa_gdid', value: gameId }],
    orderBy: 'sa_id DESC'
  })
}

// -----------------------------------------------------------------------
// Deconstructed Games
// -----------------------------------------------------------------------

export async function getDeconGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getDeconGames',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player', value: playerUsername.toLowerCase() }],
    orderBy: 'gd_end_time DESC',
    limit
  })
}

export async function getDeconGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player', value: playerUsername.toLowerCase() }],
    caller: 'getDeconGameCount'
  })
}

// -----------------------------------------------------------------------
// Filtered + Paginated Deconstructed Games
// -----------------------------------------------------------------------

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'
import { GAMES_ITEMS_PER_PAGE, TERMINATION_CHART_TYPES } from '../constants'

export type GameFilters = {
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

function buildFilters(usernames: string[], filters: GameFilters): Filter[] {
  const lowered = usernames.map(u => u.toLowerCase())
  const result: Filter[] = lowered.length > 1
    ? [{ column: 'gd_player', operator: 'IN', value: lowered }]
    : [{ column: 'gd_player', operator: '=', value: lowered[0] }]

  if (filters.opponent) {
    result.push({ column: 'gd_opponent_username', operator: 'LIKE', value: filters.opponent })
  }
  const ratingOverlap = filters.opponentRatingMin && filters.opponentRatingMax &&
    filters.opponentRatingMin > filters.opponentRatingMax
  if (!ratingOverlap) {
    if (filters.opponentRatingMin)
      result.push({ column: 'gd_opponent_rating', operator: '>=', value: filters.opponentRatingMin })
    if (filters.opponentRatingMax)
      result.push({ column: 'gd_opponent_rating', operator: '<=', value: filters.opponentRatingMax })
  }
  if (filters.result) {
    result.push({ column: 'gd_player_result', operator: '=', value: filters.result })
  }
  if (filters.termination && filters.termination.length > 0) {
    result.push({ column: 'gd_termination', operator: 'IN', value: filters.termination })
  }
  if (filters.color) {
    result.push({ column: 'gd_player_color', operator: '=', value: filters.color })
  }
  if (filters.timeClass) {
    result.push({ column: 'gd_time_class', operator: '=', value: filters.timeClass })
  }
  if (filters.opening) {
    result.push({ column: 'gd_opening_name', operator: 'LIKE', value: filters.opening })
  }
  if (filters.openingNameExact) {
    result.push({ column: 'gd_opening_name', operator: '=', value: filters.openingNameExact })
  }
  if (filters.eco) {
    result.push({ column: 'gd_eco_code', operator: 'LIKE', value: filters.eco })
  }
  if (filters.dateFrom) {
    const unixFrom = Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '>=', value: unixFrom })
  }
  if (filters.dateTo) {
    const unixTo = Math.floor(new Date(filters.dateTo + 'T23:59:59').getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '<=', value: unixTo })
  }

  return result
}

export async function fetchFilteredGames(
  usernames: string[],
  filters: GameFilters,
  page: number,
  itemsPerPage: number = GAMES_ITEMS_PER_PAGE
) {
  const filterArray = buildFilters(usernames, filters)
  const offset = (page - 1) * itemsPerPage

  return fetchFiltered({
    table: DECON_TABLE,
    filters: filterArray,
    orderBy: 'gd_end_time DESC',
    limit: itemsPerPage > 0 ? itemsPerPage : undefined,
    offset,
    caller: 'fetchFilteredGames'
  })
}

//----------------------------------------------------------------------------------
//  getGamesPageCount — total page count for fetchFilteredGames' same filter set
//----------------------------------------------------------------------------------
export async function getGamesPageCount(
  usernames: string[],
  filters: GameFilters,
  itemsPerPage: number = GAMES_ITEMS_PER_PAGE
): Promise<number> {
  const filterArray = buildFilters(usernames, filters)
  return fetchTotalPages({
    table: DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'getGamesPageCount'
  })
}

export async function getOpeningScores(
  usernames: string[],
  color: 'white' | 'black' | 'both',
  minGames: number = 100,
  limit: number = 20,
  sortDir: 'ASC' | 'DESC' = 'DESC',
  dateFrom?: string
): Promise<{ eco_code: string; opening_name: string; games: number; score_pct: number }[]> {
  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const params: (string | number)[] = []
  const playerPlaceholders = usernames
    .map(u => { params.push(u.toLowerCase()); return `$${params.length}` })
    .join(', ')
  params.push(minGames)
  const minGamesPlaceholder = `$${params.length}`
  let colorFilter = ''
  if (color !== 'both') {
    params.push(color)
    colorFilter = ` AND gd_player_color = $${params.length}`
  }
  let dateFilter = ''
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    dateFilter += ` AND gd_end_time >= $${params.length}`
  }
  const rows = await table_query({
    caller: 'getOpeningScores',
    table: DECON_TABLE,
    query: `
      SELECT
        gd_eco_code,
        gd_opening_name,
        COUNT(*) AS games,
        ROUND(AVG(CASE
          WHEN gd_player_result = 'win'  THEN 100
          WHEN gd_player_result = 'draw' THEN 50
          ELSE 0
        END)) AS score_pct
      FROM tgd_gamesdecon
      WHERE gd_player IN (${playerPlaceholders})
        ${colorFilter}
        ${dateFilter}
      GROUP BY gd_eco_code, gd_opening_name
      HAVING COUNT(*) >= ${minGamesPlaceholder}
      ORDER BY score_pct ${sortDir}
      ${limitClause}
    `,
    params
  })
  return rows.map((r: any) => ({
    eco_code: r.gd_eco_code ?? '',
    opening_name: r.gd_opening_name ?? '',
    games: Number(r.games),
    score_pct: Number(r.score_pct)
  }))
}

export async function getTerminationStats(
  usernames: string[],
  dateFrom?: string,
  color?: string
): Promise<{ termination: string; win: number; loss: number; total: number }[]> {
  const params: (string | number)[] = []
  const playerPlaceholders = usernames
    .map(u => { params.push(u.toLowerCase()); return `$${params.length}` })
    .join(', ')
  const terminationPlaceholders = TERMINATION_CHART_TYPES
    .map(t => { params.push(t); return `$${params.length}` })
    .join(', ')
  let filters = ''
  if (color) {
    params.push(color)
    filters += ` AND gd_player_color = $${params.length}`
  }
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    filters += ` AND gd_end_time >= $${params.length}`
  }
  const rows = await table_query({
    caller: 'getTerminationStats',
    table: DECON_TABLE,
    query: `
      SELECT
        gd_termination AS termination,
        COUNT(*) FILTER (WHERE gd_player_result = 'win')  AS win,
        COUNT(*) FILTER (WHERE gd_player_result = 'loss') AS loss,
        COUNT(*) AS total
      FROM tgd_gamesdecon
      WHERE gd_player IN (${playerPlaceholders})
        AND gd_termination IN (${terminationPlaceholders})
        ${filters}
      GROUP BY gd_termination
      ORDER BY total DESC
    `,
    params
  })
  return rows.map((r: any) => ({
    termination: r.termination,
    win:   Number(r.win),
    loss:  Number(r.loss),
    total: Number(r.total)
  }))
}

export async function backfillOpeningMoves(
  username: string,
  batchSize: number = 500
): Promise<{ updated: number; remaining: number }> {
  const { parsePgnOpening } = await import('../parsePgn')

  const rows = await table_fetch({
    caller: 'backfillOpeningMoves',
    table: DECON_TABLE,
    whereColumnValuePairs: [
      { column: 'gd_player', value: username.toLowerCase() },
      { column: 'gd_opening_moves', operator: 'IS NULL', value: null }
    ],
    columns: ['gd_gdid', 'gd_pgn'],
    limit: batchSize
  })

  for (const row of rows) {
    const moves = parsePgnOpening(row.gd_pgn ?? '')
    await table_update({
      caller: 'backfillOpeningMoves_update',
      table: DECON_TABLE,
      columnValuePairs: [{ column: 'gd_opening_moves', value: moves }],
      whereColumnValuePairs: [{ column: 'gd_gdid', value: row.gd_gdid }]
    })
  }

  // table_count has no IS NULL support (unlike table_fetch) — table_query needed here
  const remaining = await table_query({
    caller: 'backfillOpeningMoves_count',
    table: DECON_TABLE,
    query: `SELECT COUNT(*) FROM tgd_gamesdecon
            WHERE gd_player = $1
              AND gd_opening_moves IS NULL`,
    params: [username.toLowerCase()]
  })

  return {
    updated: rows.length,
    remaining: Number(remaining[0]?.count ?? 0)
  }
}

export async function getEarliestGameDate(usernames: string[]): Promise<string | null> {
  const placeholders = usernames.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await table_query({
    caller: 'getEarliestGameDate',
    table: DECON_TABLE,
    query: `SELECT MIN(gd_end_time) AS min_time FROM tgd_gamesdecon WHERE gd_player IN (${placeholders})`,
    params: usernames.map(u => u.toLowerCase())
  })
  const minTime = rows[0]?.min_time
  if (!minTime) return null
  return new Date(Number(minTime) * 1000).toISOString().slice(0, 10)
}

export interface RatingDataPoint {
  date: string        // 'YYYY-MM' | 'YYYY-WW' | 'YYYY-MM-DD' depending on granularity
  avgRating: number
  games: number
}

export type RatingGranularity = 'month' | 'week' | 'day' | 'game'

export async function getPlayerRatingOverTime(
  username: string,
  timeClass?: string,
  granularity: RatingGranularity = 'month',
  dateFrom?: string,
  dateTo?: string
): Promise<RatingDataPoint[]> {
  const params: (string | number)[] = [username.toLowerCase()]
  let timeClassFilter = ''
  if (timeClass && timeClass !== '') {
    params.push(timeClass)
    timeClassFilter = `AND gd_time_class = $${params.length}`
  }
  let dateFilter = ''
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    dateFilter += ` AND gd_end_time >= $${params.length}`
  }
  if (dateTo) {
    params.push(Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000))
    dateFilter += ` AND gd_end_time <= $${params.length}`
  }

  let query: string

  if (granularity === 'game') {
    query = `
      SELECT
        TO_CHAR(TO_TIMESTAMP(gd_end_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
        (CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END)::int AS avg_rating,
        1::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player = $1
        ${timeClassFilter}${dateFilter}
      ORDER BY gd_end_time ASC
    `
  } else if (granularity === 'day') {
    query = `
      SELECT
        TO_CHAR(TO_TIMESTAMP(gd_end_time), 'YYYY-MM-DD') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY TO_CHAR(TO_TIMESTAMP(gd_end_time), 'YYYY-MM-DD')
      ORDER BY 1
    `
  } else if (granularity === 'week') {
    query = `
      SELECT
        TO_CHAR(DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time)), 'YYYY-MM-DD') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time))
      ORDER BY DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time))
    `
  } else {
    query = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time)), 'YYYY-MM') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time))
      ORDER BY DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time))
    `
  }

  const rows = await table_query({ caller: 'getPlayerRatingOverTime', table: DECON_TABLE, query, params })

  return rows.map((r: any) => ({
    date: r.date,
    avgRating: r.avg_rating,
    games: r.games
  }))
}
