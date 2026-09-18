# PLAN_moves-played-avg-rating — chess

## Title
Minor UI updates.

## Plan
- [x] Remove the Avg Rating column outright from `MovesListTable`
      (`src/ui/board/MovesListTable.tsx`) — drop the `<th>`, the `<td>`, and the `avgRating` field
      from `MovesListRow`. This removes it from all 5 call sites at once:
  - Moves Played (player) in `ChessBoardView_shared.tsx`
  - Moves Played (master) in `MasterGameView_master.tsx`
  - Master Moves (Lichess) in `ChessBoardView_shared.tsx`
  - Master Moves (Lichess) in `MasterGameView_master.tsx`
  - Master Moves (Our DB) in `MasterMovesDbPanel.tsx`
- [x] Remove the now-unused `avgRating:` field from each of the 5 row-mapping call sites listed
      above (the underlying data fetches — `avg_opponent_rating`/`averageRating`/
      `avgOpponentRating` — are left as-is; only the row objects passed into `MovesListTable`
      stop including it).

- [x] Add 3 new read-only functions to `src/lib/analysis/chessdb_shared.ts`, placed together:
  - `getFenEvalsFromGev_shared(fens: string[])` — bulk lookup against `tgev_game_evals` by
    `gev_fen_after`. When more than one row shares a FEN (the same position reached in several
    analyzed player games), picks the deepest one via
    `DISTINCT ON (gev_fen_after) ... ORDER BY gev_fen_after, gev_depth DESC`.
  - `getFenEvalsFromMgev_shared(fens: string[])` — identical, against `tmgev_game_evals`
    (secondary database) by `mgev_fen_after`.
  - `getFenEvalsWithFallback_shared(fens: string[], context: 'player' | 'master')` — orchestrator:
    calls `getFenEvalsFromGev_shared` for `context: 'player'` or `getFenEvalsFromMgev_shared` for
    `context: 'master'` first; any FEN still missing falls back to the existing
    `getPositionEvaluationsBulk_shared` (`tpose_positions_eval`). Returns
    `Record<string, { cp: number; depth: number }>`.
  - Purely additive reads — never calls `upgradePositionEvaluation_shared`/`getOrCreatePosition`,
    so no new `tpos_positions` row is ever created and the reach-based purge
    (`purgeStaleReachOnePositions`) is untouched.

- [x] Wire it into **Master Moves (Our DB)** (`getMasterGamesForFen` in
      `src/lib/master/masterGamesList.ts`):
  - Add `mgam_resulting_fen` to the existing games query's `SELECT` list (column already exists;
    used the same way by `getMoveSummaryForPosition_master`).
  - Track one `resulting_fen` per move in the existing `byMove` grouping loop.
  - After building `moves`, call `getFenEvalsWithFallback_shared(fens, 'master')` with the
    collected resulting FENs and merge `cp`/`depth` onto each row.
  - Add `cp: number | null` / `depth: number | null` to `MasterFenMoveBreakdown` (bare names,
    matching `GameEvalRow`'s precedent for an already-merged per-position value).
  - `MasterMovesDbPanel.tsx` passes the real `cp` through to `MovesListTable`'s `eval` field
    instead of hardcoding `null`.

- [x] Wire it into **Master Moves (Lichess)** (both call sites):
  - Add a small helper — `applyUciMove(fen: string, uci: string): string | null` — in
    `src/lib/fen.ts`, using `chess.js` to compute the resulting FEN for a Lichess move's `uci`
    (mirrors the `new Chess(fen)` pattern already used elsewhere in these two files).
  - In `ChessBoardView_shared.tsx` (`context: 'player'`) and `MasterGameView_master.tsx`
    (`context: 'master'`), once `mastersData` loads, compute each move's resulting FEN from
    `currentNode.fen` + `m.uci`, call `getFenEvalsWithFallback_shared` with the matching context,
    and merge the result into `eval:` instead of hardcoding `null`.

- [x] Leave **Moves Played** (both variants) unchanged — still `tpose_positions_eval`-only, same
      order as the existing "Analyze Game" per-ply display (`getGameEvals_player`/
      `getMasterGameEvals_master`, which check `tpose` first). Switching Moves Played to the new
      gev/mgev-first order would make it disagree with the Game Analysis panel for the same
      position, for no benefit — out of scope here.

- [x] Add a new shared client module, `src/lib/analysis/evalSessionCache.ts` — a module-level
      `Map<string, { cp: number; depth: number }>` keyed by truncated FEN, with
      `getCachedEval(fen)`/`setCachedEval(fen, value)` accessors. Plain in-memory singleton, not
      `sessionStorage`, not the DB — persists for the life of the browser tab (survives client-side
      route navigation between pages, since the module stays loaded) and is gone on refresh/close.
      Never written to by anything except the hook below.
- [x] Add a new shared client hook, `useMissingEvalAnalysis` (`src/ui/board/`), used identically by
      all 3 panels that can still show a row with no eval after the DB lookup above:
  - Input: the panel's current rows (`{ key, fen }[]`) — recomputed whenever the panel's move
    list/FEN changes. A row counts as "missing" only if it has no DB-sourced eval AND no hit in
    `evalSessionCache`.
  - Manages its own `StockfishEngine` instance (`useRef`, lazily initialized — mirrors the existing
    "Analyze Position" pattern in `ChessBoardView_shared.tsx`'s `startDeepAnalysis`).
  - `analyzeMissing()` runs single-line analysis (`numLines: 1`) at
    `STOCKFISH_DEFAULTS.deepAnalysisDepth` sequentially, one missing FEN at a time (one worker, one
    job at a time). Each completed result is written to `evalSessionCache` via `setCachedEval` (so
    it survives navigating away and back) and merged into the hook's own `overrides` state (so the
    current view updates immediately without waiting for a remount).
  - Exposes `overrides: Record<string, { cp: number; depth: number }>` (session-cache hits already
    folded in for the current rows), `analyzing: boolean`,
    `progress: { done: number; total: number } | null`, and `analyzeMissing()`.
  - **Never calls `persistAnalysisLines`/`upgradePositionEvaluation_shared`** — no DB write, so this
    still can't create a `tpos_positions` row or interact with the purge, per Follow-up 1's finding.
- [x] Wire the hook into all 3 panels — each renders a single batch `MyButton` ("Analyze missing
      (N)"), hidden when N = 0, disabled and showing progress while running, merging `overrides`
      onto the row's `eval` field (taking precedence over a `null` DB-sourced value) before passing
      rows to `MovesListTable`:
  - Master Moves (Lichess) in `ChessBoardView_shared.tsx`
  - Master Moves (Lichess) in `MasterGameView_master.tsx`
  - Master Moves (Our DB) in `MasterMovesDbPanel.tsx` (gets its own `StockfishEngine` instance,
    consistent with this component's existing "fully self-contained" design)

- [x] Bug fix: "Analyze Game" and "Analyze Position" share one `StockfishEngine`/Worker instance
      (`engineRef`) with no mutual exclusion, so clicking one while the other is mid-flight leaves
      two message listeners on the same worker fighting over each other's `info`/`bestmove` lines —
      the awaited promise never resolves, so `analyzing`/`deepAnalyzing` gets stuck true forever
      with nothing actually happening. Fix, in both `ChessBoardView_shared.tsx` and
      `MasterGameView_master.tsx`:
  - Add an optional `disableRun?: boolean` prop to `GameAnalysisPanel_shared` — when true, the
    "Analyze Game"/"Re-analyse" button is disabled and shows a small hint ("Stockfish busy —
    finish or stop the current analysis first."). Callers pass `disableRun={deepAnalyzing}`.
  - Add `disabled={analyzing}` to the "Analyze Position" button (Stockfish panel).
  - Add `disabled={analyzing || deepAnalyzing || <panel's own analyzing>}` to the "Analyze missing"
    button on each file's Master Moves (Lichess) panel (same engine-sharing risk doesn't actually
    apply here — `useMissingEvalAnalysis` owns its own separate engine — but kept mutually
    exclusive anyway to avoid 3 Stockfish workers running at once for no benefit).
  - **Not touching `MasterMovesDbPanel.tsx`'s "Analyze missing" button** — it's a genuinely
    separate, self-contained component with its own independent engine instance, not `engineRef`,
    so it isn't part of this race at all; adding `analyzing`/`deepAnalyzing` props to it would mean
    threading new props into an otherwise fully self-contained component for no correctness
    benefit.
  - Not disabling the Depth/Lines number inputs (part of the original chat proposal) — discovered
    `nextjs-shared`'s `MyInputNumeric` has no `disabled` prop at all, so doing this properly would
    need a `nextjs-shared` amendment (out of scope for this project's session, per project
    isolation) for a control that isn't actually the source of the race anyway (changing a number
    doesn't trigger an engine call by itself).

- [x] Bug fix: "Analyze Game"/"Re-analyse" only persisted `tgev_game_evals`/`tmgev_game_evals` once,
      at the very end of the whole run (`saveGameEvaluations_player`/`saveMasterGameEvaluations_master`
      — delete all existing rows for the game, then bulk-insert the full merged array). A refresh or
      interruption partway through lost every ply computed that run — not just the in-flight one.
      Replaced with per-ply incremental upserts:
  - `games.ts`: removed `saveGameEvaluations_player`; added `upsertGameEval_player(gdid, ply, e)` —
    single-row `INSERT ... ON CONFLICT (gev_gdid, gev_ply) DO UPDATE ... WHERE gev_depth <
    EXCLUDED.gev_depth`.
  - `masterGamesList.ts`: removed `saveMasterGameEvaluations_master`; added
    `upsertGameEval_master(mgdid, ply, e)` — same shape against `tmgev_game_evals`, plus a one-row
    `tpose_positions_eval` top-up for that ply's own resulting position (`createIfMissing: false`),
    preserving what the old function's trailing per-row loop did, just scoped to the one row
    actually being written instead of re-running it over the whole game on every save.
  - `ChessBoardView_shared.tsx`/`MasterGameView_master.tsx`'s `runAnalysis`: call the new upsert
    function inside `onPlyEvaluated` (fire-and-forget, alongside the existing per-ply
    `upgradePositionEvaluation_shared` pose top-up), and removed the old bulk save call at the end
    of the run entirely (now redundant/superseded).
  - `MasterGameView_master.tsx`'s `persistAnalysisLines_master` (the single-ply "Analyze Position"
    write-back) switched from resaving the whole `mergedPlyEvals` array to a single
    `upsertGameEval_master` call — a pre-existing inefficiency (rewriting the entire game's row set
    to change one row) fixed as a side effect of building the new function, since it was the last
    remaining caller of the old whole-array save.
  - **Discovered and dropped, flagging in case it was relied on for a reason not obvious from the
    code:** the old `saveMasterGameEvaluations_master` re-ran a `tpose_positions_eval` top-up for
    *every* row in the whole merged array on every single save — appears fully redundant with
    `runAnalysis`'s own existing per-ply pose upgrade (every ply's resulting position is already
    covered either by being the next ply's "before" position, or by the explicit final-position
    upgrade), and `persistAnalysisLines_master` already does its own explicit pose upgrades for the
    positions it actually touches. The new `upsertGameEval_master` only tops up pose for the one row
    it's actually writing.

- [x] Feature: added a Stop button to "Analyze Game"/"Re-analyse", so a long run can be cut short
      once the user is happy with the progress so far — paired with the incremental-persistence fix
      above, so nothing already completed is lost by stopping. Per explicit decision, the ply that
      was still in flight when Stop is pressed is simply discarded, not salvaged (no need to track
      the actual depth reached by an interrupted search).
  - `stockfish.ts`: added `StockfishEngine.requestStop()` — unconditionally sends UCI `stop`
    (`stopAnalysis()` only fires for an active `startInfiniteAnalysis` search, so left untouched).
  - `stockfish.ts`: `analyzeGame()` takes a new optional `shouldStop?: () => boolean`, checked right
    after each position's own evaluation resolves; if true, that position's result is discarded and
    the loop stops immediately. Returns a new `stopped: boolean` alongside `plyEvals`/
    `finalPosition`. `finalPosition` is now always derived from the last completed ply (`plyEvals`)
    instead of the previously-assumed full range endpoint — correct whether the run completed
    normally or was stopped early (matches the range endpoint exactly in the normal case).
  - `ChessBoardView_shared.tsx`/`MasterGameView_master.tsx`: added a `stopRequestedRef`, a
    `stopRunAnalysis()` function (sets the ref, calls `engine.requestStop()`), and pass
    `() => stopRequestedRef.current` into `analyzeGame()`. Result message becomes "Stopped —
    updated N plies" when `stopped` is true.
  - `GameAnalysisPanel_shared.tsx`: added an `onStopAnalysis` prop and a Stop button next to the
    progress bar (previously had no way to stop at all once a run started).

- [x] **Relabel the panel groups** on both `ChessBoardView_shared.tsx` (`/analyze`) and
      `MasterGameView_master.tsx` (`/analyzemaster`).
  - `/analyze`: Group 1 (Moves Played + Games Played) — added group label **"Players"**; panels
    renamed **"Moves"** / **"Games"**.
  - Both pages: Group 2 (Master Moves/Games (Our DB), was "From our own synced master games") —
    label becomes **"All Masters"**; panels renamed **"Moves"** / **"Games"**. "All Masters" was
    chosen over "Chess.com" specifically because masters could in future be loaded from other
    sources besides chess.com — a source-specific label would go stale, a scope-based one stays
    accurate regardless.
  - Both pages: Group 3 (Master Moves/Games (Lichess)) — added group label **"Lichess"**; panels
    renamed **"Moves"** / **"Games"**.
  - **`/analyzemaster`'s Group 1 (the specific master's own Moves/Games, e.g. "Magnus Carlsen")
    was removed entirely, not relabeled** — superseded decision, made after discussion: since
    "All Masters" already includes this same master's games (it has no player filter), showing
    both was judged redundant/overkill for this page specifically. Removed: `moveSummary`/
    `positionGames`/`selectedPositionMove`/pagination state, their 3 fetch effects,
    `refreshPositionPanels_master()` and all 3 call sites, the JSX block, and now-unused imports
    (`getMoveSummaryForPosition_master`, `fetchGamesForPosition_master`,
    `getGamesForPositionCount_master`, `MasterMoveRow`, `MasterPositionGameHit`,
    `MyPaginationFooter`, `POSITION_GAMES_ROWS_DEFAULT`, `POSITION_GAMES_ROWS_OPTIONS`). The
    player page's own Group 1 is unaffected — kept, since the player IS the tracked entity there,
    not redundant with anything.
  - **Outstanding item, not built now:** a master/all filter toggle on the "All Masters" panel,
    master-page only (never on the player page, where "a specific master" has no meaning) — would
    let a future visit narrow "All Masters" down to just the master being viewed, without needing
    a separate always-visible panel. Add to the project's `.claude/CLAUDE.md` Outstanding items.

- [x] **Move the "Chess.com Games" search panel off the analysis pages** and onto its own new tab.
      Discovered while scoping: the panel was position-scoped (`searchChessComGames(fen, filters)`
      searched for games reaching the exact board position) — confirmed decision: dropped the FEN
      filter entirely on the new standalone tab, making it a general Player 1/Player 2/rating/
      year/result search with no position requirement.
  - `src/lib/actions/chesscomSearch.ts`: `searchChessComGames`'s `fen` parameter is now optional
    (`fen?: string`), sent as `''` in the URL params when omitted — mirrors how `opening`/
    `openingId` are already always sent blank.
  - New file `src/ui/games/ChessComSearchPanel_shared.tsx` — self-contained, no props: owns the
    `CHESSCOM_*_OPTIONS` constants, all filter/results state, the master-player-names-for-datalist
    effect, and the search handler/JSX, extracted (minus `fen`) from the identical duplicated code
    previously in both `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`.
  - New file `src/app/masterchesscom/page.tsx` — thin wrapper rendering
    `ChessComSearchPanel_shared` behind a `Suspense` boundary, mirroring `src/app/mastergames/
    page.tsx`'s existing pattern.
  - `src/ui/AppNav.tsx`: added `{ key: 'masterchesscom', label: 'Chess.com', href: '/masterchesscom' }`
    to `MASTER_SECTIONS`, and `pathname === '/masterchesscom' ? 'masterchesscom'` to the
    `activeKey` derivation.
  - Removed the entire Chess.com Games panel — state, constants, effect, handler, and JSX — from
    both `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`, along with imports that
    became unused as a result (`searchChessComGames`, `ChessComSearchGame`,
    `ChessComSearchFilters`, `getMasterPlayerNames`, `MyToggle`, `MyInputNumeric` in both files).

- [x] **Mid-session correction: converted every `.then()/.catch()` chain touched or introduced this
      session to `await`/`try-catch`**, per the project's standing async convention — flagged by
      the user after noticing the pattern creep back into new code. Fire-and-forget calls (writes
      that deliberately don't block the engine loop) are now wrapped in an unawaited async IIFE
      with try/catch instead of `.then()/.catch()`, preserving the same non-blocking, parallel
      timing. Fixed in `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`: the Lichess
      masters-explorer fetch effects (→ inner `async function load()`), `runAnalysis`'s per-ply
      `upgradePositionEvaluation_shared`/`upsertGameEval_player`/`upsertGameEval_master` calls, and
      `persistAnalysisLines`/`persistAnalysisLines_master`'s own-position write-back. Pre-existing
      `.then()/.catch()` usage *not* touched this session (e.g. `getMasterPlayerNames()`,
      `getMovePlayCounts_player`/`_master`) was left alone — out of scope, not introduced or edited
      as part of this plan.

- [x] Bug fix: "Re-analyse" on a master game re-ran Stockfish even for plies already analyzed to
      the same or greater depth. Root cause (confirmed by user testing, not a timing issue): the
      skip-check `runAnalysis` feeds into `analyzeGame()` only ever consulted
      `tpose_positions_eval` — which, per the earlier finding, rarely gets populated for master
      games at all (`createIfMissing: false`) — so it never saw that `tmgev_game_evals` already had
      the ply at sufficient depth.
  - `chessdb_shared.ts`: `getFenEvalsFromGev_shared`/`getFenEvalsFromMgev_shared` now also select
    and return `bestMove` (needed so a skip-hit sourced from `tgev`/`tmgev` still carries a
    recommended move through to the ply record, same as a `tpose` hit already did).
    `getFenEvalsWithFallback_shared`'s return type updated to match (purely additive).
  - `chessdb_shared.ts`: added `getFenEvalsForSkipCheck_shared(fens, context)` — checks both
    `tpose_positions_eval` and the context's own per-game table and keeps whichever has the
    **greater depth** per FEN (a different merge rule than `getFenEvalsWithFallback_shared`, which
    always prefers the own-table value for display — here we only care whether a sufficiently deep
    result exists anywhere).
  - `ChessBoardView_shared.tsx`/`MasterGameView_master.tsx`: `runAnalysis` now calls
    `getFenEvalsForSkipCheck_shared(fens, 'player' | 'master')` instead of
    `getPositionEvaluationsBulk_shared(fens)`, feeding the merged result into `analyzeGame()`.
    Applied symmetrically to both player and master (not just master, which is what was reported)
    since the same narrower lookup existed on both sides. Local variable renamed `poseEvals` →
    `skipCheckEvals` (and `finalPoseEval` → `finalSkipCheckEval`) to reflect that it's no longer
    pose-only data.

- [x] **Progress line format change**: "Analyze Game"/"Re-analyse" progress now leads with the
      absolute move number + side to move ("Move 48w"/"Move 48b"), ahead of the existing "Ply
      X/Y — move" text. Reused `analysisTree.ts`'s existing `getCurrentMoveLabel` formula (moved
      the shared math into a new `getMoveNumberAndColor(ply)` helper, called by both
      `getCurrentMoveLabel` and this) rather than reinventing move-number arithmetic.
      `runAnalysis`'s `onProgress` wrapper computes the *absolute* ply (`sliceStart +
      progress.current`, since progress is otherwise relative to the re-analyze slice) before
      calling `getMoveNumberAndColor`, in both `ChessBoardView_shared.tsx` and
      `MasterGameView_master.tsx`. `GameAnalysisPanel_shared.tsx` renders the new prefix when
      `moveNumber` is present (omitted while still on the anchor/starting position).

- [x] **Bug fix: Player 1/2 dropdown order didn't match its own displayed text.**
      `getMasterPlayerNames()` (`masterPlayers.ts`) queried `ORDER BY mst_last_name,
      mst_first_name` but displays "First Last" — sorted by a value not shown, so the dropdown
      looked unsorted. Changed to `ORDER BY mst_first_name, mst_last_name` to match what's
      actually displayed.

- [x] **Discovered, not fixed here (nextjs-shared, project isolation): `MySelect`'s
      search-and-auto-select can silently submit a stale value.** Confirmed via a live DB query
      that searching "nak" matches both "Hikaru Nakamura" and "Raunak Sadhwani" — `MySelect` only
      auto-selects on an *exactly one* match, so with 2+ matches the underlying `value` state
      never updates, while the native `<select>` visually displays the first filtered option's
      text anyway (browser fallback when the current value isn't among the rendered options) —
      making the wrong player look selected. Reproduced this exact case: Player 2 stayed on a
      stale prior value while displaying "Hikaru Nakamura". Workaround for now: type enough of the
      name to narrow to a unique match. A real fix (e.g. clearing the value when it drops out of
      the filtered list) belongs in a `nextjs-shared` session — not done as part of this plan.

- [x] **`/masterchesscom` width**: added `max-w-4xl` to the page's wrapper — the search form +
      results table looked too wide spanning the full viewport. No existing "search form + table"
      page in this project to mirror; chosen as a reasonable fit for the table's column count.

- [x] **`nextjs-shared` proposal drafted (not applied here — project isolation) for the `MySelect`
      stale-selection bug**, then confirmed already fixed: the reinstalled `nextjs-shared`
      (v2.1.90, commit `327fff29`) already contains exactly the proposed fix — clears the
      selection when the current value drops out of the filtered list, instead of silently
      keeping a stale value while the native `<select>` displays a misleading option.

- [x] **Reported: `/masterchesscom` search for Player 1 "Magnus Carlsen" (Player 2 blank, Year =
      2026) returned unrelated games, not Magnus's.** Resolved — root cause found much later in
      this investigation (see the `nextjs-shared` `MySelect` root-cause entry further below):
  - Confirmed via a live DB query that "Magnus"/"magnus" uniquely matches exactly one master
    (`mst_mstid` 22), so the dropdown's own selection logic isn't at fault here.
  - Reproduced the *exact* filter combination directly against `searchChessComGames`'s own URL
    construction (live `fetch`, not the app) and got back correct Magnus Carlsen games — so
    `chesscomSearch.ts` and chess.com's endpoint both work correctly for this exact query.
  - This means the discrepancy is between what the UI *displays* and what the component actually
    *submits* when "Search chess.com" is clicked — not yet isolated further.
  - Added a visible "Last search: `<url>`" line to `ChessComSearchPanel_shared.tsx`, populated
    from `searchChessComGames`'s existing (previously-discarded) `url` return value, so the next
    reproduction can directly compare the actual submitted URL against the filter controls'
    displayed values.
  - **Actual root cause** (found via extensive debug logging, then confirmed with a live DB query):
    a `nextjs-shared` `MySelect` defect — clicking the first option in a search-narrowed list
    silently failed to register when the current value was blank and got excluded from the
    filtered option list (the browser defaulted the native `<select>` to displaying that option, so
    clicking it produced no DOM change, hence no `onChange`). Fixed upstream in `nextjs-shared`
    `ccf2609`/v2.1.91 (`missingCurrentOption`), picked up via `#reinstall`.

- [x] **Bug fix: `/mastergames`'s Player filter dropdown showed the same master twice.**
      `getSyncedMasterPlayers()` did `SELECT DISTINCT mgd_player`, but `mgd_player` is supposed to
      always be stored lowercase (per `AppNav.tsx`'s own comment) — a case-variant value would
      pass `DISTINCT` as a second row, then resolve to the same display name via the existing
      `.toLowerCase()` lookup, showing as a duplicate. Changed to `SELECT DISTINCT
      LOWER(mgd_player)`, in `src/lib/master/masterGamesList.ts`.

- [x] **Merged all 3 "pick a master player" dropdowns into one component**, after being called out
      for duplicating one that already existed instead of reusing it. Inventory found:
  - `FilterMasterPlayerSelect` — synced masters only, value=handle, "All" option, via
    `FilterSelect`. 1 real call site (`MasterGameList.tsx`).
  - `MasterPlayerSelect` — all known masters, value=handle, "Select a master..." placeholder, via
    `FilterSelect`. **Zero real call sites — dead code**, despite its own header comment claiming
    a "pipeline page" consumer.
  - The new Player 1/2 fields (this session) — all known masters, value=**name** (chess.com's own
    search takes a display name, not a handle), needed search-as-you-type (long list) — which is
    why a raw `MySelect` was reached for instead of either existing component, but the *data*
    (`getMasterPlayerNames()`) duplicated what `getMasterPlayers()` (already used by #2) provides.
  - **Resolution:** merged #1 and #2 into one `MasterPlayerSelect` (`src/ui/filters/
    MasterPlayerSelect.tsx`), parameterized by `scope` ('synced' | 'all'), `valueField` ('handle' |
    'name'), and `blankLabel`. Deleted `FilterMasterPlayerSelect.tsx`; `MasterGameList.tsx` now
    calls `MasterPlayerSelect` with `scope='synced'`. `ChessComSearchPanel_shared.tsx`'s Player 1/2
    now call it with `scope='all' valueField='name'`, removing the separate `masterPlayerNames`
    state/effect and the now-unused `getMasterPlayerNames()` (deleted from `masterPlayers.ts`).
  - To give the merged component search (needed for the long "all known masters" list, and free
    for the short "synced" list too), `FilterSelect` — the shared wrapper both old components
    already used — gained a `searchEnabled` prop, and was simplified to pass `options` straight to
    `MySelect` instead of manually rendering `<option>` children (a workaround for a `MySelect`
    limitation that `nextjs-shared` has since fixed upstream — `options` now natively accepts
    `{value,label}` pairs).
  - `getSyncedMasterPlayers()`'s own grade-descending sort was removed (redundant — the merged
    component now sorts alphabetically by name itself, matching the agreed "no grade shown, both
    alphabetical" decision).
  - Updated stale references: `owner/constants/page.tsx`'s `WIDTH_MASTER_PLAYER` entry and
    function-doc map, `AppNav.tsx`'s comment.

- [x] **Reported: `/mastergames`'s Player filter selects "Magnus Carlsen" correctly (per the UI),
      but clicking "Refresh" still shows the full unfiltered set (23577 rows), not just Magnus's
      games.** Resolved — confirmed this isn't the "draft vs. applied filters" pattern being missed
      (the user did click Refresh). Two real, compounding root causes found:
  - Found a real, separate data issue via a live DB query: `tmgd_gamesdecon.mgd_player` has two
    case variants for Magnus — `magnuscarlsen` (739 rows) and `MagnusCarlsen` (27 rows) — even
    though the column is supposed to always be stored lowercase (`AppNav.tsx`'s own comment). This
    alone would only explain an *incomplete* filter (739 shown, 27 missing), not zero filtering.
  - Traced the code path (`MasterGameList.tsx`'s `updateFilter`/`filters` state →
    `fetchFilteredMasterGames` → `buildMasterGameFilters`, in `masterGamesList.ts`) and the
    `useEffect` wiring looks correct (depends on `[filters, currentPage, rowsPerPage, hydrated]`,
    calls `fetchFilteredMasterGames(filters, ...)` on change) — nothing obviously wrong by
    inspection alone.
  - **Added temporary debug logging** (removed once the bug was found) rather than continue
    guessing: `MasterGameList.tsx`'s `updateFilter` logged the incoming key/value and the resulting
    `draftFilters` (browser console); `masterGamesList.ts`'s `fetchFilteredMasterGames` logged the
    incoming `filters` object and the built `filterArray` (server/terminal console, since it's a
    `'use server'` file).
  - **Root cause #1** (selection not registering at all): the same `nextjs-shared` `MySelect`
    defect described in the `/masterchesscom` entry above — fixed upstream in v2.1.91.
  - **Root cause #2** (case-variant `mgd_player` data — this is what made "23577 rows," the full
    unfiltered table, plausible for a player whose *entire* set of rows was mixed-case, like
    Shirov, rather than just an undercount): traced to `importHistoricalGames.ts` writing a
    master's real `mst_chesscom_handle` verbatim, un-lowercased. Fixed via a manual data backfill
    (150 rows) plus a code fix so future historical imports can't reintroduce it — see the
    dedicated entry further below.

- [x] **`/mastergames`: removed the Max input from the opponent-rating filter, keeping only Min.**
      Added an optional `showMax?: boolean` (default `true`) to the shared `FilterNumberRange` —
      `MasterGameList.tsx` passes `showMax={false}`; `GameList.tsx`'s identical-looking filter is
      unaffected (still shows both Min and Max, matching how it wasn't asked to change).

- [x] **`/mastergames`: date column now shows the full year, and omits the time when it's exactly
      midnight** (a historical import that only ever had a date defaults its time to 00:00:00,
      which would otherwise display as a real-looking "00:00"). `dd/mm/yy hh:mm` →
      `dd/mm/yyyy hh:mm`, or just `dd/mm/yyyy` when time is 00:00. Scoped to `MasterGameList.tsx`
      only, per what was asked — several other files have their own near-identical inline
      `dd/mm/yy` formatters (`GameList.tsx`, `HabitsTable.tsx`,
      `ChessBoardView_shared.tsx`/`MasterGameView_master.tsx`'s `formatGameDate`), pre-existing
      duplication not introduced this session and not touched here.

- [x] **Root cause found for the "search-select doesn't register" bug on `/masterchesscom`'s
      Player 1/2 fields**: a `nextjs-shared` `MySelect` defect (first filtered option couldn't be
      clicked when the current value was blank and got filtered out of the option list — the
      browser silently defaulted the native `<select>` to displaying that first option, so clicking
      it produced no actual DOM change, hence no `onChange`). Fixed upstream in `nextjs-shared`
      `ccf2609`/v2.1.91 (`missingCurrentOption`, keeps a hidden `<option>` for the current value so
      the browser never needs to silently substitute). Picked up here via `#reinstall`.
  - Remove the temporary debug `console.log` statements added while investigating this (now
    resolved): `MasterGameList.tsx` (`updateFilter`, `handleApplyFilters`, the `fetchCount`/
    `fetchPage` effects), `src/lib/master/masterGamesList.ts` (`fetchFilteredMasterGames`,
    `getMasterGamesPageCount`), `MasterPlayerSelect.tsx`/`FilterSelect.tsx` (the opt-in
    `debugLabel` mechanism and its call sites), `ChessComSearchPanel_shared.tsx`
    (`searchChessCom`'s log, the `debugLabel='p1'` prop).

- [x] **`/masterchesscom` (`ChessComSearchPanel_shared.tsx`) — simplify the filter set and add
      pagination + caching**, based on live testing against chess.com's actual search endpoint:
  - **Keep:** Player 1, Player 2 (confirmed working via live testing — an earlier plan to drop it
    was reversed once it was confirmed to work), Year (comparison + value), Min rating, Sort.
  - **Remove:** "Fixed colors (P1 = White)" toggle (state + UI + `fixedcolors` from
    `ChessComSearchFilters`/the URL build) and the Result filter entirely (state `lstresult` +
    `CHESSCOM_RESULT_OPTIONS` + UI dropdown) — both considered unreliable against chess.com's
    actual behavior during testing. The URL still sends `lstresult=0` (Any) as a fixed constant
    (not omitted), matching what chess.com's own URLs always show.
  - **Add pagination**, via `nextjs-shared`'s existing bare `MyPagination` component (not
    `MyPaginationFooter` — its rows-per-page control doesn't apply here, chess.com's page size
    isn't configurable, and its "N rows" total would be misleading since chess.com never reports a
    true total). `totalPages` is tracked as a locally-discovered, growing estimate: starts at 1;
    after fetching a page that came back full, extend to `page + 1` (assume one more exists until
    proven otherwise); the moment a page comes back empty, cap `totalPages` at the last real page.
  - **Cache fetched pages in `sessionStorage`** (via `SESSION_STORAGE_PREFIX`), keyed by the
    current filter combination + page number, so revisiting an already-fetched page for the same
    search doesn't re-hit chess.com's (flaky) endpoint. A new search (different filters) uses a
    fresh cache scope.
  - **Explicitly deferred, not built now:** a client-side filter over downloaded/cached pages.

- [x] **Root cause found for "Shirov (and others) appear in the master player list but have zero
      games": `tmgd_gamesdecon.mgd_player`/username columns aren't consistently lowercase.**
      `importHistoricalGames.ts` (the World Chess Championship import) wrote a master's real
      `mst_chesscom_handle` verbatim, un-lowercased, unlike the regular chess.com-sync pipeline
      (`deconstructGames_Master.ts`/`masterSync.ts`, which always lowercases). The dropdown
      (`getSyncedMasterPlayers`, `SELECT DISTINCT LOWER(mgd_player)`) shows the lowercased form,
      but `buildMasterGameFilters`'s exact-match filter (`mgd_player = filters.player.toLowerCase()`)
      then matches zero rows for any master whose actual stored value isn't already lowercase.
  - **Manual data-consistency backfill, run by the user** — 150 rows updated:
    ```sql
    UPDATE tmgd_gamesdecon
    SET mgd_player = LOWER(mgd_player),
        mgd_white_username = LOWER(mgd_white_username),
        mgd_black_username = LOWER(mgd_black_username),
        mgd_opponent_username = LOWER(mgd_opponent_username)
    WHERE mgd_player != LOWER(mgd_player)
       OR mgd_white_username != LOWER(mgd_white_username)
       OR mgd_black_username != LOWER(mgd_black_username)
       OR mgd_opponent_username != LOWER(mgd_opponent_username)
    ```
  - **Code fix, so a future historical import can't reintroduce this:**
    `importHistoricalGames.ts`'s `identifierMap.set`'s match branch now lowercases
    `match.chesscomHandle` (the `historicalPlayerSlug` fallback was already lowercase).

## Changes

### src/ui/board/MovesListTable.tsx
- Removed the Avg Rating column entirely — `<th>`, `<td>`, and `avgRating` from `MovesListRow`.

### src/ui/board/ChessBoardView_shared.tsx
- Removed `avgRating` from both row-mapping call sites (Moves Played, Master Moves (Lichess)).
- Added `mastersFenEvals` state; the Masters-explorer fetch effect now also resolves each move's
  resulting FEN (`applyUciMove`) and looks up its eval via `getFenEvalsWithFallback_shared(fens,
  'player')`.
- Master Moves (Lichess) rows now show a real eval (DB lookup, falling back to
  `lichessMissingEval.overrides`) instead of hardcoded `null`.
- Added `lichessMissingRows`/`lichessMissingEval` (via `useMissingEvalAnalysis`) and an "Analyze
  missing (N)" button under the Master Moves (Lichess) table.
- Added `stopRequestedRef` and `stopRunAnalysis()`; `runAnalysis` resets the ref on start, passes
  `() => stopRequestedRef.current` into `analyzeGame()`, and its `onPlyEvaluated` callback now also
  calls `upsertGameEval_player` per ply (replacing the old end-of-run bulk save). Result message
  handles the `stopped` case. "Analyze Position" button disabled while `analyzing`; "Analyze
  missing" button also disabled while `analyzing`/`deepAnalyzing`; `GameAnalysisPanel_shared` now
  gets `disableRun={deepAnalyzing}` and `onStopAnalysis={stopRunAnalysis}`.
- Import swapped: `saveGameEvaluations_player` → `upsertGameEval_player`.
- `runAnalysis`'s skip-check switched from `getPositionEvaluationsBulk_shared(fens)` to
  `getFenEvalsForSkipCheck_shared(fens, 'player')`; local variable renamed `poseEvals` →
  `skipCheckEvals` (and `finalPoseEval` → `finalSkipCheckEval`) throughout the function. Import
  swapped accordingly.
- Panel groups relabeled: added "Players" label above Moves/Games; "All Masters" (was "From our
  own synced master games"); added "Lichess" label; all 4 sub-panel titles shortened to
  "Moves"/"Games".
- Removed the entire "Chess.com Games" search panel (state, constants, effect, handler, JSX) —
  moved to `src/ui/games/ChessComSearchPanel_shared.tsx` / `/masterchesscom`. Removed now-unused
  imports (`searchChessComGames`, `ChessComSearchGame`, `ChessComSearchFilters`,
  `getMasterPlayerNames`, `MyToggle`, `MyInputNumeric`).
- Converted every `.then()/.catch()` this session touched to `await`/`try-catch` (Lichess-eval
  effect → inner `async function load()`; per-ply persistence calls → unawaited async IIFE with
  try/catch, preserving fire-and-forget timing; `persistAnalysisLines`'s own-position write-back →
  `let`/`try/catch` instead of `.catch(() => false)`).
- `runAnalysis`'s `onProgress` wrapper now computes the absolute ply (`sliceStart +
  progress.current`) and calls `getMoveNumberAndColor` to populate `moveNumber`/`isWhite` on
  `analysisProgress` (state type extended to match) for the new "Move Nw/Nb" progress prefix.

### src/ui/board/MasterGameView_master.tsx
- Same relabeling/Chess.com-panel-removal/`.then()`-cleanup changes as `ChessBoardView_shared.tsx`
  above, mirrored for the master view (`getFenEvalsWithFallback_shared(fens, 'master')`,
  `upsertGameEval_master`, `getFenEvalsForSkipCheck_shared(fens, 'master')`).
- `persistAnalysisLines_master` (single-ply "Analyze Position" write-back) switched from resaving
  the whole `mergedPlyEvals` array to one `upsertGameEval_master` call.
- Import swapped: `saveMasterGameEvaluations_master` → `upsertGameEval_master`;
  `getPositionEvaluationsBulk_shared` → `getFenEvalsForSkipCheck_shared`. Updated a stale header
  comment reference to the old function name.
- **Removed the per-master "Moves"/"Games" panel entirely** (Group 1 — `row.mgd_player_name`
  label, `moveSummary`/`positionGames` state, their 3 effects, `refreshPositionPanels_master()`
  and all 3 call sites, the JSX) — judged redundant with "All Masters" (see the Plan section for
  the full decision trail). Removed now-unused imports (`getMoveSummaryForPosition_master`,
  `fetchGamesForPosition_master`, `getGamesForPositionCount_master`, `MasterMoveRow`,
  `MasterPositionGameHit`, `MyPaginationFooter`, `POSITION_GAMES_ROWS_DEFAULT`,
  `POSITION_GAMES_ROWS_OPTIONS`). Updated the file's main header (DESCRIPTION + a new CHANGE
  HISTORY entry).
- Same `runAnalysis` `onProgress`/`analysisProgress` "Move Nw/Nb" change as
  `ChessBoardView_shared.tsx` above.

### src/ui/board/MasterMovesDbPanel.tsx / MasterGamesDbPanel.tsx
- Titles shortened: "Master Moves (Our DB)" → "Moves", "Master Games (Our DB)" → "Games"
  (the "All Masters" group label above them, added by their callers, now carries that context).
  Button text updated to match ("Fetch Moves"/"Fetch Games"). Updated each file's CHANGE HISTORY.

### src/lib/actions/chesscomSearch.ts
- `searchChessComGames`'s `fen` parameter is now optional (`fen?: string`), sent as `''` when
  omitted — enables the new general (no-position) search on `/masterchesscom`.

### src/ui/games/ChessComSearchPanel_shared.tsx (new file)
- General chess.com game search (Player 1/2, rating, year, result, sort — no FEN), extracted from
  the identical duplicated panel previously embedded in both board-view files.

### src/app/masterchesscom/page.tsx (new file)
- Thin wrapper rendering `ChessComSearchPanel_shared`, mirroring `src/app/mastergames/page.tsx`.

### src/ui/AppNav.tsx
- Added a second Master-group tab, `{ key: 'masterchesscom', label: 'Chess.com', href:
  '/masterchesscom' }`, and its `activeKey` case. Updated the file's header/CHANGE HISTORY.

### .claude/CLAUDE.md
- Added an Outstanding item: a master/all filter toggle on the "All Masters" panel
  (master-page only), as a lighter-weight alternative to the removed per-master panel.

### src/ui/board/MasterMovesDbPanel.tsx
- Removed `avgRating` from the row mapping.
- Eval now comes from `m.cp` (populated server-side, see `masterGamesList.ts` below), falling back
  to `missingEval.overrides` when still null.
- Added `missingRows`/`missingEval` (via `useMissingEvalAnalysis`, resulting FEN computed from
  `m.move_uci` via `applyUciMove`) and an "Analyze missing (N)" button.
- Updated the file's `CHANGE HISTORY` header.

### src/lib/analysis/chessdb_shared.ts
- Added `getFenEvalsFromGev_shared`, `getFenEvalsFromMgev_shared`, and
  `getFenEvalsWithFallback_shared` — read-only bulk FEN-eval lookups (own per-game table first,
  `tpose_positions_eval` fallback), placed together after `getPositionEvaluationsBulk_shared`.
- `getFenEvalsFromGev_shared`/`getFenEvalsFromMgev_shared` now also select/return `bestMove`;
  `getFenEvalsWithFallback_shared`'s return type updated to match.
- Added `getFenEvalsForSkipCheck_shared(fens, context)` — deepest-of-`tpose`-or-own-table merge,
  for `runAnalysis`'s "can I skip this position" check.

### src/lib/master/masterGamesList.ts
- `getMasterGamesForFen` now selects `mgam_resulting_fen`, tracks it per move, and calls
  `getFenEvalsWithFallback_shared(fens, 'master')` to populate each move's new `cp`/`depth` fields.
- Added `cp`/`depth` to `MasterFenMoveBreakdown`.
- Updated the function's header comment.
- Removed `saveMasterGameEvaluations_master` (whole-array delete+reinsert); added
  `upsertGameEval_master(mgdid, ply, e)` — single-row upsert into `tmgev_game_evals` plus a
  one-row `tpose_positions_eval` top-up. Removed the now-unused `table_delete` import.

### src/lib/actions/games.ts
- Removed `saveGameEvaluations_player` (whole-array delete+reinsert); added
  `upsertGameEval_player(gdid, ply, e)` — single-row upsert into `tgev_game_evals`. Removed the
  now-unused `table_delete` import.

### src/lib/stockfish.ts
- Added `StockfishEngine.requestStop()` — unconditionally sends UCI `stop`.
- `analyzeGame()` takes a new optional `shouldStop?: () => boolean`, checked after each position's
  evaluation; discards that position's result and stops immediately if true. Returns a new
  `stopped: boolean`. `finalPosition` is now always derived from the last completed ply instead of
  assuming the originally-requested range completed.

### src/ui/board/GameAnalysisPanel_shared.tsx
- Added `onStopAnalysis` prop and a Stop button next to the progress bar.
- `analysisProgress` prop type gained optional `moveNumber`/`isWhite`; progress line now leads
  with "Move Nw"/"Move Nb" when present.

### src/lib/analysisTree.ts
- Added `getMoveNumberAndColor(ply)`, factored out of `getCurrentMoveLabel`'s existing formula so
  `runAnalysis`'s progress display can reuse the same move-number/side-to-move math.

### src/lib/actions/masterPlayers.ts
- `getMasterPlayerNames`'s `ORDER BY` changed from `mst_last_name, mst_first_name` to
  `mst_first_name, mst_last_name` (superseded later this session — see below).
- **Later: removed `getMasterPlayerNames()` entirely** — superseded by `MasterPlayerSelect`
  (`scope='all'`), which sources the same data from the already-existing `getMasterPlayers()`
  instead of a separate query. `combineName` kept (still used by `getMasterHandleNameMap`).

### src/app/masterchesscom/page.tsx
- Added `max-w-4xl` to the wrapper div.

### src/ui/filters/FilterSelect.tsx
- Added `searchEnabled` prop (passed straight through to `MySelect`). Simplified to pass `options`
  directly to `MySelect` instead of manually rendering `<option>` children — a workaround for a
  `MySelect` limitation nextjs-shared has since fixed upstream (`options` now natively accepts
  `{value,label}` pairs). Removed the now-unused local `normalize` helper.

### src/ui/filters/MasterPlayerSelect.tsx
- Rewrote entirely: merges the deleted `FilterMasterPlayerSelect` and this file's own previously
  dead-code implementation into one component, parameterized by `scope` ('synced' | 'all'),
  `valueField` ('handle' | 'name'), and `blankLabel`. Always searchable. Sorted alphabetically by
  name; no grade shown.

### src/ui/filters/FilterMasterPlayerSelect.tsx (deleted)
- Merged into `MasterPlayerSelect` (`scope='synced'`).

### src/ui/games/MasterGameList.tsx
- Import/call site swapped: `FilterMasterPlayerSelect` → `MasterPlayerSelect` with `scope='synced'`.

### src/ui/games/ChessComSearchPanel_shared.tsx
- Player 1/2 fields switched from a raw `MySelect` + local `masterPlayerNames` state/effect to
  `MasterPlayerSelect` (`scope='all' valueField='name'`); removed the now-unused `MySelect`-related
  imports for those two fields and the `getMasterPlayerNames` import/effect.
- Added `lastSearchUrl` state, populated from `searchChessComGames`'s existing `url` return value,
  displayed as "Last search: `<url>`" — a debugging aid for comparing what's actually submitted
  against what the filter controls display (added while investigating the "no Magnus games"
  report, not yet resolved).

### src/app/owner/constants/page.tsx
- Updated `WIDTH_MASTER_PLAYER`'s description/consumers and the function-doc map entry to
  reference `MasterPlayerSelect` instead of the deleted `FilterMasterPlayerSelect`.

### src/ui/AppNav.tsx
- Updated a comment referencing `FilterMasterPlayerSelect` to `MasterPlayerSelect`.

### src/lib/fen.ts
- Added `applyUciMove(fen, uci)` — resolves the resulting FEN for a UCI move via `chess.js`, used
  by the Lichess panels (which only get `uci`, never a FEN, from the Explorer API).

### src/lib/analysis/evalSessionCache.ts (new file)
- Module-level `Map<fen, {cp, depth}>` + `getCachedEval`/`setCachedEval` — in-memory only, survives
  client-side route navigation, cleared on refresh. Never written to except by
  `useMissingEvalAnalysis`.

### src/ui/board/useMissingEvalAnalysis.ts (new file)
- New shared hook: runs single-line Stockfish analysis sequentially over a panel's rows still
  lacking an eval, checking/writing `evalSessionCache`, never persisting to the database.

### src/ui/games/MasterGameList.tsx
- Removed the temporary debug `console.log` statements from `updateFilter`, `handleApplyFilters`,
  and the `fetchCount`/`fetchPage` effects — the underlying bug (see `masterGamesList.ts` and
  `MasterPlayerSelect.tsx`/`FilterSelect.tsx` below) is now root-caused and fixed upstream.

### src/lib/master/masterGamesList.ts
- Removed the temporary debug `console.log` statements from `fetchFilteredMasterGames` and
  `getMasterGamesPageCount`.

### src/ui/filters/MasterPlayerSelect.tsx
- Removed the temporary `debugLabel` prop and its `console.log` call sites, added while
  investigating the `/masterchesscom`/`/mastergames` selection bug — root cause found (see
  `chesscomSearch.ts` below) and fixed upstream in `nextjs-shared`.

### src/ui/filters/FilterSelect.tsx
- Removed the temporary `debugLabel` prop and its `console.log` call site (the `MySelect`
  `onChange` boundary logging added during the same investigation).

### src/lib/actions/chesscomSearch.ts
- Root cause found for "Player 1 search-select doesn't register": a `nextjs-shared` `MySelect`
  defect where the first filtered option couldn't be clicked when the current value was blank and
  got excluded from the search-narrowed option list (browser silently defaulted the native
  `<select>` to displaying that option, so clicking it produced no DOM change, hence no
  `onChange`). Fixed upstream in `nextjs-shared` `ccf2609`/v2.1.91 (`missingCurrentOption`); picked
  up here via `#reinstall`.
- Removed `fixedcolors` and `lstresult` from `ChessComSearchFilters` (both dropped from the UI
  after live testing found them unreliable). `lstresult` is now always sent as the fixed `'0'`
  (Any) in the URL build, rather than omitted.

### src/ui/games/ChessComSearchPanel_shared.tsx
- Removed the "Fixed colors (P1=White)" toggle (state, UI, `MyToggle` import) and the Result
  filter (state, `CHESSCOM_RESULT_OPTIONS`, UI dropdown) entirely, per live testing against
  chess.com.
- Removed the temporary `lastSearchUrl` investigation debug wiring's `debugLabel='p1'` prop and
  `searchChessCom`'s `console.log` — kept `lastSearchUrl`'s display itself (still a useful,
  permanent diagnostic for comparing the submitted URL against the filter controls).
- Added pagination: `activeFilters`/`currentPage`/`totalPages` state, a fetch effect that re-runs
  on `[activeFilters, currentPage]`, and `nextjs-shared`'s bare `MyPagination` (not
  `MyPaginationFooter` — no configurable page size, and no real total to show). `totalPages` is a
  locally-discovered, growing estimate — extended to `page + 1` after a full page, capped at the
  last real page once an empty one is hit.
- Added a sessionStorage cache (`readChesscomCache`/`writeChesscomCache`, key
  `` `${SESSION_STORAGE_PREFIX}chesscom-search-cache` ``) of fetched pages, keyed by the exact
  filter combination — revisiting an already-fetched page for the current search serves from cache
  instead of re-querying chess.com; a new search (different filters) replaces the cache scope.
  Client-side filtering over the cached pages is explicitly deferred, not built this pass.

### src/lib/master/importHistoricalGames.ts
- `resolveHistoricalMasterIdentifiers`'s matched-master branch now lowercases `match.chesscomHandle`
  before storing it in `identifierMap` (`historicalPlayerSlug`'s own fallback branch was already
  lowercase) — keeps future historical imports' `mgd_player`/username values consistent with the
  regular chess.com-sync pipeline, which always lowercases.

## Testing
- [ ] Open `/analyze` for the tracked player, click into a position with real move history, and
      confirm the Avg Rating column is gone from all 3 panels (Moves Played, Master Moves
      (Lichess), Master Moves (Our DB)) and Eval still shows correctly on Moves Played (unchanged).
- [ ] On the same position, confirm Master Moves (Lichess) now shows a real Eval value for at
      least some rows (not all `—`) where the position has been analyzed before.
- [ ] Confirm Master Moves (Our DB) shows a real Eval for rows corresponding to a master game move
      that's been through "Analyze Game".
- [ ] For a row still showing `—`, click "Analyze missing (N)" on that panel — confirm it runs
      (button disables, shows "Analyzing X/N..."), and the row's Eval fills in when done.
- [ ] After a successful "Analyze missing" run, navigate to a different route (e.g. Habits) and
      back to the same position — confirm the previously-analyzed row still shows its eval without
      needing "Analyze missing" again (session cache surviving navigation).
- [ ] Refresh the page and confirm that same row goes back to `—` (session cache is expected to
      clear on refresh) until "Analyze missing" is run again.
- [ ] Repeat the above on `/analyzemaster` for a master game, to confirm the master-context wiring
      (`tmgev_game_evals` fallback) behaves the same way.
- [ ] Confirm nothing else changed — Games Played, Master Games panels, and board navigation all
      still work as before.
- [ ] On `/analyze`, click "Analyze Game", then — while it's running — try clicking "Analyze
      Position": confirm the button is now disabled with a "Stockfish busy..." hint instead of
      being clickable. Let "Analyze Game" finish normally and confirm it completes (no more stuck
      "analysing" status).
- [ ] Start "Analyze Position", then confirm "Analyze Game"/"Re-analyse" and each panel's "Analyze
      missing" button are disabled while it runs.
- [ ] Start a "Re-analyse" over a large move range, click "Stop" partway through, and confirm: the
      run ends promptly, the result message reads "Stopped — updated N plies", and the plies
      completed before clicking Stop are kept (check the move list still shows their evals).
- [ ] After stopping partway through, refresh the page and confirm the plies that had completed
      before Stop was pressed are still there (open the game again and check the move list/Game
      Analysis badges) — this is the actual resilience fix, so it's the most important check here.
- [ ] Repeat the Stop + refresh check on `/analyzemaster` for a master game.
- [ ] On `/analyzemaster`, use "Analyze Position" on a single position that's part of an
      already-analyzed game, confirm it still updates that one ply correctly (via the new
      `upsertGameEval_master`, replacing the old whole-array resave).
- [ ] On `/analyzemaster`, fully analyze a master game (e.g. a Magnus Carlsen game) at some depth,
      wait for it to finish, then click "Re-analyse" again at the same depth over the same range —
      confirm it now completes near-instantly instead of re-running Stockfish (this was the actual
      reported bug: the skip-check only checked `tpose_positions_eval`, which rarely gets populated
      for master games, so it never saw `tmgev_game_evals` already had sufficient depth).
- [ ] Repeat the same "analyze once, re-analyse at same depth" check on `/analyze` for a player
      game, to confirm the symmetric fix there didn't regress the (already-working) player-side
      skip behavior.
- [ ] On `/analyze`, confirm the panel groups now read: "Players" (Moves/Games), "All Masters"
      (Moves/Games), "Lichess" (Moves/Games) — no leftover "Moves Played"/"Games Played"/"Master
      Moves (...)"/"From our own synced master games" text anywhere.
- [ ] On `/analyzemaster`, confirm the panel groups now read: "All Masters" (Moves/Games),
      "Lichess" (Moves/Games) — and confirm the per-master ("row.mgd_player_name") panel is gone
      entirely (only 2 groups now, not 3).
- [ ] Confirm the "Chess.com Games" search panel no longer appears on either `/analyze` or
      `/analyzemaster`.
- [ ] Open the nav's Master box — confirm a new "Chess.com" tab appears next to "Games", and
      clicking it goes to `/masterchesscom`, showing the search panel with Player 1/Player 2/
      rating/year/result/sort filters and no position/FEN requirement. Run a search (e.g. two
      known player names) and confirm results appear.
- [ ] Confirm `/mastergames` ("Games" tab) still works exactly as before — unaffected by the new
      sibling tab.
- [ ] Start "Analyze Game"/"Re-analyse" and confirm the progress line now reads e.g. "Move 24w —
      Ply 5/40 — Nc3" (white) or "Move 24b — ..." (black), on both `/analyze` and `/analyzemaster`.
- [ ] On `/masterchesscom`, confirm the Player 1/Player 2 dropdown list is now in alphabetical
      order by the displayed "First Last" text.
- [ ] On `/masterchesscom`, search Player 2 for a name known to have 2+ matches (e.g. "nak" →
      Hikaru Nakamura / Raunak Sadhwani) — confirm the selection now correctly clears instead of
      silently keeping a stale value (fixed upstream in `nextjs-shared` v2.1.90, confirmed via the
      `#reinstall`).
- [ ] Confirm `/masterchesscom`'s content no longer spans the full viewport width.
- [ ] On `/mastergames`, confirm the Player filter dropdown no longer shows any master twice.
- [ ] On `/mastergames`'s Player filter and `/masterchesscom`'s Player 1/2, confirm none show a
      grade suffix and all three are sorted alphabetically by name (not grade-descending).
- [ ] On `/masterchesscom`, search Player 1 for "Magnus", note the "Last search: `<url>`" line that
      appears after clicking "Search chess.com", and confirm it actually contains
      `p1=Magnus+Carlsen` — if the returned games still look wrong despite the URL being correct,
      that narrows the still-open "no Magnus games" bug further; if the URL itself is wrong,
      paste it into a browser to see chess.com's own response for comparison.
- [ ] On `/masterchesscom`, search Player 1 by typing text that narrows to more than one match
      (e.g. "mag" → Magnus Carlsen / Parham Maghsoodloo), click the **first** option in the
      narrowed list, and confirm it now correctly registers (this specifically failed before the
      `nextjs-shared` v2.1.91 fix). Confirm `p1` appears correctly in the "Last search" URL.
- [ ] Confirm the "Fixed colors (P1 = White)" toggle and the Result dropdown no longer appear on
      `/masterchesscom`.
- [ ] Run a search that returns a full first page of results, and confirm a pagination control
      appears below the results table; click to page 2 and confirm different games load.
- [ ] Page back to page 1, and confirm it loads instantly (served from the sessionStorage cache,
      not a fresh chess.com request — check the Network tab shows no new request for that page).
- [ ] Refresh the browser, re-enter the exact same search (same Player 1/2/rating/year/sort) and
      click Search — confirm page 1 loads instantly from the sessionStorage cache surviving the
      refresh.
- [ ] Change any filter and search again — confirm this is treated as a new search (fresh page 1,
      previous cached pages no longer used).
- [ ] Page forward until a page comes back with "No games found" — confirm the pagination control
      still lets you navigate back to the last real page.
- [ ] On `/mastergames`, filter Player by "Shirov" and confirm his games now actually appear
      (previously showed zero despite being selectable) — confirms the manual data backfill worked.
- [ ] Confirmed via `npx tsc --noEmit` only for `importHistoricalGames.ts`'s fix — no way to
      exercise a fresh historical import in this session; the next time that import runs, spot-check
      a newly-inserted master with a real chess.com handle to confirm `mgd_player` comes out
      lowercase.

## Notes

**Resolved:** user confirmed Avg Rating should come out of all 5 panels, not just Moves Played —
superseding the per-panel `showAvgRating` toggle originally proposed.

**Question answered (no code change needed):** why does Moves Played show an Eval for Nc3 but
Master Moves (Lichess) doesn't?

Moves Played's `eval` comes from `m.pose_cp` — the resulting position's own Stockfish evaluation,
stored in `tpose_positions_eval` by this project's own analysis pipeline for positions in the
player's synced position tree (see `chessdb_player.ts`/`chessdb_shared.ts`). Master Moves
(Lichess) hardcodes `eval: null` at both its call sites because the Lichess Masters Opening
Explorer API response has no evaluation field at all — Lichess just doesn't return one. This isn't
a bug; it's the same reasoning already documented on Master Moves (Our DB) ("not worth a
cross-database join for this panel"). Adding an eval to Lichess rows would mean a FEN-keyed lookup
against `tpose_positions_eval` for each Lichess move's resulting position — a real feature, not a
minor UI tweak, and out of scope here unless requested separately.

**Follow-up: the user asked for this feature after all.** Design agreed through discussion:

- **Lookup order (confirmed):** for a candidate move's resulting FEN, check the per-game analysis
  table matching context first (`tgev_game_evals` for player, `tmgev_game_evals` for master), then
  fall back to `tpose_positions_eval` if not found there. Rationale (user): each game is analyzed
  individually, so `tgev`/`tmgev` hold the real, authoritative per-position evaluation; `tpose`'s
  real purpose is feeding habit detection (reach counts to flag positions needing analysis), so
  it's a reasonable fallback but not the primary source for this feature.
- **Multiple rows per FEN in `tgev`/`tmgev`:** take the deepest (highest `depth`) — easy via
  `DISTINCT ON`, so no need to compromise on accuracy here.
- **Purge safety (confirmed no issue):** this feature is read-only against `tgev_game_evals`/
  `tmgev_game_evals`/`tpose_positions_eval` — it never writes a new `tpos_positions` row for a
  master-only or Lichess-only position, so `purgeStaleReachOnePositions`'s reach/age logic (which
  assumes every `tpos_positions` row reflects a real reach by the tracked player) is unaffected.
- **Moves Played scope (confirmed, not changed):** left exactly as-is — see the new Plan step
  above.

**Follow-up 2: interactively analyze whatever's still missing after the DB lookup.** Design agreed:

- **Trigger (confirmed): button, one per panel** — a single "Analyze missing (N)" batch button on
  each of the 3 panels, not automatic and not one button per row. Matches every existing Stockfish
  trigger in the app (Analyze Position, Re-analyse, Analyze Game), which are all manual — running
  automatically would silently fire off several multi-second engine runs on every panel load.
- **Depth (confirmed):** reuses `STOCKFISH_DEFAULTS.deepAnalysisDepth` — no new constant.
- **Persistence (revised — session cache, confirmed final):** no DB write (still sidesteps the
  purge problem from Follow-up 1 exactly as before), but a computed eval is kept in a module-level,
  in-memory `evalSessionCache` (keyed by FEN) for the rest of the browser tab — so revisiting the
  same position later in the same session, even after navigating to a different route, shows the
  previously-computed eval immediately instead of needing "Analyze missing" run again. Cleared on
  refresh/tab close. As a free side effect, since the cache is keyed by FEN rather than per-panel, a
  position analyzed from one panel automatically shows up on any other panel displaying the same
  FEN in the same session — without any dedicated cross-panel sync logic.
