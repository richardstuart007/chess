'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  refreshMasterSyncStatus — row count currently staged in tmgr_mastergamesraw
//  (step 1's own output).
//----------------------------------------------------------------------------------
export async function refreshMasterSyncStatus(): Promise<{ rows: number }> {
  const result = await table_query({
    caller: 'refreshMasterSyncStatus', table: 'tmgr_mastergamesraw', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS rows FROM tmgr_mastergamesraw`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterSyncStatus',
      lg_caller: 'refreshMasterSyncStatus',
      lg_msg: 'Failed to fetch master sync status: ' + result.error,
      lg_severity: 'E'
    })
    return { rows: 0 }
  }
  return { rows: parseInt(result.data[0]?.rows ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshMasterDeconStatus — row count currently staged in tmgd_mastergamesdecon
//  (step 2's own output).
//----------------------------------------------------------------------------------
export async function refreshMasterDeconStatus(): Promise<{ rows: number }> {
  const result = await table_query({
    caller: 'refreshMasterDeconStatus', table: 'tmgd_mastergamesdecon', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS rows FROM tmgd_mastergamesdecon`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterDeconStatus',
      lg_caller: 'refreshMasterDeconStatus',
      lg_msg: 'Failed to fetch master decon status: ' + result.error,
      lg_severity: 'E'
    })
    return { rows: 0 }
  }
  return { rows: parseInt(result.data[0]?.rows ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshMasterTreeStatus — position/game-position counts currently built in
//  tmps_masterpositions/tmgp_mastergamepositions (step 3's own output).
//----------------------------------------------------------------------------------
export async function refreshMasterTreeStatus(): Promise<{ positions: number; gamePositions: number }> {
  const result = await table_query({
    caller: 'refreshMasterTreeStatus', table: 'tmps_masterpositions', params: [], skipCache: true,
    query: `SELECT
      (SELECT COUNT(*) FROM tmps_masterpositions)     AS positions,
      (SELECT COUNT(*) FROM tmgp_mastergamepositions)  AS game_positions`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshMasterTreeStatus',
      lg_caller: 'refreshMasterTreeStatus',
      lg_msg: 'Failed to fetch master tree status: ' + result.error,
      lg_severity: 'E'
    })
    return { positions: 0, gamePositions: 0 }
  }
  const r = result.data[0] ?? {}
  return { positions: parseInt(r.positions ?? '0'), gamePositions: parseInt(r.game_positions ?? '0') }
}
