'use server'

import { Chess } from 'chess.js'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { MIN_ANALYSIS_MOVE, MAX_ANALYSIS_MOVE, POSITION_INSERT_CHUNK_SIZE } from '../constants'

//----------------------------------------------------------------------------------
//  truncateFen — keep only the 4 positional fields (piece placement, active color,
//  castling rights, en passant target); drop halfmove clock + fullmove number, which
//  are bookkeeping, not part of what makes two positions "the same"
//----------------------------------------------------------------------------------
function truncateFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

interface GameRecord {
  gdid:          number
  player:        string
  playerColor:   'w' | 'b'
  pgn:           string
  result:        string
}

interface PositionRecord {
  gdid:         number
  player:       string
  posFen:       string
  movePlayed:   string
  moveUci:      string | null
  resultingFen: string | null
  moveNum:      number
  result:       string
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
    const color = replay.turn()
    const move  = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    const moveNum = Math.ceil((i + 1) / 2)
    replay.move(move.san)
    const resultingFen = truncateFen(replay.fen())

    // A revisited position (transposition/repetition) is real and gets its own row each
    // time — not deduped within a game. pos_reached counts DISTINCT gam_gdid, so this
    // doesn't affect reach counts; it does let move-frequency queries see every visit.
    if (i >= minHalfMove && color === game.playerColor) {
      records.push({
        gdid:         game.gdid,
        player:       game.player,
        posFen:       fen,
        movePlayed:   move.san,
        moveUci,
        resultingFen,
        moveNum,
        result:       game.result
      })
    }
  }

  // Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires
  if (records.length === 0) {
    records.push({
      gdid:         game.gdid,
      player:       game.player,
      posFen:       '__too_short__',
      movePlayed:   '',
      moveUci:      null,
      resultingFen: null,
      moveNum:      0,
      result:       game.result
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
//  distinct regardless); nothing about (gdid, player, pos_fen) is unique anymore.
//----------------------------------------------------------------------------------
async function insertGamePositions(db: any, records: PositionRecord[], level: number): Promise<void> {
  await logStart('insertGamePositions', 'buildPositionTree', `inserting ${records.length} game-position rows`, level)
  const chunks = chunkByGame(records, POSITION_INSERT_CHUNK_SIZE)
  for (const chunk of chunks) {
    const values = chunk.map((_, i) => {
      const b = i * 8
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`
    }).join(',')
    const params = chunk.flatMap(r => [
      r.gdid, r.player, r.posFen, r.movePlayed,
      r.moveUci, r.resultingFen, r.moveNum, r.result
    ])
    await db.query({
      caller:       'insertGamePositions',
      query:        `
        INSERT INTO tgam_game_positions
          (gam_gdid, gam_player, gam_pos_fen, gam_move_played,
           gam_move_uci, gam_resulting_fen, gam_move_num, gam_player_result)
        VALUES ${values}
      `,
      params,
      functionName: 'buildPositionTree',
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
//  set of positions. A position can be someone's "before" position in one game and a
//  "resulting" position in another, so the true reach count combines both.
//----------------------------------------------------------------------------------
async function recomputePosReachedByIds(db: any, posIds: number[], level: number): Promise<void> {
  if (posIds.length === 0) return
  for (let start = 0; start < posIds.length; start += 1000) {
    const chunk = posIds.slice(start, start + 1000)
    await db.query({
      caller: 'recomputePosReached',
      query:  `
        UPDATE tpos_positions p
        SET pos_reached = (
          SELECT COUNT(DISTINCT gam_gdid)
          FROM tgam_game_positions
          WHERE gam_pos_id = p.pos_id
            AND gam_move_num > 0
        ) + (
          SELECT COUNT(DISTINCT gam_gdid)
          FROM tgam_game_positions
          WHERE gam_resulting_pos_id = p.pos_id
        ),
        pos_move_num = (
          SELECT MIN(gam_move_num)
          FROM tgam_game_positions
          WHERE gam_pos_id = p.pos_id OR gam_resulting_pos_id = p.pos_id
        )
        WHERE p.pos_id = ANY($1)
      `,
      params: [chunk],
      functionName: 'buildPositionTree',
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
export async function syncTposFromTgam(level: number = 1): Promise<{ positionsSynced: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  await logStart('syncTposFromTgam', 'buildPositionTree', 'deriving tpos_positions from unresolved tgam_game_positions rows', level)
  const t0 = Date.now()
  const logId = await startPipelineLog(3, 'Sync Position Tree', 0)

  // Step 1 — ensure a tpos_positions row exists for every FEN still referenced by an
  // unresolved tgam row. pos_color is the FEN's own active-color field (2nd token),
  // derived directly rather than carried through as a separate column.
  await db.query({
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
    functionName: 'buildPositionTree',
    table: 'tpos_positions',
    level,
    isupdate: true,
    severity: 'D'
  })

  // Step 2 — backfill ids wherever still NULL, capturing which positions were touched
  const beforeRes = await db.query({
    caller: 'syncTposFromTgam_backfillBefore',
    query:  `
      UPDATE tgam_game_positions g
      SET gam_pos_id = p.pos_id
      FROM tpos_positions p
      WHERE g.gam_pos_id IS NULL AND g.gam_pos_fen = p.pos_fen
      RETURNING p.pos_id
    `,
    params: [],
    functionName: 'buildPositionTree',
    table: 'tgam_game_positions',
    level,
    isupdate: true,
    severity: 'D'
  })
  const resultingRes = await db.query({
    caller: 'syncTposFromTgam_backfillResulting',
    query:  `
      UPDATE tgam_game_positions g
      SET gam_resulting_pos_id = p.pos_id
      FROM tpos_positions p
      WHERE g.gam_resulting_pos_id IS NULL AND g.gam_resulting_fen = p.pos_fen
      RETURNING p.pos_id
    `,
    params: [],
    functionName: 'buildPositionTree',
    table: 'tgam_game_positions',
    level,
    isupdate: true,
    severity: 'D'
  })

  const touchedPosIds = [...new Set<number>([
    ...beforeRes.rows.map((r: any) => Number(r.pos_id)),
    ...resultingRes.rows.map((r: any) => Number(r.pos_id))
  ])]

  // Step 3 — recompute pos_reached only for touched positions
  await recomputePosReachedByIds(db, touchedPosIds, level)

  await completePipelineLog(logId, touchedPosIds.length, 0, 0, Date.now() - t0)

  await logEnd('syncTposFromTgam', 'buildPositionTree', `${touchedPosIds.length} positions synced`, level)
  return { positionsSynced: touchedPosIds.length }
}

//----------------------------------------------------------------------------------
//  buildPositionTree — main export
//----------------------------------------------------------------------------------
export async function buildPositionTree(opts: {
  limit?:          number
  playerUsername?: string
  dateFrom?:       string
  dateTo?:         string
  level?:          number
  skipSync?:       boolean   // debug/verification only — skip Phase B (syncTposFromTgam)
}): Promise<{
  gamesProcessed: number
  positions:      number
  errors:         number
  treeBuilt:      number
  remaining:      number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const level    = opts.level ?? 1
  const caller   = level === 1 ? 'analysisCronRoute' : 'runCronAnalysis'
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
  if (opts.dateFrom) {
    params.push(Math.floor(new Date(opts.dateFrom).getTime() / 1000))
    conditions.push(`d.gd_end_time >= $${params.length}`)
  }
  if (opts.dateTo) {
    params.push(Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000))
    conditions.push(`d.gd_end_time <= $${params.length}`)
  }

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const whereClause = conditions.map(c => `(${c})`).join(' AND ')

  const gamesRes = await db.query({
    caller: 'buildPositionTree_fetch',
    query:  `
      SELECT
        d.gd_gdid AS gdid,
        d.gd_player AS player,
        d.gd_pgn AS pgn,
        CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END AS player_color,
        d.gd_player_result AS result
      FROM tgd_gamesdecon d
      WHERE ${whereClause}
      ORDER BY d.gd_end_time DESC
      ${limitClause}
    `,
    params,
    functionName: 'buildPositionTree',
    table: 'tgd_gamesdecon',
    level,
    severity: 'D'
  })

  const games: GameRecord[] = gamesRes.rows.map((r: any) => ({
    gdid:          r.gdid,
    player:        r.player,
    playerColor:   r.player_color as 'w' | 'b',
    pgn:           r.pgn ?? '',
    result:        r.result
  }))

  await logStart('buildPositionTree', caller, `building position tree, ${games.length} games fetched`, level)

  const fromTs  = opts.dateFrom ? Math.floor(new Date(opts.dateFrom).getTime() / 1000)                   : 0
  const toTs    = opts.dateTo   ? Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)       : Math.floor(Date.now() / 1000)
  const snapRes = await db.query({
    caller: 'buildPositionTree_snap',
    query:  `SELECT
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.gam_gdid
         FROM tgam_game_positions gp
         JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
         WHERE d.gd_end_time >= $1 AND d.gd_end_time <= $2
       ) t) AS snap_processed,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       WHERE d.gd_end_time >= $1 AND d.gd_end_time <= $2
         AND NOT d.gd_positions_purged
         AND NOT EXISTS (
           SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid
         )) AS snap_remaining`,
    params:       [fromTs, toTs],
    functionName: 'buildPositionTree',
    level,
    severity:     'D'
  })
  const snapProcessed = parseInt(snapRes.rows[0].snap_processed ?? '0')
  const snapRemaining = parseInt(snapRes.rows[0].snap_remaining ?? '0')

  const t0    = Date.now()
  const logId = await startPipelineLog(2, 'Build Position Tree', games.length, snapProcessed, snapRemaining, opts.dateFrom, opts.dateTo)

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
  await insertGamePositions(db, allRecords, level + 1)
  // Phase B — derive tpos_positions from what Phase A just wrote
  if (!opts.skipSync) await syncTposFromTgam(level + 1)

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, snapProcessed + processed)

  await logEnd('buildPositionTree', caller, `${totalPositions} positions recorded, treeBuilt ${snapProcessed + processed}, remaining ${afterRemaining}`, level)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}
