'use server'

//==================================================================================================
//  1) DESCRIPTION
//    searchChessComGames — live lookup of chess.com's own /games/search results for the given
//    position (fen), optionally narrowed by filters. Chess.com exposes no public API for this
//    search, so the server-rendered results table is parsed directly with cheerio.
//
//    Parameters:
//      fen     — position to search for; omit for a general search with no position constraint
//      filters — chess.com search filter values (see ChessComSearchFilters)
//      page    — result page, 2+ (page 1 is the implicit default)
//
//    Returns:
//      games — matched games
//      url   — the chess.com search URL that was fetched
//
//  2) NOTES
//    opening/openingId are always left blank — combining fen with an opening filter returned
//    zero results in testing, while fen alone (opening blank) returns real exact-position
//    matches. Returns [] on any failure (network error, no matching games, or chess.com changing
//    its markup). page (2+) pages through chess.com's own result pages — live-tested: page 1 is
//    the implicit default (no `page` param), `&page=N` for N>1 returns genuinely different games.
//    lstresult is always sent as '0' (Any) — the Result filter and the fixedcolors (P1=White)
//    toggle were both dropped from the UI after live testing against chess.com found them
//    unreliable; lstresult stays a fixed constant in the URL rather than omitted, matching what
//    chess.com's own URLs always show.
//
//  3) CHANGE HISTORY
//    2026-09-17 — removed fixedcolors and lstresult from ChessComSearchFilters (no longer
//                 caller-configurable); lstresult is now always sent as the fixed '0' (Any)
//==================================================================================================

import * as cheerio from 'cheerio'

export interface ChessComSearchGame {
  gameId:        number
  viewUrl:       string
  whiteUsername: string
  whiteRating:   number | null
  blackUsername: string
  blackRating:   number | null
  result:        string
  moves:         number | null
  year:          number | null
}

//
//  Chess.com's own /games/search filter values — undocumented, reverse-engineered by trying
//  each option in chess.com's own UI and reading back the resulting URL. lsty pairs with the
//  year field (comparison type); lstMoves/moves and sort=1/2/5/6 are deliberately unused —
//  the former's meaning was never confirmed, the latter all behaved identically to the default
//  (most recent) when tested.
//
export interface ChessComSearchFilters {
  p1:         string
  p2:         string
  mr:         number | ''
  year:       number | ''
  lsty:       string
  sort:       string
}

export async function searchChessComGames(fen: string | undefined, filters: ChessComSearchFilters, page?: number): Promise<{ games: ChessComSearchGame[]; url: string }> {
  const params = new URLSearchParams({
    opening: '',
    openingId: '',
    p1: filters.p1,
    p2: filters.p2,
    mr: filters.mr === '' ? '' : String(filters.mr),
    lsty: filters.lsty,
    year: filters.year === '' ? '' : String(filters.year),
    lstMoves: '3',
    moves: '',
    fen: fen ?? '',
    sort: filters.sort,
    //
    //  '0' = Any — the Result filter this paired with was dropped from the UI (see NOTES above)
    //
    lstresult: '0'
  })
  if (page && page > 1) params.set('page', String(page))
  const url = `https://www.chess.com/games/search?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    if (!res.ok) return { games: [], url }

    const html = await res.text()
    const $ = cheerio.load(html)

    const games: ChessComSearchGame[] = []
    $('.master-games-master-game').each((_, row) => {
      const $row = $(row)
      const viewUrl = $row.find('.master-games-td-user').attr('href') ?? ''
      const gameIdMatch = viewUrl.match(/\/games\/view\/(\d+)/)
      if (!gameIdMatch) return

      const taglines = $row.find('.master-games-user-tagline')
      const whiteUsername = $(taglines[0]).find('.master-games-username').text().trim()
      const whiteRating = parseRating($(taglines[0]).find('.master-games-user-rating').text())
      const blackUsername = $(taglines[1]).find('.master-games-username').text().trim()
      const blackRating = parseRating($(taglines[1]).find('.master-games-user-rating').text())

      const result = $row.find('.master-games-text-center a').first().text().trim()
      const movesText = $row.find('.master-games-text-right a').first().text().trim()
      const yearText = $row.find('.master-games-date').first().text().trim()

      games.push({
        gameId: parseInt(gameIdMatch[1], 10),
        viewUrl,
        whiteUsername,
        whiteRating,
        blackUsername,
        blackRating,
        result,
        moves: movesText ? parseInt(movesText, 10) : null,
        year: yearText ? parseInt(yearText, 10) : null
      })
    })

    return { games, url }
  } catch {
    return { games: [], url }
  }
}

//----------------------------------------------------------------------------------
//  parseRating — "(1775)" -> 1775, or null if chess.com shows no rating for that player
//----------------------------------------------------------------------------------
function parseRating(text: string): number | null {
  const match = text.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}
