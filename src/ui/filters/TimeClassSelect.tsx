'use client'

import FilterSelect from './FilterSelect'
import { OPTIONS_TIME_CLASS, WIDTH_TIME_CLASS } from '@/src/lib/constants'

interface TimeClassSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
  borderClass?: string
}

//----------------------------------------------------------------------------------------------
//  TimeClassSelect — gd_time_class filter (GameList, graph/page)
//----------------------------------------------------------------------------------------------
export default function TimeClassSelect({ value, onChange, label = 'Time', width = WIDTH_TIME_CLASS, borderClass }: TimeClassSelectProps) {
  return (
    <FilterSelect
      label={label}
      options={OPTIONS_TIME_CLASS}
      value={value}
      onChange={onChange}
      width={width}
      borderClass={borderClass}
    />
  )
}
