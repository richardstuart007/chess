'use server'

import { Chess } from 'chess.js'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { table_query } from 'nextjs-shared/table_query'
import { MIN_ANALYSIS_MOVE, MAX_ANALYSIS_MOVE } from '../constants'

const ROW_CHUNK = 500   // rows per bulk INSERT (keeps params well under PG limit)

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
  gdid:              number
  player:            string
  posFen:            string
  posId:             number | null
  movePlayed:        string
  moveUci:            string | null
  resultingFen:       string | null
  resultingPosId:     number | null
  resultingColor:     string | null
  resultingMoveNum:   number | null
  resultingPlyCount:  number | null
  moveNum:      number
  result:       string
  color:        string
  plyCount:     number
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
  const seenFens = new Set<string>()

  for (let i = 0; i < Math.min(history.length, maxHalfMove); i++) {
    const fen   = truncateFen(replay.fen())
    const color = replay.turn()
    const move  = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    const moveNum = Math.ceil((i + 1) / 2)
    replay.move(move.san)
    const resultingFen      = truncateFen(replay.fen())
    const resultingColor    = replay.turn()
    // fullmove increments after Black's move — verified formula, matches Evaluate Positions
    const resultingMoveNum  = moveNum + (color === 'b' ? 1 : 0)
    const resultingPlyCount = i + 2

    if (i >= minHalfMove && color === game.playerColor && !seenFens.has(fen)) {
      seenFens.add(fen)
      records.push({
        gdid:         game.gdid,
        player:       game.player,
        posFen:       fen,
        posId:        null,
        movePlayed:   move.san,
        moveUci,
        resultingFen,
        resultingPosId:    null,
        resultingColor,
        resultingMoveNum,
        resultingPlyCount,
        moveNum,
        result:       game.result,
        color,
        plyCount:     i + 1
      })
    }
  }

  // Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires
  if (records.length === 0) {
    records.push({
      gdid:         game.gdid,
      player:       game.player,
      posFen:       '__too_short__',
      posId:        null,
      movePlayed:   '',
      moveUci:      null,
      resultingFen: null,
      resultingPosId:    null,
      resultingColor:    null,
      resultingMoveNum:  null,
      resultingPlyCount: null,
      moveNum:      0,
      result:       game.result,
      color:        '',
      plyCount:     0
    })
  }

  return records
}

//----------------------------------------------------------------------------------
//  bulkEnsurePositions — insert new unique FENs into tpos_positions
//----------------------------------------------------------------------------------
async function bulkEnsurePositions(db: any, records: PositionRecord[]): Promise<void> {
  const fenMap = new Map<string, { color: string; plyCount: number; moveNum: number }>()
  for (const r of records) {
    if (r.posFen === '__too_short__') continue
    if (!fenMap.has(r.posFen)) fenMap.set(r.posFen, { color: r.color, plyCount: r.plyCount, moveNum: r.moveNum })
    if (r.resultingFen && !fenMap.has(r.resultingFen)) {
      fenMap.set(r.resultingFen, { color: r.resultingColor!, plyCount: r.resultingPlyCount!, moveNum: r.resultingMoveNum! })
    }
  }
  if (fenMap.size === 0) return

  const entries = [...fenMap.entries()]
  for (let start = 0; start < entries.length; start += ROW_CHUNK) {
    const chunk  = entries.slice(start, start + ROW_CHUNK)
    const values = chunk.map((_, i) => {
      const b = i * 4
      return `($${b+1},$${b+2},$${b+3},0,$${b+4})`
    }).join(',')
    const params = chunk.flatMap(([fen, v]) => [fen, v.color, v.plyCount, v.moveNum])
    await db.query({
      caller:       'bulkEnsurePositions',
      query:        `
        INSERT INTO tpos_positions (pos_fen, pos_color, pos_ply_count, pos_reached, pos_move_num)
        VALUES ${values}
        ON CONFLICT (pos_fen) DO UPDATE SET
          pos_ply_count = LEAST(tpos_positions.pos_ply_count, EXCLUDED.pos_ply_count)
      `,
      params,
      functionName: 'buildPositionTree'
    })
  }
}

//----------------------------------------------------------------------------------
//  resolvePositionIds — look up pos_id for every unique FEN in this batch and
//  attach it to each record in place, now that bulkEnsurePositions has guaranteed
//  every non-sentinel FEN has a tpos_positions row
//----------------------------------------------------------------------------------
async function resolvePositionIds(db: any, records: PositionRecord[]): Promise<void> {
  const fenSet = new Set<string>()
  for (const r of records) {
    if (r.posFen !== '__too_short__') fenSet.add(r.posFen)
    if (r.resultingFen) fenSet.add(r.resultingFen)
  }
  const fens = [...fenSet]
  if (fens.length === 0) return

  const fenToPosId = new Map<string, number>()
  for (let start = 0; start < fens.length; start += 1000) {
    const chunk = fens.slice(start, start + 1000)
    const res = await db.query({
      caller:       'resolvePositionIds',
      query:        `SELECT pos_id, pos_fen FROM tpos_positions WHERE pos_fen = ANY($1)`,
      params:       [chunk],
      functionName: 'buildPositionTree'
    })
    for (const row of res.rows) fenToPosId.set(row.pos_fen, row.pos_id)
  }

  for (const r of records) {
    if (r.posFen !== '__too_short__') r.posId = fenToPosId.get(r.posFen) ?? null
    if (r.resultingFen) r.resultingPosId = fenToPosId.get(r.resultingFen) ?? null
  }
}

//----------------------------------------------------------------------------------
//  bulkInsertGamePositions — one INSERT per ROW_CHUNK rows, ON CONFLICT DO NOTHING
//----------------------------------------------------------------------------------
async function bulkInsertGamePositions(db: any, records: PositionRecord[]): Promise<void> {
  for (let start = 0; start < records.length; start += ROW_CHUNK) {
    const chunk  = records.slice(start, start + ROW_CHUNK)
    const values = chunk.map((_, i) => {
      const b = i * 8
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`
    }).join(',')
    const params = chunk.flatMap(r => [
      r.gdid, r.player, r.posId, r.movePlayed,
      r.moveUci, r.resultingPosId, r.moveNum, r.result
    ])
    await db.query({
      caller:       'bulkInsertGamePositions',
      query:        `
        INSERT INTO tgam_game_positions
          (gam_gdid, gam_player, gam_pos_id, gam_move_played,
           gam_move_uci, gam_resulting_pos_id, gam_move_num, gam_player_result)
        VALUES ${values}
        ON CONFLICT (gam_gdid, gam_player, gam_pos_id) DO NOTHING
      `,
      params,
      functionName: 'buildPositionTree'
    })
  }
}

//----------------------------------------------------------------------------------
//  recomputePosReached — accurate count from tgam_game_positions. A position can be
//  someone's "before" position in one game and a "resulting" position in another, so
//  the true reach count combines both — matches gam_pos_id and gam_resulting_pos_id.
//----------------------------------------------------------------------------------
async function recomputePosReached(fens: string[]): Promise<void> {
  const unique = [...new Set(fens.filter(f => f !== '__too_short__'))]
  for (let start = 0; start < unique.length; start += 1000) {
    const chunk = unique.slice(start, start + 1000)
    await table_query({
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
        )
        WHERE p.pos_fen = ANY($1)
      `,
      params: [chunk as unknown as string]
    })
  }
}

//----------------------------------------------------------------------------------
//  buildPositionTree — main export
//----------------------------------------------------------------------------------
export async function buildPositionTree(opts: {
  limit?:          number
  playerUsername?: string
  dateFrom?:       string
  dateTo?:         string
}): Promise<{
  gamesProcessed: number
  positions:      number
  errors:         number
  treeBuilt:      number
  remaining:      number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const limit       = opts.limit ?? 100
  const minHalfMove = (MIN_ANALYSIS_MOVE - 1) * 2
  const maxHalfMove = MAX_ANALYSIS_MOVE * 2

  const params: any[]     = []
  const conditions: string[] = ['d.gd_pgn IS NOT NULL']

  conditions.push(`NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_gdid = d.gd_gdid
  )`)

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
    functionName: 'buildPositionTree'
  })

  const games: GameRecord[] = gamesRes.rows.map((r: any) => ({
    gdid:          r.gdid,
    player:        r.player,
    playerColor:   r.player_color as 'w' | 'b',
    pgn:           r.pgn ?? '',
    result:        r.result
  }))

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
       WHERE d.gd_pgn IS NOT NULL
         AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
         AND NOT EXISTS (
           SELECT 1 FROM tgam_game_positions
           WHERE gam_gdid = d.gd_gdid
         )) AS snap_remaining`,
    params:       [fromTs, toTs],
    functionName: 'buildPositionTree'
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
      errors++
    }
  }

  // Bulk insert into DB
  await bulkEnsurePositions(db, allRecords)
  await resolvePositionIds(db, allRecords)
  await bulkInsertGamePositions(db, allRecords)
  await recomputePosReached([
    ...allRecords.map(r => r.posFen),
    ...allRecords.map(r => r.resultingFen).filter((f): f is string => f !== null)
  ])

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, snapProcessed + processed)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}
