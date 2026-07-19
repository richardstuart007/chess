'use client'

interface FilterNumberRangeProps {
  label?: string
  min: string
  max: string
  onMinChange: (value: string) => void
  onMaxChange: (value: string) => void
  width?: string
}

//----------------------------------------------------------------------------------------------
//  FilterNumberRange — labeled min/max numeric pair (e.g. Opp. Rating), consistent
//  sizing/styling across every filter site in the app
//----------------------------------------------------------------------------------------------
export default function FilterNumberRange({ label, min, max, onMinChange, onMaxChange, width = 'w-12' }: FilterNumberRangeProps) {
  const overlap = min !== '' && max !== '' && Number(min) > Number(max)
  const inputClass = `${width} h-6 rounded-md border px-1 text-xxs text-gray-700 ${overlap ? 'border-red-400' : 'border-blue-500'}`

  return (
    <div className='flex flex-col gap-0.5'>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <div className='flex items-center justify-center gap-1'>
        <input
          type='text'
          inputMode='numeric'
          value={min}
          onChange={e => onMinChange(e.target.value.replace(/\D/g, ''))}
          placeholder='Min'
          className={inputClass}
        />
        <input
          type='text'
          inputMode='numeric'
          value={max}
          onChange={e => onMaxChange(e.target.value.replace(/\D/g, ''))}
          placeholder='Max'
          className={inputClass}
        />
      </div>
      {overlap && <div className='text-center text-xxs text-red-500'>min &gt; max</div>}
    </div>
  )
}
