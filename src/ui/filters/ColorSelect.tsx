'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ColorSelect — gd_player_color filter (GameList, OpeningScoreChart, TerminationChart). Not
//    used by HabitsTable, which filters the unrelated pos_color column ('w'/'b' FEN values)
//    instead.
//
//    Parameters:
//      value    — current selected color value
//      onChange — called with the new value on selection
//      label    — filter label text (default 'Colour')
//      width    — override width class (default WIDTH_COLOR)
//==================================================================================================

import FilterSelect from './FilterSelect'
import { OPTIONS_COLOR, WIDTH_COLOR } from '@/src/lib/constants'

interface ColorSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

export default function ColorSelect({ value, onChange, label = 'Colour', width = WIDTH_COLOR }: ColorSelectProps) {
  return (
    <FilterSelect
      label={label}
      options={OPTIONS_COLOR}
      value={value}
      onChange={onChange}
      width={width}
    />
  )
}
