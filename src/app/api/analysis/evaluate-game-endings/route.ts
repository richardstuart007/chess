import { NextRequest, NextResponse } from 'next/server'
import { evaluateGameEndings } from '@/src/lib/analysis/enrichPositionsStockfish'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? '50')
  const depth    = Number(searchParams.get('depth')  ?? '16')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await evaluateGameEndings({ limit, depth, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('evaluate-game-endings route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
