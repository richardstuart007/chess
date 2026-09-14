'use client'

//==================================================================================================
//  1) DESCRIPTION
//    GamesListTable — shared presentational table for every "games reaching this position" panel
//    (Games Played, Master Games (Our DB), Master Games (Lichess), on both /analyze and
//    /analyzemaster). Takes already-normalized rows; does no fetching of its own.
//
//    Parameters:
//      rows        — normalized game rows to display
//      onRowClick  — called with a row's `key` when clicked; omit to make rows non-clickable.
//                    Ignored for a row that sets its own `externalHref`.
//      currentKey  — row `key` to mark as the currently-open game (left border highlight)
//
//  2) NOTES
//    Result is always objective chess notation (1-0/0-1/½-½), never a personal W/L/D — see
//    objectiveGameResult.ts's objectiveGameResult. White/Black names are bolded per-row via
//    whiteIsTracked/blackIsTracked (the tracked player/master's own side); Lichess rows pass both
//    false since there's no single tracked side there. Termination/Final Eval are optional per row
//    (null renders as "—") since Master/Lichess sources don't have them. A row with `externalHref`
//    set (e.g. a Lichess game) renders a real `<a target="_blank">` in the Game column instead of
//    relying on `onRowClick` — needed for actual external links (new-tab, copy-link, etc.), not
//    just an internal `router.push`.
//==================================================================================================

import { formatCp } from '@/src/lib/formatCp'

export type GamesListRow = {
  key:            string
  move:           string
  white:          string
  whiteRating:    number | null
  whiteIsTracked: boolean
  black:          string
  blackRating:    number | null
  blackIsTracked: boolean
  date:           string | null
  result:         string
  termination:    string | null
  finalEval:      number | null
  highlight?:     'pink' | 'green' | null
  externalHref?:  string | null
}

interface GamesListTableProps {
  rows: GamesListRow[]
  onRowClick?: (key: string) => void
  currentKey?: string | null
}

export default function GamesListTable({ rows, onRowClick, currentKey }: GamesListTableProps) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-left text-gray-500 border-b border-gray-200'>
            <th className='py-1 pr-2'>Move</th>
            <th className='py-1 pr-2'>White</th>
            <th className='py-1 pr-2'>Black</th>
            <th className='py-1 pr-2 text-right'>Date</th>
            <th className='py-1 pr-2 text-center'>Result</th>
            <th className='py-1 pr-2'>Termination</th>
            <th className='py-1 pr-2 text-right'>Final Eval</th>
            <th className='py-1 text-right'>Game</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-100'>
          {rows.map(r => {
            const clickable = !r.externalHref && !!onRowClick
            const rowBg =
              r.highlight === 'pink' ? 'bg-pink-100 hover:bg-pink-200'
              : r.highlight === 'green' ? 'bg-green-100 hover:bg-green-200'
              : clickable ? 'hover:bg-gray-50' : ''
            const isCurrent = currentKey != null && currentKey === r.key
            return (
              <tr
                key={r.key}
                className={`${rowBg} ${isCurrent ? 'border-l-4 border-blue-500' : ''} ${clickable ? 'cursor-pointer' : ''}`}
                onClick={clickable ? () => onRowClick!(r.key) : undefined}
              >
                <td className='py-1 pr-2 font-mono font-medium'>{r.move}</td>
                <td className={`py-1 pr-2 ${r.whiteIsTracked ? 'font-semibold text-gray-900' : ''}`}>
                  {r.white}{r.whiteRating != null && <span className='text-gray-400'> ({r.whiteRating})</span>}
                </td>
                <td className={`py-1 pr-2 ${r.blackIsTracked ? 'font-semibold text-gray-900' : ''}`}>
                  {r.black}{r.blackRating != null && <span className='text-gray-400'> ({r.blackRating})</span>}
                </td>
                <td className='py-1 pr-2 text-right tabular-nums text-gray-500'>{r.date ?? '—'}</td>
                <td className='py-1 pr-2 text-center tabular-nums'>{r.result}</td>
                <td className='py-1 pr-2 text-gray-500'>{r.termination ?? '—'}</td>
                <td className={`py-1 pr-2 text-right tabular-nums font-mono ${r.finalEval != null && r.finalEval < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {r.finalEval != null ? formatCp(r.finalEval) : '—'}
                </td>
                <td className='py-1 text-right text-blue-600'>
                  {r.externalHref ? (
                    <a href={r.externalHref} target='_blank' rel='noopener noreferrer' className='hover:underline'>view</a>
                  ) : clickable ? 'View' : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
