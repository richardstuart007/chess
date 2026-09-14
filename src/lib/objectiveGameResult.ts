//==================================================================================================
//  1) DESCRIPTION
//    objectiveGameResult — derives '1-0'/'0-1'/'½-½' from a personal (color, result) pair (e.g.
//    gd_player_color/gd_player_result, mgd_player_color/mgd_player_result), since those columns
//    are stored relative to whichever side the tracked entity played, which callers can't
//    otherwise tell apart from White/Black. This is also the basis for any White/Draw/Black
//    win-rate aggregation (see chessdb_player.ts's getMoveSummaryForPosition_player) — never tally
//    raw personal win/loss counts across games where the tracked entity played different colors,
//    since that mixes two different perspectives into one meaningless number.
//
//    Parameters:
//      color  — the tracked entity's own color in this game ('white' or 'black')
//      result — the tracked entity's own personal result ('win' | 'loss' | 'draw')
//
//    Returns:
//      the objective chess result, from White's side, regardless of who was tracked
//==================================================================================================

export function objectiveGameResult(color: string, result: string): '1-0' | '0-1' | '½-½' {
  if (result === 'draw') return '½-½'
  const won = result === 'win'
  const whiteWon = (color === 'white' && won) || (color === 'black' && !won)
  return whiteWon ? '1-0' : '0-1'
}
