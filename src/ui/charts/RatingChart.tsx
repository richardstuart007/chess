'use client'

//==================================================================================================
//  1) DESCRIPTION
//    RatingChart — rating-over-time line chart, one series per (player, timeClass) pair,
//    auto-choosing a sensible granularity (per-game/daily/weekly/monthly) from the data's date
//    span, overridable via the Granularity dropdown.
//
//    Parameters:
//      players         — tracked players to chart
//      playerFilter    — narrows to one player when set and players.length > 1
//      filters         — only dateFrom/dateTo/timeClass are actually applied (see NOTES)
//      limit           — max games to fetch
//      onLoadingChange — optional; called with the current loading state
//      refreshNonce    — bump on every Refresh click to force a re-fetch even when nothing else
//                        changed
//
//  2) NOTES
//    A rating point reflects the player's true rating, shaped by their entire game history —
//    narrowing by Color/Opponent/Result/Termination/Opening/ECO wouldn't produce a meaningful
//    trend, only a sparser set of the same real values, so only date range and time class from
//    `filters` are actually applied here regardless of what's set via the Games tab.
//==================================================================================================

import { useMemo, useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import MySelect from 'nextjs-shared/MySelect'
import { RatingGranularity, fetchFilteredGames, GameFilters } from '@/src/lib/actions/games'
import { DEFAULT_GRAPH_GRANULARITY, WIDTH_GRAPH_GRANULARITY } from '@/src/lib/constants'

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea']

interface PlayerOption {
  player: string
  displayName: string | null
}

const GRAN_LABELS: Record<RatingGranularity, string> = {
  game: 'Per Game', day: 'Daily Avg', week: 'Weekly Avg', month: 'Monthly Avg'
}
const GRAN_MAP: Record<string, RatingGranularity> = {
  'Per Game': 'game', 'Daily Avg': 'day', 'Weekly Avg': 'week', 'Monthly Avg': 'month'
}
const POINT_DESC: Record<RatingGranularity, string> = {
  game:  'each point = 1 game',
  day:   'each point = daily average',
  week:  'each point = weekly average',
  month: 'each point = monthly average',
}

interface RatingChartProps {
  players: PlayerOption[]
  playerFilter: string
  filters: GameFilters
  limit: number
  onLoadingChange?: (loading: boolean) => void
  //
  //  Bumped by the caller on every Refresh click, even when filters/limit are
  //  unchanged — forces the fetch effect below to re-run so "Refresh" always
  //  reloads rather than only reacting to an actual value change.
  //
  refreshNonce?: number
}

export default function RatingChart({ players, playerFilter, filters, limit, onLoadingChange, refreshNonce }: RatingChartProps) {
  const [games, setGames] = useState<any[]>([])
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
  //  A rating point reflects the player's true rating, shaped by their entire game
  //  history — narrowing by Color/Opponent/Result/Termination/Opening/ECO wouldn't
  //  produce a meaningful "rating over time" trend, only a sparser set of the same
  //  real values. Only the fields still shown on this tab (date range, time class)
  //  actually apply to the fetch, regardless of what's set via the Games tab.
  //
  const graphFilters: GameFilters = useMemo(() => ({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    timeClass: filters.timeClass
  }), [filters.dateFrom, filters.dateTo, filters.timeClass])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    onLoadingChange?.(true)

    function finish() {
      setLoading(false)
      onLoadingChange?.(false)
    }

    async function load() {
      if (playersToFetch.length === 0) {
        if (!cancelled) { setGames([]); finish() }
        return
      }
      const rows = await fetchFilteredGames(queryPlayers, graphFilters, 1, limit)
      if (!cancelled) { setGames(rows); finish() }
    }

    load().catch(() => { if (!cancelled) finish() })
    return () => { cancelled = true }
  }, [playersToFetch, queryPlayers, graphFilters, limit, refreshNonce])

  // Derive unique (player, timeClass) series from the game data
  const allSeries = useMemo(() => {
    const seen = new Set<string>()
    const pairs: { player: string; timeClass: string; key: string; label: string }[] = []
    for (const g of games) {
      const key = `${g.gd_player}__${g.gd_time_class}`
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push({
          player:    g.gd_player as string,
          timeClass: g.gd_time_class as string,
          key,
          label: `${g.gd_player} (${g.gd_time_class})`
        })
      }
    }
    return pairs.sort((a, b) => a.label.localeCompare(b.label))
  }, [games])

  //
  //  Starts at Weekly rather than null — the guard below still falls back to the
  //  span-based auto pick (defaultGran) when the fetched span is too short for
  //  Weekly to be an offered option. Not persisted: always Weekly on a fresh load.
  //
  const [granularityOverride, setGranularityOverride] = useState<RatingGranularity | null>(DEFAULT_GRAPH_GRANULARITY)

  const activeSeries = allSeries

  const spanDays = useMemo(() => {
    if (games.length === 0) return 0
    const times = games.map((g: any) => g.gd_end_time as number)
    return Math.round((Math.max(...times) - Math.min(...times)) / 86400)
  }, [games])

  const available = availableGrans(spanDays)
  const granularity: RatingGranularity = granularityOverride && available.includes(granularityOverride)
    ? granularityOverride
    : defaultGran(spanDays)

  const series = useMemo(() =>
    activeSeries.map(s => ({
      key:   s.key,
      label: s.label,
      data:  aggregateForPlayer(
        games.filter((g: any) => g.gd_player === s.player && g.gd_time_class === s.timeClass),
        granularity
      )
    }))
  , [games, activeSeries.map(s => s.key).join(','), granularity])

  const { chartData, xTicks, fromMs, toMs, chartSpanDays } = useMemo(() => {
    const allDates = Array.from(
      new Set(series.flatMap(s => s.data.map(d => d.date)))
    ).sort()

    if (allDates.length === 0) return { chartData: [], xTicks: [], fromMs: 0, toMs: Date.now(), chartSpanDays: 0 }

    const dataFromMs = parseDate(allDates[0]).getTime()
    const dataToMs   = parseDate(allDates[allDates.length - 1]).getTime()
    const dataSpan   = dataToMs - dataFromMs
    const margin     = Math.max(dataSpan * 0.04, 1800000) // 4% or min 30 min
    const fromMs     = dataFromMs - margin
    const toMs       = dataToMs   + margin
    const chartSpanDays = Math.round((toMs - fromMs) / 86400000)

    const lookup = new Map<string, Map<string, number>>()
    for (const s of series) {
      const map = new Map<string, number>()
      for (const point of s.data) map.set(point.date, point.avgRating)
      lookup.set(s.key, map)
    }

    const data = allDates.map(dateStr => {
      const point: Record<string, number> = { ts: parseDate(dateStr).getTime() }
      for (const s of series) {
        const rating = lookup.get(s.key)?.get(dateStr)
        if (rating !== undefined) point[s.key] = rating
      }
      return point
    })

    const tickCount = chartSpanDays <= 1 ? 12 : chartSpanDays <= 7 ? 7 : chartSpanDays <= 60 ? 10 : 12
    const innerTicks = tickCount > 2 ? generateDateTicks(dataFromMs, dataToMs, tickCount).slice(1, -1) : []
    const xTicks = [...new Set([dataFromMs, ...innerTicks, dataToMs])]

    return { chartData: data, xTicks, fromMs, toMs, chartSpanDays }
  }, [series])

  const tickFormatter = (ts: number) => {
    const d = new Date(ts)
    if (chartSpanDays <= 1) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (chartSpanDays <= 92) return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
    if (chartSpanDays <= 400) return d.toLocaleString('default', { month: 'short' }) + ' \'' + String(d.getFullYear()).slice(2)
    return d.getMonth() === 0 ? String(d.getFullYear()) : ''
  }

  const labelFormatter = (ts: unknown) => {
    if (typeof ts !== 'number') return ''
    const d = new Date(ts)
    return chartSpanDays <= 92
      ? d.toLocaleString('default', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('default', { month: 'long', year: 'numeric' })
  }

  return (
    <MyBox title='Rating Over Time'>
      <div className='mb-1 flex flex-wrap items-center gap-3'>
        <MySelect
          label='Granularity'
          options={Object.entries(GRAN_LABELS)
            .filter(([k]) => available.includes(k as RatingGranularity))
            .map(([, v]) => v)}
          value={GRAN_LABELS[granularity]}
          onChange={e => setGranularityOverride(GRAN_MAP[e.target.value])}
          overrideClass={`${WIDTH_GRAPH_GRANULARITY} h-6 md:h-6`}
        />
      </div>
      <p className='mb-3 text-xxs text-gray-400'>{POINT_DESC[granularity]}</p>

      {!loading && chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No games found for the current filters.</p>
      )}

      {chartData.length > 0 && (
        <ResponsiveContainer width='100%' height={300}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis
              dataKey='ts'
              type='number'
              scale='time'
              domain={[fromMs, toMs]}
              ticks={xTicks}
              interval={0}
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9 }}
              height={30}
            />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={45} />
            <Tooltip
              labelFormatter={labelFormatter}
              formatter={(value, name) => [value, name]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type='monotone'
                dataKey={s.key}
                name={s.label}
                stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                dot={granularity === 'game' ? { r: 2 } : false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </MyBox>
  )
}

//----------------------------------------------------------------------------------------------
//  availableGrans — granularity options that make sense for a date span this wide
//----------------------------------------------------------------------------------------------
function availableGrans(spanDays: number): RatingGranularity[] {
  if (spanDays < 2)   return ['game']
  if (spanDays < 14)  return ['game', 'day']
  if (spanDays < 60)  return ['game', 'day', 'week']
  return ['day', 'week', 'month']
}

//----------------------------------------------------------------------------------------------
//  defaultGran — the granularity auto-selected for a date span this wide, absent a manual
//  override
//----------------------------------------------------------------------------------------------
function defaultGran(spanDays: number): RatingGranularity {
  if (spanDays < 2)   return 'game'
  if (spanDays < 14)  return 'game'
  if (spanDays < 60)  return 'day'
  if (spanDays < 365) return 'week'
  return 'month'
}

//----------------------------------------------------------------------------------------------
//  aggregateForPlayer — one player's rows reduced to one point per game, or averaged into
//  day/week/month buckets
//----------------------------------------------------------------------------------------------
function aggregateForPlayer(rows: any[], granularity: RatingGranularity): { date: string; avgRating: number }[] {
  if (rows.length === 0) return []

  if (granularity === 'game') {
    return rows
      .map(row => ({
        date: new Date(row.gd_end_time * 1000).toISOString(),
        avgRating: row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const d = new Date(row.gd_end_time * 1000)
    let key: string
    if (granularity === 'day') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } else if (granularity === 'week') {
      const day = d.getDay()
      const mon = new Date(d)
      mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
      key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const rating = row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(rating)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ratings]) => ({
      date: key,
      avgRating: Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length)
    }))
}

//----------------------------------------------------------------------------------------------
//  parseDate — 'YYYY-MM-DD' or a full ISO string to a local Date
//----------------------------------------------------------------------------------------------
function parseDate(d: string): Date {
  if (d.length > 10) return new Date(d)
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day ?? 1)
}

//----------------------------------------------------------------------------------------------
//  generateDateTicks — count evenly-spaced timestamps between fromMs and toMs, for the x-axis
//----------------------------------------------------------------------------------------------
function generateDateTicks(fromMs: number, toMs: number, count: number): number[] {
  if (count <= 1) return [fromMs]
  return Array.from({ length: count }, (_, i) =>
    Math.round(fromMs + (i / (count - 1)) * (toMs - fromMs))
  )
}
