'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import { getPlayers } from '@/src/lib/actions/players'
import { ChessComGame } from '@/src/lib/chesscom'
import { BACK_KEY } from '@/src/lib/constants'

function OpeningsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<{ player: string; display_name: string | null }[]>([])
  const highlightParam = searchParams.get('highlight')
  const lastAnalyzedGdid = highlightParam ? parseInt(highlightParam, 10) : undefined

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  function handleSelectGame(game: ChessComGame, player: string) {
    const gdid = (game as any)._gdid
    if (gdid) {
      saveBackNav(BACK_KEY)
      router.push(`/analyze?game=${gdid}&user=${encodeURIComponent(player)}`)
    }
  }

  return (
    <div className='space-y-4'>
      {players.length > 0 && (
        <OpeningScoreChart
          players={players}
          onSelectGame={handleSelectGame}
          lastAnalyzedGdid={lastAnalyzedGdid}
        />
      )}
    </div>
  )
}

export default function OpeningsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading…' />}>
      <OpeningsContent />
    </Suspense>
  )
}
