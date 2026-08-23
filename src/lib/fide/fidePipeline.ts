'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_query } from 'nextjs-shared/table_query'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from '../actions/pipelineLog'
const MASTER_PLAYERS_TABLE = 'tmst_master_players'
const FIDE_PLAYERS_TABLE = 'tfpl_fide_players'

type FideCandidate = { fideid: number; firstName: string; lastName: string; rating: number }

//----------------------------------------------------------------------------------
//  findUnlinkedRowByName — case-insensitive surname match among tmst_master_players
//  rows with no mst_fideid yet, disambiguated by first name on a surname collision.
//  Returns null (treated as "no existing row, insert new") if still ambiguous.
//----------------------------------------------------------------------------------
async function findUnlinkedRowByName(lastName: string, firstName: string): Promise<number | null> {
  const bySurname = await table_fetch({
    caller: 'findUnlinkedRowByName',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: [
      { column: 'LOWER(mst_last_name)', value: lastName.toLowerCase(), operator: '=' },
      { column: 'mst_fideid', operator: 'IS NULL', value: null }
    ],
    columns: ['mst_mstid', 'mst_first_name']
  })
  if (bySurname.length === 1) return Number(bySurname[0].mst_mstid)
  if (bySurname.length > 1) {
    const byFirstNameToo = bySurname.filter((r: any) => ((r.mst_first_name as string) ?? '').toLowerCase() === firstName.toLowerCase())
    if (byFirstNameToo.length === 1) return Number(byFirstNameToo[0].mst_mstid)
  }
  return null
}

//----------------------------------------------------------------------------------
//  populateFideTopPlayers — pipeline stage 4 (step 13). Reads the already-parsed FIDE
//  snapshot (tfpl_fide_players, populated by parseFideXml) rather than re-downloading
//  or re-parsing anything — this stage is pure DB-to-DB, so re-running it after fixing
//  a bug is fast and never touches FIDE's server. No filtering needed here — parseFideXml
//  already only stores active players at/above FIDE_TOP_RATING_CUTOFF, so every row in
//  tfpl_fide_players is a candidate. Full recompute every run (no safe incremental
//  cursor — the top-rated set itself shifts month to month). For each qualifying FIDE
//  player: updates mst_grade only if a tmst_master_players row is already linked by
//  mst_fideid; else attaches mst_fideid to an existing unlinked row matched by surname;
//  else inserts a brand-new row. Names are only ever written on insert — never touched
//  on update, so a manual name correction in pgAdmin is permanent.
//----------------------------------------------------------------------------------
export async function populateFideTopPlayers(level: number = 1, forceNewRun?: boolean): Promise<{ processed: number; inserted: number; updated: number }> {
  await logStart('populateFideTopPlayers', 'fidePipelineRoute', 'matching FIDE top players into tmst_master_players', level)
  const t0 = Date.now()

  const candidateRows = await table_query({
    caller: 'populateFideTopPlayers_candidates',
    query: `SELECT fpl_fideid, fpl_first_name, fpl_last_name, fpl_rating FROM ${FIDE_PLAYERS_TABLE}`,
    params: [],
    table: FIDE_PLAYERS_TABLE,
    level, isupdate: false, severity: 'I', skipCache: true
  })
  if (candidateRows.length === 0) throw new Error(`${FIDE_PLAYERS_TABLE} has no rows — run Parse FIDE XML first`)

  const candidates: FideCandidate[] = candidateRows.map((r: any) => ({
    fideid: Number(r.fpl_fideid),
    firstName: (r.fpl_first_name as string) ?? '',
    lastName: r.fpl_last_name as string,
    rating: Number(r.fpl_rating)
  }))

  let inserted = 0
  let updated = 0

  for (const c of candidates) {
    try {
      const linked = await table_fetch({
        caller: 'populateFideTopPlayers',
        table: MASTER_PLAYERS_TABLE,
        whereColumnValuePairs: [{ column: 'mst_fideid', value: c.fideid }],
        columns: ['mst_mstid']
      })

      if (linked.length > 0) {
        await table_update({
          caller: 'populateFideTopPlayers',
          table: MASTER_PLAYERS_TABLE,
          columnValuePairs: [{ column: 'mst_grade', value: c.rating }],
          whereColumnValuePairs: [{ column: 'mst_mstid', value: linked[0].mst_mstid }]
        })
        updated++
        continue
      }

      const matchedMstid = await findUnlinkedRowByName(c.lastName, c.firstName)
      if (matchedMstid != null) {
        await table_update({
          caller: 'populateFideTopPlayers',
          table: MASTER_PLAYERS_TABLE,
          columnValuePairs: [
            { column: 'mst_fideid', value: c.fideid },
            { column: 'mst_grade', value: c.rating }
          ],
          whereColumnValuePairs: [{ column: 'mst_mstid', value: matchedMstid }]
        })
        updated++
        continue
      }

      await table_write({
        caller: 'populateFideTopPlayers',
        table: MASTER_PLAYERS_TABLE,
        columnValuePairs: [
          { column: 'mst_first_name', value: c.firstName },
          { column: 'mst_last_name', value: c.lastName },
          { column: 'mst_fideid', value: c.fideid },
          { column: 'mst_grade', value: c.rating },
          { column: 'mst_priority', value: false }
        ]
      })
      inserted++
    } catch (err) {
      await write_logging({
        lg_functionname: 'populateFideTopPlayers',
        lg_caller: 'fidePipelineRoute',
        lg_msg: `FIDE top player not saved (fideid ${c.fideid}): ` + (err as Error).message,
        lg_severity: 'E'
      })
    }
  }

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 13, subStep: 'a', stepName: 'Populate FIDE Top Players',
    inputTable: FIDE_PLAYERS_TABLE, inputRecs: candidates.length,
    outputTable: MASTER_PLAYERS_TABLE, outputRecs: inserted + updated,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'populateFideTopPlayers', lg_caller: 'fidePipelineRoute',
    lg_msg: `FIDE top players: ${inserted} inserted, ${updated} updated`, lg_severity: 'I'
  })
  await logEnd('populateFideTopPlayers', 'fidePipelineRoute', `${inserted} inserted, ${updated} updated`, level)
  return { processed: candidates.length, inserted, updated }
}

//----------------------------------------------------------------------------------
//  refreshFideRatings — pipeline stage 5 (step 14). Reads the already-parsed FIDE
//  snapshot (tfpl_fide_players) rather than re-downloading/re-parsing. For every
//  tmst_master_players row already linked to a FIDE id, looks up its current rating
//  by fideid (not name) and updates mst_grade only; names are never touched.
//----------------------------------------------------------------------------------
export async function refreshFideRatings(level: number = 1, forceNewRun?: boolean): Promise<{ updated: number }> {
  await logStart('refreshFideRatings', 'fidePipelineRoute', 'refreshing known FIDE ratings', level)
  const t0 = Date.now()

  const linkedRows = await table_fetch({
    caller: 'refreshFideRatings',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'mst_fideid', operator: 'IS NOT NULL', value: null }],
    columns: ['mst_mstid', 'mst_fideid']
  })

  const fideids = linkedRows.map((r: any) => Number(r.mst_fideid))
  const placeholders = fideids.map((_, i) => `$${i + 1}`).join(',')
  const ratingRows = fideids.length === 0 ? [] : await table_query({
    caller: 'refreshFideRatings_ratings',
    query: `SELECT fpl_fideid, fpl_rating FROM ${FIDE_PLAYERS_TABLE} WHERE fpl_fideid IN (${placeholders})`,
    params: fideids,
    table: FIDE_PLAYERS_TABLE,
    level, isupdate: false, severity: 'I', skipCache: true
  })
  const ratingByFideid = new Map<number, number>(ratingRows.map((r: any) => [Number(r.fpl_fideid), Number(r.fpl_rating)]))

  let updated = 0
  for (const row of linkedRows) {
    const fideid = Number(row.mst_fideid)
    const rating = ratingByFideid.get(fideid)
    if (rating == null) continue
    try {
      await table_update({
        caller: 'refreshFideRatings',
        table: MASTER_PLAYERS_TABLE,
        columnValuePairs: [{ column: 'mst_grade', value: rating }],
        whereColumnValuePairs: [{ column: 'mst_mstid', value: Number(row.mst_mstid) }]
      })
      updated++
    } catch (err) {
      await write_logging({
        lg_functionname: 'refreshFideRatings',
        lg_caller: 'fidePipelineRoute',
        lg_msg: `FIDE rating refresh failed (fideid ${fideid}): ` + (err as Error).message,
        lg_severity: 'E'
      })
    }
  }

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 14, subStep: 'a', stepName: 'Refresh FIDE Ratings',
    inputTable: FIDE_PLAYERS_TABLE, inputRecs: linkedRows.length,
    outputTable: MASTER_PLAYERS_TABLE, outputRecs: updated,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'refreshFideRatings', lg_caller: 'fidePipelineRoute',
    lg_msg: `Refreshed ${updated} FIDE ratings`, lg_severity: 'I'
  })
  await logEnd('refreshFideRatings', 'fidePipelineRoute', `${updated} ratings refreshed`, level)
  return { updated }
}
