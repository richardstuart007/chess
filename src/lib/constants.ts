//----------------------------------------------------------------------------------
//  Player / Filter Defaults
//----------------------------------------------------------------------------------
export const INCLUDED_TIME_CLASSES_Player = ['blitz', 'rapid']
export const DEFAULT_PLAYER = 'stricade'
export const DEFAULT_DATE_FROM_Player = '2024-01-01'
export const DEFAULT_MIN_GAMES_Player = '25'
export const DEFAULT_FILTER_TERMINATIONS_Player = ['Checkmate', 'Resignation']
export const TERMINATION_CHART_TYPES_Player = ['Resignation', 'Checkmate', 'Time']

//----------------------------------------------------------------------------------
//  Card avatars — both the blue Player box (AppShell) and the amber Master box
//  (AppNav) show a fixed curated set of cards whose avatar images are downloaded
//  once into public/avatars/. AVATAR_DIR is the shared public/ prefix; each map
//  keys a chess.com handle → filename (native extension kept):
//    MASTER_AVATARS — mst_chesscom_handle, the top 4 masters by grade
//    PLAYER_AVATARS — pl_player, the tracked players
//  tpl_players.pl_avatar stays as a fallback for any future tracked player not in
//  PLAYER_AVATARS; tmst_master_players has no avatar column at all.
//----------------------------------------------------------------------------------
export const AVATAR_DIR = '/avatars/'
export const MASTER_AVATARS: Record<string, string> = {
  MagnusCarlsen:       'magnuscarlsen.jpg',
  FabianoCaruana:      'fabianocaruana.png',
  Hikaru:              'hikaru.png',
  Javokhir_Sindarov05: 'javokhir_sindarov05.jpg'
}
export const PLAYER_AVATARS: Record<string, string> = {
  stricade:  'stricade.jpeg',
  astarrboy: 'astarrboy.png'
}

//----------------------------------------------------------------------------------
//  Filter Settings — shared components (src/ui/filters/*)
//----------------------------------------------------------------------------------
export const WIDTH_PLAYER = 'w-24'
export const WIDTH_MASTER_PLAYER = 'w-56'
export const WIDTH_DATE_FROM = 'w-32'
export const WIDTH_OPPONENT_RATING = 'w-12'
export const WIDTH_GAME_NUMBER = 'w-16'

//
//  Applied only to filters that are actually global (player, timeClass, dateFrom, opening, eco)
//  — every other, page-local use of the same shared components keeps the default blue border.
//
export const GLOBAL_FILTER_BORDER_CLASS = 'border-purple-400 hover:border-purple-400 focus:border-purple-400'

export const OPTIONS_COLOR = [{ value: '', label: 'All' }, { value: 'white', label: 'white' }, { value: 'black', label: 'black' }]
export const WIDTH_COLOR = 'w-20'
export const OPTIONS_COLOR_MULTI = [{ value: 'white', label: 'white' }, { value: 'black', label: 'black' }]
export const WIDTH_COLOR_MULTI = 'w-20'
export const OPTIONS_TIME_CLASS = [{ value: '', label: 'All' }, { value: 'blitz', label: 'blitz' }, { value: 'rapid', label: 'rapid' }]
export const WIDTH_TIME_CLASS = 'w-20'
export const OPTIONS_RESULT = [{ value: '', label: 'All' }, { value: 'win', label: 'win' }, { value: 'loss', label: 'loss' }, { value: 'draw', label: 'draw' }]
export const WIDTH_RESULT = 'w-16'
export const OPTIONS_RESULT_MULTI = [{ value: 'win', label: 'win' }, { value: 'loss', label: 'loss' }, { value: 'draw', label: 'draw' }]
export const WIDTH_RESULT_MULTI = 'w-20'
export const OPTIONS_TERMINATION = ['Resignation', 'Checkmate', 'Time', 'Repetition', 'Agreement', 'Stalemate', 'Insufficient', '50 Moves', 'Timeout', 'Abandoned']
export const WIDTH_TERMINATION = 'w-40'
export const OPTIONS_PIPELINE_TYPE = [{ value: '', label: 'All' }, { value: 'games', label: 'games' }, { value: 'masters', label: 'masters' }, { value: 'mastergames', label: 'mastergames' }]
export const WIDTH_PIPELINE_TYPE = 'w-32'

//
//  Per-call-site width overrides — same DD item as above, but a tighter table-header layout
//  context (GameList's filter row) needs a narrower control than the open filter bars elsewhere
//
export const WIDTH_COLOR_GAMES = 'w-16'
export const WIDTH_TIME_CLASS_GAMES = 'w-16'

export const WIDTH_OPPONENT = 'w-48'
export const WIDTH_OPENING = 'w-96'
export const WIDTH_ECO = 'w-16'
export const PLACEHOLDER_TEXT_FILTER = 'Filter...'

export const WIDTH_MIN_GAMES = 'w-16'
export const WIDTH_SORT_DIRECTION = 'w-16'
export const WIDTH_RESULTS_COUNT = 'w-16'
export const WIDTH_GAME_SORT = 'w-28'

export const WIDTH_GRAPH_LIMIT = 'w-20'

export const WIDTH_POSITION_COLOR = 'w-20'
export const WIDTH_QUALITY = 'w-20'
export const WIDTH_MIN_MOVE = 'w-20'
export const WIDTH_MIN_REACHED = 'w-20'
export const WIDTH_SORT_BY = 'w-24'
export const WIDTH_HABITS_OPENING = 'w-96'

//----------------------------------------------------------------------------------
//  Analysis Pipeline Thresholds
//----------------------------------------------------------------------------------
export const MIN_ANALYSIS_MOVE_Player = 4
export const MOVE_COUNT_MIN_MOVE = 6
export const MAX_ANALYSIS_MOVE_Player = 16
export const PURGE_REACH_GRACE_DAYS_Player = 90
export const MIN_REACH_TO_KEEP_Player = 2
export const HABITS_MIN_REACH_FLOOR_Player = 2
export const HABITS_MOVE_CP_CLAMP_Player = 9999
export const RESULT_MISMATCH_CP_THRESHOLD_Player = 200
export const POPULAR_POSITION_DEPTH_TIERS_Player: { minReach: number; depth: number }[] = [
  { minReach: 50, depth: 30 },
  { minReach: 30, depth: 24 },
  { minReach: 20, depth: 22 },
  { minReach: 10, depth: 20 }
]

//----------------------------------------------------------------------------------
//  Batch / Pagination / Concurrency
//----------------------------------------------------------------------------------
export const DEFAULT_BATCH_SIZE_Player = 200
export const CRON_DEEPEN_POPULAR_BATCH_SIZE_Player = 100
export const POSITION_TREE_LIMIT_Player = 3000
export const POSITION_TREE_LIMIT_Master = 10000
export const POSITION_INSERT_CHUNK_SIZE_Player = 500
export const GAMES_ITEMS_PER_PAGE_Player = 25
export const GAME_LIST_ROWS_DEFAULT_Player = 20
export const GAME_LIST_ROWS_OPTIONS_Player = [10, 15, 20, 50] as const
export const PIPELINE_LOG_ROWS_PER_PAGE = 40
export const PIPELINE_LOG_ROWS_OPTIONS = [10, 20, 40, 100] as const
export const HABITS_ITEMS_PER_PAGE_Player = 3
export const HABITS_ROWS_OPTIONS_Player = [3, 6, 10, 20, 50] as const
export const POSITION_GAMES_ROWS_DEFAULT = 10
export const POSITION_GAMES_ROWS_OPTIONS = [10, 15, 20] as const
export const FIDE_TOP_RATING_CUTOFF = 2600
export const FIDE_STANDARD_RATING_LIST_URL = 'https://ratings.fide.com/download/standard_rating_list_xml.zip'
export const FIDE_XML_CHUNK_SIZE = 2_000_000
export const FIDE_XML_READ_BATCH_CHUNKS = 5
export const GAME_ENDINGS_CONCURRENCY_Player = 4
export const PIPELINE_TYPE_GAMES = 'games'
export const PIPELINE_TYPE_MASTERS = 'masters'
export const PIPELINE_TYPE_MASTERGAMES = 'mastergames'
export const PIPELINE_CRON_SCHEDULE_Player: Record<number, string> = {
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
export const TIME_CLASSES_Player: Record<string, string[]> = {
  stricade: ['blitz'],
  astarrboy: ['blitz', 'rapid']
}

//----------------------------------------------------------------------------------
//  getPlayerTimeClasses — per-player allowed time classes, falls back to the global default
//----------------------------------------------------------------------------------
export function getPlayerTimeClasses(player: string): string[] {
  return TIME_CLASSES_Player[player.toLowerCase()] ?? INCLUDED_TIME_CLASSES_Player
}

//----------------------------------------------------------------------------------
//  Stockfish Analysis
//----------------------------------------------------------------------------------
export const STOCKFISH_DEPTH = 16
export const STOCKFISH_REANALYZE_DEFAULT_DEPTH = 20
export const STOCKFISH_BLUNDER_CP = 200
export const STOCKFISH_MISTAKE_CP = 100
export const STOCKFISH_INACCURACY_CP = 50
export const STOCKFISH_HASH = 128
export const STOCKFISH_BESTLINE_LENGTH = 5
export const STOCKFISH_DEEP_ANALYSIS_DEPTH = 24
export const STOCKFISH_DEEP_ANALYSIS_MULTIPV = 3
export const STOCKFISH_DEPTH_INPUT_MAX = 40

//----------------------------------------------------------------------------------
//  Masters Explorer (Lichess)
//----------------------------------------------------------------------------------
export const MASTERS_EXPLORER_MOVES_LIMIT = 12

//----------------------------------------------------------------------------------
//  Master Games (position database)
//----------------------------------------------------------------------------------
export const INCLUDED_TIME_CLASSES_Master = ['blitz', 'rapid']
export const MIN_ANALYSIS_MOVE_Master = 4
export const MAX_ANALYSIS_MOVE_Master = 16
export const POSITION_INSERT_CHUNK_SIZE_Master = 500
export const GAME_LIST_ROWS_DEFAULT_Master = 20
export const GAME_LIST_ROWS_OPTIONS_Master = [10, 15, 20, 50] as const
export const GAMES_SYNC_YEARS_Master = [2026, 2025, 2024, 2023, 2022, 2021, 2020] as const
export const MASTER_GAMES_FOR_FEN_LIMIT = 50

//----------------------------------------------------------------------------------
//  UI Display
//----------------------------------------------------------------------------------
export const VALUE_DISPLAY_MAX_LENGTH = 40
export const HABITS_BOARD_SIZE_PX = '200px'
export const POSITION_BOARD_SIZE_PX = '400px'

//----------------------------------------------------------------------------------
//  Session Storage
//----------------------------------------------------------------------------------
export const SESSION_STORAGE_PREFIX = 'rs7_chess_'
