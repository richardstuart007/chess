'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ResultMultiSelect — gd_player_result multi-select filter (OpeningScoreChart's nested game
//    table). Same DD column as ResultSelect, no "All" sentinel needed for multi-select.
//
//    Parameters:
//      selected — currently checked result values
//      onChange — called with the new selection array
//      label    — filter label text (default 'Result')
//      width    — override width class (default WIDTH_RESULT_MULTI)
//==================================================================================================

import FilterMultiCheckbox from './FilterMultiCheckbox'
import { OPTIONS_RESULT_MULTI, WIDTH_RESULT_MULTI } from '@/src/lib/constants'

interface ResultMultiSelectProps {
  selected: string[]
  onChange: (values: string[]) => void
  label?: string
  width?: string
}

export default function ResultMultiSelect({ selected, onChange, label = 'Result', width = WIDTH_RESULT_MULTI }: ResultMultiSelectProps) {
  return (
    <FilterMultiCheckbox
      label={label}
      options={OPTIONS_RESULT_MULTI}
      selected={selected}
      onChange={onChange}
      width={width}
    />
  )
}
