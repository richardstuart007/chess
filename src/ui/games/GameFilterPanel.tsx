'use client'

import { useState, useEffect, useRef } from 'react'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyButton } from 'nextjs-shared/MyButton'
import { GameFilters } from '@/src/lib/actions/games'

interface PlayerOption {
  username: string
  displayName: string | null
}

interface GameFilterPanelProps {
  players: PlayerOption[]
  playerFilter: string
  onPlayerFilterChange: (value: string) => void
  filters: GameFilters
  onFilterChange: (key: keyof GameFilters, value: string) => void
  onTerminationChange: (terms: string[]) => void
  onApply: () => void
  onReset: () => void
  minDate?: string
  //
  //  'graph' shows only Date range/Player/Time class — a rating point reflects the
  //  player's true rating shaped by all games, so Color/Opponent/Result/Termination/
  //  Opening/ECO don't produce a meaningful "rating over time" trend when narrowed.
  //
  mode?: 'games' | 'graph'
  //
  //  Graph-only: how many rows RatingChart fetches, and whether it's currently fetching.
  //
  graphLimit?: number
  onGraphLimitChange?: (v: number) => void
  fetching?: boolean
}

const BOTH = ''
const TODAY = new Date().toISOString().slice(0, 10)
const TERMINATION_OPTIONS = ['Resignation', 'Checkmate', 'Time', 'Repetition', 'Agreement', 'Stalemate', 'Insufficient', '50 Moves', 'Timeout', 'Abandoned']
const GRAPH_LIMIT_OPTIONS = ['100', '10,000', 'All']

function graphLimitToLabel(v: number): string {
  if (v === 0) return 'All'
  if (v === 10000) return '10,000'
  return '100'
}

function labelToGraphLimit(label: string): number {
  if (label === 'All') return 0
  if (label === '10,000') return 10000
  return 100
}

//----------------------------------------------------------------------------------------------
//  TerminationCheckboxFilter — multi-select dropdown for the termination filter
//----------------------------------------------------------------------------------------------
function TerminationCheckboxFilter({ selected, onChange }: { selected: string[], onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const label = selected.length === 0 ? 'All' : `${selected.length} selected`

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={() => setOpen(o => !o)}
        className='text-xxs border border-gray-300 rounded px-1 py-0.5 bg-white w-20 text-left truncate hover:border-gray-400'
      >
        {label}
      </button>
      {open && (
        <div className='absolute z-10 bg-white border border-gray-200 rounded shadow-md p-1 min-w-32 top-full left-0'>
          {TERMINATION_OPTIONS.map(opt => (
            <label key={opt} className='flex items-center gap-1 px-1 py-0.5 hover:bg-gray-50 cursor-pointer text-xxs whitespace-nowrap'>
              <input type='checkbox' checked={selected.includes(opt)} onChange={() => toggle(opt)} className='h-3 w-3' />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  GameFilterPanel — shared filter controls for GameList and RatingChart, each owning its own
//  filter state independently
//----------------------------------------------------------------------------------------------
export default function GameFilterPanel({
  players,
  playerFilter,
  onPlayerFilterChange,
  filters,
  onFilterChange,
  onTerminationChange,
  onApply,
  onReset,
  minDate,
  mode = 'games',
  graphLimit = 100,
  onGraphLimitChange,
  fetching = false
}: GameFilterPanelProps) {
  const hasMultiple = players.length > 1
  const playerFilterOptions = hasMultiple ? [BOTH, ...players.map(p => p.username)] : players.map(p => p.username)
  const showFull = mode === 'games'
  const isGraph = mode === 'graph'

  const rMin = filters.opponentRatingMin ?? ''
  const rMax = filters.opponentRatingMax ?? ''
  const overlap = rMin !== '' && rMax !== '' && Number(rMin) > Number(rMax)
  const ratingInputClass = `w-16 rounded border px-1 py-0.5 text-xs text-gray-700 ${overlap ? 'border-red-400' : 'border-gray-300'}`

  return (
    <div>
      {isGraph && (
        <div className='flex flex-wrap items-end gap-3 mb-2 text-xs'>
          <MyButton onClick={onApply} disabled={fetching} overrideClass='text-xxs px-2 h-5'>
            {fetching ? 'Fetching...' : 'Refresh'}
          </MyButton>
          <div className='flex flex-col gap-0.5'>
            <span className='text-gray-500'>Records</span>
            <div className='w-20'>
              <MySelect
                options={GRAPH_LIMIT_OPTIONS}
                value={graphLimitToLabel(graphLimit)}
                onChange={e => onGraphLimitChange?.(labelToGraphLimit(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    <div className='flex flex-wrap items-end gap-3 mb-3 text-xs'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-gray-500'>From</span>
        <MyInput
          type='date'
          value={filters.dateFrom ?? ''}
          onChange={e => onFilterChange('dateFrom', e.target.value)}
          overrideClass='w-28 text-xxs'
          min={minDate}
          max={TODAY}
        />
      </div>
      <div className='flex flex-col gap-0.5'>
        <span className='text-gray-500'>To</span>
        <MyInput
          type='date'
          value={filters.dateTo ?? ''}
          onChange={e => onFilterChange('dateTo', e.target.value)}
          overrideClass='w-28 text-xxs'
          min={minDate}
          max={TODAY}
        />
      </div>

      {hasMultiple && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Player</span>
          <div className='w-24'>
            <MySelect
              options={playerFilterOptions}
              value={playerFilter}
              onChange={e => onPlayerFilterChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Color</span>
          <div className='w-16'>
            <MySelect
              options={['', 'white', 'black']}
              value={filters.color ?? ''}
              onChange={e => onFilterChange('color', e.target.value)}
            />
          </div>
        </div>
      )}

      <div className='flex flex-col gap-0.5'>
        <span className='text-gray-500'>Time</span>
        <div className='w-16'>
          <MySelect
            options={['', 'blitz', 'rapid']}
            value={filters.timeClass ?? ''}
            onChange={e => onFilterChange('timeClass', e.target.value)}
          />
        </div>
      </div>

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Opponent</span>
          <MyInput
            value={filters.opponent ?? ''}
            onChange={e => onFilterChange('opponent', e.target.value)}
            placeholder='Filter...'
            overrideClass='w-24'
          />
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Opp. Rating</span>
          <div className='flex items-center gap-1'>
            <input
              type='text'
              inputMode='numeric'
              value={rMin}
              onChange={e => onFilterChange('opponentRatingMin', e.target.value.replace(/\D/g, ''))}
              placeholder='Min'
              className={ratingInputClass}
            />
            <input
              type='text'
              inputMode='numeric'
              value={rMax}
              onChange={e => onFilterChange('opponentRatingMax', e.target.value.replace(/\D/g, ''))}
              placeholder='Max'
              className={ratingInputClass}
            />
          </div>
          {overlap && <span className='text-xs text-red-500'>min &gt; max</span>}
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Result</span>
          <div className='w-16'>
            <MySelect
              options={['', 'win', 'loss', 'draw']}
              value={filters.result ?? ''}
              onChange={e => onFilterChange('result', e.target.value)}
            />
          </div>
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Termination</span>
          <TerminationCheckboxFilter
            selected={filters.termination ?? []}
            onChange={onTerminationChange}
          />
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>Opening</span>
          <MyInput
            value={filters.opening ?? ''}
            onChange={e => onFilterChange('opening', e.target.value)}
            placeholder='Filter...'
            overrideClass='w-56'
          />
        </div>
      )}

      {showFull && (
        <div className='flex flex-col gap-0.5'>
          <span className='text-gray-500'>ECO</span>
          <MyInput
            value={filters.eco ?? ''}
            onChange={e => onFilterChange('eco', e.target.value)}
            placeholder='e.g. B27'
            overrideClass='w-16'
          />
        </div>
      )}

      {!isGraph && (
        <MyButton onClick={onApply} overrideClass='text-xxs px-2 h-5'>
          Filter
        </MyButton>
      )}
      <MyButton onClick={onReset} overrideClass='text-xxs px-1 h-5 bg-gray-400 hover:bg-gray-500'>
        Reset
      </MyButton>
    </div>
    </div>
  )
}
