//==================================================================================================
//  1) DESCRIPTION
//    GET /api/mastergames/sync-tpos — pipeline UI route wrapper for syncTposFromTgam_Master.
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//      player — display-only tag for the logged step name — no filtering effect
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { syncTposFromTgam_Master } from '@/src/lib/master/buildPositionTree_Master'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'
  const playerLabel = searchParams.get('player') ?? undefined

  try {
    const result = await syncTposFromTgam_Master(level, forceNewRun, playerLabel)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames sync-tpos route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
