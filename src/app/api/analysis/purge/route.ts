import { NextRequest, NextResponse } from 'next/server'
import { purgeStaleReachOnePositions } from '@/src/lib/analysis/purgePositions'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = Number(searchParams.get('level') ?? '1')

  try {
    const result = await purgeStaleReachOnePositions(level)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('purge route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
