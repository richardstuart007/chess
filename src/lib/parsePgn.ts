export interface PgnHeaders {
  eco: string
  ecoUrl: string
  openingName: string
  termination: string
  utcDate: string
  timeControl: string
  result: string
}

//----------------------------------------------------------------------------------
//  getHeader — extract a single PGN header value by tag name
//----------------------------------------------------------------------------------
function getHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))
  return match?.[1] ?? ''
}

//----------------------------------------------------------------------------------
//  parsePgnHeaders — parse all relevant headers from a PGN string
//----------------------------------------------------------------------------------
export function parsePgnHeaders(pgn: string): PgnHeaders {
  const eco = getHeader(pgn, 'ECO')
  const ecoUrl = getHeader(pgn, 'ECOUrl')
  const termination = getHeader(pgn, 'Termination')
  const utcDate = getHeader(pgn, 'UTCDate')
  const timeControl = getHeader(pgn, 'TimeControl')
  const result = getHeader(pgn, 'Result')

  const openingName = extractOpeningName(ecoUrl, eco)

  return { eco, ecoUrl, openingName, termination, utcDate, timeControl, result }
}

//----------------------------------------------------------------------------------
//  extractOpeningName — parse opening name from ECOUrl
//----------------------------------------------------------------------------------
export function extractOpeningName(ecoUrl: string, _ecoCode: string): string {
  if (!ecoUrl) return ''

  const match = ecoUrl.match(/\/openings\/([^?#]+)/)
  if (!match) return ''

  let name = match[1]

  // Remove move notation suffixes (e.g., "-2...d6-3.d4", "-1...g6-2.g3")
  name = name.replace(/-\d+\.{1,3}[a-zA-Z0-9+#=].*$/, '')

  name = name.replace(/-/g, ' ')
  name = name.replace(/\s+/g, ' ').trim()

  return name
}

//----------------------------------------------------------------------------------
//  countMoves — count half-moves (ply) from PGN move text
//----------------------------------------------------------------------------------
export function countMoves(pgn: string): number {
  const moveText = pgn.replace(/\[.*?\]\s*/g, '').trim()

  const cleaned = moveText
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')
    .replace(/\d+\.\.\./g, '')
    .replace(/\d+\./g, '')
    .trim()

  if (!cleaned) return 0

  const moves = cleaned.split(/\s+/).filter(m => m.length > 0)
  return moves.length
}

//----------------------------------------------------------------------------------
//  parsePgnOpening — extract first N half-moves from a PGN string
//----------------------------------------------------------------------------------
export function parsePgnOpening(pgn: string, halfMoves: number = 999): string {
  const moveText = pgn.replace(/\[.*?\]\s*/gs, '').trim()
  const cleaned = moveText
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')
    .replace(/\d+\.{1,3}/g, '')
    .trim()
  const moves = cleaned.split(/\s+/).filter(m => m.length > 0)
  return moves.slice(0, halfMoves).join(' ')
}

//----------------------------------------------------------------------------------
//  parsePlayedDate — convert UTCDate "YYYY.MM.DD" to "YYYY-MM-DD"
//----------------------------------------------------------------------------------
export function parsePlayedDate(utcDate: string): string | null {
  if (!utcDate) return null
  return utcDate.replace(/\./g, '-')
}
