import { NextRequest, NextResponse } from 'next/server'
import { buildMasterPositionTree } from '@/src/lib/master/masterPositionTree'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? ''
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  if (!player) {
    return NextResponse.json({ ok: false, error: 'player query param is required' }, { status: 400 })
  }

  try {
    const result = await buildMasterPositionTree(player, level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames build-tree route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
