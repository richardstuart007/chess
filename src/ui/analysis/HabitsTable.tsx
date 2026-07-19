'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Chessboard } from 'react-chessboard'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import ColorSwatch from '@/src/ui/ColorSwatch'
import { MIN_ANALYSIS_MOVE } from '@/src/lib/constants'

interface HabitRow {
  pos_id:      number
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  player:      string
  move_san:    string
  move_uci:    string | null
  move_num:    number | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}

type Color  = 'all' | 'w' | 'b'
type SortBy = 'cpLoss' | 'reached'

interface HabitsTableProps {
  rows: HabitRow[]
  dismissedView: boolean
  onToggleDismiss: (posId: number, moveSan: string, player: string) => void
  players: { username: string; display_name: string | null }[]
  color: Color
  onColorChange: (c: Color) => void
  minMove: number
  onMinMoveChange: (v: number) => void
  minReached: number
  onMinReachedChange: (v: number) => void
  sortBy: SortBy
  onSortByChange: (v: SortBy) => void
  onShowDismissedToggle: () => void
}

function cpClass(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp < 0) return 'text-red-600 font-semibold'
  return 'text-green-700'
}

function cpLabel(cp: number | null): string {
  if (cp === null) return '—'
  const pawns = cp / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
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

export default function HabitsTable({
  rows,
  dismissedView,
  onToggleDismiss,
  players,
  color,
  onColorChange,
  minMove,
  onMinMoveChange,
  minReached,
  onMinReachedChange,
  sortBy,
  onSortByChange,
  onShowDismissedToggle
}: HabitsTableProps) {
  const router = useRouter()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 tracking-wide">
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2 w-20">Position</th>
            <th className="px-3 py-2 w-8">Colour</th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Pos CP
                <MyHelpField text="Stockfish's evaluation of the position before your move, independent of what you played." />
              </span>
            </th>
            <th className="px-3 py-2">Move</th>
            <th className="px-3 py-2 text-right">Move #</th>
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
                CP
                <MyHelpField text="Centipawns lost by playing this move instead of the best move (the largest-magnitude occurrence, if you've played it more than once)." />
              </span>
            </th>
            <th className="px-3 py-2 w-8" />
          </tr>
          <tr className="bg-gray-50 text-left text-xs">
            <th className="px-3 py-1.5">
              <FilterPlayerSelect players={players} label="" width="w-24" />
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <FilterSelect
                options={[{ value: 'all', label: 'All' }, { value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]}
                value={color}
                onChange={v => onColorChange(v as Color)}
                width="w-20"
              />
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterSelect
                  options={[{ value: String(MIN_ANALYSIS_MOVE), label: `From ${MIN_ANALYSIS_MOVE}` }]}
                  value={String(minMove)}
                  onChange={v => onMinMoveChange(Number(v))}
                  width="w-20"
                />
              </div>
            </th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterSelect
                  options={[
                    { value: '2', label: 'Min 2×' },
                    { value: '3', label: 'Min 3×' },
                    { value: '5', label: 'Min 5×' },
                    { value: '10', label: 'Min 10×' }
                  ]}
                  value={String(minReached)}
                  onChange={v => onMinReachedChange(Number(v))}
                  width="w-20"
                />
              </div>
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterSelect
                  options={[
                    { value: 'cpLoss', label: 'Worst first' },
                    { value: 'reached', label: 'Most played' }
                  ]}
                  value={sortBy}
                  onChange={v => onSortByChange(v as SortBy)}
                  width="w-24"
                />
              </div>
            </th>
            <th className="px-3 py-1.5">
              <button
                type="button"
                onClick={onShowDismissedToggle}
                title={dismissedView ? 'Showing dismissed' : 'Show dismissed'}
                className={`text-xs leading-none px-1 py-0.5 rounded border ${dismissedView ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {dismissedView ? '↺' : '✕'}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center py-12 text-gray-500 text-sm">
                {dismissedView
                  ? 'No dismissed habits.'
                  : 'No bad habits found. Run the pipeline (Build Position Tree + Evaluate Positions) then check your filter settings.'}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={`${row.pos_id}-${row.move_san}-${i}`}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/position/${row.pos_id}`)}
            >
              {/* Player */}
              <td className="px-3 py-2 text-gray-600">
                {row.player}
              </td>

              {/* Mini board */}
              <td className="px-3 py-2">
                <MiniBoard fen={row.pos_fen} color={row.pos_color} />
              </td>

              {/* Colour badge */}
              <td className="px-3 py-2">
                <ColorSwatch color={row.pos_color} />
              </td>

              {/* Position CP — score before the move */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono text-xs ${cpClass(row.pos_cp)}`}>
                {cpLabel(row.pos_cp)}
              </td>

              {/* Move */}
              <td className="px-3 py-2 font-mono font-semibold text-gray-800">
                {row.move_san}
              </td>

              {/* Move # */}
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {row.move_num ?? '—'}
              </td>

              {/* Times */}
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {row.move_times}
              </td>

              {/* Win% */}
              <td className="px-3 py-2 text-right tabular-nums text-green-700">
                {pctLabel(row.move_wins, row.move_times)}
              </td>

              {/* CP */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono ${cpClass(row.move_cp)}`}>
                {cpLabel(row.move_cp)}
              </td>

              {/* Dismiss / Restore */}
              <td className="px-3 py-2">
                <button
                  type="button"
                  title={dismissedView ? 'Restore — show this habit again' : "Dismiss — don't show this habit again"}
                  onClick={e => { e.stopPropagation(); onToggleDismiss(row.pos_id, row.move_san, row.player) }}
                  className="text-gray-400 hover:text-red-600 text-xs leading-none px-1"
                >
                  {dismissedView ? '↺' : '✕'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
