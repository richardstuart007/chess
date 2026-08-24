import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree_Master } from '@/src/lib/master/buildPositionTree_Master'
import { POSITION_TREE_LIMIT_Master } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')   ?? String(POSITION_TREE_LIMIT_Master))
  const level    = Number(searchParams.get('level') ?? '1')
  const skipSync = searchParams.get('skipSync') === 'true'
  const forceNewRun = searchParams.get('newRun') === 'true'
  const playerLabel = searchParams.get('player') ?? undefined

  try {
    const result = await buildPositionTree_Master({ limit, level, skipSync, forceNewRun, playerLabel })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames build-tree route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
