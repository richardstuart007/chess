'use server'

// ============================================================================
// Analysis DB helpers
//
// Simple single-table ops use nextjs-shared generic functions:
//   table_fetch  — SELECT (cached)
//   table_write  — INSERT
//   table_update — UPDATE
//   table_upsert — INSERT … ON CONFLICT DO UPDATE SET col = EXCLUDED.col
//   table_count  — SELECT COUNT(*)
//   table_check  — existence check
//
// Complex queries (multi-join, LATERAL, json_agg, arithmetic upserts,
// COALESCE in SET) use table_query — raw SQL, no caching, with logging.
// ============================================================================

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_write }  from 'nextjs-shared/table_write'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_count }  from 'nextjs-shared/table_count'
import { table_check }  from 'nextjs-shared/table_check'
import { table_query }  from 'nextjs-shared/table_query'
import { MIN_ANALYSIS_MOVE } from '../constants'

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  pos_ply_count: number | null
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
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  upsertPosition — insert or increment pos_reached + track the minimum pos_ply_count;
//  returns the position's pos_id (get-or-create entry point for FEN → id)
//----------------------------------------------------------------------------------
export async function upsertPosition(
  fen: string,
  color: string,
  plyCount: number,
  moveNum: number
): Promise<number> {
  const rows = await table_query({
    caller: 'upsertPosition',
    query: `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_ply_count, pos_reached, pos_move_num)
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (pos_fen) DO UPDATE SET
        pos_reached   = tpos_positions.pos_reached + 1,
        pos_ply_count = LEAST(tpos_positions.pos_ply_count, $3)
      RETURNING pos_id
    `,
    params: [fen, color, plyCount, moveNum]
  })
  return (rows[0] as any).pos_id as number
}

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
        SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color, p.pos_ply_count
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
      SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color, p.pos_ply_count
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
  const playerFilter = player ? `AND gam_player = $2` : ''
  if (player) params.push(player.toLowerCase())

  return await table_query({
    caller: 'getMovesForPosition',
    query: `
      SELECT
        gam_move_played                                   AS mov_san,
        gam_move_uci                                      AS mov_uci,
        COUNT(*)::int                                     AS mov_times,
        COUNT(*) FILTER (WHERE gam_player_result = 'win')::int  AS mov_wins,
        COUNT(*) FILTER (WHERE gam_player_result = 'loss')::int AS mov_losses,
        ROUND(AVG(gam_cp_change))::int                   AS mov_avg_cp
      FROM tgam_game_positions
      WHERE gam_pos_id = $1
        AND gam_move_num > 0
        ${playerFilter}
      GROUP BY gam_move_played, gam_move_uci
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
}): Promise<void> {
  await table_upsert({
    caller: 'saveEvaluation',
    table: 'teva_evaluations',
    columnValuePairs: [
      { column: 'eva_pos_id',    value: data.posId },
      { column: 'eva_cp',        value: data.cp },
      { column: 'eva_best_move', value: data.bestMove }
    ],
    conflictColumns: ['eva_pos_id']
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

// ---------------------------------------------------------------------------
// Game Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveGamePosition — record a position occurrence in a game
//----------------------------------------------------------------------------------
export async function saveGamePosition(data: {
  gameRef:      string
  gdid:         number
  player:       string
  posId:        number
  posFen:       string
  movePlayed:   string
  moveUci:      string
  resultingFen: string
  moveNum:      number
  result:       string
  cpLoss?:      number
}): Promise<void> {
  await table_write({
    caller: 'saveGamePosition',
    table: 'tgam_game_positions',
    columnValuePairs: [
      { column: 'gam_game_ref',      value: data.gameRef },
      { column: 'gam_gdid',          value: data.gdid },
      { column: 'gam_player',        value: data.player.toLowerCase() },
      { column: 'gam_pos_id',        value: data.posId },
      { column: 'gam_pos_fen',       value: data.posFen },
      { column: 'gam_move_played',   value: data.movePlayed },
      { column: 'gam_move_uci',      value: data.moveUci },
      { column: 'gam_resulting_fen', value: data.resultingFen },
      { column: 'gam_move_num',      value: data.moveNum },
      { column: 'gam_player_result', value: data.result },
      { column: 'gam_cp_change',     value: data.cpLoss ?? null }
    ]
  })
}

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

//----------------------------------------------------------------------------------
//  updateGamePositionFlags — mark a position as habit or improvement
//  COALESCE in SET clause requires table_query.
//----------------------------------------------------------------------------------
export async function updateGamePositionFlags(data: {
  gdid: number
  posId: number
  isHabit: boolean
  isImproved: boolean
  cpLoss?: number
}): Promise<void> {
  await table_query({
    caller: 'updateGamePositionFlags',
    query: `
      UPDATE tgam_game_positions
      SET gam_is_habit    = $3,
          gam_is_improved = $4,
          gam_cp_change   = COALESCE($5, gam_cp_change)
      WHERE gam_gdid = $1 AND gam_pos_id = $2
    `,
    params: [data.gdid, data.posId, data.isHabit, data.isImproved, data.cpLoss ?? null]
  })
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveQuizResult — record one quiz attempt
//----------------------------------------------------------------------------------
export async function saveQuizResult(data: {
  session: string
  posId: number
  posFen: string
  movePlayed: string
  correct: boolean
  cpLoss: number | null
}): Promise<void> {
  await table_write({
    caller: 'saveQuizResult',
    table: 'tqui_quiz',
    columnValuePairs: [
      { column: 'qui_session',     value: data.session },
      { column: 'qui_pos_id',      value: data.posId },
      { column: 'qui_pos_fen',     value: data.posFen },
      { column: 'qui_move_played', value: data.movePlayed },
      { column: 'qui_correct',     value: data.correct },
      { column: 'qui_cp_change',   value: data.cpLoss }
    ]
  })
}

// ---------------------------------------------------------------------------
// Habits page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getHabitsData — one row per (position × move) where avg CP is negative (loss).
//  Only bad moves are returned; the position detail page shows all moves.
//----------------------------------------------------------------------------------
export async function getHabitsData(opts: {
  player?: string
  color?: 'w' | 'b'
  sortBy?: 'cpLoss' | 'reached'
  limit?: number
  minMove?: number
  minReached?: number
}): Promise<Array<{
  pos_id:      number
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  move_san:    string
  move_uci:    string | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}>> {
  if (!opts.player) return []

  const player     = opts.player.toLowerCase()
  const minMove    = opts.minMove    ?? MIN_ANALYSIS_MOVE
  const minReached = opts.minReached ?? 3
  const params: (string | number)[] = [player, minMove, minReached]

  const colorFilter = opts.color ? `AND p.pos_color = $${params.push(opts.color)}` : ''
  const limitClause = (opts.limit ?? 0) > 0 ? `LIMIT ${opts.limit}` : ''
  const orderClause = opts.sortBy === 'reached'
    ? 'COUNT(*) DESC, AVG(gp.gam_cp_change) ASC NULLS LAST'
    : 'AVG(gp.gam_cp_change) ASC NULLS LAST'

  const rows = await table_query({
    caller: 'getHabitsData',
    query: `
      SELECT
        p.pos_id,
        p.pos_fen,
        p.pos_color,
        e.eva_cp                                          AS pos_cp,
        gp.gam_move_played                                AS move_san,
        gp.gam_move_uci                                   AS move_uci,
        COUNT(*)::int                                     AS move_times,
        COUNT(*) FILTER (WHERE gp.gam_player_result = 'win')::int  AS move_wins,
        COUNT(*) FILTER (WHERE gp.gam_player_result = 'loss')::int AS move_losses,
        ROUND(AVG(gp.gam_cp_change)::numeric, 2)         AS move_cp
      FROM tgam_game_positions gp
      JOIN tpos_positions p ON p.pos_id = gp.gam_pos_id
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = gp.gam_pos_id
      WHERE gp.gam_player = $1
        AND gp.gam_move_num >= $2
        ${colorFilter}
      GROUP BY p.pos_id, p.pos_fen, p.pos_color, e.eva_cp, gp.gam_move_played, gp.gam_move_uci
      HAVING COUNT(*) >= $3
        AND AVG(gp.gam_cp_change) < 0
      ORDER BY ${orderClause}
      ${limitClause}
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
    move_times:  Number(r.move_times),
    move_wins:   Number(r.move_wins),
    move_losses: Number(r.move_losses),
    move_cp:     r.move_cp != null ? Number(r.move_cp) : null
  }))
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
          gam_move_played                                   AS mov_san,
          gam_move_uci                                      AS mov_uci,
          COUNT(*)::int                                     AS mov_times,
          COUNT(*) FILTER (WHERE gam_player_result = 'win')::int  AS mov_wins,
          COUNT(*) FILTER (WHERE gam_player_result = 'loss')::int AS mov_losses,
          ROUND(AVG(gam_cp_change))::int                   AS mov_avg_cp
        FROM tgam_game_positions
        WHERE gam_pos_id = $1
          AND gam_move_num > 0
        GROUP BY gam_move_played, gam_move_uci
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
          gp.gam_player,
          gp.gam_move_played,
          gp.gam_move_num,
          gp.gam_cp_change,
          gp.gam_player_result,
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
      player:      r.gam_player,
      move_played: r.gam_move_played,
      move_num:    r.gam_move_num != null ? Number(r.gam_move_num) : null,
      cp_loss:     r.gam_cp_change  != null ? Number(r.gam_cp_change)  : null,
      result:      r.gam_player_result ?? null,
      gameId:      r.gd_gdid      != null ? Number(r.gd_gdid)      : null
    }))
  }
}

// ---------------------------------------------------------------------------
// Quiz queue
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getQuizQueue — top positions by priority with best and habit move
//  LATERAL join requires table_query.
//----------------------------------------------------------------------------------
export async function getQuizQueue(limit: number = 20, player?: string): Promise<Array<{
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
  best_move: string | null
  habit_move: string | null
  habit_move_uci: string | null
  habit_times: number | null
}>> {
  const params: (string | number)[] = []
  const extraFilters: string[] = []
  if (player) {
    params.push(player.toLowerCase())
    extraFilters.push(`EXISTS (SELECT 1 FROM tgam_game_positions WHERE gam_pos_id = p.pos_id AND gam_player = $${params.length})`)
  }
  // Exclude opening positions — only quiz positions reached from move 6 onwards
  extraFilters.push(`(SELECT MIN(gam_move_num) FROM tgam_game_positions WHERE gam_pos_id = p.pos_id) >= ${MIN_ANALYSIS_MOVE}`)
  // Require at least 3 occurrences to be a real habit
  extraFilters.push(`p.pos_reached >= 3`)

  const whereExtra = extraFilters.map(f => `AND ${f}`).join('\n      ')
  const limitIdx = params.length + 1
  if (limit > 0) params.push(limit)

  const rows = await table_query({
    caller: 'getQuizQueue',
    query: `
      SELECT
        p.pos_id,
        p.pos_fen,
        p.pos_reached,
        p.pos_color,
        i.ins_theme,
        i.ins_advice,
        i.ins_priority,
        e.eva_best_move             AS best_move,
        habit.gam_move_played       AS habit_move,
        habit.gam_move_uci          AS habit_move_uci,
        habit.times                 AS habit_times
      FROM (
        SELECT DISTINCT gam_pos_id FROM tgam_game_positions
        ${player ? `WHERE gam_player = $1` : ''}
      ) gp
      JOIN tpos_positions p ON p.pos_id = gp.gam_pos_id
      LEFT JOIN tins_insights i ON i.ins_pos_id = gp.gam_pos_id
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = gp.gam_pos_id
      LEFT JOIN LATERAL (
        SELECT gam_move_played, gam_move_uci, COUNT(*)::int AS times
        FROM tgam_game_positions
        WHERE gam_pos_id = gp.gam_pos_id
          ${player ? `AND gam_player = $1` : ''}
        GROUP BY gam_move_played, gam_move_uci
        ORDER BY times DESC
        LIMIT 1
      ) habit ON TRUE
      WHERE TRUE
      ${whereExtra}
      ORDER BY i.ins_priority DESC NULLS LAST
      ${limit > 0 ? `LIMIT $${limitIdx}` : ''}
    `,
    params
  })
  return rows.map((r: any) => ({
    pos_id:         Number(r.pos_id),
    pos_fen:        r.pos_fen,
    pos_reached:    Number(r.pos_reached),
    pos_color:      r.pos_color,
    ins_theme:      r.ins_theme,
    ins_advice:     r.ins_advice,
    ins_priority:   r.ins_priority != null ? Number(r.ins_priority) : null,
    best_move:      r.best_move,
    habit_move:     r.habit_move,
    habit_move_uci: r.habit_move_uci ?? null,
    habit_times:    r.habit_times != null ? Number(r.habit_times) : null
  }))
}

