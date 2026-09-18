'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterSelect — labeled compact dropdown filter, consistent sizing/styling across every
//    filter site in the app. Options may be plain strings (value === label) or explicit
//    { value, label } pairs — needed for cases like "All"/"Both" where value is '' but the
//    displayed label shouldn't be blank. Thin wrapper around nextjs-shared's MySelect, passing
//    options straight through via its `options` prop (which accepts both shapes natively).
//
//    Parameters:
//      label         — filter label text
//      options       — plain strings or { value, label } pairs
//      value         — current selected value
//      onChange      — called with the new value on selection
//      width         — override width class (default 'w-20')
//      borderClass   — override border color classes
//      searchEnabled — shows a search box above the dropdown and filters options by label; for a
//                      long option list (default false)
//
//  3) CHANGE HISTORY
//    2026-09-15 — added searchEnabled (passed straight through to MySelect); simplified to pass
//                 `options` directly to MySelect instead of manually rendering <option> children
//                 — MySelect's own `options` prop now natively supports { value, label } pairs
//                 (previously string-only, which is why this manual rendering existed)
//==================================================================================================

import MySelect from 'nextjs-shared/MySelect'

interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  label?: string
  options: (string | FilterOption)[]
  value: string
  onChange: (value: string) => void
  width?: string
  borderClass?: string
  searchEnabled?: boolean
}

export default function FilterSelect({ label, options, value, onChange, width = 'w-20', borderClass = 'border-blue-500 focus:border-blue-500 hover:border-blue-500', searchEnabled = false }: FilterSelectProps) {
  return (
    <MySelect
      value={value}
      onChange={e => onChange(e.target.value)}
      options={options}
      searchEnabled={searchEnabled}
      overrideClass={`${width} h-6 md:h-6 rounded-md border ${borderClass} px-1 text-xxs text-gray-700`}
      labelClass='text-xxs text-gray-500'
      containerClass={label ? 'flex flex-col gap-0.5' : ''}
      searchClass={`${width} h-6 md:h-6 rounded-md border ${borderClass} px-1 text-xxs text-gray-700`}
      label={label}
    />
  )
}
