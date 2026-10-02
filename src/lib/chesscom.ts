const BASE = 'https://api.chess.com/pub'

export type ChessComGame = {
  url: string
  pgn: string
  time_control: string
  time_class: string
  end_time: number
  rated: boolean
  rules: string
  white: {
    username: string
    rating: number
    result: string
  }
  black: {
    username: string
    rating: number
    result: string
  }
  termination?: string | null
  finalEval?: number | null
}

//----------------------------------------------------------------------------------
//  fetchRecentGames — fetches a player's most recent chess.com games, walking their monthly archives
//
//  Params:
//    player — the chess.com username
//    count — how many recent games to return (default 10)
//
//  Returns:
//    the recent games
//----------------------------------------------------------------------------------
export async function fetchRecentGames(
  player: string,
  count: number = 10
): Promise<ChessComGame[]> {
  //
  //  Get list of monthly archives
  //
  const archivesRes = await fetch(`${BASE}/player/${player}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Could not fetch archives for "${player}"`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  if (archives.length === 0) return []

  //
  //  Fetch most recent month(s) until we have enough games
  //
  const games: ChessComGame[] = []
  for (let i = archives.length - 1; i >= 0 && games.length < count; i--) {
    const monthRes = await fetch(archives[i])
    if (!monthRes.ok) continue
    const { games: monthGames } = await monthRes.json() as { games: ChessComGame[] }

    //
    //  Filter to standard chess only (no variants)
    //
    const standardGames = monthGames.filter(g => g.rules === 'chess' && g.pgn)
    games.unshift(...standardGames)
  }

  //
  //  Return the most recent `count` games
  //
  const result = games.slice(-count)
  return result
}

//----------------------------------------------------------------------------------
//  getPlayerResult — a player's colour, result and opponent rating in a chess.com game
//
//  Params:
//    game — the chess.com game
//    player — the player's username
//
//  Returns:
//    color — the side the player had
//    result — the player's result
//    opponentRating — the opponent's rating
//----------------------------------------------------------------------------------
export function getPlayerResult(
  game: ChessComGame,
  player: string
): { color: 'white' | 'black'; result: string; opponentRating: number } {
  const isWhite = game.white.username.toLowerCase() === player.toLowerCase()
  const playerSide = isWhite ? game.white : game.black
  const opponentSide = isWhite ? game.black : game.white

  let result: string
  if (playerSide.result === 'win') result = 'win'
  else if (opponentSide.result === 'win') result = 'loss'
  else result = 'draw'

  return {
    color: isWhite ? 'white' : 'black',
    result,
    opponentRating: opponentSide.rating
  }
}

//----------------------------------------------------------------------------------
//  extractOpeningFromPgn — reads the ECO code and opening name from a PGN's headers
//
//  Params:
//    pgn — the game's PGN
//
//  Returns:
//    name — the opening name ('Unknown' when absent)
//    eco — the ECO code ('' when absent)
//----------------------------------------------------------------------------------
export function extractOpeningFromPgn(pgn: string): { name: string; eco: string } {
  const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/)
  const nameMatch = pgn.match(/\[Opening\s+"([^"]+)"\]/)
  return {
    eco: ecoMatch?.[1] ?? '',
    name: nameMatch?.[1] ?? 'Unknown'
  }
}
