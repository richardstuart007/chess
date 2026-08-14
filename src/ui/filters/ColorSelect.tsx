'use client'

import FilterSelect from './FilterSelect'
import { OPTIONS_COLOR, WIDTH_COLOR } from '@/src/lib/constants'

interface ColorSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  ColorSelect — gd_player_color filter (GameList, OpeningScoreChart, TerminationChart). Not
//  used by HabitsTable, which filters the unrelated pos_color column ('w'/'b' FEN values) instead.
//----------------------------------------------------------------------------------------------
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
