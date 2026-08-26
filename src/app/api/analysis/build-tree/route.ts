//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/build-tree — pipeline UI route wrapper for buildPositionTree_Player.
//
//    Parameters (query string):
//      limit    — max games to process this run (default POSITION_TREE_LIMIT_Player)
//      player   — restrict to one player (default: all players)
//      skipSync — 'true' to skip Phase B (debug/verification only)
//      newRun   — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree_Player } from '@/src/lib/analysis/buildPositionTree_Player'
import { POSITION_TREE_LIMIT_Player } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')   ?? String(POSITION_TREE_LIMIT_Player))
  const player   = searchParams.get('player')   ?? undefined
  const skipSync = searchParams.get('skipSync') === 'true'
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await buildPositionTree_Player({ limit, player, skipSync, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('build-tree route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
