//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/deepen-popular-positions — pipeline UI route wrapper for
//    deepenPopularPositions.
//
//    Parameters (query string):
//      limit  — max positions to process this run (default CRON_DEEPEN_POPULAR_BATCH_SIZE_Player)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { deepenPopularPositions } from '@/src/lib/analysis/enrichPositionsStockfish'
import { CRON_DEEPEN_POPULAR_BATCH_SIZE_Player } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? String(CRON_DEEPEN_POPULAR_BATCH_SIZE_Player))
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await deepenPopularPositions({ limit, forceNewRun })
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('deepen-popular-positions route error', err)
    await write_logging({
      lg_functionname: 'api/analysis/deepen-popular-positions',
      lg_caller: 'api/analysis/deepen-popular-positions',
      lg_msg: 'deepen-popular-positions route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
