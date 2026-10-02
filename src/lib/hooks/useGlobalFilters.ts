'use client'

//==================================================================================================
//  1) DESCRIPTION
//    useGlobalFilters — sets multiple global filter params in a single router.push.
//
//    Returns:
//      a setter taking { key: value } updates; an empty value removes that param
//
//  2) NOTES
//    Calling useGlobalFilter's setValue multiple times in the same handler is unsafe: each call
//    builds its new URL from the same pre-click searchParams snapshot (the component hasn't
//    re-rendered between the calls), so each push overwrites the previous one instead of
//    composing — only the last call's param survives. Any handler that needs to apply more than
//    one global filter at once (e.g. a shared "Filter" button) must use this instead.
//==================================================================================================

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function useGlobalFilters(): (updates: Record<string, string>) => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  //----------------------------------------------------------------------------------------------
  //  setMultiple — applies several URL param updates in one router.push
  //
  //  Params:
  //    updates — param name → new value ('' removes that param)
  //----------------------------------------------------------------------------------------------
  return function setMultiple(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, next] of Object.entries(updates)) {
      if (next) params.set(key, next); else params.delete(key)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
}
