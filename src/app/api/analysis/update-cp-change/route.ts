import { NextRequest, NextResponse } from 'next/server'
import { bulkUpdateCpLoss } from '@/src/lib/analysis/enrichPositionsStockfish'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const updated = await bulkUpdateCpLoss(level, forceNewRun)
    return NextResponse.json({ ok: true, updated })
  } catch (err: any) {
    console.error('update-cp-change route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
