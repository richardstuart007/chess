'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import ColorSelect from '@/src/ui/filters/ColorSelect'
import FilterTimeClassSelect from '@/src/ui/filters/FilterTimeClassSelect'
import { getTerminationStats } from '@/src/lib/actions/games'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import { DEFAULT_DATE_FROM_Player, SESSION_STORAGE_PREFIX, WIDTH_DATE_FROM, GLOBAL_FILTER_BORDER_CLASS } from '@/src/lib/constants'

const TODAY = new Date().toISOString().slice(0, 10)

interface TerminationChartProps {
  players: { player: string; display_name: string | null }[]
}

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

export default function TerminationChart({ players }: TerminationChartProps) {
  const searchParams = useSearchParams()
  const playerFilter = searchParams.get('player') ?? ''
  const playersToFetch = useMemo(
    () => playerFilter ? [playerFilter] : players.map(p => p.player),
    [playerFilter, players]
  )

  //
  //  Passed to the actual query functions instead of playersToFetch — "All" (playerFilter
  //  unset) means no player filter at all, not every tracked username enumerated.
  //  playersToFetch itself stays as the "player list not loaded yet" guard.
  //
  const queryPlayers = useMemo(
    () => playerFilter ? [playerFilter] : [],
    [playerFilter]
  )

  //
  //  Time-class selection is shared with the PlayerProfile header (rating badge clicks) and
  //  every other page with a Time filter via `?timeClass=` — applies immediately.
  //
  const timeClassFilter = searchParams.get('timeClass') ?? ''

  //
  //  Date From is also global (shared via URL with every other page that has this filter).
  //  This page has no Filter/Refresh gate at all — every filter already applies instantly — so
  //  dateFrom becomes global the same way, no draft state needed. Absent still defaults to
  //  DEFAULT_DATE_FROM_Player, matching today's behavior.
  //
  const [rawDateFromFilter, setDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player

  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [color, setColor] = useState('')
  const [data, setData] = useState<{ termination: string; win: number; loss: number; total: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setColor(ss(`${SESSION_STORAGE_PREFIX}tc-color`, ''))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || playersToFetch.length === 0) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const rows = await getTerminationStats(
        queryPlayers,
        dateFromFilter || undefined,
        color || undefined,
        timeClassFilter || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playersToFetch, queryPlayers, color, dateFromFilter, timeClassFilter, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}tc-color`, JSON.stringify(color))
    } catch {}
  }, [color, hydrated])

  const chartData = data.map(r => ({
    name: r.termination,
    Win:  r.win,
    Loss: r.loss,
    total: r.total
  }))

  return (
    <MyBox title='How Games End'>
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        <FilterPlayerSelect players={players} />
        <ColorSelect
          value={color}
          onChange={setColor}
        />
        <FilterTimeClassSelect />
        <FilterDateInput
          label='From'
          value={dateFromFilter}
          onChange={setDateFromFilter}
          max={TODAY}
          width={WIDTH_DATE_FROM}
          borderClass={GLOBAL_FILTER_BORDER_CLASS}
        />
        {rawDateFromFilter && (
          <FilterActionButton
            onClick={() => setDateFromFilter('')}
            variant='secondary'
          >
            Clear
          </FilterActionButton>
        )}
      </div>

      {loading && <p className='text-xs text-gray-400'>Loading...</p>}

      {!loading && chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No data.</p>
      )}

      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width='100%' height={320}>
          <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' vertical={false} />
            <XAxis
              dataKey='name'
              tick={{ fontSize: 10 }}
              angle={-35}
              textAnchor='end'
              interval={0}
              height={60}
            />
            <YAxis tick={{ fontSize: 10 }} width={45} />
            <Tooltip
              formatter={(value, name, props) => {
                const total = (props as any).payload?.total ?? 0
                const pct = total > 0 && typeof value === 'number'
                  ? ` (${Math.round((value / total) * 100)}%)`
                  : ''
                return [`${value}${pct}`, name]
              }}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey='Win'  stackId='a' fill='#16a34a' />
            <Bar dataKey='Loss' stackId='a' fill='#dc2626' radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </MyBox>
  )
}
