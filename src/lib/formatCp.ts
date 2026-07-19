//----------------------------------------------------------------------------------
//  formatCp — format a centipawn value as pawns at 2 decimal places, with an explicit
//  +/- sign, and mate-in-N handling for mate-normalized scores (+-10000)
//----------------------------------------------------------------------------------
export function formatCp(cp: number): string {
  if (Math.abs(cp) >= 10000) {
    return cp > 0 ? `M${10000 - cp}` : `-M${10000 + cp}`
  }
  const val = (cp / 100).toFixed(2)
  return cp > 0 ? `+${val}` : val
}
