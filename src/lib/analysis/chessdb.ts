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

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
}

export interface MoveRow {
  mov_san:    string
  mov_uci:    string | null
  mov_times:  number
  mov_wins:   number
  mov_losses: number
  mov_avg_cp: number | null
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
//  tgam_game_positions, ordered by frequency.
//----------------------------------------------------------------------------------
export async function getMovesForPosition(posId: number, player?: string): Promise<MoveRow[]> {
  const params: (number | string)[] = [posId]
  const playerFilter = player ? `AND d.gd_player = $2` : ''
  if (player) params.push(player.toLowerCase())

  return await table_query({
    caller: 'getMovesForPosition',
    query: `
      SELECT
        gp.gam_move_played                                   AS mov_san,
        gp.gam_move_uci                                      AS mov_uci,
        COUNT(*)::int                                        AS mov_times,
        COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
        COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
        ROUND(AVG(gp.gam_cp_change))::int                    AS mov_avg_cp
      FROM tgam_game_positions gp
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE gp.gam_pos_id = $1
        AND gp.gam_move_num > 0
        ${playerFilter}
      GROUP BY gp.gam_move_played, gp.gam_move_uci
      ORDER BY mov_times DESC
    `,
    params
  }) as MoveRow[]
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
    params: [data.fen]
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
//  getHabitsData — one row per (position × move) where avg CP is negative (loss).
//  Only bad moves are returned; the position detail page shows all moves. Reads from
//  thab_habits (built/refreshed by buildHabits() on the Pipeline page) rather than
//  live-aggregating tgam_game_positions on every request — pos_fen/pos_color/pos_cp
//  still come from tpos_positions/teva_evaluations via join since those aren't
//  player-specific and don't need duplicating into thab_habits.
//----------------------------------------------------------------------------------
function buildHabitsFilter(opts: {
  player?: string
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
}): { params: (string | number | boolean)[]; colorFilter: string } {
  const player     = (opts.player ?? '').toLowerCase()
  const minReached = opts.minReached ?? 3
  const dismissed  = opts.dismissed ?? false
  const params: (string | number | boolean)[] = [player, dismissed, minReached]
  const colorFilter = opts.color ? `AND p.pos_color = $${params.push(opts.color)}` : ''
  return { params, colorFilter }
}

export async function getHabitsData(opts: {
  player?: string
  color?: 'w' | 'b'
  sortBy?: 'cpLoss' | 'reached'
  limit?: number
  offset?: number
  minReached?: number
  dismissed?: boolean
}): Promise<Array<{
  pos_id:      number
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  move_san:    string
  move_uci:    string | null
  move_num:    number | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}>> {
  if (!opts.player) return []

  const { params, colorFilter } = buildHabitsFilter(opts)
  const limitClause  = (opts.limit  ?? 0) > 0 ? `LIMIT ${opts.limit}`   : ''
  const offsetClause = (opts.offset ?? 0) > 0 ? `OFFSET ${opts.offset}` : ''
  const orderClause = opts.sortBy === 'reached'
    ? 'h.hab_move_times DESC, h.hab_move_cp ASC NULLS LAST'
    : 'h.hab_move_cp ASC NULLS LAST'

  const rows = await table_query({
    caller: 'getHabitsData',
    query: `
      SELECT
        h.hab_pos_id                                     AS pos_id,
        p.pos_fen,
        p.pos_color,
        e.eva_cp                                          AS pos_cp,
        h.hab_move_san                                    AS move_san,
        h.hab_move_uci                                    AS move_uci,
        h.hab_move_num                                    AS move_num,
        h.hab_move_times                                  AS move_times,
        h.hab_move_wins                                   AS move_wins,
        h.hab_move_losses                                 AS move_losses,
        h.hab_move_cp                                     AS move_cp
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = h.hab_pos_id
      WHERE h.hab_player = $1
        AND h.hab_dismissed = $2
        AND h.hab_move_times >= $3
        ${colorFilter}
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
  player?: string
  color?: 'w' | 'b'
  minReached?: number
  dismissed?: boolean
}): Promise<number> {
  if (!opts.player) return 0

  const { params, colorFilter } = buildHabitsFilter(opts)

  const rows = await table_query({
    caller: 'getHabitsCount',
    query: `
      SELECT COUNT(*)::int AS total
      FROM thab_habits h
      JOIN tpos_positions p ON p.pos_id = h.hab_pos_id
      WHERE h.hab_player = $1
        AND h.hab_dismissed = $2
        AND h.hab_move_times >= $3
        ${colorFilter}
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
//  getPositionDetail — all data for the position detail page (5 parallel fetches)
//----------------------------------------------------------------------------------
export async function getPositionDetail(posId: number): Promise<{
  position: PositionRow | null
  moves: MoveRow[]
  posEval: EvaluationRow | null
  gameCount: number
  games: Array<{
    player:      string
    move_played: string
    move_num:    number | null
    cp_loss:     number | null
    result:      string | null
    gameId:      number | null
  }>
}> {
  const [posRows, movRows, posEvalRows, gameCountRows, gamesRows] = await Promise.all([
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tpos_positions',
      whereColumnValuePairs: [{ column: 'pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail',
      query: `
        SELECT
          gp.gam_move_played                                   AS mov_san,
          gp.gam_move_uci                                      AS mov_uci,
          COUNT(*)::int                                        AS mov_times,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int AS mov_losses,
          ROUND(AVG(gp.gam_cp_change))::int                    AS mov_avg_cp
        FROM tgam_game_positions gp
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
        GROUP BY gp.gam_move_played, gp.gam_move_uci
        ORDER BY mov_times DESC
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
        SELECT COUNT(DISTINCT gam_gdid)::int AS game_count
        FROM tgam_game_positions
        WHERE gam_pos_id = $1
          AND gam_move_num > 0
      `,
      params: [posId]
    }),
    table_query({
      caller: 'getPositionDetail',
      query: `
        SELECT
          d.gd_player,
          gp.gam_move_played,
          gp.gam_move_num,
          gp.gam_cp_change,
          d.gd_player_result,
          d.gd_gdid
        FROM tgam_game_positions gp
        LEFT JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        WHERE gp.gam_pos_id = $1
          AND gp.gam_move_num > 0
        ORDER BY gp.gam_gamid
        LIMIT 50
      `,
      params: [posId]
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
      cp_loss:     r.gam_cp_change  != null ? Number(r.gam_cp_change)  : null,
      result:      r.gd_player_result ?? null,
      gameId:      r.gd_gdid      != null ? Number(r.gd_gdid)      : null
    }))
  }
}

