'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import GameList from '@/src/ui/games/GameList'
import MyBox from 'nextjs-shared/MyBox'
import { getEarliestGameDate } from '@/src/lib/actions/games'
import { ChessComGame } from '@/src/lib/chesscom'

interface Player {
  username: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
  lastAnalyzedGameId?: number
}

export default function HomeDashboard({ players, lastAnalyzedGameId }: HomeDashboardProps) {
  const router = useRouter()

  const [minDate, setMinDate] = useState<string | undefined>()

  const playerUsernames = players.map(p => p.username).join(',')

  //
  //  Memoized so GameList's own useMemo/useEffect chains (which depend on this array
  //  by reference) don't refire on every HomeDashboard re-render — an unmemoized new
  //  array here previously caused a runaway fetch loop.
  //
  const playerOptions = useMemo(
    () => players.map(p => ({ username: p.username, displayName: p.display_name })),
    [playerUsernames]
  )

  useEffect(() => {
    async function fetchMin() {
      const min = await getEarliestGameDate(players.map(p => p.username))
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerUsernames])

  function handleSelectGame(game: ChessComGame, username: string) {
    const gameId = (game as any)._gameId
    if (gameId) {
      const from = encodeURIComponent('/')
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(username)}&from=${from}`)
    }
  }

  if (players.length === 0) {
    return (
      <div className='space-y-4'>
        <MyBox title='No Players'>
          <p className='text-xs text-gray-600'>
            No players in the database yet.{' '}
            <a href='/owner/maintenance' className='text-blue-600 underline'>Go to Maintenance</a>{' '}
            to add players.
          </p>
        </MyBox>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <GameList
        players={playerOptions}
        onSelectGame={handleSelectGame}
        lastAnalyzedGameId={lastAnalyzedGameId}
        minDate={minDate}
      />
    </div>
  )
}
