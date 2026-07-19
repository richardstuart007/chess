'use server'

// ============================================================================
// Analysis DB helpers
//
// Simple single-table ops use nextjs-shared generic functions:
//   table_fetch  — SELECT (cached)
//   table_update — UPDATE
//   table_upsert — INSERT … ON CONFLICT DO UPDATE SET col = EXCLUDED.col
//   table_count  — SELECT COUNT(*)
//   table_check  — existence check
//
// Complex queries (multi-join, LATERAL, json_agg, arithmetic upserts,
// COALESCE in SET) use table_query — raw SQL, no caching, with logging.
// ============================================================================

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_count }  from 'nextjs-shared/table_count'
import { table_check }  from 'nextjs-shared/table_check'
import { table_query }  from 'nextjs-shared/table_query'
import { table_update } from 'nextjs-shared/table_update'
import { truncateFen }  from '../fen'
import { POSITION_GAMES_LIMIT } from '../constants'

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
}

export interface MoveRow {
  mov_san:       string
  mov_uci:       string | null
  mov_times:     number
  mov_wins:      number
  mov_losses:    number
  mov_result_cp: number | null
}

export interface EvaluationRow {
  eva_evaid: number
  eva_cp: number | null
  eva_best_move: string | null
  eva_depth: number
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getPositionsToEvaluate — positions with no evaluation yet
//  LEFT JOIN + NULL check on joined table requires table_query.
//----------------------------------------------------------------------------------
export async function getPositionsToEvaluate(
  limit:     number  = 100,
  dateFrom?: string,
  dateTo?:   string
): Promise<PositionRow[]> {
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const params: (string | number)[] = [fromTs, toTs]
    if (limit > 0) params.push(limit)
    return await table_query({
      caller: 'getPositionsToEvaluate',
      query: `
        SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color
        FROM tpos_positions p
        LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
        WHERE e.eva_evaid IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
            WHERE gp.gam_pos_id = p.pos_id AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
          )
        ORDER BY p.pos_reached DESC
        ${limit > 0 ? `LIMIT $3` : ''}
      `,
      params
    }) as PositionRow[]
  }
  return await table_query({
    caller: 'getPositionsToEvaluate',
    query: `
      SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE e.eva_evaid IS NULL
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: []
  }) as PositionRow[]
}

//----------------------------------------------------------------------------------
//  getPositionCount — total number of positions
//----------------------------------------------------------------------------------
export async function getPositionCount(): Promise<number> {
  return await table_count({ table: 'tpos_positions', caller: 'getPositionCount' })
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getMovesForPosition — distinct moves played from a position, aggregated from
//  tgam_game_positions, ordered by frequency. mov_result_cp is the Stockfish eval of
//  the position resulting from each move (deterministic per position+move — every
//  game sharing a move from this position reaches the identical resulting position),
//  not an average — looked up once via the subquery's resulting_pos_id, not aggregated.
//----------------------------------------------------------------------------------
export async function getMovesForPosition(posId: number, player?: string): Promise<MoveRow[]> {
  const params: (number | string)[] = [posId]
  const playerFilter = player ? `AND d.gd_player = $2` : ''
  if (player) params.push(player.toLowerCase())

  return await table_query({
    caller: 'getMovesForPosition',
    query: `
      SELECT sub.mov_san, sub.mov_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.eva_cp AS mov_result_cp
      FROM (
        SELECT
          gp.gam_move_played                                   AS mov_san,
          gp.gam_move_uci                                      AS mov_uci,
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
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = sub.resulting_pos_id
      ORDER BY sub.mov_times DESC
    `,
    params
  }) as MoveRow[]
}

//----------------------------------------------------------------------------------
//  getMovePlayCount — how many times a specific move was played from a position,
//  across the given player's own synced games (either color, opponent-agnostic —
//  matches getMovesForPosition's existing counting convention: COUNT(*) of plies)
//----------------------------------------------------------------------------------
export async function getMovePlayCount(fen: string, moveSan: string, player: string): Promise<number> {
  const rows = await table_query({
    caller: 'getMovePlayCount',
    query: `
      SELECT COUNT(*)::int AS times
      FROM tpos_positions p
      JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE p.pos_fen = $1
        AND gp.gam_move_played = $2
        AND gp.gam_move_num > 0
        AND d.gd_player = $3
    `,
    params: [truncateFen(fen), moveSan, player.toLowerCase()]
  }) as { times: number }[]
  return rows.length > 0 ? Number(rows[0].times) : 0
}

//----------------------------------------------------------------------------------
//  getMovePlayCounts — batched version of getMovePlayCount for a whole move tree in
//  one round trip. Keyed by the same truncated FEN tpos_positions.pos_fen stores, so
//  callers must truncate their own FEN lookups the same way before matching keys.
//----------------------------------------------------------------------------------
export async function getMovePlayCounts(fens: string[], player: string): Promise<Record<string, Record<string, number>>> {
  const uniqueFens = [...new Set(fens.map(truncateFen))]
  if (uniqueFens.length === 0) return {}

  const params: (string | number)[] = []
  const fenPlaceholders = uniqueFens
    .map(f => { params.push(f); return `$${params.length}` })
    .join(', ')
  params.push(player.toLowerCase())
  const playerPlaceholder = `$${params.length}`

  const rows = await table_query({
    caller: 'getMovePlayCounts',
    query: `
      SELECT p.pos_fen, gp.gam_move_played AS mov_san, COUNT(*)::int AS times
      FROM tpos_positions p
      JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE p.pos_fen IN (${fenPlaceholders})
        AND gp.gam_move_num > 0
        AND d.gd_player = ${playerPlaceholder}
      GROUP BY p.pos_fen, gp.gam_move_played
    `,
    params
  }) as { pos_fen: string; mov_san: string; times: number }[]

  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!result[row.pos_fen]) result[row.pos_fen] = {}
    result[row.pos_fen][row.mov_san] = Number(row.times)
  }
  return result
}

//----------------------------------------------------------------------------------
//  getMoveSummaryForPosition — one row per move played from this exact position,
//  aggregated across all tracked players. FEN-keyed version of getMovesForPosition's
//  aggregation query (via tpos_positions.pos_fen, like getGamesForPosition), used by
//  the Analyze page's "Moves From This Position" panel for any position on the board.
//  mov_result_cp is the resulting position's Stockfish eval (deterministic per
//  position+move), not an average — see getMovesForPosition's comment.
//----------------------------------------------------------------------------------
export async function getMoveSummaryForPosition(fen: string): Promise<MoveRow[]> {
  return await table_query({
    caller: 'getMoveSummaryForPosition',
    query: `
      SELECT sub.mov_san, sub.mov_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.eva_cp AS mov_result_cp
      FROM (
        SELECT
          gp.gam_move_played                                   AS mov_san,
          gp.gam_move_uci                                      AS mov_uci,
          COUNT(*)::int                                        AS mov_times,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
          MAX(gp.gam_resulting_pos_id)                          AS resulting_pos_id
        FROM tpos_positions p
        JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE p.pos_fen = $1
          AND gp.gam_move_num > 0
        GROUP BY gp.gam_move_played, gp.gam_move_uci
      ) sub
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = sub.resulting_pos_id
      ORDER BY sub.mov_times DESC
    `,
    params: [truncateFen(fen)]
  }) as MoveRow[]
}

export interface PositionGameHit {
  player:         string
  move_played:    string
  move_num:       number | null
  result:         string | null
  gameId:         number | null
  date:           string | null
  opponentRating: number | null
  termination:    string | null
  finalEval:      number | null
}

//----------------------------------------------------------------------------------
//  getGamesForPosition — every game the given player reached this exact position in,
//  keyed by FEN like getMovePlayCount/getMovePlayCounts. Used by the Analyze page's
//  "Games From This Position" panel, which can show any position currently on the
//  board — not just ones with a known pos_id. Ordered by game number descending
//  (latest first).
//----------------------------------------------------------------------------------
export async function getGamesForPosition(fen: string, player: string, excludeGdid?: number): Promise<PositionGameHit[]> {
  const params: (string | number)[] = [truncateFen(fen), player.toLowerCase()]
  let excludeFilter = ''
  if (excludeGdid) {
    params.push(excludeGdid)
    excludeFilter = `AND d.gd_gdid != $${params.length}`
  }

  const rows = await table_query({
    caller: 'getGamesForPosition',
    query: `
      SELECT
        d.gd_player,
        gp.gam_move_played,
        gp.gam_move_num,
        d.gd_player_result,
        d.gd_gdid,
        TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS game_date,
        d.gd_opponent_rating,
        d.gd_termination,
        d.gd_final_eval
      FROM tpos_positions p
      JOIN tgam_game_positions gp ON gp.gam_pos_id = p.pos_id
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE p.pos_fen = $1
        AND gp.gam_move_num > 0
        AND d.gd_player = $2
        ${excludeFilter}
      ORDER BY d.gd_gdid DESC
      LIMIT ${POSITION_GAMES_LIMIT}
    `,
    params
  })

  return rows.map((r: any) => ({
    player:         r.gd_player,
    move_played:    r.gam_move_played,
    move_num:       r.gam_move_num != null ? Number(r.gam_move_num) : null,
    result:         r.gd_player_result ?? null,
    gameId:         r.gd_gdid != null ? Number(r.gd_gdid) : null,
    date:           r.game_date ?? null,
    opponentRating: r.gd_opponent_rating != null ? Number(r.gd_opponent_rating) : null,
    termination:    r.gd_termination ?? null,
    finalEval:      r.gd_final_eval != null ? Number(r.gd_final_eval) : null
  }))
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveEvaluation — upsert a Stockfish evaluation for a position or move
//----------------------------------------------------------------------------------
export async function saveEvaluation(data: {
  posId: number
  cp: number | null
  bestMove: string | null
  depth: number
}): Promise<void> {
  await table_upsert({
    caller: 'saveEvaluation',
    table: 'teva_evaluations',
    columnValuePairs: [
      { column: 'eva_pos_id',    value: data.posId },
      { column: 'eva_cp',        value: data.cp },
      { column: 'eva_best_move', value: data.bestMove },
      { column: 'eva_depth',     value: data.depth }
    ],
    conflictColumns: ['eva_pos_id'],
    skipCache: true
  })
}

//----------------------------------------------------------------------------------
//  getEvaluationForPosition — the Stockfish evaluation for a position
//----------------------------------------------------------------------------------
export async function getEvaluationForPosition(posId: number): Promise<EvaluationRow | null> {
  const rows = await table_fetch({
    caller: 'getEvaluationForPosition',
    table: 'teva_evaluations',
    whereColumnValuePairs: [{ column: 'eva_pos_id', value: posId }]
  })
  return rows[0] as EvaluationRow ?? null
}

//----------------------------------------------------------------------------------
//  upgradePositionEvaluation — merge a deeper live /analyze evaluation into an existing
//  teva_evaluations row, keyed by FEN. Only upgrades positions the batch pipeline already
//  tracks (never creates a tpos_positions/teva_evaluations row here) and only when the new
//  depth exceeds what's stored. On upgrade, immediately recomputes gam_cp_change for the
//  affected tgam_game_positions rows — deliberately not via bulkUpdateCpLoss(), since that
//  logs a pipeline step and would make every interactive analyze click look like a new
//  pipeline run on the Owner > Pipeline page.
//----------------------------------------------------------------------------------
export async function upgradePositionEvaluation(data: {
  fen: string
  cp: number
  bestMove: string | null
  depth: number
}): Promise<boolean> {
  const posRows = await table_query({
    caller: 'upgradePositionEvaluation_lookup',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncateFen(data.fen)]
  })
  const posId = posRows[0]?.pos_id as number | undefined
  if (!posId) return false

  const updated = await table_query({
    caller: 'upgradePositionEvaluation_update',
    table: 'teva_evaluations',
    query: `
      UPDATE teva_evaluations
      SET eva_cp = $1, eva_best_move = $2, eva_depth = $3
      WHERE eva_pos_id = $4 AND eva_depth < $3
      RETURNING eva_evaid
    `,
    params: [data.cp, data.bestMove, data.depth, posId],
    isupdate: true
  })
  if (updated.length === 0) return false

  await table_query({
    caller: 'upgradePositionEvaluation_recompute_cp_change',
    table: 'tgam_game_positions',
    query: `
      UPDATE tgam_game_positions gp
      SET gam_cp_change =
        CASE WHEN p.pos_color = 'w'
          THEN e_after.eva_cp  - e_before.eva_cp
          ELSE e_before.eva_cp - e_after.eva_cp
        END
      FROM tpos_positions p,
           teva_evaluations e_before,
           teva_evaluations e_after
      WHERE gp.gam_pos_id          = p.pos_id
        AND e_before.eva_pos_id     = gp.gam_pos_id
        AND e_after.eva_pos_id      = gp.gam_resulting_pos_id
        AND gp.gam_resulting_pos_id IS NOT NULL
        AND e_before.eva_cp IS NOT NULL
        AND e_after.eva_cp  IS NOT NULL
        AND (gp.gam_pos_id = $1 OR gp.gam_resulting_pos_id = $1)
    `,
    params: [posId],
    isupdate: true
  })

  return true
}

// ---------------------------------------------------------------------------
// Game Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  gamePositionExists — check whether a game position has already been recorded
//----------------------------------------------------------------------------------
export async function gamePositionExists(gdid: number, posId: number): Promise<boolean> {
  const { found } = await table_check([{
    table: 'tgam_game_positions',
    whereColumnValuePairs: [
      { column: 'gam_gdid',  value: gdid },
      { column: 'gam_pos_id', value: posId }
    ]
  }], 'gamePositionExists')
  return found
}

// ---------------------------------------------------------------------------
// Habits page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getHabitsData — one row per (position × move) recurring habit, good or bad
//  (see quality). The position detail page separately shows all moves regardless of
//  habit status. Reads from thab_habits (built/refreshed by buildHabits() on the
//  Pipeline page) rather than live-aggregating tgam_game_positions on every request —
//  pos_fen/pos_color/pos_cp still come from tpos_positions/teva_evaluations via join
//  since those aren't player-specific and don't need duplicating into thab_habits.
//  move_cp is the resulting position's eva_cp (via hab_resulting_pos_id), not the
//  hab_move_cp delta — that delta stays internal, driving the quality filter/sort only.
//----------------------------------------------------------------------------------
function buildHabitsFilter(opts: {
  players?: string[]
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
}): {
  params: (string | number | boolean)[]
  playerPlaceholders: string
  dismissedPlaceholder: string
  minReachedPlaceholder: string
  colorFilter: string
  qualityFilter: string
} {
  const players    = (opts.players ?? []).map(p => p.toLowerCase())
  const minReached = opts.minReached ?? 3
  const dismissed  = opts.dismissed ?? false
  const quality    = opts.quality ?? 'bad'
  const params: (string | number | boolean)[] = []
  const playerPlaceholders = players
    .map(p => { params.push(p); return `$${params.length}` })
    .join(', ')
  params.push(dismissed)
  const dismissedPlaceholder = `$${params.length}`
  params.push(minReached)
  const minReachedPlaceholder = `$${params.length}`
  const colorFilter = opts.color ? `AND p.pos_color = $${params.push(opts.color)}` : ''
  const qualityFilter = quality === 'good' ? 'AND h.hab_move_cp > 0' : 'AND h.hab_move_cp < 0'
  return { params, playerPlaceholders, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter }
}

export async function getHabitsData(opts: {
  players?: string[]
  color?: 'w' | 'b'
  sortBy?: 'cpLoss' | 'reached'
  limit?: number
  offset?: number
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
}): Promise<Array<{
  pos_id:      number
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  player:      string
  move_san:    string
  move_uci:    string | null
  move_num:    number | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}>> {
  if (!opts.players || opts.players.length === 0) return []

  const { params, playerPlaceholders, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter } = buildHabitsFilter(opts)
  const limitClause  = (opts.limit  ?? 0) > 0 ? `LIMIT ${opts.limit}`   : ''
  const offsetClause = (opts.offset ?? 0) > 0 ? `OFFSET ${opts.offset}` : ''
  const orderClause = opts.sortBy === 'reached'
    ? 'h.hab_move_times DESC, ABS(h.hab_move_cp) DESC NULLS LAST'
    : 'ABS(h.hab_move_cp) DESC NULLS LAST'

  const rows = await table_query({
    caller: 'getHabitsData',
    query: `
      SELECT
        h.hab_pos_id                                     AS pos_id,
        p.pos_fen,
        p.pos_color,
        e.eva_cp                                          AS pos_cp,
        h.hab_player                                      AS player,
        h.hab_move_san                                    AS move_san,
        h.hab_move_uci                                    AS move_uci,
        h.hab_move_num                                    AS move_num,
        h.hab_move_times                                  AS move_times,
        h.hab_move_wins                                   AS move_wins,
        h.hab_move_losses                                 AS move_losses,
        e2.eva_cp                                          AS move_cp
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      LEFT JOIN teva_evaluations e  ON e.eva_pos_id  = h.hab_pos_id
      LEFT JOIN teva_evaluations e2 ON e2.eva_pos_id = h.hab_resulting_pos_id
      WHERE h.hab_player IN (${playerPlaceholders})
        AND h.hab_dismissed = ${dismissedPlaceholder}
        AND h.hab_move_times >= ${minReachedPlaceholder}
        ${colorFilter}
        ${qualityFilter}
      ORDER BY ${orderClause}
      ${limitClause}
      ${offsetClause}
    `,
    params
  })
  return rows.map((r: any) => ({
    pos_id:      Number(r.pos_id),
    pos_fen:     r.pos_fen,
    pos_color:   r.pos_color,
    pos_cp:      r.pos_cp  != null ? Number(r.pos_cp)  : null,
    player:      r.player,
    move_san:    r.move_san,
    move_uci:    r.move_uci ?? null,
    move_num:    r.move_num != null ? Number(r.move_num) : null,
    move_times:  Number(r.move_times),
    move_wins:   Number(r.move_wins),
    move_losses: Number(r.move_losses),
    move_cp:     r.move_cp != null ? Number(r.move_cp) : null
  }))
}

//----------------------------------------------------------------------------------
//  getHabitsCount — total row count for getHabitsData's same filter set, for
//  MyPagination's total-pages calculation
//----------------------------------------------------------------------------------
export async function getHabitsCount(opts: {
  players?: string[]
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
  quality?: 'bad' | 'good'
}): Promise<number> {
  if (!opts.players || opts.players.length === 0) return 0

  const { params, playerPlaceholders, dismissedPlaceholder, minReachedPlaceholder, colorFilter, qualityFilter } = buildHabitsFilter(opts)

  const rows = await table_query({
    caller: 'getHabitsCount',
    query: `
      SELECT COUNT(*)::int AS total
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      WHERE h.hab_player IN (${playerPlaceholders})
        AND h.hab_dismissed = ${dismissedPlaceholder}
        AND h.hab_move_times >= ${minReachedPlaceholder}
        ${colorFilter}
        ${qualityFilter}
    `,
    params
  })
  return rows.length > 0 ? Number(rows[0].total) : 0
}

//----------------------------------------------------------------------------------
//  dismissHabit — marks one (player, position, move) habit as dismissed so it stops
//  appearing in the default (non-dismissed) Habits view. Reversible via undismissHabit.
//----------------------------------------------------------------------------------
export async function dismissHabit(player: string, posId: number, moveSan: string): Promise<void> {
  await table_update({
    caller: 'dismissHabit',
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
//  undismissHabit — restores a previously-dismissed habit back into the default view.
//----------------------------------------------------------------------------------
export async function undismissHabit(player: string, posId: number, moveSan: string): Promise<void> {
  await table_update({
    caller: 'undismissHabit',
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
//  getPositionDetail — all data for the position detail page (5 parallel fetches).
//  When player is given, gameCount and games are scoped to that player's own games
//  only (and ordered by game number descending, latest first) — otherwise falls back
//  to every tracked player, for backward compatibility with links that omit it.
//----------------------------------------------------------------------------------
export async function getPositionDetail(posId: number, player?: string): Promise<{
  position: PositionRow | null
  moves: MoveRow[]
  posEval: EvaluationRow | null
  gameCount: number
  games: Array<{
    player:      string
    move_played: string
    move_num:    number | null
    result:      string | null
    gameId:      number | null
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

  const [posRows, movRows, posEvalRows, gameCountRows, gamesRows] = await Promise.all([
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tpos_positions',
      whereColumnValuePairs: [{ column: 'pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail',
      query: `
        SELECT sub.mov_san, sub.mov_uci, sub.mov_times, sub.mov_wins, sub.mov_losses, e.eva_cp AS mov_result_cp
        FROM (
          SELECT
            gp.gam_move_played                                   AS mov_san,
            gp.gam_move_uci                                      AS mov_uci,
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
        LEFT JOIN teva_evaluations e ON e.eva_pos_id = sub.resulting_pos_id
        ORDER BY sub.mov_times DESC
      `,
      params: [posId]
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'teva_evaluations',
      whereColumnValuePairs: [{ column: 'eva_pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail',
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
      caller: 'getPositionDetail',
      query: `
        SELECT
          d.gd_player,
          gp.gam_move_played,
          gp.gam_move_num,
          d.gd_player_result,
          d.gd_gdid
        FROM tgam_game_positions gp
        LEFT JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
          ${gamesPlayerFilter}
        ORDER BY d.gd_gdid DESC
        LIMIT 50
      `,
      params: gamesParams
    })
  ])

  return {
    position:  posRows[0]     as PositionRow  ?? null,
    moves:     movRows        as MoveRow[],
    posEval:   posEvalRows[0] as EvaluationRow ?? null,
    gameCount: Number((gameCountRows[0] as any)?.game_count ?? 0),
    games: gamesRows.map((r: any) => ({
      player:      r.gd_player,
      move_played: r.gam_move_played,
      move_num:    r.gam_move_num != null ? Number(r.gam_move_num) : null,
      result:      r.gd_player_result ?? null,
      gameId:      r.gd_gdid      != null ? Number(r.gd_gdid)      : null
    }))
  }
}

