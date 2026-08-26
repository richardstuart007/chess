//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/purge — pipeline UI route wrapper for purgeStaleReachOnePositions.
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { purgeStaleReachOnePositions } from '@/src/lib/analysis/purgePositions'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await purgeStaleReachOnePositions(level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('purge route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
