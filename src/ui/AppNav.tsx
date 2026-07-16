'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECTIONS = [
  { key: 'analysis', label: 'Game Analysis', href: '/' },
  { key: 'habits',   label: 'Habits',        href: '/habits' }
] as const

export default function AppNav() {
  const pathname = usePathname()
  const activeKey = pathname === '/habits' ? 'habits' : 'analysis'

  return (
    <div className='flex gap-2'>
      {SECTIONS.map(s => (
        <Link
          key={s.key}
          href={s.href}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
            activeKey === s.key
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )
}
