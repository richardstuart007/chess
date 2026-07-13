import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { buildPositionTree, syncTposFromTgam } from '@/src/lib/analysis/buildPositionTree'
import { enrichPositionsStockfish, bulkUpdateCpLoss } from '@/src/lib/analysis/enrichPositionsStockfish'
import { purgeStaleReachOnePositions } from '@/src/lib/analysis/purgePositions'
import { DEFAULT_BATCH_SIZE } from '@/src/lib/constants'

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
    // Phase A — build tgam_game_positions for new games (small batch — incremental), matches 2a
    const treeResult = await buildPositionTree({ limit: DEFAULT_BATCH_SIZE, skipSync: true })
    summary.tree = treeResult
  } catch (err: any) {
    summary.tree = { error: err?.message }
    await write_logging({
      lg_functionname: 'api/analysis/cron',
      lg_caller: 'analysisCronRoute',
      lg_msg: 'buildPositionTree failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
  }

  try {
    // Phase B — derive tpos_positions from what Phase A just wrote, matches 2b
    const syncResult = await syncTposFromTgam(1)
    summary.sync = syncResult
  } catch (err: any) {
    summary.sync = { error: err?.message }
    await write_logging({
      lg_functionname: 'api/analysis/cron',
      lg_caller: 'analysisCronRoute',
      lg_msg: 'syncTposFromTgam failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
  }

  try {
    // Purge stale low-reach positions before spending Stockfish time evaluating — explicit
    // destructive-automation exception, see .claude/CLAUDE.md
    const purgeResult = await purgeStaleReachOnePositions()
    summary.purge = purgeResult
  } catch (err: any) {
    summary.purge = { error: err?.message }
    await write_logging({
      lg_functionname: 'api/analysis/cron',
      lg_caller: 'analysisCronRoute',
      lg_msg: 'purgeStaleReachOnePositions failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
  }

  try {
    // Evaluate positions — no date range, always reach-ordered (highest pos_reached first)
    const evalResult = await enrichPositionsStockfish({ limit: DEFAULT_BATCH_SIZE })
    summary.evaluate = evalResult
  } catch (err: any) {
    summary.evaluate = { error: err?.message }
    await write_logging({
      lg_functionname: 'api/analysis/cron',
      lg_caller: 'analysisCronRoute',
      lg_msg: 'enrichPositionsStockfish failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
  }

  try {
    // Recompute gam_cp_change now that more before/after evaluations may exist — decoupled from Evaluate Positions
    const cpResult = await bulkUpdateCpLoss(1)
    summary.cpChange = { updated: cpResult }
  } catch (err: any) {
    summary.cpChange = { error: err?.message }
    await write_logging({
      lg_functionname: 'api/analysis/cron',
      lg_caller: 'analysisCronRoute',
      lg_msg: 'bulkUpdateCpLoss failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
  }

  return NextResponse.json({ ok: true, summary })
}
