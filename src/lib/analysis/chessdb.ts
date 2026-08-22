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
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalRows } from 'nextjs-shared/fetchTotalRows'
import type { Filter, JoinParams } from 'nextjs-shared/structures'
import { cache_clearTable } from 'nextjs-shared/userCache_store'
import { truncateFen }  from '../fen'
import { RESULT_MISMATCH_CP_THRESHOLD, MIN_ANALYSIS_MOVE } from '../constants'

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
}

export interface MoveRow {
  move_played: string
  move_uci:    string | null
  mov_times:   number
  mov_wins:    number
  mov_losses:  number
  pose_cp:      number | null
  pose_depth:   number | null
}

export interface EvaluationRow {
  pose_pos_id: number
  pose_cp: number | null
  pose_best_move: string | null
  pose_depth: number
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

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
//  tgam_game_positions, ordered by frequency. pose_cp is the Stockfish eval of
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
  }) as MoveRow[]
}

//----------------------------------------------------------------------------------
//  getMovePlayCounts — how many times each move was played from a set of positions,
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
  }) as { pos_fen: string; gam_move_played: string; times: number }[]

  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!result[row.pos_fen]) result[row.pos_fen] = {}
    result[row.pos_fen][row.gam_move_played] = Number(row.times)
  }
  return result
}

//----------------------------------------------------------------------------------
//  getMoveSummaryForPosition — one row per move played from this exact position,
//  scoped to the given player. FEN-keyed version of getMovesForPosition's aggregation
//  query (via tpos_positions.pos_fen, like fetchGamesForPosition), used by the Analyze
//  page's "Moves From This Position" panel for any position on the board.
//  pose_cp is the resulting position's Stockfish eval (deterministic per
//  position+move), not an average — see getMovesForPosition's comment.
//----------------------------------------------------------------------------------
export async function getMoveSummaryForPosition(fen: string, player: string): Promise<MoveRow[]> {
  return await table_query({
    caller: 'getMoveSummaryForPosition',
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
  }) as MoveRow[]
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
//  Shared join/filter shape for fetchGamesForPosition/getGamesForPositionCount — the exact
//  same Filter[] must drive both, or the reported total and the fetched page disagree.
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
    : (playerResult === 'loss' || playerResult === 'draw') && playerEval >= RESULT_MISMATCH_CP_THRESHOLD ? 'lostWinning'
    : playerResult === 'win'  && playerEval <= -RESULT_MISMATCH_CP_THRESHOLD ? 'wonLosing'
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
//  fetchGamesForPosition — one page of the given player's games that reached this exact
//  position, optionally narrowed (server-side) to games where a specific move was played
//  next. Used by the Analyze page's "Games Played" panel, which can show any position
//  currently on the board — not just ones with a known pos_id. Ordered by end time
//  descending (latest first).
//----------------------------------------------------------------------------------
export async function fetchGamesForPosition(
  fen: string,
  player: string,
  page: number,
  itemsPerPage: number,
  move?: string
): Promise<PositionGameHit[]> {
  const offset = (page - 1) * itemsPerPage
  const rows = await fetchFiltered({
    table: 'tpos_positions',
    joins: POSITION_GAMES_JOINS,
    filters: buildPositionGamesFilters(fen, player, move),
    orderBy: 'gd_end_time DESC',
    limit: itemsPerPage,
    offset,
    caller: 'fetchGamesForPosition'
  })
  return rows.map(mapPositionGameRow)
}

//----------------------------------------------------------------------------------
//  getGamesForPositionCount — total row count for fetchGamesForPosition's same filter set
//----------------------------------------------------------------------------------
export async function getGamesForPositionCount(fen: string, player: string, move?: string): Promise<number> {
  return await fetchTotalRows({
    table: 'tpos_positions',
    joins: POSITION_GAMES_JOINS,
    filters: buildPositionGamesFilters(fen, player, move),
    caller: 'getGamesForPositionCount'
  })
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
    table: 'tpose_positions_eval',
    columnValuePairs: [
      { column: 'pose_pos_id',    value: data.posId },
      { column: 'pose_cp',        value: data.cp },
      { column: 'pose_best_move', value: data.bestMove },
      { column: 'pose_depth',     value: data.depth }
    ],
    conflictColumns: ['pose_pos_id'],
    skipCache: true
  })
}

//----------------------------------------------------------------------------------
//  getEvaluationForPosition — the Stockfish evaluation for a position
//----------------------------------------------------------------------------------
export async function getEvaluationForPosition(posId: number): Promise<EvaluationRow | null> {
  const rows = await table_fetch({
    caller: 'getEvaluationForPosition',
    table: 'tpose_positions_eval',
    whereColumnValuePairs: [{ column: 'pose_pos_id', value: posId }]
  })
  return rows[0] as EvaluationRow ?? null
}

//----------------------------------------------------------------------------------
//  getOrCreatePosition — look up tpos_positions by FEN; if missing, insert a new row.
//  pos_color/pos_move_num are derived directly from the FEN's own active-color and
//  fullmove-counter fields — same "derive from the FEN itself" pattern
//  buildPositionTree.ts's syncTposFromTgam() already uses for pos_color. Used by
//  upgradePositionEvaluation's createIfMissing path to write back evaluations for
//  positions outside the normal position-tree build range (MIN_ANALYSIS_MOVE..
//  MAX_ANALYSIS_MOVE) — those rows are exempted from purgeStaleReachOnePositions by
//  pos_move_num, since they were never part of the reach-tracked habit system.
//----------------------------------------------------------------------------------
async function getOrCreatePosition(truncatedFen: string): Promise<number> {
  const existing = await table_query({
    caller: 'getOrCreatePosition_lookup',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncatedFen],
    skipCache: true
  })
  if (existing[0]?.pos_id) return existing[0].pos_id as number

  const parts = truncatedFen.split(' ')
  const color = parts[1] ?? null
  const moveNum = parseInt(parts[5] ?? '', 10)

  await table_query({
    caller: 'getOrCreatePosition_insert',
    table: 'tpos_positions',
    query: `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_move_num, pos_reached)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (pos_fen) DO NOTHING
    `,
    params: [truncatedFen, color, Number.isFinite(moveNum) ? moveNum : null],
    isupdate: true
  })

  cache_clearTable('tpos_positions', 'getOrCreatePosition')

  const created = await table_query({
    caller: 'getOrCreatePosition_reselect',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncatedFen],
    skipCache: true
  })
  return created[0].pos_id as number
}

//----------------------------------------------------------------------------------
//  upgradePositionEvaluation — the single driving function for every position-eval
//  write in the app. Upserts tpose_positions_eval for the position (creating a
//  tpos_positions row too, via getOrCreatePosition, when createIfMissing is true and
//  the position falls outside the batch pipeline's normal tracked range) and, on a
//  successful upgrade:
//    - if gameContext is given, also upserts tgev_game_evals for that exact (gdid, ply)
//      — insert if missing, update if present. tgev is the durable, never-purged,
//      per-game record of analysis work (unlike tpose, which is deliberately incomplete
//      and purge-vulnerable), so any position genuinely reachable from a known (game,
//      ply) should land in both together. Callers must only pass gameContext when the
//      position being written is actually the game's own move at that ply — never for a
//      hypothetical/unplayed line, since tgev's schema (gev_san NOT NULL,
//      UNIQUE(gev_gdid, gev_ply)) is a record of what the game really played, not a
//      place to store alternatives.
//    - cascades the new value out to every *other* tgev_game_evals row for this exact
//      position, across every other game — the same position can (and, since this data
//      is used to detect recurring habits, likely will) recur in many games, each with
//      its own independently-writable gev_cp/gev_depth, so a canonical tpose_positions_eval
//      upgrade must propagate to all of them, not just the game that triggered it. Scoped
//      to gev_cp/gev_depth/gev_cp_change only — gev_best_move* describes the
//      recommendation from the position BEFORE that ply, not a property of the resulting
//      position, so it's left untouched.
//  thab_habits is deliberately NOT refreshed here — per user decision, habits only ever
//  update via the nightly buildHabits() pipeline rebuild, never live from an interactive
//  analysis click.
//  Only when the new depth exceeds what's stored (per position, and per tgev row).
//  Recomputes gam_cp_change for the affected tgam_game_positions rows deliberately via
//  a direct query, not bulkUpdateCpLoss(), since that logs a pipeline step and would
//  make every interactive analyze click look like a new pipeline run on Owner > Pipeline.
//----------------------------------------------------------------------------------
export async function upgradePositionEvaluation(data: {
  fen: string
  cp: number
  bestMove: string | null
  depth: number
  createIfMissing?: boolean
  // Bypasses the depth-guard below (the tpose_positions_eval upsert, the gameContext
  // upsert, and the tgev cascade), so an equal-depth value still overwrites, not just a
  // strictly deeper one. Reserved for the interactive "Analyze Position" own-position
  // write-back (persistAnalysisLines) — an explicit, just-run analysis should always
  // land, even if a background pipeline pass had already reached the identical depth
  // with a different value. Never set by automated/cron callers, which keep the strict
  // guard so a repeat pass at the same depth tier can't cause the stored value to jitter
  // between runs.
  force?: boolean
  // The exact (game, ply) this position corresponds to, when known — see the function
  // header above for the hard constraint on when this may be passed.
  gameContext?: { gdid: number; ply: number; san: string }
}): Promise<boolean> {
  // tpose_positions_eval deliberately never caches opening theory (moves 1..MIN_ANALYSIS_MOVE-1) —
  // checked here, centrally, so every caller gets this exclusion automatically rather than
  // each write-back site needing to remember it. The FEN's own fullmove-counter field (6th
  // token) is used directly, same "derive from the FEN itself" pattern as pos_color/pos_move_num
  // in getOrCreatePosition.
  const moveNum = parseInt(data.fen.split(' ')[5] ?? '', 10)
  if (Number.isFinite(moveNum) && moveNum < MIN_ANALYSIS_MOVE) return false

  const truncated = truncateFen(data.fen)
  const posRows = await table_query({
    caller: 'upgradePositionEvaluation_lookup',
    table: 'tpos_positions',
    query: `SELECT pos_id FROM tpos_positions WHERE pos_fen = $1`,
    params: [truncated],
    skipCache: true
  })
  let posId = posRows[0]?.pos_id as number | undefined
  if (!posId) {
    if (!data.createIfMissing) return false
    posId = await getOrCreatePosition(truncated)
  }

  const depthGuard = data.force ? '' : 'WHERE tpose_positions_eval.pose_depth < EXCLUDED.pose_depth'
  const updated = await table_query({
    caller: 'upgradePositionEvaluation_update',
    table: 'tpose_positions_eval',
    query: `
      INSERT INTO tpose_positions_eval (pose_pos_id, pose_cp, pose_best_move, pose_depth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (pose_pos_id) DO UPDATE
        SET pose_cp = EXCLUDED.pose_cp, pose_best_move = EXCLUDED.pose_best_move, pose_depth = EXCLUDED.pose_depth
        ${depthGuard}
      RETURNING pose_pos_id
    `,
    params: [posId, data.cp, data.bestMove, data.depth],
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
          THEN e_after.pose_cp  - e_before.pose_cp
          ELSE e_before.pose_cp - e_after.pose_cp
        END
      FROM tpos_positions p,
           tpose_positions_eval e_before,
           tpose_positions_eval e_after
      WHERE gp.gam_pos_id          = p.pos_id
        AND e_before.pose_pos_id    = gp.gam_pos_id
        AND e_after.pose_pos_id     = gp.gam_resulting_pos_id
        AND gp.gam_resulting_pos_id IS NOT NULL
        AND e_before.pose_cp IS NOT NULL
        AND e_after.pose_cp  IS NOT NULL
        AND (gp.gam_pos_id = $1 OR gp.gam_resulting_pos_id = $1)
    `,
    params: [posId],
    isupdate: true
  })

  if (data.gameContext) {
    const gameContextDepthGuard = data.force ? '' : 'WHERE tgev_game_evals.gev_depth < EXCLUDED.gev_depth'
    await table_query({
      caller: 'upgradePositionEvaluation_gev_upsert',
      table: 'tgev_game_evals',
      query: `
        INSERT INTO tgev_game_evals (gev_gdid, gev_ply, gev_san, gev_fen_after, gev_cp, gev_depth, gev_cp_change)
        VALUES ($1, $2::smallint, $3, $4, $5, $6,
          CASE WHEN $2 % 2 = 0
            THEN $5 - COALESCE((SELECT gev_cp FROM tgev_game_evals WHERE gev_gdid = $1 AND gev_ply = $2 - 1), 0)
            ELSE COALESCE((SELECT gev_cp FROM tgev_game_evals WHERE gev_gdid = $1 AND gev_ply = $2 - 1), 0) - $5
          END)
        ON CONFLICT (gev_gdid, gev_ply) DO UPDATE
          SET gev_cp = EXCLUDED.gev_cp, gev_depth = EXCLUDED.gev_depth, gev_cp_change = EXCLUDED.gev_cp_change
          ${gameContextDepthGuard}
      `,
      params: [data.gameContext.gdid, data.gameContext.ply, data.gameContext.san, truncated, data.cp, data.depth],
      isupdate: true
    })
  }

  const cascadeDepthGuard = data.force ? '' : 'AND m.gev_depth < $2'
  await table_query({
    caller: 'upgradePositionEvaluation_cascade_tgev',
    table: 'tgev_game_evals',
    query: `
      UPDATE tgev_game_evals t
      SET gev_cp = $1,
          gev_depth = $2,
          gev_cp_change = CASE
            WHEN m.gev_ply % 2 = 0 THEN $1 - COALESCE(prev.gev_cp, 0)
            ELSE COALESCE(prev.gev_cp, 0) - $1
          END
      FROM (SELECT gev_gdid, gev_ply, gev_depth FROM tgev_game_evals WHERE gev_fen_after = $3) AS m
      LEFT JOIN tgev_game_evals prev ON prev.gev_gdid = m.gev_gdid AND prev.gev_ply = m.gev_ply - 1
      WHERE t.gev_gdid = m.gev_gdid AND t.gev_ply = m.gev_ply ${cascadeDepthGuard}
    `,
    params: [data.cp, data.depth, truncated],
    isupdate: true
  })

  cache_clearTable('tpose_positions_eval', 'upgradePositionEvaluation')
  cache_clearTable('tgam_game_positions', 'upgradePositionEvaluation')
  cache_clearTable('tgev_game_evals', 'upgradePositionEvaluation')

  return true
}

//----------------------------------------------------------------------------------
//  getPositionEvaluationsBulk — batched tpose_positions_eval lookup for a list of
//  FENs, keyed by truncated FEN (matching every other position lookup in this file).
//  Used by runAnalysis() to skip re-running Stockfish on positions already cached
//  deep enough, instead of one lookup per position.
//----------------------------------------------------------------------------------
export async function getPositionEvaluationsBulk(fens: string[]): Promise<Record<string, { cp: number; bestMove: string | null; depth: number }>> {
  const truncated = fens.map(truncateFen)
  const rows = await table_query({
    caller: 'getPositionEvaluationsBulk',
    table: 'tpose_positions_eval',
    query: `
      SELECT p.pos_fen, e.pose_cp, e.pose_best_move, e.pose_depth
      FROM tpos_positions p
      JOIN tpose_positions_eval e ON e.pose_pos_id = p.pos_id
      WHERE p.pos_fen = ANY($1) AND e.pose_cp IS NOT NULL AND e.pose_depth IS NOT NULL
    `,
    // table_query's params type doesn't declare array elements (needed for = ANY($1)),
    // even though the underlying driver handles them fine — narrow cast, not a real risk
    params: [truncated] as unknown as string[]
  }) as { pos_fen: string; pose_cp: number; pose_best_move: string | null; pose_depth: number }[]

  const result: Record<string, { cp: number; bestMove: string | null; depth: number }> = {}
  for (const row of rows) {
    result[row.pos_fen] = { cp: row.pose_cp, bestMove: row.pose_best_move, depth: row.pose_depth }
  }
  return result
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
//  pos_fen/pos_color/pos_cp still come from tpos_positions/tpose_positions_eval via
//  join since those aren't player-specific and don't need duplicating into thab_habits.
//  move_cp is the resulting position's pose_cp (via hab_resulting_pos_id), not the
//  hab_move_cp delta — that delta stays internal, driving the quality filter/sort only.
//  opening_name/eco_code come straight from thab_habits' own hab_opening_name/hab_eco_code
//  columns (denormalized by buildHabits() at build time) rather than a live join — see
//  buildHabits.ts for how they're computed.
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

export async function getHabitsData(opts: {
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

  const rows = await table_query({
    caller: 'getHabitsData',
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
  return rows.map((r: any) => ({
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
//  getHabitsCount — total row count for getHabitsData's same filter set, for
//  MyPagination's total-pages calculation
//----------------------------------------------------------------------------------
export async function getHabitsCount(opts: {
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

  const rows = await table_query({
    caller: 'getHabitsCount',
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

  const [posRows, movRows, posEvalRows, gameCountRows, gamesRows] = await Promise.all([
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tpos_positions',
      whereColumnValuePairs: [{ column: 'pos_id', value: posId }]
    }),
    table_query({
      caller: 'getPositionDetail',
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
      caller: 'getPositionDetail',
      table: 'tpose_positions_eval',
      whereColumnValuePairs: [{ column: 'pose_pos_id', value: posId }]
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

  return {
    position:  posRows[0]     as PositionRow  ?? null,
    moves:     movRows        as MoveRow[],
    posEval:   posEvalRows[0] as EvaluationRow ?? null,
    gameCount: Number((gameCountRows[0] as any)?.game_count ?? 0),
    games: gamesRows.map((r: any) => ({
      player:       r.gd_player,
      move_played:  r.gam_move_played,
      move_num:     r.gam_move_num != null ? Number(r.gam_move_num) : null,
      playerResult: r.gd_player_result ?? null,
      gdid:         r.gd_gdid      != null ? Number(r.gd_gdid)      : null,
      date:         r.game_date ?? null
    }))
  }
}
