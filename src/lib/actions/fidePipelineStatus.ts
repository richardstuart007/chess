'use server'

import { table_query } from 'nextjs-shared/table_query'

//----------------------------------------------------------------------------------
//  refreshFideZipStatus — size of the zip currently staged in tfzp_fide_zip (stage
//  1's own output), for its status row on /owner/pipelinemasters.
//----------------------------------------------------------------------------------
export async function refreshFideZipStatus(): Promise<{ bytes: number }> {
  const rows = await table_query({
    caller: 'refreshFideZipStatus', params: [], skipCache: true,
    query: `SELECT COALESCE(octet_length(fzp_data), 0) AS bytes FROM tfzp_fide_zip LIMIT 1`
  })
  return { bytes: parseInt(rows[0]?.bytes ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideXmlStatus — chunk count / total characters currently staged in
//  tfxm_fide_xml (stage 2's own output).
//----------------------------------------------------------------------------------
export async function refreshFideXmlStatus(): Promise<{ chunks: number; chars: number }> {
  const rows = await table_query({
    caller: 'refreshFideXmlStatus', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS chunks, COALESCE(SUM(LENGTH(fxm_data)), 0) AS chars FROM tfxm_fide_xml`
  })
  const r = rows[0] ?? {}
  return { chunks: parseInt(r.chunks ?? '0'), chars: parseInt(r.chars ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideParsedStatus — row count currently staged in tfpl_fide_players (stage
//  3's own output — the full unfiltered FIDE snapshot).
//----------------------------------------------------------------------------------
export async function refreshFideParsedStatus(): Promise<{ players: number }> {
  const rows = await table_query({
    caller: 'refreshFideParsedStatus', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS players FROM tfpl_fide_players`
  })
  return { players: parseInt(rows[0]?.players ?? '0') }
}

//----------------------------------------------------------------------------------
//  refreshFideTaggedCount — count of tmst_master_players rows currently linked to a
//  FIDE id. Shared status display for stages 4/5 (Populate FIDE Top Players / Refresh
//  FIDE Ratings) — both are full recomputes with no true "remaining backlog" concept
//  the way a queue-based step has, so this just reports the current linked count.
//----------------------------------------------------------------------------------
export async function refreshFideTaggedCount(): Promise<{ tagged: number }> {
  const rows = await table_query({
    caller: 'refreshFideTaggedCount', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS tagged FROM tmst_master_players WHERE mst_fideid IS NOT NULL`
  })
  return { tagged: parseInt(rows[0]?.tagged ?? '0') }
}
