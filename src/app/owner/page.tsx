//==================================================================================================
//  1) DESCRIPTION
//    Page — /owner. Tab shell (via nextjs-shared's OwnerPage) hosting Logging, Cache, per-domain
//    tool-launcher panels (Players/Masters/FIDE), Pipeline Log, Dataflow, Constants, Session
//    Storage, and Routing Maintenance.
//==================================================================================================

import Link from 'next/link'
import OwnerPage from 'nextjs-shared/OwnerPage'
import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'
import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import DataflowTabs from '@/src/ui/dataflow/DataflowTabs'
import ConstantsPage from './constants/page'
import OwnerTableSessionStorage from 'nextjs-shared/OwnerTableSessionStorage'
import OwnerRoutingMaintenance from 'nextjs-shared/OwnerRoutingMaintenance'
import PipelineLogTable from '@/src/ui/analysis/PipelineLogTable'

const TOOLS_PLAYERS = [
  { href: '/owner/pipelinegames', label: 'Pipeline (Games)', description: 'Step-by-step control panel for the chess game analysis pipeline (sync, build tree, evaluate) — includes Run All and per-job status.', step: '▶' }
]

const TOOLS_MASTERS = [
  { href: '/owner/pipelinemastergames', label: 'Pipeline (Master Games)', description: 'Step-by-step control panel for the master-games position database pipeline (sync, deconstruct, build tree), for one or more selected master players and a chosen year.', step: '🧪' }
]

const TOOLS_FIDE = [
  { href: '/owner/masterplayers', label: 'FIDE/Chess.com Master Players Matching', description: 'Harvest chess.com master-game player names by Year/Player into tmst_master_players, and flag names as priority for the Analyze page\'s "Search known masters" loop.', step: '♟' },
  { href: '/owner/pipelinemasters', label: 'Pipeline (FIDE)', description: 'Step-by-step control panel for the FIDE master-players pipeline (download, unzip, parse, populate, refresh) — each stage independently re-runnable.', step: '♛' }
]

export default function Page() {
  return (
    <OwnerPage
      persistKey='chess-owner-tab'
      tabs={[
        { label: 'Logging', content: <OwnerTableLogging /> },
        { label: 'Cache', content: <OwnerTableCache /> },
        { label: 'Players', content: <ToolsPanel tools={TOOLS_PLAYERS} /> },
        { label: 'Masters', content: <ToolsPanel tools={TOOLS_MASTERS} /> },
        { label: 'FIDE', content: <ToolsPanel tools={TOOLS_FIDE} /> },
        { label: 'Pipeline Log', content: <div className='p-6 md:p-8'><PipelineLogTable /></div> },
        { label: 'Dataflow', content: <div className='p-6 md:p-8'><DataflowTabs /></div> },
        { label: 'Constants', content: <ConstantsPage /> },
        { label: 'Session Storage', content: <OwnerTableSessionStorage /> },
        { label: 'Routing Maintenance', content: <OwnerRoutingMaintenance /> }
      ]}
    />
  )
}

//----------------------------------------------------------------------------------
//  ToolsPanel — renders a list of tool launcher cards (icon, label, description) as links
//----------------------------------------------------------------------------------
function ToolsPanel({ tools }: { tools: { href: string; label: string; description: string; step: string }[] }) {
  return (
    <div className='p-8 max-w-2xl'>
      <div className='space-y-3'>
        {tools.map(t => (
          <Link key={t.href} href={t.href}
            className='flex items-start gap-4 rounded border border-gray-200 p-4 hover:bg-gray-50 transition-colors'>
            <span className='flex-none w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center'>
              {t.step}
            </span>
            <div>
              <p className='text-sm font-semibold text-gray-800'>{t.label}</p>
              <p className='text-xs text-gray-500 mt-0.5'>{t.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
