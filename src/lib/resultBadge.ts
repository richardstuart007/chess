//==================================================================================================
//  1) DESCRIPTION
//    resultBadge — W/L/D badge label + Tailwind classes for a game result, from one specific
//    side's own perspective (the caller must know which side playerResult is relative to).
//
//    Parameters:
//      playerResult — 'win' | 'loss' | 'draw', or null
//
//    Returns:
//      label — 'W' | 'L' | 'D' | '—'
//      cls   — badge Tailwind classes
//==================================================================================================

export function resultBadge(playerResult: string | null): { label: string; cls: string } {
  if (playerResult === 'win')  return { label: 'W', cls: 'bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (playerResult === 'loss') return { label: 'L', cls: 'bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (playerResult === 'draw') return { label: 'D', cls: 'bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs font-semibold' }
  return { label: '—', cls: 'text-gray-400 text-xs' }
}
