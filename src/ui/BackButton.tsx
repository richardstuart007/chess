'use client'

//==================================================================================================
//  1) DESCRIPTION
//    BackButton — "← Back" control styled to match MyBackHomeNav's own link, placed alongside
//    it. Unlike MyBackHomeNav's plain <a href>, this needs real click-time logic (pop the
//    sessionStorage back stack, override player/eco/opening/dateFrom with their current live
//    values) — see src/lib/backNav.ts.
//
//    Parameters:
//      fallback  — path to navigate to if the back stack is empty
//      label     — button text (default 'Back')
//      className — override classes (default matches MyBackHomeNav's own link style)
//==================================================================================================

import { useRouter, useSearchParams } from 'next/navigation'
import { popBackTarget } from '@/src/lib/backNav'

interface BackButtonProps {
  fallback: string
  label?: string
  className?: string
}

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
