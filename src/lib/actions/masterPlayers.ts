'use server'

import * as cheerio from 'cheerio'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { ColumnValuePair } from 'nextjs-shared/structures'
import { table_update } from 'nextjs-shared/table_update'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

const MASTER_PLAYERS_TABLE = 'tmst_master_players'
const MASTER_DECON_TABLE = 'tmgd_gamesdecon'

export type MasterPlayerRow = {
  mstid:           number
  firstName:       string
  lastName:        string
  fideid:          number | null
  grade:           number | null
  priority:        boolean
  chesscomHandle:  string | null
}

//----------------------------------------------------------------------------------
//  combineName — reconstructs the "First Last" display/search string chess.com's own
//  search expects, from the two stored columns.
//----------------------------------------------------------------------------------
function combineName(firstName: string | null, lastName: string): string {
  return firstName ? `${firstName} ${lastName}` : lastName
}

//----------------------------------------------------------------------------------
//  getMasterPlayerNames — every known master player name, for the Player 1/2 select
//  on the Analyze page's Chess.com Games panel. Populated entirely by the FIDE
//  pipeline (see /owner/pipelinemasters) — this table no longer grows from live game
//  search sightings.
//----------------------------------------------------------------------------------
export async function getMasterPlayerNames(): Promise<string[]> {
  const result = await table_fetch({
    caller: 'getMasterPlayerNames',
    table: MASTER_PLAYERS_TABLE,
    orderBy: 'mst_last_name, mst_first_name',
    columns: ['mst_first_name', 'mst_last_name'],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterPlayerNames',
      lg_caller: 'getMasterPlayerNames',
      lg_msg: 'Failed to fetch master player names: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data.map((r: any) => combineName(r.mst_first_name, r.mst_last_name))
}

//----------------------------------------------------------------------------------
//  getMasterHandleNameMap — chess.com handle (lowercased) → display name, for every
//  master player that has a handle. Used to attach a real name onto master-games rows
//  (tmgd_gamesdecon, secondary database) in app code, since that table only
//  stores the handle and the two tables can never be SQL-joined across databases.
//----------------------------------------------------------------------------------
export async function getMasterHandleNameMap(): Promise<Record<string, string>> {
  const players = await getMasterPlayers('')
  const map: Record<string, string> = {}
  for (const p of players) {
    if (p.chesscomHandle) {
      map[p.chesscomHandle.toLowerCase()] = combineName(p.firstName, p.lastName)
    }
  }
  return map
}

//----------------------------------------------------------------------------------
//  getMasterPlayers — tmst_master_players rows for the /owner/masterplayers admin
//  page's priority-flagging list, optionally narrowed by a name filter (substring,
//  case-insensitive), by missing-Chess.com-handle only, and sorted by grade descending
//  instead of the default alphabetical-by-name order.
//----------------------------------------------------------------------------------
export async function getMasterPlayers(filterName: string = '', sortByGradeDesc: boolean = false, onlyMissingHandle: boolean = false): Promise<MasterPlayerRow[]> {
  const whereColumnValuePairs: ColumnValuePair[] = []
  if (filterName) {
    whereColumnValuePairs.push({ column: "LOWER(COALESCE(mst_first_name, '') || ' ' || mst_last_name)", value: `%${filterName.toLowerCase()}%`, operator: 'LIKE' })
  }
  if (onlyMissingHandle) {
    whereColumnValuePairs.push({ column: 'mst_chesscom_handle', operator: 'IS NULL', value: null })
  }

  const result = await table_fetch({
    caller: 'getMasterPlayers',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: whereColumnValuePairs.length > 0 ? whereColumnValuePairs : undefined,
    orderBy: sortByGradeDesc ? 'mst_grade DESC NULLS LAST' : 'mst_last_name, mst_first_name',
    columns: ['mst_mstid', 'mst_first_name', 'mst_last_name', 'mst_fideid', 'mst_grade', 'mst_priority', 'mst_chesscom_handle'],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterPlayers',
      lg_caller: 'getMasterPlayers',
      lg_msg: 'Failed to fetch master players: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }
  return result.data.map((r: any) => ({
    mstid: Number(r.mst_mstid),
    firstName: (r.mst_first_name as string) ?? '',
    lastName: r.mst_last_name as string,
    fideid: r.mst_fideid != null ? Number(r.mst_fideid) : null,
    grade: r.mst_grade != null ? Number(r.mst_grade) : null,
    priority: r.mst_priority as boolean,
    chesscomHandle: (r.mst_chesscom_handle as string) ?? null
  }))
}

//----------------------------------------------------------------------------------
//  findNextMasterPlayerHandle — one player per call (user decision: a long sequential
//  batch across all 156 triggered intermittent failures on well-known players,
//  reproducible only at that scale, not on any individual request — most likely
//  chess.com's own anti-bot throttling. One-at-a-time, user-paced by clicking the
//  button, sidesteps that entirely). Picks the highest-grade FIDE-linked row still
//  missing a mst_chesscom_handle, fetches chess.com's own /players/{first-last-slug}
//  page, and extracts the handle from the element whose data-presence-fide-id matches
//  this row's mst_fideid (chess.com embeds both attributes on the same element —
//  matching on the FIDE id we already know to be correct is far more reliable than
//  trusting the first username-looking string on the page, since a page can mention
//  other players too). Scoped to mst_priority = true — skips any FIDE-linked row not
//  flagged as priority. Returns null once no eligible row remains.
//----------------------------------------------------------------------------------
export async function findNextMasterPlayerHandle(): Promise<{ mstid: number; name: string; handle: string | null } | null> {
  const result = await table_fetch({
    caller: 'findNextMasterPlayerHandle',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: [
      { column: 'mst_fideid', operator: 'IS NOT NULL', value: null },
      { column: 'mst_chesscom_handle', operator: 'IS NULL', value: null },
      { column: 'mst_priority', value: true }
    ],
    orderBy: 'mst_grade DESC NULLS LAST',
    columns: ['mst_mstid', 'mst_first_name', 'mst_last_name', 'mst_fideid'],
    limit: 1,
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'findNextMasterPlayerHandle',
      lg_caller: 'findNextMasterPlayerHandle',
      lg_msg: 'Failed to fetch next master player: ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  if (result.data.length === 0) return null

  const row = result.data[0]
  const firstName = (row.mst_first_name as string) ?? ''
  const lastName = row.mst_last_name as string
  const fideid = Number(row.mst_fideid)
  const mstid = Number(row.mst_mstid)
  const name = firstName ? `${firstName} ${lastName}` : lastName
  const slug = `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, '-')

  let handle: string | null = null
  try {
    const res = await fetch(`https://www.chess.com/players/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    if (res.ok) {
      const html = await res.text()
      const $ = cheerio.load(html)
      handle = $(`[data-presence-fide-id="${fideid}"]`).attr('data-username') ?? null
    }
  } catch (err) {
    write_logging({
      lg_functionname: 'findNextMasterPlayerHandle',
      lg_caller: 'findNextMasterPlayerHandle',
      lg_msg: `Handle lookup failed for ${name} (fideid ${fideid}): ` + (err as Error).message,
      lg_severity: 'W'
    })
  }

  if (handle) {
    await table_update({
      caller: 'findNextMasterPlayerHandle',
      table: MASTER_PLAYERS_TABLE,
      columnValuePairs: [{ column: 'mst_chesscom_handle', value: handle }],
      whereColumnValuePairs: [{ column: 'mst_mstid', value: mstid }]
    })
  }

  return { mstid, name, handle }
}

//----------------------------------------------------------------------------------
//  setMasterPlayerPriority — flags/unflags one player as priority. Scopes
//  findNextMasterPlayerHandle to priority-flagged rows only.
//----------------------------------------------------------------------------------
export async function setMasterPlayerPriority(mstid: number, priority: boolean): Promise<void> {
  await table_update({
    caller: 'setMasterPlayerPriority',
    table: MASTER_PLAYERS_TABLE,
    columnValuePairs: [{ column: 'mst_priority', value: priority }],
    whereColumnValuePairs: [{ column: 'mst_mstid', value: mstid }]
  })
}

//----------------------------------------------------------------------------------
//  getMasterSyncYearStatus — chess.com handles (lowercased) that already have 1+ rows
//  in tmgd_gamesdecon with an end_time falling within the given calendar year.
//  "Already downloaded" means any games at all for that year, not a comparison
//  against chess.com's own archive counts. Used by MasterPlayerMultiSelect to mark
//  which players still need syncing for the selected year.
//
//  Deliberately reads tmgd_gamesdecon (permanent), not wk_mgr_gamesraw (the transient
//  raw workfile, truncated before every sync run) — the workfile only ever reflects the
//  most recently run player(s), not true sync history.
//----------------------------------------------------------------------------------
export async function getMasterSyncYearStatus(year: number): Promise<Set<string>> {
  const yearStart = Math.floor(Date.UTC(year, 0, 1) / 1000)
  const yearEnd = Math.floor(Date.UTC(year + 1, 0, 1) / 1000)

  const result = await table_query({
    caller: 'getMasterSyncYearStatus',
    table: MASTER_DECON_TABLE,
    params: [yearStart, yearEnd],
    skipCache: true,
    query: `SELECT DISTINCT mgd_player FROM ${MASTER_DECON_TABLE} WHERE mgd_end_time >= $1 AND mgd_end_time < $2`
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterSyncYearStatus',
      lg_caller: 'getMasterSyncYearStatus',
      lg_msg: `Failed to fetch master sync status for ${year}: ` + result.error,
      lg_severity: 'E'
    })
    return new Set()
  }
  return new Set(result.data.map((r: any) => r.mgd_player as string))
}
