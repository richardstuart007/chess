'use client'

//==================================================================================================
//  1) DESCRIPTION
//    TerminationMultiSelect — gd_termination multi-select filter. Defaults to the full
//    termination taxonomy (GameList); OpeningScoreChart's nested game table overrides `options`
//    with the terminations actually present in its current game set (computed at runtime).
//
//    Parameters:
//      selected — currently checked termination values
//      onChange — called with the new selection array
//      label    — filter label text (default 'Termination')
//      width    — override width class (default WIDTH_TERMINATION)
//      options  — override option list (default the full OPTIONS_TERMINATION taxonomy)
//==================================================================================================

import FilterMultiCheckbox from './FilterMultiCheckbox'
import { OPTIONS_TERMINATION, WIDTH_TERMINATION } from '@/src/lib/constants'

interface TerminationMultiSelectProps {
  selected: string[]
  onChange: (values: string[]) => void
  label?: string
  width?: string
  options?: string[]
}

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
