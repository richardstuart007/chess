'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import { getPlayers } from '@/src/lib/actions/players'
import { ChessComGame } from '@/src/lib/chesscom'

function OpeningsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])
  const highlightParam = searchParams.get('highlight')
  const lastAnalyzedGameId = highlightParam ? parseInt(highlightParam, 10) : undefined

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  function handleSelectGame(game: ChessComGame, username: string) {
    const gameId = (game as any)._gameId
    if (gameId) {
      const from = encodeURIComponent('/openings')
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(username)}&from=${from}`)
    }
  }

  return (
    <div className='space-y-4'>
      {players.length > 0 && (
        <OpeningScoreChart
          players={players}
          onSelectGame={handleSelectGame}
          lastAnalyzedGameId={lastAnalyzedGameId}
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
