'use client'

import { useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { HABITS_BOARD_SIZE_PX } from '@/src/lib/constants'

interface MiniBoardProps {
  fen: string
  color: string | null
  size?: string
}

//----------------------------------------------------------------------------------------------
//  MiniBoard — memoizes the Chessboard options object; react-chessboard's internal
//  animation effect restarts on every render if given a fresh object each time,
//  which caused a "Maximum update depth exceeded" loop across a table of boards
//----------------------------------------------------------------------------------------------
export default function MiniBoard({ fen, color, size = HABITS_BOARD_SIZE_PX }: MiniBoardProps) {
  const options = useMemo(() => ({
    position: fen,
    boardStyle: { width: size, height: size },
    allowDragging: false,
    showAnimations: false,
    boardOrientation: color === 'b' ? 'black' as const : 'white' as const
  }), [fen, color, size])

  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <Chessboard options={options} />
    </div>
  )
}
