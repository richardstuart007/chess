'use client'

//==================================================================================================
//  1) DESCRIPTION
//    DepthInput_shared — shared Depth number input for the Game Analysis and Stockfish panels,
//    used by both tracked-player and master-game analysis.
//
//    Parameters:
//      value         — current depth value (can transiently be NaN mid-typing)
//      onChange      — called with the new depth on change
//      min           — minimum depth (default STOCKFISH_DEFAULTS.depth)
//      max           — maximum depth (default STOCKFISH_DEPTH_INPUT_MAX)
//      overrideClass — override classes (default 'w-16 h-6 md:h-6')
//
//  2) NOTES
//    Types freely (value can transiently be NaN mid-typing, same convention as this file's own
//    From move/To move inputs) and only clamps to min/max on blur, via MyInputNumeric's
//    clampOnBlur, so typing e.g. "31" isn't overwritten by an in-progress clamp on the first
//    keystroke. NaN-for-empty is this component's own external convention (matches its callers) —
//    translated to/from MyInputNumeric's '' / null at this boundary only.
//
//  3) CHANGE HISTORY
//    2026-09-12 — internals switched from MyInput type='number' to MyInputNumeric (integerOnly +
//                 clampOnBlur); external prop API unchanged
//==================================================================================================

import { MyInputNumeric } from 'nextjs-shared/MyInputNumeric'
import { STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'
import { STOCKFISH_DEPTH_INPUT_MAX } from '@/src/lib/constants'

interface DepthInputProps {
  value: number
  onChange: (depth: number) => void
  min?: number
  max?: number
  overrideClass?: string
}

export default function DepthInput_shared({
  value,
  onChange,
  min = STOCKFISH_DEFAULTS.depth,
  max = STOCKFISH_DEPTH_INPUT_MAX,
  overrideClass = 'w-16 h-6 md:h-6'
}: DepthInputProps) {
  return (
    <div className='flex items-center gap-2'>
      <span className='font-bold text-xs whitespace-nowrap'>Depth</span>
      <MyInputNumeric
        integerOnly
        clampOnBlur
        min={min}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={v => onChange(v === null ? NaN : v)}
        onBlur={() => {
          if (Number.isNaN(value)) onChange(min)
        }}
        overrideClass={overrideClass}
      />
    </div>
  )
}
