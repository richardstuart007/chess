'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import FilterSelect from './FilterSelect'

const ALL = ''

interface FilterPlayerSelectProps {
  players: { username: string; display_name: string | null }[]
  label?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  FilterPlayerSelect — player picker shared by every page (Games/Habits/Graph/Openings/
//  Endings). Reads/writes the same `?player=` URL param the PlayerProfile header cards use,
//  so this dropdown and the header stay in sync either way. Includes an explicit "All" option
//  (blank param) alongside each tracked player. Renders nothing when there's only one player
//  tracked, since there's nothing to choose between.
//----------------------------------------------------------------------------------------------
export default function FilterPlayerSelect({ players, label = 'Player', width = 'w-24' }: FilterPlayerSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const value = searchParams.get('player') ?? ALL

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('player', next); else params.delete('player')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  if (players.length <= 1) return null

  return (
    <FilterSelect
      label={label}
      options={[{ value: ALL, label: 'All' }, ...players.map(p => ({ value: p.username, label: p.display_name ?? p.username }))]}
      value={value}
      onChange={handleChange}
      width={width}
    />
  )
}
