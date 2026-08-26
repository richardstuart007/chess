'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterDateInput — labeled compact date filter, consistent sizing/styling across every
//    filter site in the app.
//
//    Parameters:
//      label       — filter label text
//      value       — current date value
//      onChange    — called with the new value on change
//      min         — minimum selectable date
//      max         — maximum selectable date
//      width       — override width class (default 'w-28')
//      borderClass — override border color classes
//==================================================================================================

import { MyInput } from 'nextjs-shared/MyInput'

interface FilterDateInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  width?: string
  borderClass?: string
}

export default function FilterDateInput({ label, value, onChange, min, max, width = 'w-28', borderClass = '' }: FilterDateInputProps) {
  return (
    <div className={label ? 'flex flex-col gap-0.5' : ''}>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <MyInput
        type='date'
        value={value}
        onChange={e => onChange(e.target.value)}
        min={min}
        max={max}
        overrideClass={`${width} h-6 md:h-6 text-xxs ${borderClass}`}
      />
    </div>
  )
}
