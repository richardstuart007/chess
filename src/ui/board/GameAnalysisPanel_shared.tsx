'use client'

//==================================================================================================
//  1) DESCRIPTION
//    GameAnalysisPanel_shared — shared "Game Analysis" panel (badges, depth control, move-range
//    re-analysis selector, progress display, result/error messaging) used by both the tracked-
//    player analysis view (ChessBoardView_shared) and the master-game analysis view
//    (MasterGameView_master). Extracted from two near-identical, independently-drifted copies of
//    the same JSX.
//
//    Parameters:
//      variant                — 'player' | 'master'; accepted for future intentional divergence,
//                                not currently branched on in render (every feature below is
//                                shown identically for both variants, by explicit agreement)
//      plyEvals                — per-ply evaluations; drives the blunder/mistake/inaccuracy badges
//                                and the Analyze/Re-analyse button label
//      analyzing               — whether an analysis run is currently in progress
//      analysisProgress        — { current, total, move?, moveNumber?, isWhite? } for the
//                                progress bar; moveNumber/isWhite (absolute, whole-game) drive the
//                                "Move Nw"/"Move Nb" prefix, omitted while still on the anchor
//                                position (current === 0)
//      depth / onDepthChange   — the DepthInput_shared control
//      existingDepthRange      — "Saved at depth: N" text for the current From/To range, or null
//      fromMove / toMove / totalFullMoves — re-analyze move range (full move numbers)
//      onFromMoveChange / onToMoveChange  — range change handlers
//      onRunAnalysis           — button handler (Analyze Game / Re-analyse)
//      onStopAnalysis          — Stop button handler, shown next to the progress bar while
//                                analyzing is true; requests the in-progress run stop after
//                                whatever ply is currently in flight
//      analysisResultMessage   — post-run summary text (e.g. "Updated 12 plies")
//      analysisError           — error text; shows a Retry button when non-empty
//      disableRun              — disables the Analyze Game/Re-analyse button, with a hint,
//                                when some other Stockfish run (e.g. Analyze Position) already
//                                owns this view's shared engine (default false)
//
//  3) CHANGE HISTORY
//    2026-09-15 — added disableRun — Analyze Game and Analyze Position share one
//                 StockfishEngine/Worker instance with no mutual exclusion; running both at once
//                 left two message listeners fighting over the same worker's info/bestmove lines,
//                 so the awaited analysis promise never resolved and "analyzing" got stuck true
//    2026-09-15 — added onStopAnalysis — a long Analyze Game/Re-analyse run had no way to stop
//                 early even when the user was already happy with the progress so far
//    2026-09-15 — progress line now leads with "Move Nw"/"Move Nb" (absolute move number + side
//                 to move), ahead of the existing "Ply X/Y — move" text
//==================================================================================================

import { useRef } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInputNumeric } from 'nextjs-shared/MyInputNumeric'
import { PlyEvaluation } from '@/src/lib/stockfish'
import DepthInput_shared from './DepthInput_shared'

export interface GameAnalysisPanelProps {
  variant: 'player' | 'master'
  plyEvals: (PlyEvaluation | undefined)[]
  analyzing: boolean
  analysisProgress: { current: number; total: number; move?: string; moveNumber?: number; isWhite?: boolean }
  depth: number
  onDepthChange: (depth: number) => void
  existingDepthRange: string | null
  fromMove: number
  toMove: number
  totalFullMoves: number
  onFromMoveChange: (value: number) => void
  onToMoveChange: (value: number) => void
  onRunAnalysis: () => void
  onStopAnalysis: () => void
  analysisResultMessage: string
  analysisError: string
  disableRun?: boolean
}

export default function GameAnalysisPanel_shared({
  variant,
  plyEvals,
  analyzing,
  analysisProgress,
  depth,
  onDepthChange,
  existingDepthRange,
  fromMove,
  toMove,
  totalFullMoves,
  onFromMoveChange,
  onToMoveChange,
  onRunAnalysis,
  onStopAnalysis,
  analysisResultMessage,
  analysisError,
  disableRun = false
}: GameAnalysisPanelProps) {
  const fromMoveLatestRef = useRef(fromMove)
  const blunders = plyEvals.filter(e => e?.classification === 'blunder').length
  const mistakes = plyEvals.filter(e => e?.classification === 'mistake').length
  const inaccuracies = plyEvals.filter(e => e?.classification === 'inaccuracy').length

  return (
    <div data-variant={variant}>
      <MyBox title='Game Analysis'>
        <div className='space-y-2'>
          {/* Summary */}
          <div className='flex items-center justify-between'>
            {plyEvals.length > 0 ? (
              <div className='flex gap-2 text-xs'>
                <span className='rounded bg-red-500 px-2 py-0.5 text-white'>{blunders} blunders</span>
                <span className='rounded bg-orange-500 px-2 py-0.5 text-white'>{mistakes} mistakes</span>
                <span className='rounded bg-yellow-400 px-2 py-0.5 text-black'>{inaccuracies} inaccuracies</span>
              </div>
            ) : (
              <span className='text-xs text-gray-400'>No analysis yet</span>
            )}
          </div>

          {/* Settings */}
          <div className='flex items-center gap-4 border-t border-gray-200 pt-2'>
            <DepthInput_shared value={depth} onChange={onDepthChange} />
            {existingDepthRange && (
              <span className='text-xxs text-gray-500'>Saved at depth: {existingDepthRange}</span>
            )}
          </div>
          {plyEvals.length > 0 && (
            <div className='flex items-center gap-4'>
              <div className='flex items-center gap-2'>
                <span className='font-bold text-xs whitespace-nowrap'>From move</span>
                <MyInputNumeric
                  integerOnly
                  clampOnBlur
                  min={1}
                  max={totalFullMoves}
                  value={Number.isNaN(fromMove) ? '' : fromMove}
                  onChange={v => {
                    const next = v === null ? NaN : v
                    fromMoveLatestRef.current = next
                    onFromMoveChange(next)
                  }}
                  onBlur={() => {
                    let finalValue = fromMoveLatestRef.current
                    if (Number.isNaN(finalValue)) {
                      finalValue = 1
                      onFromMoveChange(1)
                    }
                    if (finalValue > toMove) onToMoveChange(finalValue)
                  }}
                  overrideClass='w-16 h-6 md:h-6'
                />
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-bold text-xs whitespace-nowrap'>To move</span>
                <MyInputNumeric
                  integerOnly
                  min={1}
                  max={totalFullMoves}
                  value={Number.isNaN(toMove) ? '' : toMove}
                  onChange={v => onToMoveChange(v === null ? NaN : v)}
                  onBlur={() => {
                    const raw = Number.isNaN(toMove) ? totalFullMoves : toMove
                    const from = Number.isNaN(fromMove) ? 1 : fromMove
                    onToMoveChange(Math.max(from, Math.min(raw, totalFullMoves)))
                  }}
                  overrideClass='w-16 h-6 md:h-6'
                />
              </div>
            </div>
          )}
          {!analyzing && (
            <div className='space-y-1'>
              <MyButton onClick={onRunAnalysis} disabled={disableRun} overrideClass='w-full'>
                {plyEvals.length > 0 ? 'Re-analyse' : 'Analyze Game'}
              </MyButton>
              {disableRun && (
                <p className='text-xxs text-gray-400'>Stockfish busy — finish or stop the current analysis first.</p>
              )}
            </div>
          )}
          {analysisResultMessage && (
            <span className='text-xxs text-green-600 font-bold'>{analysisResultMessage}</span>
          )}

          {/* Progress */}
          {analyzing && (
            <MyBox title='Analyzing...'>
              <div className='space-y-2'>
                <div className='h-2 w-full overflow-hidden rounded bg-gray-200'>
                  <div
                    className='h-full bg-blue-500 transition-all duration-200'
                    style={{
                      width: `${analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0}%`
                    }}
                  />
                </div>
                <p className='text-xs text-gray-600'>
                  {analysisProgress.moveNumber != null &&
                    `Move ${analysisProgress.moveNumber}${analysisProgress.isWhite ? 'w' : 'b'} — `}
                  Ply {analysisProgress.current} / {analysisProgress.total}
                  {analysisProgress.move && ` — ${analysisProgress.move}`}
                </p>
                <MyButton onClick={onStopAnalysis} overrideClass='w-full bg-red-500 hover:bg-red-600'>
                  Stop
                </MyButton>
              </div>
            </MyBox>
          )}

          {analysisError && (
            <div>
              <p className='text-xs text-red-600'>{analysisError}</p>
              <MyButton onClick={onRunAnalysis} overrideClass='mt-2'>Retry</MyButton>
            </div>
          )}
        </div>
      </MyBox>
    </div>
  )
}
