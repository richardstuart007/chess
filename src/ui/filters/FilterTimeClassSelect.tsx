'use client'

//==================================================================================================
//  1) DESCRIPTION
//    FilterTimeClassSelect — time-class picker shared by every page with a Time filter (Games/
//    Graph/Openings/Endings). Reads/writes the same `?timeClass=` URL param the PlayerProfile
//    header's rating badges use, so this dropdown and the header stay in sync either way.
//
//    Parameters:
//      label — filter label text
//      width — override width class
//
//  2) NOTES
//    Applies instantly, unlike each page's other, draft/apply-gated filters — matching how
//    player selection already behaves.
//==================================================================================================

import TimeClassSelect from './TimeClassSelect'
import { useGlobalFilter } from '@/src/lib/hooks/useGlobalFilter'
import { GLOBAL_FILTER_BORDER_CLASS } from '@/src/lib/constants'

interface FilterTimeClassSelectProps {
  label?: string
  width?: string
}

export default function FilterTimeClassSelect({ label, width }: FilterTimeClassSelectProps) {
  const [value, setValue] = useGlobalFilter('timeClass')

  return <TimeClassSelect value={value} onChange={setValue} label={label} width={width} borderClass={GLOBAL_FILTER_BORDER_CLASS} />
}
