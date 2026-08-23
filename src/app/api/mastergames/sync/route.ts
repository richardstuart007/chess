import { NextRequest, NextResponse } from 'next/server'
import { syncMasterGames } from '@/src/lib/master/masterSync'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? ''
  const year = Number(searchParams.get('year') ?? '')
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  if (!player || !year) {
    return NextResponse.json({ ok: false, error: 'player and year query params are required' }, { status: 400 })
  }

  try {
    const result = await syncMasterGames(player, year, level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames sync route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
