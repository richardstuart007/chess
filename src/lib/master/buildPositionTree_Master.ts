'use server'

import { Chess } from 'chess.js'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep } from '../actions/pipelineLog'
import { logStart, logEnd } from '../logStep'
import { MIN_ANALYSIS_MOVE_Master, MAX_ANALYSIS_MOVE_Master, POSITION_INSERT_CHUNK_SIZE_Master, POSITION_TREE_LIMIT_Master, PIPELINE_TYPE_MASTERGAMES } from '../constants'
import { truncateFen } from '../fen'
import { chunkByGame } from '../chunkByGame'

interface MasterGameRecord {
  mgdid: number
  pgn:   string
}

interface MasterPositionRecord {
  mgdid:        number
  posFen:       string
  movePlayed:   string
  moveUci:      string | null
  resultingFen: string | null
  moveNum:      number
}

//----------------------------------------------------------------------------------
//  getPositionsFromGame_Master — pure chess.js, no DB, returns all recordable
//  positions. Mirrors buildPositionTree_Player.ts's getPositionsFromGame_Player.
//----------------------------------------------------------------------------------
function getPositionsFromGame_Master(
  game: MasterGameRecord,
  minHalfMove: number,
  maxHalfMove: number
): MasterPositionRecord[] {
  if (!game.pgn) return []

  const chess = new Chess()
  try { chess.loadPgn(game.pgn) } catch { return [] }

  //
  //  Some games (e.g. a chess.com Live Chess reconnect) carry a PGN that starts
  //  mid-game from a non-standard position (SetUp/FEN headers), not the standard
  //  opening position. replay must be seeded from that same starting FEN, or its
  //  very first move fails ("Invalid move") since it has no idea the game didn't
  //  start from the normal board.
  //
  const headers = chess.getHeaders()
  const startFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined

  const history = chess.history({ verbose: true })
  const replay  = startFen ? new Chess(startFen) : new Chess()
  const records: MasterPositionRecord[] = []

  for (let i = 0; i < Math.min(history.length, maxHalfMove); i++) {
    const fen  = truncateFen(replay.fen())
    const move = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    const moveNum = Math.ceil((i + 1) / 2)
    replay.move(move.san)
    const resultingFen = truncateFen(replay.fen())

    if (i >= minHalfMove) {
      records.push({
        mgdid:        game.mgdid,
        posFen:       fen,
        movePlayed:   move.san,
        moveUci,
        resultingFen,
        moveNum
      })
    }
  }

  // Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires
  if (records.length === 0) {
    records.push({
      mgdid:        game.mgdid,
      posFen:       '__too_short__',
      movePlayed:   '',
      moveUci:      null,
      resultingFen: null,
      moveNum:      0
    })
  }

  return records
}

//----------------------------------------------------------------------------------
//  insertGamePositions_Master — Phase A: write tmgam_game_positions directly from
//  parsed records. Mirrors buildPositionTree_Player.ts's insertGamePositions_Player.
//----------------------------------------------------------------------------------
async function insertGamePositions_Master(records: MasterPositionRecord[], level: number): Promise<void> {
  await logStart('insertGamePositions_Master', 'buildPositionTree_Master', `inserting ${records.length} game-position rows`, level)
  const chunks = chunkByGame(records, POSITION_INSERT_CHUNK_SIZE_Master, r => r.mgdid)
  for (const chunk of chunks) {
    const values = chunk.map((_, i) => {
      const b = i * 6
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`
    }).join(',')
    const params = chunk.flatMap(r => [r.mgdid, r.posFen, r.movePlayed, r.moveUci, r.resultingFen, r.moveNum])
    await table_query({
      caller: 'insertGamePositions_Master',
      query: `
        INSERT INTO tmgam_game_positions
          (mgam_mgdid, mgam_pos_fen, mgam_move_played, mgam_move_uci, mgam_resulting_fen, mgam_move_num)
        VALUES ${values}
      `,
      params,
      table: 'tmgam_game_positions',
      level,
      isupdate: true,
      severity: 'I'
    })
  }
  await logEnd('insertGamePositions_Master', 'buildPositionTree_Master', `${records.length} tmgam_game_positions rows inserted`, level)
}

//----------------------------------------------------------------------------------
//  recomputePosReachedByIds_Master — accurate count from tmgam_game_positions for a
//  specific set of positions. Mirrors buildPositionTree_Player.ts's
//  recomputePosReachedByIds_Player.
//----------------------------------------------------------------------------------
async function recomputePosReachedByIds_Master(posIds: number[], level: number): Promise<void> {
  if (posIds.length === 0) return
  for (let start = 0; start < posIds.length; start += 1000) {
    const chunk = posIds.slice(start, start + 1000)
    await table_query({
      caller: 'recomputePosReached',
      query: `
        UPDATE tmpos_positions p
        SET mpos_reached = (
          SELECT COUNT(DISTINCT mgam_mgdid) FROM tmgam_game_positions
          WHERE mgam_pos_id = p.mpos_id AND mgam_move_num > 0
        ),
        mpos_move_num = (
          SELECT MIN(mgam_move_num) FROM tmgam_game_positions WHERE mgam_pos_id = p.mpos_id
        )
        WHERE p.mpos_id = ANY($1)
      `,
      params: [chunk] as unknown as number[],
      table: 'tmpos_positions',
      level,
      isupdate: true,
      severity: 'I'
    })
  }
}

//----------------------------------------------------------------------------------
//  syncTposFromTgam_Master — Phase B: derive tmpos_positions from
//  tmgam_game_positions. Mirrors buildPositionTree_Player.ts's syncTposFromTgam_Player
//  exactly (three steps: ensure, backfill ids, recompute touched only).
//----------------------------------------------------------------------------------
export async function syncTposFromTgam_Master(level: number = 1, forceNewRun?: boolean, playerLabel?: string): Promise<{ positionsSynced: number }> {
  await logStart('syncTposFromTgam_Master', 'buildPositionTree_Master', 'deriving tmpos_positions from unresolved tmgam_game_positions rows', level)
  const t0 = Date.now()

  const backlogRes = await table_query({
    caller: 'syncTposFromTgam_backlog',
    query: `SELECT COUNT(*) AS cnt FROM tmgam_game_positions WHERE mgam_pos_id IS NULL`,
    params: [],
    table: 'tmgam_game_positions',
    level,
    severity: 'I',
    skipCache: true
  })
  if (!backlogRes.ok) {
    write_logging({
      lg_functionname: 'syncTposFromTgam_Master',
      lg_caller: 'syncTposFromTgam_backlog',
      lg_msg: 'Failed to fetch tmgam backlog count: ' + backlogRes.error,
      lg_severity: 'E'
    })
  }
  const backlogBefore = backlogRes.ok ? parseInt(backlogRes.data[0]?.cnt ?? '0') : 0

  await table_query({
    caller: 'syncTposFromTgam_ensure',
    query: `
      INSERT INTO tmpos_positions (mpos_fen, mpos_color, mpos_reached)
      SELECT DISTINCT fen, split_part(fen, ' ', 2), 0 FROM (
        SELECT mgam_pos_fen AS fen FROM tmgam_game_positions
        WHERE mgam_pos_id IS NULL AND mgam_pos_fen IS NOT NULL AND mgam_pos_fen <> '__too_short__'
        UNION
        SELECT mgam_resulting_fen AS fen FROM tmgam_game_positions
        WHERE mgam_resulting_pos_id IS NULL AND mgam_resulting_fen IS NOT NULL
      ) t
      ON CONFLICT (mpos_fen) DO NOTHING
    `,
    params: [],
    table: 'tmpos_positions',
    level,
    isupdate: true,
    severity: 'I'
  })

  const beforeRes = await table_query({
    caller: 'syncTposFromTgam_backfillBefore',
    query: `
      UPDATE tmgam_game_positions g
      SET mgam_pos_id = p.mpos_id
      FROM tmpos_positions p
      WHERE g.mgam_pos_id IS NULL AND g.mgam_pos_fen = p.mpos_fen
      RETURNING p.mpos_id
    `,
    params: [],
    table: 'tmgam_game_positions',
    level,
    isupdate: true,
    severity: 'I'
  })
  const resultingRes = await table_query({
    caller: 'syncTposFromTgam_backfillResulting',
    query: `
      UPDATE tmgam_game_positions g
      SET mgam_resulting_pos_id = p.mpos_id
      FROM tmpos_positions p
      WHERE g.mgam_resulting_pos_id IS NULL AND g.mgam_resulting_fen = p.mpos_fen
      RETURNING p.mpos_id
    `,
    params: [],
    table: 'tmgam_game_positions',
    level,
    isupdate: true,
    severity: 'I'
  })
  if (!beforeRes.ok || !resultingRes.ok) {
    write_logging({
      lg_functionname: 'syncTposFromTgam_Master',
      lg_caller: 'syncTposFromTgam_backfill',
      lg_msg: 'Failed to backfill tmgam ids: ' + [beforeRes, resultingRes].filter(r => !r.ok).map(r => r.error).join('; '),
      lg_severity: 'E'
    })
    await logEnd('syncTposFromTgam_Master', 'buildPositionTree_Master', 'failed during id backfill', level)
    return { positionsSynced: 0 }
  }

  const touchedPosIds = [...new Set<number>([
    ...beforeRes.data.map((r: any) => Number(r.mpos_id)),
    ...resultingRes.data.map((r: any) => Number(r.mpos_id))
  ])]

  await recomputePosReachedByIds_Master(touchedPosIds, level)

  const tmgamBackfilled = beforeRes.data.length + resultingRes.data.length
  const durationMs      = Date.now() - t0
  await logPipelineStep({ step: 3, subStep: 'a', stepName: playerLabel ? `${playerLabel}: Sync tmpos_positions` : 'Sync tmpos_positions', pipelineType: PIPELINE_TYPE_MASTERGAMES, inputTable: 'tmgam_game_positions', inputRecs: backlogBefore, outputTable: 'tmpos_positions', outputRecs: touchedPosIds.length, durationMs, forceNewRun })
  await logPipelineStep({ step: 3, subStep: 'b', stepName: playerLabel ? `${playerLabel}: Backfill tmgam ids` : 'Backfill tmgam ids', pipelineType: PIPELINE_TYPE_MASTERGAMES, inputTable: 'tmgam_game_positions', inputRecs: backlogBefore, outputTable: 'tmgam_game_positions', outputRecs: tmgamBackfilled, durationMs, forceNewRun: false })

  await logEnd('syncTposFromTgam_Master', 'buildPositionTree_Master', `${touchedPosIds.length} positions synced`, level)
  return { positionsSynced: touchedPosIds.length }
}

//----------------------------------------------------------------------------------
//  buildPositionTree_Master — main export. Mirrors buildPositionTree_Player.ts's
//  buildPositionTree_Player exactly, minus the player filter (Step 3 is global —
//  every master player's outstanding games, not one at a time) and minus the
//  gd_positions_purged exclusion (no purge feature exists for master games).
//----------------------------------------------------------------------------------
export async function buildPositionTree_Master(opts: {
  limit?:       number
  level?:       number
  skipSync?:    boolean   // debug/verification only — skip Phase B (syncTposFromTgam_Master)
  forceNewRun?: boolean
  playerLabel?: string    // display-only tag for the logged step name — no filtering effect, Step 3 stays global
}): Promise<{
  gamesProcessed: number
  positions:      number
  errors:         number
  treeBuilt:      number
  remaining:      number
}> {
  const level    = opts.level ?? 1
  const caller   = 'buildMasterTreeRoute'
  const limit       = opts.limit ?? POSITION_TREE_LIMIT_Master
  const minHalfMove = (MIN_ANALYSIS_MOVE_Master - 1) * 2
  const maxHalfMove = MAX_ANALYSIS_MOVE_Master * 2

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''

  const gamesRes = await table_query({
    caller: 'buildPositionTree_fetch',
    query: `
      SELECT
        d.mgd_mgdid AS mgdid,
        d.mgd_pgn AS pgn
      FROM tmgd_gamesdecon d
      WHERE NOT EXISTS (
        SELECT 1 FROM tmgam_game_positions WHERE mgam_mgdid = d.mgd_mgdid
      )
      ORDER BY d.mgd_end_time DESC
      ${limitClause}
    `,
    params: [],
    table: 'tmgd_gamesdecon',
    level,
    severity: 'I',
    skipCache: true
  })
  if (!gamesRes.ok) {
    write_logging({
      lg_functionname: 'buildPositionTree_Master',
      lg_caller: 'buildPositionTree_fetch',
      lg_msg: 'Failed to fetch games for master position tree: ' + gamesRes.error,
      lg_severity: 'E'
    })
    return { gamesProcessed: 0, positions: 0, errors: 0, treeBuilt: 0, remaining: 0 }
  }

  const games: MasterGameRecord[] = gamesRes.data.map((r: any) => ({
    mgdid: Number(r.mgdid),
    pgn:   r.pgn ?? ''
  }))

  await logStart('buildPositionTree_Master', caller, `building master position tree, ${games.length} games fetched`, level)

  const snapRes = await table_query({
    caller: 'buildPositionTree_snap',
    table:  'tmgam_game_positions',
    query:  `SELECT
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.mgam_mgdid
         FROM tmgam_game_positions gp
       ) t) AS snap_processed,
      (SELECT COUNT(*) FROM tmgd_gamesdecon d
       WHERE NOT EXISTS (
           SELECT 1 FROM tmgam_game_positions
           WHERE mgam_mgdid = d.mgd_mgdid
         )) AS snap_remaining`,
    params:       [],
    level,
    severity:     'I',
    skipCache:    true
  })
  if (!snapRes.ok) {
    write_logging({
      lg_functionname: 'buildPositionTree_Master',
      lg_caller: 'buildPositionTree_snap',
      lg_msg: 'Failed to fetch master position tree snapshot counts: ' + snapRes.error,
      lg_severity: 'E'
    })
  }
  const snapProcessed = snapRes.ok ? parseInt(snapRes.data[0].snap_processed ?? '0') : 0
  const snapRemaining = snapRes.ok ? parseInt(snapRes.data[0].snap_remaining ?? '0') : 0

  const t0 = Date.now()

  let totalPositions = 0
  let errors         = 0
  const allRecords: MasterPositionRecord[] = []

  for (const game of games) {
    try {
      const records = getPositionsFromGame_Master(game, minHalfMove, maxHalfMove)
      allRecords.push(...records)
      totalPositions += records.filter(r => r.moveNum > 0).length
    } catch (err) {
      console.error(`buildPositionTree_Master: chess.js error on game ${game.mgdid}`, err)
      await write_logging({
        lg_functionname: 'buildPositionTree_Master',
        lg_caller: caller,
        lg_msg: `chess.js error on game ${game.mgdid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  await insertGamePositions_Master(allRecords, level + 1)
  if (!opts.skipSync) await syncTposFromTgam_Master(level + 1)

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await logPipelineStep({ step: 2, subStep: 'a', stepName: opts.playerLabel ? `${opts.playerLabel}: Build Master Position Tree` : 'Build Master Position Tree', pipelineType: PIPELINE_TYPE_MASTERGAMES, inputTable: 'tmgd_gamesdecon', inputRecs: games.length, outputTable: 'tmgam_game_positions', outputRecs: totalPositions, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })

  await logEnd('buildPositionTree_Master', caller, `${totalPositions} positions recorded, treeBuilt ${snapProcessed + processed}, remaining ${afterRemaining}`, level)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}
