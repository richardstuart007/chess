//----------------------------------------------------------------------------------
//  Player / Filter Defaults
//----------------------------------------------------------------------------------
export const INCLUDED_TIME_CLASSES = ['blitz', 'rapid']
export const DEFAULT_PLAYER = 'stricade'
export const DEFAULT_DATE_FROM = '2025-01-01'
export const DEFAULT_MIN_GAMES = '25'
export const DEFAULT_FILTER_TERMINATIONS = ['Checkmate', 'Resignation']
export const TERMINATION_CHART_TYPES = ['Resignation', 'Checkmate', 'Time']

//----------------------------------------------------------------------------------
//  Analysis Pipeline Thresholds
//----------------------------------------------------------------------------------
export const MIN_ANALYSIS_MOVE = 4
export const MOVE_COUNT_MIN_MOVE = 6
export const MAX_ANALYSIS_MOVE = 16
export const PURGE_REACH_GRACE_DAYS = 90
export const MIN_REACH_TO_KEEP = 2
export const HABITS_MIN_REACH_FLOOR = 2
export const HABITS_MOVE_CP_CLAMP = 9999
export const RESULT_MISMATCH_CP_THRESHOLD = 200
export const POPULAR_POSITION_DEPTH_TIERS: { minReach: number; depth: number }[] = [
  { minReach: 50, depth: 30 },
  { minReach: 30, depth: 24 },
  { minReach: 10, depth: 22 }
]

//----------------------------------------------------------------------------------
//  Batch / Pagination / Concurrency
//----------------------------------------------------------------------------------
export const DEFAULT_BATCH_SIZE = 200
export const CRON_DEEPEN_POPULAR_BATCH_SIZE = 100
export const POSITION_INSERT_CHUNK_SIZE = 500
export const GAMES_ITEMS_PER_PAGE = 25
export const GAME_LIST_ITEMS_PER_PAGE = 15
export const PIPELINE_LOG_ROWS_PER_PAGE = 40
export const HABITS_ITEMS_PER_PAGE = 10
export const GAME_ENDINGS_CONCURRENCY = 4
export const PIPELINE_CRON_SCHEDULE: Record<number, string> = {
  1: '3:00am',  // Game Sync
  2: '3:20am',  // Build Game Positions
  3: '3:40am',  // Sync Position Tree
  4: '4:00am',  // Purge Stale Positions
  5: '4:20am',  // Evaluate Positions
  6: '4:40am',  // Update CP Change
  7: '5:00am',  // Build Habits
  8: '5:20am',  // Evaluate Game Endings
  9: '5:40am',  // Deepen Popular Positions
}

//----------------------------------------------------------------------------------
//  Player Overrides + Helpers
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  Stockfish Analysis
//----------------------------------------------------------------------------------
export const STOCKFISH_DEPTH = 16
export const STOCKFISH_BLUNDER_CP = 200
export const STOCKFISH_MISTAKE_CP = 100
export const STOCKFISH_INACCURACY_CP = 50
export const STOCKFISH_HASH = 128
export const STOCKFISH_BESTLINE_LENGTH = 5
export const STOCKFISH_DEEP_ANALYSIS_DEPTH = 24
export const STOCKFISH_DEEP_ANALYSIS_MULTIPV = 3

//----------------------------------------------------------------------------------
//  UI Display
//----------------------------------------------------------------------------------
export const VALUE_DISPLAY_MAX_LENGTH = 40
