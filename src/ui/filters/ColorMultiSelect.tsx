'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ColorMultiSelect — gd_player_color multi-select filter (OpeningScoreChart's nested game
//    table). Same DD column/value domain as ColorSelect, no "All" sentinel needed for
//    multi-select.
//
//    Parameters:
//      selected — currently checked color values
//      onChange — called with the new selection array
//      label    — filter label text (default 'Colour')
//      width    — override width class (default WIDTH_COLOR_MULTI)
//==================================================================================================

import FilterMultiCheckbox from './FilterMultiCheckbox'
import { OPTIONS_COLOR_MULTI, WIDTH_COLOR_MULTI } from '@/src/lib/constants'

interface ColorMultiSelectProps {
  selected: string[]
  onChange: (values: string[]) => void
  label?: string
  width?: string
}

export default function ColorMultiSelect({ selected, onChange, label = 'Colour', width = WIDTH_COLOR_MULTI }: ColorMultiSelectProps) {
  return (
    <FilterMultiCheckbox
      label={label}
      options={OPTIONS_COLOR_MULTI}
      selected={selected}
      onChange={onChange}
      width={width}
    />
  )
}
