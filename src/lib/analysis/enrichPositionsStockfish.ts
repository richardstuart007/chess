'use server'

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { Chess } from 'chess.js'
import { saveEvaluation } from './chessdb'
import { logPipelineStep } from '../actions/pipelineLog'
import { write_logging } from 'nextjs-shared/write_logging'
import { table_query } from 'nextjs-shared/table_query'
import { logStart, logEnd } from '../logStep'
import { MIN_REACH_TO_KEEP, DEFAULT_BATCH_SIZE, GAME_ENDINGS_CONCURRENCY } from '../constants'
import { truncateFen } from '../fen'

//----------------------------------------------------------------------------------
//  StockfishEngineBase — shared UCI line protocol (queueing, evaluate parsing);
//  subclasses only differ in how commands are sent and lines are received
//----------------------------------------------------------------------------------
abstract class StockfishEngineBase {
  protected pending: string[] = []
  protected waiter: ((line: string) => void) | null = null

  abstract send(cmd: string): void
  abstract quit(): void
  abstract init(): Promise<void>

  protected onLine(line: string): void {
    const t = line.trim()
    if (!t) return
    if (this.waiter) {
      const fn = this.waiter
      this.waiter = null
      fn(t)
    } else {
      this.pending.push(t)
    }
  }

  nextLine(): Promise<string> {
    if (this.pending.length > 0) return Promise.resolve(this.pending.shift()!)
    return new Promise(resolve => { this.waiter = resolve })
  }

  async evaluate(fen: string, depth: number): Promise<{ cp: number; bestMove: string | null }> {
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    let cp = 0
    let bestMove: string | null = null
    let line = ''
    do {
      line = await this.nextLine()
      if (line.includes('score cp')) {
        const m = line.match(/score cp (-?\d+)/)
        if (m) cp = parseInt(m[1])
      } else if (line.includes('score mate')) {
        const m = line.match(/score mate (-?\d+)/)
        if (m) {
          const mateIn = parseInt(m[1])
          cp = mateIn > 0 ? 10000 - Math.abs(mateIn) : -10000 + Math.abs(mateIn)
        }
      } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        bestMove = parts[1] ?? null
      }
    } while (!line.startsWith('bestmove'))
    return { cp, bestMove }
  }
}

//----------------------------------------------------------------------------------
//  StockfishProcess — native binary via child_process, multi-threaded (fast).
//  Only runs where STOCKFISH_PATH points at an actual installed binary (local dev).
//----------------------------------------------------------------------------------
class StockfishProcess extends StockfishEngineBase {
  private proc: ReturnType<typeof spawn>

  constructor(binPath: string) {
    super()
    this.proc = spawn(binPath)
    const rl = createInterface({ input: this.proc.stdout as any })
    rl.on('line', (line: string) => this.onLine(line))
  }

  send(cmd: string): void {
    this.proc.stdin?.write(cmd + '\n')
  }

  async init(): Promise<void> {
    this.send('uci')
    while ((await this.nextLine()) !== 'uciok') {}
    this.send('setoption name Threads value 4')
    this.send('isready')
    while ((await this.nextLine()) !== 'readyok') {}
  }

  quit(): void {
    try { this.send('quit') } catch {}
    try { this.proc.kill() }  catch {}
  }
}

//----------------------------------------------------------------------------------
//  StockfishWasm — the 'stockfish' npm WASM package, runs in plain Node with no OS
//  binary needed. Single-threaded (lite-single build) so slower than the native
//  binary, but this is the only engine that actually works on Vercel.
//----------------------------------------------------------------------------------
class StockfishWasm extends StockfishEngineBase {
  private engine: any = null

  send(cmd: string): void {
    this.engine.sendCommand(cmd)
  }

  async init(): Promise<void> {
    const stockfishModule = await import('stockfish')
    const initEngine = (stockfishModule as any).default ?? stockfishModule
    this.engine = await initEngine('lite-single')
    this.engine.listener = (line: string) => this.onLine(line)
    this.send('uci')
    while ((await this.nextLine()) !== 'uciok') {}
    this.send('isready')
    while ((await this.nextLine()) !== 'readyok') {}
  }

  quit(): void {
    try { this.send('quit') } catch {}
  }
}

//----------------------------------------------------------------------------------
//  enrichPositionsStockfish — server-side batch position evaluation. Uses the native
//  binary when STOCKFISH_PATH is set (local dev), the WASM engine otherwise (production).
//  Reads tpos_positions (unevaluated), writes teva_evaluations.
//----------------------------------------------------------------------------------
async function countRemainingPositions(level: number = 1): Promise<number> {
  const rows = await table_query({
    caller: 'enrichPositionsStockfish_count',
    table: 'tpos_positions',
    query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE e.eva_evaid IS NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}`,
    params: [],
    level,
    severity: 'D'
  })
  return parseInt(rows[0]?.cnt ?? '0')
}

async function getResultingFensToEvaluate(limit: number, level: number): Promise<{ posId: number; fen: string; color: string | null }[]> {
  await logStart('getResultingFensToEvaluate', 'enrichPositionsStockfish', 'fetching resulting FENs to evaluate', level)
  const params: number[] = []
  if (limit > 0) params.push(limit)
  // Resulting positions now have a real tpos_positions row (created eagerly by Build
  // Position Tree), so this is a plain id-based lookup — no more FEN grouping or
  // move-number derivation needed, pos_move_num is already set at write time.
  const res = await table_query({
    caller: 'getResultingFensToEvaluate',
    table: 'tgam_game_positions',
    query: `
      SELECT DISTINCT p.pos_id, p.pos_fen, p.pos_color
      FROM tgam_game_positions gp
      JOIN tpos_positions p ON p.pos_id = gp.gam_resulting_pos_id
      WHERE gp.gam_resulting_pos_id IS NOT NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}
        AND NOT EXISTS (
          SELECT 1 FROM teva_evaluations WHERE eva_pos_id = gp.gam_resulting_pos_id
        )
      ${limit > 0 ? `LIMIT $${params.length}` : ''}
    `,
    params,
    level,
    severity: 'D'
  })
  const rows = res.map((r: any) => ({ posId: Number(r.pos_id), fen: r.pos_fen as string, color: (r.pos_color ?? null) as string | null }))
  await logEnd('getResultingFensToEvaluate', 'enrichPositionsStockfish', `${rows.length} FENs found`, level)
  return rows
}

//----------------------------------------------------------------------------------
//  bulkUpdateCpLoss — computes gam_cp_change for tgam_game_positions rows still NULL
//  whose before/after positions both now have a teva_evaluations row. Scoped to NULL
//  rows only — never re-touches already-computed rows. Decoupled from
//  enrichPositionsStockfish — own pipeline step, own trigger (cron + manual).
//----------------------------------------------------------------------------------
export async function bulkUpdateCpLoss(level: number, forceNewRun?: boolean): Promise<number> {
  await logStart('bulkUpdateCpLoss', 'enrichPositionsStockfish', 'recomputing cp loss', level)
  const t0 = Date.now()
  const res = await table_query({
    caller: 'bulkUpdateCpLoss',
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
        AND gp.gam_cp_change IS NULL
        AND e_before.eva_cp IS NOT NULL
        AND e_after.eva_cp  IS NOT NULL
      RETURNING gp.gam_gdid
    `,
    params: [],
    level,
    isupdate: true,
    severity: 'D'
  })
  const rowCount = res.length
  await logPipelineStep({ step: 6, subStep: 'a', stepName: 'Update CP Change', inputTable: 'tgam_game_positions', inputRecs: rowCount, outputTable: 'tgam_game_positions', outputRecs: rowCount, durationMs: Date.now() - t0, forceNewRun })
  await logEnd('bulkUpdateCpLoss', 'enrichPositionsStockfish', `${rowCount} tgam_game_positions rows updated`, level)
  return rowCount
}

export async function enrichPositionsStockfish(opts: {
  limit?:    number
  depth?:    number
  level?:    number
  forceNewRun?: boolean
}): Promise<{ processed: number; errors: number; remaining: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''

  const depth = opts.depth ?? 16
  const limit = opts.limit ?? 50
  const level = opts.level ?? 1

  await logStart('enrichPositionsStockfish', 'evaluatePositionsRoute', `evaluating positions at depth ${depth}`, level)
  const t0 = Date.now()

  // Phase 1 FENs — positions in tpos_positions not yet evaluated
  const posParams: number[] = []
  if (limit > 0) posParams.push(limit)
  const posRes = await table_query({
    caller: 'enrichPositionsStockfish_phase1',
    query: `
      SELECT p.pos_id, p.pos_fen, p.pos_color
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE e.eva_evaid IS NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT $${posParams.length}` : ''}
    `,
    params: posParams,
    table: 'tpos_positions',
    level,
    severity: 'D'
  })
  const positions: Array<{ posId: number; fen: string; color: string | null }> =
    posRes.map((r: any) => ({ posId: Number(r.pos_id), fen: r.pos_fen as string, color: (r.pos_color ?? null) as string | null }))

  // Phase 2 — resulting positions not yet evaluated (real tpos_positions rows already
  // exist for these, created eagerly by Build Position Tree)
  const resultingFens = await getResultingFensToEvaluate(limit, level + 1)

  const allFensToEval: Array<{ fen: string; color: string | null; posId: number }> = [
    ...positions,
    ...resultingFens
  ]

  if (allFensToEval.length === 0) {
    await logPipelineStep({ step: 5, subStep: 'a', stepName: 'Evaluate Positions', inputTable: 'tpos_positions', inputRecs: 0, outputTable: 'teva_evaluations', outputRecs: 0, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })
    await logEnd('enrichPositionsStockfish', 'evaluatePositionsRoute', '0 processed, 0 errors, 0 remaining', level)
    return { processed: 0, errors: 0, remaining: 0 }
  }

  //
  //  STOCKFISH_PATH set (local dev, real binary installed) -> fast native binary.
  //  Unset (Vercel/production) -> WASM fallback, the only engine that actually runs there.
  //
  const sf: StockfishEngineBase = binPath ? new StockfishProcess(binPath) : new StockfishWasm()
  await sf.init()

  let processed = 0
  let errors    = 0

  for (const item of allFensToEval) {
    try {
      const { cp: rawCp, bestMove } = await sf.evaluate(item.fen, depth)
      // Normalize to white's perspective: Stockfish reports from side-to-move perspective.
      const fenColor = item.color ?? 'w'
      const whiteCp = fenColor === 'b' ? -rawCp : rawCp
      await saveEvaluation({
        posId:    item.posId,
        cp:       whiteCp,
        bestMove: bestMove ?? null,
        depth
      })
      processed++
    } catch (err) {
      console.error(`enrichPositionsStockfish: error on FEN`, err)
      await write_logging({
        lg_functionname: 'enrichPositionsStockfish',
        lg_caller: 'evaluatePositionsRoute',
        lg_msg: `error on FEN ${item.fen}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  sf.quit()

  await logPipelineStep({ step: 5, subStep: 'a', stepName: 'Evaluate Positions', inputTable: 'tpos_positions', inputRecs: allFensToEval.length, outputTable: 'teva_evaluations', outputRecs: processed, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })
  const remaining = await countRemainingPositions(level)
  await logEnd('enrichPositionsStockfish', 'evaluatePositionsRoute', `${processed} processed, ${errors} errors, ${remaining} remaining`, level)
  return { processed, errors, remaining }
}

//----------------------------------------------------------------------------------
//  getGamesNeedingFinalEval — games whose actual final position hasn't been evaluated
//  yet, latest games first. Independent of the position-tree pipeline (tpos_positions /
//  tgam_game_positions) entirely — reads/writes tgd_gamesdecon directly, since the
//  final position of most games falls well past MAX_ANALYSIS_MOVE, the position tree's
//  own tracking ceiling. No gd_pgn IS NULL check needed — deconstructGames() already
//  skips any raw game with no PGN before it's ever written to tgd_gamesdecon.
//----------------------------------------------------------------------------------
async function getGamesNeedingFinalEval(limit: number, level: number): Promise<{ gdid: number; pgn: string }[]> {
  const params: number[] = []
  if (limit > 0) params.push(limit)
  const rows = await table_query({
    caller: 'getGamesNeedingFinalEval',
    query: `
      SELECT gd_gdid, gd_pgn
      FROM tgd_gamesdecon
      WHERE gd_final_eval IS NULL
      ORDER BY gd_gdid DESC
      ${limit > 0 ? `LIMIT $${params.length}` : ''}
    `,
    params,
    table: 'tgd_gamesdecon',
    level,
    severity: 'D'
  })
  return rows.map((r: any) => ({ gdid: Number(r.gd_gdid), pgn: r.gd_pgn as string }))
}

//----------------------------------------------------------------------------------
//  findExistingEval — exact-FEN lookup against the already-evaluated position tree;
//  returns the stored eva_cp if this exact position is already tracked/evaluated
//  (common for games that ended within the tracked move range), avoiding a redundant
//  Stockfish call.
//----------------------------------------------------------------------------------
async function findExistingEval(truncatedFen: string, level: number): Promise<number | null> {
  const rows = await table_query({
    caller: 'findExistingEval',
    query: `
      SELECT e.eva_cp
      FROM tpos_positions p
      JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE p.pos_fen = $1 AND e.eva_cp IS NOT NULL
    `,
    params: [truncatedFen],
    table: 'tpos_positions',
    level,
    severity: 'D'
  })
  return rows[0]?.eva_cp != null ? Number(rows[0].eva_cp) : null
}

//----------------------------------------------------------------------------------
//  evaluateGameEndings — populates tgd_gamesdecon.gd_final_eval for each game's actual
//  final position (replayed in full via chess.js, not capped like the position-tree
//  pipeline). Two phases: (1) reuse — an exact-FEN match against the already-evaluated
//  position tree, free, common for games that ended within the tracked move range; (2)
//  fresh Stockfish evaluation for whatever's left, run across multiple concurrent
//  engine instances when using the native binary (real OS processes, genuine
//  parallelism) — the WASM path stays single-instance since lite-single is explicitly
//  single-threaded with no worker-thread offload, so parallel WASM instances would only
//  interleave on one thread, not actually run concurrently.
//----------------------------------------------------------------------------------
export async function evaluateGameEndings(opts: {
  limit?:       number
  depth?:       number
  level?:       number
  forceNewRun?: boolean
}): Promise<{ processed: number; reused: number; errors: number; remaining: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''

  const depth       = opts.depth ?? 16
  const limit       = opts.limit ?? DEFAULT_BATCH_SIZE
  const level       = opts.level ?? 1
  const concurrency = binPath ? GAME_ENDINGS_CONCURRENCY : 1

  await logStart('evaluateGameEndings', 'evaluateGameEndingsRoute', `evaluating game endings at depth ${depth}`, level)
  const t0 = Date.now()

  const games = await getGamesNeedingFinalEval(limit, level)

  if (games.length === 0) {
    await logPipelineStep({ step: 8, subStep: 'a', stepName: 'Evaluate Game Endings', inputTable: 'tgd_gamesdecon', inputRecs: 0, outputTable: 'tgd_gamesdecon', outputRecs: 0, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })
    await logEnd('evaluateGameEndings', 'evaluateGameEndingsRoute', '0 processed, 0 errors, 0 remaining', level)
    return { processed: 0, reused: 0, errors: 0, remaining: 0 }
  }

  let reused = 0
  let errors = 0
  const needsEval: { gdid: number; fen: string }[] = []

  // Phase 1 — exact-match reuse pass (cheap DB lookups only, no engine involved)
  for (const game of games) {
    try {
      const chess       = new Chess()
      chess.loadPgn(game.pgn)
      const finalFen    = chess.fen()
      const finalFenKey = truncateFen(finalFen)

      const existingCp = await findExistingEval(finalFenKey, level)
      if (existingCp != null) {
        await table_query({
          caller: 'evaluateGameEndings_reuse',
          table: 'tgd_gamesdecon',
          query: `UPDATE tgd_gamesdecon SET gd_final_eval = $1 WHERE gd_gdid = $2`,
          params: [existingCp, game.gdid],
          isupdate: true
        })
        reused++
      } else {
        needsEval.push({ gdid: game.gdid, fen: finalFen })
      }
    } catch (err) {
      console.error(`evaluateGameEndings: error on game ${game.gdid}`, err)
      await write_logging({
        lg_functionname: 'evaluateGameEndings',
        lg_caller: 'evaluateGameEndingsRoute',
        lg_msg: `error on game ${game.gdid}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  // Phase 2 — fresh Stockfish evaluation for whatever wasn't already tracked,
  // spread across concurrent engine instances
  let processed = reused

  async function evaluateWorker(engine: StockfishEngineBase, items: { gdid: number; fen: string }[]): Promise<void> {
    for (const item of items) {
      try {
        const sideToMove = item.fen.split(' ')[1]
        const { cp: rawCp } = await engine.evaluate(item.fen, depth)
        const whiteCp = sideToMove === 'b' ? -rawCp : rawCp

        await table_query({
          caller: 'evaluateGameEndings_update',
          table: 'tgd_gamesdecon',
          query: `UPDATE tgd_gamesdecon SET gd_final_eval = $1 WHERE gd_gdid = $2`,
          params: [whiteCp, item.gdid],
          isupdate: true
        })
        processed++
      } catch (err) {
        console.error(`evaluateGameEndings: error on game ${item.gdid}`, err)
        await write_logging({
          lg_functionname: 'evaluateGameEndings',
          lg_caller: 'evaluateGameEndingsRoute',
          lg_msg: `error on game ${item.gdid}: ` + (err as Error).message,
          lg_severity: 'E'
        })
        errors++
      }
    }
  }

  if (needsEval.length > 0) {
    const engineCount = Math.min(concurrency, needsEval.length)
    const engines: StockfishEngineBase[] = Array.from({ length: engineCount }, () =>
      binPath ? new StockfishProcess(binPath) : new StockfishWasm()
    )
    await Promise.all(engines.map(e => e.init()))

    const buckets: { gdid: number; fen: string }[][] = Array.from({ length: engineCount }, () => [])
    needsEval.forEach((item, i) => buckets[i % engineCount].push(item))

    await Promise.all(engines.map((engine, i) => evaluateWorker(engine, buckets[i])))
    engines.forEach(e => e.quit())
  }

  await logPipelineStep({ step: 8, subStep: 'a', stepName: 'Evaluate Game Endings', inputTable: 'tgd_gamesdecon', inputRecs: games.length, outputTable: 'tgd_gamesdecon', outputRecs: processed, durationMs: Date.now() - t0, forceNewRun: opts.forceNewRun })

  const remainingRes = await table_query({
    caller: 'evaluateGameEndings_remaining',
    query: `SELECT COUNT(*) AS cnt FROM tgd_gamesdecon WHERE gd_final_eval IS NULL`,
    params: [],
    table: 'tgd_gamesdecon',
    level,
    severity: 'D'
  })
  const remaining = parseInt(remainingRes[0]?.cnt ?? '0')

  await logEnd('evaluateGameEndings', 'evaluateGameEndingsRoute', `${processed} processed (${reused} reused), ${errors} errors, ${remaining} remaining`, level)
  return { processed, reused, errors, remaining }
}
