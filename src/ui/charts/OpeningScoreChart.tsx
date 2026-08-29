'use client'

//==================================================================================================
//  1) DESCRIPTION
//    OpeningScoreChart — bar chart of score% by opening. Clicking a bar navigates to the Games
//    tab with that opening preset (via onSelectOpening) — there is no inline game list any more.
//    NO chart filter re-fetches on change — Player, Colour, Time Class, Min games, From and Date
//    From are all staged and only take effect on the Refresh button (via the applied* snapshot).
//    Colour / From / Min games / Show selections persist to sessionStorage.
//
//    Parameters:
//      players         — tracked players to fetch openings for (narrowed by the global ?player=)
//      onSelectOpening — optional; called with (eco, openingName, color) when a bar is clicked —
//                        color is the chart's applied Colour, so the Games tab it navigates to
//                        shows the identical game set the bar represents
//
//  3) CHANGE HISTORY
//    2026-08-29 — every chart filter (incl. global Player/Time Class) gated behind a Refresh
//                 button via an "applied" snapshot; From default Best→Worst, Show default 20→All
//    2026-08-29 — removed the inline per-opening game list; a bar click now navigates to the
//                 Games tab with the opening preset (onSelectGame prop → onSelectOpening)
//==================================================================================================

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, LabelList, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import ColorSelect from '@/src/ui/filters/ColorSelect'
import FilterTimeClassSelect from '@/src/ui/filters/FilterTimeClassSelect'
import { getOpeningScores } from '@/src/lib/actions/games'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import {
  DEFAULT_DATE_FROM_Player, DEFAULT_MIN_GAMES_Player,
  DEFAULT_OPENINGS_SORT_FROM, DEFAULT_OPENINGS_SHOW, SESSION_STORAGE_PREFIX,
  WIDTH_MIN_GAMES, WIDTH_SORT_DIRECTION, WIDTH_RESULTS_COUNT, WIDTH_DATE_FROM,
  GLOBAL_FILTER_BORDER_CLASS
} from '@/src/lib/constants'

const MIN_GAMES_OPTIONS = ['10', '25', '50', '100', '200', '500']
const RESULTS_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: '10' }, { value: '20', label: '20' }, { value: '30', label: '30' },
  { value: '50', label: '50' }, { value: '0', label: 'All' }
]
const TODAY = new Date().toISOString().slice(0, 10)

interface OpeningScoreChartProps {
  players: { player: string; display_name: string | null }[]
  onSelectOpening?: (eco: string, openingName: string, color: '' | 'white' | 'black') => void
}

export default function OpeningScoreChart({ players, onSelectOpening }: OpeningScoreChartProps) {
  const searchParams = useSearchParams()

  //
  //  Live filter values. Player and Time Class are global URL params (their shared dropdowns
  //  write them immediately); Colour / Min games / From / Show are local state; Date From is a
  //  local draft. None of these drive the query directly — only the applied* snapshot below does,
  //  so nothing re-fetches until the Refresh button.
  //
  const playerFilter = searchParams.get('player') ?? ''
  const timeClassFilter = searchParams.get('timeClass') ?? ''
  const [rawDateFromFilter, setDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromFilter)

  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [color, setColor]               = useState<'' | 'white' | 'black'>('')
  const [from, setFrom]                 = useState<'Best' | 'Worst'>(DEFAULT_OPENINGS_SORT_FROM)
  const [minGames, setMinGames]         = useState(DEFAULT_MIN_GAMES_Player)
  const [resultsCount, setResultsCount] = useState(DEFAULT_OPENINGS_SHOW)
  const [data, setData]                 = useState<{ eco_code: string; opening_name: string; games: number; score_pct: number }[]>([])
  const [loading, setLoading]           = useState(false)

  //
  //  Applied snapshot — the ONLY inputs the load effect reads. Updated on Refresh, and seeded
  //  once on hydration (from the restored drafts + current URL) so a reload shows data without a
  //  manual Refresh. refreshNonce forces a re-fetch even when nothing else changed.
  //
  const [appliedPlayer,       setAppliedPlayer]       = useState('')
  const [appliedTimeClass,    setAppliedTimeClass]    = useState('')
  const [appliedColor,        setAppliedColor]        = useState<'' | 'white' | 'black'>('')
  const [appliedMinGames,     setAppliedMinGames]     = useState(DEFAULT_MIN_GAMES_Player)
  const [appliedFrom,         setAppliedFrom]         = useState<'Best' | 'Worst'>(DEFAULT_OPENINGS_SORT_FROM)
  const [appliedResultsCount, setAppliedResultsCount] = useState(DEFAULT_OPENINGS_SHOW)
  const [appliedDateFrom,     setAppliedDateFrom]     = useState(dateFromFilter)
  const [refreshNonce,        setRefreshNonce]        = useState(0)
  const [hydrated,            setHydrated]            = useState(false)

  //
  //  "All" (appliedPlayer unset) means no player filter at all, not every tracked username
  //  enumerated. The players.length check in the load effect covers "player list not loaded yet".
  //
  const appliedQueryPlayers = useMemo(
    () => appliedPlayer ? [appliedPlayer] : [],
    [appliedPlayer]
  )

  useEffect(() => {
    const rawStoredColor = sso<string>(`${SESSION_STORAGE_PREFIX}osc-color`, '')
    const storedColor: '' | 'white' | 'black' = rawStoredColor === 'white' || rawStoredColor === 'black' ? rawStoredColor : ''
    const storedFrom = sso<'Best' | 'Worst'>(`${SESSION_STORAGE_PREFIX}osc-from`, DEFAULT_OPENINGS_SORT_FROM)
    const storedMinGames = sso(`${SESSION_STORAGE_PREFIX}osc-mingames`, DEFAULT_MIN_GAMES_Player)
    const storedResultsCount = sso(`${SESSION_STORAGE_PREFIX}osc-results-count`, DEFAULT_OPENINGS_SHOW)
    setColor(storedColor)
    setFrom(storedFrom)
    setMinGames(storedMinGames)
    setResultsCount(storedResultsCount)
    //
    //  Seed the applied snapshot from the restored drafts + current URL so the first load
    //  reflects whatever sessionStorage / the URL already hold, no manual Refresh needed.
    //
    setAppliedColor(storedColor)
    setAppliedFrom(storedFrom)
    setAppliedMinGames(storedMinGames)
    setAppliedResultsCount(storedResultsCount)
    setAppliedPlayer(playerFilter)
    setAppliedTimeClass(timeClassFilter)
    setAppliedDateFrom(dateFromFilter)
    setHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //
  //  Keep the draft date box in sync when the global value changes from elsewhere (tab
  //  navigation carrying it in, or this chart's own Refresh writing it back) — never from local
  //  typing, which only touches draftDateFrom directly.
  //
  useEffect(() => {
    setDraftDateFrom(dateFromFilter)
  }, [dateFromFilter])

  useEffect(() => {
    if (!hydrated || players.length === 0) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const limit   = appliedResultsCount === '0' ? 0 : parseInt(appliedResultsCount, 10)
      const sortDir = appliedFrom === 'Best' ? 'DESC' : 'ASC'
      const rows = await getOpeningScores(
        appliedQueryPlayers, appliedColor,
        parseInt(appliedMinGames, 10), limit, sortDir,
        appliedDateFrom || undefined,
        appliedTimeClass || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appliedQueryPlayers, appliedColor, appliedFrom, appliedMinGames, appliedResultsCount, appliedDateFrom, appliedTimeClass, refreshNonce, hydrated, players.length])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}osc-color`, JSON.stringify(color))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}osc-from`, JSON.stringify(from))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}osc-mingames`, JSON.stringify(minGames))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}osc-results-count`, JSON.stringify(resultsCount))
    } catch {}
  }, [color, from, minGames, resultsCount, hydrated])

  function handleBarClick(barDatum: any) {
    const eco = barDatum?.eco
    if (!eco) return
    onSelectOpening?.(eco, barDatum.fullName ?? eco, appliedColor)
  }

  //
  //  Refresh — commit every live/draft filter into the applied snapshot (and the date back to
  //  the global URL), then bump the nonce to force the load effect to run.
  //
  function handleRefresh() {
    setDateFromFilter(draftDateFrom)
    setAppliedPlayer(playerFilter)
    setAppliedTimeClass(timeClassFilter)
    setAppliedColor(color)
    setAppliedMinGames(minGames)
    setAppliedFrom(from)
    setAppliedResultsCount(resultsCount)
    setAppliedDateFrom(draftDateFrom || DEFAULT_DATE_FROM_Player)
    setRefreshNonce(n => n + 1)
  }

  const filtersPending = playerFilter !== appliedPlayer
    || timeClassFilter !== appliedTimeClass
    || color !== appliedColor
    || minGames !== appliedMinGames
    || from !== appliedFrom
    || resultsCount !== appliedResultsCount
    || draftDateFrom !== appliedDateFrom

  const chartData = data.map(r => ({
    label:     `${r.eco_code} ${r.opening_name}`.slice(0, 100),
    fullName:  r.opening_name,
    eco:       r.eco_code,
    score_pct: r.score_pct,
    games:     r.games
  }))

  const chartHeight = Math.max(200, chartData.length * 28)

  return (
    <MyBox title='Openings'>
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        <FilterPlayerSelect players={players} />
        <ColorSelect
          value={color}
          onChange={v => setColor(v as '' | 'white' | 'black')}
        />
        <FilterTimeClassSelect />
        <FilterSelect
          label='Min games'
          options={MIN_GAMES_OPTIONS}
          value={minGames}
          onChange={setMinGames}
          width={WIDTH_MIN_GAMES}
        />
        <FilterSelect
          label='From'
          options={[{ value: 'Best', label: 'Best' }, { value: 'Worst', label: 'Worst' }]}
          value={from}
          onChange={v => setFrom(v as 'Best' | 'Worst')}
          width={WIDTH_SORT_DIRECTION}
        />
        <FilterSelect
          label='Show'
          options={RESULTS_OPTIONS}
          value={resultsCount}
          onChange={setResultsCount}
          width={WIDTH_RESULTS_COUNT}
        />
        <FilterDateInput
          label='From date'
          value={draftDateFrom}
          onChange={setDraftDateFrom}
          max={TODAY}
          width={WIDTH_DATE_FROM}
          borderClass={GLOBAL_FILTER_BORDER_CLASS}
        />
        <FilterActionButton
          onClick={handleRefresh}
          disabled={loading}
          variant={filtersPending ? 'pending' : 'primary'}
        >
          {loading ? 'Fetching...' : 'Refresh'}
        </FilterActionButton>
      </div>

      {loading && <p className='text-xs text-gray-400'>Loading...</p>}

      {!loading && chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No openings with {minGames}+ games.</p>
      )}

      {!loading && chartData.length > 0 && (
        <>
          <p className='mb-1 text-xxs text-gray-400'>Click a bar to open its games on the Games tab</p>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <BarChart
              layout='vertical'
              data={chartData}
              margin={{ top: 4, right: 55, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray='3 3' horizontal={false} stroke='#f0f0f0' />
              <XAxis
                type='number'
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 9 }}
              />
              <YAxis
                type='category'
                dataKey='label'
                tick={{ fontSize: 9, width: 480 }}
                width={480}
              />
              <Tooltip
                formatter={(value: any, _: any, props: any) =>
                  [`${props.payload.score_pct}% (${props.payload.games} games)`, props.payload.eco]
                }
                labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ''}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey='score_pct' radius={[0, 3, 3, 0]} onClick={handleBarClick} cursor='pointer'>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.score_pct)} />
                ))}
                <LabelList
                  dataKey='score_pct'
                  position='right'
                  formatter={(v) => `${v ?? ''}%`}
                  style={{ fontSize: 9, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </MyBox>
  )
}

//----------------------------------------------------------------------------------------------
//  sso — read+parse a sessionStorage value, falling back if unset/corrupt/unavailable (SSR)
//----------------------------------------------------------------------------------------------
function sso<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

//----------------------------------------------------------------------------------------------
//  barColor — bar fill color by score percentage (green 60+, gray 40-59, red below 40)
//----------------------------------------------------------------------------------------------
function barColor(score: number): string {
  if (score >= 60) return '#16a34a'
  if (score >= 40) return '#6b7280'
  return '#dc2626'
}
