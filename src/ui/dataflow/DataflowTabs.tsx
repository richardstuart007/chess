'use client'

//==================================================================================================
//  1) DESCRIPTION
//    DataflowTabs — one tab bar, "Diagram" alongside one tab per pipeline table/process, all
//    plain TSX (no markdown parsing).
//==================================================================================================

import { useState } from 'react'
import { MyTab } from 'nextjs-shared/MyTab'
import PipelineDiagram from '@/src/ui/dataflow/PipelineDiagram'
import { SECTIONS } from '@/src/ui/dataflow/sections'

type ActiveTab = 'diagram' | string

export default function DataflowTabs() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('diagram')

  const activeSection = SECTIONS.find(s => s.id === activeTab)

  return (
    <div>
      <div className='flex gap-0 border-b border-gray-200 mb-4 flex-wrap'>
        <MyTab active={activeTab === 'diagram'} onClick={() => setActiveTab('diagram')}>
          Diagram
        </MyTab>
        {SECTIONS.map(section => (
          <MyTab key={section.id} active={activeTab === section.id} onClick={() => setActiveTab(section.id)}>
            {section.label}
          </MyTab>
        ))}
      </div>
      {activeTab === 'diagram' && <PipelineDiagram />}
      {activeSection && activeSection.content}
    </div>
  )
}
