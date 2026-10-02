//==================================================================================================
//  1) DESCRIPTION
//    GET /api/mastergames/sync — pipeline UI route wrapper for syncMasterGames.
//
//    Parameters (query string):
//      player        — chess.com handle to sync (required)
//      year          — calendar year to sync (required)
//      level         — logging call-hierarchy depth (default 1)
//      newRun        — 'true' to allocate a new pipeline run id instead of joining the current one
//      truncateFirst — 'true' to truncate wk_mgr_gamesraw before downloading (set only for the
//                      first player in a multi-player batch)
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { syncMasterGames } from '@/src/lib/master/masterSync'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? ''
  const year = Number(searchParams.get('year') ?? '')
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'
  const truncateFirst = searchParams.get('truncateFirst') === 'true'

  if (!player || !year) {
    const response = NextResponse.json({ ok: false, error: 'player and year query params are required' }, { status: 400 })
    return response
  }

  try {
    const result = await syncMasterGames(player, year, level, forceNewRun, truncateFirst)
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('mastergames sync route error', err)
    await write_logging({
      lg_functionname: 'api/mastergames/sync',
      lg_caller: 'api/mastergames/sync',
      lg_msg: 'mastergames sync route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
