# PLAN_combine-player-master-moves-games — chess

## Title
Analysis changes: combine moves played (player) and master moves played in the same position, with an indicator of which is which — consider a toggle to combine vs separate. Also consider combining games played (player games vs master games) similarly.

## Pivot (2026-09-13)

The Combined Moves/Games experiment is abandoned — decided not worth keeping after the
investigation above surfaced real, pre-existing correctness problems in the underlying data
(mover-perspective mixing in Win%/Score%, and possible per-game double-counting of "times" on
transposition) that the combine feature only made visible, but didn't cause. Since both new panels
were built additively (agreed at the start of this plan, specifically so this exact outcome — scrap
without disrupting anything else — would be a clean revert), removing them requires no cleanup
elsewhere.

New direction, same plan file (per this project's "one plan at a time" convention):
1. Revert: remove `CombinedMovesPanel`/`CombinedGamesPanel` and their `ChessBoardView_shared.tsx`
   wiring. Leave `masterGamesList.ts`'s `fetchMasterGamesForFenPage`/`getMasterGamesForFenCount`/
   `getMasterPositionByFen` and `MasterGamesDbPanel.tsx`'s real pagination in place — that work
   stands on its own merit for "Master Games (Our DB)", independent of the abandoned combine idea.
   `COMBINED_GAMES_PLAYER_LIMIT`/`COMBINED_GAMES_MASTER_LIMIT` become unused once the panels are
   removed — remove them from `constants.ts` and `owner/constants/page.tsx` too rather than leaving
   dead constants behind.
2. Fully understand and fix "Moves Played" and "Games Played" (the player-side panels) — the
   Win%/Times correctness issues found apply here too, not just to the abandoned combine panels.
   **Still needs a decision (see chat) on what Win%/Times should actually mean**: mover-based (only
   count a row when the tracked player's color matches the position's side-to-move) vs.
   objective/color-based (ignore who's tracked, credit whichever color actually won) vs. some other
   framing — this changes real, long-standing behavior, not just the new panels, so needs to be
   agreed before any query changes are made.
3. Add filters to the Games Played list — **needs specifics**: which fields (opponent rating,
   result, termination, date range, opening?), and whether client-triggered (per the
   [[feedback_server_side_fetch_filter_default]] rule, these must be real server-side query
   parameters, not client-side `.filter()`).

## Plan

Design (agreed 2026-09-13): additive only — new panels alongside the existing four, nothing
replaced or removed, so the existing Moves Played / Master Moves / Games Played / Master Games
panels can still be compared against the new ones. "Master" data source = Our DB
(`tmpos_`/`tmgam_`/`tmgd_`, via `getMasterGamesForFen`), not the Lichess Explorer pair. Route
scope: `/analyze` only. Both new panels are self-contained shared components (own props/own
fetching), not inline JSX in `ChessBoardView_shared.tsx`.

Constraint decision (agreed 2026-09-13, revised from an initial "reuse `MASTER_GAMES_FOR_FEN_LIMIT`"
proposal): Combined Games introduces two new, independent constants — `COMBINED_GAMES_PLAYER_LIMIT
= 50` and `COMBINED_GAMES_MASTER_LIMIT = 50` — rather than reusing `MASTER_GAMES_FOR_FEN_LIMIT`, so
tuning the standalone Master Moves/Games (Our DB) panels later never silently affects this one.

- [x] Add `src/ui/board/CombinedMovesPanel.tsx` — props `fen: string`, `player: string`. Fetches
      `getMoveSummaryForPosition_player(fen, player)` and `getMasterGamesForFen(fen)` (using
      existing `MASTER_GAMES_FOR_FEN_LIMIT`, unchanged — Moves needed no new constant), merges the
      two move lists by `move_uci` (union — a move present in only one source still gets a row),
      sorted by combined total times descending. Columns: Move | Player Times | Player Win% |
      Player Eval | Master Times | Master Win% | Master Draws | Master Avg Opp Rating.
      Missing-side cells show "—". Player win% via existing `winPct()` helper; no pagination
      (matches current Moves Played panel).
- [x] Add `src/ui/board/CombinedGamesPanel.tsx` — props `fen: string`, `player: string`. Fetches
      player games via `fetchGamesForPosition_player(fen, player, 1, COMBINED_GAMES_PLAYER_LIMIT)`
      and master games via `getMasterGamesForFen(fen, COMBINED_GAMES_MASTER_LIMIT).games`, tags
      each row with a Source column (Player/Master), merges and sorts by year/date descending
      (master rows sort key falls back to Jan 1st of their year, no month/day available), then
      paginates the merged, already-fetched list purely for display (a local slice, not a further
      server fetch) using the existing `POSITION_GAMES_ROWS_OPTIONS`/`POSITION_GAMES_ROWS_DEFAULT`
      constants and `MyPaginationFooter` (nextjs-shared). Columns: Source | Move | Result |
      Year/Date | Detail (Player rows: opponent rating + termination; Master rows: White/Black
      usernames). Application-level merge of two independently-fetched, capped result sets — not
      a single cross-table SQL query (player and master data live in separate table sets).
- [x] Add `COMBINED_GAMES_PLAYER_LIMIT`/`COMBINED_GAMES_MASTER_LIMIT` to `src/lib/constants.ts`
      and mirror both into `src/app/owner/constants/page.tsx` (`CONSTANTS_SECTIONS` +
      `FUNCTION_DESCRIPTIONS`), per this project's "Constants page must be updated whenever
      constants.ts changes" convention.
- [x] Render both new panels in `ChessBoardView_shared.tsx` (`/analyze` route only), placed
      additively below/alongside the four existing panels — no existing panel JSX, fetch, or
      state is modified or removed.
- [x] Apply standard conventions: numbered main-header comment block on each new component (per
      global CLAUDE.md), `function` declarations (not arrow consts) where possible, explicit
      TypeScript types for props/returns.
- [x] Run `npx tsc --noEmit` to confirm no type errors.
- [x] Reorder: move `CombinedMovesPanel`/`CombinedGamesPanel` in `ChessBoardView_shared.tsx` to
      render above the player panels — immediately before "Moves Played" — instead of their
      previous position after "Master Games (Lichess)".
- [x] Combined Moves column changes: renamed "Player Eval" header to "Eval"; removed the "Master
      Draws" and "Master Avg Opp Rating" columns entirely, including their underlying
      `masterDraws`/`masterAvgOpponentRating` fields in `CombinedMoveRow` and the merge logic in
      `fetchCombinedMoves`.
- [x] BUG diagnosed and root cause confirmed (2026-09-13) — **fix belongs in `nextjs-shared`, not
      this project (project isolation)**. Root cause: `MyPaginationFooter_dftClass`
      (`nextjs-shared/src/constants.ts:181`) is `grid grid-cols-3` — three equal-width columns
      (rows-select | pagination | total-rows). In a narrow sidebar panel, once a list has enough
      pages (7+ pages = 9+ clickable cells), the pagination content overflows its 1/3 track and
      visually sits under the opaque "N rows" total-count `<div>` in the third column, which
      intercepts clicks — landing specifically on the right arrow (the rightmost, most-overflowing
      element). Styling (disabled/enabled) was never wrong, only the click hit-testing. Confirmed
      by temporarily forcing `MyPaginationFooter`'s width way up (`overrideClass='min-w-[1200px]'`
      on `CombinedGamesPanel.tsx`'s call) — the right arrow became clickable, then the temp
      override was reverted (this project has no lasting change from this diagnosis). Reproduced
      identically on "Games Played", "Combined Games", and "Master Games (Our DB)" — confirms it's
      the shared component, not any one caller. Proposed fix (given to the user to apply from a
      `nextjs-shared` session): change `MyPaginationFooter_dftClass` to
      `grid grid-cols-[auto_1fr_auto] items-center px-2 py-1 rounded-md bg-yellow-100` so the outer
      columns size to their actual (small) content instead of a fixed third each, leaving the
      middle pagination column the remaining space. Needs checking against other consuming
      projects' layouts before rollout. **No action item remains in this (chess) project** for
      this bug — it will resolve automatically once nextjs-shared is fixed and reinstalled here.
- [x] Added real server-side pagination to "Master Games (Our DB)": `masterGamesList.ts` gained
      `getMasterPositionByFen` (shared position lookup, factored out of `getMasterGamesForFen` to
      avoid triplicating it), `fetchMasterGamesForFenPage(fen, page, itemsPerPage, move?)`, and
      `getMasterGamesForFenCount(fen, move?)` (returns `mpos_reached` directly when no move filter,
      since that's already the exact count — a real `COUNT(*)` only when a move filter is applied).
      `getMasterGamesForFen`'s per-move breakdown aggregation is untouched (stays on its existing
      full/capped fetch — paging a per-move aggregate makes no sense). `MasterGamesDbPanel.tsx` now
      does real server-side pagination + a server-side Move filter (previously client-side
      `.filter()` over the flat batch — extended to a real query parameter in the same change,
      since a client-side filter over just the current page would have been broken/misleading;
      mirrors `fetchGamesForPosition_player`'s existing `move?` pattern) via
      `POSITION_GAMES_ROWS_DEFAULT`/`POSITION_GAMES_ROWS_OPTIONS` + `MyPaginationFooter`.
      "Master Moves/Games (Lichess)" panels are explicitly left unpaginated — confirmed 2026-09-13:
      Lichess's Explorer API has no pagination support at all (returns only its own fixed small
      "top games"/moves set, no page/offset param — see `lichess.ts:58`), so server-side pagination
      is impossible there and client-side pagination over the fixed set was declined.
- [x] Run `npx tsc --noEmit` to confirm no type errors.
- [x] BUG fixed: Combined Games was showing all Player rows before any Master rows instead of a
      real date interleave, because `MasterFenGameHit.year` was year-only (no month/day), so
      `CombinedGamesPanel`'s master sort key fell back to `${year}-01-01` — earlier than nearly any
      real dated player game from the same year. Fix (user chose option 2 — also upgrade the
      standalone panel's display, not just fix sorting quietly underneath it): replaced
      `MasterFenGameHit.year: number` with `date: string` (ISO `YYYY-MM-DD`, matching
      `PositionGameHit.date`'s format), derived from the already-fetched `mgd_end_time` in both
      `getMasterGamesForFen` and `fetchMasterGamesForFenPage` (`masterGamesList.ts`).
      `MasterGamesDbPanel.tsx`'s "Year" column is now "Date"/`g.date`. `CombinedGamesPanel.tsx`'s
      master-row `sortKey`/`displayDate` now use `g.date` directly instead of the `${year}-01-01`
      fallback.

## Phase 2 (2026-09-13) — abandon combine, fix correctness, unify panels on both routes

See "## Pivot" above for why. Full design agreed in chat across many rounds; consolidated here.

### 2a. Revert the Combined panels
- [x] Delete `src/ui/board/CombinedMovesPanel.tsx` and `src/ui/board/CombinedGamesPanel.tsx`.
- [x] Remove their imports and rendering from `ChessBoardView_shared.tsx`.
- [x] Remove `COMBINED_GAMES_PLAYER_LIMIT`/`COMBINED_GAMES_MASTER_LIMIT` from `src/lib/constants.ts`
      and their section/entries from `src/app/owner/constants/page.tsx` (`CONSTANTS_SECTIONS` +
      the `CombinedGamesPanel.tsx: CombinedGamesPanel` `FUNCTION_DESCRIPTIONS` entry + the stale
      `CombinedGamesPanel.tsx` consumer references on `POSITION_GAMES_ROWS_DEFAULT`/`OPTIONS`).
- [x] `fetchMasterGamesForFenPage`/`getMasterGamesForFenCount`/`getMasterPositionByFen` in
      `masterGamesList.ts` and `MasterGamesDbPanel.tsx`'s real pagination are **kept** — independent
      of the abandoned combine idea.
- [x] Verified with `npx tsc --noEmit` — clean.

### 2b. Times/Win% correctness fix — both `/analyze` and `/analyzemaster`
Times = count of *distinct games* reaching this move (fixes transposition double-counting — a
`COUNT(DISTINCT gdid)` instead of `COUNT(*)`). Win% = objective White%/Draw%/Black% breakdown
(win=White, draw, loss=White — i.e. Black winning), derived from `gd_player_color`/`gd_player_result`
(player) or `mgd_player_color`/`mgd_player_result` (master), inverting when the tracked entity
played Black; drops the personal-perspective framing entirely, matching Lichess's already-correct
shape. A shared helper for "objective color-result from (color, personal result)" should be
extracted (currently a private `objectiveResult` in `masterGamesList.ts` — needs to be reachable by
`chessdb_player.ts`/`chessdb_master.ts` too, e.g. moved to `chessdb_shared.ts`) rather than
duplicated three times.
- [x] `chessdb_player.ts`: `getMoveSummaryForPosition_player`, `getMovesForPosition_player`, and
      `getPositionDetail_player`'s inline query — rewrote the aggregation to dedup by
      `COUNT(DISTINCT gam_gdid)` and compute White/Draw/Black counts (SQL `FILTER` on
      color+result combos) instead of `mov_wins`/`mov_losses` from `gd_player_result` alone. Also
      added `avg_opponent_rating` (`ROUND(AVG(gd_opponent_rating))`) to all three, since Player's
      Moves Played had no avg-rating column at all before. `objectiveGameResult` added (initially
      to `chessdb_shared.ts`, then moved — see 2c's note on the `'use server'` async-only
      constraint — to a new plain `src/lib/objectiveGameResult.ts`; `masterGamesList.ts`'s private
      `objectiveResult` removed, now imports the shared one) for the per-row Games-list Result
      column.
- [x] `masterGamesList.ts`: `getMasterGamesForFen`'s `byMove` aggregation — same fix, done in JS
      (dedup by `Set<mgdid>` per move) since this aggregation isn't SQL-side.
- [x] `chessdb_master.ts`: `getMoveSummaryForPosition_master` (the `/analyzemaster`-route mirror) —
      same fix, mirroring 2b's first bullet (same shape, per this project's established
      `_Player`/`_Master` mirrored-function convention), including `avg_opponent_rating`.
- [x] `buildHabits.ts`: `fetchHabitAggregates` — dedup-only fix (`COUNT(DISTINCT gam_gdid)` for
      `move_times`/`move_wins`/`move_losses`, and the `HAVING` clause). Its existing side-to-move
      color check was already correct, so its personal win/loss stayed unchanged (NOT converted to
      White/Draw/Black). **Reminder for completion message:** existing `thab_habits` rows need the
      "Build Habits" pipeline step re-run manually afterward to reflect this fix — precomputed
      table, not live.

### 2c. Shared `GamesListTable`/`MovesListTable` components — both routes
Columns (Games): Move | White (name + rating, bold if this row's tracked entity is White) | Black
(name + rating, bold if Black) | Date | Result (`1-0`/`0-1`/`½-½`) | Termination (blank if
unavailable) | Final Eval (blank if unavailable) | Game (link, or a real external `<a>` for
Lichess). Columns (Moves): Move | Times | White% | Draw% | Black% | Avg Rating | Eval (blank for
Master (Our DB) and Lichess).
- [x] `chessdb_player.ts`: added `white_username`/`black_username`/`white_rating`/`black_rating`/
      `result` to `PositionGameHit` + `mapPositionGameRow` (already selected via `fetchFiltered`'s
      default columns — just not mapped yet).
- [x] `masterGamesList.ts`: added `mgd_white_rating`/`mgd_black_rating`/`mgd_termination` to the
      `SELECT` list and `MasterFenGameHit` shape in both `getMasterGamesForFen` and
      `fetchMasterGamesForFenPage`.
- [x] `chessdb_master.ts`: same column additions to its `/analyzemaster`-route games-list function
      (`MasterPositionGameHit`/`mapMasterPositionGameRow`), plus the same Times/Win% dedup+
      White/Draw/Black fix and `avg_opponent_rating` addition to `getMoveSummaryForPosition_master`.
- [x] Built `src/ui/board/GamesListTable.tsx` and `src/ui/board/MovesListTable.tsx` — presentational
      only, take normalized rows as props, no data-fetching of their own. `GamesListTable` also
      supports a per-row `externalHref` (a real `<a target="_blank">`, for Lichess games) as an
      alternative to `onRowClick`.
- [x] Refactored "Moves Played", "Games Played", "Master Moves (Our DB)"
      (`MasterMovesDbPanel.tsx`), "Master Games (Our DB)" (`MasterGamesDbPanel.tsx`), "Master Moves
      (Lichess)", and "Master Games (Lichess)" — on **both** `/analyze`
      (`ChessBoardView_shared.tsx`) and `/analyzemaster` (`MasterGameView_master.tsx`) — to use the
      shared components. `PositionDetail.tsx` (`/position/[id]`, a third route not in this plan's
      scope) got only the minimal fix needed to keep compiling against the new `MoveRow` shape
      (White/Draw/Black columns added to its own existing table), not a switch to the shared
      component.
- [x] `objectiveGameResult_shared` was initially added to `chessdb_shared.ts`, but that file has
      `'use server'`, which requires every export to be an async server action — a plain sync
      helper doesn't belong there (caught by `npm run build`, not `tsc`). Moved to a new plain
      utility file `src/lib/objectiveGameResult.ts` (no directive), matching the existing
      `winPct.ts`/`formatCp.ts` pattern, and renamed to `objectiveGameResult` (drops the now
      inaccurate `_shared` suffix, since it isn't in a `chessdb_shared.ts`-style shared-server-
      actions file anymore).

### 2e. Verification
- [x] Run `npx tsc --noEmit` to confirm no type errors.
- [x] Run `npm run build` to confirm a full production build succeeds (this is what caught the
      `'use server'`-file-must-be-async issue above, which `tsc` alone did not).

### 2f. Widen the third layout column
The panels column (Moves Played/Games Played/etc.) was a fixed `600px` in both
`ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`'s `xl:grid-cols-[480px_480px_600px]`
layout — too narrow for the new shared tables' wider column set (up to 8 columns), causing values
to wrap onto two lines.
- [x] Widened to **900px** in both files (`xl:grid-cols-[480px_480px_900px]`, and the matching
      `w-[600px]` wrapper div around that column's content in each file → `w-[900px]`).
- [x] Verified with `npx tsc --noEmit` — clean.

### 2g. "Position Analysis" header — Player/Master badge + move FEN/Copy FEN here
Two related requests on the same header line, done together:
- [x] Route disambiguation (requested 2026-09-13, after the "Games Played showing master data"
      confusion turned out to be a pre-existing `/analyzemaster` scoping ambiguity, not a bug):
      added a small colored badge reading "Player" (`bg-blue-600`) or "Master" (`bg-purple-600`)
      immediately before "Position Analysis {currentMoveLabel}", in `ChessBoardView_shared.tsx`
      and `MasterGameView_master.tsx` respectively (each file hardcodes its own badge — no shared
      component, they never render the other's badge).
- [x] Moved FEN/Copy FEN onto the header line too (was the first row inside the "Stockfish" box) —
      header is now a `flex justify-between` row: badge + label on the left, FEN + Copy FEN button
      on the right, in both files.
- [x] Verified with `npx tsc --noEmit` — clean.

### 2h. Active nav tab background color
`AppNav.tsx`'s `TabGroup` (the Games/Habits/Graph/Openings/Endings and Masters-Games top nav)
previously highlighted the active tab with only an underline + blue text
(`border-blue-600 text-blue-600`), no background.
- [x] Added `bg-blue-100` to the active tab's `<Link>` className, alongside the existing
      underline/text-color styling.
- [x] Verified with `npx tsc --noEmit` — clean.

### 2i. `/analyzemaster` doesn't highlight the Masters "Games" tab
`AppNav.tsx`'s `activeKey` ternary had a case for every player-side route plus `/mastergames`, but
none for `/analyzemaster` — so visiting it left the Masters "Games" tab unhighlighted. Unlike
`/analyze` (deliberately cross-cutting per the existing comment — reachable from Games/Habits/
Openings), `MASTER_SECTIONS` has only one tab ("Games" → `/mastergames`), so `/analyzemaster` is
unambiguously owned by it.
- [x] Added `pathname === '/analyzemaster' ? 'mastergames'` to the ternary, with a comment noting
      why it differs from `/analyze`'s cross-cutting case.
- [x] Verified with `npx tsc --noEmit` — clean.

### 2j. Tinted background per panel group
The third column's panels (Stockfish, Moves Played/Games Played, Master Moves/Games (Our DB),
Master Moves/Games (Lichess), Chess.com Games) previously all sat in one uniform `bg-yellow-50`
column background, in both `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx`.
- [x] Removed the column-level `bg-yellow-50`; wrapped each logical group in its own tinted
      `rounded-lg` div instead — Stockfish: `bg-gray-100`; Player/"this master's own"
      (Moves Played + Games Played): `bg-blue-50`; Master (Our DB) (Master Moves + Master Games):
      `bg-purple-50`; Lichess (Master Moves + Master Games): `bg-green-50`; Chess.com Games:
      `bg-orange-50`. Individual `MyBox` panels keep their own look inside each wrapper.
- [x] The two Lichess panels were previously two independently-gated blocks
      (`{currentNode && (...)}` and `{currentNode && mastersData && ...}`) — restructured into one
      `{currentNode && (<div className='...bg-green-50...'>...)}` wrapper with the second panel's
      now-redundant `currentNode &&` dropped from its own condition, so both share one wrapper.
- [x] Verified with `npx tsc --noEmit` and `npm run build` — both clean.

### 2k. `/analyze` doesn't highlight the "Games" tab (reopens a prior deliberate decision)
`/analyze` was deliberately left unhighlighted (per the existing comment: reachable from more than
one section — Games/home, and `/position/[id]` which itself comes from Habits). Reconsidered
2026-09-13: `AppShell.tsx` already treats `/` (Games) as `/analyze`'s back-button fallback, so
there's existing precedent for treating Games as the assumed default origin. Considered adding a
dedicated "Analysis" nav tab instead — declined: unlike the other tabs, `/analyze` has no
meaningful default destination without a specific game already selected, so it doesn't fit the
"tab = real landing page" pattern the rest of the nav follows. Agreed: always highlight "Games" for
`/analyze` (accepted tradeoff — technically "wrong" in the rarer case of arriving via
Habits/`/position/[id]`; tracking the real origin tab was considered and declined as unnecessary
added complexity). `/position/[id]` itself is unaffected — still unhighlighted, not part of this
request.
- [x] Added `pathname === '/' || pathname === '/analyze' ? 'games'` to the ternary; updated the
      explanatory comment to note `/analyze` is no longer treated as unowned, only
      `/position/[id]` still is.
- [x] Verified with `npx tsc --noEmit` — clean.

### src/lib/constants.ts
- Added `COMBINED_GAMES_PLAYER_LIMIT = 50` and `COMBINED_GAMES_MASTER_LIMIT = 50`, own dedicated
  constants for the new Combined Games panel's per-source fetch caps (independent of
  `MASTER_GAMES_FOR_FEN_LIMIT`, per the agreed constraint decision above).

### src/app/owner/constants/page.tsx
- Added a "Combined Moves/Games (player + master, same position)" section listing the two new
  constants, and a `FUNCTION_DESCRIPTIONS` entry for `CombinedGamesPanel.tsx: CombinedGamesPanel`,
  per this project's convention that the Constants page is a manually-curated mirror of
  `constants.ts`.

### src/ui/board/CombinedMovesPanel.tsx (new)
- New self-contained panel comparing player vs. master (Our DB) move stats for the current board
  position, one row per distinct move (union by `move_uci`), side-by-side columns per source,
  sorted by combined times descending. Additive — does not touch the existing Moves Played or
  Master Moves (Our DB) panels.

### src/ui/board/CombinedGamesPanel.tsx (new)
- New self-contained panel merging the player's own games and synced master games reaching the
  current board position into one Source-tagged, sorted, display-paginated list. Additive — does
  not touch the existing Games Played or Master Games (Our DB) panels.

### src/ui/board/ChessBoardView_shared.tsx
- Imported and rendered `CombinedMovesPanel`/`CombinedGamesPanel` on `/analyze`, placed after the
  existing Master Games (Lichess) panel and before Chess.com Games — purely additive, no existing
  panel's JSX, fetch, or state was changed.
- Moved the two Combined panels (2026-09-13, user request) to render immediately before "Moves
  Played" instead — now the first two panels in the list, above every player/master panel.

### src/ui/board/CombinedMovesPanel.tsx
- Renamed "Player Eval" column to "Eval"; removed the "Master Draws"/"Master Avg Opp Rating"
  columns and their underlying data fields (2026-09-13, user request).

### src/lib/master/masterGamesList.ts
- Factored the `tmpos_positions` FEN lookup out of `getMasterGamesForFen` into a new private
  `getMasterPositionByFen` helper, shared with two new exports: `fetchMasterGamesForFenPage(fen,
  page, itemsPerPage, move?)` (real `LIMIT`/`OFFSET` server-side pagination, mirroring
  `fetchGamesForPosition_player`) and `getMasterGamesForFenCount(fen, move?)` (returns the
  existing `mpos_reached` value directly when unfiltered; a real `COUNT(*)` only when a move
  filter is applied, since `mpos_reached` covers every move). `getMasterGamesForFen` itself is
  otherwise unchanged.

### src/ui/board/MasterGamesDbPanel.tsx
- Switched from a single flat capped fetch to real server-side pagination
  (`fetchMasterGamesForFenPage`/`getMasterGamesForFenCount`) with a `MyPaginationFooter`, using the
  existing `POSITION_GAMES_ROWS_DEFAULT`/`POSITION_GAMES_ROWS_OPTIONS` constants. The Move filter
  is now a server-side query parameter (was a client-side `.filter()` over the loaded batch, which
  would have only filtered the current page under real pagination) and resets the page back to 1
  on change, mirroring `ChessBoardView_shared`'s existing reset-key pattern. Move filter options
  still come from the existing (unpaginated, capped) `getMasterGamesForFen` move breakdown.

### src/app/owner/constants/page.tsx
- Added `MasterGamesDbPanel.tsx: MasterGamesDbPanel` and `CombinedGamesPanel.tsx:
  CombinedGamesPanel` to `POSITION_GAMES_ROWS_DEFAULT`/`POSITION_GAMES_ROWS_OPTIONS`'s consumers
  lists (both now genuinely consume these constants), plus a `FUNCTION_DESCRIPTIONS` entry for
  `MasterGamesDbPanel.tsx: MasterGamesDbPanel`.

### Phase 2 revert — src/ui/board/ChessBoardView_shared.tsx, src/lib/constants.ts, src/app/owner/constants/page.tsx
- Deleted `CombinedMovesPanel.tsx`/`CombinedGamesPanel.tsx` and all their wiring/constants/
  constants-page entries (see "## Pivot" above for why) — this project has no remaining trace of
  the abandoned combine experiment except this plan's own history.

### src/lib/analysis/chessdb_player.ts
- `MoveRow`: replaced `mov_wins`/`mov_losses` with `white`/`draws`/`black` (objective, color-based
  counts) and added `avg_opponent_rating`. `getMovesForPosition_player`,
  `getMoveSummaryForPosition_player`, and `getPositionDetail_player`'s inline query all rewritten
  to `COUNT(DISTINCT gam_gdid)` (dedup) and `FILTER` on color+result combos instead of a raw
  personal-perspective `COUNT(*) FILTER (WHERE gd_player_result = 'win')`.
- `PositionGameHit`: added `white_username`/`black_username`/`white_rating`/`black_rating`/
  `result` (objective `1-0`/`0-1`/`½-½`, via the new `objectiveGameResult`); `mapPositionGameRow`
  populates them from already-selected `tgd_gamesdecon` columns.

### src/lib/analysis/chessdb_master.ts
- `MasterMoveRow`/`getMoveSummaryForPosition_master`: identical fix to chessdb_player.ts's move
  functions (dedup + White/Draw/Black + avg_opponent_rating), mirroring the `_Player`/`_Master`
  convention.
- `MasterPositionGameHit`/`mapMasterPositionGameRow`: added `white_username`/`black_username`/
  `white_rating`/`black_rating`/`result`, same shape as `PositionGameHit`.

### src/lib/master/masterGamesList.ts
- `MasterFenMoveBreakdown`: `wins`/`losses` → `white`/`draws`/`black`; `getMasterGamesForFen`'s
  `byMove` aggregation reworked to dedup by `Set<mgdid>` per move and tally the objective
  White/Draw/Black outcome instead of the tracked master's personal result.
- `MasterFenGameHit`: added `white_rating`/`black_rating`/`termination`; both
  `fetchMasterGamesForFenPage` and `getMasterGamesForFen` now select
  `mgd_white_rating`/`mgd_black_rating`/`mgd_termination`.
- Removed the private `objectiveResult` helper — now imports the shared `objectiveGameResult`.

### src/lib/analysis/chessdb_shared.ts / src/lib/objectiveGameResult.ts (new)
- `objectiveGameResult` (derives `1-0`/`0-1`/`½-½` from a personal color+result pair) was first
  added to `chessdb_shared.ts`, then moved to a new plain utility file `src/lib/
  objectiveGameResult.ts` — `chessdb_shared.ts` has `'use server'`, which requires every export to
  be an async server action, and this is a plain sync helper (caught by `npm run build`, not `tsc`
  alone). Matches the existing `winPct.ts`/`formatCp.ts` pattern of small standalone utility files.

### src/lib/analysis/buildHabits.ts
- `fetchHabitAggregates`: `move_times`/`move_wins`/`move_losses` and the `HAVING` clause now use
  `COUNT(DISTINCT gam_gdid)` instead of `COUNT(*)`, fixing the transposition double-count bug. Its
  existing `p.pos_color` check already guaranteed every counted row was the player's own move, so
  `move_wins`/`move_losses` stay personal (not converted to White/Draw/Black) — this table's Win%
  was never subject to the mover-mismatch bug the other panels had.

### src/ui/board/MovesListTable.tsx (new), src/ui/board/GamesListTable.tsx (new)
- New shared, presentational-only components. `MovesListTable`: Move | Times | White% | Draw% |
  Black% | Avg Rating | Eval (optional per row, "—" when null); optional `selectedMove`/
  `onSelectMove` for the existing click-to-filter interaction. `GamesListTable`: Move | White |
  Black | Date | Result | Termination | Final Eval | Game; optional `onRowClick`/`currentKey`, and
  a per-row `externalHref` for a real `<a target="_blank">` (Lichess games) instead of internal
  navigation.

### src/ui/board/ChessBoardView_shared.tsx, src/ui/board/MasterGameView_master.tsx
- "Moves Played", "Games Played", "Master Moves (Lichess)", and "Master Games (Lichess)" on both
  `/analyze` and `/analyzemaster` all now render via `MovesListTable`/`GamesListTable` instead of
  each having its own hand-rolled `<table>` — same column set/order everywhere, per the user's
  explicit request that all games/moves panels be visually and structurally consistent.

### src/ui/board/MasterMovesDbPanel.tsx, src/ui/board/MasterGamesDbPanel.tsx
- Also switched to the shared `MovesListTable`/`GamesListTable` (used by both routes already, so
  this fix applies to `/analyze` and `/analyzemaster` simultaneously). Score%/Win% replaced by
  objective White%/Draw%/Black%; games list gained White/Black ratings and a Termination column.

### src/ui/analysis/PositionDetail.tsx
- Minimal compile-fix only (this route, `/position/[id]`, is not in this plan's scope): its own
  existing table's single "Win%" column split into White%/Draw%/Black%, matching the new `MoveRow`
  shape — not switched to the shared `MovesListTable`.

### src/ui/board/ChessBoardView_shared.tsx, src/ui/board/MasterGameView_master.tsx
- Widened the third layout column (Moves/Games panels) from a fixed `600px` to `900px`
  (`xl:grid-cols-[480px_480px_900px]` + the matching wrapper `div`), so the new shared tables'
  wider column set doesn't wrap values onto two lines.
- Added a "Player"/"Master" colored badge next to the "Position Analysis" header (blue on
  `/analyze`, purple on `/analyzemaster`) so the two visually-similar routes are unmistakable at a
  glance; moved the FEN text + "Copy FEN" button from inside the "Stockfish" box onto this same
  header row, right-aligned, so they're visible even when Stockfish is collapsed.

### src/ui/AppNav.tsx
- Added a `bg-blue-100` background to the active top-nav tab (Games/Habits/Graph/Openings/Endings
  and Masters Games), alongside its existing underline/blue-text active styling.
- Fixed `activeKey` to also highlight "Games" (Masters) while on `/analyzemaster` — previously
  fell through to `null` (no tab highlighted) since that route had no case in the ternary.
- `activeKey` also now highlights "Games" while on `/analyze` — reopens a prior deliberate "no tab
  owns this cross-cutting route" decision; a dedicated "Analysis" nav tab was considered and
  declined (no meaningful default destination without a game already selected).

### src/ui/board/ChessBoardView_shared.tsx, src/ui/board/MasterGameView_master.tsx
- Replaced the single uniform `bg-yellow-50` column background with a distinct tinted wrapper per
  panel group: Stockfish `bg-gray-100`; Moves Played/Games Played (or their master-scoped
  equivalents) `bg-blue-50`; Master (Our DB) `bg-purple-50`; Lichess `bg-green-50`; Chess.com Games
  `bg-orange-50`. The two Lichess panels' independent `currentNode` gates were merged into one
  shared wrapper condition.

## Testing
- [ ] Open `/analyze?game=74995&player=stricade`. Confirm the Combined Moves/Combined Games panels
      are gone entirely, and every remaining panel (Moves Played, Games Played, Master Moves (Our
      DB), Master Games (Our DB), Master Moves (Lichess), Master Games (Lichess)) still appears in
      its original position.
- [ ] "Moves Played" and "Master Moves (Our DB)" now show Move | Times | White% | Draw% | Black% |
      Avg Rating | Eval (Master's Eval column always shows "—"). Confirm White%+Draw%+Black% add
      up to (approximately) 100% for each move, and that clicking a "Moves Played" row still
      highlights it and filters "Games Played" below to that move.
- [ ] "Games Played", "Master Games (Our DB)", and "Master Games (Lichess)" now all show the same
      column layout: Move | White | Black | Date | Result | Termination | Final Eval | Game.
      Confirm White/Black show ratings in parentheses, the tracked player/master's own name is
      bold, and Result is always `1-0`/`0-1`/`½-½` (never W/L/D) on every one of the three panels.
- [ ] Confirm the pink/green result-mismatch row highlighting still works on "Games Played" (a
      losing/drawn game from a winning position, or a won game from a losing position).
- [ ] Click a "Games Played" row and confirm it navigates to that game on `/analyze`; click a
      "Master Games (Our DB)" row and confirm it navigates to `/analyzemaster`; click a "Master
      Games (Lichess)" row's game link and confirm it opens lichess.org in a new tab.
- [ ] Repeat all of the above on `/analyzemaster?game=<a master game id>` — same column layouts,
      same White/Draw/Black behavior, same click-through targets (adjusted for that route).
- [ ] Visit `/habits` and confirm it still displays and behaves as before (Win% still personal, not
      changed) — this page's data only changed in that "Times"/wins/losses now dedupe transposed
      positions within one game, which may very slightly lower some counts.
- [ ] **After confirming everything above looks right**, re-run the "Build Habits" pipeline step
      (Owner > Pipeline) so existing `thab_habits` rows pick up the dedup fix — it's a precomputed
      table, so the code fix alone doesn't change already-stored rows.
- [ ] Visit `/position/[id]` for any position with recorded moves and confirm its "Your Moves" tab
      now shows White%/Draw%/Black% columns instead of a single Win% column, with no errors.
