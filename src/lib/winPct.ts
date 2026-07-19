//----------------------------------------------------------------------------------
//  winPct — win percentage with draws worth half a point (win=1, draw=0.5, loss=0).
//  Draws are inferred as times - wins - losses rather than passed separately, since
//  every caller already has wins/losses/times and no caller currently tracks draws
//  as their own count.
//----------------------------------------------------------------------------------
export function winPct(wins: number, losses: number, times: number): number {
  if (times === 0) return 0
  const draws = times - wins - losses
  return Math.round(((wins + draws * 0.5) / times) * 100)
}
