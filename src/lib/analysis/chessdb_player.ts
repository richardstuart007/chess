'use server'

// ============================================================================
// Analysis DB helpers — player-only: every function here is scoped to the
// tracked player's own games (tgam_game_positions/tgd_gamesdecon joins, or a
// required/optional player param). See chessdb_shared.ts for the position/eval
// functions used by both player and master analysis.
//
// Complex queries (multi-join, LATERAL, json_agg, arithmetic upserts,
// COALESCE in SET) use table_query — raw SQL, no caching, with logging.
// ============================================================================

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_check }  from 'nextjs-shared/table_check'
import { table_query }  from 'nextjs-shared/table_query'
import { table_update } from 'nextjs-shared/table_update'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalRows } from 'nextjs-shared/fetchTotalRows'
import type { Filter, JoinParams } from 'nextjs-shared/structures'
import { write_logging } from 'nextjs-shared/write_logging'
import { truncateFen }  from '../fen'
import { RESULT_MISMATCH_CP_THRESHOLD_Player } from '../constants'
import type { PositionRow, EvaluationRow } from './chessdb_shared'

export interface MoveRow {
  move_played: string
  move_uci:    string | null
  mov_times:   number
  mov_wins:    number
  mov_losses:  number
  pose_cp:      number | null
  pose_depth:   number | null
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getMovesForPosition_player — distinct moves played from a position, aggregated
//  from tgam_game_positions, ordered by frequency. pose_cp is the Stockfish eval of
//  the position resulting from each move (deterministic per position+move — every
//  game sharing a move from this position reaches the identical resulting position),
//  not an average — looked up once via the subquery's resulting_pos_id, not aggregated.
//----------------------------------------------------------------------------------
export async function getMovesForPosition_player(posId: number, player?: string): Promise<MoveRow[]> {
  const params: (number | string)[] = [posId]
  const playerFilter = player ? `AND d.gd_player = $2` : ''
  if (player) params.push(player.toLowerCase())

  const result = await table_query({
    caller: 'getMovesForPosition_player',
    table: 'tgam_game_positions',
    query: `
      SELECT sub.move_played, sub.move_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.pose_cp, e.pose_depth
      FROM (
        SELECT
          gp.gam_move_played                                   AS move_played,
          gp.gam_move_uci                                      AS move_uci,
          COUNT(*)::int                                        AS mov_times,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
          MAX(gp.gam_resulting_pos_id)                          AS resulting_pos_id
        FROM tgam_game_positions gp
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
          ${playerFilter}
        GROUP BY gp.gam_move_played, gp.gam_move_uci
      ) sub
      LEFT JOIN tpose_positions_eval e ON e.pose_pos_id = sub.resulting_pos_id
      ORDER BY sub.mov_times DESC
    `,
    params
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMovesForPosition_player',
      lg_caller: 'getMovesForPosition_player',
      lg_msg: 'Failed to fetch moves for position ' + posId + ': ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data as MoveRow[]
}

//----------------------------------------------------------------------------------
//  getMovePlayCounts_player — how many times each move was played from a set of
//  positions, one round trip. Keyed by the same truncated FEN tpos_positions.pos_fen
//  stores, so callers must truncate their own FEN lookups the same way before
//  matching keys.
//----------------------------------------------------------------------------------
export async function getMovePlayCounts_player(fens: string[], player: string): Promise<Record<string, Record<string, number>>> {
  const uniqueFens = [...new Set(fens.map(truncateFen))]
  if (uniqueFens.length === 0) return {}

  const params: (string | number)[] = []
  const fenPlaceholders = uniqueFens
    .map(f => { params.push(f); return `$${params.length}` })
    .join(', ')
  params.push(player.toLowerCase())
  const playerPlaceholder = `$${params.length}`

  const queryResult = await table_query({
    caller: 'getMovePlayCounts_player',
    table: 'tpos_positions',
    query: `
      SELECT p.pos_fen, gp.gam_move_played, COUNT(*)::int AS times
      FROM tpos_positions p
      JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE p.pos_fen IN (${fenPlaceholders})
        AND gp.gam_move_num > 0
        AND d.gd_player = ${playerPlaceholder}
      GROUP BY p.pos_fen, gp.gam_move_played
    `,
    params
  })
  if (!queryResult.ok) {
    write_logging({
      lg_functionname: 'getMovePlayCounts_player',
      lg_caller: 'getMovePlayCounts_player',
      lg_msg: 'Failed to fetch move play counts: ' + queryResult.error,
      lg_severity: 'E'
    })
    return {}
  }
  const rows = queryResult.data as { pos_fen: string; gam_move_played: string; times: number }[]

  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!result[row.pos_fen]) result[row.pos_fen] = {}
    result[row.pos_fen][row.gam_move_played] = Number(row.times)
  }
  return result
}

//----------------------------------------------------------------------------------
//  getMoveSummaryForPosition_player — one row per move played from this exact
//  position, scoped to the given player. FEN-keyed version of
//  getMovesForPosition_player's aggregation query (via tpos_positions.pos_fen, like
//  fetchGamesForPosition_player), used by the Analyze page's "Moves From This
//  Position" panel for any position on the board. pose_cp is the resulting
//  position's Stockfish eval (deterministic per position+move), not an average —
//  see getMovesForPosition_player's comment.
//----------------------------------------------------------------------------------
export async function getMoveSummaryForPosition_player(fen: string, player: string): Promise<MoveRow[]> {
  const result = await table_query({
    caller: 'getMoveSummaryForPosition_player',
    table: 'tpos_positions',
    query: `
      SELECT sub.move_played, sub.move_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.pose_cp, e.pose_depth
      FROM (
        SELECT
          gp.gam_move_played                                   AS move_played,
          gp.gam_move_uci                                      AS move_uci,
          COUNT(*)::int                                        AS mov_times,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
          MAX(gp.gam_resulting_pos_id)                          AS resulting_pos_id
        FROM tpos_positions p
        JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE p.pos_fen = $1
          AND gp.gam_move_num > 0
          AND d.gd_player = $2
        GROUP BY gp.gam_move_played, gp.gam_move_uci
      ) sub
      LEFT JOIN tpose_positions_eval e ON e.pose_pos_id = sub.resulting_pos_id
      ORDER BY sub.mov_times DESC
    `,
    params: [truncateFen(fen), player.toLowerCase()]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMoveSummaryForPosition_player',
      lg_caller: 'getMoveSummaryForPosition_player',
      lg_msg: 'Failed to fetch move summary for position: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data as MoveRow[]
}

export interface PositionGameHit {
  player:         string
  move_played:    string
  move_num:       number | null
  playerResult:   string | null
  gdid:           number | null
  date:           string | null
  opponentRating: number | null
  termination:    string | null
  finalEval:      number | null
  resultMismatch: 'lostWinning' | 'wonLosing' | null
}

//
//  Shared join/filter shape for fetchGamesForPosition_player/getGamesForPositionCount_player
//  — the exact same Filter[] must drive both, or the reported total and the fetched
//  page disagree.
//
const POSITION_GAMES_JOINS: JoinParams[] = [
  { table: 'tgam_game_positions', on: 'gam_pos_id = pos_id' },
  { table: 'tgd_gamesdecon', on: 'gd_gdid = gam_gdid' }
]

function buildPositionGamesFilters(fen: string, player: string, move?: string): Filter[] {
  const filters: Filter[] = [
    { column: 'pos_fen', operator: '=', value: truncateFen(fen) },
    { column: 'gam_move_num', operator: '>', value: 0 },
    { column: 'gd_player', operator: '=', value: player.toLowerCase() }
  ]
  if (move) filters.push({ column: 'gam_move_played', operator: '=', value: move })
  return filters
}

function mapPositionGameRow(r: any): PositionGameHit {
  const playerResult = r.gd_player_result ?? null
  const finalEval = r.gd_final_eval != null ? Number(r.gd_final_eval) : null
  const playerEval = finalEval != null
    ? (r.gd_player_color === 'black' ? -finalEval : finalEval)
    : null
  const resultMismatch: 'lostWinning' | 'wonLosing' | null =
    playerEval == null ? null
    : (playerResult === 'loss' || playerResult === 'draw') && playerEval >= RESULT_MISMATCH_CP_THRESHOLD_Player ? 'lostWinning'
    : playerResult === 'win'  && playerEval <= -RESULT_MISMATCH_CP_THRESHOLD_Player ? 'wonLosing'
    : null
  return {
    player:         r.gd_player,
    move_played:    r.gam_move_played,
    move_num:       r.gam_move_num != null ? Number(r.gam_move_num) : null,
    playerResult,
    gdid:           r.gd_gdid != null ? Number(r.gd_gdid) : null,
    date:           r.gd_end_time != null ? new Date(Number(r.gd_end_time) * 1000).toISOString().slice(0, 10) : null,
    opponentRating: r.gd_opponent_rating != null ? Number(r.gd_opponent_rating) : null,
    termination:    r.gd_termination ?? null,
    finalEval,
    resultMismatch
  }
}

//----------------------------------------------------------------------------------
//  fetchGamesForPosition_player — one page of the given player's games that reached
//  this exact position, optionally narrowed (server-side) to games where a specific
//  move was played next. Used by the Analyze page's "Games Played" panel, which can
//  show any position currently on the board — not just ones with a known pos_id.
//  Ordered by end time descending (latest first).
//----------------------------------------------------------------------------------
export async function fetchGamesForPosition_player(
  fen: string,
  player: string,
  page: number,
  itemsPerPage: number,
  move?: string
): Promise<PositionGameHit[]> {
  const offset = (page - 1) * itemsPerPage
  const result = await fetchFiltered({
    table: 'tpos_positions',
    joins: POSITION_GAMES_JOINS,
    filters: buildPositionGamesFilters(fen, player, move),
    orderBy: 'gd_end_time DESC',
    limit: itemsPerPage,
    offset,
    caller: 'fetchGamesForPosition_player'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'fetchGamesForPosition_player',
      lg_caller: 'fetchGamesForPosition_player',
      lg_msg: 'Failed to fetch games for position: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data.map(mapPositionGameRow)
}

//----------------------------------------------------------------------------------
//  getGamesForPositionCount_player — total row count for
//  fetchGamesForPosition_player's same filter set
//----------------------------------------------------------------------------------
export async function getGamesForPositionCount_player(fen: string, player: string, move?: string): Promise<number> {
  const result = await fetchTotalRows({
    table: 'tpos_positions',
    joins: POSITION_GAMES_JOINS,
    filters: buildPositionGamesFilters(fen, player, move),
    caller: 'getGamesForPositionCount_player'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getGamesForPositionCount_player',
      lg_caller: 'getGamesForPositionCount_player',
      lg_msg: 'Failed to fetch games count for position: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}

// ---------------------------------------------------------------------------
// Game Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  gamePositionExists_player — check whether a game position has already been
//  recorded. Queries tgam_game_positions by gdid, so player-only by construction
//  even though it takes no explicit player param — master games have no rows in
//  this table at all (see tmgam_game_positions in the secondary database instead).
//----------------------------------------------------------------------------------
export async function gamePositionExists_player(gdid: number, posId: number): Promise<boolean> {
  const result = await table_check([{
    table: 'tgam_game_positions',
    whereColumnValuePairs: [
      { column: 'gam_gdid',  value: gdid },
      { column: 'gam_pos_id', value: posId }
    ]
  }], 'gamePositionExists_player')
  if (!result.ok) {
    write_logging({
      lg_functionname: 'gamePositionExists_player',
      lg_caller: 'gamePositionExists_player',
      lg_msg: 'Failed to check game position existence: ' + result.error,
      lg_severity: 'E'
    })
    return false
  }
  return result.data.found
}

// ---------------------------------------------------------------------------
// Habits page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getHabitsData_player — one row per (position × move) recurring habit, good or
//  bad (see quality). The position detail page separately shows all moves
//  regardless of habit status. Reads from thab_habits (built/refreshed by
//  buildHabits() on the Pipeline page) rather than live-aggregating
//  tgam_game_positions on every request — pos_fen/pos_color/pos_cp still come from
//  tpos_positions/tpose_positions_eval via join since those aren't player-specific
//  and don't need duplicating into thab_habits. move_cp is the resulting
//  position's pose_cp (via hab_resulting_pos_id), not the hab_move_cp delta —
//  that delta stays internal, driving the quality filter/sort only.
//  opening_name/eco_code come straight from thab_habits' own
//  hab_opening_name/hab_eco_code columns (denormalized by buildHabits() at build
//  time) rather than a live join — see buildHabits.ts for how they're computed.
//  No master-side equivalent exists — habits are inherently about the tracked
//  player's own recurring patterns.
//----------------------------------------------------------------------------------

function buildHabitsFilter(opts: {
  players?: string[]
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
  opening?: string
  eco?: string
  sinceDate?: string
}): {
  params: (string | number | boolean)[]
  playerFilter: string
  dismissedPlaceholder: string
  minReachedPlaceholder: string
  colorFilter: string
  qualityFilter: string
  openingFilter: string
  ecoFilter: string
  sinceFilter: string
} {
  const players    = (opts.players ?? []).map(p => p.toLowerCase())
  const minReached = opts.minReached ?? 3
  const dismissed  = opts.dismissed ?? false
  const quality    = opts.quality ?? 'bad'
  const params: (string | number | boolean)[] = []
  const playerPlaceholders = players
    .map(p => { params.push(p); return `$${params.length}` })
    .join(', ')
  const playerFilter = players.length > 0 ? `AND h.hab_player IN (${playerPlaceholders})` : ''
  params.push(dismissed)
  const dismissedPlaceholder = `$${params.length}`
  params.push(minReached)
  const minReachedPlaceholder = `$${params.length}`
  const colorFilter = opts.color ? `AND p.pos_color = $${params.push(opts.color)}` : ''
  const qualityFilter = quality === 'good' ? 'AND h.hab_move_cp > 0' : 'AND h.hab_move_cp < 0'
  const openingFilter = opts.opening
    ? `AND LOWER(h.hab_opening_name) LIKE $${params.push(`%${opts.opening.toLowerCase()}%`)}`
    : ''
  const ecoFilter = opts.eco
    ? `AND LOWER(h.hab_eco_code) LIKE $${params.push(`%${opts.eco.toLowerCase()}%`)}`
    : ''
  const sinceFilter = opts.sinceDate
    ? `AND h.hab_last_occurred >= $${params.push(Math.floor(new Date(opts.sinceDate).getTime() / 1000))}`
    : ''
  return { params, playerFilter, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter, openingFilter, ecoFilter, sinceFilter }
}

export async function getHabitsData_player(opts: {
  players?: string[]
  color?: 'w' | 'b'
  sortBy?: 'cpLoss' | 'reached'
  limit?: number
  offset?: number
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
  opening?: string
  eco?: string
  sinceDate?: string
}): Promise<Array<{
  pos_id:       number
  pos_fen:      string
  pos_color:    string | null
  pos_cp:       number | null
  player:       string
  move_san:     string
  move_uci:     string | null
  move_num:     number | null
  move_times:   number
  move_wins:    number
  move_losses:  number
  move_cp:      number | null
  opening_name: string | null
  eco_code:     string | null
  last_occurred: number | null
}>> {
  const { params, playerFilter, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter, openingFilter, ecoFilter, sinceFilter } = buildHabitsFilter(opts)
  const limitClause  = (opts.limit  ?? 0) > 0 ? `LIMIT ${opts.limit}`   : ''
  const offsetClause = (opts.offset ?? 0) > 0 ? `OFFSET ${opts.offset}` : ''
  const orderClause = opts.sortBy === 'reached'
    ? 'h.hab_move_times DESC, ABS(h.hab_move_cp) DESC NULLS LAST'
    : 'ABS(h.hab_move_cp) DESC NULLS LAST'

  const queryResult = await table_query({
    caller: 'getHabitsData_player',
    table: 'thab_habits',
    query: `
      SELECT
        h.hab_pos_id                                     AS pos_id,
        p.pos_fen,
        p.pos_color,
        e.pose_cp                                         AS pos_cp,
        h.hab_player                                      AS player,
        h.hab_move_san                                    AS move_san,
        h.hab_move_uci                                    AS move_uci,
        h.hab_move_num                                    AS move_num,
        h.hab_move_times                                  AS move_times,
        h.hab_move_wins                                   AS move_wins,
        h.hab_move_losses                                 AS move_losses,
        e2.pose_cp                                         AS move_cp,
        h.hab_opening_name                                AS opening_name,
        h.hab_eco_code                                    AS eco_code,
        h.hab_last_occurred                               AS last_occurred
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      LEFT JOIN tpose_positions_eval e  ON e.pose_pos_id  = h.hab_pos_id
      LEFT JOIN tpose_positions_eval e2 ON e2.pose_pos_id = h.hab_resulting_pos_id
      WHERE h.hab_dismissed = ${dismissedPlaceholder}
        AND h.hab_move_times >= ${minReachedPlaceholder}
        ${playerFilter}
        ${colorFilter}
        ${qualityFilter}
        ${openingFilter}
        ${ecoFilter}
        ${sinceFilter}
      ORDER BY ${orderClause}
      ${limitClause}
      ${offsetClause}
    `,
    params
  })
  if (!queryResult.ok) {
    write_logging({
      lg_functionname: 'getHabitsData_player',
      lg_caller: 'getHabitsData_player',
      lg_msg: 'Failed to fetch habits data: ' + queryResult.error,
      lg_severity: 'E'
    })
    return []
  }
  return queryResult.data.map((r: any) => ({
    pos_id:       Number(r.pos_id),
    pos_fen:      r.pos_fen,
    pos_color:    r.pos_color,
    pos_cp:       r.pos_cp  != null ? Number(r.pos_cp)  : null,
    player:       r.player,
    move_san:     r.move_san,
    move_uci:     r.move_uci ?? null,
    move_num:     r.move_num != null ? Number(r.move_num) : null,
    move_times:   Number(r.move_times),
    move_wins:    Number(r.move_wins),
    move_losses:  Number(r.move_losses),
    move_cp:      r.move_cp != null ? Number(r.move_cp) : null,
    opening_name: r.opening_name ?? null,
    eco_code:     r.eco_code ?? null,
    last_occurred: r.last_occurred != null ? Number(r.last_occurred) : null
  }))
}

//----------------------------------------------------------------------------------
//  getHabitsCount_player — total row count for getHabitsData_player's same filter
//  set, for MyPagination's total-pages calculation
//----------------------------------------------------------------------------------
export async function getHabitsCount_player(opts: {
  players?: string[]
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
  opening?: string
  eco?: string
  sinceDate?: string
}): Promise<number> {
  const { params, playerFilter, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter, openingFilter, ecoFilter, sinceFilter } = buildHabitsFilter(opts)

  const result = await table_query({
    caller: 'getHabitsCount_player',
    table: 'thab_habits',
    query: `
      SELECT COUNT(*)::int AS total
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      WHERE h.hab_dismissed = ${dismissedPlaceholder}
        AND h.hab_move_times >= ${minReachedPlaceholder}
        ${playerFilter}
        ${colorFilter}
        ${qualityFilter}
        ${openingFilter}
        ${ecoFilter}
        ${sinceFilter}
    `,
    params
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getHabitsCount_player',
      lg_caller: 'getHabitsCount_player',
      lg_msg: 'Failed to fetch habits count: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data.length > 0 ? Number(result.data[0].total) : 0
}

//----------------------------------------------------------------------------------
//  dismissHabit_player — marks one (player, position, move) habit as dismissed so
//  it stops appearing in the default (non-dismissed) Habits view. Reversible via
//  undismissHabit_player.
//----------------------------------------------------------------------------------
export async function dismissHabit_player(player: string, posId: number, moveSan: string): Promise<void> {
  await table_update({
    caller: 'dismissHabit_player',
    table: 'thab_habits',
    columnValuePairs: [
      { column: 'hab_dismissed', value: true }
    ],
    whereColumnValuePairs: [
      { column: 'hab_player', value: player.toLowerCase() },
      { column: 'hab_pos_id', value: posId },
      { column: 'hab_move_san', value: moveSan }
    ]
  })
}

//----------------------------------------------------------------------------------
//  undismissHabit_player — restores a previously-dismissed habit back into the
//  default view.
//----------------------------------------------------------------------------------
export async function undismissHabit_player(player: string, posId: number, moveSan: string): Promise<void> {
  await table_update({
    caller: 'undismissHabit_player',
    table: 'thab_habits',
    columnValuePairs: [
      { column: 'hab_dismissed', value: false }
    ],
    whereColumnValuePairs: [
      { column: 'hab_player', value: player.toLowerCase() },
      { column: 'hab_pos_id', value: posId },
      { column: 'hab_move_san', value: moveSan }
    ]
  })
}

// ---------------------------------------------------------------------------
// Position detail page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getPositionDetail_player — all data for the position detail page (5 parallel
//  fetches). When player is given, gameCount and games are scoped to that
//  player's own games only (and ordered by game number descending, latest first)
//  — otherwise falls back to every tracked player, for backward compatibility
//  with links that omit it.
//----------------------------------------------------------------------------------
export async function getPositionDetail_player(posId: number, player?: string): Promise<{
  position: PositionRow | null
  moves: MoveRow[]
  posEval: EvaluationRow | null
  gameCount: number
  games: Array<{
    player:       string
    move_played:  string
    move_num:     number | null
    playerResult: string | null
    gdid:         number | null
    date:         string | null
  }>
}> {
  const gameCountParams: (number | string)[] = [posId]
  let gameCountPlayerFilter = ''
  if (player) {
    gameCountParams.push(player.toLowerCase())
    gameCountPlayerFilter = `AND d.gd_player = $${gameCountParams.length}`
  }

  const gamesParams: (number | string)[] = [posId]
  let gamesPlayerFilter = ''
  if (player) {
    gamesParams.push(player.toLowerCase())
    gamesPlayerFilter = `AND d.gd_player = $${gamesParams.length}`
  }

  const [posResult, movResult, posEvalResult, gameCountResult, gamesResult] = await Promise.all([
    table_fetch({
      caller: 'getPositionDetail_player',
      table: 'tpos_positions',
      whereColumnValuePairs: [{ column: 'pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail_player',
      table: 'tgam_game_positions',
      query: `
        SELECT sub.move_played, sub.move_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.pose_cp
        FROM (
          SELECT
            gp.gam_move_played                                   AS move_played,
            gp.gam_move_uci                                      AS move_uci,
            COUNT(*)::int                                        AS mov_times,
            COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
            COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
            MAX(gp.gam_resulting_pos_id)                          AS resulting_pos_id
          FROM tgam_game_positions gp
          JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
          WHERE gp.gam_pos_id = $1
            AND gp.gam_move_num > 0
          GROUP BY gp.gam_move_played, gp.gam_move_uci
        ) sub
        LEFT JOIN tpose_positions_eval e ON e.pose_pos_id = sub.resulting_pos_id
        ORDER BY sub.mov_times DESC
      `,
      params: [posId]
    }),
    table_fetch({
      caller: 'getPositionDetail_player',
      table: 'tpose_positions_eval',
      whereColumnValuePairs: [{ column: 'pose_pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail_player',
      table: 'tgam_game_positions',
      query: `
        SELECT COUNT(DISTINCT gp.gam_gdid)::int AS game_count
        FROM tgam_game_positions gp
        LEFT JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
          ${gameCountPlayerFilter}
      `,
      params: gameCountParams
    }),
    table_query({
      caller: 'getPositionDetail_player',
      table: 'tgam_game_positions',
      query: `
        SELECT
          d.gd_player,
          gp.gam_move_played,
          gp.gam_move_num,
          d.gd_player_result,
          d.gd_gdid,
          TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS game_date
        FROM tgam_game_positions gp
        LEFT JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
          ${gamesPlayerFilter}
        ORDER BY d.gd_end_time DESC
        LIMIT 50
      `,
      params: gamesParams
    })
  ])

  if (!posResult.ok || !movResult.ok || !posEvalResult.ok || !gameCountResult.ok || !gamesResult.ok) {
    write_logging({
      lg_functionname: 'getPositionDetail_player',
      lg_caller: 'getPositionDetail_player',
      lg_msg: 'Failed to fetch position detail for pos_id ' + posId + ': ' +
        [posResult, movResult, posEvalResult, gameCountResult, gamesResult]
          .filter(r => !r.ok).map(r => r.error).join('; '),
      lg_severity: 'E'
    })
    return { position: null, moves: [], posEval: null, gameCount: 0, games: [] }
  }

  return {
    position:  posResult.data[0]     as PositionRow  ?? null,
    moves:     movResult.data        as MoveRow[],
    posEval:   posEvalResult.data[0] as EvaluationRow ?? null,
    gameCount: Number((gameCountResult.data[0] as any)?.game_count ?? 0),
    games: gamesResult.data.map((r: any) => ({
      player:       r.gd_player,
      move_played:  r.gam_move_played,
      move_num:     r.gam_move_num != null ? Number(r.gam_move_num) : null,
      playerResult: r.gd_player_result ?? null,
      gdid:         r.gd_gdid      != null ? Number(r.gd_gdid)      : null,
      date:         r.game_date ?? null
    }))
  }
}
