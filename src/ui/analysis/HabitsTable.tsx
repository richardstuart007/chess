'use client'

//==================================================================================================
//  1) DESCRIPTION
//    HabitsTable — filterable table of recurring player habits (moves played from the same
//    position more than once), with per-column filter controls and a Dismiss/Restore toggle per
//    row. Clicking a row navigates to that position's detail page.
//
//    Parameters:
//      rows                      — habit rows to display
//      dismissedView             — true when viewing dismissed habits instead of active ones
//      onToggleDismiss           — called with (posId, moveSan, player) to dismiss/restore a row
//      players                   — tracked players, for the Player filter
//      color / onColorChange     — position-color filter state
//      quality / onQualityChange — Bad/Good filter state
//      minMove / onMinMoveChange — minimum move-number filter state
//      minReached / onMinReachedChange — minimum times-reached filter state
//      sortBy / onSortByChange   — sort mode ('cpLoss' | 'reached')
//      onShowDismissedToggle     — toggles between active/dismissed views
//      dateFrom / onDateFromChange — date-from filter state
//      opening / onOpeningChange — opening-name filter state
//      eco / onEcoChange         — ECO-code filter state
//      onApplyFilters            — applies pending filter changes
//      filtersPending            — true when filter changes haven't been applied yet
//==================================================================================================

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { MyButton } from 'nextjs-shared/MyButton'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterTextInput from '@/src/ui/filters/FilterTextInput'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import ColorSwatch from '@/src/ui/ColorSwatch'
import MiniBoard from '@/src/ui/board/MiniBoard'
import {
  MIN_ANALYSIS_MOVE_Player, WIDTH_POSITION_COLOR, WIDTH_QUALITY, WIDTH_MIN_MOVE,
  WIDTH_MIN_REACHED, WIDTH_SORT_BY, WIDTH_HABITS_OPENING, WIDTH_ECO, WIDTH_DATE_FROM,
  PLACEHOLDER_TEXT_FILTER, GLOBAL_FILTER_BORDER_CLASS
} from '@/src/lib/constants'
import { winPct } from '@/src/lib/winPct'
import { formatCp } from '@/src/lib/formatCp'
import { pushBackTarget } from '@/src/lib/backNav'

interface HabitRow {
  pos_id:       number
  pos_fen:      string
  pos_color:    string | null
  pos_cp:       number | null
  player:       string
  move_san:     string
  move_uci:     string | null
  move_num:     number | null
  move_times:   number
  move_wins:    number
  move_losses:  number
  move_cp:      number | null
  opening_name: string | null
  eco_code:     string | null
  last_occurred: number | null
}

type Color   = 'all' | 'w' | 'b'
type SortBy  = 'cpLoss' | 'reached'
type Quality = 'bad' | 'good'

interface HabitsTableProps {
  rows: HabitRow[]
  dismissedView: boolean
  onToggleDismiss: (posId: number, moveSan: string, player: string) => void
  players: { player: string; display_name: string | null }[]
  color: Color
  onColorChange: (c: Color) => void
  quality: Quality
  onQualityChange: (q: Quality) => void
  minMove: number
  onMinMoveChange: (v: number) => void
  minReached: number
  onMinReachedChange: (v: number) => void
  sortBy: SortBy
  onSortByChange: (v: SortBy) => void
  onShowDismissedToggle: () => void
  dateFrom: string
  onDateFromChange: (v: string) => void
  opening: string
  onOpeningChange: (v: string) => void
  eco: string
  onEcoChange: (v: string) => void
  onApplyFilters: () => void
  filtersPending: boolean
}

export default function HabitsTable({
  rows,
  dismissedView,
  onToggleDismiss,
  players,
  color,
  onColorChange,
  quality,
  onQualityChange,
  minMove,
  onMinMoveChange,
  minReached,
  onMinReachedChange,
  sortBy,
  onSortByChange,
  onShowDismissedToggle,
  dateFrom,
  onDateFromChange,
  opening,
  onOpeningChange,
  eco,
  onEcoChange,
  onApplyFilters,
  filtersPending
}: HabitsTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 tracking-wide">
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2 w-20">Position</th>
            <th className="px-3 py-2 w-8">Colour</th>
            <th className="px-3 py-2">Opening</th>
            <th className="px-3 py-2">ECO</th>
            <th className="px-3 py-2 w-16">Quality</th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Pos Eval
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
                Eval
                <MyHelpField text="Stockfish's evaluation of the position after this move, white's perspective." />
              </span>
            </th>
            <th className="px-3 py-2 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Last occurred
                <MyHelpField text="Date of the most recent game this move was played from this position." />
              </span>
            </th>
            <th className="px-3 py-2 w-8" />
          </tr>
          <tr className="bg-gray-50 text-left text-xs">
            <th className="px-3 py-1.5">
              <FilterPlayerSelect players={players} label="" />
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <FilterSelect
                options={[{ value: 'all', label: 'All' }, { value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]}
                value={color}
                onChange={v => onColorChange(v as Color)}
                width={WIDTH_POSITION_COLOR}
              />
            </th>
            <th className="px-3 py-1.5">
              <FilterTextInput
                value={opening}
                onChange={onOpeningChange}
                placeholder={PLACEHOLDER_TEXT_FILTER}
                width={WIDTH_HABITS_OPENING}
                borderClass={GLOBAL_FILTER_BORDER_CLASS}
              />
            </th>
            <th className="px-3 py-1.5">
              <FilterTextInput
                value={eco}
                onChange={onEcoChange}
                width={WIDTH_ECO}
                borderClass={GLOBAL_FILTER_BORDER_CLASS}
              />
            </th>
            <th className="px-3 py-1.5">
              <FilterSelect
                options={[{ value: 'bad', label: 'Bad' }, { value: 'good', label: 'Good' }]}
                value={quality}
                onChange={v => onQualityChange(v as Quality)}
                width={WIDTH_QUALITY}
              />
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterSelect
                  options={[{ value: String(MIN_ANALYSIS_MOVE_Player), label: `From ${MIN_ANALYSIS_MOVE_Player}` }]}
                  value={String(minMove)}
                  onChange={v => onMinMoveChange(Number(v))}
                  width={WIDTH_MIN_MOVE}
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
                  width={WIDTH_MIN_REACHED}
                />
              </div>
            </th>
            <th className="px-3 py-1.5"></th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterSelect
                  options={[
                    { value: 'cpLoss', label: 'Biggest' },
                    { value: 'reached', label: 'Most played' }
                  ]}
                  value={sortBy}
                  onChange={v => onSortByChange(v as SortBy)}
                  width={WIDTH_SORT_BY}
                />
              </div>
            </th>
            <th className="px-3 py-1.5">
              <div className="flex justify-end">
                <FilterDateInput
                  value={dateFrom}
                  onChange={onDateFromChange}
                  width={WIDTH_DATE_FROM}
                  borderClass={GLOBAL_FILTER_BORDER_CLASS}
                />
              </div>
            </th>
            <th className="px-3 py-1.5">
              <div className="flex items-center gap-1">
                <MyButton
                  type="button"
                  onClick={onShowDismissedToggle}
                  title={dismissedView ? 'Showing dismissed' : 'Show dismissed'}
                  overrideClass={`text-xs leading-none h-6 md:h-6 px-1 py-0.5 rounded border ${dismissedView ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {dismissedView ? '↺' : '✕'}
                </MyButton>
                <FilterActionButton
                  onClick={onApplyFilters}
                  variant={filtersPending ? 'pending' : 'primary'}
                >
                  Refresh
                </FilterActionButton>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={14} className="text-center py-12 text-gray-500 text-sm">
                {dismissedView
                  ? 'No dismissed habits.'
                  : `No ${quality} habits found. Run the pipeline (Build Position Tree + Evaluate Positions) then check your filter settings.`}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={`${row.pos_id}-${row.move_san}-${i}`}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => {
                const qs = searchParams.toString()
                pushBackTarget(qs ? `${pathname}?${qs}` : pathname)
                router.push(`/position/${row.pos_id}?player=${row.player}`)
              }}
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

              {/* Opening — from the latest game that reached this position */}
              <td className={`px-3 py-2 ${WIDTH_HABITS_OPENING} truncate`} title={row.opening_name ?? ''}>
                {row.opening_name ?? '—'}
              </td>

              {/* ECO */}
              <td className={`px-3 py-2 ${WIDTH_ECO} text-gray-400`}>
                {row.eco_code ?? '—'}
              </td>

              {/* Quality — matches the page-level Bad/Good filter, since every row shares it */}
              <td className="px-3 py-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${quality === 'good' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {quality === 'good' ? 'Good' : 'Bad'}
                </span>
              </td>

              {/* Position CP — score before the move */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono text-xs ${cpClass(row.pos_cp)}`}>
                {row.pos_cp != null ? formatCp(row.pos_cp) : '—'}
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
                {winPct(row.move_wins, row.move_losses, row.move_times)}%
              </td>

              {/* CP */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono ${cpClass(row.move_cp)}`}>
                {row.move_cp != null ? formatCp(row.move_cp) : '—'}
              </td>

              {/* Last occurred */}
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {row.last_occurred != null ? formatLastOccurred(row.last_occurred) : '—'}
              </td>

              {/* Dismiss / Restore */}
              <td className="px-3 py-2">
                <MyButton
                  type="button"
                  title={dismissedView ? 'Restore — show this habit again' : "Dismiss — don't show this habit again"}
                  onClick={e => { e.stopPropagation(); onToggleDismiss(row.pos_id, row.move_san, row.player) }}
                  overrideClass="text-gray-400 hover:text-red-600 text-xs leading-none px-1 bg-transparent hover:bg-transparent"
                >
                  {dismissedView ? '↺' : '✕'}
                </MyButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  formatLastOccurred — epoch seconds to dd/mm/yy
//----------------------------------------------------------------------------------
function formatLastOccurred(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

//----------------------------------------------------------------------------------
//  cpClass — text color class for a centipawn value (gray if unknown, red if negative,
//  green otherwise)
//----------------------------------------------------------------------------------
function cpClass(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp < 0) return 'text-red-600 font-semibold'
  return 'text-green-700'
}
