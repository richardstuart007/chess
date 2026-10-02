'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MoveTree_shared — main-line move table with inline variation branches, evaluation cells, and
//    optional per-move occurrence counts. Scrolls the active move into view on selection change.
//    Used by both tracked-player and master-game analysis.
//
//    Parameters:
//      tree         — the analysis tree to render
//      currentNode  — the currently selected/active move node, or null
//      onSelectNode — called with the clicked node
//      moveCounts   — optional occurrence count per node id, shown next to the move
//==================================================================================================

import { useEffect, useRef } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { AnalysisTree, MoveNode } from '@/src/lib/analysisTree'
import { PlyEvaluation } from '@/src/lib/stockfish'
import { formatCp } from '@/src/lib/formatCp'

type MoveTreeProps = {
  tree: AnalysisTree
  currentNode: MoveNode | null
  onSelectNode: (node: MoveNode) => void
  moveCounts?: Record<string, number>
}

const CLASSIFICATION_TEXT_COLORS: Record<string, string> = {
  blunder: 'text-red-600',
  mistake: 'text-orange-500',
  inaccuracy: 'text-yellow-600',
  good: 'text-blue-600'
}

export default function MoveTree_shared({ tree, currentNode, onSelectNode, moveCounts }: MoveTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && currentNode) {
      const active = containerRef.current.querySelector(`[data-node-id="${currentNode.id}"]`)
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentNode])

  const mainLine = tree.mainLine
  const rows: React.ReactNode[] = []

  for (let i = 0; i < mainLine.length; i += 2) {
    const whiteNode = mainLine[i]
    const blackNode = i + 1 < mainLine.length ? mainLine[i + 1] : null
    const moveNum = Math.floor(i / 2) + 1
    const mainKey = `main-${i}`
    const whiteIsActive = currentNode?.id === whiteNode.id
    const blackIsActive = blackNode != null && currentNode?.id === blackNode.id
    const blackEvalNode = blackNode ?? undefined
    const blackStartPly = i + 1

    rows.push(
      <tr key={mainKey} className='border-b border-gray-50'>
        <td className='py-px pr-1 text-gray-400 font-mono text-xs w-8'>{moveNum}.</td>
        <td className='py-px w-24'>
          <MoveBadge
            node={whiteNode}
            isActive={whiteIsActive}
            onClick={() => onSelectNode(whiteNode)}
            count={moveCounts?.[whiteNode.id]}
          />
        </td>
        <EvalCell node={whiteNode} />
        <td className='py-px w-24'>
          {blackNode && (
            <MoveBadge
              node={blackNode}
              isActive={blackIsActive}
              onClick={() => onSelectNode(blackNode)}
              count={moveCounts?.[blackNode.id]}
            />
          )}
        </td>
        <EvalCell node={blackEvalNode} />
      </tr>
    )

    //
    //  White variations
    //
    const whiteParent = whiteNode.parent
    if (whiteParent && whiteParent.children.length > 1) {
      const branches = whiteParent.children.filter(c => c.id !== whiteNode.id)
      for (const branch of branches) {
        const whiteVariationKey = `var-w-${branch.id}`
        rows.push(
          <tr key={whiteVariationKey}>
            <td colSpan={5} className='py-0'>
              <InlineVariation
                startNode={branch}
                startPly={i}
                currentNode={currentNode}
                onSelectNode={onSelectNode}
                moveCounts={moveCounts}
              />
            </td>
          </tr>
        )
      }
    }

    //
    //  Black variations
    //
    if (blackNode && whiteNode.children.length > 1) {
      const branches = whiteNode.children.filter(c => c.id !== blackNode.id)
      for (const branch of branches) {
        const blackVariationKey = `var-b-${branch.id}`
        rows.push(
          <tr key={blackVariationKey}>
            <td colSpan={5} className='py-0'>
              <InlineVariation
                startNode={branch}
                startPly={blackStartPly}
                currentNode={currentNode}
                onSelectNode={onSelectNode}
                moveCounts={moveCounts}
              />
            </td>
          </tr>
        )
      }
    }
  }

  return (
    <div ref={containerRef} className='overflow-y-auto'>
      <table className='table-fixed w-[416px] mx-auto text-xs'>
        <thead>
          <tr className='border-b border-gray-200 text-gray-400'>
            <th className='w-8 pb-1 text-left'>#</th>
            <th className='w-24 pb-1 text-left'>White</th>
            <th className='w-24 pb-1 text-left'>Eval</th>
            <th className='w-24 pb-1 text-left'>Black</th>
            <th className='w-24 pb-1 text-left'>Eval</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  MoveBadge — one move's clickable SAN badge, colored by classification (or plain gray/blue for
//  main-line/variation), with a ??/?/?! annotation and optional occurrence count
//
//  Params:
//    node — the move node to show
//    isActive — true when this is the move currently on the board
//    onClick — called when the badge is clicked
//    count — how many times the move has been played, shown as a badge (optional)
//
//  Returns:
//    the clickable move badge
//----------------------------------------------------------------------------------------------
function MoveBadge({
  node,
  isActive,
  onClick,
  count
}: {
  node: MoveNode
  isActive: boolean
  onClick: () => void
  count?: number
}) {
  const ev = node.evaluation
  const textColor = ev
    ? CLASSIFICATION_TEXT_COLORS[ev.classification]
    : node.isMainLine
      ? 'text-gray-700'
      : 'text-blue-600'

  const ann = annotationSymbol(ev)
  const badgeClass = `inline-flex items-center gap-0.5 h-4 md:h-4 px-0.5 text-xs font-medium transition-all ${textColor} ${
    isActive ? 'bg-green-200 hover:bg-green-200 rounded' : 'bg-transparent hover:bg-transparent'
  }`
  const showCount = count !== undefined && count > 1

  return (
    <MyButton
      onClick={onClick}
      data-node-id={node.id}
      overrideClass={badgeClass}
    >
      <span>{node.san}</span>
      {ann && <span className='text-xxs text-blue-500'>{ann}</span>}
      {showCount && (
        <span className='text-xxs text-gray-400 font-mono'> ({count})</span>
      )}
    </MyButton>
  )
}

//----------------------------------------------------------------------------------------------
//  annotationSymbol — ??/?/?! for blunder/mistake/inaccuracy, or '' otherwise
//
//  Params:
//    ev — the move's evaluation (optional)
//
//  Returns:
//    '??' for a blunder, '?' for a mistake, '?!' for an inaccuracy, otherwise ''
//----------------------------------------------------------------------------------------------
function annotationSymbol(ev?: PlyEvaluation): string {
  if (!ev) return ''
  if (ev.classification === 'blunder') return '??'
  if (ev.classification === 'mistake') return '?'
  if (ev.classification === 'inaccuracy') return '?!'
  return ''
}

//----------------------------------------------------------------------------------------------
//  EvalCell — one table cell showing a node's Stockfish eval + depth, or blank if unevaluated
//
//  Params:
//    node — the move node whose evaluation to show (optional)
//
//  Returns:
//    a table cell with the node's eval and depth, blank when unevaluated
//----------------------------------------------------------------------------------------------
function EvalCell({ node }: { node?: MoveNode }) {
  if (!node?.evaluation) return <td className='py-px w-24'></td>
  const cp = node.evaluation.cp
  const depth = node.evaluation.depth
  const cellClass = `py-px w-24 font-mono text-xxs ${evalColor(cp)}`
  const cpLabel = formatCp(cp)
  return (
    <td className={cellClass}>
      {cpLabel}
      <span className='text-gray-400'> ({depth})</span>
    </td>
  )
}

//----------------------------------------------------------------------------------------------
//  evalColor — text color for a centipawn value (red if negative, gray otherwise). NOTE: called
//  from both EvalCell and InlineVariation — no single caller to anchor its position to, placed
//  after its first caller (EvalCell) as a judgment call, not a strict first-use derivation.
//
//  Params:
//    cp — the evaluation in centipawns
//
//  Returns:
//    the CSS class used to colour that evaluation
//----------------------------------------------------------------------------------------------
function evalColor(cp: number): string {
  if (cp < 0) return 'text-red-600'
  return 'text-gray-900'
}

//----------------------------------------------------------------------------------------------
//  InlineVariation — one branch off the main line, rendered as its own indented mini-line of
//  MoveBadges, following first-children only (a variation's own sub-variations aren't shown)
//
//  Params:
//    startNode — the first node of the variation
//    startPly — the 1-indexed ply of startNode
//    currentNode — the node currently on the board, or null
//    onSelectNode — called with a node when its move is clicked
//    moveCounts — times each move has been played, keyed by node id (optional)
//
//  Returns:
//    the variation's moves rendered inline
//----------------------------------------------------------------------------------------------
function InlineVariation({
  startNode,
  startPly,
  currentNode,
  onSelectNode,
  moveCounts
}: {
  startNode: MoveNode
  startPly: number
  currentNode: MoveNode | null
  onSelectNode: (node: MoveNode) => void
  moveCounts?: Record<string, number>
}) {
  const moves: { node: MoveNode; ply: number }[] = []
  let node: MoveNode | null = startNode
  let ply = startPly

  while (node) {
    moves.push({ node, ply })
    node = node.children.length > 0 ? node.children[0] : null
    ply++
  }

  return (
    <div className='ml-4 my-0.5 flex flex-wrap items-center gap-0.5 rounded bg-gray-50 px-1.5 py-0.5 border-l-2 border-blue-300'>
      {moves.map(({ node: n, ply: p }) => {
        const moveNum = Math.floor(p / 2) + 1
        const isWhite = p % 2 === 0
        const showBlackMoveNum = !isWhite && p === startPly
        const isActive = currentNode?.id === n.id
        const showEvaluation = !!n.evaluation
        const evalClass = n.evaluation ? `text-xxs font-mono ${evalColor(n.evaluation.cp)}` : ''
        const cpLabel = n.evaluation ? formatCp(n.evaluation.cp) : ''

        return (
          <span key={n.id} className='inline-flex items-center gap-0.5'>
            {isWhite && (
              <span className='text-xxs text-gray-400 font-mono'>{moveNum}.</span>
            )}
            {showBlackMoveNum && (
              <span className='text-xxs text-gray-400 font-mono'>{moveNum}...</span>
            )}
            <MoveBadge
              node={n}
              isActive={isActive}
              onClick={() => onSelectNode(n)}
              count={moveCounts?.[n.id]}
            />
            {showEvaluation && (
              <span className={evalClass}>
                {cpLabel}
                <span className='text-gray-400'> ({n.evaluation?.depth})</span>
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
