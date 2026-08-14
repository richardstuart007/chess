'use client'

import FilterMultiCheckbox from './FilterMultiCheckbox'
import { OPTIONS_TERMINATION, WIDTH_TERMINATION } from '@/src/lib/constants'

interface TerminationMultiSelectProps {
  selected: string[]
  onChange: (values: string[]) => void
  label?: string
  width?: string
  options?: string[]
}

//----------------------------------------------------------------------------------------------
//  TerminationMultiSelect — gd_termination multi-select filter. Defaults to the full termination
//  taxonomy (GameList); OpeningScoreChart's nested game table overrides `options` with the
//  terminations actually present in its current game set (computed at runtime).
//----------------------------------------------------------------------------------------------
export default function TerminationMultiSelect({ selected, onChange, label = 'Termination', width = WIDTH_TERMINATION, options = OPTIONS_TERMINATION }: TerminationMultiSelectProps) {
  return (
    <FilterMultiCheckbox
      label={label}
      options={options}
      selected={selected}
      onChange={onChange}
      width={width}
    />
  )
}
