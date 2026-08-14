'use client'

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
}

function normalize(opt: string | FilterOption): FilterOption {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt
}

//----------------------------------------------------------------------------------------------
//  FilterSelect — labeled compact dropdown filter, consistent sizing/styling across every
//  filter site in the app. Options may be plain strings (value === label) or explicit
//  { value, label } pairs — needed for cases like "All"/"Both" where value is '' but the
//  displayed label shouldn't be blank. Wraps nextjs-shared's MySelect, rendering options as
//  children since MySelect's own `options` prop only supports flat strings, not
//  { value, label } pairs.
//----------------------------------------------------------------------------------------------
export default function FilterSelect({ label, options, value, onChange, width = 'w-20', borderClass = 'border-blue-500 focus:border-blue-500 hover:border-blue-500' }: FilterSelectProps) {
  const normalized = options.map(normalize)
  return (
    <MySelect
      value={value}
      onChange={e => onChange(e.target.value)}
      overrideClass={`${width} h-6 rounded-md border ${borderClass} px-1 text-xxs text-gray-700`}
      labelClass='text-xxs text-gray-500'
      containerClass={label ? 'flex flex-col gap-0.5' : ''}
      label={label}
    >
      {normalized.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </MySelect>
  )
}
