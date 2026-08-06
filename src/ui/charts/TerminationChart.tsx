'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import { getTerminationStats } from '@/src/lib/actions/games'
import { DEFAULT_DATE_FROM, SESSION_STORAGE_PREFIX } from '@/src/lib/constants'

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
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [color, setColor] = useState('')
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM)
  const [data, setData] = useState<{ termination: string; win: number; loss: number; total: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setColor(ss(`${SESSION_STORAGE_PREFIX}tc-color`, ''))
    setDateFrom(ss(`${SESSION_STORAGE_PREFIX}tc-dateFrom`, DEFAULT_DATE_FROM))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || playersToFetch.length === 0) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const rows = await getTerminationStats(
        playersToFetch,
        dateFrom || undefined,
        color || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playersToFetch, color, dateFrom, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}tc-color`, JSON.stringify(color))
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}tc-dateFrom`, JSON.stringify(dateFrom))
    } catch {}
  }, [color, dateFrom, hydrated])

  const chartData = data.map(r => ({
    name: r.termination,
    Win:  r.win,
    Loss: r.loss,
    total: r.total
  }))

  return (
    <MyBox title='How Games End'>
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        <FilterPlayerSelect players={players} width='w-24' />
        <FilterSelect
          label='Colour'
          options={[{ value: '', label: 'All' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]}
          value={color}
          onChange={setColor}
          width='w-20'
        />
        <FilterDateInput
          label='From'
          value={dateFrom}
          onChange={setDateFrom}
          max={TODAY}
          width='w-32'
        />
        {dateFrom && (
          <FilterActionButton
            onClick={() => setDateFrom('')}
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
