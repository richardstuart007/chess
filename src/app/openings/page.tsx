'use client'

//==================================================================================================
//  1) DESCRIPTION
//    OpeningsPage — /openings. Loads the tracked-player list client-side and renders
//    OpeningScoreChart, behind a Suspense boundary. Clicking a bar pushes the current URL as a
//    back-nav target and navigates to the Games tab (/) with that opening (eco + name) preset.
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import { getPlayers } from '@/src/lib/actions/players'
import { pushBackTarget } from '@/src/lib/backNav'

export default function OpeningsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <OpeningsContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  OpeningsContent — loads players, then renders OpeningScoreChart once loaded
//----------------------------------------------------------------------------------
function OpeningsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<{ player: string; display_name: string | null }[]>([])

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  //
  //  Bar click → Games tab with the opening preset. eco/opening/color are set on top of the
  //  current search params; player/timeClass/dateFrom carry across automatically (all global URL
  //  params). Together these are every attribute that decides which games a bar represents, so
  //  the Games tab shows the identical set. color is omitted when the chart's Colour is "All".
  //
  function handleSelectOpening(eco: string, openingName: string, color: '' | 'white' | 'black') {
    const qs = searchParams.toString()
    pushBackTarget(qs ? `${pathname}?${qs}` : pathname)
    const params = new URLSearchParams(searchParams)
    params.set('eco', eco)
    params.set('opening', openingName)
    if (color) params.set('color', color); else params.delete('color')
    router.push(`/?${params.toString()}`)
  }

  return (
    <div className='space-y-4'>
      {players.length > 0 && (
        <OpeningScoreChart
          players={players}
          onSelectOpening={handleSelectOpening}
        />
      )}
    </div>
  )
}
