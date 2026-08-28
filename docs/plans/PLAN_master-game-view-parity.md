# PLAN_master-game-view-parity — chess

## Title
MasterGameView_master full parity duplicate of ChessBoardView_shared

## Plan

**Trigger:** `/analyzemaster?game=13488` was visibly different in layout/functionality from
`/analyze?game=74601&player=astarrboy`. Agreed direction: `MasterGameView_master` should be a full
duplicate of `ChessBoardView_shared` (same layout, same panels, same interactive board), differing
only where the underlying tables/writes genuinely differ (secondary vs. primary database,
`createIfMissing:false` throughout, no `gameContext`/`tgev_game_evals` writes, no player-scoped
purge). This supersedes the two `DEFERRED` items in the now-archived
`docs/archive/PLAN_master-games-fen-eval-reuse.md` (the "MasterGameView_master feature-parity
items" item, and — for Moves Played/Games Played specifically — the "no master-side data source
exists for it yet" framing, since a real mirror is being built below). The *other* deferred item in
that file (extracting Moves Played/Games Played out of `ChessBoardView_shared.tsx` into its own
`_player` component) is unrelated to this task and stays deferred, untouched.

**Explicitly dropped, not deferred:** the "Final eval" line/column. `tgd_gamesdecon.gd_final_eval`
is populated by `evaluateGameEndings` (`enrichPositionsStockfish.ts`), a full pipeline stage with
its own Stockfish engine pooling and pipeline-log step. The user confirmed there is and will be no
equivalent pipeline stage for masters ("no pipeline for masters beyond getting the new games and
creating the existing tables") — so `tmgd_gamesdecon` gets **no** `mgd_final_eval` column, and
master's game-info row/Games Played panel never show a Final Eval value at all. This is a permanent
scope difference, not a follow-up item.

- [x] Hoist `CLASSIFICATION_SQUARE_COLORS` out of `ChessBoardView_shared.tsx` (currently a
      module-level constant there) into `src/lib/stockfish.ts`, next to `classifyMove`, and export
      it. Update `ChessBoardView_shared.tsx` to import it instead of defining it locally. Both
      board views need the identical object; this avoids a second copy drifting.
- [x] Rename three constants in `src/lib/constants.ts` to drop their `_Player` suffix, since the
      new master-side Moves Played/Games Played panels (below) need the identical values:
      `MOVE_COUNT_MIN_MOVE_Player` → `MOVE_COUNT_MIN_MOVE`, `POSITION_GAMES_ROWS_DEFAULT_Player` →
      `POSITION_GAMES_ROWS_DEFAULT`, `POSITION_GAMES_ROWS_OPTIONS_Player` →
      `POSITION_GAMES_ROWS_OPTIONS`. Update every existing consumer (`chessdb_player.ts`,
      `ChessBoardView_shared.tsx`) and the `owner/constants/page.tsx` entries.
      `RESULT_MISMATCH_CP_THRESHOLD_Player` stays as-is, unrenamed — it drove the Games Played
      "won a losing position / lost a winning position" highlight, which depended on
      `gd_final_eval`; since master has no final-eval data at all, master's Games Played panel
      never computes a `resultMismatch`, so this constant stays player-only.
- [x] Create `src/lib/analysis/chessdb_master.ts` — minimal-diff mirror of `chessdb_player.ts`'s
      move/game-position functions, scoped to `mgd_player` instead of `gd_player`, querying
      `tmpos_positions`/`tmgam_game_positions`/`tmgd_gamesdecon` (secondary database) instead of
      `tpos_positions`/`tgam_game_positions`/`tgd_gamesdecon` (primary):
      - `getMovePlayCounts_master(fens, masterPlayer)` — mirrors `getMovePlayCounts_player` exactly.
      - `getMoveSummaryForPosition_master(fen, masterPlayer)` — mirrors
        `getMoveSummaryForPosition_player`, but as two steps instead of one SQL join: (1) the
        move/count/win/loss group-by query against the secondary database, returning each move's
        resulting FEN; (2) a bulk eval lookup via the existing `getPositionEvaluationsBulk_shared`
        against the primary database, merged in by FEN. Necessary because
        `tpose_positions_eval` (primary) can't be joined in one query against secondary-database
        tables — same two-step shape `getMasterGameEvals_master` already uses.
      - `fetchGamesForPosition_master(fen, masterPlayer, page, itemsPerPage, move?)` — mirrors
        `fetchGamesForPosition_player` (via `fetchFiltered`, same join-table shape translated to
        the `tm*` tables). Returned row type has no `finalEval`/`resultMismatch` fields at all
        (see "Explicitly dropped" above).
      - `getGamesForPositionCount_master(fen, masterPlayer, move?)` — mirrors
        `getGamesForPositionCount_player` (via `fetchTotalRows`).
- [x] Restructure `MasterGameView_master.tsx`'s outer layout to match `ChessBoardView_shared.tsx`
      exactly: wrap the nav in a `MyBox` header (`MyBackHomeNav backPath='/mastergames'
      backLabel='Masters Games'` + `BackButton fallback='/mastergames'`); add a top opening-name
      line above the grid (`row.mgd_opening_name`/`row.mgd_eco_code`/`row.mgd_time_class` — moved
      out of the per-column game-info row, matching where player keeps it); convert the `flex
      flex-wrap` layout to the 3-column `grid grid-cols-1 gap-6 xl:grid-cols-[480px_480px_600px]
      xl:items-start`; Column 2 (Moves) in a `bg-pink-50` box; Column 3 in a `bg-yellow-50` box
      with a "Position Analysis {currentMoveLabel}" heading above its panels.
- [x] Add the draggable board to `MasterGameView_master.tsx`: `allowDragging`, `onPieceDrop`
      wired to a new `handlePieceDrop` (mirrors player's exactly — `addBranch` is already shared),
      and `squareStyles` via a new `customSquareStyles` computation using the hoisted
      `CLASSIFICATION_SQUARE_COLORS`.
- [x] Add a Copy FEN button to the board column (`copyFenToClipboard`/`getCurrentPositionFen`/
      `fenCopied` state — direct copy, no table dependency).
- [x] Wire `moveCounts` into `MasterGameView_master`'s `MoveTree_shared`: new effect calling
      `getMovePlayCounts_master(fens, row.mgd_player)` on tree change, passed as the
      `moveCounts` prop (already an optional prop on `MoveTree_shared`).
- [x] Add Moves Played / Games Played panels to Column 3, built on the new `chessdb_master.ts`
      functions, mirroring `ChessBoardView_shared`'s JSX and pagination exactly (new state:
      `moveSummary`, `selectedPositionMove`, `positionGames`, `positionGamesTotalRows`,
      `positionGamesPage`, `positionGamesRowsPerPage` defaulting from
      `POSITION_GAMES_ROWS_DEFAULT`/`POSITION_GAMES_ROWS_OPTIONS`, plus the reset-to-page-1 effect).
      Games Played has no Final Eval column and no winning/losing-position legend (no `finalEval`
      data on the master side).
- [x] Add the deep/infinite Stockfish "Analyze Position" panel: `deepAnalyzing`/`deepAnalysisData`/
      `latestAnalysisLinesRef`/`saveAnalysisMessage` state, `startDeepAnalysis`/`stopDeepAnalysis`/
      `processUpdate` (mirrors player's exactly), `AlternativeLines_shared`, `handleSelectPvLine`,
      and a new `persistAnalysisLines_master(fen, ply, lines, depth)`. This is the one real write-
      path divergence: it never passes `gameContext` to `upgradePositionEvaluation_shared` (that
      param is hardcoded to upsert `tgev_game_evals`, a player-only table — passing it from master
      would write into the wrong game's table). Instead, for the "own position" write-back, it
      updates local `plyEvals[ply]` (same as player does for local state) and then calls
      `saveMasterGameEvaluations_master(row.mgd_mgdid, mergedPlyEvals)` to persist into
      `tmgev_game_evals` — the same whole-array-save pattern `runAnalysis` in this file already
      uses, not a new mechanism.
- [x] Add the Chess.com Games live search panel to `MasterGameView_master.tsx` — direct reuse of
      `searchChessComGames`/`getMasterPlayerNames`/`ChessComSearchFilters` and the same filter
      state/UI; no table differences to account for.
- [x] Add `refreshPositionPanels_master()` (re-fetches `moveSummary`/`positionGames`), called from
      the same points player's `refreshPositionPanels` is: after each live per-ply upgrade in
      `runAnalysis`, after its final-position upgrade, and at the end of
      `persistAnalysisLines_master`.
- [x] Update `MasterGameView_master.tsx`'s file header (`1) DESCRIPTION`/`2) NOTES`/
      `3) CHANGE HISTORY`) — remove the "still missing" `2) NOTES` line (now false) and add a
      `3) CHANGE HISTORY` entry.
- [x] Update `src/app/owner/constants/page.tsx` for the 3 renamed constants (remove the
      `_Player`-suffixed entries, add the shared entries with updated `consumers` lists covering
      both `chessdb_player.ts`/`ChessBoardView_shared.tsx` and the new
      `chessdb_master.ts`/`MasterGameView_master.tsx`).
- [x] Update this project's `.claude/CLAUDE.md` Outstanding Items — remove the
      "MasterGameView_master feature-parity items"/Moves-Played-Games-Played-master-equivalent
      framing from the "Extract `ChessBoardView_shared.tsx`'s remaining inline panels..." item,
      since this plan addresses it; the item's own player-side panel extraction (a separate,
      still-genuinely-outstanding task) stays.
- [x] `npx tsc --noEmit` clean.

## Changes

### src/lib/stockfish.ts
- Added `CLASSIFICATION_SQUARE_COLORS`, hoisted from `ChessBoardView_shared.tsx`, exported next to
  `classifyMove` so both board views can import the identical object.

### src/lib/analysisTree.ts
- Added `collectNodesFromMove(root, minMove)` and `getCurrentMoveLabel(currentNode, currentPly)`,
  hoisted from `ChessBoardView_shared.tsx` — both are now needed by `MasterGameView_master.tsx`
  too, so they moved to the shared tree-utility module rather than being duplicated.

### src/lib/constants.ts
- Renamed `MOVE_COUNT_MIN_MOVE_Player` → `MOVE_COUNT_MIN_MOVE`, `POSITION_GAMES_ROWS_DEFAULT_Player`
  → `POSITION_GAMES_ROWS_DEFAULT`, `POSITION_GAMES_ROWS_OPTIONS_Player` →
  `POSITION_GAMES_ROWS_OPTIONS` — all three now shared between the player and master Moves
  Played/Games Played panels. `RESULT_MISMATCH_CP_THRESHOLD_Player` left unchanged (player-only —
  master has no `finalEval` to compute a mismatch from).

### src/lib/analysis/chessdb_master.ts (new)
- New file, minimal-diff mirror of `chessdb_player.ts`'s move/game-position functions, scoped to
  `mgd_player` via `tmpos_positions`/`tmgam_game_positions`/`tmgd_gamesdecon` (secondary database):
  `getMovePlayCounts_master`, `getMoveSummaryForPosition_master` (two-step: secondary-DB group-by
  query, then a `getPositionEvaluationsBulk_shared` merge by FEN against the primary database),
  `fetchGamesForPosition_master`/`getGamesForPositionCount_master` (via `fetchFiltered`/
  `fetchTotalRows`, no `finalEval`/`resultMismatch` fields). New types: `MasterMoveRow`,
  `MasterPositionGameHit`.

### src/ui/board/ChessBoardView_shared.tsx
- Removed the local `CLASSIFICATION_SQUARE_COLORS` definition and local `collectNodesFromMove`/
  `getCurrentMoveLabel` functions — now imported from `stockfish.ts`/`analysisTree.ts`.
- Updated imports for the 3 renamed constants (`MOVE_COUNT_MIN_MOVE`,
  `POSITION_GAMES_ROWS_DEFAULT`, `POSITION_GAMES_ROWS_OPTIONS`) and their 3 usage sites.

### src/ui/board/MasterGameView_master.tsx
- Full parity rewrite. Layout restructured to match `ChessBoardView_shared.tsx` exactly: `MyBox`
  header (`MyBackHomeNav` + `BackButton fallback='/mastergames'`), a top opening-name line
  (`mgd_opening_name`/`mgd_eco_code`/`mgd_time_class`, moved out of the game-info row), the
  3-column `grid-cols-[480px_480px_600px]` layout, Column 2 in a `bg-pink-50` box, Column 3 in a
  `bg-yellow-50` box with a "Position Analysis {currentMoveLabel}" heading.
- Added the draggable board (`allowDragging`/`onPieceDrop`/`handlePieceDrop`/`addBranch`), move-
  classification square highlighting (`customSquareStyles` via the hoisted
  `CLASSIFICATION_SQUARE_COLORS`), a Copy FEN button, and `moveCounts` badges on `MoveTree_shared`
  (new effect using `getMovePlayCounts_master`).
- Added Moves Played / Games Played panels (Column 3), backed by the new `chessdb_master.ts`
  functions and scoped to `row.mgd_player` — new state (`moveSummary`, `selectedPositionMove`,
  `positionGames`, `positionGamesTotalRows`, `positionGamesPage`, `positionGamesRowsPerPage`) and
  the reset-to-page-1 effect, mirroring `ChessBoardView_shared.tsx`'s pagination exactly. Games
  Played has no Final Eval column (no master equivalent of `gd_final_eval` — see the Plan's
  "Explicitly dropped" note).
- Added the deep/infinite Stockfish "Analyze Position" panel: `deepAnalysisDepth`/
  `deepAnalysisMultiPv` (local, uncontrolled state — `/analyzemaster` passes no such props, unlike
  `/analyze`), `deepAnalyzing`/`deepAnalysisData`/`latestAnalysisLinesRef`/`saveAnalysisMessage`,
  `startDeepAnalysis`/`stopDeepAnalysis`, `AlternativeLines_shared`, `handleSelectPvLine`, and a
  new `persistAnalysisLines_master` — never passes `gameContext` to
  `upgradePositionEvaluation_shared` (player-only, upserts `tgev_game_evals`); instead updates
  local `plyEvals[ply]` and persists via `saveMasterGameEvaluations_master`.
- Added the Chess.com Games live search panel — direct reuse of `searchChessComGames`/
  `getMasterPlayerNames`/`ChessComSearchFilters`, same filter state/UI as the player view.
- Added `refreshPositionPanels_master()`, called from `runAnalysis`'s per-ply/final-position
  upgrades and from `persistAnalysisLines_master`.
- Added an engine-cleanup-on-unmount effect (present on the player view, was missing here).
- Updated the file header: removed the "still missing" `2) NOTES` line, added a `3) CHANGE
  HISTORY` entry.
- New imports: `Square` (chess.js), `useRouter`, `BackButton`, `MySelect`/`MyInput`/`MyToggle`/
  `MyHelpField`/`MyPaginationFooter`, `searchChessComGames`/`ChessComSearchFilters`/
  `getMasterPlayerNames`, `CLASSIFICATION_SQUARE_COLORS`, `addBranch`/`addPvBranch`/`getPath`/
  `collectNodesFromMove`/`getCurrentMoveLabel`, `getMovePlayCounts_master`/
  `getMoveSummaryForPosition_master`/`fetchGamesForPosition_master`/
  `getGamesForPositionCount_master`, `MOVE_COUNT_MIN_MOVE`/`POSITION_GAMES_ROWS_DEFAULT`/
  `POSITION_GAMES_ROWS_OPTIONS`, `winPct`, `formatCp`, `AlternativeLines_shared`,
  `DepthInput_shared`.

### src/app/owner/constants/page.tsx
- Updated imports and `ConstantSection` entries for the 3 renamed constants, adding
  `chessdb_master.ts`/`MasterGameView_master.tsx` to their `consumers` lists alongside the
  existing player-side consumers.

### .claude/CLAUDE.md
- Updated the "Extract `ChessBoardView_shared.tsx`'s remaining inline panels..." Outstanding Item:
  all six panels now also exist on `MasterGameView_master.tsx` (feature parity achieved), but as
  separately-duplicated inline JSX, not a shared component — the original "split into components"
  motivation is now stronger (a future tweak has to be made in both files). Removed the stale
  claim that Moves Played/Games Played "master games structurally cannot use" — `chessdb_master.ts`
  now provides a master-scoped equivalent.

## Plan (continued — nav restructure: Home/Back to the top, split Player/Master tabs)

**Trigger:** unrelated to the master-game-view-parity work above — appended here per the
one-plan-at-a-time convention rather than as a separate file. User observation: the Home/Back nav
("⌂ Home ← Back") renders below the player-switcher cards and `AppNav` tabs, deep inside each
page's own component, instead of at the top of the page (like other projects' nav). Two agreed
changes:

1. **Home/Back moves to the top of every page that has one** (`/analyze`, `/analyzemaster`,
   `/position/[id]`), rendered by `AppShell` before the player cards/`AppNav`, instead of inside
   each page's own component. **The existing session-storage back-stack mechanism
   (`src/lib/backNav.ts`'s `popBackTarget`) is not touched or redesigned** — `MyBackHomeNav`/
   `BackButton` keep being called with the exact same props as today, just from a new location.
   Only the *per-route fallback/backPath/backLabel values* move from being hardcoded at each
   page's own call site into a small pathname-keyed lookup inside `AppShell`:
   - `/analyze` → `MyBackHomeNav` (default Home `/`), `BackButton fallback='/'`
   - `/analyzemaster` → `MyBackHomeNav backPath='/mastergames' backLabel='Masters Games'`,
     `BackButton fallback='/mastergames'`
   - `/position/[id]` (pathname starts with `/position/`) → `MyBackHomeNav` (default Home `/`),
     `BackButton fallback='/habits'`
   - Every other pathname → no Home/Back row at all, same as today (Games/Habits/Graph/Openings/
     Endings/Masters Games list pages don't show one now either).
   - `/owner/*` stays fully excluded, unchanged (`AppShell`'s existing `isOwner` early return).
2. **`AppNav` splits into two labeled groups**, both always shown on every non-owner page
   (including `/mastergames`/`/analyzemaster`, which today show only the flat tab list with no
   player cards): a "Player" group (Games/Habits/Graph/Openings/Endings) and a "Master" group
   (Masters Games) — each under its own small header/label. No routing/visibility logic changes
   for `AppNav` itself, since it already renders identically on every page today — this is a
   rendering/grouping change only.

- [x] In `src/ui/AppShell.tsx`, add a small pathname-keyed helper (e.g. `getBackNavConfig(pathname)`)
      returning `{ backPath?: string; backLabel?: string; fallback: string } | null` for the 3
      routes listed above (`null` for every other pathname). Render `<MyBackHomeNav .../>
      <BackButton fallback={...} />` at the very top of `AppShell`'s output (before `PlayerHeader`/
      `AppNav` in the non-master branch, before `AppNav` in the `isMasterGames` branch) whenever
      the config is non-null for the current pathname. Match `/position/[id]` via a prefix check
      (`pathname?.startsWith('/position/')`), the same style `isOwner`/`isMasterGames` already use.
- [x] Remove the now-duplicate `<MyBackHomeNav .../>`/`<BackButton .../>` JSX from each page that
      had its own: `ChessBoardView_shared.tsx`, `MasterGameView_master.tsx`, `PositionDetail.tsx`.
      Leave `analyze/page.tsx`'s and `analyzemaster/page.tsx`'s own `MyBackHomeNav` calls (their
      loading/error-state fallback renders, shown before the main view mounts) — those are a
      separate, narrower use (an error/loading screen, not the main page chrome) and are out of
      scope for this pass.
- [x] Split `SECTIONS` in `src/ui/AppNav.tsx` into two arrays — `PLAYER_SECTIONS` (Games/Habits/
      Graph/Openings/Endings) and `MASTER_SECTIONS` (Masters Games) — and render each under its own
      small heading/label (e.g. a `text-xxs text-gray-400 uppercase` label above each button row,
      matching this project's existing small-label style elsewhere, e.g. "From our own synced
      master games" in `MasterGameView_master.tsx`). Keep the existing active-tab
      highlighting/`buildHref`/`GLOBAL_FILTER_KEYS` logic unchanged — this is a rendering/grouping
      change only, no behavior change to what each link does.
- [x] `npx tsc --noEmit` clean.
- [x] User follow-up: the Player and Master tab groups should sit side by side (Master to the
      right of Player), not stacked vertically. Change `AppNav.tsx`'s outer container from
      `space-y-1` (vertical stack) to a horizontal flex row (e.g. `flex items-end gap-6`), each
      `TabGroup` keeping its own label above its row of links.
- [x] User follow-up: box each tab group using the shared `MyBox` component (not a bespoke div) —
      `<MyBox title='Player' className='bg-blue-50 ...'>` and `<MyBox title='Master'
      className='bg-amber-50 ...'>`, replacing `TabGroup`'s own separate label text with `MyBox`'s
      `title`.
- [x] User follow-up: `MASTER_SECTIONS`' tab label reads "Masters Games" — redundant now that it
      sits inside a `MyBox` titled "Master". Change the label to just `'Games'`, matching the
      Player group's own "Games" tab label.
- [x] User follow-up: highlight whichever `TabGroup` box (Player or Master) contains the active
      tab, mirroring `PlayerProfile.tsx`'s own `selected` styling exactly — same
      `outline outline-2 outline-yellow-400` classes, applied to the group's `MyBox` when
      `activeKey` matches one of that group's own section keys.
- [x] User follow-up: fold the `PlayerProfile` cards (currently rendered as their own row above
      `AppNav`, inside `PlayerHeader` in `AppShell.tsx`) into the Player `TabGroup`'s own `MyBox`,
      replacing its `title='Player'` text — same `PlayerProfile` styling/2-column-grid layout,
      unchanged, just relocated. Add an optional `playerCards?: React.ReactNode` prop to `AppNav`;
      `PlayerHeader` builds the cards JSX (same fetch/render logic as today) and passes it in,
      instead of rendering it as a separate sibling row. The Player `TabGroup` renders `playerCards`
      inside its `MyBox` (above the tab row) when provided, and nothing there when not — on
      `/mastergames`/`/analyzemaster` (`AppShell`'s `isMasterGames` branch, which calls bare
      `<AppNav />` with no `playerCards`), the Player box gets no header/cards at all, not a
      fallback "Player" title. The Master `TabGroup` keeps its `title='Master'`, unchanged.
      Change `AppNav`'s outer container from `flex items-end gap-6` to `flex items-stretch gap-6`
      so the Master box's height automatically matches the (now taller) Player box via flexbox's
      default stretch behavior — no hardcoded height value.
- [x] User correction: player cards should always show, including on `/mastergames`/
      `/analyzemaster` — the "no header at all" behavior there was wrong (that was pre-existing
      behavior carried over from before this pass, per the old "player selection doesn't apply to
      master-games data" design comment, not something newly introduced, but the user wants it
      changed now). Remove `AppShell`'s `isMasterGames`-specific branch entirely (it's otherwise
      identical to the normal branch) — every non-owner page always renders `PlayerHeader`.
- [x] User follow-up: add a dummy placeholder entry to the Master box, reusing `PlayerProfile`
      (same component, not a bespoke element) with a hardcoded name ("Magnus Carlsen", per the
      user's own suggestion) and a generic placeholder-silhouette avatar (a small inline SVG data
      URI, not a real hotlinked photo) — no `ratings`, no `onClick`/`selected` (not wired to real
      data). Passed as the Master `TabGroup`'s `topContent`, same mechanism the real player cards
      already use for the Player group. Stand-in for the "top masters" idea already logged as a
      future Outstanding Item in `.claude/CLAUDE.md` — this dummy entry gets replaced once that's
      actually built.
- [x] User follow-up: remove the "Master" title (`label='Master'`) from the Master `TabGroup` —
      same treatment as the Player box (content replaces the title, not both).
- [x] User follow-up: make the Magnus Carlsen card real instead of hardcoded — `AppNav.tsx` gets a
      `useEffect` calling the existing `getMasterPlayers('Carlsen')` (from `masterPlayers.ts`, no
      new backend function) on mount, and builds `<PlayerProfile player={chesscomHandle}
      displayName="Magnus Carlsen" avatar={DUMMY_AVATAR_SVG} ratings={{ Grade: grade }} />` from
      the real row (`mst_mstid=22`, `mst_grade=2823`, `mst_chesscom_handle='MagnusCarlsen'`,
      confirmed present in `tmst_master_players` on local). Replaces the current hardcoded
      `DUMMY_MASTER_CARD` constant. No `onClick`/`selected` — static display only, per explicit
      agreement (no "select a master" mechanism exists anywhere yet). The placeholder-silhouette
      avatar stays (no stored avatar URL for masters in `tmst_master_players`).
- [x] User follow-up: broaden `PlayerProfile.tsx`'s header comment (currently "one tracked
      player's header card") so it's not described as player-only, since it's now used for a
      master card too — no prop/logic changes, its existing generic props (`player`, `displayName`,
      `avatar`, `ratings`, `onClick`, `selected`) already fully support this with no amendment
      needed. Explicitly not a new component, per the user's instruction.

## Changes (continued — nav restructure)

### src/ui/AppShell.tsx
- Added `getBackNavConfig(pathname)` — returns `{ backPath?, backLabel?, fallback }` for
  `/analyze`, `/analyzemaster`, and any `/position/*` route (`null` for every other pathname,
  meaning no Home/Back row, same as before). Added `BackNavRow`, rendering `MyBackHomeNav` +
  this project's own `BackButton` in the same `MyBox`-wrapped layout each page used to render
  locally. Rendered at the top of both the `isMasterGames` and normal branches, before
  `AppNav`/`PlayerHeader`. The session-storage back-stack mechanism (`BackButton`/`backNav.ts`)
  itself was not touched — only relocated which component renders it and where its per-route
  props come from.
- New imports: `MyBackHomeNav` (nextjs-shared), `MyBox` (nextjs-shared), `BackButton` (local).

### src/ui/board/ChessBoardView_shared.tsx
- Removed the local `MyBox`-wrapped `MyBackHomeNav`/`BackButton` header block — now rendered by
  `AppShell`. Removed the now-unused `MyBackHomeNav`/`BackButton` imports.

### src/ui/board/MasterGameView_master.tsx
- Removed the local `MyBox`-wrapped `MyBackHomeNav`/`BackButton` header block — now rendered by
  `AppShell`. Removed the now-unused `MyBackHomeNav`/`BackButton` imports.

### src/ui/analysis/PositionDetail.tsx
- Removed the local `MyBox`-wrapped `MyBackHomeNav`/`BackButton` header block — now rendered by
  `AppShell`. Removed the now-unused `MyBackHomeNav`/`BackButton`/`MyBox` imports (`MyBox` had no
  other use in this file).

### src/ui/AppNav.tsx
- Split the single flat `SECTIONS` array into `PLAYER_SECTIONS` (Games/Habits/Graph/Openings/
  Endings) and `MASTER_SECTIONS` (Masters Games). Added a `TabGroup` helper component (label +
  its row of tab links) to render each group under its own small uppercase label, avoiding
  duplicating the tab-row JSX for the two groups. Active-tab highlighting/`buildHref`/
  `GLOBAL_FILTER_KEYS` logic unchanged.
- User follow-up: changed the outer container from `space-y-1` (vertical stack) to `flex
  items-end gap-6` (horizontal row), so the Master group sits to the right of the Player group
  instead of stacked below it.
- User follow-up: `TabGroup` now renders each group inside `MyBox` (`title` prop replaces the
  former standalone `<p>` label) instead of a bespoke `<div>`, with `boxClassName` giving each
  group its own background tint — `bg-blue-50` for Player, `bg-amber-50` for Master. New import:
  `MyBox` (nextjs-shared).
- User follow-up: `MASTER_SECTIONS`' tab label changed from `'Masters Games'` to `'Games'` —
  redundant with the `MyBox title='Master'` heading it now sits inside.
- User follow-up: `TabGroup` now computes `isGroupActive` (`sections.some(s => s.key ===
  activeKey)`) and applies `outline outline-2 outline-yellow-400` to its `MyBox` when true —
  mirrors `PlayerProfile.tsx`'s own `selected` highlight styling exactly (same classes), so
  whichever group (Player or Master) contains the current page's active tab gets the same yellow
  highlighted border the active player card uses.
- User follow-up: `AppNav` now accepts an optional `playerCards?: React.ReactNode` prop. `TabGroup`
  gained a `topContent` prop (rendered inside the `MyBox`, above the tab row) alongside its
  existing `label` (now optional) — the Player group passes `topContent={playerCards}` and no
  `label`; the Master group keeps `label='Master'`. Outer container changed from `flex items-end
  gap-6` to `flex items-stretch gap-6` so the Master box's height automatically matches the Player
  box's (now taller, once cards render) via flexbox stretch.
- User follow-up: added `DUMMY_AVATAR_SVG` (a generic placeholder-silhouette SVG data URI, not a
  real photo) and `DUMMY_MASTER_CARD` (a hardcoded `PlayerProfile` — `player='magnuscarlsen'`,
  `displayName='Magnus Carlsen'`, no `ratings`/`onClick`/`selected`) — passed as the Master
  `TabGroup`'s `topContent` alongside its existing `label='Master'`, so the Master box now has
  comparable visual weight to the Player box's real cards. New import: `PlayerProfile` (local).
  Stand-in for the future "top masters" panel (see `.claude/CLAUDE.md` Outstanding Items).

### src/ui/AppShell.tsx
- User follow-up: `PlayerHeader` now builds the `PlayerProfile` cards JSX into a `playerCards`
  const (same fetch/render logic, same 2-column-grid layout, unchanged) and passes it to
  `<AppNav playerCards={playerCards} />` instead of rendering the cards as a separate row above
  `AppNav`. Updated the file header's `1) DESCRIPTION`/`2) NOTES` to describe this.
- User correction: removed the `isMasterGames`-specific branch entirely (it was otherwise
  identical to the normal branch) — every non-owner page now always renders `PlayerHeader`, so
  player cards show on `/mastergames`/`/analyzemaster` too, not just elsewhere. The `isOwner`
  early return is unchanged. Updated the file header to drop the now-inaccurate "master-games
  pages... drop the tracked-player cards" line.

### src/ui/AppNav.tsx (user follow-up — real Magnus Carlsen card)
- Removed `label='Master'` from the Master `TabGroup` call — content (the card, below) replaces
  the title now, same as the Player group.
- Removed the hardcoded `DUMMY_MASTER_CARD` constant. Added a `masterCard` state
  (`MasterPlayerRow | null`) and a mount `useEffect` calling the existing `getMasterPlayers
  ('Carlsen')` (from `masterPlayers.ts` — no new backend function), matching the row whose
  `chesscomHandle` is `'magnuscarlsen'` (falls back to the first result). Built a
  `masterCardContent` JSX block from the real row — `<PlayerProfile player={chesscomHandle}
  displayName="{firstName} {lastName}" avatar={MASTER_CARD_AVATAR} ratings={{ Grade: grade }} />`
  — no `onClick`/`selected` (static display only, per explicit agreement — no "select a master"
  mechanism exists anywhere yet). Renders `null` (nothing) until the fetch resolves.
  `DUMMY_AVATAR_SVG` renamed to `MASTER_CARD_AVATAR` (still a placeholder silhouette — no stored
  avatar URL for masters in `tmst_master_players`).
- New imports: `useState`/`useEffect` (react), `getMasterPlayers`/`MasterPlayerRow` (local
  `masterPlayers.ts`).

### src/ui/player/PlayerProfile.tsx
- User follow-up: broadened the file header's `1) DESCRIPTION` — no longer describes itself as
  player-only ("one tracked player's header card"), now covers both a tracked player and a master
  card (AppNav's Master box), since its existing props (`player`/`displayName`/`avatar`/`ratings`/
  `onClick`/`selected`) already generically support both with zero logic changes. No new
  component, per explicit instruction.

## Testing

- [ ] Open `http://localhost:4050/analyzemaster?game=13488` and confirm the layout now matches
      `http://localhost:4050/analyze?game=74601&player=astarrboy`: header box with Back links,
      opening-name line above the grid, 3-column layout (board / pink Moves box / yellow Position
      Analysis box).
- [ ] On the master board, drag a piece to try a variation move and confirm it works (creates a
      branch, board updates) — same as the player board.
- [ ] Click through a few moves on a master game with existing evaluations and confirm blunder/
      mistake/inaccuracy squares highlight on the board, same colors as the player view.
- [ ] Click "Copy FEN" in the Stockfish panel and confirm the button shows "Copied" and the FEN is
      actually on the clipboard.
- [ ] Click "Analyze Position" (the deep/infinite analysis button) on a master position, let it run
      briefly, then click "Stop". Confirm alternative lines appear and clicking one adds a
      variation to the move tree.
- [ ] Confirm "Moves Played" and "Games Played" panels now appear in Column 3 for a master game,
      populated with data scoped to that game's own master (`row.mgd_player`) — not every synced
      master. Click a "Moves Played" row and confirm "Games Played" narrows to just that move.
- [ ] Click a row in the new "Games Played" panel and confirm it navigates to
      `/analyzemaster?game=<mgdid>` for that game.
- [ ] Confirm there is no "Final Eval" column/value anywhere on the master view (game-info row or
      Games Played) — this was deliberately dropped, not just hidden.
- [ ] In the "Chess.com Games" panel, run a search and confirm results appear, same as the player
      view.
- [ ] Confirm the move tree's frequency badges (small counts next to moves) now appear on the
      master view, matching the player view's behavior.
- [ ] Open `/analyze` for one of your own tracked-player games and confirm nothing regressed there
      (layout, Moves Played/Games Played, Stockfish panel, deep analysis) — `ChessBoardView_shared`
      only had its `CLASSIFICATION_SQUARE_COLORS`/`collectNodesFromMove`/`getCurrentMoveLabel`
      definitions moved to shared modules and 3 constants renamed, no behavior change intended.
- [ ] Open `/owner/constants` and confirm `MOVE_COUNT_MIN_MOVE`, `POSITION_GAMES_ROWS_DEFAULT`, and
      `POSITION_GAMES_ROWS_OPTIONS` show up correctly with both player and master consumers listed.
- [ ] Open `/analyze?game=...` and confirm "⌂ Home ← Back" now renders at the very top of the page
      (above the player-switcher cards and the Games/Habits/... tabs), and that Back still returns
      to wherever you actually came from (session-storage back-stack), falling back to `/` if
      opened directly.
- [ ] Open `/analyzemaster?game=...` and confirm "⌂ Home ← Masters Games ← Back" renders at the
      top (above the tabs), Home goes to `/mastergames`, and Back falls back to `/mastergames` if
      opened directly.
- [ ] Open a position detail page (`/position/[id]`, e.g. via a Habits row) and confirm "⌂ Home
      ← Back" renders at the top, and Back falls back to `/habits` if opened directly.
- [ ] Open `/`, `/habits`, `/graph`, `/openings`, `/endings`, and `/mastergames` and confirm none
      of them show a Home/Back row (unchanged from before — only the 3 routes above ever had one).
- [ ] On any non-`/owner` page, including `/mastergames`/`/analyzemaster`, confirm the left box
      always shows the player cards (avatar/name/rating badges, same as before) in place of a
      "Player" title, with the Games/Habits/Graph/Openings/Endings tab row below them inside the
      same box. Confirm clicking a player card still filters by that player, and clicking a
      rating badge still sets both player+timeClass, same as before.
- [ ] Confirm the right box shows no "Master" title (removed, same as Player), a real "Magnus
      Carlsen" card with a "Grade: 2823" badge and a generic silhouette avatar (not a real photo,
      non-interactive — clicking it does nothing), and the "Games" tab — and that both boxes
      render at the same height.
- [ ] Confirm clicking into the Player tabs from `/mastergames`/`/analyzemaster` (e.g. "Games")
      navigates correctly.
- [ ] Confirm the correct box (Player or Master) still gets the yellow outline highlight matching
      whichever page you're on, and that clicking a tab still carries the global filters
      (player/timeClass/dateFrom/opening/eco) across navigation as before.
- [ ] Open `/owner` and confirm it's unaffected — no Home/Back row, no Player/Master tabs (still
      its own separate chrome).
- [ ] `npx tsc --noEmit` already confirmed clean after the full implementation.
