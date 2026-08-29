'use client'

//==================================================================================================
//  1) DESCRIPTION
//    GraphPage — /graph. Renders RatingChart behind Player/Date From/Time Class/Records filters,
//    behind a Suspense boundary. Player and Time Class apply instantly (shared global URL state);
//    Date From and Records are staged as drafts and only take effect on Refresh. Time Class is a
//    player-aware single-select (FilterGraphTimeClassSelect) — no "All" — so the chart always
//    plots one series per player for exactly one class.
//==================================================================================================

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import RatingChart from '@/src/ui/charts/RatingChart'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import FilterGraphTimeClassSelect from '@/src/ui/filters/FilterGraphTimeClassSelect'
import { getPlayers } from '@/src/lib/actions/players'
import { getEarliestGameDate, GameFilters } from '@/src/lib/actions/games'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import { DEFAULT_DATE_FROM_Player, DEFAULT_GRAPH_LIMIT, SESSION_STORAGE_PREFIX, WIDTH_DATE_FROM, WIDTH_GRAPH_LIMIT, GLOBAL_FILTER_BORDER_CLASS } from '@/src/lib/constants'

const STORAGE_KEY = `${SESSION_STORAGE_PREFIX}graph_filters`
const TODAY = new Date().toISOString().slice(0, 10)
const GRAPH_LIMIT_OPTIONS: { value: string; label: string }[] = [
  { value: '1000', label: '1,000' },
  { value: '10000', label: '10,000' },
  { value: '0', label: 'All' }
]

export default function GraphPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <GraphContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  GraphContent — holds all filter state (player/timeClass global via URL, dateFrom/limit
//  staged as drafts) and renders RatingChart once players are loaded
//----------------------------------------------------------------------------------
function GraphContent() {
  const searchParams = useSearchParams()
  const [players,   setPlayers]   = useState<{ player: string; display_name: string | null }[]>([])
  const playerFilter = searchParams.get('player') ?? ''
  //
  //  Time-class selection is shared with the PlayerProfile header (rating badge clicks) and
  //  every other page with a Time filter via `?timeClass=` — applies immediately, unlike
  //  dateFrom/limit below, which only update on Refresh.
  //
  const timeClassFilter = searchParams.get('timeClass') ?? ''
  //
  //  Date From is also global (shared via URL with every other page that has this filter) —
  //  but unlike timeClass, stays gated behind Refresh below. Absent still defaults to
  //  DEFAULT_DATE_FROM_Player, matching today's behavior.
  //
  const [rawDateFromFilter, setDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromFilter)
  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [limit,     setLimit]     = useState(DEFAULT_GRAPH_LIMIT)
  const [minDate,   setMinDate]   = useState<string | undefined>()
  const [loading,   setLoading]   = useState(false)
  const [hydrated,  setHydrated]  = useState(false)

  const playerOptions = useMemo(
    () => players.map(p => ({ player: p.player, displayName: p.display_name })),
    [players]
  )

  const [appliedLimit,   setAppliedLimit]   = useState(DEFAULT_GRAPH_LIMIT)
  const [refreshNonce,   setRefreshNonce]   = useState(0)

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  //
  //  Keeps the draft date box in sync whenever the global value changes from elsewhere
  //  (initial mount, tab navigation carrying it in, or this page's own Refresh click writing
  //  it back) — never from local typing, since that only touches draftDateFrom directly.
  //
  useEffect(() => {
    setDraftDateFrom(dateFromFilter)
  }, [dateFromFilter])

  useEffect(() => {
    setLimit(ss(STORAGE_KEY + '_limit', DEFAULT_GRAPH_LIMIT))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem(STORAGE_KEY + '_limit', JSON.stringify(limit))
  }, [limit, hydrated])

  useEffect(() => {
    //
    //  "All" (playerFilter unset) means no player filter at all, not every tracked
    //  username enumerated — the players.length guard below covers "player list not
    //  loaded yet" instead, since queryPlayers is legitimately [] once players.length > 0.
    //
    async function fetchMin() {
      if (players.length === 0) return
      const queryPlayers = playerFilter ? [playerFilter] : []
      const min = await getEarliestGameDate(queryPlayers)
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerFilter, players])

  //
  //  Applied limit only changes on Refresh. Also re-syncs once right after the hydration
  //  restore above (`hydrated` flips true) so a restored limit doesn't show as a spurious
  //  "pending" change the user never made. dateFrom/timeClass are handled separately below
  //  (effectiveFilters) since they're global URL values, not part of this local gate.
  //
  useEffect(() => {
    setAppliedLimit(limit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerFilter, hydrated])

  function handleRefresh() {
    setDateFromFilter(draftDateFrom)
    setAppliedLimit(limit)
    setRefreshNonce(n => n + 1)
  }

  //
  //  dateFrom/timeClass merged in fresh from the URL — timeClass is instant, dateFrom is
  //  gated behind Refresh (via setDateFromFilter in handleRefresh above) but both live in the
  //  URL, not local component state.
  //
  const effectiveFilters: GameFilters = useMemo(() => ({
    dateFrom: dateFromFilter || undefined,
    timeClass: timeClassFilter || undefined
  }), [dateFromFilter, timeClassFilter])

  const filtersPending = draftDateFrom !== dateFromFilter
    || limit !== appliedLimit

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h1 className='text-2xl font-bold'>Rating Graph</h1>
        <div className='flex items-end gap-3 text-xs'>
          <FilterPlayerSelect players={players} />

          <FilterDateInput
            label='From'
            value={draftDateFrom}
            onChange={setDraftDateFrom}
            min={minDate}
            max={TODAY}
            width={WIDTH_DATE_FROM}
            borderClass={GLOBAL_FILTER_BORDER_CLASS}
          />

          <FilterGraphTimeClassSelect players={players} />

          <FilterSelect
            label='Records'
            options={GRAPH_LIMIT_OPTIONS}
            value={String(limit)}
            onChange={v => setLimit(Number(v))}
            width={WIDTH_GRAPH_LIMIT}
          />

          <FilterActionButton
            onClick={handleRefresh}
            disabled={loading}
            variant={filtersPending ? 'pending' : 'primary'}
          >
            {loading ? 'Fetching...' : 'Refresh'}
          </FilterActionButton>
        </div>
      </div>

      {players.length > 0 && (
        <RatingChart
          players={playerOptions}
          playerFilter={playerFilter}
          filters={effectiveFilters}
          limit={appliedLimit}
          onLoadingChange={setLoading}
          refreshNonce={refreshNonce}
        />
      )}
    </div>
  )
}

//----------------------------------------------------------------------------------
//  ss — read+parse a sessionStorage value, falling back if unset/corrupt/unavailable (SSR)
//----------------------------------------------------------------------------------
function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
