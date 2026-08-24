'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  refreshFideZipStatus — size of the zip currently staged in wk_fzp_fide_zip (stage
//  1's own output), for its status row on /owner/pipelinemasters.
//----------------------------------------------------------------------------------
export async function refreshFideZipStatus(): Promise<{ bytes: number }> {
  const result = await table_query({
    caller: 'refreshFideZipStatus', table: 'wk_fzp_fide_zip', params: [], skipCache: true,
    query: `SELECT COALESCE(octet_length(fzp_data), 0) AS bytes FROM wk_fzp_fide_zip LIMIT 1`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshFideZipStatus',
      lg_caller: 'refreshFideZipStatus',
      lg_msg: 'Failed to fetch FIDE zip status: ' + result.error,
      lg_severity: 'E'
    })
    return { bytes: 0 }
  }
  return { bytes: parseInt(result.data[0]?.bytes ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideXmlStatus — chunk count / total characters currently staged in
//  wk_fxm_fide_xml (stage 2's own output).
//----------------------------------------------------------------------------------
export async function refreshFideXmlStatus(): Promise<{ chunks: number; chars: number }> {
  const result = await table_query({
    caller: 'refreshFideXmlStatus', table: 'wk_fxm_fide_xml', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS chunks, COALESCE(SUM(LENGTH(fxm_data)), 0) AS chars FROM wk_fxm_fide_xml`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshFideXmlStatus',
      lg_caller: 'refreshFideXmlStatus',
      lg_msg: 'Failed to fetch FIDE xml status: ' + result.error,
      lg_severity: 'E'
    })
    return { chunks: 0, chars: 0 }
  }
  const r = result.data[0] ?? {}
  return { chunks: parseInt(r.chunks ?? '0'), chars: parseInt(r.chars ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideParsedStatus — row count currently staged in tfpl_fide_players (stage
//  3's own output — the full unfiltered FIDE snapshot).
//----------------------------------------------------------------------------------
export async function refreshFideParsedStatus(): Promise<{ players: number }> {
  const result = await table_query({
    caller: 'refreshFideParsedStatus', table: 'tfpl_fide_players', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS players FROM tfpl_fide_players`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshFideParsedStatus',
      lg_caller: 'refreshFideParsedStatus',
      lg_msg: 'Failed to fetch FIDE parsed status: ' + result.error,
      lg_severity: 'E'
    })
    return { players: 0 }
  }
  return { players: parseInt(result.data[0]?.players ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideTaggedCount — count of tmst_master_players rows currently linked to a
//  FIDE id. Shared status display for stages 4/5 (Populate FIDE Top Players / Refresh
//  FIDE Ratings) — both are full recomputes with no true "remaining backlog" concept
//  the way a queue-based step has, so this just reports the current linked count.
//----------------------------------------------------------------------------------
export async function refreshFideTaggedCount(): Promise<{ tagged: number }> {
  const result = await table_query({
    caller: 'refreshFideTaggedCount', table: 'tmst_master_players', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS tagged FROM tmst_master_players WHERE mst_fideid IS NOT NULL`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'refreshFideTaggedCount',
      lg_caller: 'refreshFideTaggedCount',
      lg_msg: 'Failed to fetch FIDE tagged count: ' + result.error,
      lg_severity: 'E'
    })
    return { tagged: 0 }
  }
  return { tagged: parseInt(result.data[0]?.tagged ?? '0') }
}
