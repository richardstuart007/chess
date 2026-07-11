'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import PositionDetail from '@/src/ui/analysis/PositionDetail'
import { getPositionDetail } from '@/src/lib/analysis/chessdb'

function PositionDetailContent() {
  const params = useParams()
  const posId = Number(params.id)

  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPositionDetail(posId).then(d => {
      setData(d)
      setLoading(false)
    })
  }, [posId])

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

export default function PositionPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <PositionDetailContent />
    </Suspense>
  )
}
