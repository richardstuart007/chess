'use client'

import { Suspense, useState, useEffect } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import TerminationChart from '@/src/ui/charts/TerminationChart'
import { getPlayers } from '@/src/lib/actions/players'

function EndingsContent() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])

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

export default function EndingsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <EndingsContent />
    </Suspense>
  )
}
