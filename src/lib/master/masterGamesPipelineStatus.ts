'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  refreshMasterSyncStatus — step 1's own status (Sync Master Games, bundling
//  download + deconstruct). Mirrors pipelineStatus.ts's refreshStep1: pending raw
//  rows not yet deconstructed, and the total deconstructed count.
//----------------------------------------------------------------------------------
export async function refreshMasterSyncStatus(): Promise<{ pending: number; allDecon: number }> {
  const result = await table_query({
    caller: 'refreshMasterSyncStatus', table: 'wk_mgr_gamesraw', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM wk_mgr_gamesraw r
       WHERE NOT EXISTS (SELECT 1 FROM tmgd_gamesdecon d WHERE d.mgd_chesscom_uuid = r.mgr_chesscom_uuid)) AS pending,
      (SELECT COUNT(*) FROM tmgd_gamesdecon) AS all_decon`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterSyncStatus',
      lg_caller: 'refreshMasterSyncStatus',
      lg_msg: 'Failed to fetch master sync status: ' + result.error,
      lg_severity: 'E'
    })
    return { pending: 0, allDecon: 0 }
  }
  const r = result.data[0] ?? {}
  return { pending: parseInt(r.pending ?? '0'), allDecon: parseInt(r.all_decon ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshMasterTreeStatus — step 2's own status (Build Master Position Tree).
//  Mirrors pipelineStatus.ts's refreshStep3: how many tmgd_gamesdecon rows are
//  already represented in tmgam_game_positions vs. still outstanding.
//----------------------------------------------------------------------------------
export async function refreshMasterTreeStatus(): Promise<{ allProcessed: number; allRemaining: number }> {
  const result = await table_query({
    caller: 'refreshMasterTreeStatus', table: 'tmgd_gamesdecon', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tmgd_gamesdecon)                                          AS all_eligible,
      (SELECT COUNT(*) FROM tmgd_gamesdecon d
       WHERE NOT EXISTS (SELECT 1 FROM tmgam_game_positions WHERE mgam_mgdid = d.mgd_mgdid)) AS all_remaining`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterTreeStatus',
      lg_caller: 'refreshMasterTreeStatus',
      lg_msg: 'Failed to fetch master tree status: ' + result.error,
      lg_severity: 'E'
    })
    return { allProcessed: 0, allRemaining: 0 }
  }
  const r = result.data[0] ?? {}
  const allEligible = parseInt(r.all_eligible ?? '0')
  const allRemaining = parseInt(r.all_remaining ?? '0')
  return { allProcessed: allEligible - allRemaining, allRemaining }
}

//----------------------------------------------------------------------------------
//  refreshMasterTposStatus — step 3's own status (Sync Master Position Tree).
//  Mirrors pipelineStatus.ts's refreshTposStatus: total tmpos_positions rows, and
//  how many tmgam_game_positions rows still have no mgam_pos_id link.
//----------------------------------------------------------------------------------
export async function refreshMasterTposStatus(): Promise<{ positions: number; unresolved: number }> {
  const result = await table_query({
    caller: 'refreshMasterTposStatus', table: 'tmpos_positions', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tmpos_positions)                                  AS positions,
      (SELECT COUNT(*) FROM tmgam_game_positions WHERE mgam_pos_id IS NULL)    AS unresolved`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterTposStatus',
      lg_caller: 'refreshMasterTposStatus',
      lg_msg: 'Failed to fetch master tpos status: ' + result.error,
      lg_severity: 'E'
    })
    return { positions: 0, unresolved: 0 }
  }
  const r = result.data[0] ?? {}
  return { positions: parseInt(r.positions ?? '0'), unresolved: parseInt(r.unresolved ?? '0') }
}
