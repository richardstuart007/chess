'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterMasterPlayerSelect — filters the Masters Games list by which synced master player a
//    row belongs to, "All" included. Self-fetches its own options from getSyncedMasterPlayers
//    (distinct mgd_player handles actually present in tmgd_gamesdecon, each paired with its real
//    name and grade, sorted grade-descending) — value is still the chess.com handle (what
//    mgd_player filters on), but the label shown is "Name (grade)".
//
//    Parameters:
//      value    — current selected chess.com handle
//      onChange — called with the new value on selection
//      label    — filter label text (default 'Player')
//      width    — override width class (default WIDTH_MASTER_PLAYER)
//
//  2) NOTES
//    Distinct from MasterPlayerSelect, which lists every known master player regardless of
//    whether they've been synced (used to pick a sync target on the pipeline page, not to filter
//    existing data).
//
//  3) CHANGE HISTORY
//    2026-08-28 — option labels now include the player's grade in brackets; sorted
//                 grade-descending; default width widened to WIDTH_MASTER_PLAYER
//==================================================================================================

import { useState, useEffect } from 'react'
import FilterSelect from './FilterSelect'
import { getSyncedMasterPlayers, SyncedMasterPlayer } from '@/src/lib/master/masterGamesList'
import { WIDTH_MASTER_PLAYER } from '@/src/lib/constants'

const ALL = ''

interface FilterMasterPlayerSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

export default function FilterMasterPlayerSelect({ value, onChange, label = 'Player', width = WIDTH_MASTER_PLAYER }: FilterMasterPlayerSelectProps) {
  const [players, setPlayers] = useState<SyncedMasterPlayer[]>([])

  useEffect(() => {
    getSyncedMasterPlayers().then(setPlayers)
  }, [])

  return (
    <FilterSelect
      label={label}
      options={[{ value: ALL, label: 'All' }, ...players.map(p => ({ value: p.handle, label: p.grade != null ? `${p.name} (${p.grade})` : p.name }))]}
      value={value}
      onChange={onChange}
      width={width}
    />
  )
}
