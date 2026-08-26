'use client'

//==================================================================================================
//  1) DESCRIPTION
//    HomeDashboard — the "/" home page's main content: renders GameList for the tracked-player
//    list, with the earliest-game date fetched once for the date-filter's min bound. Selecting a
//    game pushes the current URL as a back-nav target and navigates to /analyze for that game.
//
//    Parameters:
//      players — tracked players (player, display_name)
//==================================================================================================

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import GameList from '@/src/ui/games/GameList'
import MyBox from 'nextjs-shared/MyBox'
import { getEarliestGameDate } from '@/src/lib/actions/games'
import { ChessComGame } from '@/src/lib/chesscom'
import { pushBackTarget } from '@/src/lib/backNav'

interface Player {
  player: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
}

export default function HomeDashboard({ players }: HomeDashboardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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
      const qs = searchParams.toString()
      pushBackTarget(qs ? `${pathname}?${qs}` : pathname)
      router.push(`/analyze?game=${gdid}&player=${encodeURIComponent(player)}`)
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
        minDate={minDate}
      />
    </div>
  )
}
