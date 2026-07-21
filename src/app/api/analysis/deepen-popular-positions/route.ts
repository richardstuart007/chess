import { NextRequest, NextResponse } from 'next/server'
import { deepenPopularPositions } from '@/src/lib/analysis/enrichPositionsStockfish'
import { CRON_DEEPEN_POPULAR_BATCH_SIZE } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? String(CRON_DEEPEN_POPULAR_BATCH_SIZE))
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await deepenPopularPositions({ limit, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('deepen-popular-positions route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
