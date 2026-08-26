'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PipelineDiagram — the chess pipeline dataflow diagram (React Flow).
//==================================================================================================

import { ReactFlow, Handle, Position, MarkerType } from '@xyflow/react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const COL_WIDTH  = 240
const ROW_HEIGHT = 140
const EDGE_COLOR = '#374151'

//
//  Invisible anchor points — every node gets a source + target handle on all
//  4 sides so any edge can exit/enter from whichever side actually faces the
//  other node, regardless of which node is the source in a given edge.
//
const HANDLE_STYLE = { opacity: 0, width: 1, height: 1 }

type DiagramNodeData = { label: string; variant: 'table' | 'process' }

//----------------------------------------------------------------------------------------------
//  DiagramNode — a single pipeline-diagram box, styled blue (table) or amber (process) to match
//  the same color convention used throughout this project's docs
//----------------------------------------------------------------------------------------------
function DiagramNode({ data }: NodeProps & { data: DiagramNodeData }) {
  const boxClass = data.variant === 'table'
    ? 'border-blue-400 bg-blue-100 text-blue-900'
    : 'border-amber-400 bg-amber-200 text-amber-900'

  return (
    <div className={`w-44 rounded-md border px-4 py-2 text-center text-sm font-medium shadow-sm ${boxClass}`}>
      <Handle type='target' position={Position.Top}    id='top-tgt'    style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Top}    id='top-src'    style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Bottom} id='bottom-tgt' style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Bottom} id='bottom-src' style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Left}   id='left-tgt'   style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Left}   id='left-src'   style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Right}  id='right-tgt'  style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Right}  id='right-src'  style={HANDLE_STYLE} />
      {data.label}
    </div>
  )
}

const NODE_TYPES = { diagram: DiagramNode }

//
//  (row, col) grid layout converted to pixel positions — col 1 is the main top-to-bottom
//  pipeline chain; col 0 (Purge) and col 4 (bulkUpdateCpLoss / Evaluate Game Endings / Deepen
//  Popular Positions) are the loop-back/multi-input side processes, each aligned with the row of
//  whichever main-chain table they feed
//
function pos(row: number, col: number) {
  return { x: col * COL_WIDTH, y: (row - 1) * ROW_HEIGHT }
}

const NODES: Node<DiagramNodeData>[] = [
  { id: 'chesscom',      type: 'diagram', position: pos(1, 1),  data: { label: 'chess.com API',              variant: 'process' } },
  { id: 'tpl',           type: 'diagram', position: pos(1, 3),  data: { label: 'tpl_players',                variant: 'table' } },
  { id: 'gamesync',      type: 'diagram', position: pos(2, 2),  data: { label: 'Game Sync',                  variant: 'process' } },
  { id: 'tgr',           type: 'diagram', position: pos(3, 2),  data: { label: 'wk_gr_gamesraw',                variant: 'table' } },
  { id: 'deconstruct',   type: 'diagram', position: pos(4, 2),  data: { label: 'Deconstruct Games',          variant: 'process' } },
  { id: 'tgd',           type: 'diagram', position: pos(5, 2),  data: { label: 'tgd_gamesdecon',              variant: 'table' } },
  { id: 'gameendings',   type: 'diagram', position: pos(5, 4),  data: { label: 'Evaluate Game Endings',      variant: 'process' } },
  { id: 'buildtree',     type: 'diagram', position: pos(6, 2),  data: { label: 'Build Game Positions',       variant: 'process' } },
  { id: 'tgam',          type: 'diagram', position: pos(7, 2),  data: { label: 'tgam_game_positions',        variant: 'table' } },
  { id: 'bulkupdate',    type: 'diagram', position: pos(7, 4),  data: { label: 'bulkUpdateCpLoss',           variant: 'process' } },
  { id: 'synctpos',      type: 'diagram', position: pos(8, 2),  data: { label: 'Sync Position Tree',        variant: 'process' } },
  { id: 'tpos',          type: 'diagram', position: pos(9, 2),  data: { label: 'tpos_positions',              variant: 'table' } },
  { id: 'purge',         type: 'diagram', position: pos(9, 0),  data: { label: 'Purge',                     variant: 'process' } },
  { id: 'evaluate',      type: 'diagram', position: pos(10, 2), data: { label: 'Evaluate Positions',        variant: 'process' } },
  { id: 'pose',          type: 'diagram', position: pos(11, 2), data: { label: 'tpose_positions_eval',        variant: 'table' } },
  { id: 'deepenpopular', type: 'diagram', position: pos(11, 4), data: { label: 'Deepen Popular Positions',   variant: 'process' } },
  { id: 'buildhabits',   type: 'diagram', position: pos(12, 2), data: { label: 'Build Habits',               variant: 'process' } },
  { id: 'thab',          type: 'diagram', position: pos(13, 2), data: { label: 'thab_habits',                 variant: 'table' } },
]

//
//  Every edge exits/enters via whichever side actually faces the other node —
//  bottom/top for anything above/below (straight or elbow-routed by the `step`
//  edge type automatically), left/right for a cross-column connection.
//
function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return {
    id, source, target, sourceHandle, targetHandle,
    type: 'step',
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
  }
}

const EDGES: Edge[] = [
  edge('e1',  'tpl',           'bottom-src', 'gamesync',      'top-tgt'),
  edge('e2',  'chesscom',      'bottom-src', 'gamesync',      'top-tgt'),
  edge('e3',  'gamesync',      'bottom-src', 'tgr',           'top-tgt'),
  edge('e4',  'tgr',           'bottom-src', 'deconstruct',   'top-tgt'),
  edge('e5',  'deconstruct',   'bottom-src', 'tgd',           'top-tgt'),
  edge('e6',  'tgd',           'bottom-src', 'buildtree',     'top-tgt'),
  edge('e7',  'buildtree',     'bottom-src', 'tgam',          'top-tgt'),
  edge('e8',  'tgam',          'bottom-src', 'synctpos',      'top-tgt'),
  edge('e9',  'synctpos',      'bottom-src', 'tpos',          'top-tgt'),
  edge('e10', 'tpos',          'bottom-src', 'evaluate',      'top-tgt'),
  edge('e11', 'evaluate',      'bottom-src', 'pose',          'top-tgt'),
  edge('e12', 'purge',         'right-src',  'tgam',          'left-tgt'),
  edge('e13', 'purge',         'right-src',  'tpos',          'left-tgt'),
  edge('e14', 'purge',         'right-src',  'pose',          'left-tgt'),
  edge('e15', 'bulkupdate',    'left-src',   'tgam',          'right-tgt'),
  edge('e16', 'tgam',          'bottom-src', 'buildhabits',   'top-tgt'),
  edge('e17', 'buildhabits',   'bottom-src', 'thab',          'top-tgt'),
  edge('e18', 'gameendings',   'left-src',   'tgd',           'right-tgt'),
  edge('e19', 'pose',          'right-src',  'deepenpopular', 'left-tgt'),
  edge('e20', 'deepenpopular', 'left-src',   'pose',          'right-tgt'),
  edge('e21', 'deepenpopular', 'top-src',    'tgam',          'right-tgt'),
]

export default function PipelineDiagram() {
  return (
    <div style={{ height: 1200 }} className='w-full rounded-lg border border-gray-200 bg-gray-50'>
      <ReactFlow
        nodes={NODES}
        edges={EDGES}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
