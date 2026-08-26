'use client'

//==================================================================================================
//  1) DESCRIPTION
//    TimeClassSelect — gd_time_class filter (GameList, graph/page).
//
//    Parameters:
//      value       — current selected time-class value
//      onChange    — called with the new value on selection
//      label       — filter label text (default 'Time')
//      width       — override width class (default WIDTH_TIME_CLASS)
//      borderClass — override border color classes
//==================================================================================================

import FilterSelect from './FilterSelect'
import { OPTIONS_TIME_CLASS, WIDTH_TIME_CLASS } from '@/src/lib/constants'

interface TimeClassSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
  borderClass?: string
}

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
