'use server'

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import type { Filter } from 'nextjs-shared/structures'
import { GAME_LIST_ROWS_DEFAULT_Master } from '../constants'
import { getMasterHandleNameMap } from '../actions/masterPlayers'

const MASTER_DECON_TABLE = 'tmgd_gamesdecon'

//----------------------------------------------------------------------------------
//  getMasterGameById — reads from tmgd_gamesdecon, matched by its own
//  permanent mgd_mgdid. Mirrors games.ts's getGameById.
//----------------------------------------------------------------------------------
export async function getMasterGameById(mgdid: number) {
  const result = await table_fetch({
    caller: 'getMasterGameById',
    table: MASTER_DECON_TABLE,
    whereColumnValuePairs: [{ column: 'mgd_mgdid', value: mgdid }]
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterGameById',
      lg_caller: 'getMasterGameById',
      lg_msg: 'Failed to fetch master game ' + mgdid + ': ' + result.error,
      lg_severity: 'E'
    })
    return null
  }
  const row = result.data[0] ?? null
  if (!row) return null

  const nameMap = await getMasterHandleNameMap()
  return { ...row, mgd_player_name: nameMap[(row.mgd_player as string).toLowerCase()] ?? row.mgd_player }
}

export type MasterGameFilters = {
  mgdid?: number
  player?: string
  opponent?: string
  opponentRatingMin?: number
  opponentRatingMax?: number
  result?: string
  termination?: string[]
  color?: string
  timeClass?: string
  opening?: string
  openingNameExact?: string
  eco?: string
  dateFrom?: string
  dateTo?: string
}

//----------------------------------------------------------------------------------
//  buildMasterGameFilters — mirrors games.ts's buildFilters
//----------------------------------------------------------------------------------
function buildMasterGameFilters(filters: MasterGameFilters): Filter[] {
  const result: Filter[] = []

  if (filters.mgdid) {
    result.push({ column: 'mgd_mgdid', operator: '=', value: filters.mgdid })
  }
  if (filters.player) {
    result.push({ column: 'mgd_player', operator: '=', value: filters.player.toLowerCase() })
  }
  if (filters.opponent) {
    result.push({ column: 'mgd_opponent_username', operator: 'LIKE', value: filters.opponent })
  }
  const ratingOverlap = filters.opponentRatingMin && filters.opponentRatingMax &&
    filters.opponentRatingMin > filters.opponentRatingMax
  if (!ratingOverlap) {
    if (filters.opponentRatingMin)
      result.push({ column: 'mgd_opponent_rating', operator: '>=', value: filters.opponentRatingMin })
    if (filters.opponentRatingMax)
      result.push({ column: 'mgd_opponent_rating', operator: '<=', value: filters.opponentRatingMax })
  }
  if (filters.result) {
    result.push({ column: 'mgd_player_result', operator: '=', value: filters.result })
  }
  if (filters.termination && filters.termination.length > 0) {
    result.push({ column: 'mgd_termination', operator: 'IN', value: filters.termination })
  }
  if (filters.color) {
    result.push({ column: 'mgd_player_color', operator: '=', value: filters.color })
  }
  if (filters.timeClass) {
    result.push({ column: 'mgd_time_class', operator: '=', value: filters.timeClass })
  }
  if (filters.opening) {
    result.push({ column: 'mgd_opening_name', operator: 'LIKE', value: filters.opening })
  }
  if (filters.openingNameExact) {
    result.push({ column: 'mgd_opening_name', operator: '=', value: filters.openingNameExact })
  }
  if (filters.eco) {
    result.push({ column: 'mgd_eco_code', operator: 'LIKE', value: filters.eco })
  }
  if (filters.dateFrom) {
    const unixFrom = Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    result.push({ column: 'mgd_end_time', operator: '>=', value: unixFrom })
  }
  if (filters.dateTo) {
    const unixTo = Math.floor(new Date(filters.dateTo + 'T23:59:59').getTime() / 1000)
    result.push({ column: 'mgd_end_time', operator: '<=', value: unixTo })
  }

  return result
}

//----------------------------------------------------------------------------------
//  fetchFilteredMasterGames — mirrors games.ts's fetchFilteredGames, against
//  tmgd_gamesdecon (secondary database)
//----------------------------------------------------------------------------------
export async function fetchFilteredMasterGames(
  filters: MasterGameFilters,
  page: number,
  itemsPerPage: number = GAME_LIST_ROWS_DEFAULT_Master
) {
  const filterArray = buildMasterGameFilters(filters)
  const offset = (page - 1) * itemsPerPage

  const result = await fetchFiltered({
    table: MASTER_DECON_TABLE,
    filters: filterArray,
    orderBy: 'mgd_end_time DESC',
    limit: itemsPerPage > 0 ? itemsPerPage : undefined,
    offset,
    caller: 'fetchFilteredMasterGames'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'fetchFilteredMasterGames',
      lg_caller: 'fetchFilteredMasterGames',
      lg_msg: 'Failed to fetch filtered master games: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }

  const nameMap = await getMasterHandleNameMap()
  return result.data.map((row: any) => ({
    ...row,
    mgd_player_name: nameMap[(row.mgd_player as string).toLowerCase()] ?? row.mgd_player
  }))
}

//----------------------------------------------------------------------------------
//  getMasterGamesPageCount — mirrors games.ts's getGamesPageCount
//----------------------------------------------------------------------------------
export async function getMasterGamesPageCount(
  filters: MasterGameFilters,
  itemsPerPage: number = GAME_LIST_ROWS_DEFAULT_Master
): Promise<number> {
  const filterArray = buildMasterGameFilters(filters)
  const result = await fetchTotalPages({
    table: MASTER_DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'getMasterGamesPageCount'
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getMasterGamesPageCount',
      lg_caller: 'getMasterGamesPageCount',
      lg_msg: 'Failed to fetch master games page count: ' + result.error,
      lg_severity: 'E'
    })
    return 0
  }
  return result.data
}

export type SyncedMasterPlayer = { handle: string; name: string }

//----------------------------------------------------------------------------------
//  getSyncedMasterPlayers — distinct mgd_player handles actually present in
//  tmgd_gamesdecon, each paired with its real name (merged in from
//  tmst_master_players, primary database — no cross-database join possible), for the
//  Masters Games list's Player filter (as opposed to MasterPlayerSelect, which lists
//  every known master player regardless of whether they've been synced — this only
//  lists ones with real data to filter by).
//----------------------------------------------------------------------------------
export async function getSyncedMasterPlayers(): Promise<SyncedMasterPlayer[]> {
  const result = await table_query({
    caller: 'getSyncedMasterPlayers',
    table: MASTER_DECON_TABLE,
    query: `SELECT DISTINCT mgd_player FROM ${MASTER_DECON_TABLE} ORDER BY mgd_player`,
    params: [],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({
      lg_functionname: 'getSyncedMasterPlayers',
      lg_caller: 'getSyncedMasterPlayers',
      lg_msg: 'Failed to fetch synced master players: ' + result.error,
      lg_severity: 'E'
    })
    return []
  }

  const nameMap = await getMasterHandleNameMap()
  return result.data.map((r: any) => {
    const handle = r.mgd_player as string
    return { handle, name: nameMap[handle.toLowerCase()] ?? handle }
  })
}
