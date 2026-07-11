import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree } from '@/src/lib/analysis/buildPositionTree'
import { enrichPositionsStockfish } from '@/src/lib/analysis/enrichPositionsStockfish'

// Independent analysis cron — does not modify the existing /api/cron/sync route.
// Call this after the main sync cron completes: schedule it ~5 minutes later.
// Requires the same CRON_SECRET as the main sync cron (or set ANALYSIS_CRON_SECRET).

export async function GET(req: NextRequest) {
  const secret = process.env.ANALYSIS_CRON_SECRET ?? process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const summary: Record<string, any> = {}

  try {
    // Build position tree for new games (small batch — incremental)
    const treeResult = await buildPositionTree({ limit: 200 })
    summary.tree = treeResult
  } catch (err: any) {
    summary.tree = { error: err?.message }
  }

  try {
    // Evaluate positions — no date range, always reach-ordered (highest pos_reached first)
    const evalResult = await enrichPositionsStockfish({ limit: 200 })
    summary.evaluate = evalResult
  } catch (err: any) {
    summary.evaluate = { error: err?.message }
  }

  return NextResponse.json({ ok: true, summary })
}
