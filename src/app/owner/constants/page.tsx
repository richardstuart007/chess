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
  CRON_DEEPEN_POPULAR_BATCH_SIZE,
  PIPELINE_CRON_SCHEDULE,
  POSITION_INSERT_CHUNK_SIZE,
  GAMES_ITEMS_PER_PAGE,
  GAME_LIST_ROWS_DEFAULT,
  PIPELINE_LOG_ROWS_PER_PAGE,
  HABITS_ITEMS_PER_PAGE,
  HABITS_ROWS_OPTIONS,
  POSITION_GAMES_ROWS_DEFAULT,
  POSITION_GAMES_ROWS_OPTIONS,
  FIDE_TOP_RATING_CUTOFF,
  FIDE_STANDARD_RATING_LIST_URL,
  FIDE_XML_CHUNK_SIZE,
  FIDE_XML_READ_BATCH_CHUNKS,
  GAME_ENDINGS_CONCURRENCY,
  PLAYER_TIME_CLASSES,
  STOCKFISH_DEPTH,
  STOCKFISH_REANALYZE_DEFAULT_DEPTH,
  STOCKFISH_BLUNDER_CP,
  STOCKFISH_MISTAKE_CP,
  STOCKFISH_INACCURACY_CP,
  STOCKFISH_HASH,
  STOCKFISH_BESTLINE_LENGTH,
  STOCKFISH_DEEP_ANALYSIS_DEPTH,
  STOCKFISH_DEEP_ANALYSIS_MULTIPV,
  STOCKFISH_DEPTH_INPUT_MAX,
  VALUE_DISPLAY_MAX_LENGTH,
  HABITS_BOARD_SIZE_PX,
  POSITION_BOARD_SIZE_PX,
  SESSION_STORAGE_PREFIX,
  WIDTH_PLAYER,
  WIDTH_DATE_FROM,
  WIDTH_OPPONENT_RATING,
  WIDTH_GAME_NUMBER,
  GLOBAL_FILTER_BORDER_CLASS,
  OPTIONS_COLOR,
  WIDTH_COLOR,
  OPTIONS_COLOR_MULTI,
  WIDTH_COLOR_MULTI,
  OPTIONS_TIME_CLASS,
  WIDTH_TIME_CLASS,
  OPTIONS_RESULT,
  WIDTH_RESULT,
  OPTIONS_RESULT_MULTI,
  WIDTH_RESULT_MULTI,
  OPTIONS_TERMINATION,
  WIDTH_TERMINATION,
  WIDTH_COLOR_GAMES,
  WIDTH_TIME_CLASS_GAMES,
  WIDTH_OPPONENT,
  WIDTH_OPENING,
  WIDTH_ECO,
  PLACEHOLDER_TEXT_FILTER,
  WIDTH_MIN_GAMES,
  WIDTH_SORT_DIRECTION,
  WIDTH_RESULTS_COUNT,
  WIDTH_GAME_SORT,
  WIDTH_GRAPH_LIMIT,
  WIDTH_HABITS_OPENING,
  WIDTH_POSITION_COLOR,
  WIDTH_QUALITY,
  WIDTH_MIN_MOVE,
  WIDTH_MIN_REACHED,
  WIDTH_SORT_BY,
  MASTERS_EXPLORER_MOVES_LIMIT
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
    heading: 'Filter Settings',
    entries: [
      { name: 'GLOBAL_FILTER_BORDER_CLASS', value: GLOBAL_FILTER_BORDER_CLASS, description: 'Purple border marking a filter as global (shared across every tab via a URL param) instead of page-local. Applied only to the actual global-role instances of these shared components.', consumers: ['FilterPlayerSelect.tsx: FilterPlayerSelect', 'FilterTimeClassSelect.tsx: FilterTimeClassSelect', 'GameList.tsx: GameList', 'graph/page.tsx: GraphContent', 'OpeningScoreChart.tsx: OpeningScoreChart', 'TerminationChart.tsx: TerminationChart', 'HabitsTable.tsx: HabitsTable'] },
      { name: 'OPTIONS_COLOR', value: OPTIONS_COLOR, description: 'gd_player_color single-select options (All/White/Black), owned by ColorSelect.', consumers: ['ColorSelect.tsx: ColorSelect'] },
      { name: 'OPTIONS_COLOR_MULTI', value: OPTIONS_COLOR_MULTI, description: 'gd_player_color multi-select options (White/Black, no All sentinel), owned by ColorMultiSelect.', consumers: ['ColorMultiSelect.tsx: ColorMultiSelect'] },
      { name: 'OPTIONS_RESULT', value: OPTIONS_RESULT, description: 'gd_player_result single-select options (All/Win/Loss/Draw), owned by ResultSelect.', consumers: ['ResultSelect.tsx: ResultSelect'] },
      { name: 'OPTIONS_RESULT_MULTI', value: OPTIONS_RESULT_MULTI, description: 'gd_player_result multi-select options (Win/Loss/Draw, no All sentinel), owned by ResultMultiSelect.', consumers: ['ResultMultiSelect.tsx: ResultMultiSelect'] },
      { name: 'OPTIONS_TERMINATION', value: OPTIONS_TERMINATION, description: "Full gd_termination taxonomy — TerminationMultiSelect's default options, overridable per call site.", consumers: ['TerminationMultiSelect.tsx: TerminationMultiSelect'] },
      { name: 'OPTIONS_TIME_CLASS', value: OPTIONS_TIME_CLASS, description: 'gd_time_class select options (All/Blitz/Rapid), owned by TimeClassSelect.', consumers: ['TimeClassSelect.tsx: TimeClassSelect'] },
      { name: 'PLACEHOLDER_TEXT_FILTER', value: PLACEHOLDER_TEXT_FILTER, description: 'Shared placeholder text for the opponent and opening text filters.', consumers: ['GameList.tsx: GameList'] },
      { name: 'WIDTH_COLOR', value: WIDTH_COLOR, description: 'Default width for ColorSelect.', consumers: ['ColorSelect.tsx: ColorSelect'] },
      { name: 'WIDTH_COLOR_GAMES', value: WIDTH_COLOR_GAMES, description: "GameList's own narrower ColorSelect width override, for its tight table-header filter row.", consumers: ['GameList.tsx: GameList'] },
      { name: 'WIDTH_COLOR_MULTI', value: WIDTH_COLOR_MULTI, description: 'Default width for ColorMultiSelect.', consumers: ['ColorMultiSelect.tsx: ColorMultiSelect'] },
      { name: 'WIDTH_DATE_FROM', value: WIDTH_DATE_FROM, description: "Shared width for the 'date from' FilterDateInput, identical across every page it appears on.", consumers: ['GameList.tsx: GameList', 'OpeningScoreChart.tsx: OpeningScoreChart', 'TerminationChart.tsx: TerminationChart', 'graph/page.tsx: GraphContent'] },
      { name: 'WIDTH_ECO', value: WIDTH_ECO, description: 'Width for the gd_eco_code text filter/column.', consumers: ['GameList.tsx: GameList', 'HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_GAME_SORT', value: WIDTH_GAME_SORT, description: "Width for the Openings page's nested game-list Sort (date/moves) dropdown.", consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'WIDTH_GRAPH_LIMIT', value: WIDTH_GRAPH_LIMIT, description: "Width for the Rating Graph page's Records limit dropdown.", consumers: ['graph/page.tsx: GraphContent'] },
      { name: 'WIDTH_HABITS_OPENING', value: WIDTH_HABITS_OPENING, description: "Width for the Habits table's Opening column (name, from the latest game that reached that position) — matches GameList's own WIDTH_OPENING.", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_MIN_GAMES', value: WIDTH_MIN_GAMES, description: "Width for the Openings page's Min games threshold dropdown.", consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'WIDTH_MIN_MOVE', value: WIDTH_MIN_MOVE, description: "Width for the Habits table's minimum-move-number filter.", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_MIN_REACHED', value: WIDTH_MIN_REACHED, description: "Width for the Habits table's minimum-reached-count filter.", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_OPENING', value: WIDTH_OPENING, description: 'Width for the gd_opening_name text filter.', consumers: ['GameList.tsx: GameList'] },
      { name: 'WIDTH_OPPONENT', value: WIDTH_OPPONENT, description: 'Width for the gd_opponent_username text filter.', consumers: ['GameList.tsx: GameList'] },
      { name: 'WIDTH_OPPONENT_RATING', value: WIDTH_OPPONENT_RATING, description: 'Shared width for the gd_opponent_rating FilterNumberRange, identical in both places it appears.', consumers: ['GameList.tsx: GameList', 'OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'WIDTH_GAME_NUMBER', value: WIDTH_GAME_NUMBER, description: "Width for the Games table's gd_gdid exact-match filter input.", consumers: ['GameList.tsx: GameList'] },
      { name: 'WIDTH_PLAYER', value: WIDTH_PLAYER, description: 'Default dropdown width for FilterPlayerSelect, shared by every page it appears on.', consumers: ['FilterPlayerSelect.tsx: FilterPlayerSelect'] },
      { name: 'WIDTH_POSITION_COLOR', value: WIDTH_POSITION_COLOR, description: "Width for the Habits table's pos_color filter (distinct from gd_player_color's ColorSelect — a different DD column with a different value domain, 'w'/'b' vs 'white'/'black').", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_QUALITY', value: WIDTH_QUALITY, description: "Width for the Habits table's Bad/Good quality filter.", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_RESULT', value: WIDTH_RESULT, description: 'Default width for ResultSelect.', consumers: ['ResultSelect.tsx: ResultSelect'] },
      { name: 'WIDTH_RESULTS_COUNT', value: WIDTH_RESULTS_COUNT, description: "Width for the Openings page's Show results-count dropdown.", consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'WIDTH_RESULT_MULTI', value: WIDTH_RESULT_MULTI, description: 'Default width for ResultMultiSelect.', consumers: ['ResultMultiSelect.tsx: ResultMultiSelect'] },
      { name: 'WIDTH_SORT_BY', value: WIDTH_SORT_BY, description: "Width for the Habits table's sort-by dropdown.", consumers: ['HabitsTable.tsx: HabitsTable'] },
      { name: 'WIDTH_SORT_DIRECTION', value: WIDTH_SORT_DIRECTION, description: "Width for the Openings page's Best/Worst sort-direction dropdown.", consumers: ['OpeningScoreChart.tsx: OpeningScoreChart'] },
      { name: 'WIDTH_TERMINATION', value: WIDTH_TERMINATION, description: 'Default width for TerminationMultiSelect.', consumers: ['TerminationMultiSelect.tsx: TerminationMultiSelect'] },
      { name: 'WIDTH_TIME_CLASS', value: WIDTH_TIME_CLASS, description: 'Default width for TimeClassSelect.', consumers: ['TimeClassSelect.tsx: TimeClassSelect'] },
      { name: 'WIDTH_TIME_CLASS_GAMES', value: WIDTH_TIME_CLASS_GAMES, description: "GameList's own narrower TimeClassSelect width override, for its tight table-header filter row.", consumers: ['GameList.tsx: GameList'] }
    ]
  },
  {
    heading: 'Analysis Pipeline Thresholds',
    entries: [
      { name: 'MIN_ANALYSIS_MOVE', value: MIN_ANALYSIS_MOVE, description: "Positions before this move number are opening theory and are never tracked, displayed, or quizzed anywhere in the app. Single source of truth for every 'skip the opening' check.", consumers: ['HabitsTable.tsx: HabitsTable', 'buildHabits.ts: buildHabits', 'habits/page.tsx: HabitsContent', 'buildPositionTree.ts: buildPositionTree', 'pipelineStatus.ts: refreshHabitsStatus', 'owner/pipelinegames/page.tsx (module scope)', 'deconstruct.ts (module scope)'] },
      { name: 'MOVE_COUNT_MIN_MOVE', value: MOVE_COUNT_MIN_MOVE, description: "The Analyze page's ×N move-play-count badge/check only applies from this move number onward. Deliberately separate from MIN_ANALYSIS_MOVE.", consumers: ['ChessBoardView.tsx: ChessBoardView'] },
      { name: 'MAX_ANALYSIS_MOVE', value: MAX_ANALYSIS_MOVE, description: "Positions past this move number are almost never revisited (data-verified: 0% of positions past move 18 have been reached more than 3 times). Single source of truth for the 'stop tracking, it won't repeat' ceiling.", consumers: ['buildPositionTree.ts: buildPositionTree'] },
      { name: 'PURGE_REACH_GRACE_DAYS', value: PURGE_REACH_GRACE_DAYS, description: 'A low-reach position is only eligible for pruning once every one of its occurrences is at least this many days old, so a newly-tried opening is never purged before it gets a fair chance to repeat.', consumers: ['purgePositions.ts: purgeStaleReachOnePositions', 'pipelineStatus.ts: refreshPurgeStatus', 'owner/pipelinegames/page.tsx (module scope)'] },
      { name: 'MIN_REACH_TO_KEEP', value: MIN_REACH_TO_KEEP, description: 'Positions reached by this many games or fewer are candidates for purging (once PURGE_REACH_GRACE_DAYS also passes).', consumers: ['enrichPositionsStockfish.ts: countRemainingPositions, getResultingFensToEvaluate, enrichPositionsStockfish', 'purgePositions.ts: purgeStaleReachOnePositions', 'pipelineStatus.ts: refreshStep4, refreshCpChangeStatus, refreshPurgeStatus', 'owner/pipelinegames/page.tsx (module scope)'] },
      { name: 'HABITS_MIN_REACH_FLOOR', value: HABITS_MIN_REACH_FLOOR, description: "Loosest reach threshold baked into buildHabits' aggregation HAVING clause, matching the lowest option in the Habits page's Min Reached dropdown.", consumers: ['buildHabits.ts: buildHabits', 'pipelineStatus.ts: refreshHabitsStatus', 'owner/pipelinegames/page.tsx (module scope)'] },
      { name: 'HABITS_MOVE_CP_CLAMP', value: HABITS_MOVE_CP_CLAMP, description: "Max magnitude buildHabits() will store in hab_move_cp — clamped since mate scores normalize to ±10000, which can exceed thab_habits.hab_move_cp's numeric(6,2) precision.", consumers: ['buildHabits.ts: buildHabits'] },
      { name: 'RESULT_MISMATCH_CP_THRESHOLD', value: RESULT_MISMATCH_CP_THRESHOLD, description: "How decisive gd_final_eval must be, in either direction, before a game's recorded result is flagged as contradicting its final position.", consumers: ['chessdb.ts: fetchGamesForPosition'] },
      { name: 'POPULAR_POSITION_DEPTH_TIERS', value: POPULAR_POSITION_DEPTH_TIERS, description: "The Deepen Popular Positions pipeline step's reach-to-depth table — a position qualifies for the first (highest) tier its pos_reached meets or exceeds.", consumers: ['enrichPositionsStockfish.ts: popularPositionTierSql'] }
    ]
  },
  {
    heading: 'Batch / Pagination / Concurrency',
    entries: [
      { name: 'DEFAULT_BATCH_SIZE', value: DEFAULT_BATCH_SIZE, description: 'Standing default batch size for per-run limits (Build Game Positions, Evaluate Positions, Evaluate Game Endings) — also the fallback each route uses when no explicit limit query param is supplied, which is what the unattended cron relies on.', consumers: ['enrichPositionsStockfish.ts: deepenPopularPositions, evaluateGameEndings', 'owner/pipelinegames/page.tsx: PipelinePage', 'api/analysis/build-tree/route.ts: GET', 'api/analysis/evaluate-positions/route.ts: GET', 'api/analysis/evaluate-game-endings/route.ts: GET'] },
      { name: 'CRON_DEEPEN_POPULAR_BATCH_SIZE', value: CRON_DEEPEN_POPULAR_BATCH_SIZE, description: "Batch size for the Deepen Popular Positions step, distinct from DEFAULT_BATCH_SIZE since it's a genuinely different value (100 vs 200) — used as the route's fallback default, which is what the unattended cron relies on.", consumers: ['api/analysis/deepen-popular-positions/route.ts: GET'] },
      { name: 'POSITION_INSERT_CHUNK_SIZE', value: POSITION_INSERT_CHUNK_SIZE, description: 'Target rows per bulk INSERT (tgam_game_positions, thab_habits) — keeps query params well under the Postgres per-statement limit.', consumers: ['enrichPositionsStockfish.ts: evaluateGameEndings', 'buildPositionTree.ts: insertGamePositions', 'buildHabits.ts: buildHabits'] },
      { name: 'GAMES_ITEMS_PER_PAGE', value: GAMES_ITEMS_PER_PAGE, description: 'Page size for the games-list server action.', consumers: ['games.ts: fetchFilteredGames, getGamesPageCount'] },
      { name: 'GAME_LIST_ROWS_DEFAULT', value: GAME_LIST_ROWS_DEFAULT, description: 'Default rows-per-page for the GameList UI component.', consumers: ['GameList.tsx: GameList'] },
      { name: 'PIPELINE_LOG_ROWS_PER_PAGE', value: PIPELINE_LOG_ROWS_PER_PAGE, description: 'Page size for the /owner/pipelinelog viewer.', consumers: ['PipelineLogTable.tsx: fetchdata'] },
      { name: 'HABITS_ITEMS_PER_PAGE', value: HABITS_ITEMS_PER_PAGE, description: 'Default rows-per-page for the /habits table.', consumers: ['habits/page.tsx: HabitsContent'] },
      { name: 'HABITS_ROWS_OPTIONS', value: HABITS_ROWS_OPTIONS, description: 'Rows-per-page dropdown options for the /habits table.', consumers: ['habits/page.tsx: HabitsContent'] },
      { name: 'POSITION_GAMES_ROWS_DEFAULT', value: POSITION_GAMES_ROWS_DEFAULT, description: "Default rows-per-page for the Analyze page's Games Played panel.", consumers: ['ChessBoardView.tsx: ChessBoardView'] },
      { name: 'POSITION_GAMES_ROWS_OPTIONS', value: POSITION_GAMES_ROWS_OPTIONS, description: "Rows-per-page dropdown options for the Analyze page's Games Played panel.", consumers: ['ChessBoardView.tsx: ChessBoardView'] },
      { name: 'GAME_ENDINGS_CONCURRENCY', value: GAME_ENDINGS_CONCURRENCY, description: "Number of concurrent Stockfish processes used by evaluateGameEndings for games whose final position isn't already tracked (native binary path only).", consumers: ['enrichPositionsStockfish.ts: evaluateGameEndings'] },
      { name: 'PIPELINE_CRON_SCHEDULE', value: PIPELINE_CRON_SCHEDULE, description: "Human-readable display time for each pipeline step's scheduled cron run, keyed by step number — must be kept in sync by hand with vercel.json's actual cron expressions, which are static JSON and can't import this constant.", consumers: ['owner/pipelinegames/page.tsx: PipelinePage'] }
    ]
  },
  {
    heading: 'FIDE Ratings',
    entries: [
      { name: 'FIDE_TOP_RATING_CUTOFF', value: FIDE_TOP_RATING_CUTOFF, description: 'Minimum active-player FIDE standard rating for the Populate FIDE Top Players pipeline step to include a player.', consumers: ['fidePipeline.ts: populateFideTopPlayers'] },
      { name: 'FIDE_STANDARD_RATING_LIST_URL', value: FIDE_STANDARD_RATING_LIST_URL, description: "FIDE's monthly bulk download of the standard rating list (zipped XML) — the data source for the Download FIDE Zip pipeline step.", consumers: ['fideStaging.ts: downloadFideZip'] },
      { name: 'FIDE_XML_CHUNK_SIZE', value: FIDE_XML_CHUNK_SIZE, description: 'Characters per row when staging the decompressed FIDE XML into tfxm_fide_xml — keeps both the write (Unzip) and read (Parse) side bounded to roughly one chunk in memory, instead of holding the whole ~158MB file at once.', consumers: ['fideStaging.ts: unzipFideZip'] },
      { name: 'FIDE_XML_READ_BATCH_CHUNKS', value: FIDE_XML_READ_BATCH_CHUNKS, description: 'Number of tfxm_fide_xml chunk-rows read per SELECT during Parse FIDE XML — batches the read instead of one giant query returning every chunk at once.', consumers: ['fideStaging.ts: parseFideXml'] }
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
      { name: 'STOCKFISH_DEPTH', value: STOCKFISH_DEPTH, description: 'Default Stockfish search depth for move analysis — also the fallback each route uses when no explicit depth query param is supplied, which is what the unattended cron relies on, the Owner Pipeline UI\'s initial Depth field value, and the minimum value /analyze\'s two Depth number inputs will accept (never let a manual analysis go shallower than what the automated pipeline already guarantees for every position).', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS', 'api/analysis/evaluate-positions/route.ts: GET', 'api/analysis/evaluate-game-endings/route.ts: GET', 'owner/pipelinegames/page.tsx: PipelinePage', 'DepthInput.tsx: DepthInput'] },
      { name: 'STOCKFISH_REANALYZE_DEFAULT_DEPTH', value: STOCKFISH_REANALYZE_DEFAULT_DEPTH, description: "Initial value of /analyze's Game Analysis \"Depth\" number input, unlike STOCKFISH_DEPTH (16) which is a different default entirely.", consumers: ['stockfish.ts: STOCKFISH_DEFAULTS', 'analyze/page.tsx: AnalyzeContent'] },
      { name: 'STOCKFISH_BLUNDER_CP', value: STOCKFISH_BLUNDER_CP, description: 'CP-loss threshold above which a move is classified a blunder.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_MISTAKE_CP', value: STOCKFISH_MISTAKE_CP, description: 'CP-loss threshold above which a move is classified a mistake.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_INACCURACY_CP', value: STOCKFISH_INACCURACY_CP, description: 'CP-loss threshold above which a move is classified an inaccuracy.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_HASH', value: STOCKFISH_HASH, description: 'Stockfish engine hash table size (MB).', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_BESTLINE_LENGTH', value: STOCKFISH_BESTLINE_LENGTH, description: "Max number of moves shown in the engine's best-line suggestion.", consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_DEEP_ANALYSIS_DEPTH', value: STOCKFISH_DEEP_ANALYSIS_DEPTH, description: 'Search depth used for deep analysis mode.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_DEEP_ANALYSIS_MULTIPV', value: STOCKFISH_DEEP_ANALYSIS_MULTIPV, description: 'Number of candidate lines (MultiPV) shown in deep analysis mode.', consumers: ['stockfish.ts: STOCKFISH_DEFAULTS'] },
      { name: 'STOCKFISH_DEPTH_INPUT_MAX', value: STOCKFISH_DEPTH_INPUT_MAX, description: "Maximum value accepted by /analyze's Depth number inputs (Game Analysis and Stockfish panels) — typed values above this clamp down to it.", consumers: ['DepthInput.tsx: DepthInput'] }
    ]
  },
  {
    heading: 'UI Display',
    entries: [
      { name: 'VALUE_DISPLAY_MAX_LENGTH', value: VALUE_DISPLAY_MAX_LENGTH, description: "Value strings longer than this (or any object/array) render behind this page's Show popover button instead of inline.", consumers: ['ConstantsViewer.tsx: renderValue'] },
      { name: 'HABITS_BOARD_SIZE_PX', value: HABITS_BOARD_SIZE_PX, description: "Default width/height for MiniBoard, used by the Habits table.", consumers: ['MiniBoard.tsx: MiniBoard'] },
      { name: 'POSITION_BOARD_SIZE_PX', value: POSITION_BOARD_SIZE_PX, description: "Width/height of the main chessboard on the /position/[id] page.", consumers: ['PositionDetail.tsx: PositionDetail'] }
    ]
  },
  {
    heading: 'Session Storage',
    entries: [
      { name: 'SESSION_STORAGE_PREFIX', value: SESSION_STORAGE_PREFIX, description: "Project sub-prefix for browser sessionStorage keys — starts with nextjs-shared's umbrella 'rs7_' prefix so these keys are picked up automatically by the Owner page's Session Storage tab (OwnerTableSessionStorage).", consumers: ['GameList.tsx: GameList', 'TerminationChart.tsx: TerminationChart', 'graph/page.tsx (module scope)', 'habits/page.tsx (module scope)', 'OpeningScoreChart.tsx: OpeningScoreChart'] }
    ]
  },
  {
    heading: 'Masters Explorer (Lichess)',
    entries: [
      { name: 'MASTERS_EXPLORER_MOVES_LIMIT', value: MASTERS_EXPLORER_MOVES_LIMIT, description: "Max number of per-move rows requested from the Lichess Masters Opening Explorer — matches the API's own default.", consumers: ['lichess.ts: getMastersExplorer'] }
    ]
  }
]

//----------------------------------------------------------------------------------
//  FUNCTION_DESCRIPTIONS — one-line description per function/module-scope reference shown in
//  the Functions tab, keyed by the exact resolved reference string buildFunctionIndex produces.
//  Add an entry here whenever a new consumers reference is introduced above.
//----------------------------------------------------------------------------------
const FUNCTION_DESCRIPTIONS: Record<string, string> = {
  'sync.ts: syncArchive': 'Downloads one chess.com monthly archive and inserts new games into tgr_gamesraw, skipping already-synced ones.',
  'players.ts: updatePlayerRating': "Saves each player's latest rating per time class into tplr_player_ratings from their most recent deconstructed game.",
  'deconstruct.ts: getUndeconstructedCount': 'Counts raw games in tgr_gamesraw not yet deconstructed into tgd_gamesdecon for a player.',
  'deconstruct.ts: deconstructGames': 'Parses raw chess.com games into structured rows in tgd_gamesdecon, extracting opening, result, ratings, and termination.',
  'players.ts: getPlayers': 'Returns all registered players (player, display name) ordered alphabetically, default player pinned first.',
  'graph/page.tsx: GraphContent': 'Rating Graph page content — player/date/time-class filters driving the RatingChart, with sessionStorage-persisted filter state.',
  'GameList.tsx: GameList': 'Paginated, filterable table of deconstructed games with drill-down into an individual game for analysis.',
  'OpeningScoreChart.tsx: OpeningScoreChart': 'Bar chart of win-rate by opening (ECO/name), with drill-down into the games behind a selected bar.',
  'TerminationChart.tsx: TerminationChart': 'Stacked bar chart of win/loss counts by game termination type, filterable by colour and date.',
  'games.ts: getTerminationStats': 'Aggregates win/loss/total counts per termination type for a set of players from tgd_gamesdecon.',
  'HabitsTable.tsx: HabitsTable': 'Filterable table of recurring move habits (good/bad) with mini boards, stats, and dismiss/restore controls.',
  'MiniBoard.tsx: MiniBoard': 'Renders one small read-only chessboard (configurable size, defaults to the Habits table\'s size), memoized to avoid react-chessboard\'s animation-loop bug.',
  'PositionDetail.tsx: PositionDetail': 'Full detail view for one tracked position — board, per-move stats, evaluation, and the games that reached it.',
  'buildHabits.ts: buildHabits': 'Full recompute of recurring move habits per (player, position, move) into thab_habits, preserving dismissed flags.',
  'habits/page.tsx: HabitsContent': "Habits page content — paginated, filterable table of a player's recurring good/bad moves sourced from thab_habits.",
  'buildPositionTree.ts: buildPositionTree': 'Replays new games with chess.js to record per-move positions into tgam_game_positions, then syncs tpos_positions.',
  'pipelineStatus.ts: refreshHabitsStatus': 'Total/dismissed/remaining row counts for thab_habits, where remaining is genuinely new (player, position, move) combinations.',
  'owner/pipelinegames/page.tsx (module scope)': 'Client component module for the Owner Pipeline page — imports pipeline actions/status functions and defines job-group/SQL display constants used by PipelinePage.',
  'deconstruct.ts (module scope)': 'Server actions module that deconstructs raw chess.com games into tgd_gamesdecon and upserts ECO code/opening-name references.',
  'ChessBoardView.tsx: ChessBoardView': 'Interactive game analysis board — move tree, Stockfish batch/position analysis, and position-history panels for one game.',
  'DepthInput.tsx: DepthInput': "Shared Depth number input for /analyze's Game Analysis and Stockfish panels — types freely, clamps to min/max only on blur.",
  'purgePositions.ts: purgeStaleReachOnePositions': 'Deletes stale low-reach positions (and dependent rows) once every occurrence is past the grace period.',
  'pipelineStatus.ts: refreshPurgeStatus': 'Counts positions currently eligible for purgeStaleReachOnePositions, mirroring its own eligibility criteria.',
  'enrichPositionsStockfish.ts: countRemainingPositions': 'Counts tpos_positions rows above the reach floor that still lack a tpose_positions_eval row.',
  'enrichPositionsStockfish.ts: getResultingFensToEvaluate': 'Fetches resulting positions from tgam_game_positions still missing a Stockfish evaluation.',
  'enrichPositionsStockfish.ts: enrichPositionsStockfish': 'Batch-evaluates unevaluated positions with Stockfish and writes centipawn scores/best moves into tpose_positions_eval.',
  'pipelineStatus.ts: refreshStep4': 'Counts evaluated positions and remaining unevaluated positions above the reach floor for the Evaluate Positions step.',
  'pipelineStatus.ts: refreshCpChangeStatus': 'Counts tgam_game_positions rows still pending a computed centipawn-change value.',
  'chessdb.ts: fetchGamesForPosition': "Fetches one page of a player's games that reached a given position, optionally narrowed to a given move, with result-mismatch flags.",
  'chessdb.ts: getGamesForPositionCount': "Total row count for fetchGamesForPosition's same filter set, for pagination.",
  'enrichPositionsStockfish.ts: popularPositionTierSql': 'Builds the shared SQL CASE/threshold for popular-position depth tiers, kept in sync with the constant.',
  'enrichPositionsStockfish.ts: deepenPopularPositions': 'Re-evaluates already-evaluated popular positions at a deeper Stockfish depth per their reach tier.',
  'enrichPositionsStockfish.ts: evaluateGameEndings': "Evaluates each game's true final position with Stockfish (reusing tree evals where possible) into tgd_gamesdecon.gd_final_eval.",
  'owner/pipelinegames/page.tsx: PipelinePage': 'Owner Pipeline page — runs and monitors every analysis pipeline step (sync, tree build, purge, evaluate, habits, etc.).',
  'api/analysis/build-tree/route.ts: GET': 'API route that runs buildPositionTree for a batch of games and returns the result as JSON.',
  'api/analysis/evaluate-positions/route.ts: GET': 'API route that runs enrichPositionsStockfish for a batch of positions and returns the result as JSON.',
  'api/analysis/evaluate-game-endings/route.ts: GET': 'API route that runs evaluateGameEndings for a batch of games and returns the result as JSON.',
  'api/analysis/deepen-popular-positions/route.ts: GET': 'API route that runs deepenPopularPositions for a batch of positions and returns the result as JSON.',
  'buildPositionTree.ts: insertGamePositions': 'Bulk-inserts parsed per-move position records into tgam_game_positions, chunked without splitting a game across chunks.',
  'games.ts: fetchFilteredGames': 'Fetches a filtered, paginated page of deconstructed games from tgd_gamesdecon.',
  'games.ts: getGamesPageCount': "Returns total page count for fetchFilteredGames' same filter set, for pagination.",
  'PipelineLogTable.tsx: fetchdata': 'Fetches a filtered, paginated page of tpip_pipelinelog rows plus total page count for the log table.',
  'AppShell.tsx: loadAll': 'Loads all players plus their profile and rating data to populate the shared PlayerProfile header cards.',
  'DeconstructButton.tsx: handleCheckCounts': 'Fetches and displays remaining vs. already-deconstructed game counts for a player.',
  'DeconstructButton.tsx: handlePopulate': 'Runs deconstructGames for a player at the selected batch size and refreshes the counts/result display.',
  'stockfish.ts: STOCKFISH_DEFAULTS': 'Groups Stockfish tuning constants (depth, blunder/mistake/inaccuracy thresholds, hash, line length) into one default object.',
  'ConstantsViewer.tsx: renderValue': "Renders a constant's value inline, or behind a Show popover if it's an object or exceeds the display length limit.",
  'nextjs-shared/src/tables/db.ts': 'Defines and lazily initializes the shared Postgres query handler (Neon pool or local Client), used via the exported sql() function.',
  'nextjs-shared/next.config.mjs': 'Next.js config for the nextjs-shared package itself, exposing POSTGRES_URL and POSTGRES_DATABASE_LOCATION as env vars.',
  'lib/sync-games.ts': "Standalone CLI script that connects to Postgres directly and syncs one player's full chess.com game archive into tgr_gamesraw.",
  'lib/deconstruct-games.ts': "Standalone CLI script that connects to Postgres directly and deconstructs a player's blitz raw games into tgd_gamesdecon/tec_ecoreference.",
  'src/app/layout.tsx': 'Root Next.js layout — sets up fonts, metadata, the dev header, and wraps every page in AppShell.',
  'nextjs-shared/src/tables/tableGeneric/write_logging.ts': 'Exports write_logging, which inserts an application log row into xlg_logging (or falls back to console output).',
  'src/app/api/cron/sync/route.ts': 'Cron-triggered API route, auth-checked via CRON_SECRET, that runs runGameSync for all players.',
  'lib/cron-sync.ts': 'Standalone CLI script that calls the local /api/cron/sync endpoint with the CRON_SECRET bearer token.',
  'src/lib/analysis/enrichPositionsStockfish.ts': 'Server actions module implementing the Stockfish engine wrappers and batch position/game-ending evaluation pipeline steps.',
  'FilterPlayerSelect.tsx: FilterPlayerSelect': 'Player picker shared by every page, reading/writing the ?player= URL param.',
  'FilterTimeClassSelect.tsx: FilterTimeClassSelect': 'Time-class picker shared by every page with a Time filter (Games, Graph, Openings, Endings), reading/writing the ?timeClass= URL param — applies instantly, same as player selection.',
  'ColorSelect.tsx: ColorSelect': 'Reusable gd_player_color single-select dropdown (GameList, OpeningScoreChart, TerminationChart).',
  'ColorMultiSelect.tsx: ColorMultiSelect': "Reusable gd_player_color multi-select checkbox group (OpeningScoreChart's nested game table).",
  'TimeClassSelect.tsx: TimeClassSelect': 'Reusable gd_time_class select dropdown, wrapped by FilterTimeClassSelect for the global ?timeClass= filter (Games, Graph, Openings, Endings).',
  'ResultSelect.tsx: ResultSelect': 'Reusable gd_player_result single-select dropdown (GameList).',
  'ResultMultiSelect.tsx: ResultMultiSelect': "Reusable gd_player_result multi-select checkbox group (OpeningScoreChart's nested game table).",
  'TerminationMultiSelect.tsx: TerminationMultiSelect': 'Reusable gd_termination multi-select checkbox group, options overridable per call site (GameList default list, OpeningScoreChart dynamic list).',
  'fideStaging.ts: downloadFideZip': "Downloads FIDE's zipped standard rating list into tfzp_fide_zip (pipeline step 10).",
  'fideStaging.ts: unzipFideZip': 'Decompresses the staged zip and writes chunked XML text into tfxm_fide_xml (pipeline step 11).',
  'fideStaging.ts: parseFideXml': 'Streams tfxm_fide_xml back through a SAX parser into structured rows in tfpl_fide_players (pipeline step 12).',
  'fidePipeline.ts: populateFideTopPlayers': 'Matches/attaches/inserts tmst_master_players rows from the parsed FIDE top-players snapshot (pipeline step 13).',
  'fidePipeline.ts: refreshFideRatings': 'Refreshes mst_grade for every FIDE-linked tmst_master_players row from the parsed FIDE snapshot (pipeline step 14).',
  'masterPlayers.ts: findNextMasterPlayerHandle': "One-player-per-call lookup (highest grade first) of a FIDE-linked player's chess.com handle via chess.com/players/{slug}, matched by embedded FIDE id, not by name."
}

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
        { name: 'CRON_SECRET', value: process.env.CRON_SECRET, description: 'Shared secret required by the cron sync API route for the external Vercel-scheduled trigger.', consumers: ['src/app/api/cron/sync/route.ts'] }
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
    },
    {
      heading: 'Lichess Masters Opening Explorer',
      entries: [
        { name: 'LICHESS_API_TOKEN', value: process.env.LICHESS_API_TOKEN, description: 'Personal Lichess API token (Bearer auth), required since Lichess locked the Opening Explorer behind authentication in March 2026.', consumers: ['lichess.ts: getMastersExplorer'] }
      ]
    }
  ]

  return <ConstantsViewer constantsSections={CONSTANTS_SECTIONS} envSections={envSections} functionDescriptions={FUNCTION_DESCRIPTIONS} />
}
