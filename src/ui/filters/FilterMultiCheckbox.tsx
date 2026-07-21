'use client'

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

//----------------------------------------------------------------------------------------------
//  FilterMultiCheckbox — thin wrapper around nextjs-shared/MySelectMulti, preserving this
//  project's existing call-site API (label, options, selected, onChange, width)
//----------------------------------------------------------------------------------------------
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
