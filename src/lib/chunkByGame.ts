//----------------------------------------------------------------------------------
//  chunkByGame — splits records into chunks no larger than maxRows, never splitting
//  one game's own records across two chunks. Shared by the player and master
//  position-tree builders — getGameId lets each caller keep its own DD field name
//  (gdid vs mgdid) rather than forcing a shared field name onto both record shapes.
//----------------------------------------------------------------------------------
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
