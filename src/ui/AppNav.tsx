'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECTIONS = [
  { key: 'games',    label: 'Games',    href: '/' },
  { key: 'habits',   label: 'Habits',   href: '/habits' },
  { key: 'graph',    label: 'Graph',    href: '/graph' },
  { key: 'openings', label: 'Openings', href: '/openings' },
  { key: 'endings',  label: 'Endings',  href: '/endings' }
] as const

export default function AppNav() {
  const pathname = usePathname()
  //
  //  /analyze and /position/[id] are cross-cutting detail views reached from more than
  //  one section (Games/Habits/Openings) — no single tab owns them, so none is highlighted.
  //
  const activeKey = pathname === '/habits' ? 'habits'
    : pathname === '/graph' ? 'graph'
    : pathname === '/openings' ? 'openings'
    : pathname === '/endings' ? 'endings'
    : pathname === '/' ? 'games'
    : null

  return (
    <div className='flex items-end border-b border-gray-200'>
      {SECTIONS.map(s => (
        <Link
          key={s.key}
          href={s.href}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeKey === s.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )
}
