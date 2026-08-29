'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterGraphTimeClassSelect — the Rating Graph page's own time-class picker. Unlike the
//    shared FilterTimeClassSelect it is a single-select with NO "All" option and a player-aware
//    option list, so the chart always plots exactly one series per player for one concrete class.
//    Writes the same global `?timeClass=` URL param (kept in sync with the profile-header rating
//    badges), so navigating away carries the choice like every other global filter.
//
//    Parameters:
//      players — tracked players; used to build the union option list when no single player is
//                selected (Player filter = "All")
//      label   — filter label text (default 'Time')
//      width   — override width class (default WIDTH_TIME_CLASS)
//
//  2) NOTES
//    Options come from getPlayerTimeClasses(): the selected player's allowed classes
//    (`stricade` → ['blitz'], `astarrboy` → ['blitz','rapid']), or the union across every tracked
//    player when the Player filter is "All". The effect below forces a concrete, valid value —
//    covering both an unset `?timeClass=` and a stale one carried in from another page whose value
//    the current player doesn't play (e.g. 'rapid' then switching to `stricade`).
//==================================================================================================

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import FilterSelect from './FilterSelect'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import { getPlayerTimeClasses, DEFAULT_GRAPH_TIME_CLASS, GLOBAL_FILTER_BORDER_CLASS, WIDTH_TIME_CLASS } from '@/src/lib/constants'

interface FilterGraphTimeClassSelectProps {
  players: { player: string; display_name: string | null }[]
  label?: string
  width?: string
}

export default function FilterGraphTimeClassSelect({ players, label = 'Time', width = WIDTH_TIME_CLASS }: FilterGraphTimeClassSelectProps) {
  const searchParams = useSearchParams()
  const playerFilter = searchParams.get('player') ?? ''
  const [value, setValue] = useGlobalFilter('timeClass')

  //
  //  One player selected → that player's allowed classes. Player filter "All" → union across
  //  every tracked player, blitz-first (Set preserves getPlayerTimeClasses' own order).
  //
  const options = useMemo(() => {
    if (playerFilter) return getPlayerTimeClasses(playerFilter)
    const union = new Set<string>()
    for (const p of players) {
      for (const timeClass of getPlayerTimeClasses(p.player)) union.add(timeClass)
    }
    const result = Array.from(union)
    return result
  }, [playerFilter, players])

  //
  //  Force a concrete, valid class whenever the current value isn't in the option list —
  //  covers an unset param and a stale carried-in one. Prefers DEFAULT_GRAPH_TIME_CLASS,
  //  falling back to the first available option if the player somehow doesn't play blitz.
  //
  useEffect(() => {
    if (options.length > 0 && !options.includes(value)) {
      const fallback = options.includes(DEFAULT_GRAPH_TIME_CLASS) ? DEFAULT_GRAPH_TIME_CLASS : options[0]
      setValue(fallback)
    }
  }, [options, value, setValue])

  return (
    <FilterSelect
      label={label}
      options={options}
      value={value}
      onChange={setValue}
      width={width}
      borderClass={GLOBAL_FILTER_BORDER_CLASS}
    />
  )
}
