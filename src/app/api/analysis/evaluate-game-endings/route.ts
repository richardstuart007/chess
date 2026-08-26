//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/evaluate-game-endings — pipeline UI route wrapper for evaluateGameEndings.
//
//    Parameters (query string):
//      limit  — max games to process this run (default DEFAULT_BATCH_SIZE_Player)
//      depth  — Stockfish search depth (default STOCKFISH_DEPTH)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { evaluateGameEndings } from '@/src/lib/analysis/enrichPositionsStockfish'
import { DEFAULT_BATCH_SIZE_Player, STOCKFISH_DEPTH } from '@/src/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? String(DEFAULT_BATCH_SIZE_Player))
  const depth    = Number(searchParams.get('depth')  ?? String(STOCKFISH_DEPTH))
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await evaluateGameEndings({ limit, depth, forceNewRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('evaluate-game-endings route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
