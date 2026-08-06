import Link from 'next/link'
import OwnerPage from 'nextjs-shared/OwnerPage'
import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'
import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import DataflowTabs from '@/src/ui/dataflow/DataflowTabs'
import ConstantsPage from './constants/page'
import OwnerTableSessionStorage from 'nextjs-shared/OwnerTableSessionStorage'

const TOOLS = [
  { href: '/owner/pipeline', label: 'Pipeline', description: 'Step-by-step control panel for the analysis pipeline (sync, build tree, evaluate) — includes Run All and per-job status.', step: '▶' },
  { href: '/owner/pipelinelog', label: 'Pipeline Log', description: 'History of pipeline runs — per-step attempted/processed/errors/duration.', step: '📈' }
]

function ToolsPanel() {
  return (
    <div className='p-8 max-w-2xl'>
      <div className='space-y-3'>
        {TOOLS.map(t => (
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

export default function Page() {
  return (
    <OwnerPage
      persistKey='chess-owner-tab'
      tabs={[
        { label: 'Logging', content: <OwnerTableLogging /> },
        { label: 'Cache', content: <OwnerTableCache /> },
        { label: 'Tools', content: <ToolsPanel /> },
        { label: 'Dataflow', content: <div className='p-6 md:p-8'><DataflowTabs /></div> },
        { label: 'Constants', content: <ConstantsPage /> },
        { label: 'Session Storage', content: <OwnerTableSessionStorage /> }
      ]}
    />
  )
}
