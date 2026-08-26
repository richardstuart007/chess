'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterNumberRange — labeled min/max numeric pair (e.g. Opp. Rating), consistent
//    sizing/styling across every filter site in the app.
//
//    Parameters:
//      label       — filter label text
//      min         — current min value
//      max         — current max value
//      onMinChange — called with the new min value on change
//      onMaxChange — called with the new max value on change
//      width       — override width class (default 'w-12')
//==================================================================================================

import { MyInput } from 'nextjs-shared/MyInput'

interface FilterNumberRangeProps {
  label?: string
  min: string
  max: string
  onMinChange: (value: string) => void
  onMaxChange: (value: string) => void
  width?: string
}

export default function FilterNumberRange({ label, min, max, onMinChange, onMaxChange, width = 'w-12' }: FilterNumberRangeProps) {
  const overlap = min !== '' && max !== '' && Number(min) > Number(max)
  const inputClass = `${width} h-6 rounded-md border px-1 text-xxs text-gray-700 ${overlap ? 'border-red-400' : 'border-blue-500'}`

  return (
    <div className='flex flex-col gap-0.5'>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <div className='flex items-center justify-center gap-1'>
        <MyInput
          type='text'
          inputMode='numeric'
          value={min}
          onChange={e => onMinChange(e.target.value.replace(/\D/g, ''))}
          placeholder='Min'
          overrideClass={inputClass}
        />
        <MyInput
          type='text'
          inputMode='numeric'
          value={max}
          onChange={e => onMaxChange(e.target.value.replace(/\D/g, ''))}
          placeholder='Max'
          overrideClass={inputClass}
        />
      </div>
      {overlap && <div className='text-center text-xxs text-red-500'>min &gt; max</div>}
    </div>
  )
}
