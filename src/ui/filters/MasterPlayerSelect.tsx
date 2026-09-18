'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterPlayerSelect — picks a master player, from either every known master
//    (tmst_master_players) or only ones with synced games (tmgd_gamesdecon). Searchable — the
//    master list is long. Self-fetches its own options on mount, sorted alphabetically by name,
//    no grade shown.
//
//    Parameters:
//      value      — current selected value
//      onChange   — called with the new value on selection
//      scope      — 'all' (every known master, default) or 'synced' (only masters with synced
//                   games — for filtering the Masters Games list to one that actually has data)
//      valueField — 'handle' (chess.com handle, default) or 'name' ("First Last" — needed for
//                   chess.com's own live game search, which takes a display name, not a handle)
//      blankLabel — label for the blank/no-selection option (default 'All')
//      label      — filter label text (default 'Player')
//      width      — override width class (default WIDTH_MASTER_PLAYER)
//
//  3) CHANGE HISTORY
//    2026-09-15 — merged with FilterMasterPlayerSelect (two near-identical components differing
//                 only in data scope) into this one, parameterized by scope/valueField/blankLabel;
//                 added search (the option list is long); dropped the grade suffix from labels
//==================================================================================================

import { useEffect, useState } from 'react'
import FilterSelect from './FilterSelect'
import { getSyncedMasterPlayers } from '@/src/lib/master/masterGamesList'
import { getMasterPlayers } from '@/src/lib/actions/masterPlayers'
import { WIDTH_MASTER_PLAYER } from '@/src/lib/constants'

interface MasterPlayerSelectProps {
  value: string
  onChange: (value: string) => void
  scope?: 'all' | 'synced'
  valueField?: 'handle' | 'name'
  blankLabel?: string
  label?: string
  width?: string
}

export default function MasterPlayerSelect({
  value,
  onChange,
  scope = 'all',
  valueField = 'handle',
  blankLabel = 'All',
  label = 'Player',
  width = WIDTH_MASTER_PLAYER
}: MasterPlayerSelectProps) {
  const [players, setPlayers] = useState<{ handle: string; name: string }[]>([])

  useEffect(() => {
    async function load() {
      if (scope === 'synced') {
        const rows = await getSyncedMasterPlayers()
        setPlayers(rows.map(p => ({ handle: p.handle, name: p.name })))
      } else {
        const rows = await getMasterPlayers()
        const withHandle = rows
          .filter((p): p is typeof p & { chesscomHandle: string } => p.chesscomHandle != null)
          .map(p => ({ handle: p.chesscomHandle, name: p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName }))
        setPlayers(withHandle)
      }
    }
    load()
  }, [scope])

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))
  const options = [
    { value: '', label: blankLabel },
    ...sorted.map(p => ({ value: valueField === 'handle' ? p.handle : p.name, label: p.name }))
  ]

  return (
    <FilterSelect
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      width={width}
      searchEnabled
    />
  )
}
