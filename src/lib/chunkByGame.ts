//==================================================================================================
//  1) DESCRIPTION
//    chunkByGame — splits records into chunks no larger than maxRows, never splitting one game's
//    own records across two chunks. Shared by the player and master position-tree builders.
//
//    Parameters:
//      records   — records to chunk
//      maxRows   — target max rows per chunk (a chunk may exceed this if one game alone is bigger)
//      getGameId — extracts a record's game id — lets each caller keep its own DD field name
//                  (gdid vs mgdid) rather than forcing a shared field name onto both record shapes
//
//    Returns:
//      records grouped into chunks, each chunk containing only whole games
//==================================================================================================

export function chunkByGame<T>(records: T[], maxRows: number, getGameId: (record: T) => number): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let i = 0
  while (i < records.length) {
    const gameId = getGameId(records[i])
    let j = i
    while (j < records.length && getGameId(records[j]) === gameId) j++
    const gameRecords = records.slice(i, j)
    if (current.length > 0 && current.length + gameRecords.length > maxRows) {
      chunks.push(current)
      current = []
    }
    current.push(...gameRecords)
    i = j
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}
