'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_update } from 'nextjs-shared/table_update'
import { write_logging } from 'nextjs-shared/write_logging'
import { MASTER_MIN_GRADE_TO_ADD } from '../constants'

const MASTER_PLAYERS_TABLE = 'tmst_master_players'

export type MasterPlayerSighting = {
  name: string
  grade: number | null
}

export type MasterPlayerRow = {
  mstid:    number
  name:     string
  grade:    number | null
  priority: boolean
}

//----------------------------------------------------------------------------------
//  getMasterPlayerNames — every player name seen so far in Chess.com Games panel
//  search results, for the Player 1/2 select. Grows incrementally (via
//  upsertMasterPlayerNames) — there is no bulk source, chess.com exposes no export
//  or API for its master-games database.
//----------------------------------------------------------------------------------
export async function getMasterPlayerNames(): Promise<string[]> {
  const rows = await table_fetch({
    caller: 'getMasterPlayerNames',
    table: MASTER_PLAYERS_TABLE,
    orderBy: 'mst_name',
    columns: ['mst_name']
  })
  return rows.map((r: any) => r.mst_name as string)
}

//----------------------------------------------------------------------------------
//  upsertMasterPlayerNames — records player names seen in a Chess.com Games panel
//  search result page (or a harvest/priority-loop run). A sighting is only ever
//  written if its grade is strictly greater than MASTER_MIN_GRADE_TO_ADD — weaker
//  players' games can still display in search results, they just never enter this
//  table. An already-present player's mst_grade is refreshed on every later
//  qualifying sighting (no recency tracking — whatever was last scraped), but never
//  overwritten by a sub-threshold one, since those are filtered out before the upsert
//  runs at all. Returns the names that actually qualified/were written, so callers
//  can merge exactly what was persisted into their own local state.
//----------------------------------------------------------------------------------
export async function upsertMasterPlayerNames(sightings: MasterPlayerSighting[]): Promise<string[]> {
  const qualifying = new Map<string, number>()
  for (const s of sightings) {
    if (s.name && s.grade != null && s.grade > MASTER_MIN_GRADE_TO_ADD && !qualifying.has(s.name)) {
      qualifying.set(s.name, s.grade)
    }
  }

  for (const [name, grade] of qualifying) {
    //
    //  Caught per-name so one name failing doesn't abort every subsequent name in the same
    //  batch too. table_upsert already logs its own failure, but not which name it was for
    //  (only the query template, not the params) — logged again here with the actual name.
    //
    try {
      await table_upsert({
        caller: 'upsertMasterPlayerNames',
        table: MASTER_PLAYERS_TABLE,
        columnValuePairs: [
          { column: 'mst_name', value: name },
          { column: 'mst_grade', value: grade },
          { column: 'mst_priority', value: false }
        ],
        conflictColumns: ['mst_name'],
        //
        //  mst_priority is only ever set by setMasterPlayerPriority (the /owner/masterplayers
        //  toggle) — it must default to false for a brand-new row (no DB-level DEFAULT exists,
        //  per this project's no-column-defaults convention) but must never be reset back to
        //  false here on conflict, or every grade refresh would silently un-flag an
        //  already-priority-flagged player.
        //
        updateColumns: ['mst_grade']
      })
    } catch (err) {
      write_logging({
        lg_functionname: 'upsertMasterPlayerNames',
        lg_caller: 'upsertMasterPlayerNames',
        lg_msg: `Master player name not saved: ${name}: ` + (err as Error).message,
        lg_severity: 'E'
      })
    }
  }

  return [...qualifying.keys()]
}

//----------------------------------------------------------------------------------
//  getMasterPlayers — tmst_master_players rows for the /owner/masterplayers admin
//  page's priority-flagging list, optionally narrowed by a name filter (substring,
//  case-insensitive) and sorted by grade descending instead of the default
//  alphabetical-by-name order.
//----------------------------------------------------------------------------------
export async function getMasterPlayers(filterName: string = '', sortByGradeDesc: boolean = false): Promise<MasterPlayerRow[]> {
  const rows = await table_fetch({
    caller: 'getMasterPlayers',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: filterName
      ? [{ column: 'LOWER(mst_name)', value: `%${filterName.toLowerCase()}%`, operator: 'LIKE' }]
      : undefined,
    orderBy: sortByGradeDesc ? 'mst_grade DESC NULLS LAST' : 'mst_name',
    columns: ['mst_mstid', 'mst_name', 'mst_grade', 'mst_priority']
  })
  return rows.map((r: any) => ({
    mstid: Number(r.mst_mstid),
    name: r.mst_name as string,
    grade: r.mst_grade != null ? Number(r.mst_grade) : null,
    priority: r.mst_priority as boolean
  }))
}

//----------------------------------------------------------------------------------
//  getPriorityMasterNames — names flagged mst_priority = true, for the "Search known
//  masters" loop button on the Analyze page's Chess.com Games panel.
//----------------------------------------------------------------------------------
export async function getPriorityMasterNames(): Promise<string[]> {
  const rows = await table_fetch({
    caller: 'getPriorityMasterNames',
    table: MASTER_PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'mst_priority', value: true }],
    orderBy: 'mst_name',
    columns: ['mst_name']
  })
  return rows.map((r: any) => r.mst_name as string)
}

//----------------------------------------------------------------------------------
//  setMasterPlayerPriority — flags/unflags one player for the "Search known masters"
//  loop on the Analyze page's Chess.com Games panel.
//----------------------------------------------------------------------------------
export async function setMasterPlayerPriority(mstid: number, priority: boolean): Promise<void> {
  await table_update({
    caller: 'setMasterPlayerPriority',
    table: MASTER_PLAYERS_TABLE,
    columnValuePairs: [{ column: 'mst_priority', value: priority }],
    whereColumnValuePairs: [{ column: 'mst_mstid', value: mstid }]
  })
}
