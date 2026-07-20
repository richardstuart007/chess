import { NextRequest, NextResponse } from 'next/server'
import { deepenPopularPositions } from '@/src/lib/analysis/enrichPositionsStockfish'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? '50')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await deepenPopularPositions({ limit, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('deepen-popular-positions route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
