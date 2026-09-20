'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MiniBoard — a small, non-interactive chessboard showing one position.
//
//    Parameters:
//      fen   — the position to show
//      color — 'b' shows the board from Black's side; anything else (or null) from White's
//      size  — board width/height (default HABITS_BOARD_SIZE_PX)
//
//    Returns:
//      the board, fixed at size x size
//
//  2) NOTES
//    Memoizes the Chessboard options object; react-chessboard's internal animation effect
//    restarts on every render if given a fresh object each time, which caused a "Maximum
//    update depth exceeded" loop across a table of boards.
//==================================================================================================

import { useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { HABITS_BOARD_SIZE_PX } from '@/src/lib/constants'

interface MiniBoardProps {
  fen: string
  color: string | null
  size?: string
}

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
