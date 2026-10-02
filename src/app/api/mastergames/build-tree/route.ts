//==================================================================================================
//  1) DESCRIPTION
//    GET /api/mastergames/build-tree — pipeline UI route wrapper for buildPositionTree_Master.
//
//    Parameters (query string):
//      limit    — max games to process this run (default POSITION_TREE_LIMIT_Master)
//      level    — logging call-hierarchy depth (default 1)
//      skipSync — 'true' to skip Phase B (debug/verification only)
//      newRun   — 'true' to allocate a new pipeline run id instead of joining the current one
//      player   — display-only tag for the logged step name — no filtering effect
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { buildPositionTree_Master } from '@/src/lib/master/buildPositionTree_Master'
import { POSITION_TREE_LIMIT_Master } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')   ?? String(POSITION_TREE_LIMIT_Master))
  const level    = Number(searchParams.get('level') ?? '1')
  const skipSync = searchParams.get('skipSync') === 'true'
  const forceNewRun = searchParams.get('newRun') === 'true'
  const playerLabel = searchParams.get('player') ?? undefined

  try {
    const result = await buildPositionTree_Master({ limit, level, skipSync, forceNewRun, playerLabel })
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('mastergames build-tree route error', err)
    await write_logging({
      lg_functionname: 'api/mastergames/build-tree',
      lg_caller: 'api/mastergames/build-tree',
      lg_msg: 'mastergames build-tree route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
