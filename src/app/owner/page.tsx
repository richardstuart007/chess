import Link from 'next/link'

const TOOLS = [
  { href: '/owner/logging', label: 'Logging', description: 'View application log entries.', step: '📋' },
  { href: '/owner/cache', label: 'Cache', description: 'Inspect and manage server-side cache entries.', step: '🗄' },
  { href: '/owner/pipeline', label: 'Pipeline', description: 'Step-by-step control panel for the analysis pipeline (sync, build tree, evaluate) — includes Run All and per-job status.', step: '▶' },
  { href: '/owner/pipelinelog', label: 'Pipeline Log', description: 'History of pipeline runs — per-step attempted/processed/errors/duration.', step: '📈' },
  { href: '/owner/dataflow', label: 'Dataflow', description: 'Readable view of docs/Dataflow.md — how data moves through the pipeline.', step: '🗺' },
  { href: '/owner/constants', label: 'Constants', description: 'Read-only view of every constants.ts value and .env variable, with descriptions and consumers.', step: '⚙' }
]

export default function OwnerPage() {
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
