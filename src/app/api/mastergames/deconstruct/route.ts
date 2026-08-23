import { NextRequest, NextResponse } from 'next/server'
import { deconstructMasterGames } from '@/src/lib/master/masterDeconstruct'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? ''
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  if (!player) {
    return NextResponse.json({ ok: false, error: 'player query param is required' }, { status: 400 })
  }

  try {
    const result = await deconstructMasterGames(player, level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames deconstruct route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
