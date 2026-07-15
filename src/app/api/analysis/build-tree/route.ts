import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree } from '@/src/lib/analysis/buildPositionTree'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')   ?? '100')
  const player   = searchParams.get('player')   ?? undefined
  const skipSync = searchParams.get('skipSync') === 'true'
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await buildPositionTree({ limit, playerUsername: player, skipSync, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('build-tree route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
