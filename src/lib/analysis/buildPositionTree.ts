'use server'

import { Chess } from 'chess.js'
import { logPipelineStep } from '../actions/pipelineLog'
import { write_logging } from 'nextjs-shared/write_logging'
import { table_query } from 'nextjs-shared/table_query'
import { logStart, logEnd } from '../logStep'
import { MIN_ANALYSIS_MOVE, MAX_ANALYSIS_MOVE, POSITION_INSERT_CHUNK_SIZE } from '../constants'
import { truncateFen } from '../fen'

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

//----------------------------------------------------------------------------------
//  getPositionsFromGame — pure chess.js, no DB, returns all recordable positions
//----------------------------------------------------------------------------------
function getPositionsFromGame(
  game: GameRecord,
  minHalfMove: number,
  maxHalfMove: number
): PositionRecord[] {
  if (!game.pgn) return []

  const chess = new Chess()
  try { chess.loadPgn(game.pgn) } catch { return [] }

  const history  = chess.history({ verbose: true })
  const replay   = new Chess()
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
//  chunkByGame — group records into chunks without ever splitting one game's own
//  records across two chunks. Records for the same gdid are always contiguous (games
//  are processed in order), so a single Postgres statement per chunk is atomic per
//  whole game on its own — no transaction needed.
//----------------------------------------------------------------------------------
function chunkByGame(records: PositionRecord[], maxRows: number): PositionRecord[][] {
  const chunks: PositionRecord[][] = []
  let current: PositionRecord[] = []
  let i = 0
  while (i < records.length) {
    const gdid = records[i].gdid
    let j = i
    while (j < records.length && records[j].gdid === gdid) j++
    const gameRecords = records.slice(i, j)
    if (current.length > 0 && current.length + gameRecords.length > maxRows) {
      chunks.push(current)
      current = []
    }
    current.push(...gameRecords)
    i = j
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

//----------------------------------------------------------------------------------
//  insertGamePositions — Phase A: write tgam_game_positions directly from parsed
//  records. gam_pos_fen/gam_resulting_fen carry the FEN text, so this step has no
//  dependency on tpos_positions at all — tgam_game_positions is the source of truth.
//  gam_pos_id/gam_resulting_pos_id are left NULL here; syncTposFromTgam (Phase B)
//  backfills them afterward. Plain INSERT, no ON CONFLICT — a revisited position within
//  a game is legitimate and gets its own row (gam_gamid's own IDENTITY makes every row
//  distinct regardless); nothing about (gdid, pos_fen) is unique anymore.
//----------------------------------------------------------------------------------
async function insertGamePositions(records: PositionRecord[], level: number): Promise<void> {
  await logStart('insertGamePositions', 'buildPositionTree', `inserting ${records.length} game-position rows`, level)
  const chunks = chunkByGame(records, POSITION_INSERT_CHUNK_SIZE)
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
      caller:       'insertGamePositions',
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
      severity:     'D'
    })
  }
  await logEnd('insertGamePositions', 'buildPositionTree', `${records.length} tgam_game_positions rows inserted`, level)
}

//----------------------------------------------------------------------------------
//  recomputePosReachedByIds — accurate count from tgam_game_positions for a specific
//  set of positions. Counts only the "before" side (gam_pos_id) — every ply is now
//  recorded, so a position's "resulting" occurrence in one record is the same reach as
//  the next record's "before" occurrence in that game; counting both sides double-
//  counts. The one exception (a game's final ply, or the MAX_ANALYSIS_MOVE truncation
//  cutoff, where a resulting position is never anyone's "before") is treated as
//  inconsequential — those positions simply read as low-reach.
//----------------------------------------------------------------------------------
async function recomputePosReachedByIds(posIds: number[], level: number): Promise<void> {
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
      severity: 'D'
    })
  }
}

//----------------------------------------------------------------------------------
//  syncTposFromTgam — Phase B: derive tpos_positions from tgam_game_positions.
//  Idempotent and safely re-runnable at any time: only touches tgam rows not yet
//  resolved (gam_pos_id / gam_resulting_pos_id IS NULL), so already-processed history
//  is never rescanned. Three steps: (1) ensure a tpos_positions row exists for every
//  FEN still referenced by an unresolved tgam row, (2) backfill the ids, (3) recompute
//  pos_reached only for the positions actually touched. Exported standalone so it can
//  also be re-run on its own as a catch-up pass if it ever fails to complete for some
//  batch.
//----------------------------------------------------------------------------------
export async function syncTposFromTgam(level: number = 1, forceNewRun?: boolean): Promise<{ positionsSynced: number }> {
  await logStart('syncTposFromTgam', 'buildPositionTree', 'deriving tpos_positions from unresolved tgam_game_positions rows', level)
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
    severity: 'D',
    skipCache: true
  })
  const backlogBefore = parseInt(backlogRes[0]?.cnt ?? '0')

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
    severity: 'D'
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
    severity: 'D'
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
    severity: 'D'
  })

  const touchedPosIds = [...new Set<number>([
    ...beforeRes.map((r: any) => Number(r.pos_id)),
    ...resultingRes.map((r: any) => Number(r.pos_id))
  ])]

  // Step 3 — recompute pos_reached only for touched positions
  await recomputePosReachedByIds(touchedPosIds, level)

  const tgamBackfilled = beforeRes.length + resultingRes.length
  const durationMs     = Date.now() - t0
  await logPipelineStep({ step: 3, subStep: 'a', stepName: 'Sync tpos_positions', inputTable: 'tgam_game_positions', inputRecs: backlogBefore, outputTable: 'tpos_positions', outputRecs: touchedPosIds.length, durationMs, forceNewRun })
  await logPipelineStep({ step: 3, subStep: 'b', stepName: 'Backfill tgam ids', inputTable: 'tgam_game_positions', inputRecs: backlogBefore, outputTable: 'tgam_game_positions', outputRecs: tgamBackfilled, durationMs, forceNewRun: false })

  await logEnd('syncTposFromTgam', 'buildPositionTree', `${touchedPosIds.length} positions synced`, level)
  return { positionsSynced: touchedPosIds.length }
}

//----------------------------------------------------------------------------------
//  buildPositionTree — main export
//----------------------------------------------------------------------------------
export async function buildPositionTree(opts: {
  limit?:          number
  playerUsername?: string
  level?:          number
  skipSync?:       boolean   // debug/verification only — skip Phase B (syncTposFromTgam)
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
  const limit       = opts.limit ?? 100
  const minHalfMove = (MIN_ANALYSIS_MOVE - 1) * 2
  const maxHalfMove = MAX_ANALYSIS_MOVE * 2

  const params: any[]     = []
  const conditions: string[] = [`NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_gdid = d.gd_gdid
  ) AND NOT d.gd_positions_purged`]

  if (opts.playerUsername) {
    params.push(opts.playerUsername.toLowerCase())
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
    severity: 'D',
    skipCache: true
  })

  const games: GameRecord[] = gamesRes.map((r: any) => ({
    gdid:          r.gdid,
    pgn:           r.pgn ?? ''
  }))

  await logStart('buildPositionTree', caller, `building position tree, ${games.length} games fetched`, level)

  const snapRes = await table_query({
    caller: 'buildPositionTree_snap',
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
    severity:     'D',
    skipCache:    true
  })
  const snapProcessed = parseInt(snapRes[0].snap_processed ?? '0')
  const snapRemaining = parseInt(snapRes[0].snap_remaining ?? '0')

  const t0    = Date.now()

  // Process all games in memory — pure chess.js, no DB
  let totalPositions = 0
  let errors         = 0
  const allRecords: PositionRecord[] = []

  for (const game of games) {
    try {
      const records = getPositionsFromGame(game, minHalfMove, maxHalfMove)
      allRecords.push(...records)
      totalPositions += records.filter(r => r.moveNum > 0).length
    } catch (err) {
      console.error(`buildPositionTree: chess.js error on game ${game.gdid}`, err)
      await write_logging({
        lg_functionname: 'buildPositionTree',
        lg_caller: caller,
        lg_msg: `chess.js error on game ${game.gdid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  // Phase A — write tgam_game_positions (self-contained, no tpos_positions dependency)
  await insertGamePositions(allRecords, level + 1)
  // Phase B — derive tpos_positions from what Phase A just wrote
  if (!opts.skipSync) await syncTposFromTgam(level + 1)

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await logPipelineStep({ step: 2, subStep: 'a', stepName: 'Build Position Tree', inputTable: 'tgd_gamesdecon', inputRecs: games.length, outputTable: 'tgam_game_positions', outputRecs: totalPositions, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })

  await logEnd('buildPositionTree', caller, `${totalPositions} positions recorded, treeBuilt ${snapProcessed + processed}, remaining ${afterRemaining}`, level)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}
