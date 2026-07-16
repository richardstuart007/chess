'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from '../actions/pipelineLog'
import { MIN_ANALYSIS_MOVE, HABITS_MIN_REACH_FLOOR, HABITS_MOVE_CP_CLAMP, POSITION_INSERT_CHUNK_SIZE } from '../constants'

interface HabitAggregate {
  player:     string
  posId:      number
  moveSan:    string
  moveUci:    string | null
  moveNum:    number | null
  moveTimes:  number
  moveWins:   number
  moveLosses: number
  moveCp:     number
}

//----------------------------------------------------------------------------------
//  chunkRows — plain fixed-size chunking; unlike buildPositionTree's chunkByGame,
//  each habit row is independent so no grouping constraint is needed.
//----------------------------------------------------------------------------------
function chunkRows<T>(rows: T[], maxRows: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += maxRows) chunks.push(rows.slice(i, i + maxRows))
  return chunks
}

//----------------------------------------------------------------------------------
//  buildHabits — full recompute + upsert into thab_habits every run. There is no safe
//  incremental cursor here: a habit's move_cp can change as new games arrive for a
//  move already in the table, not just add brand-new rows. The upsert's SET clause
//  never touches hab_dismissed, so a dismissed habit's flag survives every rebuild
//  even though its stats keep refreshing.
//
//  move_cp is the single occurrence with the largest magnitude of change (ORDER BY
//  ABS(gam_cp_change) DESC, keeping its real sign), not an average — for a fixed
//  (position, move) pair every occurrence's gam_cp_change is actually the same
//  deterministic value today (same before/after positions, one evaluation each), so
//  this only behaves differently from an average if that ever stops holding (e.g. a
//  position gets re-evaluated at a different depth later). Clamped to
//  +-HABITS_MOVE_CP_CLAMP to stay within hab_move_cp's numeric(6,2) precision — mate
//  scores are normalized to +-10000, so a single real swing can still exceed it.
//----------------------------------------------------------------------------------
export async function buildHabits(level: number = 1, forceNewRun?: boolean): Promise<{ built: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  await logStart('buildHabits', 'buildHabitsRoute', 'aggregating bad-move habits', level)
  const t0 = Date.now()

  const selectRes = await db.query({
    caller: 'buildHabits_select',
    query: `
      SELECT * FROM (
        SELECT
          d.gd_player                                              AS player,
          gp.gam_pos_id                                             AS pos_id,
          gp.gam_move_played                                        AS move_san,
          MIN(gp.gam_move_uci)                                      AS move_uci,
          MIN(gp.gam_move_num)::int                                 AS move_num,
          COUNT(*)::int                                             AS move_times,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'win')::int   AS move_wins,
          COUNT(*) FILTER (WHERE d.gd_player_result = 'loss')::int  AS move_losses,
          (ARRAY_AGG(gp.gam_cp_change ORDER BY ABS(gp.gam_cp_change) DESC))[1] AS move_cp
        FROM tgam_game_positions gp
        JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
        JOIN tpos_positions p ON p.pos_id = gp.gam_pos_id
        WHERE gp.gam_move_num >= $1
          AND p.pos_color = CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END
        GROUP BY d.gd_player, gp.gam_pos_id, gp.gam_move_played
        HAVING COUNT(*) >= $2
      ) sub
      WHERE move_cp < 0
    `,
    params: [MIN_ANALYSIS_MOVE, HABITS_MIN_REACH_FLOOR],
    functionName: 'buildHabits',
    table: 'thab_habits',
    level, isupdate: false, severity: 'D'
  })

  const aggregates: HabitAggregate[] = selectRes.rows.map((r: any) => ({
    player:     r.player,
    posId:      Number(r.pos_id),
    moveSan:    r.move_san,
    moveUci:    r.move_uci ?? null,
    moveNum:    r.move_num != null ? Number(r.move_num) : null,
    moveTimes:  Number(r.move_times),
    moveWins:   Number(r.move_wins),
    moveLosses: Number(r.move_losses),
    moveCp:     Math.max(-HABITS_MOVE_CP_CLAMP, Math.min(HABITS_MOVE_CP_CLAMP, Number(r.move_cp)))
  }))

  let built = 0
  for (const chunk of chunkRows(aggregates, POSITION_INSERT_CHUNK_SIZE)) {
    const values = chunk.map((_, i) => {
      const b = i * 9
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`
    }).join(',')
    const params = chunk.flatMap(a => [
      a.player, a.posId, a.moveSan, a.moveUci, a.moveNum,
      a.moveTimes, a.moveWins, a.moveLosses, a.moveCp
    ])
    const upsertRes = await db.query({
      caller: 'buildHabits_upsert',
      query: `
        INSERT INTO thab_habits
          (hab_player, hab_pos_id, hab_move_san, hab_move_uci, hab_move_num, hab_move_times, hab_move_wins, hab_move_losses, hab_move_cp)
        VALUES ${values}
        ON CONFLICT (hab_player, hab_pos_id, hab_move_san) DO UPDATE SET
          hab_move_uci    = EXCLUDED.hab_move_uci,
          hab_move_num    = EXCLUDED.hab_move_num,
          hab_move_times  = EXCLUDED.hab_move_times,
          hab_move_wins   = EXCLUDED.hab_move_wins,
          hab_move_losses = EXCLUDED.hab_move_losses,
          hab_move_cp     = EXCLUDED.hab_move_cp
      `,
      params,
      functionName: 'buildHabits',
      table: 'thab_habits',
      level, isupdate: true, severity: 'D'
    })
    built += upsertRes.rowCount ?? 0
  }

  const durationMs = Date.now() - t0

  await logPipelineStep({
    step: 7, subStep: 'a', stepName: 'Build Habits',
    inputTable: 'tgam_game_positions', inputRecs: aggregates.length,
    outputTable: 'thab_habits', outputRecs: built,
    durationMs, forceNewRun
  })

  await write_logging({
    lg_functionname: 'buildHabits',
    lg_caller: 'buildHabitsRoute',
    lg_msg: `Built/refreshed ${built} habit rows`,
    lg_severity: 'I'
  })

  await logEnd('buildHabits', 'buildHabitsRoute', `${built} rows built/refreshed`, level)
  return { built }
}
