//==================================================================================================
//  1) DESCRIPTION
//    GET /api/fide/parse — pipeline UI route wrapper for parseFideXml (FIDE pipeline step 3).
//
//    Parameters (query string):
//      level  — logging call-hierarchy depth (default 1)
//      newRun — 'true' to allocate a new pipeline run id instead of joining the current one
//==================================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { parseFideXml } from '@/src/lib/fide/fideStaging'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')
  const forceNewRun = searchParams.get('newRun') === 'true'

  try {
    const result = await parseFideXml(level, forceNewRun)
    const response = NextResponse.json({ ok: true, ...result })
    return response
  } catch (err: any) {
    console.error('parse route error', err)
    await write_logging({
      lg_functionname: 'api/fide/parse',
      lg_caller: 'api/fide/parse',
      lg_msg: 'parse route error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    const response = NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
    return response
  }
}
