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
import { syncMasterGames } from '@/src/lib/master/masterSync'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? ''
  const year = Number(searchParams.get('year') ?? '')
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'
  const truncateFirst = searchParams.get('truncateFirst') === 'true'

  if (!player || !year) {
    return NextResponse.json({ ok: false, error: 'player and year query params are required' }, { status: 400 })
  }

  try {
    const result = await syncMasterGames(player, year, level, forceNewRun, truncateFirst)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('mastergames sync route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
