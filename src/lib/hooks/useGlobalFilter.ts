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

import { useSearchParams } from 'next/navigation'
import { useGlobalFilters } from './useGlobalFilters'

export function useGlobalFilter(key: string): [string, (next: string) => void] {
  const setMultiple = useGlobalFilters()
  const searchParams = useSearchParams()
  const value = searchParams.get(key) ?? ''

  //----------------------------------------------------------------------------------------------
  //  setValue — sets this hook's URL param
  //
  //  Params:
  //    next — the new value
  //----------------------------------------------------------------------------------------------
  function setValue(next: string) {
    setMultiple({ [key]: next })
  }

  return [value, setValue]
}
