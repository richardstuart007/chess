'use client'

//==================================================================================================
//  1) DESCRIPTION
//    EndingsPage — /endings. Loads the tracked-player list client-side and renders
//    TerminationChart, behind a Suspense boundary.
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import TerminationChart from '@/src/ui/charts/TerminationChart'
import { getPlayers } from '@/src/lib/actions/players'

export default function EndingsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <EndingsContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  EndingsContent — loads players, then renders TerminationChart once loaded
//----------------------------------------------------------------------------------
function EndingsContent() {
  const [players, setPlayers] = useState<{ player: string; display_name: string | null }[]>([])

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  return (
    <div className='space-y-4'>
      {players.length > 0 && <TerminationChart players={players} />}
    </div>
  )
}
