//==================================================================================================
//  1) DESCRIPTION
//    GET /api/analysis/deconstruct — deconstruct-only route: reads wk_gr_gamesraw, writes
//    tgd_gamesdecon. Does NOT sync from chess.com — safe to run any time. Loops in batches
//    (batchSize, default 500) per player until a batch processes nothing, unless onebatch=1.
//
//    Parameters (query string):
//      player   — one player handle (default: every tracked player)
//      limit    — batch size per deconstructGames_Player call (default 500)
//      onebatch — '1' to run only a single batch per player instead of looping to completion
//
//    Examples:
//      GET /api/analysis/deconstruct                  → all players, all games
//      GET /api/analysis/deconstruct?player=stricade  → one player
//      GET /api/analysis/deconstruct?player=stricade&limit=500
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { deconstructGames_Player } from '@/src/lib/actions/deconstructGames_Player'
import { getPlayers } from '@/src/lib/actions/players'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerParam = searchParams.get('player')
  const limit = Number(searchParams.get('limit') ?? '0')
  const oneBatch = searchParams.get('onebatch') === '1'

  try {
    const players = playerParam
      ? [{ player: playerParam }]
      : await getPlayers()

    const results: { player: string; processed: number; skipped: number; errors: number }[] = []

    for (const p of players) {
      const batchSize = limit > 0 ? limit : 500
      const acc = { processed: 0, skipped: 0, errors: 0 }

      while (true) {
        const res = await deconstructGames_Player(p.player, batchSize)
        acc.processed += res.processed
        acc.skipped   += res.skipped
        acc.errors    += res.errors

        if (oneBatch) break
        if (res.processed === 0 && res.errors === 0 && res.skipped === 0) break
        if (res.processed === 0 && res.errors > 0) break
      }

      results.push({ player: p.player, ...acc })
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
