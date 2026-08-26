'use server'

//==================================================================================================
//  1) DESCRIPTION
//    buildPositionTree_Player — Phase A of the player position-tree pipeline: replays each
//    fetched game's PGN with chess.js and writes one tgam_game_positions row per recordable ply
//    (insertGamePositions_Player), then (unless skipSync) hands off to syncTposFromTgam_Player
//    (Phase B, exported separately below) to derive/backfill tpos_positions from what was just
//    written.
//
//    Parameters:
//      opts.limit       — max games to process this run (default POSITION_TREE_LIMIT_Player)
//      opts.player      — restrict to one player (default: all players)
//      opts.level       — logging call-hierarchy depth (default 1)
//      opts.skipSync    — debug/verification only — skip Phase B
//      opts.forceNewRun — allocate a new pipeline run id instead of joining the current one
//
//    Returns:
//      gamesProcessed — games fetched this run
//      positions      — recordable positions written (tgam_game_positions rows with moveNum > 0)
//      errors         — games that failed to replay
//      treeBuilt      — total games with a position tree so far (this run's + prior snapshot)
//      remaining      — games still awaiting a position tree after this run
//
//  2) NOTES
//    Every ply is recorded, not just the tracked player's own — the opponent's moves are real
//    edges too. A revisited position (transposition/repetition) is real and gets its own row each
//    time — not deduped within a game. Games are selected via NOT EXISTS on tgam_game_positions
//    AND NOT gd_positions_purged, so an already-purged game is never silently reprocessed.
//==================================================================================================

import { Chess } from 'chess.js'
import { logPipelineStep } from '../actions/pipelineLog'
import { write_logging } from 'nextjs-shared/write_logging'
import { table_query } from 'nextjs-shared/table_query'
import { logStart, logEnd } from '../logStep'
import { MIN_ANALYSIS_MOVE_Player, MAX_ANALYSIS_MOVE_Player, POSITION_INSERT_CHUNK_SIZE_Player, POSITION_TREE_LIMIT_Player, PIPELINE_TYPE_GAMES } from '../constants'
import { truncateFen } from '../fen'
import { chunkByGame } from '../chunkByGame'

interface GameRecord {
  gdid:          number
  pgn:           string
}

interface PositionRecord {
  gdid:         number
  posFen:       string
  movePlayed:   string
  moveUci:      string | null
  resultingFen: string | null
  moveNum:      number
}

export async function buildPositionTree_Player(opts: {
  limit?:          number
  player?:         string
  level?:          number
  skipSync?:       boolean   // debug/verification only — skip Phase B (syncTposFromTgam_Player)
  forceNewRun?:    boolean
}): Promise<{
  gamesProcessed: number
  positions:      number
  errors:         number
  treeBuilt:      number
  remaining:      number
}> {
  const level    = opts.level ?? 1
  const caller   = 'buildTreeRoute'
  const limit       = opts.limit ?? POSITION_TREE_LIMIT_Player
  const minHalfMove = (MIN_ANALYSIS_MOVE_Player - 1) * 2
  const maxHalfMove = MAX_ANALYSIS_MOVE_Player * 2

  const params: any[]     = []
  const conditions: string[] = [`NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_gdid = d.gd_gdid
  ) AND NOT d.gd_positions_purged`]

  if (opts.player) {
    params.push(opts.player.toLowerCase())
    conditions.push(`d.gd_player = $${params.length}`)
  }

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const whereClause = conditions.map(c => `(${c})`).join(' AND ')

  const gamesRes = await table_query({
    caller: 'buildPositionTree_fetch',
    query:  `
      SELECT
        d.gd_gdid AS gdid,
        d.gd_pgn AS pgn
      FROM tgd_gamesdecon d
      WHERE ${whereClause}
      ORDER BY d.gd_end_time DESC
      ${limitClause}
    `,
    params,
    table: 'tgd_gamesdecon',
    level,
    severity: 'I',
    skipCache: true
  })
  if (!gamesRes.ok) {
    write_logging({
      lg_functionname: 'buildPositionTree_Player',
      lg_caller: 'buildPositionTree_fetch',
      lg_msg: 'Failed to fetch games for position tree: ' + gamesRes.error,
      lg_severity: 'E'
    })
    return { gamesProcessed: 0, positions: 0, errors: 0, treeBuilt: 0, remaining: 0 }
  }

  const games: GameRecord[] = gamesRes.data.map((r: any) => ({
    gdid:          r.gdid,
    pgn:           r.pgn ?? ''
  }))

  await logStart('buildPositionTree_Player', caller, `building position tree, ${games.length} games fetched`, level)

  const snapRes = await table_query({
    caller: 'buildPositionTree_snap',
    table:  'tgam_game_positions',
    query:  `SELECT
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.gam_gdid
         FROM tgam_game_positions gp
       ) t) AS snap_processed,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       WHERE NOT d.gd_positions_purged
         AND NOT EXISTS (
           SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid
         )) AS snap_remaining`,
    params:       [],
    level,
    severity:     'I',
    skipCache:    true
  })
  if (!snapRes.ok) {
    write_logging({
      lg_functionname: 'buildPositionTree_Player',
      lg_caller: 'buildPositionTree_snap',
      lg_msg: 'Failed to fetch position tree snapshot counts: ' + snapRes.error,
      lg_severity: 'E'
    })
  }
  const snapProcessed = snapRes.ok ? parseInt(snapRes.data[0].snap_processed ?? '0') : 0
  const snapRemaining = snapRes.ok ? parseInt(snapRes.data[0].snap_remaining ?? '0') : 0

  const t0    = Date.now()

  // Process all games in memory — pure chess.js, no DB
  let totalPositions = 0
  let errors         = 0
  const allRecords: PositionRecord[] = []

  for (const game of games) {
    try {
      const records = getPositionsFromGame_Player(game, minHalfMove, maxHalfMove)
      allRecords.push(...records)
      totalPositions += records.filter(r => r.moveNum > 0).length
    } catch (err) {
      console.error(`buildPositionTree_Player: chess.js error on game ${game.gdid}`, err)
      await write_logging({
        lg_functionname: 'buildPositionTree_Player',
        lg_caller: caller,
        lg_msg: `chess.js error on game ${game.gdid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  // Phase A — write tgam_game_positions (self-contained, no tpos_positions dependency)
  await insertGamePositions_Player(allRecords, level + 1)
  // Phase B — derive tpos_positions from what Phase A just wrote
  if (!opts.skipSync) await syncTposFromTgam_Player(level + 1)

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await logPipelineStep({ step: 2, subStep: 'a', stepName: 'Build Position Tree', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'tgd_gamesdecon', inputRecs: games.length, outputTable: 'tgam_game_positions', outputRecs: totalPositions, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })

  await logEnd('buildPositionTree_Player', caller, `${totalPositions} positions recorded, treeBuilt ${snapProcessed + processed}, remaining ${afterRemaining}`, level)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}

//----------------------------------------------------------------------------------
//  getPositionsFromGame_Player — pure chess.js, no DB, returns all recordable positions
//----------------------------------------------------------------------------------
function getPositionsFromGame_Player(
  game: GameRecord,
  minHalfMove: number,
  maxHalfMove: number
): PositionRecord[] {
  if (!game.pgn) return []

  const chess = new Chess()
  try { chess.loadPgn(game.pgn) } catch { return [] }

  //
  //  Some games (e.g. a chess.com Live Chess reconnect) carry a PGN whose PGN itself
  //  starts mid-game from a non-standard position (SetUp/FEN headers), not the
  //  standard opening position. replay must be seeded from that same starting FEN,
  //  or its very first move fails ("Invalid move") since it has no idea the game
  //  didn't start from the normal board.
  //
  const headers = chess.getHeaders()
  const startFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined

  const history  = chess.history({ verbose: true })
  const replay   = startFen ? new Chess(startFen) : new Chess()
  const records: PositionRecord[] = []

  for (let i = 0; i < Math.min(history.length, maxHalfMove); i++) {
    const fen   = truncateFen(replay.fen())
    const move  = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    const moveNum = Math.ceil((i + 1) / 2)
    replay.move(move.san)
    const resultingFen = truncateFen(replay.fen())

    // A revisited position (transposition/repetition) is real and gets its own row each
    // time — not deduped within a game. pos_reached counts DISTINCT gam_gdid, so this
    // doesn't affect reach counts; it does let move-frequency queries see every visit.
    //
    // Every ply is recorded, not just the tracked player's own — the opponent's moves
    // are real edges too. Queries that must stay scoped to the tracked player's own
    // moves (e.g. the Habits page) filter on pos_color vs. the game's player color
    // instead, since that's already derivable and this table is no longer implicitly
    // "my moves only."
    if (i >= minHalfMove) {
      records.push({
        gdid:         game.gdid,
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
      gdid:         game.gdid,
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
//  insertGamePositions_Player — Phase A: write tgam_game_positions directly from parsed
//  records. gam_pos_fen/gam_resulting_fen carry the FEN text, so this step has no
//  dependency on tpos_positions at all — tgam_game_positions is the source of truth.
//  gam_pos_id/gam_resulting_pos_id are left NULL here; syncTposFromTgam_Player (Phase B)
//  backfills them afterward. Plain INSERT, no ON CONFLICT — a revisited position within
//  a game is legitimate and gets its own row (gam_gamid's own IDENTITY makes every row
//  distinct regardless); nothing about (gdid, pos_fen) is unique anymore.
//----------------------------------------------------------------------------------
async function insertGamePositions_Player(records: PositionRecord[], level: number): Promise<void> {
  await logStart('insertGamePositions_Player', 'buildPositionTree_Player', `inserting ${records.length} game-position rows`, level)
  const chunks = chunkByGame(records, POSITION_INSERT_CHUNK_SIZE_Player, r => r.gdid)
  for (const chunk of chunks) {
    const values = chunk.map((_, i) => {
      const b = i * 6
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`
    }).join(',')
    const params = chunk.flatMap(r => [
      r.gdid, r.posFen, r.movePlayed,
      r.moveUci, r.resultingFen, r.moveNum
    ])
    await table_query({
      caller:       'insertGamePositions_Player',
      query:        `
        INSERT INTO tgam_game_positions
          (gam_gdid, gam_pos_fen, gam_move_played,
           gam_move_uci, gam_resulting_fen, gam_move_num)
        VALUES ${values}
      `,
      params,
      table:        'tgam_game_positions',
      level,
      isupdate:     true,
      severity:     'I'
    })
  }
  await logEnd('insertGamePositions_Player', 'buildPositionTree_Player', `${records.length} tgam_game_positions rows inserted`, level)
}

//----------------------------------------------------------------------------------
//  syncTposFromTgam_Player — Phase B: derive tpos_positions from tgam_game_positions.
//  Idempotent and safely re-runnable at any time: only touches tgam rows not yet
//  resolved (gam_pos_id / gam_resulting_pos_id IS NULL), so already-processed history
//  is never rescanned. Three steps: (1) ensure a tpos_positions row exists for every
//  FEN still referenced by an unresolved tgam row, (2) backfill the ids, (3) recompute
//  pos_reached only for the positions actually touched. Exported standalone so it can
//  also be re-run on its own as a catch-up pass if it ever fails to complete for some
//  batch.
//----------------------------------------------------------------------------------
export async function syncTposFromTgam_Player(level: number = 1, forceNewRun?: boolean): Promise<{ positionsSynced: number }> {
  await logStart('syncTposFromTgam_Player', 'buildPositionTree_Player', 'deriving tpos_positions from unresolved tgam_game_positions rows', level)
  const t0 = Date.now()

  // Unresolved backlog size going in — logged as sub-step 3a's pip_input_recs (below)
  // instead of touchedPosIds.length, so the Pipeline Jobs summary reports "how much was
  // pending before this run" rather than "how much this run touched" (the latter spikes
  // misleadingly if a large dangling-reference backlog gets resolved in one pass).
  // gam_pos_id IS NULL only — matches refreshTposStatus()'s "unresolved" stat exactly.
  // gam_resulting_pos_id IS NULL is deliberately excluded: once Purge nulls it, it nulls
  // gam_resulting_fen too, so that side is permanently dead, not pending work.
  const backlogRes = await table_query({
    caller: 'syncTposFromTgam_backlog',
    query:  `SELECT COUNT(*) AS cnt FROM tgam_game_positions WHERE gam_pos_id IS NULL`,
    params: [],
    table: 'tgam_game_positions',
    level,
    severity: 'I',
    skipCache: true
  })
  if (!backlogRes.ok) {
    write_logging({
      lg_functionname: 'syncTposFromTgam_Player',
      lg_caller: 'syncTposFromTgam_backlog',
      lg_msg: 'Failed to fetch tgam backlog count: ' + backlogRes.error,
      lg_severity: 'E'
    })
  }
  const backlogBefore = backlogRes.ok ? parseInt(backlogRes.data[0]?.cnt ?? '0') : 0

  // Step 1 — ensure a tpos_positions row exists for every FEN still referenced by an
  // unresolved tgam row. pos_color is the FEN's own active-color field (2nd token),
  // derived directly rather than carried through as a separate column.
  await table_query({
    caller: 'syncTposFromTgam_ensure',
    query:  `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_reached)
      SELECT DISTINCT fen, split_part(fen, ' ', 2), 0 FROM (
        SELECT gam_pos_fen AS fen FROM tgam_game_positions
        WHERE gam_pos_id IS NULL AND gam_pos_fen IS NOT NULL AND gam_pos_fen <> '__too_short__'
        UNION
        SELECT gam_resulting_fen AS fen FROM tgam_game_positions
        WHERE gam_resulting_pos_id IS NULL AND gam_resulting_fen IS NOT NULL
      ) t
      ON CONFLICT (pos_fen) DO NOTHING
    `,
    params: [],
    table: 'tpos_positions',
    level,
    isupdate: true,
    severity: 'I'
  })

  // Step 2 — backfill ids wherever still NULL, capturing which positions were touched
  const beforeRes = await table_query({
    caller: 'syncTposFromTgam_backfillBefore',
    query:  `
      UPDATE tgam_game_positions g
      SET gam_pos_id = p.pos_id
      FROM tpos_positions p
      WHERE g.gam_pos_id IS NULL AND g.gam_pos_fen = p.pos_fen
      RETURNING p.pos_id
    `,
    params: [],
    table: 'tgam_game_positions',
    level,
    isupdate: true,
    severity: 'I'
  })
  const resultingRes = await table_query({
    caller: 'syncTposFromTgam_backfillResulting',
    query:  `
      UPDATE tgam_game_positions g
      SET gam_resulting_pos_id = p.pos_id
      FROM tpos_positions p
      WHERE g.gam_resulting_pos_id IS NULL AND g.gam_resulting_fen = p.pos_fen
      RETURNING p.pos_id
    `,
    params: [],
    table: 'tgam_game_positions',
    level,
    isupdate: true,
    severity: 'I'
  })
  if (!beforeRes.ok || !resultingRes.ok) {
    write_logging({
      lg_functionname: 'syncTposFromTgam_Player',
      lg_caller: 'syncTposFromTgam_backfill',
      lg_msg: 'Failed to backfill tgam ids: ' + [beforeRes, resultingRes].filter(r => !r.ok).map(r => r.error).join('; '),
      lg_severity: 'E'
    })
    await logEnd('syncTposFromTgam_Player', 'buildPositionTree_Player', 'failed during id backfill', level)
    return { positionsSynced: 0 }
  }

  const touchedPosIds = [...new Set<number>([
    ...beforeRes.data.map((r: any) => Number(r.pos_id)),
    ...resultingRes.data.map((r: any) => Number(r.pos_id))
  ])]

  // Step 3 — recompute pos_reached only for touched positions
  await recomputePosReachedByIds_Player(touchedPosIds, level)

  const tgamBackfilled = beforeRes.data.length + resultingRes.data.length
  const durationMs     = Date.now() - t0
  await logPipelineStep({ step: 3, subStep: 'a', stepName: 'Sync tpos_positions', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'tgam_game_positions', inputRecs: backlogBefore, outputTable: 'tpos_positions', outputRecs: touchedPosIds.length, durationMs, forceNewRun })
  await logPipelineStep({ step: 3, subStep: 'b', stepName: 'Backfill tgam ids', pipelineType: PIPELINE_TYPE_GAMES, inputTable: 'tgam_game_positions', inputRecs: backlogBefore, outputTable: 'tgam_game_positions', outputRecs: tgamBackfilled, durationMs, forceNewRun: false })

  await logEnd('syncTposFromTgam_Player', 'buildPositionTree_Player', `${touchedPosIds.length} positions synced`, level)
  return { positionsSynced: touchedPosIds.length }
}

//----------------------------------------------------------------------------------
//  recomputePosReachedByIds_Player — accurate count from tgam_game_positions for a specific
//  set of positions. Counts only the "before" side (gam_pos_id) — every ply is now
//  recorded, so a position's "resulting" occurrence in one record is the same reach as
//  the next record's "before" occurrence in that game; counting both sides double-
//  counts. The one exception (a game's final ply, or the MAX_ANALYSIS_MOVE_Player truncation
//  cutoff, where a resulting position is never anyone's "before") is treated as
//  inconsequential — those positions simply read as low-reach.
//----------------------------------------------------------------------------------
async function recomputePosReachedByIds_Player(posIds: number[], level: number): Promise<void> {
  if (posIds.length === 0) return
  for (let start = 0; start < posIds.length; start += 1000) {
    const chunk = posIds.slice(start, start + 1000)
    await table_query({
      caller: 'recomputePosReached',
      query:  `
        UPDATE tpos_positions p
        SET pos_reached = (
          SELECT COUNT(DISTINCT gam_gdid)
          FROM tgam_game_positions
          WHERE gam_pos_id = p.pos_id AND gam_move_num > 0
        ),
        pos_move_num = (
          SELECT MIN(gam_move_num)
          FROM tgam_game_positions
          WHERE gam_pos_id = p.pos_id
        )
        WHERE p.pos_id = ANY($1)
      `,
      // table_query's params type doesn't declare array elements (needed for = ANY($1)),
      // even though the underlying driver handles them fine — narrow cast, not a real risk
      params: [chunk] as unknown as number[],
      table: 'tpos_positions',
      level,
      isupdate: true,
      severity: 'I'
    })
  }
}
