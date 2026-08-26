'use client'

//==================================================================================================
//  1) DESCRIPTION
//    OpeningsPage — /openings. Loads the tracked-player list client-side and renders
//    OpeningScoreChart, behind a Suspense boundary. Selecting a game pushes the current URL as a
//    back-nav target and navigates to /analyze for that game.
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import { getPlayers } from '@/src/lib/actions/players'
import { ChessComGame } from '@/src/lib/chesscom'
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

  function handleSelectGame(game: ChessComGame, player: string) {
    const gdid = (game as any)._gdid
    if (gdid) {
      const qs = searchParams.toString()
      pushBackTarget(qs ? `${pathname}?${qs}` : pathname)
      router.push(`/analyze?game=${gdid}&player=${encodeURIComponent(player)}`)
    }
  }

  return (
    <div className='space-y-4'>
      {players.length > 0 && (
        <OpeningScoreChart
          players={players}
          onSelectGame={handleSelectGame}
        />
      )}
    </div>
  )
}
