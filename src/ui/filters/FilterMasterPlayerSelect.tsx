'use client'

import { useState, useEffect } from 'react'
import FilterSelect from './FilterSelect'
import { getSyncedMasterPlayers, SyncedMasterPlayer } from '@/src/lib/master/masterGamesList'

const ALL = ''

interface FilterMasterPlayerSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  FilterMasterPlayerSelect — filters the Masters Games list by which synced master player a
//  row belongs to, "All" included. Self-fetches its own options from getSyncedMasterPlayers
//  (distinct mgd_player handles actually present in tmgd_gamesdecon, each paired with its
//  real name) — value is still the chess.com handle (what mgd_player filters on), but the label
//  shown is the player's real name. Distinct from MasterPlayerSelect, which lists every known
//  master player regardless of whether they've been synced (used to pick a sync target on the
//  pipeline page, not to filter existing data).
//----------------------------------------------------------------------------------------------
export default function FilterMasterPlayerSelect({ value, onChange, label = 'Player', width = 'w-32' }: FilterMasterPlayerSelectProps) {
  const [players, setPlayers] = useState<SyncedMasterPlayer[]>([])

  useEffect(() => {
    getSyncedMasterPlayers().then(setPlayers)
  }, [])

  return (
    <FilterSelect
      label={label}
      options={[{ value: ALL, label: 'All' }, ...players.map(p => ({ value: p.handle, label: p.name }))]}
      value={value}
      onChange={onChange}
      width={width}
    />
  )
}
