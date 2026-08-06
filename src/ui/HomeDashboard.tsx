'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import GameList from '@/src/ui/games/GameList'
import MyBox from 'nextjs-shared/MyBox'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { getEarliestGameDate } from '@/src/lib/actions/games'
import { ChessComGame } from '@/src/lib/chesscom'
import { BACK_KEY } from '@/src/lib/constants'

interface Player {
  player: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
  lastAnalyzedGdid?: number
}

export default function HomeDashboard({ players, lastAnalyzedGdid }: HomeDashboardProps) {
  const router = useRouter()

  const [minDate, setMinDate] = useState<string | undefined>()

  const playerList = players.map(p => p.player).join(',')

  //
  //  Memoized so GameList's own useMemo/useEffect chains (which depend on this array
  //  by reference) don't refire on every HomeDashboard re-render — an unmemoized new
  //  array here previously caused a runaway fetch loop.
  //
  const playerOptions = useMemo(
    () => players.map(p => ({ player: p.player, displayName: p.display_name })),
    [playerList]
  )

  useEffect(() => {
    async function fetchMin() {
      const min = await getEarliestGameDate(players.map(p => p.player))
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerList])

  function handleSelectGame(game: ChessComGame, player: string) {
    const gdid = (game as any)._gdid
    if (gdid) {
      saveBackNav(BACK_KEY)
      router.push(`/analyze?game=${gdid}&user=${encodeURIComponent(player)}`)
    }
  }

  if (players.length === 0) {
    return (
      <div className='space-y-4'>
        <MyBox title='No Players'>
          <p className='text-xs text-gray-600'>
            No players in the database yet.
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
        lastAnalyzedGdid={lastAnalyzedGdid}
        minDate={minDate}
      />
    </div>
  )
}
