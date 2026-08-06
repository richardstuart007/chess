'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import RatingChart from '@/src/ui/charts/RatingChart'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import { getPlayers } from '@/src/lib/actions/players'
import { getEarliestGameDate, GameFilters } from '@/src/lib/actions/games'
import { DEFAULT_DATE_FROM, SESSION_STORAGE_PREFIX } from '@/src/lib/constants'

const STORAGE_KEY = `${SESSION_STORAGE_PREFIX}graph_filters`
const TODAY = new Date().toISOString().slice(0, 10)
const GRAPH_LIMIT_OPTIONS: { value: string; label: string }[] = [
  { value: '1000', label: '1,000' },
  { value: '10000', label: '10,000' },
  { value: '0', label: 'All' }
]

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

function GraphContent() {
  const searchParams = useSearchParams()
  const [players,   setPlayers]   = useState<{ player: string; display_name: string | null }[]>([])
  const playerFilter = searchParams.get('player') ?? ''
  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [dateFrom,  setDateFrom]  = useState(DEFAULT_DATE_FROM)
  const [timeClass, setTimeClass] = useState('')
  const [limit,     setLimit]     = useState(1000)
  const [minDate,   setMinDate]   = useState<string | undefined>()
  const [loading,   setLoading]   = useState(false)
  const [hydrated,  setHydrated]  = useState(false)

  const playerOptions = useMemo(
    () => players.map(p => ({ player: p.player, displayName: p.display_name })),
    [players]
  )

  const [appliedFilters, setAppliedFilters] = useState<GameFilters>({ dateFrom: DEFAULT_DATE_FROM })
  const [appliedLimit,   setAppliedLimit]   = useState(1000)
  const [refreshNonce,   setRefreshNonce]   = useState(0)

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  useEffect(() => {
    setDateFrom(ss(STORAGE_KEY + '_dateFrom', DEFAULT_DATE_FROM))
    setTimeClass(ss(STORAGE_KEY + '_timeClass', ''))
    setLimit(ss(STORAGE_KEY + '_limit', 1000))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem(STORAGE_KEY + '_dateFrom', JSON.stringify(dateFrom))
    sessionStorage.setItem(STORAGE_KEY + '_timeClass', JSON.stringify(timeClass))
    sessionStorage.setItem(STORAGE_KEY + '_limit', JSON.stringify(limit))
  }, [dateFrom, timeClass, limit, hydrated])

  useEffect(() => {
    async function fetchMin() {
      const playersToFetch = playerFilter ? [playerFilter] : players.map(p => p.player)
      if (playersToFetch.length === 0) return
      const min = await getEarliestGameDate(playersToFetch)
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerFilter, players])

  //
  //  Applied filters only change on Refresh, same draft/applied split the shared
  //  Games/Graph tab used to have, kept local to this page now. Also re-syncs once right
  //  after the hydration restore above (`hydrated` flips true) so a restored dateFrom/
  //  timeClass/limit doesn't show as a spurious "pending" change the user never made.
  //
  useEffect(() => {
    setAppliedFilters({ dateFrom: dateFrom || undefined, timeClass: timeClass || undefined })
    setAppliedLimit(limit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerFilter, hydrated])

  function handleRefresh() {
    setAppliedFilters({ dateFrom: dateFrom || undefined, timeClass: timeClass || undefined })
    setAppliedLimit(limit)
    setRefreshNonce(n => n + 1)
  }

  const filtersPending = (dateFrom || undefined) !== appliedFilters.dateFrom
    || (timeClass || undefined) !== appliedFilters.timeClass
    || limit !== appliedLimit

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h1 className='text-2xl font-bold'>Rating Graph</h1>
        <div className='flex items-end gap-3 text-xs'>
          <FilterPlayerSelect players={players} width='w-24' />

          <FilterDateInput
            label='From'
            value={dateFrom}
            onChange={setDateFrom}
            min={minDate}
            max={TODAY}
            width='w-32'
          />

          <FilterSelect
            label='Time'
            options={[{ value: '', label: 'All' }, { value: 'blitz', label: 'Blitz' }, { value: 'rapid', label: 'Rapid' }]}
            value={timeClass}
            onChange={setTimeClass}
            width='w-20'
          />

          <FilterSelect
            label='Records'
            options={GRAPH_LIMIT_OPTIONS}
            value={String(limit)}
            onChange={v => setLimit(Number(v))}
            width='w-20'
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
          filters={appliedFilters}
          limit={appliedLimit}
          onLoadingChange={setLoading}
          refreshNonce={refreshNonce}
        />
      )}
    </div>
  )
}

export default function GraphPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <GraphContent />
    </Suspense>
  )
}
