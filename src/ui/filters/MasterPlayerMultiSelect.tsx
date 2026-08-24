'use client'

import { useState, useEffect } from 'react'
import MySelectMulti from 'nextjs-shared/MySelectMulti'
import { MyInput } from 'nextjs-shared/MyInput'
import { getMasterPlayers, getMasterSyncYearStatus } from '@/src/lib/actions/masterPlayers'

interface MasterPlayerMultiSelectProps {
  selected: string[]
  onChange: (values: string[]) => void
  year: number
  label?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  MasterPlayerMultiSelect — multi-select of known master players (tmst_master_players), values
//  are chess.com handles, sorted by grade descending. Each option is labeled with a "✓" suffix
//  when that player already has 1+ games synced for the selected year (getMasterSyncYearStatus),
//  so the picker doubles as a status display. Selection is fully owned by the caller — this
//  component never auto-checks anything; a year change only refreshes the "✓" labels on the
//  option list, it never changes what's currently selected. A search box narrows the *unselected*
//  candidates by name/handle as you type — already-selected players always stay visible
//  regardless of the search text, so unchecking one never requires clearing the search first.
//----------------------------------------------------------------------------------------------
export default function MasterPlayerMultiSelect({ selected, onChange, year, label = 'Masters', width = 'w-72' }: MasterPlayerMultiSelectProps) {
  const [allOptions, setAllOptions] = useState<{ value: string; label: string }[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const [players, downloaded] = await Promise.all([
        getMasterPlayers('', true),
        getMasterSyncYearStatus(year)
      ])
      const handleOptions = players
        .filter((p): p is typeof p & { chesscomHandle: string } => p.chesscomHandle != null)
        .map(p => ({
          value: p.chesscomHandle,
          label: (p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName) + (downloaded.has(p.chesscomHandle.toLowerCase()) ? ' ✓' : ''),
          downloaded: downloaded.has(p.chesscomHandle.toLowerCase())
        }))
        .sort((a, b) => Number(a.downloaded) - Number(b.downloaded))
        .map(({ value, label }) => ({ value, label }))
      setAllOptions(handleOptions)
    }
    load()
  }, [year])

  const searchLower = search.trim().toLowerCase()
  const options = searchLower
    ? allOptions.filter(o => selected.includes(o.value) || o.label.toLowerCase().includes(searchLower) || o.value.toLowerCase().includes(searchLower))
    : allOptions

  return (
    <div className='flex items-center gap-2'>
      <MySelectMulti
        label={label}
        options={options}
        selected={selected}
        onChange={onChange}
        overrideClass={width}
      />
      <MyInput
        id='master-player-search'
        name='master-player-search'
        type='text'
        placeholder='Search...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        overrideClass='h-6 md:h-6 rounded-md border border-blue-500 bg-white px-2 text-xs w-32'
      />
    </div>
  )
}
