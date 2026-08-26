'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ResultSelect — gd_player_result single-select filter (GameList).
//
//    Parameters:
//      value    — current selected result value
//      onChange — called with the new value on selection
//      label    — filter label text (default 'Result')
//      width    — override width class (default WIDTH_RESULT)
//==================================================================================================

import FilterSelect from './FilterSelect'
import { OPTIONS_RESULT, WIDTH_RESULT } from '@/src/lib/constants'

interface ResultSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

export default function ResultSelect({ value, onChange, label = 'Result', width = WIDTH_RESULT }: ResultSelectProps) {
  return (
    <FilterSelect
      label={label}
      options={OPTIONS_RESULT}
      value={value}
      onChange={onChange}
      width={width}
    />
  )
}
