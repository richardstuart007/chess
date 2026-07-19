'use client'

import { useState, useEffect, useRef } from 'react'

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

function normalize(opt: string | FilterOption): FilterOption {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt
}

//----------------------------------------------------------------------------------------------
//  FilterMultiCheckbox — labeled checkbox-dropdown multi-select filter, consistent
//  sizing/styling across every filter site in the app (consolidates what used to be two
//  separate local implementations — GameList's TerminationCheckboxFilter and
//  OpeningScoreChart's MultiSelectHeader). Options may be plain strings (value === label) or
//  explicit { value, label } pairs, same convention as FilterSelect.
//----------------------------------------------------------------------------------------------
export default function FilterMultiCheckbox({ label, options, selected, onChange, width = 'w-20' }: FilterMultiCheckboxProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const normalized = options.map(normalize)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }

  const display = selected.length === 0 ? 'All' : `${selected.length} selected`

  return (
    <div className={label ? 'flex flex-col gap-0.5' : ''}>
      {label && <span className='text-xxs text-gray-500'>{label}</span>}
      <div ref={ref} className='relative'>
        <button
          type='button'
          onClick={() => setOpen(o => !o)}
          className={`${width} h-6 text-left truncate text-xxs border border-blue-500 rounded-md px-1 bg-white hover:border-blue-600`}
        >
          {display}
        </button>
        {open && (
          <div className='absolute z-10 bg-white border border-gray-200 rounded shadow-md p-1 min-w-max top-full left-0'>
            {normalized.map(opt => (
              <label key={opt.value} className='flex items-center gap-1 px-1 py-0.5 hover:bg-gray-50 cursor-pointer text-xxs whitespace-nowrap'>
                <input type='checkbox' checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className='h-3 w-3' />
                {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
