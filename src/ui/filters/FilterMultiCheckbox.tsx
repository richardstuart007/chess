'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterMultiCheckbox — thin wrapper around nextjs-shared/MySelectMulti, preserving this
//    project's existing call-site API (label, options, selected, onChange, width).
//
//    Parameters:
//      label    — filter label text
//      options  — plain strings or { value, label } pairs
//      selected — currently checked values
//      onChange — called with the new selection array
//      width    — override width class (default 'w-20')
//==================================================================================================

import MySelectMulti from 'nextjs-shared/MySelectMulti'

interface FilterOption {
  value: string
  label: string
}

interface FilterMultiCheckboxProps {
  label?: string
  options: (string | FilterOption)[]
  selected: string[]
  onChange: (values: string[]) => void
  width?: string
}

export default function FilterMultiCheckbox({ label, options, selected, onChange, width = 'w-20' }: FilterMultiCheckboxProps) {
  return (
    <MySelectMulti
      label={label}
      options={options}
      selected={selected}
      onChange={onChange}
      overrideClass={`${width} md:${width} h-6 md:h-6 px-1 text-xxs truncate`}
    />
  )
}
