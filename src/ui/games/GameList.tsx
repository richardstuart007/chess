'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterTextInput from '@/src/ui/filters/FilterTextInput'
import FilterNumberRange from '@/src/ui/filters/FilterNumberRange'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import ColorSelect from '@/src/ui/filters/ColorSelect'
import FilterTimeClassSelect from '@/src/ui/filters/FilterTimeClassSelect'
import ResultSelect from '@/src/ui/filters/ResultSelect'
import TerminationMultiSelect from '@/src/ui/filters/TerminationMultiSelect'
import ColorSwatch from '@/src/ui/ColorSwatch'
import { ChessComGame } from '@/src/lib/chesscom'
import { fetchFilteredGames, getGamesPageCount, GameFilters } from '@/src/lib/actions/games'
import { useGlobalFilter, useGlobalFilters } from '@/src/lib/hooks/useGlobalFilter'
import {
  GAME_LIST_ROWS_DEFAULT_Player, GAME_LIST_ROWS_OPTIONS_Player, DEFAULT_DATE_FROM_Player, SESSION_STORAGE_PREFIX,
  WIDTH_DATE_FROM, WIDTH_COLOR_GAMES, WIDTH_TIME_CLASS_GAMES, WIDTH_OPPONENT, WIDTH_OPPONENT_RATING,
  WIDTH_GAME_NUMBER, WIDTH_RESULT, WIDTH_OPENING, WIDTH_ECO, PLACEHOLDER_TEXT_FILTER, GLOBAL_FILTER_BORDER_CLASS
} from '@/src/lib/constants'

interface PlayerOption {
  player: string
  displayName: string | null
}

interface GameListProps {
  players: PlayerOption[]
  onSelectGame: (game: ChessComGame, player: string) => void
  minDate?: string
}

const BOTH = ''
const TODAY = new Date().toISOString().slice(0, 10)

const RESULT_STYLES: Record<string, string> = {
  win: 'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

export default function GameList({ players, onSelectGame, minDate }: GameListProps) {
  const searchParams = useSearchParams()

  //
  //  Player selection is shared with the PlayerProfile header (AppShell) via the `?player=`
  //  URL param — applies immediately on change, unlike the rest of the filters below.
  //
  const playerFilter = searchParams.get('player') ?? BOTH

  //
  //  Time-class selection is shared with the PlayerProfile header (rating badge clicks) and
  //  every other page with a Time filter via `?timeClass=` — applies immediately, unlike the
  //  rest of `filters` below, which only updates when Filter is clicked.
  //
  const timeClassFilter = searchParams.get('timeClass') ?? ''

  //
  //  Date From, Opening, and ECO are also global (shared via URL with every other page that has
  //  these filters) — but unlike timeClass, they stay gated behind the Filter button below (a
  //  date picker/typed text shouldn't fire a query on every change). Absent dateFrom still
  //  defaults to DEFAULT_DATE_FROM_Player, matching today's behavior (user-decided — URL params can't
  //  distinguish "never set" from "explicitly cleared" the way sessionStorage could).
  //
  const [rawDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player
  const [openingFilter] = useGlobalFilter('opening')
  const [ecoFilter] = useGlobalFilter('eco')
  //
  //  handleApplyFilters below sets dateFrom/opening/eco together in one push — each
  //  useGlobalFilter's own setValue is unsafe for that (see useGlobalFilters' own comment).
  //
  const setGlobalFilters = useGlobalFilters()

  //
  //  Draft state feeds the filter inputs directly (instant, responsive typing). Applied
  //  state is what actually gets queried — only updated when Filter is clicked, so an
  //  expensive re-query doesn't fire on every keystroke. draftFilters/filters are persisted so
  //  navigating away to another page and back doesn't reset them (including an unapplied draft
  //  edit); draftDateFrom/draftOpening/draftEco mirror the global values instead, since those
  //  are now the source of truth.
  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [draftFilters, setDraftFilters] = useState<GameFilters>({})
  const [filters, setFilters] = useState<GameFilters>({})
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromFilter)
  const [draftOpening, setDraftOpening] = useState(openingFilter)
  const [draftEco, setDraftEco] = useState(ecoFilter)
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(GAME_LIST_ROWS_DEFAULT_Player)
  const [hydrated, setHydrated] = useState(false)

  //
  //  Keeps the draft text/date boxes in sync whenever the global values change from elsewhere
  //  (initial mount, tab navigation carrying them in, or this page's own Filter click writing
  //  them back) — never from local typing, since that only touches draftDateFrom/etc. directly.
  //
  useEffect(() => {
    setDraftDateFrom(dateFromFilter)
    setDraftOpening(openingFilter)
    setDraftEco(ecoFilter)
  }, [dateFromFilter, openingFilter, ecoFilter])

  useEffect(() => {
    //
    //  timeClass/dateFrom/opening/eco are no longer part of the draft/apply flow (now global,
    //  URL-driven filters) — strip any stale values a returning user's sessionStorage might
    //  still carry from before this change, so they can't cause a false "pending" mismatch below.
    //
    const hydratedDraft = ss<GameFilters>(`${SESSION_STORAGE_PREFIX}gl-draftFilters`, {})
    const hydratedFilters = ss<GameFilters>(`${SESSION_STORAGE_PREFIX}gl-filters`, {})
    delete hydratedDraft.timeClass
    delete hydratedFilters.timeClass
    delete hydratedDraft.dateFrom
    delete hydratedFilters.dateFrom
    delete hydratedDraft.opening
    delete hydratedFilters.opening
    delete hydratedDraft.eco
    delete hydratedFilters.eco
    setDraftFilters(hydratedDraft)
    setFilters(hydratedFilters)
    setCurrentPage(ss(`${SESSION_STORAGE_PREFIX}gl-page`, 1))
    setRowsPerPage(ss(`${SESSION_STORAGE_PREFIX}gl-rows`, GAME_LIST_ROWS_DEFAULT_Player))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}gl-draftFilters`, JSON.stringify(draftFilters))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}gl-filters`, JSON.stringify(filters))
    } catch {}
  }, [draftFilters, filters, hydrated])

  const [games, setGames] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const playersToFetch = useMemo(() => (
    players.length === 1
      ? [players[0].player]
      : playerFilter
        ? [playerFilter]
        : players.map(p => p.player)
  ), [players, playerFilter])

  //
  //  Passed to the actual query functions instead of playersToFetch — "All" (playerFilter
  //  unset, more than one tracked player) means no player filter at all, not every tracked
  //  username enumerated. playersToFetch itself stays as the "player list not loaded yet" guard.
  //
  const queryPlayers = useMemo(() => (
    players.length === 1
      ? [players[0].player]
      : playerFilter
        ? [playerFilter]
        : []
  ), [players, playerFilter])

  //
  //  timeClass/dateFrom/opening/eco merged in fresh from the URL, overriding whatever
  //  filters.* holds (always undefined after the hydration strip above, but kept explicit for
  //  clarity) — the live global values, not the draft/apply-gated ones.
  //
  const effectiveFilters = useMemo(() => ({
    ...filters,
    timeClass: timeClassFilter || undefined,
    dateFrom: dateFromFilter || undefined,
    opening: openingFilter || undefined,
    eco: ecoFilter || undefined
  }), [filters, timeClassFilter, dateFromFilter, openingFilter, ecoFilter])

  function updateFilter(key: keyof GameFilters, value: string) {
    setDraftFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else if (key === 'opponentRatingMin' || key === 'opponentRatingMax' || key === 'gdid') {
        (next as any)[key] = parseInt(value, 10) || undefined
      } else {
        (next as any)[key] = value
      }
      return next
    })
  }

  function updateTerminationFilter(terms: string[]) {
    setDraftFilters(prev => {
      const next = { ...prev }
      if (terms.length === 0) { delete next.termination } else { next.termination = terms }
      return next
    })
  }

  function handleApplyFilters() {
    setFilters(draftFilters)
    setGlobalFilters({ dateFrom: draftDateFrom, opening: draftOpening, eco: draftEco })
  }

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}gl-page`, JSON.stringify(currentPage)) } catch {}
  }, [currentPage, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}gl-rows`, JSON.stringify(rowsPerPage)) } catch {}
  }, [rowsPerPage, hydrated])

  //
  //  Reset back to page 1 whenever players/filters genuinely change, same as when the user
  //  changed them directly — guarded via filtersResetKeyRef so the one-time hydration
  //  restore above (which also changes `filters`) isn't mistaken for a real change and
  //  doesn't clobber the just-restored page number.
  //
  const filtersResetKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!hydrated) return
    const key = JSON.stringify({ playersToFetch, effectiveFilters })
    if (filtersResetKeyRef.current !== undefined && filtersResetKeyRef.current !== key) {
      setCurrentPage(1)
    }
    filtersResetKeyRef.current = key
  }, [playersToFetch, effectiveFilters, hydrated])

  //
  //  Total row count — only depends on players/filters, not the current page, so it's
  //  fetched once per filter change rather than re-queried on every page turn. Pages are
  //  derived from it locally rather than issuing a second COUNT query.
  //
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    async function fetchCount() {
      if (playersToFetch.length === 0) {
        if (!cancelled) { setTotalCount(0) }
        return
      }
      const count = await getGamesPageCount(queryPlayers, effectiveFilters, 1)
      if (!cancelled) { setTotalCount(count) }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [playersToFetch, queryPlayers, effectiveFilters, hydrated])

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage))

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    setLoading(true)

    async function fetchPage() {
      if (playersToFetch.length === 0) {
        if (!cancelled) { setGames([]); setLoading(false) }
        return
      }

      const rows = await fetchFilteredGames(queryPlayers, effectiveFilters, currentPage, rowsPerPage)

      if (!cancelled) {
        setGames(rows)
        setLoading(false)
      }
    }

    fetchPage().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playersToFetch, queryPlayers, effectiveFilters, currentPage, rowsPerPage, hydrated])

  function handleSelectGame(row: any) {
    const rowPlayer = row.gd_player
    const game: ChessComGame = {
      url: row.gd_game_url,
      pgn: '',
      time_control: row.gd_time_control,
      time_class: row.gd_time_class,
      end_time: row.gd_end_time,
      rated: row.gd_is_rated,
      rules: 'chess',
      white: {
        username: row.gd_white_username,
        rating: row.gd_white_rating,
        result: row.gd_player_color === 'white'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      },
      black: {
        username: row.gd_black_username,
        rating: row.gd_black_rating,
        result: row.gd_player_color === 'black'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      }
    }
    ;(game as any)._gdid = row.gd_gdid
    ;(game as any)._openingName = row.gd_opening_name
    ;(game as any)._ecoCode = row.gd_eco_code
    onSelectGame(game, rowPlayer)
  }

  const filtersPending = JSON.stringify(draftFilters) !== JSON.stringify(filters)
    || draftDateFrom !== dateFromFilter
    || draftOpening !== openingFilter
    || draftEco !== ecoFilter
  const dRMin = draftFilters.opponentRatingMin ?? ''
  const dRMax = draftFilters.opponentRatingMax ?? ''

  return (
    <MyBox>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-xs'>
          <thead>
            <tr className='text-gray-500'>
              <th className='pb-1 pr-2 text-gray-400'>#</th>
              <th className='pb-1 pr-2'>Player</th>
              <th className='pb-1 pr-2'>Date</th>
              <th className='pb-1 pr-2 text-gray-400'>Game #</th>
              <th className='pb-1 pr-2 text-center'>Color</th>
              <th className='pb-1 pr-2 text-center'>Time</th>
              <th className='pb-1 pr-2'>Opponent</th>
              <th className='pb-1 pr-2 text-center'>Opp. rating</th>
              <th className='pb-1 pr-2 text-center'>My rating</th>
              <th className='pb-1 pr-2 text-center'>Result</th>
              <th className='pb-1 pr-2 text-center w-36'>Termination</th>
              <th className='pb-1 pr-2'>Opening</th>
              <th className='pb-1 pr-2'>ECO</th>
              <th className='pb-1'></th>
            </tr>
            <tr>
              <th className='pb-2 pr-2'></th>
              <th className='pb-2 pr-2'>
                <FilterPlayerSelect
                  players={players.map(p => ({ player: p.player, display_name: p.displayName }))}
                  label=''
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterDateInput
                  value={draftDateFrom}
                  onChange={setDraftDateFrom}
                  min={minDate}
                  max={TODAY}
                  width={WIDTH_DATE_FROM}
                  borderClass={GLOBAL_FILTER_BORDER_CLASS}
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftFilters.gdid != null ? String(draftFilters.gdid) : ''}
                  onChange={v => updateFilter('gdid', v)}
                  width={WIDTH_GAME_NUMBER}
                />
              </th>
              <th className='pb-2 pr-2'>
                <div className='flex justify-center'>
                  <ColorSelect
                    value={draftFilters.color ?? ''}
                    onChange={v => updateFilter('color', v)}
                    label=''
                    width={WIDTH_COLOR_GAMES}
                  />
                </div>
              </th>
              <th className='pb-2 pr-2'>
                <div className='flex justify-center'>
                  <FilterTimeClassSelect
                    label=''
                    width={WIDTH_TIME_CLASS_GAMES}
                  />
                </div>
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftFilters.opponent ?? ''}
                  onChange={v => updateFilter('opponent', v)}
                  placeholder={PLACEHOLDER_TEXT_FILTER}
                  width={WIDTH_OPPONENT}
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterNumberRange
                  min={String(dRMin)}
                  max={String(dRMax)}
                  onMinChange={v => updateFilter('opponentRatingMin', v)}
                  onMaxChange={v => updateFilter('opponentRatingMax', v)}
                  width={WIDTH_OPPONENT_RATING}
                />
              </th>
              <th className='pb-2 pr-2'></th>
              <th className='pb-2 pr-2'>
                <div className='flex justify-center'>
                  <ResultSelect
                    value={draftFilters.result ?? ''}
                    onChange={v => updateFilter('result', v)}
                    label=''
                    width={WIDTH_RESULT}
                  />
                </div>
              </th>
              <th className='pb-2 pr-2'>
                <div className='flex justify-center'>
                  <TerminationMultiSelect
                    selected={draftFilters.termination ?? []}
                    onChange={updateTerminationFilter}
                    label=''
                  />
                </div>
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftOpening}
                  onChange={setDraftOpening}
                  placeholder={PLACEHOLDER_TEXT_FILTER}
                  width={WIDTH_OPENING}
                  borderClass={GLOBAL_FILTER_BORDER_CLASS}
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftEco}
                  onChange={v => setDraftEco(v.toUpperCase())}
                  width={WIDTH_ECO}
                  borderClass={GLOBAL_FILTER_BORDER_CLASS}
                />
              </th>
              <th className='pb-2'>
                <FilterActionButton
                  onClick={handleApplyFilters}
                  variant={filtersPending ? 'pending' : 'primary'}
                >
                  Filter
                </FilterActionButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={14} className='py-4 text-center text-xs text-gray-500'>Loading...</td>
              </tr>
            )}
            {!loading && games.length === 0 && (
              <tr>
                <td colSpan={14} className='py-4 text-center text-xs text-gray-500'>
                  No games found. Try adjusting your filters or populate games first.
                </td>
              </tr>
            )}
            {!loading && games.map((row, index) => {
              const date = new Date(row.gd_end_time * 1000)
              const dd = String(date.getDate()).padStart(2, '0')
              const mm = String(date.getMonth() + 1).padStart(2, '0')
              const yy = String(date.getFullYear()).slice(2)
              const hh = String(date.getHours()).padStart(2, '0')
              const min = String(date.getMinutes()).padStart(2, '0')
              const dateStr = `${dd}/${mm}/${yy} ${hh}:${min}`
              const gameNumber = (currentPage - 1) * rowsPerPage + index + 1

              return (
                <tr
                  key={row.gd_gdid}
                  className='cursor-pointer border-b border-gray-100 hover:bg-blue-50'
                  onClick={() => handleSelectGame(row)}
                >
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{gameNumber}</td>
                  <td className='py-1.5 pr-2'>{row.gd_player}</td>
                  <td className='py-1.5 pr-2 whitespace-nowrap'>{dateStr}</td>
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{row.gd_gdid}</td>
                  <td className='py-1.5 pr-2'>
                    <ColorSwatch color={row.gd_player_color} />
                  </td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center text-gray-500'>{row.gd_time_class}</div></td>
                  <td className='py-1.5 pr-2'>{row.gd_opponent_username}</td>
                  <td className='py-1.5 pr-2'><div className={`flex justify-center ${
                    (() => {
                      const myRating  = row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
                      const oppRating = row.gd_opponent_rating
                      return row.gd_player_result === 'loss' && oppRating < myRating ? 'text-red-500'
                           : row.gd_player_result === 'win'  && oppRating > myRating ? 'text-blue-500'
                           : ''
                    })()
                  }`}>{row.gd_opponent_rating}</div></td>
                  <td className='py-1.5 pr-2 text-center tabular-nums text-gray-700'>{row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating}</td>
                  <td className='py-1.5 pr-2'>
                    <div className={`flex justify-center ${RESULT_STYLES[row.gd_player_result]}`}>
                      {row.gd_player_result}
                    </div>
                  </td>
                  <td className='py-1.5 pr-2 text-center text-gray-500'>{row.gd_termination}</td>
                  <td className={`py-1.5 pr-2 ${WIDTH_OPENING} truncate`} title={row.gd_opening_name}>
                    {row.gd_opening_name || 'Unknown'}
                  </td>
                  <td className='py-1.5 pr-2 text-gray-400'>{row.gd_eco_code}</td>
                  <td className='py-1.5'>
                    <MyButton
                      onClick={(e) => { e.stopPropagation(); handleSelectGame(row) }}
                      overrideClass='text-xxs px-2 py-0.5 h-5 md:h-5'
                    >
                      Analyze
                    </MyButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className='mt-3 flex items-center justify-between'>
        <div />
        {totalPages > 1 && (
          <MyPaginationFooter
            totalPages={totalPages}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
            rowsPerPage={rowsPerPage}
            setRowsPerPage={v => { setRowsPerPage(v); setCurrentPage(1) }}
            rowsOptions={GAME_LIST_ROWS_OPTIONS_Player}
            overrideClass='flex-1'
            totalRows={totalCount}
          />
        )}
      </div>
    </MyBox>
  )
}
