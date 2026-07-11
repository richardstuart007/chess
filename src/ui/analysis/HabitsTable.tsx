'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Chessboard } from 'react-chessboard'
import { MyHelpField } from 'nextjs-shared/MyHelpField'

interface HabitRow {
  pos_id:      number
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  move_san:    string
  move_uci:    string | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}

interface HabitsTableProps {
  rows: HabitRow[]
}

function cpClass(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp < 0) return 'text-red-600 font-semibold'
  return 'text-green-700'
}

function cpLabel(cp: number | null): string {
  if (cp === null) return '—'
  return `${cp > 0 ? '+' : ''}${cp.toFixed(2)}`
}

function pctLabel(n: number, total: number): string {
  if (total === 0) return '0.00%'
  return `${((n / total) * 100).toFixed(2)}%`
}

//----------------------------------------------------------------------------------
//  MiniBoard — memoizes the Chessboard options object; react-chessboard's internal
//  animation effect restarts on every render if given a fresh object each time,
//  which caused a "Maximum update depth exceeded" loop across a table of boards
//----------------------------------------------------------------------------------
function MiniBoard({ fen, color }: { fen: string; color: string | null }) {
  const options = useMemo(() => ({
    position: fen,
    boardStyle: { width: '64px', height: '64px' },
    allowDragging: false,
    showAnimations: false,
    boardOrientation: color === 'b' ? 'black' as const : 'white' as const
  }), [fen, color])

  return (
    <div className="w-16 h-16 shrink-0">
      <Chessboard options={options} />
    </div>
  )
}

export default function HabitsTable({ rows }: HabitsTableProps) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No bad habits found. Run the pipeline (Build Position Tree + Evaluate Positions) then check your filter settings.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-3 py-2 w-20">
              <span className="inline-flex items-center gap-1">
                Position
                <MyHelpField text="The position before your move." />
              </span>
            </th>
            <th className="px-3 py-2 w-8">
              <span className="inline-flex items-center gap-1">
                Colour
                <MyHelpField text="Which side was to move — W (White) or B (Black)." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Pos CP
                <MyHelpField text="Stockfish's evaluation of the position before your move, independent of what you played." />
              </span>
            </th>
            <th className="px-3 py-2">
              <span className="inline-flex items-center gap-1">
                Move
                <MyHelpField text="The move you played, in algebraic notation." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Times
                <MyHelpField text="How many separate games you've played this move from this position." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Win%
                <MyHelpField text="Percentage of those games you won (actual game outcome, not move quality)." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Loss%
                <MyHelpField text="Percentage of those games you lost (actual game outcome, not move quality)." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                CP
                <MyHelpField text="Average centipawns lost by playing this move instead of the best move, across all occurrences." />
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr
              key={`${row.pos_id}-${row.move_san}-${i}`}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/analysis/position/${row.pos_id}`)}
            >
              {/* Mini board */}
              <td className="px-3 py-2">
                <MiniBoard fen={row.pos_fen} color={row.pos_color} />
              </td>

              {/* Colour badge */}
              <td className="px-3 py-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                  row.pos_color === 'b'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-800 border border-gray-300'
                }`}>
                  {row.pos_color === 'b' ? 'B' : 'W'}
                </span>
              </td>

              {/* Position CP — score before the move */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono text-xs ${cpClass(row.pos_cp)}`}>
                {row.pos_cp != null ? (row.pos_cp > 0 ? `+${row.pos_cp}` : `${row.pos_cp}`) : '—'}
              </td>

              {/* Move */}
              <td className="px-3 py-2 font-mono font-semibold text-gray-800">
                {row.move_san}
              </td>

              {/* Times */}
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {row.move_times}
              </td>

              {/* Win% */}
              <td className="px-3 py-2 text-right tabular-nums text-green-700">
                {pctLabel(row.move_wins, row.move_times)}
              </td>

              {/* Loss% */}
              <td className="px-3 py-2 text-right tabular-nums text-red-600">
                {pctLabel(row.move_losses, row.move_times)}
              </td>

              {/* CP */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono ${cpClass(row.move_cp)}`}>
                {cpLabel(row.move_cp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
