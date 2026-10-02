//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/sync-tpos — pipeline UI route wrapper for syncTposFromTgam_Player (Phase B
//    catch-up pass, standalone re-runnable if Phase B ever fails to complete for some batch).
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { syncTposFromTgam_Player } from '@/src/lib/analysis/buildPositionTree_Player'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await syncTposFromTgam_Player(level, forceNewRun)
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('sync-tpos route error', err)
    await write_logging({
      lg_functionname: 'api/analysis/sync-tpos',
      lg_caller: 'api/analysis/sync-tpos',
      lg_msg: 'sync-tpos route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
