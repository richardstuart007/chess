'use client'

//==================================================================================================
//  1) DESCRIPTION
//    AlternativeLines_shared — Stockfish multi-PV engine lines panel; clicking a line explores it
//    on the board. Used by both tracked-player and master-game analysis.
//
//    Parameters:
//      results     — ranked engine lines to display
//      loading     — true while lines are being calculated
//      positionPly — ply number of the current position, for move-number formatting
//      onSelectLine — called with the clicked line
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'
import { MultiPvResult } from '@/src/lib/analysisTree'
import { formatCp } from '@/src/lib/formatCp'

type AlternativeLinesProps = {
  results: MultiPvResult[]
  loading: boolean
  positionPly: number
  onSelectLine: (line: MultiPvResult) => void
}

export default function AlternativeLines_shared({
  results,
  loading,
  positionPly,
  onSelectLine
}: AlternativeLinesProps) {
  if (loading) {
    return (
      <MyBox title='Engine Lines'>
        <div className='flex items-center gap-2 py-2'>
          <div className='h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />
          <span className='text-xs text-gray-500'>Calculating alternatives...</span>
        </div>
      </MyBox>
    )
  }

  if (results.length === 0) return null

  return (
    <MyBox title='Engine Lines'>
      <div className='space-y-1'>
        {results.map((line) => {
          const isActualMove = (line as any)._isActualMove === true
          const cpColor = line.cp < 0 ? 'text-red-600' : 'text-gray-900'
          const lineClass = `flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${
            isActualMove
              ? 'bg-amber-50 border border-amber-300 hover:bg-amber-100'
              : 'hover:bg-blue-50'
          }`
          const cpClass = `flex-shrink-0 w-10 font-mono font-bold ${cpColor}`
          const cpLabel = formatCp(line.cp)
          const showContinuation = line.lineSans.length > 1
          const continuationLabel = formatLine(line.lineSans.slice(1), positionPly + 1)

          return (
            <div
              key={line.rank}
              role='button'
              tabIndex={0}
              onClick={() => onSelectLine(line)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectLine(line) }}
              className={lineClass}
            >
              <span className='flex-shrink-0 w-4 text-gray-400 font-mono'>{line.rank}.</span>
              <span className={cpClass}>
                {cpLabel}
              </span>
              <span className='flex-1'>
                <span className='font-bold'>
                  {line.bestMoveSan}
                  {isActualMove && <span className='ml-1 text-blue-500 font-normal text-xxs'>(played)</span>}
                </span>
                {showContinuation && (
                  <span className='ml-1 text-gray-500'>
                    {continuationLabel}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className='mt-1 text-xxs text-gray-400'>Click a line to explore it on the board</p>
    </MyBox>
  )
}

//----------------------------------------------------------------------------------
//  formatLine — formats a continuation's SAN moves with move numbers, starting from ply
//
//  Params:
//    lineSans — the line's moves, in SAN
//    ply — the 1-indexed ply the line starts at
//
//  Returns:
//    the line as text, with move numbers (e.g. '5. Nf3 Nc6 6. Bb5'; '5... Nc6' when it starts on Black's move)
//----------------------------------------------------------------------------------
function formatLine(lineSans: string[], ply: number): string {
  const parts: string[] = []
  for (let i = 0; i < lineSans.length; i++) {
    const p = ply + i
    const moveNum = Math.floor(p / 2) + 1
    if (p % 2 === 0) {
      parts.push(`${moveNum}. ${lineSans[i]}`)
    } else {
      if (i === 0) parts.push(`${moveNum}... ${lineSans[i]}`)
      else parts.push(lineSans[i])
    }
  }
  const result = parts.join(' ')
  return result
}
