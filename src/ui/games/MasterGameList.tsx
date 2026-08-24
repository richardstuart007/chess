'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterMasterPlayerSelect from '@/src/ui/filters/FilterMasterPlayerSelect'
import FilterTextInput from '@/src/ui/filters/FilterTextInput'
import FilterNumberRange from '@/src/ui/filters/FilterNumberRange'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import ColorSelect from '@/src/ui/filters/ColorSelect'
import TimeClassSelect from '@/src/ui/filters/TimeClassSelect'
import ResultSelect from '@/src/ui/filters/ResultSelect'
import TerminationMultiSelect from '@/src/ui/filters/TerminationMultiSelect'
import ColorSwatch from '@/src/ui/ColorSwatch'
import { fetchFilteredMasterGames, getMasterGamesPageCount, MasterGameFilters } from '@/src/lib/master/masterGamesList'
import {
  GAME_LIST_ROWS_DEFAULT_Master, GAME_LIST_ROWS_OPTIONS_Master, SESSION_STORAGE_PREFIX,
  WIDTH_DATE_FROM, WIDTH_COLOR_GAMES, WIDTH_TIME_CLASS_GAMES, WIDTH_OPPONENT, WIDTH_OPPONENT_RATING,
  WIDTH_GAME_NUMBER, WIDTH_RESULT, WIDTH_OPENING, WIDTH_ECO, PLACEHOLDER_TEXT_FILTER
} from '@/src/lib/constants'

const RESULT_STYLES: Record<string, string> = {
  win: 'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

//----------------------------------------------------------------------------------------------
//  MasterGameList — browsable/filterable list of synced master players' games. Mirrors GameList,
//  but every filter is local state (no shared global ?dateFrom=/?opening=/?eco= — master games are
//  a separate dataset from the tracked player's own), no player-select filter (only one master
//  player synced so far), and rows are not clickable (no master-game analyze page exists yet).
//----------------------------------------------------------------------------------------------
export default function MasterGameList() {
  const router = useRouter()
  const [draftFilters, setDraftFilters] = useState<MasterGameFilters>({})
  const [filters, setFilters] = useState<MasterGameFilters>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(GAME_LIST_ROWS_DEFAULT_Master)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setDraftFilters(ss<MasterGameFilters>(`${SESSION_STORAGE_PREFIX}mgl-draftFilters`, {}))
    setFilters(ss<MasterGameFilters>(`${SESSION_STORAGE_PREFIX}mgl-filters`, {}))
    setCurrentPage(ss(`${SESSION_STORAGE_PREFIX}mgl-page`, 1))
    setRowsPerPage(ss(`${SESSION_STORAGE_PREFIX}mgl-rows`, GAME_LIST_ROWS_DEFAULT_Master))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}mgl-draftFilters`, JSON.stringify(draftFilters))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}mgl-filters`, JSON.stringify(filters))
    } catch {}
  }, [draftFilters, filters, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}mgl-page`, JSON.stringify(currentPage)) } catch {}
  }, [currentPage, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}mgl-rows`, JSON.stringify(rowsPerPage)) } catch {}
  }, [rowsPerPage, hydrated])

  const [games, setGames] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  function updateFilter(key: keyof MasterGameFilters, value: string) {
    setDraftFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else if (key === 'opponentRatingMin' || key === 'opponentRatingMax' || key === 'mgdid') {
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
  }

  //
  //  Reset back to page 1 whenever filters genuinely change — guarded via
  //  filtersResetKeyRef so the one-time hydration restore above (which also sets
  //  filters) isn't mistaken for a real change and doesn't clobber the just-restored
  //  page number.
  //
  const filtersResetKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!hydrated) return
    const key = JSON.stringify(filters)
    if (filtersResetKeyRef.current !== undefined && filtersResetKeyRef.current !== key) {
      setCurrentPage(1)
    }
    filtersResetKeyRef.current = key
  }, [filters, hydrated])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    async function fetchCount() {
      const count = await getMasterGamesPageCount(filters, 1)
      if (!cancelled) { setTotalCount(count) }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [filters, hydrated])

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage))

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    setLoading(true)

    async function fetchPage() {
      const rows = await fetchFilteredMasterGames(filters, currentPage, rowsPerPage)
      if (!cancelled) {
        setGames(rows)
        setLoading(false)
      }
    }

    fetchPage().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters, currentPage, rowsPerPage, hydrated])

  const filtersPending = JSON.stringify(draftFilters) !== JSON.stringify(filters)
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
              <th className='pb-1 pr-2 text-center'>Player rating</th>
              <th className='pb-1 pr-2 text-center'>Result</th>
              <th className='pb-1 pr-2 text-center w-36'>Termination</th>
              <th className='pb-1 pr-2'>Opening</th>
              <th className='pb-1 pr-2'>ECO</th>
              <th className='pb-1'></th>
            </tr>
            <tr>
              <th className='pb-2 pr-2'></th>
              <th className='pb-2 pr-2'>
                <FilterMasterPlayerSelect
                  value={draftFilters.player ?? ''}
                  onChange={v => updateFilter('player', v)}
                  label=''
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterDateInput
                  value={draftFilters.dateFrom ?? ''}
                  onChange={v => updateFilter('dateFrom', v)}
                  width={WIDTH_DATE_FROM}
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftFilters.mgdid != null ? String(draftFilters.mgdid) : ''}
                  onChange={v => updateFilter('mgdid', v)}
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
                  <TimeClassSelect
                    value={draftFilters.timeClass ?? ''}
                    onChange={v => updateFilter('timeClass', v)}
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
                  value={draftFilters.opening ?? ''}
                  onChange={v => updateFilter('opening', v)}
                  placeholder={PLACEHOLDER_TEXT_FILTER}
                  width={WIDTH_OPENING}
                />
              </th>
              <th className='pb-2 pr-2'>
                <FilterTextInput
                  value={draftFilters.eco ?? ''}
                  onChange={v => updateFilter('eco', v.toUpperCase())}
                  width={WIDTH_ECO}
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
                  No master games found. Try adjusting your filters, or run the master games
                  pipeline first (Owner → Pipeline (Master Games)).
                </td>
              </tr>
            )}
            {!loading && games.map((row, index) => {
              const date = new Date(row.mgd_end_time * 1000)
              const dd = String(date.getDate()).padStart(2, '0')
              const mm = String(date.getMonth() + 1).padStart(2, '0')
              const yy = String(date.getFullYear()).slice(2)
              const hh = String(date.getHours()).padStart(2, '0')
              const min = String(date.getMinutes()).padStart(2, '0')
              const dateStr = `${dd}/${mm}/${yy} ${hh}:${min}`
              const gameNumber = (currentPage - 1) * rowsPerPage + index + 1

              return (
                <tr
                  key={row.mgd_mgdid}
                  className='cursor-pointer border-b border-gray-100 hover:bg-blue-50'
                  onClick={() => router.push(`/analyzemaster?game=${row.mgd_mgdid}`)}
                >
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{gameNumber}</td>
                  <td className='py-1.5 pr-2'>{row.mgd_player_name} ({row.mgd_player})</td>
                  <td className='py-1.5 pr-2 whitespace-nowrap'>{dateStr}</td>
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{row.mgd_mgdid}</td>
                  <td className='py-1.5 pr-2'>
                    <ColorSwatch color={row.mgd_player_color} />
                  </td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center text-gray-500'>{row.mgd_time_class}</div></td>
                  <td className='py-1.5 pr-2'>{row.mgd_opponent_username}</td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center'>{row.mgd_opponent_rating}</div></td>
                  <td className='py-1.5 pr-2 text-center tabular-nums text-gray-700'>{row.mgd_player_color === 'white' ? row.mgd_white_rating : row.mgd_black_rating}</td>
                  <td className='py-1.5 pr-2'>
                    <div className={`flex justify-center ${RESULT_STYLES[row.mgd_player_result]}`}>
                      {row.mgd_player_result}
                    </div>
                  </td>
                  <td className='py-1.5 pr-2 text-center text-gray-500'>{row.mgd_termination}</td>
                  <td className={`py-1.5 pr-2 ${WIDTH_OPENING} truncate`} title={row.mgd_opening_name}>
                    {row.mgd_opening_name || 'Unknown'}
                  </td>
                  <td className='py-1.5 pr-2 text-gray-400'>{row.mgd_eco_code}</td>
                  <td className='py-1.5'>
                    <MyButton
                      onClick={(e) => { e.stopPropagation(); router.push(`/analyzemaster?game=${row.mgd_mgdid}`) }}
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
            rowsOptions={GAME_LIST_ROWS_OPTIONS_Master}
            overrideClass='flex-1'
            totalRows={totalCount}
          />
        )}
      </div>
    </MyBox>
  )
}
