//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/build-habits — pipeline UI route wrapper for buildHabits.
//
//    Parameters (query string):
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { buildHabits } from '@/src/lib/analysis/buildHabits'

export async function GET(req: NextRequest) {
  const forceNewRun = new URL(req.url).searchParams.get('newRun') === 'true'

  try {
    const { built } = await buildHabits(1, forceNewRun)
    const response = NextResponse.json({ ok: true, built })
    return response
  } catch (err: any) {
    console.error('build-habits route error', err)
    await write_logging({
      lg_functionname: 'api/analysis/build-habits',
      lg_caller: 'api/analysis/build-habits',
      lg_msg: 'build-habits route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
