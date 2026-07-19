'use client'

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
}

function normalize(opt: string | FilterOption): FilterOption {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt
}

//----------------------------------------------------------------------------------------------
//  FilterSelect — labeled compact dropdown filter, consistent sizing/styling across every
//  filter site in the app. Options may be plain strings (value === label) or explicit
//  { value, label } pairs — needed for cases like "All"/"Both" where value is '' but the
//  displayed label shouldn't be blank.
//----------------------------------------------------------------------------------------------
export default function FilterSelect({ label, options, value, onChange, width = 'w-20' }: FilterSelectProps) {
  const normalized = options.map(normalize)
  return (
    <div className={label ? 'flex flex-col gap-0.5' : ''}>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${width} h-6 rounded-md border border-blue-500 px-1 text-xxs text-gray-700 focus:border-blue-500 hover:border-blue-500`}
      >
        {normalized.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
