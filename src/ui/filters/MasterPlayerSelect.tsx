'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterPlayerSelect — picks a known master player (tmst_master_players), value = chess.com
//    handle. Self-fetches its own options on mount (a DB-driven list, not a static option set),
//    sorted by grade descending, skipping any row still missing a chess.com handle.
//
//    Parameters:
//      value    — current selected chess.com handle
//      onChange — called with the new handle on selection
//      label    — filter label text (default 'Master')
//      width    — override width class (default 'w-48')
//==================================================================================================

import { useState, useEffect } from 'react'
import FilterSelect from './FilterSelect'
import { getMasterPlayers } from '@/src/lib/actions/masterPlayers'

interface MasterPlayerSelectProps {
  value: string
  onChange: (chesscomHandle: string) => void
  label?: string
  width?: string
}

export default function MasterPlayerSelect({ value, onChange, label = 'Master', width = 'w-48' }: MasterPlayerSelectProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    getMasterPlayers('', true).then(players => {
      setOptions([
        { value: '', label: 'Select a master...' },
        ...players
          .filter((p): p is typeof p & { chesscomHandle: string } => p.chesscomHandle != null)
          .map(p => ({ value: p.chesscomHandle, label: p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName }))
      ])
    })
  }, [])

  return (
    <FilterSelect
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      width={width}
    />
  )
}
