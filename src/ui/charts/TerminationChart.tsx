'use client'

//==================================================================================================
//  1) DESCRIPTION
//    TerminationChart — stacked win/loss bar chart by termination type. NO filter re-fetches on
//    change — Player, Colour, Time Class and Date From are all staged and only take effect on the
//    Refresh button. Colour persists to sessionStorage; Player/Time Class/Date From are global URL
//    params (still written live by their shared controls, but the chart ignores them until Refresh).
//
//    Parameters:
//      players — tracked players to fetch termination stats for (narrowed by the global ?player=)
//
//  3) CHANGE HISTORY
//    2026-08-29 — every filter (incl. the global Player/Time Class) now gated behind a Refresh
//                 button via an "applied" snapshot layer; removed the old dateFrom "Clear" button
//==================================================================================================

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

export default function TerminationChart({ players }: TerminationChartProps) {
  const searchParams = useSearchParams()

  //
  //  Live filter values. Player and Time Class come from the global URL params (their shared
  //  dropdowns write them immediately); Colour is local state; Date From is a local draft. None
  //  of these drive the query directly — only the applied* snapshot below does.
  //
  const playerFilter = searchParams.get('player') ?? ''
  const timeClassFilter = searchParams.get('timeClass') ?? ''
  const [rawDateFromFilter, setDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player
  const [color, setColor] = useState('')
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromFilter)

  //
  //  Applied snapshot — the ONLY inputs the load effect reads. Updated on Refresh (and seeded
  //  once on hydration so a reload shows data without a manual Refresh). refreshNonce forces a
  //  re-fetch even when nothing else changed.
  //
  const [appliedPlayer,    setAppliedPlayer]    = useState('')
  const [appliedTimeClass, setAppliedTimeClass] = useState('')
  const [appliedColor,     setAppliedColor]     = useState('')
  const [appliedDateFrom,  setAppliedDateFrom]  = useState(dateFromFilter)
  const [refreshNonce,     setRefreshNonce]     = useState(0)

  const [data, setData] = useState<{ termination: string; win: number; loss: number; total: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  //
  //  "All" (appliedPlayer unset) means no player filter at all, not every tracked username
  //  enumerated. The players.length check in the load effect covers "player list not loaded yet".
  //
  const appliedQueryPlayers = useMemo(
    () => appliedPlayer ? [appliedPlayer] : [],
    [appliedPlayer]
  )

  //
  //  Restore persisted Colour, then seed the applied snapshot from the current live values so the
  //  first load reflects whatever the URL / sessionStorage already hold.
  //
  useEffect(() => {
    const storedColor = ss(`${SESSION_STORAGE_PREFIX}tc-color`, '')
    setColor(storedColor)
    setAppliedColor(storedColor)
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
      const rows = await getTerminationStats(
        appliedQueryPlayers,
        appliedDateFrom || undefined,
        appliedColor || undefined,
        appliedTimeClass || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appliedQueryPlayers, appliedDateFrom, appliedColor, appliedTimeClass, refreshNonce, hydrated, players.length])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}tc-color`, JSON.stringify(color))
    } catch {}
  }, [color, hydrated])

  //
  //  Refresh — commit every live/draft filter into the applied snapshot (and the date back to
  //  the global URL), then bump the nonce to force the load effect to run.
  //
  function handleRefresh() {
    setDateFromFilter(draftDateFrom)
    setAppliedPlayer(playerFilter)
    setAppliedTimeClass(timeClassFilter)
    setAppliedColor(color)
    setAppliedDateFrom(draftDateFrom || DEFAULT_DATE_FROM_Player)
    setRefreshNonce(n => n + 1)
  }

  const filtersPending = playerFilter !== appliedPlayer
    || timeClassFilter !== appliedTimeClass
    || color !== appliedColor
    || draftDateFrom !== appliedDateFrom

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

//----------------------------------------------------------------------------------
//  ss — read+parse a sessionStorage value, falling back if unset/corrupt/unavailable (SSR)
//----------------------------------------------------------------------------------
function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
