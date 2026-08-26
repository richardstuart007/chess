//==================================================================================================
//  1) DESCRIPTION
//    GET /api/fide/populate-top-players — pipeline UI route wrapper for populateFideTopPlayers
//    (FIDE pipeline step 4).
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { populateFideTopPlayers } from '@/src/lib/fide/fidePipeline'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await populateFideTopPlayers(level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('populate-top-players route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
