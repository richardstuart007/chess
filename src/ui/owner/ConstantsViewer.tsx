'use client'

import { useState } from 'react'
import { VALUE_DISPLAY_MAX_LENGTH } from '@/src/lib/constants'
import AppTab from '@/src/ui/AppTab'

export type ConstantEntry = {
  name: string
  value: unknown
  description: string
  consumers: string[]
}

export type ConstantSection = {
  heading: string
  entries: ConstantEntry[]
}

type Tab = 'constants' | 'env'

//----------------------------------------------------------------------------------------------
//  PopoverButton — small button that toggles an absolutely-positioned popover on click, same
//  pattern as PipelineHelp.tsx's Help button. Self-contained (own open state) so many can sit
//  in a table with no shared "which one is open" state needed.
//----------------------------------------------------------------------------------------------
function PopoverButton({ label, align = 'right', children }: { label: string; align?: 'left' | 'right'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <span className='relative inline-block'>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'
      >
        {label}
      </button>

      {open && (
        <div className={`absolute z-20 mt-1 ${align === 'left' ? 'left-0' : 'right-0'} w-[32rem] max-h-64 overflow-y-auto p-3 bg-blue-50 border border-blue-200 rounded-md shadow-xl text-xs`}>
          <div className='flex justify-end mb-2'>
            <button
              onClick={() => setOpen(false)}
              className='text-gray-400 hover:text-gray-700 text-sm leading-none font-bold'
              type='button'
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </span>
  )
}

//----------------------------------------------------------------------------------------------
//  renderValue — short scalars print as-is; objects/arrays and long scalars (over
//  VALUE_DISPLAY_MAX_LENGTH characters) render behind a Show popover button
//----------------------------------------------------------------------------------------------
function renderValue(value: unknown) {
  const isObject = value !== null && typeof value === 'object'
  const text = isObject ? JSON.stringify(value, null, 2) : String(value)

  if (isObject || text.length > VALUE_DISPLAY_MAX_LENGTH) {
    return (
      <PopoverButton label='Show' align='left'>
        <pre className='whitespace-pre-wrap font-mono text-xxs text-gray-700'>{text}</pre>
      </PopoverButton>
    )
  }
  return text
}

//----------------------------------------------------------------------------------------------
//  SectionTable — fixed-width table of entries for one section; same column widths on every
//  table, on both tabs, so they all line up and look identical
//----------------------------------------------------------------------------------------------
function SectionTable({ section }: { section: ConstantSection }) {
  return (
    <table className='w-full table-fixed text-xs border-collapse'>
      <thead>
        <tr className='text-left text-gray-500 border-b border-gray-200'>
          <th className='py-1.5 pr-4 font-medium w-96'>Name</th>
          <th className='py-1.5 pr-4 font-medium w-64'>Value</th>
          <th className='py-1.5 pr-4 font-medium'>Description</th>
          <th className='py-1.5 font-medium w-24'>Used by</th>
        </tr>
      </thead>
      <tbody>
        {section.entries.map(entry => (
          <tr key={entry.name} className='border-b border-gray-100 align-top'>
            <td className='py-1.5 pr-4 font-mono whitespace-nowrap'>{entry.name}</td>
            <td className='py-1.5 pr-4 break-words'>{renderValue(entry.value)}</td>
            <td className='py-1.5 pr-4 text-gray-600'>{entry.description}</td>
            <td className='py-1.5'>
              <PopoverButton label='Show'>
                <ul className='list-disc pl-4 space-y-1 text-gray-700'>
                  {entry.consumers.map((consumer, i) => (
                    <li key={i}>{consumer}</li>
                  ))}
                </ul>
              </PopoverButton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

//----------------------------------------------------------------------------------------------
//  ConstantsViewer — two-level tabbed read-only display of constants.ts and .env, no edit
//  controls. Top-level tabs pick Constants vs .env; a second tab row picks one section within
//  the active top-level tab, and only that section's table renders at a time.
//----------------------------------------------------------------------------------------------
export default function ConstantsViewer({
  constantsSections,
  envSections
}: {
  constantsSections: ConstantSection[]
  envSections: ConstantSection[]
}) {
  const [tab, setTab] = useState<Tab>('constants')
  const [sectionIndex, setSectionIndex] = useState(0)

  const sections = tab === 'constants' ? constantsSections : envSections
  const activeSection = sections[sectionIndex] ?? sections[0]

  function handleTabChange(next: Tab) {
    setTab(next)
    setSectionIndex(0)
  }

  return (
    <div className='p-8'>
      <div className='flex gap-2 mb-4 border-b border-gray-200'>
        <AppTab active={tab === 'constants'} onClick={() => handleTabChange('constants')}>
          Constants
        </AppTab>
        <AppTab active={tab === 'env'} onClick={() => handleTabChange('env')}>
          .env
        </AppTab>
      </div>

      <div className='flex gap-2 mb-6 flex-wrap'>
        {sections.map((section, i) => (
          <AppTab
            key={section.heading}
            variant='pill'
            active={i === sectionIndex}
            onClick={() => setSectionIndex(i)}
          >
            {section.heading}
          </AppTab>
        ))}
      </div>

      {activeSection && <SectionTable section={activeSection} />}
    </div>
  )
}
