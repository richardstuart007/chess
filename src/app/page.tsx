//==================================================================================================
//  1) DESCRIPTION
//    Home — the site root ("/"). Fetches the tracked-player list server-side and renders
//    HomeDashboard with it, behind a Suspense boundary.
//==================================================================================================

import { Suspense } from 'react'
import { getPlayers } from '@/src/lib/actions/players'
import HomeDashboard from '@/src/ui/HomeDashboard'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'

export default async function Home() {
  const players = await getPlayers()
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <HomeDashboard players={players} />
    </Suspense>
  )
}
