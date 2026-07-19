export const INCLUDED_TIME_CLASSES = ['blitz', 'rapid']

export const DEFAULT_PLAYER = 'stricade'
export const DEFAULT_DATE_FROM = '2025-01-01'
export const DEFAULT_MIN_GAMES = '25'
export const DEFAULT_FILTER_TERMINATIONS = ['Checkmate', 'Resignation']

//
//  TERMINATION_CHART_TYPES — the only termination reasons shown on the Endings chart;
//  every other reason (Repetition, Agreement, Stalemate, etc.) has too few games to be
//  visually meaningful and is filtered out entirely, both in the SQL and the chart.
//
export const TERMINATION_CHART_TYPES = ['Resignation', 'Checkmate', 'Time']

//
//  MIN_ANALYSIS_MOVE — positions before this move number are opening theory and
//  are never tracked, displayed, or quizzed anywhere in the app. Single source
//  of truth for every "skip the opening" check in the analysis pipeline/UI.
//
export const MIN_ANALYSIS_MOVE = 4

//
//  MOVE_COUNT_MIN_MOVE — the Analyze page's "×N" move-play-count badge/check only
//  applies from this move number onward. Deliberately separate from MIN_ANALYSIS_MOVE
//  (a different, pipeline-wide "skip opening theory" threshold) — this one is specific
//  to the Analyze page's move-count display.
//
export const MOVE_COUNT_MIN_MOVE = 6

//
//  MAX_ANALYSIS_MOVE — positions past this move number are almost never revisited
//  (data-verified: 0% of positions past move 18 have been reached more than 3
//  times, in the entire database). Single source of truth for the "stop tracking,
//  it won't repeat" ceiling in the analysis pipeline/UI.
//
export const MAX_ANALYSIS_MOVE = 16

//
//  PURGE_REACH_GRACE_DAYS — a position with pos_reached <= MIN_REACH_TO_KEEP is only
//  eligible for pruning once every one of its occurrences is at least this many days
//  old, so a newly-tried opening is never purged before it gets a fair chance to repeat.
//
export const PURGE_REACH_GRACE_DAYS = 90

//
//  MIN_REACH_TO_KEEP — positions reached by this many games or fewer are candidates
//  for purging (once PURGE_REACH_GRACE_DAYS also passes). Single source of truth for
//  the reach threshold — see purgePositions.ts.
//
export const MIN_REACH_TO_KEEP = 2

//
//  HABITS_MIN_REACH_FLOOR — loosest reach threshold baked into buildHabits' aggregation
//  HAVING clause, matching the lowest option in the Habits page's "Min Reached" dropdown.
//  Every dropdown option (2/3/5/10) still works at read time via hab_move_times >= N.
//
export const HABITS_MIN_REACH_FLOOR = 2

//
//  HABITS_MOVE_CP_CLAMP — max magnitude buildHabits() will store in hab_move_cp. Mate
//  scores are normalized to +-10000 (see enrichPositionsStockfish.ts), so a single
//  real gam_cp_change swing can occasionally exceed thab_habits.hab_move_cp's
//  numeric(6,2) precision (max +-9999.99) — clamped here rather than widening the column.
//
export const HABITS_MOVE_CP_CLAMP = 9999

//
//  DEFAULT_BATCH_SIZE — standing default batch size for per-run limits (Build Game
//  Positions, Evaluate Positions). Same default in both the pipeline UI (overridable
//  via input) and the cron route (fixed), single source of truth for both.
//
export const DEFAULT_BATCH_SIZE = 200

//
//  POSITION_INSERT_CHUNK_SIZE — target rows per bulk INSERT (tgam_game_positions,
//  thab_habits) — keeps query params well under the Postgres per-statement limit.
//
export const POSITION_INSERT_CHUNK_SIZE = 500

//
//  GAMES_ITEMS_PER_PAGE — page size for the games-list server action (games.ts).
//
export const GAMES_ITEMS_PER_PAGE = 25

//
//  GAME_LIST_ITEMS_PER_PAGE — page size for the GameList UI component.
//
export const GAME_LIST_ITEMS_PER_PAGE = 15

//
//  PIPELINE_LOG_ROWS_PER_PAGE — page size for the /owner/pipelinelog viewer.
//
export const PIPELINE_LOG_ROWS_PER_PAGE = 40

//
//  HABITS_ITEMS_PER_PAGE — page size for the /habits table.
//
export const HABITS_ITEMS_PER_PAGE = 10

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
