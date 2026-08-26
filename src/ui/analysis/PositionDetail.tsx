'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PositionDetail — full detail page for one FEN position: board, best move, and two tabs
//    (your recurring moves from here, and the full game history of when it was reached).
//    Clicking a move in the "Your Moves" tab filters "Game History" to just that move.
//
//    Parameters:
//      position  — the position row, or null if not found
//      moves     — this position's recurring-move breakdown
//      posEval   — Stockfish evaluation for this position, if any
//      gameCount — total games that reached this position
//      games     — every game hit for this position (move played, result, date, game id)
//==================================================================================================

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Chess } from 'chess.js'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import { useTabQueryState } from 'nextjs-shared/useTabQueryState'
import MyBox from 'nextjs-shared/MyBox'
import AppTab from '@/src/ui/AppTab'
import BackButton from '@/src/ui/BackButton'
import { Chessboard } from 'react-chessboard'
import type { PositionRow, EvaluationRow } from '@/src/lib/analysis/chessdb_shared'
import type { MoveRow } from '@/src/lib/analysis/chessdb_player'
import { winPct } from '@/src/lib/winPct'
import { formatCp } from '@/src/lib/formatCp'
import { pushBackTarget } from '@/src/lib/backNav'
import { POSITION_BOARD_SIZE_PX } from '@/src/lib/constants'
import { resultBadge } from '@/src/lib/resultBadge'

interface GameHit {
  player:       string
  move_played:  string
  move_num:     number | null
  playerResult: string | null
  gdid:         number | null
  date:         string | null
}

interface PositionDetailProps {
  position:  PositionRow | null
  moves:     MoveRow[]
  posEval:   EvaluationRow | null
  gameCount: number
  games:     GameHit[]
}

type Tab = 'moves' | 'history'

export default function PositionDetail({
  position,
  moves,
  posEval,
  gameCount,
  games
}: PositionDetailProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tab,          setTab]          = useTabQueryState('tab', 'moves')
  const [selectedMove, setSelectedMove] = useTabQueryState('move', '')

  if (!position) {
    return <div className="text-center py-12 text-gray-500">Position not found.</div>
  }

  const orientation  = position.pos_color === 'b' ? 'black' : 'white'
  const playerName   = games[0]?.player ?? null
  const playerColor  = position.pos_color === 'b' ? 'Black' : 'White'
  const positionCp   = posEval?.pose_cp ?? null

  // Convert best move UCI → SAN
  const chess = new Chess(position.pos_fen)
  const bm = posEval?.pose_best_move ?? null
  const tryMove = bm
    ? chess.move({ from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] ?? undefined })
    : null
  const bestMoveSan = tryMove?.san ?? bm ?? null

  // Build arrow overlays: green=best, red=habit (skip red if same squares as best)
  const customArrows: { startSquare: string; endSquare: string; color: string }[] = []
  const bestFrom = bm?.slice(0, 2) ?? ''
  const bestTo   = bm?.slice(2, 4) ?? ''
  if (bm && bm.length >= 4) {
    customArrows.push({ startSquare: bestFrom, endSquare: bestTo, color: 'green' })
  }
  const habitMov = moves[0]
  if (habitMov?.move_uci && habitMov.move_uci.length >= 4) {
    const hFrom = habitMov.move_uci.slice(0, 2)
    const hTo   = habitMov.move_uci.slice(2, 4)
    if (hFrom !== bestFrom || hTo !== bestTo) {
      customArrows.push({ startSquare: hFrom, endSquare: hTo, color: 'red' })
    }
  }

  const totalTimes = moves.reduce((s, m) => s + m.mov_times, 0)

  const filteredGames = selectedMove
    ? games.filter(g => g.move_played === selectedMove)
    : games

  const TABS: { key: Tab; label: string }[] = [
    { key: 'moves',   label: 'Your Moves' },
    { key: 'history', label: 'Game History' }
  ]

  return (
    <div className="max-w-5xl p-4 space-y-3">
      <MyBox>
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <MyBackHomeNav />
            <BackButton fallback="/habits" />
          </div>
        </div>
      </MyBox>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: board */}
        <div className="space-y-2">
          <Chessboard
            options={{
              position: position.pos_fen,
              boardStyle: { width: POSITION_BOARD_SIZE_PX, height: POSITION_BOARD_SIZE_PX },
              allowDragging: false,
              boardOrientation: orientation,
              arrows: customArrows
            }}
          />
          <div className="mt-2 border rounded-md divide-y text-sm">
            {playerName && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-gray-500">Player</span>
                <span className="font-medium">
                  {playerName}{' '}
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                    position.pos_color === 'b'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}>{playerColor}</span>
                </span>
              </div>
            )}
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">To move</span>
              <span className="font-medium">{playerColor}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Position Eval</span>
              <span className={`font-mono font-medium ${positionCp != null && positionCp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {positionCp != null ? formatCp(positionCp) : '—'}
              </span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Games</span>
              <span className="font-medium">{gameCount}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Best move</span>
              <span className="font-mono font-medium">
                {bestMoveSan ?? '—'}
                {positionCp != null && (
                  <span className="ml-1 text-gray-400 text-xs">({formatCp(positionCp)})</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div className="space-y-3">
          <div className="flex border-b">
            {TABS.map(t => (
              <AppTab
                key={t.key}
                active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </AppTab>
            ))}
          </div>

          {/* Tab: Your Moves */}
          {tab === 'moves' && (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-400 mb-1">Click a move to filter Game History</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase text-left border-b">
                    <th className="py-1.5 pr-3">Move</th>
                    <th className="py-1.5 pr-3 text-right">Times</th>
                    <th className="py-1.5 pr-3 text-right">Win%</th>
                    <th className="py-1.5 text-right">Eval</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {moves.map(m => {
                    const wp      = winPct(m.mov_wins, m.mov_losses, m.mov_times)
                    const isSelected = selectedMove === m.move_played
                    return (
                      <tr
                        key={m.move_played}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => {
                          setSelectedMove(isSelected ? '' : m.move_played)
                          setTab('history')
                        }}
                      >
                        <td className="py-1.5 pr-3 font-mono font-medium">{m.move_played}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {m.mov_times}
                          <span className="text-gray-400 text-xs ml-1">
                            ({totalTimes > 0 ? Math.round((m.mov_times / totalTimes) * 100) : 0}%)
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-green-700">{wp}%</td>
                        <td className={`py-1.5 text-right tabular-nums font-mono ${m.pose_cp != null && m.pose_cp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {m.pose_cp != null ? formatCp(m.pose_cp) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Game History */}
          {tab === 'history' && (
            <div className="overflow-x-auto">
              {selectedMove && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Filtered: {selectedMove}
                  </span>
                  <MyButton
                    onClick={() => setSelectedMove('')}
                    overrideClass="text-xs text-gray-400 hover:text-gray-600"
                  >
                    × clear
                  </MyButton>
                </div>
              )}
              {filteredGames.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No games recorded for this position.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase text-left border-b">
                      <th className="py-1.5 pr-3">Date</th>
                      <th className="py-1.5 pr-3">Game ID</th>
                      <th className="py-1.5 pr-3">Move</th>
                      <th className="py-1.5 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredGames.map((g, i) => {
                      const rb       = resultBadge(g.playerResult)
                      const canClick = g.gdid != null
                      return (
                        <tr
                          key={i}
                          className={canClick ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}
                          onClick={() => {
                            if (!canClick) return
                            const qs = searchParams.toString()
                            pushBackTarget(qs ? `${pathname}?${qs}` : pathname)
                            router.push(`/analyze?game=${g.gdid}&player=${g.player}`)
                          }}
                        >
                          <td className="py-1.5 pr-3 whitespace-nowrap text-xs text-gray-500">
                            {g.date ?? '—'}
                          </td>
                          <td className="py-1.5 pr-3 tabular-nums text-xs text-gray-500">
                            {g.gdid ?? '—'}
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{g.move_played}</td>
                          <td className="py-1.5 text-center">
                            <span className={rb.cls}>{rb.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
