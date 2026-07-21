import ConstantsViewer, { ConstantSection } from '@/src/ui/owner/ConstantsViewer'
import {
  INCLUDED_TIME_CLASSES,
  DEFAULT_PLAYER,
  DEFAULT_DATE_FROM,
  DEFAULT_MIN_GAMES,
  DEFAULT_FILTER_TERMINATIONS,
  TERMINATION_CHART_TYPES,
  MIN_ANALYSIS_MOVE,
  MOVE_COUNT_MIN_MOVE,
  MAX_ANALYSIS_MOVE,
  PURGE_REACH_GRACE_DAYS,
  MIN_REACH_TO_KEEP,
  HABITS_MIN_REACH_FLOOR,
  HABITS_MOVE_CP_CLAMP,
  RESULT_MISMATCH_CP_THRESHOLD,
  POPULAR_POSITION_DEPTH_TIERS,
  DEFAULT_BATCH_SIZE,
  POSITION_INSERT_CHUNK_SIZE,
  GAMES_ITEMS_PER_PAGE,
  GAME_LIST_ITEMS_PER_PAGE,
  PIPELINE_LOG_ROWS_PER_PAGE,
  HABITS_ITEMS_PER_PAGE,
  GAME_ENDINGS_CONCURRENCY,
  PLAYER_TIME_CLASSES,
  STOCKFISH_DEPTH,
  STOCKFISH_BLUNDER_CP,
  STOCKFISH_MISTAKE_CP,
  STOCKFISH_INACCURACY_CP,
  STOCKFISH_HASH,
  STOCKFISH_BESTLINE_LENGTH,
  STOCKFISH_DEEP_ANALYSIS_DEPTH,
  STOCKFISH_DEEP_ANALYSIS_MULTIPV,
  VALUE_DISPLAY_MAX_LENGTH
} from '@/src/lib/constants'

//----------------------------------------------------------------------------------
//  CONSTANTS_SECTIONS — hardwired display data for every constants.ts export;
//  add an entry here whenever a new constant is added to constants.ts.
//----------------------------------------------------------------------------------
const CONSTANTS_SECTIONS: ConstantSection[] = [
  {
    heading: 'Player / Filter Defaults',
    entries: [
      { name: 'INCLUDED_TIME_CLASSES', value: INCLUDED_TIME_CLASSES, description: 'Global fallback list of chess.com time classes included when a player has no PLAYER_TIME_CLASSES override.', consumers: ['sync.ts: syncArchive', 'players.ts: updatePlayerRating', 'deconstruct.ts: getUndeconstructedCount, deconstructGames'] },
      { name: 'DEFAULT_PLAYER', value: DEFAULT_PLAYER, description: 'Default selected player across the app.', consumers: ['players.ts: getPlayers'] },
      { name: 'DEFAULT_DATE_FROM', value: DEFAULT_DATE_FROM, description: "Default 'from' date for game-history filters.", consumers: ['graph/page.tsx: GraphContent', 'GameList.tsx: GameList', 'OpeningScoreChart.tsx: OpeningScoreChart', 'TerminationChart.tsx: TerminationChart'] },
      { name: 'DEFAULT_MIN_GAMES', value: DEFAULT_MIN_GAMES, description: 'Default minimum-games threshold for the Opening Score chart filter.', consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'DEFAULT_FILTER_TERMINATIONS', value: DEFAULT_FILTER_TERMINATIONS, description: 'Default termination reasons pre-selected in the Opening Score chart filter.', consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'TERMINATION_CHART_TYPES', value: TERMINATION_CHART_TYPES, description: 'The only termination reasons shown on the Endings chart — every other reason has too few games to be visually meaningful and is filtered out entirely, both in the SQL and the chart.', consumers: ['games.ts: getTerminationStats'] }
    ]
  },
  {
    heading: 'Analysis Pipeline Thresholds',
    entries: [
      { name: 'MIN_ANALYSIS_MOVE', value: MIN_ANALYSIS_MOVE, description: "Positions before this move number are opening theory and are never tracked, displayed, or quizzed anywhere in the app. Single source of truth for every 'skip the opening' check.", consumers: ['HabitsTable.tsx: HabitsTable', 'buildHabits.ts: buildHabits', 'habits/page.tsx: HabitsContent', 'buildPositionTree.ts: buildPositionTree', 'pipelineStatus.ts: refreshHabitsStatus', 'owner/pipeline/page.tsx (module scope)', 'deconstruct.ts (module scope)'] },
      { name: 'MOVE_COUNT_MIN_MOVE', value: MOVE_COUNT_MIN_MOVE, description: "The Analyze page's ×N move-play-count badge/check only applies from this move number onward. Deliberately separate from MIN_ANALYSIS_MOVE.", consumers: ['ChessBoardView.tsx: ChessBoardView'] },
      { name: 'MAX_ANALYSIS_MOVE', value: MAX_ANALYSIS_MOVE, description: "Positions past this move number are almost never revisited (data-verified: 0% of positions past move 18 have been reached more than 3 times). Single source of truth for the 'stop tracking, it won't repeat' ceiling.", consumers: ['buildPositionTree.ts: buildPositionTree'] },
      { name: 'PURGE_REACH_GRACE_DAYS', value: PURGE_REACH_GRACE_DAYS, description: 'A low-reach position is only eligible for pruning once every one of its occurrences is at least this many days old, so a newly-tried opening is never purged before it gets a fair chance to repeat.', consumers: ['purgePositions.ts: purgeStaleReachOnePositions', 'pipelineStatus.ts: refreshPurgeStatus', 'owner/pipeline/page.tsx (module scope)'] },
      { name: 'MIN_REACH_TO_KEEP', value: MIN_REACH_TO_KEEP, description: 'Positions reached by this many games or fewer are candidates for purging (once PURGE_REACH_GRACE_DAYS also passes).', consumers: ['enrichPositionsStockfish.ts: countRemainingPositions, getResultingFensToEvaluate, enrichPositionsStockfish', 'purgePositions.ts: purgeStaleReachOnePositions', 'pipelineStatus.ts: refreshStep4, refreshCpChangeStatus, refreshPurgeStatus', 'owner/pipeline/page.tsx (module scope)'] },
      { name: 'HABITS_MIN_REACH_FLOOR', value: HABITS_MIN_REACH_FLOOR, description: "Loosest reach threshold baked into buildHabits' aggregation HAVING clause, matching the lowest option in the Habits page's Min Reached dropdown.", consumers: ['buildHabits.ts: buildHabits', 'pipelineStatus.ts: refreshHabitsStatus', 'owner/pipeline/page.tsx (module scope)'] },
      { name: 'HABITS_MOVE_CP_CLAMP', value: HABITS_MOVE_CP_CLAMP, description: "Max magnitude buildHabits() will store in hab_move_cp — clamped since mate scores normalize to ±10000, which can exceed thab_habits.hab_move_cp's numeric(6,2) precision.", consumers: ['buildHabits.ts: buildHabits'] },
      { name: 'RESULT_MISMATCH_CP_THRESHOLD', value: RESULT_MISMATCH_CP_THRESHOLD, description: "How decisive gd_final_eval must be, in either direction, before a game's recorded result is flagged as contradicting its final position.", consumers: ['chessdb.ts: getGamesForPosition'] },
      { name: 'POPULAR_POSITION_DEPTH_TIERS', value: POPULAR_POSITION_DEPTH_TIERS, description: "The Deepen Popular Positions pipeline step's reach-to-depth table — a position qualifies for the first (highest) tier its pos_reached meets or exceeds.", consumers: ['enrichPositionsStockfish.ts: popularPositionTierSql'] }
    ]
  },
  {
    heading: 'Batch / Pagination / Concurrency',
    entries: [
      { name: 'DEFAULT_BATCH_SIZE', value: DEFAULT_BATCH_SIZE, description: 'Standing default batch size for per-run limits (Build Game Positions, Evaluate Positions).', consumers: ['enrichPositionsStockfish.ts: deepenPopularPositions, evaluateGameEndings', 'owner/pipeline/page.tsx: PipelinePage'] },
      { name: 'POSITION_INSERT_CHUNK_SIZE', value: POSITION_INSERT_CHUNK_SIZE, description: 'Target rows per bulk INSERT (tgam_game_positions, thab_habits) — keeps query params well under the Postgres per-statement limit.', consumers: ['enrichPositionsStockfish.ts: evaluateGameEndings', 'buildPositionTree.ts: insertGamePositions', 'buildHabits.ts: buildHabits'] },
      { name: 'GAMES_ITEMS_PER_PAGE', value: GAMES_ITEMS_PER_PAGE, description: 'Page size for the games-list server action.', consumers: ['games.ts: fetchFilteredGames, getGamesPageCount'] },
      { name: 'GAME_LIST_ITEMS_PER_PAGE', value: GAME_LIST_ITEMS_PER_PAGE, description: 'Page size for the GameList UI component.', consumers: ['GameList.tsx: GameList'] },
      { name: 'PIPELINE_LOG_ROWS_PER_PAGE', value: PIPELINE_LOG_ROWS_PER_PAGE, description: 'Page size for the /owner/pipelinelog viewer.', consumers: ['PipelineLogTable.tsx: fetchdata'] },
      { name: 'HABITS_ITEMS_PER_PAGE', value: HABITS_ITEMS_PER_PAGE, description: 'Page size for the /habits table.', consumers: ['habits/page.tsx: HabitsContent'] },
      { name: 'GAME_ENDINGS_CONCURRENCY', value: GAME_ENDINGS_CONCURRENCY, description: "Number of concurrent Stockfish processes used by evaluateGameEndings for games whose final position isn't already tracked (native binary path only).", consumers: ['enrichPositionsStockfish.ts: evaluateGameEndings'] }
    ]
  },
  {
    heading: 'Player Overrides + Helpers',
    entries: [
      { name: 'PLAYER_TIME_CLASSES', value: PLAYER_TIME_CLASSES, description: 'Per-player allowed time-class overrides, read via getPlayerTimeClasses().', consumers: ['AppShell.tsx: loadAll', 'DeconstructButton.tsx: handleCheckCounts, handlePopulate'] }
    ]
  },
  {
    heading: 'Stockfish Analysis',
    entries: [
      { name: 'STOCKFISH_DEPTH', value: STOCKFISH_DEPTH, description: 'Default Stockfish search depth for move analysis.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_BLUNDER_CP', value: STOCKFISH_BLUNDER_CP, description: 'CP-loss threshold above which a move is classified a blunder.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_MISTAKE_CP', value: STOCKFISH_MISTAKE_CP, description: 'CP-loss threshold above which a move is classified a mistake.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_INACCURACY_CP', value: STOCKFISH_INACCURACY_CP, description: 'CP-loss threshold above which a move is classified an inaccuracy.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_HASH', value: STOCKFISH_HASH, description: 'Stockfish engine hash table size (MB).', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_BESTLINE_LENGTH', value: STOCKFISH_BESTLINE_LENGTH, description: "Max number of moves shown in the engine's best-line suggestion.", consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_DEEP_ANALYSIS_DEPTH', value: STOCKFISH_DEEP_ANALYSIS_DEPTH, description: 'Search depth used for deep/infinite analysis mode.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_DEEP_ANALYSIS_MULTIPV', value: STOCKFISH_DEEP_ANALYSIS_MULTIPV, description: 'Number of candidate lines (MultiPV) shown in deep analysis mode.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] }
    ]
  },
  {
    heading: 'UI Display',
    entries: [
      { name: 'VALUE_DISPLAY_MAX_LENGTH', value: VALUE_DISPLAY_MAX_LENGTH, description: "Value strings longer than this (or any object/array) render behind this page's Show popover button instead of inline.", consumers: ['ConstantsViewer.tsx: renderValue'] }
    ]
  }
]

//----------------------------------------------------------------------------------
//  ConstantsPage — read-only display of constants.ts and .env, tabbed, no edit controls
//----------------------------------------------------------------------------------
export default function ConstantsPage() {
  const envSections: ConstantSection[] = [
    {
      heading: 'Database',
      entries: [
        { name: 'POSTGRES_URL', value: process.env.POSTGRES_URL, description: 'Full Postgres connection string — the only DB var actually read by the app.', consumers: ['nextjs-shared/src/tables/db.ts', 'nextjs-shared/next.config.mjs', 'lib/sync-games.ts', 'lib/deconstruct-games.ts'] },
        { name: 'POSTGRES_DATABASE_LOCATION', value: process.env.POSTGRES_DATABASE_LOCATION, description: 'Human-readable environment label (local/dev/prod) shown in the app header.', consumers: ['src/app/layout.tsx'] }
      ]
    },
    {
      heading: 'Application Environment',
      entries: [
        { name: 'NEXT_PUBLIC_APPENV_ISDEV', value: process.env.NEXT_PUBLIC_APPENV_ISDEV, description: 'Marks this environment as dev; read by the app header/layout.', consumers: ['src/app/layout.tsx'] },
        { name: 'NEXT_PUBLIC_APPENV_DBHANDLER', value: process.env.NEXT_PUBLIC_APPENV_DBHANDLER, description: 'Selects the DB connection handler in nextjs-shared.', consumers: ['nextjs-shared/src/tables/db.ts'] },
        { name: 'NEXT_PUBLIC_APPENV_LOG_I', value: process.env.NEXT_PUBLIC_APPENV_LOG_I, description: 'Enables/disables Info-level logging.', consumers: ['nextjs-shared/src/tables/tableGeneric/write_logging.ts'] },
        { name: 'NEXT_PUBLIC_APPENV_LOG_D', value: process.env.NEXT_PUBLIC_APPENV_LOG_D, description: 'Enables/disables Debug-level logging.', consumers: ['nextjs-shared/src/tables/tableGeneric/write_logging.ts'] },
        { name: 'CRON_SECRET', value: process.env.CRON_SECRET, description: 'Shared secret required by the cron sync API route and the standalone cron-sync script.', consumers: ['src/app/api/cron/sync/route.ts', 'lib/cron-sync.ts'] },
        { name: 'PORT', value: process.env.PORT, description: 'Port used by the standalone lib/cron-sync.ts script — the npm dev scripts hardcode their own --port instead.', consumers: ['lib/cron-sync.ts'] }
      ]
    },
    {
      heading: 'Ollama',
      entries: [
        { name: 'OLLAMA_URL', value: process.env.OLLAMA_URL, description: 'Ollama server URL — scaffolding for a planned server-side AI insights feature, not yet built.', consumers: ['none yet'] },
        { name: 'OLLAMA_MODEL', value: process.env.OLLAMA_MODEL, description: 'Ollama model name — same planned feature as OLLAMA_URL.', consumers: ['none yet'] }
      ]
    },
    {
      heading: 'Stockfish Binary',
      entries: [
        { name: 'STOCKFISH_PATH', value: process.env.STOCKFISH_PATH, description: 'Filesystem path to the native Stockfish binary used for server-side game/position enrichment.', consumers: ['src/lib/analysis/enrichPositionsStockfish.ts'] }
      ]
    }
  ]

  return <ConstantsViewer constantsSections={CONSTANTS_SECTIONS} envSections={envSections} />
}
