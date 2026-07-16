'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const TABS = [
  { key: 'games',    label: 'Games',    href: '/?tab=games' },
  { key: 'graph',    label: 'Graph',    href: '/?tab=graph' },
  { key: 'openings', label: 'Openings', href: '/?tab=openings' },
  { key: 'endings',  label: 'Endings',  href: '/?tab=endings' }
] as const

export default function TabBar() {
  const searchParams = useSearchParams()

  const activeKey = searchParams.get('tab') ?? 'games'

  return (
    <div className='flex items-end border-b border-gray-200'>
      {TABS.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeKey === t.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
