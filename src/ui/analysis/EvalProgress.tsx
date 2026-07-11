'use client'

import { useState, useRef, useCallback } from 'react'
import { StockfishEngine } from '@/src/lib/stockfish'
import { saveEvaluation, getPositionsToEvaluate } from '@/src/lib/analysis/chessdb'
import { MyButton } from 'nextjs-shared/MyButton'

// ============================================================================
// EvalProgress — runs Stockfish in browser for batch position evaluation
// ============================================================================

interface EvalProgressProps {
  positionLimit?: number
  depth?: number
  onComplete?: (processed: number) => void
}

interface ProgressState {
  running: boolean
  current: number
  total: number
  label: string
  errors: number
}

export default function EvalProgress({
  positionLimit = 100,
  depth = 16,
  onComplete
}: EvalProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({
    running: false, current: 0, total: 0, label: '', errors: 0
  })
  const engineRef = useRef<StockfishEngine | null>(null)
  const cancelRef  = useRef(false)

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  const runPositions = useCallback(async () => {
    cancelRef.current = false

    const positions = await getPositionsToEvaluate(positionLimit)
    if (!positions.length) {
      setProgress({ running: false, current: 0, total: 0, label: 'No positions to evaluate', errors: 0 })
      return
    }

    const engine = new StockfishEngine()
    engineRef.current = engine
    await engine.init()

    setProgress({ running: true, current: 0, total: positions.length, label: 'Starting…', errors: 0 })
    let errors = 0

    for (let i = 0; i < positions.length; i++) {
      if (cancelRef.current) break
      const pos = positions[i]
      setProgress(p => ({ ...p, current: i, label: `Evaluating position ${i + 1}/${positions.length}` }))

      try {
        const result = await engine.evaluate(pos.pos_fen, depth)
        await saveEvaluation({
          posId:    pos.pos_id,
          cp:       pos.pos_color === 'b' ? -result.cp : result.cp,
          bestMove: result.bestMove || null
        })
      } catch (err) {
        console.error(`EvalProgress position error ${pos.pos_fen}`, err)
        errors++
      }
    }

    engine.destroy()
    engineRef.current = null
    setProgress(p => ({ ...p, running: false, current: positions.length, label: 'Done', errors }))
    onComplete?.(positions.length - errors)
  }, [positionLimit, depth, onComplete])

  const handleStop = () => {
    cancelRef.current = true
    engineRef.current?.stopAnalysis()
    setProgress(p => ({ ...p, running: false, label: 'Stopped' }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {!progress.running ? (
          <MyButton onClick={runPositions}>
            Evaluate Positions
          </MyButton>
        ) : (
          <MyButton onClick={handleStop} overrideClass='bg-red-500 hover:bg-red-600'>
            Stop
          </MyButton>
        )}
        <span className="text-sm text-gray-600">{progress.label}</span>
      </div>

      {(progress.running || progress.current > 0) && (
        <div className="space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{progress.current} / {progress.total}</span>
            <span>{pct}%{progress.errors > 0 ? ` · ${progress.errors} errors` : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
