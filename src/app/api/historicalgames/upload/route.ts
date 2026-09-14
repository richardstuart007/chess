//==================================================================================================
//  1) DESCRIPTION
//    POST /api/historicalgames/upload — pipeline UI route wrapper for uploadHistoricalPgn.
//
//    Body (JSON):
//      collection — display label for this batch (e.g. "World Chess Championship 1886-2018")
//      pgnText    — raw PGN text, one or more games, already concatenated client-side
//      level      — logging call-hierarchy depth (default 1)
//      newRun     — true to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { uploadHistoricalPgn } from '@/src/lib/master/importHistoricalGames'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const collection = (body.collection ?? '').trim()
  const pgnText = body.pgnText ?? ''
  const level = Number(body.level ?? 1)
  const forceNewRun = body.newRun !== false

  if (!collection || !pgnText) {
    return NextResponse.json({ ok: false, error: 'collection and pgnText are required' }, { status: 400 })
  }

  try {
    const result = await uploadHistoricalPgn(collection, pgnText, level, forceNewRun)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('historicalgames upload route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
