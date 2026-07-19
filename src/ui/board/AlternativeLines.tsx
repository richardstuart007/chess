'use client'

import { useState } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MultiPvResult } from '@/src/lib/analysisTree'
import { getMovePlayCount } from '@/src/lib/analysis/chessdb'

interface AlternativeLinesProps {
  results: MultiPvResult[]
  loading: boolean
  positionPly: number
  onSelectLine: (line: MultiPvResult) => void
  positionFen?: string
  username: string
}

function formatCp(cp: number): string {
  if (Math.abs(cp) >= 10000) {
    return cp > 0 ? `M${10000 - cp}` : `-M${10000 + cp}`
  }
  const val = (cp / 100).toFixed(1)
  return cp > 0 ? `+${val}` : val
}

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
  return parts.join(' ')
}

//----------------------------------------------------------------------------------------------
//  MoveCountCheck — manual, on-demand "how many times has this move been played from this
//  position" check, own idle/loading/result state per row
//----------------------------------------------------------------------------------------------
function MoveCountCheck({ fen, moveSan, username }: { fen?: string; moveSan: string; username: string }) {
  const [count, setCount] = useState<number | 'loading' | null>(null)

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!fen || count === 'loading') return
    setCount('loading')
    const c = await getMovePlayCount(fen, moveSan, username)
    setCount(c)
  }

  if (count === 'loading') {
    return <div className='h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />
  }

  if (count !== null) {
    return <span className='text-xxs text-gray-400 font-mono'> ({count})</span>
  }

  return (
    <button
      onClick={handleClick}
      disabled={!fen}
      title='Check how often this move has been played from this position'
      className='text-xxs text-gray-400 hover:text-gray-600 underline disabled:opacity-50'
    >
      check
    </button>
  )
}

export default function AlternativeLines({
  results,
  loading,
  positionPly,
  onSelectLine,
  positionFen,
  username
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

          return (
            <div
              key={line.rank}
              role='button'
              tabIndex={0}
              onClick={() => onSelectLine(line)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectLine(line) }}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                isActualMove
                  ? 'bg-amber-50 border border-amber-300 hover:bg-amber-100'
                  : 'hover:bg-blue-50'
              }`}
            >
              <span className='flex-shrink-0 w-4 text-gray-400 font-mono'>{line.rank}.</span>
              <span className={`flex-shrink-0 w-10 font-mono font-bold ${cpColor}`}>
                {formatCp(line.cp)}
              </span>
              <span className='flex-1'>
                <span className='font-bold'>
                  {line.bestMoveSan}
                  {isActualMove && <span className='ml-1 text-blue-500 font-normal text-xxs'>(played)</span>}
                </span>
                {line.lineSans.length > 1 && (
                  <span className='ml-1 text-gray-500'>
                    {formatLine(line.lineSans.slice(1), positionPly + 1)}
                  </span>
                )}
              </span>
              <span className='flex-shrink-0'>
                <MoveCountCheck fen={positionFen} moveSan={line.bestMoveSan} username={username} />
              </span>
            </div>
          )
        })}
      </div>
      <p className='mt-1 text-xxs text-gray-400'>Click a line to explore it on the board</p>
    </MyBox>
  )
}
