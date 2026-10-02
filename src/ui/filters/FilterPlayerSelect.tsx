'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterPlayerSelect — player picker shared by every page (Games/Habits/Graph/Openings/
//    Endings). Reads/writes the same `?player=` URL param the PlayerProfile header cards use, so
//    this dropdown and the header stay in sync either way. Includes an explicit "All" option
//    (blank param) alongside each tracked player.
//
//    Parameters:
//      players — tracked players to list
//      label   — filter label text (default 'Player')
//      width   — override width class (default WIDTH_PLAYER)
//
//  2) NOTES
//    Renders nothing when there's only one player tracked, since there's nothing to choose
//    between.
//==================================================================================================

import FilterSelect from './FilterSelect'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import { WIDTH_PLAYER, GLOBAL_FILTER_BORDER_CLASS } from '@/src/lib/constants'

const ALL = ''

type FilterPlayerSelectProps = {
  players: { player: string; display_name: string | null }[]
  label?: string
  width?: string
}

export default function FilterPlayerSelect({ players, label = 'Player', width = WIDTH_PLAYER }: FilterPlayerSelectProps) {
  const [value, setValue] = useGlobalFilter('player')

  if (players.length <= 1) return null

  const playerOptions = [{ value: ALL, label: 'All' }, ...players.map(p => ({ value: p.player, label: p.player }))]

  return (
    <FilterSelect
      label={label}
      options={playerOptions}
      value={value}
      onChange={setValue}
      width={width}
      borderClass={GLOBAL_FILTER_BORDER_CLASS}
    />
  )
}
