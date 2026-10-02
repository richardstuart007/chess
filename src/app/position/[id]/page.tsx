'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PositionPage — /position/[id]. Loads one position's detail (evaluation, per-move breakdown,
//    occurrence games) via getPositionDetail_player and renders PositionDetail, behind a Suspense
//    boundary.
//
//    Parameters (from the URL):
//      id     — pos_id (route param)
//      player — optional, scopes the per-move breakdown to one tracked player
//==================================================================================================

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import PositionDetail from '@/src/ui/analysis/PositionDetail'
import { getPositionDetail_player } from '@/src/lib/analysis/chessdb_player'

export default function PositionPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <PositionDetailContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  PositionDetailContent — loads the position detail by route id, then renders PositionDetail
//----------------------------------------------------------------------------------
function PositionDetailContent() {
  const [positionDetail, setPositionDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const params = useParams()
  const posId = Number(params.id)
  const searchParams = useSearchParams()
  const player = searchParams.get('player') ?? undefined

  useEffect(() => {
    //----------------------------------------------------------------------------------------------
    //  load — fetches the position detail for the route id and player and stores it in state
    //----------------------------------------------------------------------------------------------
    async function load() {
      const d = await getPositionDetail_player(posId, player)
      setPositionDetail(d)
      setLoading(false)
    }
    load()
  }, [posId, player])

  if (loading) return <MyLoadingMessage message1="Loading position…" />

  const position = positionDetail?.position ?? null
  const moves = positionDetail?.moves ?? []
  const posEval = positionDetail?.posEval ?? null
  const gameCount = positionDetail?.gameCount ?? 0
  const games = positionDetail?.games ?? []

  return (
    <PositionDetail
      position={position}
      moves={moves}
      posEval={posEval}
      gameCount={gameCount}
      games={games}
    />
  )
}
