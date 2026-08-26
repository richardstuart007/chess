'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PositionPage — /position/[id]. Loads one position's detail (evaluation, per-move breakdown,
//    occurrence games) via getPositionDetail and renders PositionDetail, behind a Suspense
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
import { getPositionDetail } from '@/src/lib/analysis/chessdb'

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
  const params = useParams()
  const posId = Number(params.id)
  const searchParams = useSearchParams()
  const player = searchParams.get('player') ?? undefined

  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPositionDetail(posId, player).then(d => {
      setData(d)
      setLoading(false)
    })
  }, [posId, player])

  if (loading) return <MyLoadingMessage message1="Loading position…" />

  return (
    <PositionDetail
      position={data?.position ?? null}
      moves={data?.moves ?? []}
      posEval={data?.posEval ?? null}
      gameCount={data?.gameCount ?? 0}
      games={data?.games ?? []}
    />
  )
}
