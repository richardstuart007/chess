//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/build-habits — pipeline UI route wrapper for buildHabits.
//
//    Parameters (query string):
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { buildHabits } from '@/src/lib/analysis/buildHabits'

export async function GET(req: NextRequest) {
  const forceNewRun = new URL(req.url).searchParams.get('newRun') === 'true'

  try {
    const { built } = await buildHabits(1, forceNewRun)
    return NextResponse.json({ ok: true, built })
  } catch (err: any) {
    console.error('build-habits route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
