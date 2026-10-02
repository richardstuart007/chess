//==================================================================================================
//  1) DESCRIPTION
//    GET /api/fide/refresh-ratings — pipeline UI route wrapper for refreshFideRatings (FIDE
//    pipeline step 5).
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { refreshFideRatings } from '@/src/lib/fide/fidePipeline'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await refreshFideRatings(level, forceNewRun)
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('refresh-ratings route error', err)
    await write_logging({
      lg_functionname: 'api/fide/refresh-ratings',
      lg_caller: 'api/fide/refresh-ratings',
      lg_msg: 'refresh-ratings route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
