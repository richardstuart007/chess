'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterTextInput — labeled compact text filter, consistent sizing/styling across every
//    filter site in the app.
//
//    Parameters:
//      label       — filter label text
//      value       — current text value
//      onChange    — called with the new value on change
//      placeholder — input placeholder text
//      width       — override width class (default 'w-24')
//      borderClass — override border color classes
//==================================================================================================

import { MyInput } from 'nextjs-shared/MyInput'

interface FilterTextInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  width?: string
  borderClass?: string
}

export default function FilterTextInput({ label, value, onChange, placeholder, width = 'w-24', borderClass = '' }: FilterTextInputProps) {
  return (
    <div className={label ? 'flex flex-col gap-0.5' : ''}>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <MyInput
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        overrideClass={`${width} h-6 md:h-6 text-xxs ${borderClass}`}
      />
    </div>
  )
}
