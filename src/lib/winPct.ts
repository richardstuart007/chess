//==================================================================================================
//  1) DESCRIPTION
//    winPct — win percentage with draws worth half a point (win=1, draw=0.5, loss=0).
//
//    Parameters:
//      wins   — number of wins
//      losses — number of losses
//      times  — total occurrences (draws inferred as times - wins - losses)
//
//    Returns:
//      score percentage, 0-100, rounded
//==================================================================================================

export function winPct(wins: number, losses: number, times: number): number {
  if (times === 0) return 0
  const draws = times - wins - losses
  return Math.round(((wins + draws * 0.5) / times) * 100)
}
