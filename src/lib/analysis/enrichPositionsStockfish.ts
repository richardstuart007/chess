'use server'

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { saveEvaluation } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { MIN_REACH_TO_KEEP } from '../constants'

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
async function countRemainingPositions(level: number = 1, dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_count',
      query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
        LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
        WHERE e.eva_evaid IS NULL
          AND p.pos_reached > ${MIN_REACH_TO_KEEP}
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
            WHERE gp.gam_pos_id = p.pos_id AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish',
      level,
      severity: 'D'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_count',
    query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE e.eva_evaid IS NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}`,
    params: [],
    functionName: 'enrichPositionsStockfish',
    level,
    severity: 'D'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

async function countEvaluatedPositions(level: number = 1, dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_countEval',
      query: `SELECT COUNT(*) AS cnt FROM teva_evaluations e
        WHERE EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
            WHERE gp.gam_pos_id = e.eva_pos_id AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish',
      level,
      severity: 'D'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_countEval',
    query:  `SELECT COUNT(*) AS cnt FROM teva_evaluations`,
    params: [],
    functionName: 'enrichPositionsStockfish',
    level,
    severity: 'D'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

async function getResultingFensToEvaluate(limit: number, level: number, dateFrom?: string, dateTo?: string): Promise<{ posId: number; fen: string; color: string | null }[]> {
  await logStart('getResultingFensToEvaluate', 'enrichPositionsStockfish', 'fetching resulting FENs to evaluate', level)
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const params: (string | number)[] = []
  let dateFilter = ''
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    params.push(fromTs, toTs)
    dateFilter = `AND EXISTS (
      SELECT 1 FROM tgd_gamesdecon d
      WHERE d.gd_gdid = gp.gam_gdid AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
    )`
  }
  if (limit > 0) params.push(limit)
  // Resulting positions now have a real tpos_positions row (created eagerly by Build
  // Position Tree), so this is a plain id-based lookup — no more FEN grouping or
  // move-number derivation needed, pos_move_num is already set at write time.
  const res = await db.query({
    caller: 'getResultingFensToEvaluate',
    query: `
      SELECT DISTINCT p.pos_id, p.pos_fen, p.pos_color
      FROM tgam_game_positions gp
      JOIN tpos_positions p ON p.pos_id = gp.gam_resulting_pos_id
      WHERE gp.gam_resulting_pos_id IS NOT NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}
        AND NOT EXISTS (
          SELECT 1 FROM teva_evaluations WHERE eva_pos_id = gp.gam_resulting_pos_id
        )
        ${dateFilter}
      ${limit > 0 ? `LIMIT $${params.length}` : ''}
    `,
    params,
    functionName: 'getResultingFensToEvaluate',
    level,
    severity: 'D'
  })
  const rows = res.rows.map((r: any) => ({ posId: Number(r.pos_id), fen: r.pos_fen as string, color: (r.pos_color ?? null) as string | null }))
  await logEnd('getResultingFensToEvaluate', 'enrichPositionsStockfish', `${rows.length} FENs found`, level)
  return rows
}

//----------------------------------------------------------------------------------
//  bulkUpdateCpLoss — computes gam_cp_change for tgam_game_positions rows still NULL
//  whose before/after positions both now have a teva_evaluations row. Scoped to NULL
//  rows only — never re-touches already-computed rows. Decoupled from
//  enrichPositionsStockfish — own pipeline step, own trigger (cron + manual).
//----------------------------------------------------------------------------------
export async function bulkUpdateCpLoss(level: number): Promise<number> {
  await logStart('bulkUpdateCpLoss', 'enrichPositionsStockfish', 'recomputing cp loss', level)
  const t0 = Date.now()
  const logId = await startPipelineLog(6, 'Update CP Change', 0)
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const res = await db.query({
    caller: 'bulkUpdateCpLoss',
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
    `,
    params: [],
    functionName: 'bulkUpdateCpLoss',
    level,
    isupdate: true,
    severity: 'D'
  })
  const rowCount = res.rowCount ?? 0
  await completePipelineLog(logId, rowCount, 0, 0, Date.now() - t0)
  await logEnd('bulkUpdateCpLoss', 'enrichPositionsStockfish', `${rowCount} tgam_game_positions rows updated`, level)
  return rowCount
}

export async function enrichPositionsStockfish(opts: {
  limit?:    number
  depth?:    number
  dateFrom?: string
  dateTo?:   string
  level?:    number
}): Promise<{ processed: number; errors: number; remaining: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''

  const depth = opts.depth ?? 16
  const limit = opts.limit ?? 50
  const level = opts.level ?? 1

  await logStart('enrichPositionsStockfish', 'analysisCronRoute', `evaluating positions at depth ${depth}`, level)

  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  // Phase 1 FENs — positions in tpos_positions not yet evaluated
  const posParams: (string | number)[] = []
  let posDatFilter = ''
  if (opts.dateFrom && opts.dateTo) {
    const fTs = Math.floor(new Date(opts.dateFrom).getTime() / 1000)
    const tTs = Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)
    posParams.push(fTs, tTs)
    posDatFilter = `AND EXISTS (
      SELECT 1 FROM tgam_game_positions gp
      JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
      WHERE gp.gam_pos_id = p.pos_id AND d.gd_end_time >= $1 AND d.gd_end_time <= $2
    )`
  }
  if (limit > 0) posParams.push(limit)
  const posRes = await db.query({
    caller: 'enrichPositionsStockfish_phase1',
    query: `
      SELECT p.pos_id, p.pos_fen, p.pos_color
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
      WHERE e.eva_evaid IS NULL
        AND p.pos_reached > ${MIN_REACH_TO_KEEP}
        ${posDatFilter}
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT $${posParams.length}` : ''}
    `,
    params: posParams,
    functionName: 'enrichPositionsStockfish',
    table: 'tpos_positions',
    level,
    severity: 'D'
  })
  const positions: Array<{ posId: number; fen: string; color: string | null }> =
    posRes.rows.map((r: any) => ({ posId: Number(r.pos_id), fen: r.pos_fen as string, color: (r.pos_color ?? null) as string | null }))

  // Phase 2 — resulting positions not yet evaluated (real tpos_positions rows already
  // exist for these, created eagerly by Build Position Tree)
  const resultingFens = await getResultingFensToEvaluate(limit, level + 1, opts.dateFrom, opts.dateTo)

  const allFensToEval: Array<{ fen: string; color: string | null; posId: number }> = [
    ...positions,
    ...resultingFens
  ]

  if (allFensToEval.length === 0) {
    await logEnd('enrichPositionsStockfish', 'analysisCronRoute', '0 processed, 0 errors, 0 remaining', level)
    return { processed: 0, errors: 0, remaining: 0 }
  }

  const [evaluatedBefore, remainingBefore] = await Promise.all([
    countEvaluatedPositions(level, opts.dateFrom, opts.dateTo),
    countRemainingPositions(level, opts.dateFrom, opts.dateTo)
  ])

  //
  //  STOCKFISH_PATH set (local dev, real binary installed) -> fast native binary.
  //  Unset (Vercel/production) -> WASM fallback, the only engine that actually runs there.
  //
  const sf: StockfishEngineBase = binPath ? new StockfishProcess(binPath) : new StockfishWasm()
  await sf.init()

  let processed = 0
  let errors    = 0
  const t0      = Date.now()
  const logId   = await startPipelineLog(4, 'Evaluate Positions', allFensToEval.length, evaluatedBefore, remainingBefore, opts.dateFrom, opts.dateTo)

  for (const item of allFensToEval) {
    try {
      const { cp: rawCp, bestMove } = await sf.evaluate(item.fen, depth)
      // Normalize to white's perspective: Stockfish reports from side-to-move perspective.
      const fenColor = item.color ?? 'w'
      const whiteCp = fenColor === 'b' ? -rawCp : rawCp
      await saveEvaluation({
        posId:    item.posId,
        cp:       whiteCp,
        bestMove: bestMove ?? null
      })
      processed++
    } catch (err) {
      console.error(`enrichPositionsStockfish: error on FEN`, err)
      await write_logging({
        lg_functionname: 'enrichPositionsStockfish',
        lg_caller: 'analysisCronRoute',
        lg_msg: `error on FEN ${item.fen}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      errors++
    }
  }

  sf.quit()

  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, evaluatedBefore + processed)
  const remaining = await countRemainingPositions(level)
  await logEnd('enrichPositionsStockfish', 'analysisCronRoute', `${processed} processed, ${errors} errors, ${remaining} remaining`, level)
  return { processed, errors, remaining }
}
