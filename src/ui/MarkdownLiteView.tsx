'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { plainText } from '@/src/lib/parseMarkdownLite'
import type { Section, SectionTree, LeafBlockNode, InlineNode, FlowStep } from '@/src/lib/parseMarkdownLite'
import AppTab from '@/src/ui/AppTab'

type MarkdownLiteViewProps = {
  tree: SectionTree
}

const HEADING_STYLE_1 = 'text-2xl font-bold text-gray-900'
const HEADING_STYLE_2 = 'text-xl font-semibold text-blue-800'
const HEADING_STYLE_3 = 'text-base font-semibold text-gray-800'
const HEADING_STYLE_DEFAULT = 'text-xs font-medium text-gray-500 uppercase tracking-wide'
const HEADING_STYLES: Record<number, string> = { 1: HEADING_STYLE_1, 2: HEADING_STYLE_2, 3: HEADING_STYLE_3 }

const INDENT_CLASSES = ['pl-0', 'pl-5', 'pl-5', 'pl-5', 'pl-5']

//
//  Fixed width shared by every diagram box (main-chain tables, side-node tables and
//  processes) so a paired process/table row lines up evenly regardless of label length.
//
const BOX_WIDTH = 'w-44'

//
//  Shared with the diagram legend, so the swatches always match the actual box colors.
//
const TABLE_BOX_STYLE = 'border-blue-400 bg-blue-100 text-blue-900'
const PROCESS_BOX_STYLE = 'border-amber-400 bg-amber-200 text-amber-900'

//------------------------------------------------------------------------------------------------
//  renderInline — renders inline nodes (text/bold/italic/code/link) as React nodes. `flat`
//  (used for diagram box labels) drops the link underline and the code span's background chip,
//  keeping just plain colored/monospace text so labels don't fight the box's own background.
//------------------------------------------------------------------------------------------------
function renderInline(nodes: InlineNode[], keyPrefix: string, flat = false) {
  const elements = nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    if (node.kind === 'text') return <span key={key}>{node.value}</span>
    if (node.kind === 'bold') {
      return <strong key={key} className='font-semibold text-gray-900'>{renderInline(node.children, key, flat)}</strong>
    }
    if (node.kind === 'italic') {
      return <em key={key} className='text-gray-700'>{renderInline(node.children, key, flat)}</em>
    }
    if (node.kind === 'code') {
      const codeStyle = flat ? 'font-mono text-[0.85em]' : 'font-mono text-[0.85em] bg-blue-50 text-blue-800 rounded px-1 py-0.5'
      return <code key={key} className={codeStyle}>{node.value}</code>
    }
    const linkStyle = flat ? 'text-blue-700 hover:underline' : 'text-blue-600 underline hover:text-blue-800'
    return (
      <a key={key} href={node.href} className={linkStyle}>
        {renderInline(node.children, key, flat)}
      </a>
    )
  })
  return elements
}

type FlowCurve = {
  key: string
  d: string
  double: boolean
}

//------------------------------------------------------------------------------------------------
//  FlowDiagram — renders a ```flow block as a bordered diagram panel. Main-chain nodes/arrows run
//  in a vertical column; `side-node` steps render in a left column instead; `edge` steps (plus the
//  existing per-node `loopTo` and per-arrow `to`) each draw a curved SVG line between two named
//  boxes, measured from actual rendered positions. `double`-style edges get an arrowhead at both
//  ends.
//------------------------------------------------------------------------------------------------
function FlowDiagram({ steps }: { steps: FlowStep[] }) {
  const markerId = useId()
  const markerStartId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const mainNodeIndexRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [curves, setCurves] = useState<FlowCurve[]>([])

  const mainSteps = steps.filter((s): s is Extract<FlowStep, { type: 'node' | 'arrow' }> => s.type === 'node' || s.type === 'arrow')
  const sideNodes = steps.filter((s): s is Extract<FlowStep, { type: 'side-node' }> => s.type === 'side-node')
  const edges = steps.filter((s): s is Extract<FlowStep, { type: 'edge' }> => s.type === 'edge')

  useEffect(() => {
    //
    //  Straight line between two boxes. Default: whichever pair of edges face
    //  each other on whichever axis separates the boxes more (left/right if
    //  mostly side-by-side, top/bottom if mostly stacked) — used for the
    //  tpl_players/chess.com API loop-back and any other unclassified edge.
    //  `forceVertical` always connects top/bottom — a top-row data source's
    //  edge down into the process below it. `forceHorizontal` always connects
    //  via each box's vertical-middle side edge — a process's own output edge
    //  to its paired table, which sits directly beside it. `forceTopEnd`
    //  always ends at the target's top-center (source's bottom-center) — a
    //  table's edge into the next process, "dropping into" its top.
    //
    //
    //  `endXFraction` (default 0.5, i.e. center) lets multiple forceVertical
    //  edges into the same target land at different points along its top edge
    //  instead of converging on one spot — e.g. two inputs at 1/3 and 2/3.
    //
    function buildCurve(
      sourceEl: HTMLDivElement,
      targetEl: HTMLDivElement,
      containerRect: DOMRect,
      forceVertical = false,
      forceHorizontal = false,
      forceTopEnd = false,
      endXFraction = 0.5
    ): string {
      const s = sourceEl.getBoundingClientRect()
      const t = targetEl.getBoundingClientRect()
      const dx = (t.left + t.width / 2) - (s.left + s.width / 2)
      const dy = (t.top + t.height / 2) - (s.top + s.height / 2)

      if (forceTopEnd) {
        const startX = s.left + s.width / 2 - containerRect.left
        const startY = s.bottom - containerRect.top
        const endX = t.left + t.width / 2 - containerRect.left
        const endY = t.top - containerRect.top
        return `M ${startX} ${startY} L ${endX} ${endY}`
      }

      if (forceHorizontal || (!forceVertical && Math.abs(dx) > Math.abs(dy))) {
        const targetIsRight = dx > 0
        const startX = (targetIsRight ? s.right : s.left) - containerRect.left
        const startY = s.top + s.height / 2 - containerRect.top
        const endX = (targetIsRight ? t.left : t.right) - containerRect.left
        const endY = t.top + t.height / 2 - containerRect.top
        return `M ${startX} ${startY} L ${endX} ${endY}`
      }

      if (forceVertical) {
        const startX = s.left + s.width / 2 - containerRect.left
        const startY = s.bottom - containerRect.top
        const endX = t.left + t.width * endXFraction - containerRect.left
        const endY = t.top - containerRect.top
        return `M ${startX} ${startY} L ${endX} ${endY}`
      }

      const sourceBelow = s.top > t.top
      const startX = s.left + s.width / 2 - containerRect.left
      const startY = (sourceBelow ? s.top : s.bottom) - containerRect.top
      const endX = t.left + t.width / 2 - containerRect.left
      const endY = (sourceBelow ? t.bottom : t.top) - containerRect.top
      return `M ${startX} ${startY} L ${endX} ${endY}`
    }

    function computeCurves(): void {
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const nextCurves: FlowCurve[] = []

      mainSteps.forEach((step, i) => {
        if (step.type === 'node' && step.loopTo) {
          //
          //  A node can carry its own back-reference with no separate arrow row —
          //  the curve is the only visual cue, drawn straight from this box.
          //
          const sourceEl = mainNodeIndexRefs.current[i]
          const targetEl = nodeRefs.current[step.loopTo]
          if (sourceEl && targetEl) {
            nextCurves.push({ key: `curve-node-${i}`, d: buildCurve(sourceEl, targetEl, containerRect), double: false })
          }
          return
        }

        if (step.type !== 'arrow' || step.direction !== 'up' || !step.to) return

        //
        //  The curve starts at the table box immediately above this arrow (the
        //  last table actually reached before the loop-back), not the arrow's
        //  own row — the arrow itself carries no table, just the label.
        //
        const sourceEl = mainNodeIndexRefs.current[i - 1]
        const targetEl = nodeRefs.current[step.to]
        if (!sourceEl || !targetEl) return
        nextCurves.push({ key: `curve-${i}`, d: buildCurve(sourceEl, targetEl, containerRect), double: false })
      })

      const topSideNodeIds = new Set(sideNodes.filter(n => n.top).map(n => n.id).filter((id): id is string => !!id))
      const processNodeIds = new Set(sideNodes.filter(n => !n.top && !n.table).map(n => n.id).filter((id): id is string => !!id))

      //
      //  Multiple top-row sources can land on the same process — spread them
      //  evenly along its top edge (1/3, 2/3, ... for N sources) instead of
      //  all converging on the center, ordered by each source's own X so the
      //  left-most source lands left, right-most lands right.
      //
      const verticalTargets = new Map<string, string[]>()
      edges.forEach(edge => {
        if (!topSideNodeIds.has(edge.from)) return
        const list = verticalTargets.get(edge.to) ?? []
        list.push(edge.from)
        verticalTargets.set(edge.to, list)
      })
      verticalTargets.forEach(sourceIds => {
        sourceIds.sort((a, b) => {
          const aEl = nodeRefs.current[a]
          const bEl = nodeRefs.current[b]
          if (!aEl || !bEl) return 0
          return aEl.getBoundingClientRect().left - bEl.getBoundingClientRect().left
        })
      })

      edges.forEach((edge, i) => {
        const sourceEl = nodeRefs.current[edge.from]
        const targetEl = nodeRefs.current[edge.to]
        if (!sourceEl || !targetEl) return
        const fromTopSideNode = topSideNodeIds.has(edge.from)
        const fromProcess = processNodeIds.has(edge.from)
        const intoProcess = processNodeIds.has(edge.to)
        const forceVertical = fromTopSideNode
        const forceHorizontal = fromProcess
        const forceTopEnd = !fromTopSideNode && !fromProcess && intoProcess

        let endXFraction = 0.5
        if (forceVertical) {
          const sourceIds = verticalTargets.get(edge.to) ?? [edge.from]
          const rank = sourceIds.indexOf(edge.from)
          endXFraction = (rank + 1) / (sourceIds.length + 1)
        }

        nextCurves.push({
          key: `edge-${i}`,
          d: buildCurve(sourceEl, targetEl, containerRect, forceVertical, forceHorizontal, forceTopEnd, endXFraction),
          double: edge.style === 'double'
        })
      })

      setCurves(nextCurves)
    }

    computeCurves()
    window.addEventListener('resize', computeCurves)
    return () => window.removeEventListener('resize', computeCurves)
  }, [steps])

  function renderMainNode(step: Extract<FlowStep, { type: 'node' | 'arrow' }>, i: number) {
    const stepKey = `fs${i}`
    if (step.type === 'arrow') {
      const isUp = step.direction === 'up'
      const hasLabel = step.label.length > 0
      return (
        <div key={stepKey} className='flex flex-col items-center py-1 text-center'>
          <span className={isUp ? 'text-blue-400 text-lg leading-none' : 'text-gray-300 text-lg leading-none'}>
            {isUp ? '↑' : '↓'}
          </span>
          {hasLabel && (
            <span className={isUp ? 'text-xs text-blue-500 mt-0.5' : 'text-xs text-gray-500 mt-0.5'}>
              {renderInline(step.label, stepKey)}
            </span>
          )}
        </div>
      )
    }
    const boxStyle = step.process ? PROCESS_BOX_STYLE : TABLE_BOX_STYLE
    return (
      <div
        key={stepKey}
        ref={el => {
          mainNodeIndexRefs.current[i] = el
          if (step.id) nodeRefs.current[step.id] = el
        }}
        className={`rounded-md border px-4 py-2 text-sm font-medium shadow-sm text-center ${boxStyle} ${BOX_WIDTH}`}
      >
        {renderInline(step.content, stepKey, true)}
      </div>
    )
  }

  //
  //  A node tagged {bottom} is pulled out of the vertical chain into its own
  //  row at the bottom of the diagram — "moved out of the way" while each one
  //  gets individually repositioned. Original index `i` is preserved (not the
  //  filtered position) so mainNodeIndexRefs stays correct for either group.
  //
  const mainItems = mainSteps
    .map((step, i) => ({ step, i }))
    .filter(({ step }) => !(step.type === 'node' && step.bottom))
    .map(({ step, i }) => renderMainNode(step, i))
  const bottomMainItems = mainSteps
    .map((step, i) => ({ step, i }))
    .filter(({ step }) => step.type === 'node' && step.bottom)
    .map(({ step, i }) => renderMainNode(step, i))

  function renderSideNode(step: Extract<FlowStep, { type: 'side-node' }>, key: string) {
    //
    //  Top-row side nodes (tpl_players, chess.com API) and any side node tagged
    //  {table} are data/table boxes, styled like the main-chain tables (yellow).
    //  Everything else in the side column is an actual process (Game Sync, Build
    //  Game Positions, etc.), styled brown.
    //
    const boxStyle = (step.top || step.table) ? TABLE_BOX_STYLE : PROCESS_BOX_STYLE
    return (
      <div
        key={key}
        ref={el => { if (step.id) nodeRefs.current[step.id] = el }}
        className={`rounded-md border px-4 py-2 text-sm font-medium shadow-sm text-center ${boxStyle} ${BOX_WIDTH}`}
      >
        {renderInline(step.content, key, true)}
      </div>
    )
  }

  const topSideItems = sideNodes.filter(s => s.top).map((step, i) => renderSideNode(step, `sidetop${i}`))

  //
  //  A {pair} side node joins the row of the side node immediately before it
  //  (to its right) instead of starting a new row — e.g. tgr_gamesraw pairs
  //  with Game Sync so they render side by side.
  //
  const sideRows: Array<Extract<FlowStep, { type: 'side-node' }>[]> = []
  sideNodes.filter(s => !s.top).forEach(step => {
    if (step.pair && sideRows.length > 0) {
      sideRows[sideRows.length - 1].push(step)
    } else {
      sideRows.push([step])
    }
  })
  const columnSideItems = sideRows.map((row, rowIndex) => (
    <div key={`siderow${rowIndex}`} className={row.length > 1 ? 'flex flex-row items-center gap-44' : ''}>
      {row.map((step, i) => renderSideNode(step, `side${rowIndex}-${i}`))}
    </div>
  ))

  return (
    <div
      ref={containerRef}
      className='relative flex flex-col gap-10 my-6 py-5 px-4 border border-gray-200 rounded-lg bg-gray-50'
    >
      <svg className='absolute inset-0 w-full h-full pointer-events-none overflow-visible'>
        <defs>
          <marker id={markerId} markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto'>
            <path d='M0,0 L8,4 L0,8 Z' fill='#000000' />
          </marker>
          <marker id={markerStartId} markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto-start-reverse'>
            <path d='M0,0 L8,4 L0,8 Z' fill='#000000' />
          </marker>
        </defs>
        {curves.map(curve => (
          <path
            key={curve.key}
            d={curve.d}
            fill='none'
            stroke='#000000'
            strokeWidth='1.5'
            markerEnd={`url(#${markerId})`}
            markerStart={curve.double ? `url(#${markerStartId})` : undefined}
          />
        ))}
      </svg>
      <div className='flex flex-row items-center gap-4 text-xs text-gray-600'>
        <span className='flex items-center gap-1.5'>
          <span className={`inline-block w-3 h-3 rounded-sm border ${TABLE_BOX_STYLE}`} />
          Table
        </span>
        <span className='flex items-center gap-1.5'>
          <span className={`inline-block w-3 h-3 rounded-sm border ${PROCESS_BOX_STYLE}`} />
          Process
        </span>
      </div>
      <div className='flex flex-row items-start gap-10'>
        <div className='flex flex-col items-center gap-2'>{mainItems}</div>
        {(topSideItems.length > 0 || columnSideItems.length > 0) && (
          <div className='flex flex-col gap-16'>
            {topSideItems.length > 0 && <div className='flex flex-row items-center gap-44'>{topSideItems}</div>}
            <div className={`flex flex-col gap-16 ${topSideItems.length > 0 ? '' : 'pt-8'}`}>{columnSideItems}</div>
          </div>
        )}
      </div>
      {bottomMainItems.length > 0 && (
        <div className='flex flex-row flex-wrap items-center justify-center gap-4'>{bottomMainItems}</div>
      )}
    </div>
  )
}

//------------------------------------------------------------------------------------------------
//  renderBlock — renders one leaf markdown-lite block (paragraph/list/hr/codeblock/flow);
//  headings are handled separately by SectionContent, not passed through here
//------------------------------------------------------------------------------------------------
function renderBlock(block: LeafBlockNode, key: string) {
  if (block.kind === 'paragraph') {
    return <p key={key} className='text-sm text-gray-700 leading-relaxed mb-3'>{renderInline(block.children, key)}</p>
  }

  if (block.kind === 'list') {
    const items = block.items.map((item, i) => (
      <li key={`${key}-${i}`} className='mb-1.5'>{renderInline(item, `${key}-${i}`)}</li>
    ))
    if (block.ordered) {
      return <ol key={key} className='list-decimal list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'>{items}</ol>
    }
    return <ul key={key} className='list-disc list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'>{items}</ul>
  }

  if (block.kind === 'hr') {
    return <hr key={key} className='my-8 border-gray-200' />
  }

  if (block.kind === 'flow') {
    return <FlowDiagram key={key} steps={block.steps} />
  }

  return (
    <pre key={key} className='bg-gray-50 border border-gray-200 rounded-md p-3 overflow-x-auto text-xs font-mono text-gray-700 mb-4 whitespace-pre'>
      {block.value}
    </pre>
  )
}

//------------------------------------------------------------------------------------------------
//  SectionContent — one heading, its own content, and nested subsections, always fully open (no
//  collapse) — used both for the persistent Pipeline overview and for the active tab's content
//------------------------------------------------------------------------------------------------
function SectionContent({ section, depth }: { section: Section; depth: number }) {
  const headingStyle = HEADING_STYLES[section.level] ?? HEADING_STYLE_DEFAULT
  const indentClass = INDENT_CLASSES[Math.min(depth, INDENT_CLASSES.length - 1)]
  const headingContent = renderInline(section.heading, `sh${depth}`)
  const contentBlocks = section.content.map((block, i) => renderBlock(block, `sc${depth}-${i}`))
  const subsectionElements = section.subsections.map((sub, i) => (
    <SectionContent key={i} section={sub} depth={depth + 1} />
  ))

  return (
    <div
      id={section.id}
      className={`scroll-mt-4 ${depth === 0 ? 'mt-6 first:mt-0' : `${indentClass} mt-4 border-l border-gray-100`}`}
    >
      <div className={`${headingStyle} py-1`}>{headingContent}</div>
      <div className='pl-5'>
        {contentBlocks}
        {subsectionElements}
      </div>
    </div>
  )
}

//------------------------------------------------------------------------------------------------
//  TabBar — one button per top-level section; styled to match the rest of the app's tabs
//  (src/ui/AppTab.tsx) so /owner/dataflow's tabs feel like the rest of the app
//------------------------------------------------------------------------------------------------
function TabBar({ tabs, active, onSelect }: { tabs: Section[]; active: number; onSelect: (i: number) => void }) {
  const buttons = tabs.map((tab, i) => (
    <AppTab
      key={i}
      active={i === active}
      onClick={() => onSelect(i)}
      overrideClass='whitespace-nowrap'
    >
      {plainText(tab.heading)}
    </AppTab>
  ))
  return <div className='flex items-end flex-wrap border-b border-gray-200 mb-6'>{buttons}</div>
}

//------------------------------------------------------------------------------------------------
//  MarkdownLiteView — renders a pre-parsed section tree (parseMarkdownLite + buildSectionTree).
//  Every one of the doc's root heading's subsections (including Pipeline overview) becomes a tab.
//  Clicking an internal `#id` link switches to whichever tab holds that id, then scrolls to it
//  once mounted.
//------------------------------------------------------------------------------------------------
export default function MarkdownLiteView({ tree }: MarkdownLiteViewProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)

  const root = tree.sections[0]
  const tabSections = root ? root.subsections : []

  useEffect(() => {
    if (pendingScrollId === null) return
    const el = document.getElementById(pendingScrollId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingScrollId(null)
  }, [activeTab, pendingScrollId])

  function handleClick(e: MouseEvent<HTMLDivElement>): void {
    const anchor = (e.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href || !href.startsWith('#')) return
    const id = href.slice(1)
    const tabIndex = tabSections.findIndex(s => s.id === id)
    if (tabIndex === -1) return
    e.preventDefault()
    setActiveTab(tabIndex)
    setPendingScrollId(id)
  }

  const preambleBlocks = tree.preamble.map((block, i) => renderBlock(block, `pre${i}`))

  if (!root) {
    return <div>{preambleBlocks}</div>
  }

  const rootContentBlocks = root.content.map((block, i) => renderBlock(block, `rc${i}`))

  return (
    <div onClick={handleClick}>
      {preambleBlocks}
      <div className={`${HEADING_STYLE_1} mb-3`}>{renderInline(root.heading, 'root-h')}</div>
      {rootContentBlocks}

      {tabSections.length > 0 && (
        <>
          <TabBar tabs={tabSections} active={activeTab} onSelect={setActiveTab} />
          <SectionContent section={tabSections[activeTab]} depth={0} />
        </>
      )}
    </div>
  )
}
