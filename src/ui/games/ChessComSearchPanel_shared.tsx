'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ChessComSearchPanel_shared — general chess.com game search (Player 1/Player 2, rating, year,
//    sort), no board/position required. Self-contained, no props — owns all its own state.
//
//    Extracted from two identical, position-scoped copies previously embedded in
//    ChessBoardView_shared.tsx and MasterGameView_master.tsx (each searched
//    searchChessComGames(fen, filters) for games reaching the exact board position). Here the fen
//    argument is omitted entirely, making this a general Player 1 vs. Player 2 search usable from
//    its own page with no board context.
//
//  2) NOTES
//    Pagination against chess.com's own search has no real total-page-count to work with — its
//    HTML only ever shows "this page had N games", never a total. totalPages is therefore a
//    locally-discovered, growing estimate (see the fetch effect below), not a real count — the
//    page strip can occasionally show one extra clickable page that turns out empty.
//
//    Fetched pages are cached in sessionStorage (see readChesscomCache/writeChesscomCache), keyed
//    by the exact filter combination — chess.com's endpoint proved unreliable/slow in testing, so
//    revisiting an already-fetched page for the same search serves from cache instead of
//    re-querying it. A new search (different filters) replaces the cache scope entirely. This is a
//    deliberate exception to this project's usual "filters always query server-side" rule — that
//    rule assumes a cheap, reliable DB-backed list, which chess.com's live search is not.
//
//  3) CHANGE HISTORY
//    2026-09-15 — new component: extracted from the duplicated "Chess.com Games" panel in
//                 ChessBoardView_shared.tsx/MasterGameView_master.tsx, dropping the FEN/position
//                 filter to work as a standalone page (see src/app/masterchesscom/page.tsx)
//    2026-09-17 — removed the "Fixed colors (P1=White)" toggle and the Result filter (both proved
//                 unreliable against chess.com's actual behavior during live testing); added
//                 pagination (nextjs-shared's bare MyPagination, totalPages tracked as a growing
//                 estimate) and a sessionStorage cache of fetched pages, keyed by filter
//                 combination, so revisiting a page already fetched for the current search doesn't
//                 re-hit chess.com
//==================================================================================================

import { useEffect, useState } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import MyPagination from 'nextjs-shared/MyPagination'
import { MyInputNumeric } from 'nextjs-shared/MyInputNumeric'
import { searchChessComGames, ChessComSearchGame, ChessComSearchFilters } from '@/src/lib/actions/chesscomSearch'
import MasterPlayerSelect from '@/src/ui/filters/MasterPlayerSelect'
import { SESSION_STORAGE_PREFIX } from '@/src/lib/constants'

//
//  Chess.com's own /games/search filter values — see ChessComSearchFilters/searchChessComGames
//  in chesscomSearch.ts for where these are consumed and the full provenance comment.
//
const CHESSCOM_YEAR_COMPARISON_OPTIONS = [
  { value: '1', label: '=' },
  { value: '2', label: '≥' },
  { value: '3', label: '≤' }
]
const CHESSCOM_SORT_OPTIONS = [
  { value: '', label: 'Most recent' },
  { value: '8', label: 'Oldest' },
  { value: '3', label: 'Rating (White)' },
  { value: '4', label: 'Rating (Black)' },
  { value: '9', label: 'Most moves' },
  { value: '10', label: 'Fewest moves' }
]

const CHESSCOM_CACHE_STORAGE_KEY = `${SESSION_STORAGE_PREFIX}chesscom-search-cache`

type ChesscomCache = {
  searchKey: string
  pages: Record<number, ChessComSearchGame[]>
  urls:  Record<number, string>
}

export default function ChessComSearchPanel_shared() {
  const [chesscomGames, setChesscomGames] = useState<ChessComSearchGame[] | null>(null)
  const [chesscomLoading, setChesscomLoading] = useState(false)
  //
  //  The exact chess.com URL the last search actually used — shown so a mismatch between what's
  //  displayed in the filter controls and what was actually submitted can be caught directly by
  //  pasting this URL into a browser, instead of only inferring it from the returned games.
  //
  const [lastSearchUrl, setLastSearchUrl] = useState<string | null>(null)

  // Chess.com Games search filters — param names match chess.com's own search URL. p1/p2 are
  // "First Last" names (not chess.com handles) — that's what chess.com's own search endpoint
  // takes, hence MasterPlayerSelect's valueField='name' below.
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [mr, setMr] = useState<number | ''>('')
  const [year, setYear] = useState<number | ''>('')
  const [lsty, setLsty] = useState(CHESSCOM_YEAR_COMPARISON_OPTIONS[0].value)
  const [sort, setSort] = useState(CHESSCOM_SORT_OPTIONS[0].value)

  //
  //  The filter combination actually committed via "Search chess.com" — separate from the
  //  live-edited p1/p2/etc above, so paging (below) always re-fetches under the filters that were
  //  actually searched, not whatever's currently sitting in the (possibly since-edited) inputs.
  //
  const [activeFilters, setActiveFilters] = useState<ChessComSearchFilters | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  //
  //  A growing estimate, not a real count — see 2) NOTES above.
  //
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    if (!activeFilters) return
    let cancelled = false

    async function loadPage() {
      setChesscomLoading(true)
      try {
        const searchKey = JSON.stringify(activeFilters)
        const cache = readChesscomCache()
        const cachedGames = cache && cache.searchKey === searchKey ? cache.pages[currentPage] : undefined

        if (cachedGames) {
          if (!cancelled) {
            setChesscomGames(cachedGames)
            setLastSearchUrl(cache!.urls[currentPage] ?? null)
          }
          return
        }

        const { games, url } = await searchChessComGames(undefined, activeFilters!, currentPage)
        if (cancelled) return
        setChesscomGames(games)
        setLastSearchUrl(url)
        setTotalPages(prev => games.length === 0 ? Math.max(1, currentPage - 1) : Math.max(prev, currentPage + 1))
        writeChesscomCache(searchKey, currentPage, games, url)
      } finally {
        if (!cancelled) setChesscomLoading(false)
      }
    }

    loadPage()
    return () => { cancelled = true }
  }, [activeFilters, currentPage])

  // -----------------------------------------------------------------------
  // Commit the current filter inputs and trigger the first page's fetch (via the effect above).
  // -----------------------------------------------------------------------
  function searchChessCom() {
    const filters: ChessComSearchFilters = { p1, p2, mr, year, lsty, sort }
    setTotalPages(1)
    setCurrentPage(1)
    setActiveFilters(filters)
  }

  return (
    <MyBox title='Chess.com Games'>
      <div className='space-y-2'>
        <MyButton
          onClick={searchChessCom}
          disabled={chesscomLoading}
          overrideClass='w-full bg-green-600 hover:bg-green-700'
        >
          {chesscomLoading ? 'Searching…' : 'Search chess.com'}
        </MyButton>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Player 1</span>
            <MasterPlayerSelect
              value={p1}
              onChange={setP1}
              scope='all'
              valueField='name'
              blankLabel=''
              label=''
              width='w-48'
            />
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Player 2</span>
            <MasterPlayerSelect
              value={p2}
              onChange={setP2}
              scope='all'
              valueField='name'
              blankLabel=''
              label=''
              width='w-48'
            />
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Min rating</span>
            <MyInputNumeric
              integerOnly
              value={mr}
              onChange={v => setMr(v ?? '')}
              overrideClass='w-20 h-6 md:h-6'
            />
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Year</span>
            <MySelect value={lsty} onChange={e => setLsty(e.target.value)} overrideClass='w-14 h-6 md:h-6'>
              {CHESSCOM_YEAR_COMPARISON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </MySelect>
            <MyInputNumeric
              integerOnly
              value={year}
              onChange={v => setYear(v ?? '')}
              placeholder='e.g. 2024'
              overrideClass='w-20 h-6 md:h-6'
            />
          </div>
          <MySelect label='Sort' value={sort} onChange={e => setSort(e.target.value)} overrideClass='w-32 h-6 md:h-6'>
            {CHESSCOM_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </MySelect>
        </div>
        {lastSearchUrl && (
          <p className='text-xxs text-gray-400 break-all'>Last search: {lastSearchUrl}</p>
        )}
        {chesscomGames && (
          chesscomGames.length === 0 ? (
            <p className='text-xs text-gray-400'>No games found on chess.com for this search.</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='text-left text-gray-500 border-b border-gray-200'>
                    <th className='py-1 pr-2'>White</th>
                    <th className='py-1 pr-2'>Black</th>
                    <th className='py-1 pr-2 text-center'>Result</th>
                    <th className='py-1 pr-2 text-right'>Moves</th>
                    <th className='py-1 pr-2 text-right'>Year</th>
                    <th className='py-1 text-right'>Game</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {chesscomGames.map(g => (
                    <tr key={g.gameId}>
                      <td className='py-1 pr-2'>
                        {g.whiteUsername} {g.whiteRating != null && <span className='text-gray-400'>({g.whiteRating})</span>}
                      </td>
                      <td className='py-1 pr-2'>
                        {g.blackUsername} {g.blackRating != null && <span className='text-gray-400'>({g.blackRating})</span>}
                      </td>
                      <td className='py-1 pr-2 text-center'>{g.result}</td>
                      <td className='py-1 pr-2 text-right tabular-nums'>{g.moves ?? '—'}</td>
                      <td className='py-1 pr-2 text-right tabular-nums'>{g.year ?? '—'}</td>
                      <td className='py-1 text-right'>
                        <a
                          href={g.viewUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-blue-600 hover:underline'
                        >
                          view
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {activeFilters && totalPages > 1 && (
          <div className='flex justify-center'>
            <MyPagination
              totalPages={totalPages}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
            />
          </div>
        )}
      </div>
    </MyBox>
  )
}

//----------------------------------------------------------------------------------------------
//  readChesscomCache — reads the sessionStorage-cached chess.com search pages, if any
//
//  Returns:
//    the cached { searchKey, pages, urls } blob, or null if unset/corrupt/unavailable (SSR)
//----------------------------------------------------------------------------------------------
function readChesscomCache(): ChesscomCache | null {
  try {
    const raw = sessionStorage.getItem(CHESSCOM_CACHE_STORAGE_KEY)
    return raw ? JSON.parse(raw) as ChesscomCache : null
  } catch {
    return null
  }
}

//----------------------------------------------------------------------------------------------
//  writeChesscomCache — stores one fetched page's games/url under the given search key. A search
//  key that differs from what's currently cached replaces the cache scope entirely, rather than
//  merging — an old search's pages are irrelevant once a new search has been committed.
//
//  Params:
//    searchKey — JSON.stringify of the active ChessComSearchFilters
//    page      — the page number these games/url belong to
//    games     — the fetched games for this page
//    url       — the chess.com URL that was fetched for this page
//----------------------------------------------------------------------------------------------
function writeChesscomCache(searchKey: string, page: number, games: ChessComSearchGame[], url: string): void {
  try {
    const existing = readChesscomCache()
    const cache: ChesscomCache = existing && existing.searchKey === searchKey
      ? existing
      : { searchKey, pages: {}, urls: {} }
    cache.pages[page] = games
    cache.urls[page] = url
    sessionStorage.setItem(CHESSCOM_CACHE_STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}
