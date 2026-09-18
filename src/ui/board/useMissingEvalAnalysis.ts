'use client'

//==================================================================================================
//  1) DESCRIPTION
//    useMissingEvalAnalysis — on-demand, ephemeral Stockfish analysis for rows whose eval is
//    still unknown after the DB lookup (getFenEvalsWithFallback_shared: tgev/tmgev, then
//    tpose_positions_eval). A single batch trigger (analyzeMissing) runs the engine
//    sequentially over whatever's left, one resulting FEN at a time.
//
//    Parameters:
//      rows — the panel's rows still lacking a DB-sourced eval, as { key, fen }[]. The caller
//             recomputes this whenever the underlying move list/position changes.
//
//    Returns:
//      overrides    — Record<key, { cp, depth }> for every row resolved via evalSessionCache or
//                     a completed analysis this session
//      missingCount — rows with neither a cache hit nor an override yet
//      analyzing    — true while a batch run is in progress
//      progress     — { done, total } while analyzing, else null
//      analyzeMissing — starts a batch run over whatever's currently missing
//
//  2) NOTES
//    Never calls persistAnalysisLines/upgradePositionEvaluation_shared — no DB write, so this
//    can't create a tpos_positions row or interact with purgeStaleReachOnePositions. Results
//    live only in evalSessionCache (in-memory, keyed by FEN, survives route navigation, cleared
//    on refresh) — see that module's header for why.
//==================================================================================================

import { useEffect, useRef, useState } from 'react'
import { StockfishEngine, STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'
import { getCachedEval, setCachedEval } from '@/src/lib/analysis/evalSessionCache'

export interface MissingEvalRow {
  key: string
  fen: string
}

export function useMissingEvalAnalysis(rows: MissingEvalRow[]) {
  const [overrides, setOverrides] = useState<Record<string, { cp: number; depth: number }>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const engineRef = useRef<StockfishEngine | null>(null)

  useEffect(() => {
    const fromCache: Record<string, { cp: number; depth: number }> = {}
    for (const r of rows) {
      const cached = getCachedEval(r.fen)
      if (cached) fromCache[r.key] = cached
    }
    setOverrides(fromCache)
    //
    //  rows is a fresh array every render from the caller's .map(); compare by its actual
    //  contents (keys+fens) so this doesn't re-run on every render of the parent panel
    //
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => r.key + ':' + r.fen).join(',')])

  const missingCount = rows.filter(r => !overrides[r.key]).length

  async function analyzeMissing() {
    const missing = rows.filter(r => !overrides[r.key])
    if (missing.length === 0) return

    let engine = engineRef.current
    if (!engine) {
      engine = new StockfishEngine()
      engineRef.current = engine
      await engine.init()
    }

    setAnalyzing(true)
    setProgress({ done: 0, total: missing.length })

    for (let i = 0; i < missing.length; i++) {
      const { key, fen } = missing[i]
      const depth = STOCKFISH_DEFAULTS.deepAnalysisDepth
      const cp = await analyzeSingleFen(engine, fen, depth)
      if (cp != null) {
        setCachedEval(fen, { cp, depth })
        setOverrides(prev => ({ ...prev, [key]: { cp, depth } }))
      }
      setProgress({ done: i + 1, total: missing.length })
    }

    setAnalyzing(false)
    setProgress(null)
  }

  return { overrides, missingCount, analyzing, progress, analyzeMissing }
}

//----------------------------------------------------------------------------------
//  analyzeSingleFen — runs a single-line Stockfish search to maxDepth and resolves with the
//  final cp (already white's-perspective, per StockfishEngine.startInfiniteAnalysis), or null
//  if the engine never reported a line
//----------------------------------------------------------------------------------
function analyzeSingleFen(engine: StockfishEngine, fen: string, maxDepth: number): Promise<number | null> {
  const result = new Promise<number | null>(resolve => {
    let bestCp: number | null = null
    engine.startInfiniteAnalysis(
      fen,
      1,
      maxDepth,
      update => { bestCp = update.lines[0]?.cp ?? bestCp },
      () => resolve(bestCp)
    )
  })
  return result
}
