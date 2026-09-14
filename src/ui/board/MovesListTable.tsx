'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MovesListTable — shared presentational table for every "moves from this position" panel
//    (Moves Played, Master Moves (Our DB), Master Moves (Lichess), on both /analyze and
//    /analyzemaster). Takes already-normalized rows; does no fetching of its own.
//
//    Parameters:
//      rows         — normalized move rows to display
//      selectedMove — currently-selected row key, for highlighting; omit for a non-interactive
//                     table
//      onSelectMove — called with a row's `key` (or null to deselect) when a row is clicked; omit
//                     to make rows non-clickable
//
//  2) NOTES
//    Times/White/Draws/Black are objective, color-based counts (see chessdb_player.ts's
//    getMoveSummaryForPosition_player header for the full rationale) — never a personal win/loss
//    perspective, which would mix different perspectives across games played as different colors.
//    Avg Rating and Eval are optional per row (null renders as "—") since not every source has them
//    (Lichess has no Eval; Master (Our DB)'s Eval was dropped as not worth a cross-database join).
//==================================================================================================

import { formatCp } from '@/src/lib/formatCp'

export type MovesListRow = {
  key:       string
  move:      string
  times:     number
  white:     number
  draws:     number
  black:     number
  avgRating: number | null
  eval:      number | null
}

interface MovesListTableProps {
  rows: MovesListRow[]
  selectedMove?: string | null
  onSelectMove?: (key: string | null) => void
}

export default function MovesListTable({ rows, selectedMove, onSelectMove }: MovesListTableProps) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-left text-gray-500 border-b border-gray-200'>
            <th className='py-1 pr-2'>Move</th>
            <th className='py-1 pr-2 text-right'>Times</th>
            <th className='py-1 pr-2 text-right'>White%</th>
            <th className='py-1 pr-2 text-right'>Draw%</th>
            <th className='py-1 pr-2 text-right'>Black%</th>
            <th className='py-1 pr-2 text-right'>Avg Rating</th>
            <th className='py-1 text-right'>Eval</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-100'>
          {rows.map(r => {
            const isSelected = selectedMove === r.key
            return (
              <tr
                key={r.key}
                className={onSelectMove ? `cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}` : ''}
                onClick={onSelectMove ? () => onSelectMove(isSelected ? null : r.key) : undefined}
              >
                <td className='py-1 pr-2 font-mono font-medium'>{r.move}</td>
                <td className='py-1 pr-2 text-right tabular-nums'>{r.times.toLocaleString()}</td>
                <td className='py-1 pr-2 text-right tabular-nums text-green-700'>{pct(r.white, r.times)}%</td>
                <td className='py-1 pr-2 text-right tabular-nums text-gray-500'>{pct(r.draws, r.times)}%</td>
                <td className='py-1 pr-2 text-right tabular-nums text-red-600'>{pct(r.black, r.times)}%</td>
                <td className='py-1 pr-2 text-right tabular-nums'>{r.avgRating ?? '—'}</td>
                <td className={`py-1 text-right tabular-nums font-mono ${r.eval != null && r.eval < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {r.eval != null ? formatCp(r.eval) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  pct — percentage of `count` out of `total`, 0 if total is 0
//----------------------------------------------------------------------------------
function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}
