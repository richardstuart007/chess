'use client'

import { MyInput } from 'nextjs-shared/MyInput'

interface FilterTextInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  width?: string
}

//----------------------------------------------------------------------------------------------
//  FilterTextInput — labeled compact text filter, consistent sizing/styling across every
//  filter site in the app
//----------------------------------------------------------------------------------------------
export default function FilterTextInput({ label, value, onChange, placeholder, width = 'w-24' }: FilterTextInputProps) {
  return (
    <div className={label ? 'flex flex-col gap-0.5' : ''}>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <MyInput
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        overrideClass={`${width} h-6 md:h-6 text-xxs`}
      />
    </div>
  )
}
