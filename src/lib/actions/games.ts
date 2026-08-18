'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_count } from 'nextjs-shared/table_count'
import { table_delete } from 'nextjs-shared/table_delete'
import { table_update } from 'nextjs-shared/table_update'
import { table_query } from 'nextjs-shared/table_query'
import { Chess } from 'chess.js'
import { classifyMove } from '@/src/lib/stockfish'
import { truncateFen } from '@/src/lib/fen'
import { getPositionEvaluationsBulk } from '@/src/lib/analysis/chessdb'

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

// -----------------------------------------------------------------------
// Games
// -----------------------------------------------------------------------

export async function getGameCount(player: string): Promise<number> {
  return table_count({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: player.toLowerCase() }],
    caller: 'getGameCount'
  })
}

export async function getRecentGames(player: string, limit: number = 100) {
  return table_fetch({
    caller: 'getRecentGames',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: player.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit
  })
}

//----------------------------------------------------------------------------------
//  getGameById — reads from tgd_gamesdecon, matched by its own permanent gd_gdid
//----------------------------------------------------------------------------------
export async function getGameById(gdid: number) {
  const rows = await table_fetch({
    caller: 'getGameById',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_gdid', value: gdid }]
  })
  return rows[0] ?? null
}

export async function getLatestGameEndTime(player: string): Promise<number | null> {
  const rows = await table_fetch({
    caller: 'getLatestGameEndTime',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player', value: player.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit: 1,
    columns: ['gr_end_time']
  })
  return rows[0]?.gr_end_time ?? null
}

export async function insertRawGame(data: {
  player: string
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
      { column: 'gr_player', value: data.player.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_pgn', value: data.pgn ?? null },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ]
  })
}

//----------------------------------------------------------------------------------
//  saveGameEvaluations — write per-move Stockfish evals from /analyze to tgev_game_evals.
//  evaluations can have gaps (undefined) for plies with no real data — no row is written
//  for those (matches "not actually analyzed"), rather than inserting a placeholder.
//  Full delete-then-reinsert of this game's row set, batched into a single multi-row
//  INSERT rather than one INSERT per ply — measured at ~1.9s for a ~20-ply range with
//  the old one-row-at-a-time loop, entirely DB round-trip overhead unrelated to
//  Stockfish (which may not have run at all if everything was already cached).
//----------------------------------------------------------------------------------
export async function saveGameEvaluations(gdid: number, evaluations: (GameEvalRow | undefined)[]): Promise<void> {
  await table_delete({
    caller: 'saveGameEvaluations_delete',
    table: 'tgev_game_evals',
    whereColumnValuePairs: [{ column: 'gev_gdid', value: gdid }],
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
    gdid, ply, e.san, truncateFen(e.fen), e.cp, e.cpChange, e.bestMove, e.bestMoveSan, JSON.stringify(e.bestLineSans), e.depth
  ])

  await table_query({
    caller: 'saveGameEvaluations_insert',
    table: 'tgev_game_evals',
    query: `
      INSERT INTO tgev_game_evals
        (gev_gdid, gev_ply, gev_san, gev_fen_after, gev_cp, gev_cp_change, gev_best_move, gev_best_move_san, gev_best_line, gev_depth)
      VALUES ${values}
    `,
    params,
    isupdate: true
  })
}

//----------------------------------------------------------------------------------
//  getGameEvals — per-ply evals for display, preferring tpose_positions_eval (the app's
//  single source of truth for "the evaluation of a position") over tgev_game_evals'
//  own stored value wherever pose has an equal-or-deeper record, falling back to
//  gev's own value otherwise. Driven by the game's own FEN sequence (derived from its
//  PGN), not by tgev row count — a game that's never had "Analyze Game" run on it has
//  zero tgev rows, but a position it shares with an already-analyzed game (moves
//  MIN_ANALYSIS_MOVE..MAX_ANALYSIS_MOVE, pose's normal build range) can still have
//  real pose data, which would otherwise never surface. Resolved per ply, independently
//  — a gap at one ply (e.g. moves 1..MIN_ANALYSIS_MOVE-1, deliberately never cached in
//  pose) does NOT truncate the rest of the array the way it used to; only that one ply
//  comes back undefined, so moves after a gap still show whatever's actually known.
//  Reads only — never creates a tpose_positions_eval or tgev_game_evals row. Only cp/depth
//  (and the derived cpChange/cpLoss/classification) are ever taken from pose —
//  gev_best_move/gev_best_move_san/gev_best_line describe the recommendation from the
//  position BEFORE this ply, not a property of this ply's own resulting position, so
//  they always come from gev (blank if no tgev row exists for that ply).
//----------------------------------------------------------------------------------
export async function getGameEvals(gdid: number): Promise<(GameEvalRow | undefined)[]> {
  const gameRows = await table_fetch({
    caller: 'getGameEvals_pgn',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_gdid', value: gdid }],
    columns: ['gd_pgn'],
    skipCache: true
  })
  const pgn = gameRows[0]?.gd_pgn as string | undefined
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

  const tgevRows = await table_fetch({
    caller: 'getGameEvals',
    table: 'tgev_game_evals',
    whereColumnValuePairs: [{ column: 'gev_gdid', value: gdid }],
    orderBy: 'gev_ply',
    columns: ['gev_ply', 'gev_cp', 'gev_best_move', 'gev_best_move_san', 'gev_best_line', 'gev_depth'],
    skipCache: true
  })
  const tgevByPly = new Map<number, any>()
  for (const r of tgevRows) tgevByPly.set(Number(r.gev_ply), r)

  const poseEvals = await getPositionEvaluationsBulk(fens)

  const result: (GameEvalRow | undefined)[] = []
  // Tracks the last ply that actually resolved to a real value — cpChange/cpBefore are
  // only meaningful relative to the immediately preceding ply, so a gap resets this
  // rather than letting a stale cp leak across it.
  let cpBefore = 0
  let havePrevCp = false

  for (let i = 0; i < sanMoves.length; i++) {
    const tgevRow = tgevByPly.get(i)
    const poseEval = poseEvals[truncateFen(fens[i + 1])]

    if (!tgevRow && !poseEval) {
      result.push(undefined)
      havePrevCp = false
      continue
    }

    const gevCp = tgevRow?.gev_cp ?? 0
    const gevDepth = tgevRow?.gev_depth ?? 0
    const usePose = poseEval != null && poseEval.depth >= gevDepth
    const cp = usePose ? poseEval.cp : gevCp
    const depth = usePose ? poseEval.depth : gevDepth

    const isWhiteMove = i % 2 === 0
    const cpChange = havePrevCp ? (isWhiteMove ? cp - cpBefore : cpBefore - cp) : 0
    const cpLoss = Math.max(0, -cpChange)

    result.push({
      san:           sanMoves[i],
      fen:           fens[i + 1],
      fenBefore:     fens[i],
      cp,
      cpBefore:      havePrevCp ? cpBefore : cp,
      bestMove:      tgevRow?.gev_best_move     ?? '',
      bestMoveSan:   tgevRow?.gev_best_move_san ?? '',
      bestLineSans:  Array.isArray(tgevRow?.gev_best_line) ? tgevRow.gev_best_line : [],
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

// -----------------------------------------------------------------------
// Deconstructed Games
// -----------------------------------------------------------------------

export async function getDeconGames(player: string, limit: number = 100) {
  return table_fetch({
    caller: 'getDeconGames',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player', value: player.toLowerCase() }],
    orderBy: 'gd_end_time DESC',
    limit
  })
}

export async function getDeconGameCount(player: string): Promise<number> {
  return table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player', value: player.toLowerCase() }],
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
  gdid?: number
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

function buildFilters(players: string[], filters: GameFilters): Filter[] {
  const lowered = players.map(u => u.toLowerCase())
  const result: Filter[] = lowered.length === 0
    ? []
    : lowered.length > 1
      ? [{ column: 'gd_player', operator: 'IN', value: lowered }]
      : [{ column: 'gd_player', operator: '=', value: lowered[0] }]

  if (filters.gdid) {
    result.push({ column: 'gd_gdid', operator: '=', value: filters.gdid })
  }
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
  players: string[],
  filters: GameFilters,
  page: number,
  itemsPerPage: number = GAMES_ITEMS_PER_PAGE
) {
  const filterArray = buildFilters(players, filters)
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
  players: string[],
  filters: GameFilters,
  itemsPerPage: number = GAMES_ITEMS_PER_PAGE
): Promise<number> {
  const filterArray = buildFilters(players, filters)
  return fetchTotalPages({
    table: DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'getGamesPageCount'
  })
}

export async function getOpeningScores(
  players: string[],
  color: 'white' | 'black' | '',
  minGames: number = 100,
  limit: number = 20,
  sortDir: 'ASC' | 'DESC' = 'DESC',
  dateFrom?: string,
  timeClass?: string
): Promise<{ eco_code: string; opening_name: string; games: number; score_pct: number }[]> {
  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const params: (string | number)[] = []
  const playerPlaceholders = players
    .map(u => { params.push(u.toLowerCase()); return `$${params.length}` })
    .join(', ')
  const playerFilter = players.length > 0 ? `AND gd_player IN (${playerPlaceholders})` : ''
  params.push(minGames)
  const minGamesPlaceholder = `$${params.length}`
  let colorFilter = ''
  if (color !== '') {
    params.push(color)
    colorFilter = ` AND gd_player_color = $${params.length}`
  }
  let dateFilter = ''
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    dateFilter += ` AND gd_end_time >= $${params.length}`
  }
  let timeClassFilter = ''
  if (timeClass) {
    params.push(timeClass)
    timeClassFilter = ` AND gd_time_class = $${params.length}`
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
      WHERE 1=1
        ${playerFilter}
        ${colorFilter}
        ${dateFilter}
        ${timeClassFilter}
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
  players: string[],
  dateFrom?: string,
  color?: string,
  timeClass?: string
): Promise<{ termination: string; win: number; loss: number; total: number }[]> {
  const params: (string | number)[] = []
  const playerPlaceholders = players
    .map(u => { params.push(u.toLowerCase()); return `$${params.length}` })
    .join(', ')
  const playerFilter = players.length > 0 ? `AND gd_player IN (${playerPlaceholders})` : ''
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
  if (timeClass) {
    params.push(timeClass)
    filters += ` AND gd_time_class = $${params.length}`
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
      WHERE gd_termination IN (${terminationPlaceholders})
        ${playerFilter}
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
  player: string,
  batchSize: number = 500
): Promise<{ updated: number; remaining: number }> {
  const { parsePgnOpening } = await import('../parsePgn')

  const rows = await table_fetch({
    caller: 'backfillOpeningMoves',
    table: DECON_TABLE,
    whereColumnValuePairs: [
      { column: 'gd_player', value: player.toLowerCase() },
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
    params: [player.toLowerCase()]
  })

  return {
    updated: rows.length,
    remaining: Number(remaining[0]?.count ?? 0)
  }
}

export async function getEarliestGameDate(players: string[]): Promise<string | null> {
  const placeholders = players.map((_, i) => `$${i + 1}`).join(', ')
  const playerFilter = players.length > 0 ? `WHERE gd_player IN (${placeholders})` : ''
  const rows = await table_query({
    caller: 'getEarliestGameDate',
    table: DECON_TABLE,
    query: `SELECT MIN(gd_end_time) AS min_time FROM tgd_gamesdecon ${playerFilter}`,
    params: players.map(u => u.toLowerCase())
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
  player: string,
  timeClass?: string,
  granularity: RatingGranularity = 'month',
  dateFrom?: string,
  dateTo?: string
): Promise<RatingDataPoint[]> {
  const params: (string | number)[] = [player.toLowerCase()]
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
