import { Suspense } from 'react'
import { getPlayers } from '@/src/lib/actions/players'
import HomeDashboard from '@/src/ui/HomeDashboard'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'

export default async function Home({ searchParams }: { searchParams: Promise<{ highlight?: string }> }) {
  const [players, params] = await Promise.all([getPlayers(), searchParams])
  const lastAnalyzedGameId = params.highlight ? parseInt(params.highlight, 10) : undefined
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <HomeDashboard players={players} lastAnalyzedGameId={lastAnalyzedGameId} />
    </Suspense>
  )
}
