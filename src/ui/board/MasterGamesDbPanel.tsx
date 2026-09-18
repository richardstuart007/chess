'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterGamesDbPanel — game list for an exact FEN, sourced from this project's own synced
//    master-games database, not an external API. Renders via the shared GamesListTable (same
//    shape as Games Played and Master Games (Lichess)). Fully self-contained — fetches its own
//    data from just the fen prop and owns its own move filter, so it can be dropped onto any page
//    without shared parent state.
//
//    Parameters:
//      fen          — exact FEN to look up
//      autoFetch    — fetch automatically on mount/fen change (default true); when false, shows
//                     a "Fetch" button instead
//      defaultOpen  — MyBox's initial collapsed state (default true)
//      gameLinkBase — URL prefix a game row click navigates to (default '/analyzemaster?game=')
//
//  2) NOTES
//    Result is shown as objective chess notation (1-0/0-1/½-½), and the tracked master's own
//    name is bolded, since mgd_player_result alone (win/loss/draw) is ambiguous without knowing
//    which side they played.
//
//  3) CHANGE HISTORY
//    2026-09-13 — real server-side pagination (fetchMasterGamesForFenPage/
//                 getMasterGamesForFenCount) instead of a single flat capped batch; the Move
//                 filter is now a server-side parameter on both calls instead of a client-side
//                 .filter() over the loaded page, and resets the page back to 1 on change
//    2026-09-13 — "Year" column replaced with "Date" (full ISO date, was year-only) — the
//                 underlying MasterFenGameHit.year field was replaced with .date
//    2026-09-13 — switched to the shared GamesListTable, adding White/Black ratings and a
//                 Termination column (Final Eval always blank — no master equivalent exists)
//    2026-09-15 — title shortened "Master Games (Our DB)" -> "Games"; the "All Masters" group
//                 label above this panel (added by its callers) now carries that context instead
//==================================================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { useLazyFetch } from 'nextjs-shared/useLazyFetch'
import { fetchMasterGamesForFenPage, getMasterGamesForFenCount, getMasterGamesForFen, type MasterFenGameHit } from '@/src/lib/master/masterGamesList'
import { POSITION_GAMES_ROWS_DEFAULT, POSITION_GAMES_ROWS_OPTIONS } from '@/src/lib/constants'
import GamesListTable from './GamesListTable'

interface MasterGamesDbPanelProps {
  fen: string
  autoFetch?: boolean
  defaultOpen?: boolean
  gameLinkBase?: string
}

export default function MasterGamesDbPanel({ fen, autoFetch = true, defaultOpen = true, gameLinkBase = '/analyzemaster?game=' }: MasterGamesDbPanelProps) {
  const router = useRouter()
  const [moveFilter, setMoveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(POSITION_GAMES_ROWS_DEFAULT)
  const { data, loaded, loading, load } = useLazyFetch(
    () => fetchGamesPage(fen, page, rowsPerPage, moveFilter || undefined),
    [fen, page, rowsPerPage, moveFilter],
    { autoFetch }
  )
  const games = data?.games ?? []
  const totalRows = data?.totalRows ?? 0
  const moveOptions = data?.moveOptions ?? []
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))

  // Reset back to page 1 whenever the position/move filter identity changes — same guard pattern
  // as ChessBoardView_shared's positionGamesResetKeyRef, so paging state from a previous
  // position/filter never carries over as a stale offset.
  const resetKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const key = JSON.stringify({ fen, moveFilter })
    if (resetKeyRef.current !== undefined && resetKeyRef.current !== key) setPage(1)
    resetKeyRef.current = key
  }, [fen, moveFilter])

  return (
    <MyBox title='Games' collapsible defaultOpen={defaultOpen}>
      {!loaded ? (
        <MyButton onClick={load} disabled={loading} overrideClass='text-xs'>
          {loading ? 'Loading...' : 'Fetch Games'}
        </MyButton>
      ) : games.length === 0 ? (
        <p className='text-xs text-gray-400'>No synced master games recorded from this position.</p>
      ) : (
        <div className='space-y-2'>
          {moveOptions.length > 1 && (
            <div className='flex items-center gap-2'>
              <label className='text-xxs text-gray-500'>Move</label>
              <MySelect
                value={moveFilter}
                onChange={e => setMoveFilter(e.target.value)}
                overrideClass='w-24 h-6 md:h-6'
              >
                <option value=''>All</option>
                {moveOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </MySelect>
            </div>
          )}
          <GamesListTable
            rows={games.map(g => ({
              key:            String(g.mgd_mgdid),
              move:           g.move_played,
              white:          g.white_username,
              whiteRating:    g.white_rating,
              whiteIsTracked: g.white_username === g.player,
              black:          g.black_username,
              blackRating:    g.black_rating,
              blackIsTracked: g.black_username === g.player,
              date:           g.date,
              result:         g.result,
              termination:    g.termination,
              finalEval:      null
            }))}
            onRowClick={key => router.push(`${gameLinkBase}${key}`)}
          />
          {totalPages > 1 && (
            <MyPaginationFooter
              totalPages={totalPages}
              statecurrentPage={page}
              setStateCurrentPage={setPage}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={v => { setRowsPerPage(v); setPage(1) }}
              rowsOptions={POSITION_GAMES_ROWS_OPTIONS}
              totalRows={totalRows}
            />
          )}
        </div>
      )}
    </MyBox>
  )
}

//----------------------------------------------------------------------------------
//  fetchGamesPage — fetches one page of master games plus the total row count for the same
//  filter, and (unpaginated, from the existing capped moves breakdown) the distinct move list for
//  the filter dropdown, in parallel
//----------------------------------------------------------------------------------
async function fetchGamesPage(fen: string, page: number, itemsPerPage: number, move: string | undefined): Promise<{
  games:       MasterFenGameHit[]
  totalRows:   number
  moveOptions: string[]
}> {
  const [games, totalRows, masterData] = await Promise.all([
    fetchMasterGamesForFenPage(fen, page, itemsPerPage, move),
    getMasterGamesForFenCount(fen, move),
    getMasterGamesForFen(fen)
  ])
  return { games, totalRows, moveOptions: masterData.moves.map(m => m.move_played) }
}
