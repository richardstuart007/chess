'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { popBackTarget } from '@/src/lib/backNav'

interface BackButtonProps {
  fallback: string
  label?: string
  className?: string
}

//----------------------------------------------------------------------------------------------
//  BackButton — "← Back" control styled to match MyBackHomeNav's own link, placed alongside it.
//  Unlike MyBackHomeNav's plain <a href>, this needs real click-time logic (pop the sessionStorage
//  back stack, override player/eco/opening/dateFrom with their current live values) — see
//  src/lib/backNav.ts.
//----------------------------------------------------------------------------------------------
export default function BackButton({ fallback, label = 'Back', className = 'text-xs text-gray-500 hover:text-gray-700' }: BackButtonProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <button
      type='button'
      onClick={() => router.push(popBackTarget(searchParams, fallback))}
      className={className}
    >
      ← {label}
    </button>
  )
}
