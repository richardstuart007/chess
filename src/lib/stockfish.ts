import { Chess } from 'chess.js'
import { MultiPvResult } from './analysisTree'
import { truncateFen } from './fen'
import {
  STOCKFISH_DEPTH,
  STOCKFISH_REANALYZE_DEFAULT_DEPTH,
  STOCKFISH_BLUNDER_CP,
  STOCKFISH_MISTAKE_CP,
  STOCKFISH_INACCURACY_CP,
  STOCKFISH_HASH,
  STOCKFISH_BESTLINE_LENGTH,
  STOCKFISH_DEEP_ANALYSIS_DEPTH,
  STOCKFISH_DEEP_ANALYSIS_MULTIPV
} from './constants'

export interface PlyEvaluation {
  san: string
  fen: string
  fenBefore: string
  cp: number
  cpBefore: number
  bestMove: string
  bestMoveSan: string
  bestLineSans: string[]
  cpLoss: number
  cpChange: number
  classification: 'blunder' | 'mistake' | 'inaccuracy' | 'good'
  depth: number
}

export interface AnalysisProgress {
  current: number
  total: number
  move?: string
}

type ProgressCallback = (progress: AnalysisProgress) => void

export interface InfiniteAnalysisUpdate {
  depth: number
  lines: MultiPvResult[]
  nodes: number
  nps: number
  timeMs: number
}

export const STOCKFISH_DEFAULTS = {
  depth: STOCKFISH_DEPTH,
  reanalyzeDepth: STOCKFISH_REANALYZE_DEFAULT_DEPTH,
  blunderCp: STOCKFISH_BLUNDER_CP,
  mistakeCp: STOCKFISH_MISTAKE_CP,
  inaccuracyCp: STOCKFISH_INACCURACY_CP,
  hash: STOCKFISH_HASH,
  bestLineLength: STOCKFISH_BESTLINE_LENGTH,
  deepAnalysisDepth: STOCKFISH_DEEP_ANALYSIS_DEPTH,
  deepAnalysisMultiPv: STOCKFISH_DEEP_ANALYSIS_MULTIPV
}

export function classifyMove(cpLoss: number): PlyEvaluation['classification'] {
  if (cpLoss > STOCKFISH_DEFAULTS.blunderCp) return 'blunder'
  if (cpLoss > STOCKFISH_DEFAULTS.mistakeCp) return 'mistake'
  if (cpLoss > STOCKFISH_DEFAULTS.inaccuracyCp) return 'inaccuracy'
  return 'good'
}

//
//  Board square highlight colors for a move's classification, shared by every interactive
//  board view (ChessBoardView_shared, MasterGameView_master) — 'good' is deliberately absent,
//  since a good move gets no highlight at all.
//
export const CLASSIFICATION_SQUARE_COLORS: Record<string, string> = {
  blunder: 'rgba(239, 68, 68, 0.6)',
  mistake: 'rgba(249, 115, 22, 0.6)',
  inaccuracy: 'rgba(234, 179, 8, 0.5)'
}

function uciToSan(fen: string, uciMove: string): string {
  try {
    const g = new Chess(fen)
    const from = uciMove.slice(0, 2)
    const to = uciMove.slice(2, 4)
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined
    const result = g.move({ from, to, promotion })
    return result ? result.san : uciMove
  } catch {
    return uciMove
  }
}

function uciLineToSans(fen: string, uciMoves: string[]): string[] {
  const sans: string[] = []
  try {
    const g = new Chess(fen)
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promotion = uci.length > 4 ? uci[4] : undefined
      const result = g.move({ from, to, promotion })
      if (!result) break
      sans.push(result.san)
    }
  } catch {
    // partial conversion is fine
  }
  return sans
}

export class StockfishEngine {
  private worker: Worker | null = null
  private ready = false
  private resolveReady: (() => void) | null = null

  async init(): Promise<void> {
    if (this.ready) return

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js')

        this.resolveReady = resolve

        this.worker.onmessage = (e: MessageEvent) => {
          const line = typeof e.data === 'string' ? e.data : e.data?.toString?.() ?? ''
          if (line === 'uciok') {
            this.send(`setoption name Hash value ${STOCKFISH_DEFAULTS.hash}`)
            this.send('isready')
          } else if (line === 'readyok') {
            this.ready = true
            if (this.resolveReady) {
              this.resolveReady()
              this.resolveReady = null
            }
          }
        }

        this.worker.onerror = (err) => {
          reject(new Error(`Stockfish worker failed to load: ${err.message}`))
        }

        this.send('uci')
      } catch (err) {
        reject(err)
      }
    })
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd)
  }

  private infiniteHandler: ((e: MessageEvent) => void) | null = null

  /**
   * Start deep analysis on a position. Calls onUpdate with live results as
   * the engine searches deeper. Stops automatically once maxDepth is reached,
   * or earlier if stopAnalysis() is called. Either way, onComplete fires once
   * the engine's bestmove arrives.
   */
  startInfiniteAnalysis(
    fen: string,
    numLines: number,
    maxDepth: number,
    onUpdate: (result: InfiniteAnalysisUpdate) => void,
    onComplete?: () => void
  ): void {
    if (!this.worker || !this.ready) return

    // Remove any previous handler
    if (this.infiniteHandler) {
      this.worker.removeEventListener('message', this.infiniteHandler)
      this.infiniteHandler = null
    }

    const isBlackToMove = fen.split(' ')[1] === 'b'
    const stockResultsByRank = new Map<number, { cp: number; pv: string; depth: number }>()
    let stockMaxDepth = 0

    this.infiniteHandler = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : ''

      if (line.startsWith('info') && line.includes('score')) {
        const depthMatch = line.match(/depth (\d+)/)
        const multipvMatch = line.match(/multipv (\d+)/)
        const cpMatch = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)
        const pvMatch = line.match(/ pv (.+)/)
        const nodesMatch = line.match(/nodes (\d+)/)
        const npsMatch = line.match(/nps (\d+)/)
        const timeMatch = line.match(/ time (\d+)/)

        const depth = depthMatch ? parseInt(depthMatch[1]) : 0
        const rank = multipvMatch ? parseInt(multipvMatch[1]) : 1

        if (depth >= 4) {
          let stockCp = 0
          if (cpMatch) stockCp = parseInt(cpMatch[1])
          else if (mateMatch) {
            const mateIn = parseInt(mateMatch[1])
            stockCp = mateIn > 0 ? 10000 - mateIn : -10000 + Math.abs(mateIn)
          }
          const stockPv = pvMatch ? pvMatch[1] : ''

          const existing = stockResultsByRank.get(rank)
          if (!existing || depth > existing.depth) {
            stockResultsByRank.set(rank, { cp: stockCp, pv: stockPv, depth })
          }

          if (depth > stockMaxDepth) {
            stockMaxDepth = depth
          }

          // Build update with all current best lines
          const lines: MultiPvResult[] = []
          for (const [r, data] of stockResultsByRank.entries()) {
            const uciMoves = data.pv ? data.pv.split(' ') : []
            const sans = uciLineToSans(fen, uciMoves)
            lines.push({
              rank: r,
              cp: isBlackToMove ? -data.cp : data.cp,
              bestMoveUci: uciMoves[0] || '',
              bestMoveSan: sans[0] || '',
              lineSans: sans,
              lineUci: uciMoves
            })
          }
          lines.sort((a, b) => a.rank - b.rank)

          onUpdate({
            depth: stockMaxDepth,
            lines,
            nodes: nodesMatch ? parseInt(nodesMatch[1]) : 0,
            nps: npsMatch ? parseInt(npsMatch[1]) : 0,
            timeMs: timeMatch ? parseInt(timeMatch[1]) : 0
          })
        }
      }

      if (line.startsWith('bestmove')) {
        // Engine stopped, either manually or by reaching maxDepth
        if (this.infiniteHandler) {
          this.worker!.removeEventListener('message', this.infiniteHandler)
          this.infiniteHandler = null
        }
        onComplete?.()
      }
    }

    this.worker.addEventListener('message', this.infiniteHandler)
    this.send(`setoption name MultiPV value ${numLines}`)
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${maxDepth}`)
  }

  /**
   * Stop infinite analysis
   */
  stopAnalysis(): void {
    if (this.infiniteHandler) {
      this.send('stop')
    }
  }

  async evaluate(fen: string, depth: number = STOCKFISH_DEFAULTS.depth): Promise<{ cp: number; bestMove: string; pv: string }> {
    if (!this.worker || !this.ready) throw new Error('Stockfish not initialized')

    return new Promise((resolve) => {
      let stockBestCp = 0
      let stockBestMove = ''
      let stockBestPv = ''

      const handler = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : ''

        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/depth (\d+)/)
          const multipvMatch = line.match(/multipv (\d+)/)
          const cpMatch = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch = line.match(/ pv (.+)/)
          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0
          // multipv is only reported when MultiPV > 1 — absent means rank 1 by definition.
          // A leftover MultiPV setting from a prior startInfiniteAnalysis() call on this same
          // engine instance would otherwise let a later info line's score cp overwrite stockBestCp
          // with a worse (non-rank-1) line's value — this filter guards against that regardless
          // of whether the explicit reset below actually took effect.
          const rank = multipvMatch ? parseInt(multipvMatch[1]) : 1

          if (rank === 1 && currentDepth >= depth - 2) {
            if (cpMatch) {
              stockBestCp = parseInt(cpMatch[1])
            } else if (mateMatch) {
              const mateIn = parseInt(mateMatch[1])
              stockBestCp = mateIn > 0 ? 10000 - mateIn : -10000 + Math.abs(mateIn)
            }
            if (pvMatch) {
              stockBestPv = pvMatch[1]
              stockBestMove = stockBestPv.split(' ')[0]
            }
          }
        }

        if (line.startsWith('bestmove')) {
          this.worker!.removeEventListener('message', handler)
          const bm = line.split(' ')[1]
          if (bm && bm !== '(none)') stockBestMove = bm
          resolve({ cp: stockBestCp, bestMove: stockBestMove, pv: stockBestPv })
        }
      }

      this.worker!.addEventListener('message', handler)
      // Explicit reset — a prior startInfiniteAnalysis() call on this same engine instance may
      // have left MultiPV set above 1, which this single-line evaluate() must never inherit.
      this.send('setoption name MultiPV value 1')
      this.send('ucinewgame')
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
    })
  }

  // Deliberately does NOT require the engine to already be initialized (unlike
  // evaluate()/startInfiniteAnalysis()) — init() is only called lazily below, right
  // before the first position that actually needs a real Stockfish call. A re-analysis
  // range that turns out to be fully covered by poseEvals never touches init() at
  // all, avoiding real Worker/WASM startup cost for a run that ends up needing no
  // engine work whatsoever.
  async analyzeGame(
    fens: string[],
    sans: string[],
    onProgress?: ProgressCallback,
    depth?: number,
    poseEvals?: Record<string, { cp: number; bestMove: string | null; depth: number }>,
    onPlyEvaluated?: (plyEval: PlyEvaluation, index: number) => void
  ): Promise<{ plyEvals: PlyEvaluation[]; finalPosition: { fen: string; cp: number; bestMove: string } }> {
    const plyEvals: PlyEvaluation[] = []
    const analysisDepth = depth ?? STOCKFISH_DEFAULTS.depth

    // Evaluate every position ONCE (N+1 positions for N moves) — this eliminates
    // oscillation from evaluating the same position twice. Each ply's PlyEvaluation is
    // built as soon as both its surrounding position evals are known (right after the
    // "after" position finishes), not in a separate pass once every position is done —
    // lets onPlyEvaluated fire live, ply by ply, instead of only once at the very end.
    const mergedPlyPositionEvals: { cp: number; bestMove: string; pv: string; depth: number }[] = []

    for (let i = 0; i <= sans.length; i++) {
      onProgress?.({ current: i, total: sans.length, move: i > 0 ? sans[i - 1] : 'starting position' })

      // tpose_positions_eval already stores cp from White's perspective (same convention
      // upgradePositionEvaluation's every caller uses) — no perspective flip needed
      // for a pose cache hit, unlike a fresh engine result below. No pv is cached (the
      // table only stores a single best move, not a full line), so a cached position
      // contributes no bestLineSans for its ply.
      const poseEval = poseEvals?.[truncateFen(fens[i])]
      if (poseEval && poseEval.depth >= analysisDepth) {
        console.log(`[analyzeGame] position ${i}: POSE CACHE HIT (cached depth ${poseEval.depth} >= requested ${analysisDepth})`)
        mergedPlyPositionEvals.push({
          cp: poseEval.cp,
          bestMove: poseEval.bestMove ?? '',
          pv: '',
          depth: poseEval.depth
        })
      } else {
        console.log(`[analyzeGame] position ${i}: CALLING STOCKFISH (poseEval=${poseEval ? `depth ${poseEval.depth}` : 'none'}, requested ${analysisDepth})`)
        const tEvalStart = performance.now()
        if (!this.ready) await this.init()
        const stockResult = await this.evaluate(fens[i], analysisDepth)
        console.log(`[analyzeGame] position ${i}: evaluate() took ${(performance.now() - tEvalStart).toFixed(0)}ms`)

        // Normalize to white's perspective
        // Even positions (0, 2, 4...) = white to move → engine cp is from white's view
        // Odd positions (1, 3, 5...) = black to move → negate to get white's view
        const isWhiteToMove = i % 2 === 0
        const cpWhitePerspective = isWhiteToMove ? stockResult.cp : -stockResult.cp

        mergedPlyPositionEvals.push({
          cp: cpWhitePerspective,
          bestMove: stockResult.bestMove,
          pv: stockResult.pv,
          depth: analysisDepth
        })
      }

      if (i === 0) continue

      const idx = i - 1
      const fenBefore = fens[idx]
      const fenAfter = fens[i]
      const isWhiteMove = idx % 2 === 0

      const cpBefore = mergedPlyPositionEvals[idx].cp  // eval before this move (white's perspective)
      const cpAfter = mergedPlyPositionEvals[i].cp     // eval after this move (white's perspective)

      // cpChange from the mover's own perspective — positive = good for the mover,
      // negative = bad for the mover (matches tgam_game_positions.gam_cp_change's convention)
      const cpChange = isWhiteMove
        ? cpAfter - cpBefore
        : cpBefore - cpAfter

      // cpLoss is just the "how bad was this move" magnitude — never negative
      const cpLoss = Math.max(0, -cpChange)

      // Best move from the position before (engine's recommendation)
      const beforeEval = mergedPlyPositionEvals[idx]
      const bestMoveSan = beforeEval.bestMove
        ? uciToSan(fenBefore, beforeEval.bestMove)
        : ''

      const pvMoves = beforeEval.pv ? beforeEval.pv.split(' ').slice(0, STOCKFISH_DEFAULTS.bestLineLength) : []
      const bestLineSans = pvMoves.length > 0
        ? uciLineToSans(fenBefore, pvMoves)
        : []

      const plyEval: PlyEvaluation = {
        san: sans[idx],
        fen: fenAfter,
        fenBefore,
        cp: cpAfter,
        cpBefore,
        bestMove: beforeEval.bestMove,
        bestMoveSan,
        bestLineSans,
        cpLoss,
        cpChange,
        classification: classifyMove(cpLoss),
        // The weaker of this ply's two constituent position depths — a cached hit can be
        // deeper than the requested depth, but never treat a ply as deeper than its
        // shallower side actually was
        depth: Math.min(mergedPlyPositionEvals[idx].depth, mergedPlyPositionEvals[i].depth)
      }
      plyEvals.push(plyEval)
      onPlyEvaluated?.(plyEval, idx)
    }

    const lastPositionEval = mergedPlyPositionEvals[mergedPlyPositionEvals.length - 1]
    const finalPosition = {
      fen: fens[fens.length - 1],
      cp: lastPositionEval.cp,
      bestMove: lastPositionEval.bestMove
    }

    return { plyEvals, finalPosition }
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }
}
