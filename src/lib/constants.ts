export const INCLUDED_TIME_CLASSES = ['blitz', 'rapid']

export const DEFAULT_PLAYER = 'stricade'
export const DEFAULT_DATE_FROM = '2025-01-01'
export const DEFAULT_MIN_GAMES = '25'
export const DEFAULT_FILTER_TERMINATIONS = ['Checkmate', 'Resignation']

//
//  MIN_ANALYSIS_MOVE — positions before this move number are opening theory and
//  are never tracked, displayed, or quizzed anywhere in the app. Single source
//  of truth for every "skip the opening" check in the analysis pipeline/UI.
//
export const MIN_ANALYSIS_MOVE = 6

//
//  MAX_ANALYSIS_MOVE — positions past this move number are almost never revisited
//  (data-verified: 0% of positions past move 18 have been reached more than 3
//  times, in the entire database). Single source of truth for the "stop tracking,
//  it won't repeat" ceiling in the analysis pipeline/UI.
//
export const MAX_ANALYSIS_MOVE = 16

//
//  PURGE_REACH_GRACE_DAYS — a reach=1 position is only eligible for pruning once
//  its one occurrence's game is at least this many days old, so a newly-tried
//  opening is never purged before it gets a fair chance to repeat.
//
export const PURGE_REACH_GRACE_DAYS = 30

export const PLAYER_TIME_CLASSES: Record<string, string[]> = {
  stricade: ['blitz'],
  astarrboy: ['blitz', 'rapid']
}

//----------------------------------------------------------------------------------
//  getPlayerTimeClasses — per-player allowed time classes, falls back to the global default
//----------------------------------------------------------------------------------
export function getPlayerTimeClasses(username: string): string[] {
  return PLAYER_TIME_CLASSES[username.toLowerCase()] ?? INCLUDED_TIME_CLASSES
}
