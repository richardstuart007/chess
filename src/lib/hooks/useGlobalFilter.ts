'use client'

//==================================================================================================
//  1) DESCRIPTION
//    useGlobalFilter — reads/writes one URL search param, shared across every page via
//    ?<key>=<value> (the mechanism player/timeClass/dateFrom/opening/eco all use).
//
//    Parameters:
//      key — the URL search param name to read/write
//
//    Returns:
//      [value, setValue] — current value ('' if unset) and a setter
//
//  2) NOTES
//    Absence in the URL always means "unset" — there is no sessionStorage fallback, unlike
//    page-local filters.
//==================================================================================================

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function useGlobalFilter(key: string): [string, (next: string) => void] {
  const setMultiple = useGlobalFilters()
  const searchParams = useSearchParams()
  const value = searchParams.get(key) ?? ''

  function setValue(next: string) {
    setMultiple({ [key]: next })
  }

  return [value, setValue]
}

//----------------------------------------------------------------------------------------------
//  useGlobalFilters — sets multiple global filter params in a single router.push. Calling
//  useGlobalFilter's setValue multiple times in the same handler is unsafe: each call builds its
//  new URL from the same pre-click searchParams snapshot (the component hasn't re-rendered
//  between the calls), so each push overwrites the previous one instead of composing — only the
//  last call's param survives. Any handler that needs to apply more than one global filter at
//  once (e.g. a shared "Filter" button) must use this instead.
//----------------------------------------------------------------------------------------------
export function useGlobalFilters(): (updates: Record<string, string>) => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return function setMultiple(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, next] of Object.entries(updates)) {
      if (next) params.set(key, next); else params.delete(key)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
}
