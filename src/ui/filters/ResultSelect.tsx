'use client'

import FilterSelect from './FilterSelect'
import { OPTIONS_RESULT, WIDTH_RESULT } from '@/src/lib/constants'

interface ResultSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  ResultSelect — gd_player_result single-select filter (GameList)
//----------------------------------------------------------------------------------------------
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
