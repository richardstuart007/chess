# PLAN_analysis — chess

## Title
analysis - investigate the current game analysis feature and look at possible enhancements

## Plan
- [x] Position Analysis panel: load existing saved analysis on navigation instead of always
      resetting to a blank "Analyze Position" button. On selecting a position, check for saved
      analysis for that position (`tpos_positions`/`teva_evaluations`) at/above the current
      Depth setting and, if found, pre-populate `deepAnalysisData` with it (showing results +
      "Resume" immediately) instead of clearing to the bare "Analyze Position" state. Keep the
      ability to trigger a fresh/deeper run on top of the pre-populated result.
- [x] Auto-deepen "Moves From This Position" candidates when running "Analyze Position". After the
      normal multi-line engine search for the current position completes, also run a direct
      `evaluate()` (single-line, not multi-pv) for every move listed in "Moves From This Position"
      that isn't already covered by the multi-pv result at the target depth — not just the moves
      the engine itself ranks in its top N. Save each via the existing depth-guarded
      `upgradePositionEvaluation` path, so a shallow-depth candidate (e.g. depth 16, from the
      background enrichment pipeline) gets upgraded to match the depth of the position being
      analyzed, while moves already at or above that depth are left untouched.
- [x] Habits recency: add `hab_last_occurred` (integer, unix epoch — matching `gd_end_time`'s
      existing convention) to `thab_habits`, appended at the end of the table. `buildHabits.ts`'s
      aggregate adds `MAX(d.gd_end_time) AS last_occurred`, included in the upsert's INSERT/SET.
      `getHabitsData`/`getHabitsCount` return `hab_last_occurred` and add a `sinceDate` filter
      (`WHERE h.hab_last_occurred >= $N`, applied only when set). `HabitsTable.tsx` shows a "Last
      occurred" column. The Habits page joins the **existing shared `dateFrom` global filter**
      (the same `useGlobalFilter('dateFrom')` / `?dateFrom=` group already used by
      Games/Graph/Openings/Termination — draft state + Filter button, same as `GameList.tsx`)
      rather than a page-local filter, and uses it to gate `hab_last_occurred`.
- [x] Change `DEFAULT_DATE_FROM` (`src/lib/constants.ts`) from `'2025-01-01'` to `'2024-01-01'` —
      agreed default of ~3 years of history. This is the shared default for every consumer of the
      constant (`GameList.tsx`, `graph/page.tsx`, `OpeningScoreChart.tsx`, `TerminationChart.tsx`,
      and the new Habits filter above), not Habits-specific — the default changes everywhere at
      once.
- [x] Pass real row counts to `MyPaginationFooter`'s new `totalRows` prop (added in `nextjs-shared`
      to show the actual row count in the footer instead of estimating `totalPages * rowsPerPage`)
      across every table in this project that uses it:
      - `src/ui/games/GameList.tsx` — pass the already-fetched `totalCount` state as `totalRows`.
      - `src/app/habits/page.tsx` — pass the already-fetched `totalCount` state as `totalRows`.
      - `src/ui/analysis/PipelineLogTable.tsx` — this one uses `nextjs-shared`'s generic
        `fetchFiltered`/`fetchTotalPages` directly rather than a local count query, so it needs a
        new `fetchTotalRows` call (from `nextjs-shared/fetchTotalRows`) added alongside the
        existing `fetchTotalPages` call, with its result stored in new state and passed through.
- [x] Fix stale-cache bug in `buildHabits()` (`src/lib/analysis/buildHabits.ts`): its upsert is a
      raw `table_query` write (`isupdate: true`), which — unlike `table_write`/`table_update`/
      `table_upsert`/`table_delete` — does not auto-clear the cache for `thab_habits`. Any Habits
      page read cached before a given pipeline run stays stale forever afterward, no matter how
      many times the pipeline reruns, until the dev server restarts or the cache is cleared
      manually. Fix: call `cache_clearTable('thab_habits', 'buildHabits')` (already imported in
      `chessdb.ts`, same pattern `upgradePositionEvaluation` already uses for its own raw writes at
      chessdb.ts:356-357) once after the upsert loop in `buildHabits()` completes.
- [x] Fix missing background override on the per-row Dismiss/Restore ✕/↺ button in
      `HabitsTable.tsx` — same bug class already fixed once for `MoveTree.tsx`'s `MoveBadge` (see
      that fix's own PLAN history): its `overrideClass="text-gray-400 hover:text-red-600 text-xs
      leading-none px-1"` carries over the original raw `<button>`'s classes verbatim, but the
      original had no background at all, while `MyButton`'s default (`bg-blue-500
      hover:bg-blue-600`) is never overridden — so the button now shows a blue background it never
      had before. Add `bg-transparent hover:bg-transparent` to its `overrideClass`, matching the
      `MoveBadge` fix's pattern. The other Habits ✕ button (the "Show dismissed" filter-row toggle)
      already correctly overrides background (`bg-white`/`bg-gray-800`) and needs no change.
- [x] In `HabitsTable.tsx`'s filter row, swap the order of the "Show dismissed" ✕/↺ toggle button
      and the "Filter" button so the ✕/↺ toggle comes first and "Filter" comes after it (currently
      Filter is first).
- [x] `habits/page.tsx`'s `handleToggleDismiss` currently drops the dismissed/restored row from the
      already-loaded `rows` state locally instead of re-fetching, so a page can end up showing fewer
      than `rowsPerPage` rows (e.g. 2 of 3) instead of backfilling with the next row in sort order.
      Fix: after `dismissHabit`/`undismissHabit` completes, call the existing `load()` (re-fetches
      the current page via `getHabitsData` with the same filters/`currentPage`/`rowsPerPage`) instead
      of the local `setRows` filter. Keep the local `setTotalCount` decrement as-is (cheap, accurate,
      avoids an extra count query).
- [x] Fix Position Detail's back button clearing the ECO/player (and any other active) filters.
      `PositionDetail.tsx`'s back button is hardcoded to `<MyBackHomeNav backPath='/habits' />` — a
      bare pathname, unlike every other back-navigation in the project, which uses the
      `useBackNav`/`saveBackNav` pattern (save the full current URL including query string before
      navigating away, restore it later). Fix:
      - `HabitsTable.tsx`'s row click — call `saveBackNav(BACK_KEY)` (no explicit path, captures the
        current Habits URL with all active filters) immediately before its
        `router.push('/position/${row.pos_id}?player=${row.player}')`.
      - `src/app/position/[id]/page.tsx` — read it back via `useBackNav(BACK_KEY) ?? '/habits'`
        (same fallback as today when nothing was saved), same pattern `analyze/page.tsx` already
        uses, and pass it down as a new `backPath` prop.
      - `PositionDetail.tsx` — accept `backPath: string` as a prop instead of the hardcoded string,
        and use it in `<MyBackHomeNav backPath={backPath} />`.
- [x] Show Date, Termination, and Final evaluation under the board panel on `/analyze`. These are
      already fetched from `tgd_gamesdecon` via `getGameById()` in `analyze/page.tsx` but currently
      discarded (Date/`gd_end_time` is copied into `game.end_time` already but never rendered;
      Termination/`gd_termination` and Final eval/`gd_final_eval` aren't copied into `game` at all).
      - `src/lib/chesscom.ts` — add two new optional fields to `ChessComGame`: `termination?: string
        | null` and `finalEval?: number | null`.
      - `analyze/page.tsx` — populate `raw.termination = row.gd_termination` and
        `raw.finalEval = row.gd_final_eval` when building the `raw: ChessComGame` object. (Every
        `/analyze` load goes through this same `getGameById` fetch regardless of which page linked
        in, so no other call site needs updating.)
      - `ChessBoardView.tsx` — add a small stats line in Column 1, directly under the bottom player
        box and above the "Branch indicator + save" row: Date (formatted `dd/mm/yy`, matching the
        same convention already used in `GameList.tsx`/`HabitsTable.tsx`, via a new local
        `formatGameDate` helper), Termination (`game.termination`, shown verbatim), Final evaluation
        (`game.finalEval != null ? formatCp(game.finalEval) : '—'`).
- [x] Replace the `saveBackNav`/`useBackNav` single-slot sessionStorage mechanism with a real
      sessionStorage **stack** (array of URLs), plus a **global-filter override on pop** so
      `player`/`eco`/`opening`/`dateFrom` always reflect their current live value on the page being
      left, rather than a frozen historical snapshot — while every other param in a popped URL
      (e.g. Position Detail's own `tab`/`move`) restores exactly as it was. Superseded design
      history: a `?back=` URL param was considered first, rejected for polluting/lengthening every
      URL; a pure snapshot stack was considered next, rejected because it would revert `player`
      (and the other global filters) to whatever they were *when you first left*, not what you
      later changed them to. The override is applied lazily, only at pop time (not proactively
      rewriting the whole stack on every filter change) — a stack entry can only ever be observed
      by being popped, so a pop-time override is sufficient and avoids coupling into
      `useGlobalFilter.ts` (a `nextjs-shared` file this project can't edit) for no added benefit.
      Native browser back/forward is explicitly left untouched — it'll continue to show raw,
      unmodified browser history (including stale global-filter values), since intercepting it
      would mean fighting the browser's own behavior; this is a known, accepted asymmetry between
      it and the app's own "← Back" link, not a defect to fix.
      - **New: `src/lib/backNav.ts`** — sessionStorage-backed stack helpers:
        - `pushBackTarget(url: string)`: read the array (`SESSION_STORAGE_PREFIX + 'back_stack'`),
          append `url`, write it back.
        - `popBackTarget(currentSearchParams: URLSearchParams, fallback: string): string`: pop the
          last entry (write the shortened array back); if none, return `fallback`. Otherwise parse
          the popped URL's path/query, overwrite `player`/`eco`/`opening`/`dateFrom` in it with
          whatever `currentSearchParams` currently holds for each (deleting the key if the current
          value is empty), leave every other param as-is, and return the rebuilt URL string.
      - **New: `src/ui/BackButton.tsx`** — small client component (`fallback: string`,
        `label?: string`) rendering a "← Back" control styled to match `MyBackHomeNav`'s existing
        link look (`text-xs text-gray-500 hover:text-gray-700`), whose `onClick` calls
        `router.push(popBackTarget(useSearchParams(), fallback))` — this is what actually needs the
        click-time logic `MyBackHomeNav`'s plain `<a href>` can't provide.
      - **Render sites** — drop the `backPath` prop from `MyBackHomeNav` (so it renders "⌂ Home"
        only) and place `BackButton` next to it in the same row:
        - `ChessBoardView.tsx` (header row): `<BackButton fallback='/' />`.
        - `PositionDetail.tsx` (header row): `<BackButton fallback='/habits' />`. Drop the
          `backPath` prop from `PositionDetailProps` entirely (no longer threaded through from the
          page — `BackButton` resolves its own target live).
        - `analyze/page.tsx`'s error-state branch: `<BackButton fallback='/' />`.
      - **Push sites** (call `pushBackTarget(<target>)` immediately before navigating, instead of
        `saveBackNav`). `<target>` is built from `usePathname()`/`useSearchParams()` (matching the
        existing pattern in `useGlobalFilter.ts`'s `setMultiple`), not `window.location` — add
        whichever of `usePathname`/`useSearchParams` each file doesn't already import (all have
        `useRouter`):
        - `HomeDashboard.tsx`'s `handleSelectGame` → `/analyze`.
        - `openings/page.tsx`'s `handleSelectGame` → `/analyze` (already has `useSearchParams`).
        - `PositionDetail.tsx`'s Game History row click → `/analyze`.
        - `HabitsTable.tsx`'s row click → `/position/[id]`.
        - `ChessBoardView.tsx`'s "switch game while already in Analyze" row click → `/analyze`:
          **push nothing at all** — leave the stack untouched, so `BackButton` on the new game's
          `/analyze` view still resolves to the same original parent (Position Detail/Home/
          Openings), matching today's existing "skip over intermediate games" behavior, however
          many games get clicked through in a row.
      - **Prop/plumbing cleanup**: remove `backPath` from `ChessBoardViewProps` (no longer passed
        from `analyze/page.tsx`) and from `PositionDetailProps`; remove `useBackNav` and the
        `backPath`/`useBackNav(BACK_KEY)` computation from `analyze/page.tsx` and
        `position/[id]/page.tsx`; remove now-unused `saveBackNav`/`useBackNav`/`BACK_KEY` imports
        from every file above.
      - Remove `BACK_KEY` from `src/lib/constants.ts` — no remaining consumers anywhere in the
        project once this lands (confirmed no entry exists on the Constants page to clean up).
- [x] Fix `/analyze`'s player-highlighting bug at its root cause: rename its `?user=` query param to
      `?player=` everywhere it's read/written. `user` was never a real Data Dictionary concept in
      this schema — it's the exact same "tracked player username" value `?player=` holds everywhere
      else, just inconsistently named on this one route. Because `/analyze` never wrote `?player=`,
      `AppShell.tsx`'s existing highlight logic (`playerFilter === p.player || playerFilter ===
      BOTH`, where `BOTH` is the empty-string "no selection" state) always saw an empty selection on
      `/analyze` and treated it as "show every player card as selected" — both `stricade` and
      `astarrboy` highlighted simultaneously, the whole time, regardless of what's clicked. Once
      `/analyze` uses the same `?player=` key as every other page, the existing header logic works
      correctly with no changes needed there.
      - `analyze/page.tsx`: `searchParams.get('user')` → `searchParams.get('player')`.
      - `HomeDashboard.tsx`, `openings/page.tsx`, `PositionDetail.tsx`'s Game History row click,
        `ChessBoardView.tsx`'s own game-switch row click: `&user=${...}` → `&player=${...}` in each
        `router.push('/analyze?game=...&user=...')` call.
- [x] Fix `popBackTarget` stripping `eco`/`dateFrom`/`opening` on multi-hop back navigation. Root
      cause: it currently overrides all four `GLOBAL_FILTER_BACK_KEYS` (`player`/`eco`/`opening`/
      `dateFrom`) using the current page's live search params — but `eco`/`opening`/`dateFrom` only
      exist on pages that actually have those filters (Games/Habits/Graph/Openings/Termination);
      `/analyze` and `/position/[id]` never carry them at all. So popping back *through* Analyze or
      Position Detail always sees them as empty there and deletes them from the popped target, even
      when the target (e.g. Habits) legitimately had them. `player` doesn't have this problem — it's
      genuinely present on every page in the chain (especially now after the `?user=`→`?player=`
      rename). Fix: `src/lib/backNav.ts` — change `GLOBAL_FILTER_BACK_KEYS` to `['player']` only;
      `eco`/`opening`/`dateFrom` become pure historical snapshots (restored exactly as captured at
      push time, no override), since there's no meaningful "current value" for them on pages that
      don't manage them.
- [x] Show the game number (`gdid`) alongside Date/Termination/Final evaluation in the "Game info"
      line under the board panel on `/analyze` (`ChessBoardView.tsx` — `gdid` is already an existing
      prop, just not currently displayed there).
- [x] Make every dropdown/select the same height as the "Date From" filter (`h-6`, no `md:h-8`
      growth). `src/ui/filters/`'s own components (`FilterSelect`, `FilterDateInput`, etc.) already
      override to `h-6 md:h-6` consistently — the mismatch is every place using `nextjs-shared`'s
      `MySelect` directly, which defaults to `h-6 md:h-8` (taller at desktop widths). Add
      `overrideClass='h-6 md:h-6'` to each (merged with any existing `overrideClass`, not replacing
      it) — widths are left untouched, only height:
      - `ChessBoardView.tsx`: "Depth"/"From move"/"To move" (Game Analysis panel), "Depth"/"Lines"
        (Position Analysis panel) — 5 dropdowns.
      - `RatingChart.tsx`: "Granularity".
      - `owner/pipeline/page.tsx`: the run-id picker (merge with its existing `overrideClass='w-28'`).
      - `DeconstructButton.tsx`: "Records".
- [x] Narrow the 5 numeric dropdowns in `ChessBoardView.tsx` (Depth/From move/To move in Game
      Analysis; Depth/Lines in Position Analysis) to `w-20` — `MySelect`'s own default (`w-72`) is
      far wider than needed for options like "20" or "3". Add `w-20` to each dropdown's existing
      `overrideClass='h-6 md:h-6'` (agreed value).
- [x] `MoveTree.tsx` — add `w-20` to the White and Black move `<td>` cells (the panel titled
      "Moves"; columns are `#`/`White`/`Eval`/`Black`/`Eval`), which currently have no fixed width
      at all (auto-sized to content).
- [x] `MoveTree.tsx` — add `w-20` to the two Eval columns too (matching the move columns), and
      remove their `pl-1` left padding (both `<th>` headers and `EvalCell`'s `<td>`) so there's no
      gap between an Eval column and the move column that follows it (White's Eval sitting right
      before Black's move).
- [x] `ChessBoardView.tsx` — change both `overrideClass='w-full'` buttons (the "Analyze all
      moves"/"Re-analyse" button in Game Analysis, and the "Analyze Position" button in Position
      Analysis) to `w-24` (agreed value) instead of stretching to fill their container — every other
      button in the app auto-sizes to its own text (`MyButton`'s default has no width class at
      all), these two were the only outliers. Scoped to just these two buttons for now, not a
      wider pass over every button in the app.
- [x] `w-24` turned out too narrow for "Analyze all moves" (wraps to two lines) — widen both buttons
      to `w-32` (agreed value).
- [x] `MoveTree.tsx`'s `<table>` — add `table-fixed`, replace `w-full` with `w-[352px]` (the exact
      sum of its columns: `#` 32px + White 80px + Eval 80px + Black 80px + Eval 80px). Without
      `table-fixed`, the browser's default `table-layout: auto` treats each column's `w-20` as only
      a hint and redistributes the table's stretched `w-full` width across columns as extra gaps,
      instead of honoring the widths strictly.
- [x] `ChessBoardView.tsx` layout changes:
      - Column 1 (board panel) wrapper — add `w-[440px]` (matching the board's own fixed width) so
        the CSS grid's `auto` track for this column can no longer grow wider than the board itself.
        Today nothing constrains it, so the Top/Bottom player boxes (which stretch to 100% of
        whatever width the column ends up being) can expand past the board's edge.
      - Column 2's header row (`<h3>Moves</h3>` + the opening/ECO/time-class `<span>`) is removed
        entirely — nothing meaningful is left in it once both pieces move elsewhere.
      - A new line showing the opening name, ECO, and time class is added directly above the whole
        Board/Moves/Analysis grid (between the existing "Header" `MyBox` and the grid `<div>`), so
        it reads as a page-level line sitting right above the board, rather than tucked inside
        Column 2's local header.
- [x] `MoveTree.tsx` — reduce main-line row vertical spacing by half: `py-0.5` (2px top/bottom) →
      `py-px` (1px top/bottom, Tailwind's exact utility for 1px) on the move-number, White, Black,
      and both Eval `<td>` cells.
- [x] `MoveTree.tsx` — the actual row-height driver wasn't the `<td>` padding, it's `MoveBadge`
      (a `MyButton`, whose default class forces `h-6 md:h-8` regardless of `overrideClass`'s
      `py-0.5`). Add `h-4` (agreed value) to `MoveBadge`'s `overrideClass`, replacing the inherited
      height, and drop its now-redundant `py-0.5` (the fixed height + existing `items-center`
      handles vertical centering without extra padding).
- [x] `ChessBoardView.tsx` — change the 3-column grid from `xl:grid-cols-[auto_1fr_1fr]` (Column 1
      `auto`, Columns 2/3 flexible `1fr` each) to three fixed `440px` tracks (agreed value — same
      width as the board, applied uniformly to Board/Moves/Analysis) so none of the three panels
      expand to fill leftover space. Column 2's table (`w-[352px]`) and Column 3's "Moves/Games From
      This Position" tables (already wrapped in their own `overflow-x-auto`) sit comfortably inside
      440px without forcing their columns wider.
- [x] `ChessBoardView.tsx` — the `440px` grid tracks only apply at the `xl:` breakpoint; below it,
      the layout falls back to `grid-cols-1` (stacked) and nothing constrains width anymore. Board
      looks fine anyway (its inner div already has an unconditional `w-[440px]`) and Moves looks
      fine too (the table itself has an unconditional `w-[352px]`) — but Analysis has no equivalent
      unconditional width anywhere inside it, so its visible `MyBox` panels stretch full-width when
      stacked, which is obvious because (unlike the other two) they have a background/border. Add an
      unconditional `w-[440px]` to Column 2's and Column 3's own wrapper divs too, matching what
      Column 1 already effectively has, so all three stay capped at every screen size, not just at
      `xl:`. Lower priority (Column 3's own note: unlikely to be analysing on a small screen), but
      still wanted.
- [x] `ChessBoardView.tsx` — increase the 3-column grid's gap from `gap-3` to `gap-6` (agreed value,
      24px) so there's visible breathing room to the right of the Board and Moves columns, not just
      the current 12px.
- [x] `ChessBoardView.tsx` — add a light background to Column 2 (Moves) and Column 3 (Analysis)
      wrapper divs: `bg-pink-50` on Moves, `bg-yellow-50` on Analysis (agreed pairing — swapped from
      the original yellow/pink request specifically to avoid the yellow background sitting behind
      `MoveTree`'s `text-yellow-600` "inaccuracy" annotations, which only appear in the Moves panel;
      lightest `-50` shade agreed to keep the existing eval/classification colors reading clearly on
      top). Also add `rounded-lg p-2` to both wrappers (matching `MyBox`'s own rounding/padding
      convention) so the colored panels read as intentional boxes rather than an edge-to-edge tint
      with content touching the border.
- [x] Remove the dead "just analyzed this game" row-highlighting feature (`?highlight=` →
      `lastAnalyzedGdid` → `bg-yellow-50 outline outline-1 outline-yellow-300`) entirely — confirmed
      nothing in the project ever sets `?highlight=`, so this never actually fires. Remove the whole
      chain, not just the one highlighted line, since the rest becomes dead code once it's gone:
      - `GameList.tsx` — the highlighting className and the `lastAnalyzedGdid` prop.
      - `OpeningScoreChart.tsx` — the identical highlighting className and prop (same dead feature).
      - `HomeDashboard.tsx` — the `lastAnalyzedGdid` pass-through prop.
      - `src/app/page.tsx` — the `params.highlight`/`lastAnalyzedGdid` computation.
      - `src/app/openings/page.tsx` — the `highlightParam`/`lastAnalyzedGdid` computation.
- [x] `ChessBoardView.tsx` — resize Column 2's height cap from `xl:h-[520px]` to `xl:h-[780px]`
      (agreed value) instead of removing it. After the row-spacing fixes, 26 rows fit in the
      original 520px (~19px/row including header) — 780px comfortably fits ~40 rows (the rough
      ceiling for how long a game normally runs) before the scrollbar kicks in. Keeps
      `overflow-y-auto` for the rare longer game.
- [x] `MoveTree.tsx` — fix `MoveBadge`'s height override: `h-4` alone only replaces `MyButton`'s
      base `h-6` default, not its separate responsive `md:h-8` default (a variant-prefixed class
      only gets replaced by another override with the same variant prefix) — so at `md:` breakpoint
      and above (i.e. any normal desktop window), the button has actually still been sitting at
      `h-8` this whole time, taller than before the original fix. Change to `h-4 md:h-4` (both),
      matching the same two-part pattern already used correctly for the dropdown/button width fixes
      earlier in this plan.
- [x] `ChessBoardView.tsx` — rename the "Analyze all moves" button label to "Analyze Game" (the
      "Re-analyse" label for when evaluations already exist is unchanged).
- [x] `ChessBoardView.tsx` — change the "Position Analysis" box title from
      `` `Position Analysis — ${currentMoveLabel}` `` (e.g. "Position Analysis — Starting
      position") to a static "Position Analysis", dropping the move-label suffix entirely.
- [x] `GameList.tsx` — reorder columns: move "Player" to be the very first column (before the
      existing `#` row-sequence column), and add a new "Game #" column (showing `row.gd_gdid`, the
      real database ID — distinct from the existing `#` column, which is just a page-relative row
      count) directly after "Date". New order: Player, #, Date, Game #, Color, Time, Opponent,
      Opp. rating, My rating, Result, Termination, Opening, ECO, (Analyze). Applies to all three
      rows (header, filter row, data row). Update the loading/empty-state `colSpan` from 13 to 14
      for the new column.
      - "Game #"'s filter cell gets a `FilterTextInput` for exact-match game-number lookup (not
        blank like `#`'s): `src/lib/actions/games.ts` — add `gdid?: number` to `GameFilters`, and
        in `buildFilters`, `if (filters.gdid) result.push({ column: 'gd_gdid', operator: '=', value:
        filters.gdid })`. `GameList.tsx` — add `'gdid'` to `updateFilter`'s `parseInt` special-case
        branch (alongside `opponentRatingMin`/`opponentRatingMax`), matching the existing
        draft/apply-on-Filter-click pattern the other column filters already use.
- [x] `GameList.tsx` — swap "#" back to be the first column, ahead of "Player" (which moved there
      in the previous step). New order: #, Player, Date, Game #, Color, Time, Opponent, Opp.
      rating, My rating, Result, Termination, Opening, ECO, (Analyze).
- [x] **Temporary diagnostic** — `ChessBoardView.tsx`'s `runAnalysis()`: add
      `console.log('runAnalysis depth:', depth)` immediately before the `engine.analyzeGame(...)`
      call, to confirm at runtime whether the Depth dropdown's selected value is actually what
      reaches the Stockfish call — investigating why a Re-analyse run at a selected Depth of 20
      behaved as if it ran at depth ≤16 (`existing.depth (16) >= results[i].depth` skipped all 17
      plies). Remove this log once the root cause is confirmed.
- [x] ~~Root cause confirmed, not a code bug: Fast Refresh~~ — **retracted.** A clean repro (full
      server restart, new browser tab, never-visited game) still showed the same symptom, which
      Fast Refresh cannot explain. The server-side action log for that repro
      (`upgradePositionEvaluation({"depth":16,...})`) confirmed the real computed depth was still
      16, disproving the earlier explanation.
- [x] **Actual root cause found**: `analyze/page.tsx` initializes `stockfishDepth` state to
      `STOCKFISH_DEFAULTS.depth` (= `STOCKFISH_DEPTH`, 16 — the background pipeline's own default
      depth), but the Game Analysis "Depth" dropdown's own option list in `ChessBoardView.tsx` is
      `['20', '22', '24', '26', '28', '30', '40']` — 16 isn't a valid option. A native
      `<select value="16">` with no matching `<option value="16">` silently displays the *first*
      option ("20") as selected while the underlying value stays "16" — so on every fresh page
      load the dropdown visually shows "20" without the user ever having picked it, while the real
      state is still 16. Explicitly picking a real option (e.g. "22", tested earlier) correctly
      updates state and works — only the *unclicked default* was broken. Fix (agreed value, 20):
      - `src/lib/constants.ts` — add `STOCKFISH_REANALYZE_DEFAULT_DEPTH = 20` (Stockfish Analysis
        section) and add `reanalyzeDepth: STOCKFISH_REANALYZE_DEFAULT_DEPTH` to the
        `STOCKFISH_DEFAULTS` object in `src/lib/stockfish.ts` — a new field, not a change to the
        existing `depth` field (which stays 16, still correctly used as the pipeline/fallback
        default elsewhere in `stockfish.ts`).
      - `analyze/page.tsx` — `useState(STOCKFISH_DEFAULTS.depth)` → `useState(STOCKFISH_DEFAULTS.reanalyzeDepth)`
        for `stockfishDepth`'s initial state.
      - `src/app/owner/constants/page.tsx` — add the new constant's `CONSTANTS_SECTIONS` entry.
- [x] Audit every single-value dropdown (`MySelect`/`FilterSelect`-family, native `<select>`) in the
      app for the same bug class: an initial `useState` default (or a `value` prop's `??` fallback)
      that isn't actually present in that dropdown's own `options` list. Checked every call site in
      `ChessBoardView.tsx`, `OpeningScoreChart.tsx`, `DeconstructButton.tsx`, `owner/pipeline/page.tsx`,
      `RatingChart.tsx`, `HabitsTable.tsx`/`habits/page.tsx`, `graph/page.tsx`, `GameList.tsx`,
      `TerminationChart.tsx`, and the shared filter wrappers (`ColorSelect`, `TimeClassSelect`,
      `ResultSelect`, `FilterPlayerSelect` — all pure pass-throughs with no baked-in default of
      their own). Findings:
      - The `stockfishDepth` bug above was the only real instance of this bug class found.
      - Same file, same dropdown: its `value` prop also had a stray `?? STOCKFISH_DEFAULTS.depth`
        fallback (unreachable today since `stockfishDepth` is always provided by `analyze/page.tsx`,
        but wrong for the same reason if `ChessBoardView` is ever rendered without it) — changed to
        `?? STOCKFISH_DEFAULTS.reanalyzeDepth` for consistency.
      - Separate, unrelated minor finding (not the same bug class): Position Analysis's own Depth
        dropdown had dead code for an "Infinite" option (`deepAnalysisDepth: number | 'infinite'`,
        `value === 'infinite' ? 'Infinite' : ...`) that could never actually be reached —
        `'Infinite'` was never added to that dropdown's own `options` list (`['20',...,'40']`), so
        there was no way to select it via the UI.
- [x] ~~Fix the "Infinite" dead code found above by completing the feature (adding the missing
      dropdown option)~~ — **reversed per explicit correction**: the user's actual intent was the
      opposite of what was implemented — remove the "Infinite" capability from the dropdown *and*
      the code entirely, not complete it. Fix:
      - `ChessBoardView.tsx` — removed `'Infinite'` from the Position Analysis Depth dropdown's
        `options` list and the `value`/`onChange` ternaries handling it; `deepAnalysisDepth`/
        `onDeepAnalysisDepthChange` props narrowed from `number | 'infinite'` to plain `number`;
        `buildSavedAnalysisFromMoveSummary`'s `targetDepth` param narrowed the same way (its
        `if (targetDepth === 'infinite') return null` guard removed, now unreachable).
      - `analyze/page.tsx` — `deepAnalysisDepth` state narrowed from `useState<number | 'infinite'>`
        to `useState<number>`.
      - `stockfish.ts` — `startInfiniteAnalysis`'s `maxDepth` param narrowed from
        `number | 'infinite'` to `number`; always sends `go depth ${maxDepth}` now (the
        `maxDepth === 'infinite' ? 'go infinite' : ...` branch removed) — an unbounded/uncapped
        engine search is no longer reachable anywhere in the app.
      - Left unchanged (not a rename, just descriptive naming for the existing "live incremental
        analysis" pattern, unrelated to the removed unbounded-depth *capability*):
        `InfiniteAnalysisUpdate` type, `startInfiniteAnalysis` function name, `infiniteHandler`
        field.
      - Everywhere else checked (Habits' filter row, Games'/Openings'/Termination's Color/Time
        Class/Result selects, Graph's row-limit select, RatingChart's Granularity, the Pipeline
        run-id picker, Deconstruct's Records select) already had defaults that match a real option —
        confirmed clean, no changes needed.
- [x] `ChessBoardView.tsx` — now that Column 3 (Analysis) has a fixed 440px width cap, revert the
      "Re-analyse"/"Analyze Game" button and the "Analyze Position" button from `overrideClass='w-32'`
      back to `overrideClass='w-full'` (stretching to fill the now-bounded 440px column, instead of
      the earlier fixed 32-width — the panel itself provides the width limit now, so full-width no
      longer means unbounded).
- [x] Fix the "Analyzing..." progress label in `ChessBoardView.tsx`: it currently reads "Move X / Y"
      but `analysisProgress.current`/`.total` actually count plies (half-moves) within the selected
      From/To range, not full moves — e.g. a range of From move 5 to All showed "Move 2 / 17" on a
      13-full-move game, which is correct ply math (moves 5–13 ≈ 17 plies) but reads as wrong
      against "13 moves". Agreed fix: relabel the text from "Move" to "Ply" (`Move {current} / {total}`
      → `Ply {current} / {total}`), leaving the counting logic itself unchanged.
- [x] `ChessBoardView.tsx` — tighten `getCurrentMoveLabel()`'s format from `"7. d5"`/`"7... d5"`
      (space before the move) to `"7.d5"`/`"7...d5"` (no space) — applies everywhere the function is
      used (agreed: both "Moves From This Position" and the new Position Analysis title below stay
      visually consistent with each other).
- [x] `ChessBoardView.tsx` — bring back a move-label suffix on the "Position Analysis" `MyBox` title
      (removed earlier this session in favor of a static "Position Analysis"), now using the
      tightened format above: `` `Position Analysis — ${currentMoveLabel}` `` (e.g.
      "Position Analysis — 7.d5"), matching the same pattern "Moves From This Position" already
      uses for its own title.
- [x] Remove the unused "Save Line"/"Save Full Analysis" feature entirely — confirmed
      `getSavedAnalyses(gdid)` (`games.ts`) is never imported/called anywhere, and `tsa_savedanalyses`
      has exactly one row on local (a test row from earlier this session): the whole feature writes
      data nothing in the app ever reads back.
      - `ChessBoardView.tsx` — remove the "Save Line" (`handleSaveLine`) and "Save Full Analysis"
        (`handleSaveTree`) buttons and their handler functions, the `saveMessage` state, and the
        now-unused `getPath`/`saveAnalysisLine`/`saveAnalysisTree` imports (`getPath` may still be
        used elsewhere in the file — check before removing its import).
      - `games.ts` — remove `saveAnalysisLine`, `saveAnalysisTree`, `getSavedAnalyses`, and the
        `SAVED_TABLE` constant.
      - `scripts/schema.sql` — remove the `tsa_savedanalyses` table definition.
      - Manual SQL given to the user in chat (not executed here): `DROP TABLE tsa_savedanalyses;`
- [x] `runAnalysis()` (`ChessBoardView.tsx`, "Analyze Game"/"Re-analyse") should skip calling
      Stockfish entirely for any position that already has a cached `teva_evaluations` row at/above
      the target depth, instead of always computing every position in range and only discarding the
      result afterward via the existing depth-guard (current behavior wastes engine time; it never
      downgrades stored data, since the guard runs before the save — but it does needless work for
      already-deep positions). Design:
      - `chessdb.ts` — new `getPositionEvaluationsBulk(fens: string[]): Promise<Record<string, {
        cp: number; bestMove: string | null; depth: number }>>` — one batched query against
        `teva_evaluations`/`tpos_positions` for every FEN in the range (not N individual queries),
        keyed by truncated FEN.
      - `stockfish.ts` — `analyzeGame()` gains a new optional `cachedEvals?: Record<string, { cp:
        number; bestMove: string | null; depth: number }>` parameter. In the "evaluate every
        position once" loop, for each `fens[i]`: if `cachedEvals[truncateFen(fens[i])]` exists and
        its `depth >= depth` (the target depth for this run), use the cached `cp`/`bestMove`
        directly instead of calling `this.evaluate()` — `onProgress` still fires per position either
        way, so the progress bar still reflects the full range, just resolving faster for cached
        positions.
      - `ChessBoardView.tsx`'s `runAnalysis()` — calls `getPositionEvaluationsBulk(fens)` before
        `engine.analyzeGame(...)`, passes the result through as `cachedEvals`.
- [x] Fix `gev_cp_change` staleness in `upgradeGameEval`. Currently it only sets `gev_cp`/
      `gev_depth` when a Position-Analysis-triggered upgrade succeeds, leaving `gev_cp_change` (and
      therefore the Move Tree's blunder/mistake/inaccuracy classification, computed client-side from
      it) stale relative to the new `gev_cp` — the position-tree side (`gam_cp_change`, via
      `upgradePositionEvaluation`'s own cascade) doesn't have this problem, so this is the same bug
      class, asymmetric fix. `persistAnalysisLines()` (`ChessBoardView.tsx`) already computes the
      correct `cpChange`/`cpLoss`/`classification` client-side right after the upgrade — the fix is
      just to compute `cpChange` *before* calling `upgradeGameEval` (instead of after) and pass it
      through to be persisted, not to add any new computation:
      - `games.ts` — `upgradeGameEval` gains a `cpChange: number` parameter; SQL adds
        `gev_cp_change = $5` to the `SET` clause alongside the existing `gev_cp`/`gev_depth`.
      - `ChessBoardView.tsx`'s `persistAnalysisLines()` — reorder so `cpChange`/`cpLoss` are computed
        before the `upgradeGameEval` call (using the same existing formula), then pass `cpChange`
        through; everything else in the function is unchanged.
- [x] `MoveTree.tsx` — show each ply's analysis depth bracketed next to its eval, mirroring the
      existing move-count bracket style (`MoveBadge`'s `<span className='text-xxs text-gray-400
      font-mono'> ({count})</span>`, shown after the move text): small, gray, monospace
      `(depth)` appended after the eval value, e.g. `+50 (16)`. Applies everywhere an eval is shown:
      - `EvalCell` (main-line rows) — append `<span className='text-gray-400'> ({node.evaluation.depth})</span>`
        after `{formatCp(cp)}`.
      - `InlineVariation`'s own eval span — same bracket appended after `{formatCp(n.evaluation.cp)}`,
        for consistency with the main line (this component already mirrors `MoveBadge`'s count
        bracket for variations, so the depth bracket should too).
- [x] `ChessBoardView.tsx` — replace the Game Analysis panel's "To move" `MySelect` (options `['10',
      '15', 'All']`) with a `MyInput type='number'` (matching the `owner/pipeline/page.tsx` run-id
      picker's own numeric-input pattern), letting any move number be typed directly instead of
      picking from 3 fixed choices. `min={1}`/`max={totalFullMoves}` — the same range "From move"'s
      dropdown already operates within. Value/onChange carry over the existing semantics unchanged:
      `toMove >= totalFullMoves` still means "All" (the input just shows `totalFullMoves` in that
      case, same as picking "All" did), `onChange` still calls `setToMove(parseInt(...))`.
      `overrideClass='w-16 h-6 md:h-6'` (narrower than the old `w-20` `MySelect`, matching
      `WIDTH_GAME_NUMBER`'s existing 2–3 digit numeric-input width elsewhere in the project).
- [x] `ChessBoardView.tsx` — same swap for "From move": replace its `MySelect` (options
      `fullMoveOptions`, i.e. every move 1..totalFullMoves) with a `MyInput type='number'`
      (`min={1}`/`max={totalFullMoves}`, `overrideClass='w-16 h-6 md:h-6'`), matching "To move"'s new
      control exactly. Also enforce To ≥ From (agreed constraint).
      - **Bug found and fixed during this step**: clamping live on every `onChange` keystroke broke
        typing multi-digit values — e.g. typing "11" fires `onChange` after just "1", which parsed
        to `1` and (being below `fromMove`, default 5) immediately clamped back up, erasing the
        digit before "1" could be typed. **Fixed** per explicit correction: clamping/validation
        moved from `onChange` (fires every keystroke) to `onBlur` (fires once, when focus leaves the
        field) — `onChange` now just parses and sets state directly, no cross-field logic, so typing
        is never interrupted mid-entry. `onBlur` on "From move" clamps to `1..totalFullMoves` and
        bumps `toMove` up to match if it's now below the new `fromMove`; `onBlur` on "To move"
        clamps to `Math.max(fromMove, Math.min(toMove, totalFullMoves))`. Since the "Re-analyse"/
        "Analyze Game" button is a separate element, clicking it always blurs whichever field was
        focused first, so this also satisfies "don't correct until Analyze is pressed" in practice —
        no separate button-press-time clamp needed.

## Changes

### src/ui/board/MoveTree.tsx
- Added `w-20` to the White and Black move `<td>` cells in the main-line rows — previously
  unconstrained, auto-sized to content.
- Added `w-20` to both Eval `<td>` cells (`EvalCell`) and all 4 header `<th>`s too (matching the
  move columns); removed the `pl-1` left padding from the Eval headers/cells so there's no gap
  between an Eval column and the move column that follows it.
- Added `table-fixed` and changed the table's `w-full` to `w-[352px]` (the exact sum of its column
  widths), so the browser strictly honors each column's `w-20` instead of stretching the table to
  fill its container and spreading the extra space as gaps.
- Reduced main-line row vertical spacing by half: `py-0.5` → `py-px` on all 5 `<td>` cells.
- `MoveBadge`'s `overrideClass` gained `h-4` (replacing its inherited `MyButton` default of
  `h-6 md:h-8`, the actual driver of row height) and dropped `py-0.5` (redundant once height is
  fixed and `items-center` centers the text).
- Fixed the above: `h-4` alone only replaced the base `h-6` default, not the separate responsive
  `md:h-8` default — so at `md:` breakpoint and above the button was still `h-8`. Changed to
  `h-4 md:h-4` (both) to actually take effect at every screen size.
- Removed the dead "just analyzed this game" row-highlighting className and the now-unused
  `lastAnalyzedGdid` prop (nothing in the project ever set the `?highlight=` param that drove it).

### src/ui/board/ChessBoardView.tsx (Moves panel height)
- Resized Column 2's height cap from `xl:h-[520px]` to `xl:h-[780px]` — comfortably fits ~40 rows
  after the row-spacing fixes, instead of the ~26 rows the original cap fit.

### src/ui/board/ChessBoardView.tsx (button/title text)
- Renamed the "Analyze all moves" button label to "Analyze Game" ("Re-analyse" unchanged).
- Changed the "Position Analysis" `MyBox` title from `` `Position Analysis — ${currentMoveLabel}`
  `` to a static `'Position Analysis'`.
- Added `buildSavedAnalysisFromMoveSummary()` — reconstructs a `Position Analysis` result from
  already-saved `teva_evaluations` data (via the already-loaded `moveSummary` rows), gated on every
  displayed line being at/above the currently-selected Depth setting. Returns `null` (falls back to
  the plain "Analyze Position" button) when there's insufficient saved depth, or when the Depth
  setting is `'infinite'` (never satisfiable by saved data).
- Added a `useEffect` on `[moveSummary]` that calls the above and pre-populates `deepAnalysisData`
  once loaded for the position now on the board — guarded on `deepAnalyzing`/`deepAnalysisData`
  both still being unset so it never clobbers a live run or its result.
- Added `deepenUncoveredMoves()` — after a live "Analyze Position" run completes and persists its
  own multi-pv lines, runs a direct single-line `evaluate()` for every `moveSummary` row not already
  covered by that result and not already at/above the just-analyzed depth, saving each via the
  existing depth-guarded `upgradePositionEvaluation`. Wired into `startDeepAnalysis`'s `onComplete`
  (now `async`), after `persistAnalysisLines`. `moveSummary` is captured at the start of
  `startDeepAnalysis` (`analyzedMoveSummary`) for the same reason `analyzedPly` already was — the
  user may navigate away before `onComplete` fires.
- Gated the live nodes/nps/timeMs stats line on `deepAnalysisData.timeMs > 0`, showing "From saved
  analysis" instead when the data came from pre-population rather than a live run.
- Added local `formatGameDate()` (unix epoch -> `dd/mm/yy`, same convention as `GameList.tsx`/
  `HabitsTable.tsx`) and a new "Game info" line in Column 1, directly under the bottom player box:
  Date, Termination (`game.termination`, hidden if not set), and Final evaluation
  (`formatCp(game.finalEval)` or "—").
- Removed `backPath` from `ChessBoardViewProps` and the `saveBackNav`/`BACK_KEY` import. Header now
  renders `<MyBackHomeNav />` (Home only) alongside the new `<BackButton fallback='/' />`. The
  "switch game while already on /analyze" row click no longer pushes anything onto the back stack
  (deliberately — keeps `BackButton` pointing at the original parent no matter how many games get
  clicked through, matching the old chained-nav behavior).
- "Game info" line now also shows the game number (`Game #{gdid}`, hidden if `gdid` is unset),
  alongside Date/Termination/Final evaluation.
- Added `overrideClass='h-6 md:h-6'` to the 5 raw `MySelect` dropdowns (Depth/From move/To move in
  Game Analysis; Depth/Lines in Position Analysis) — `MySelect`'s own default (`h-6 md:h-8`) was
  taller than the rest of the app's filters at desktop widths.
- Narrowed the same 5 dropdowns to `w-20` (`overrideClass='w-20 h-6 md:h-6'`) — `MySelect`'s own
  default width (`w-72`) was far wider than needed for options like "20" or "3".
- Changed the "Analyze all moves"/"Re-analyse" button and the "Analyze Position" button from
  `overrideClass='w-full'` to `w-24` — these were the only two buttons in the app stretching to
  fill their container; every other `MyButton` auto-sizes to its own text (no width in `MyButton`'s
  default class).
- Widened those same two buttons from `w-24` to `w-32` — `w-24` still wrapped "Analyze all moves"
  to two lines.
- Column 1 (board panel) wrapper gained `w-[440px]`, matching the board's own fixed width — the
  Top/Bottom player boxes previously stretched to whatever width the CSS grid's `auto` track ended
  up being, which could exceed the board's edge.
- Removed Column 2's header row (`<h3>Moves</h3>` + the opening/ECO/time-class `<span>`) entirely.
- Added a new page-level line showing opening name/ECO/time class directly above the whole
  Board/Moves/Analysis grid (between the "Header" `MyBox` and the grid `<div>`), replacing its old
  spot inside Column 2's now-removed header.
- Changed the 3-column grid from `xl:grid-cols-[auto_1fr_1fr]` to `xl:grid-cols-[440px_440px_440px]`
  — Columns 2/3 were flexible `1fr` tracks that reserved their full share of leftover width
  regardless of their content's own (now-fixed) size, so the panels kept expanding past their
  content. All three columns are now a fixed 440px, matching the board.
- Added an unconditional `w-[440px]` to Column 2's and Column 3's own wrapper divs too (Column 1
  already effectively had this via its inner div) — the grid's `440px` tracks only apply at the
  `xl:` breakpoint, so below that (stacked layout) Column 3's visible `MyBox` panels were stretching
  full-width with nothing else constraining them.
- Increased the grid's gap from `gap-3` to `gap-6` (24px) for visible breathing room to the right of
  the Board and Moves columns.
- Added `rounded-lg bg-pink-50 p-2` to Column 2's (Moves) wrapper and `rounded-lg bg-yellow-50 p-2`
  to Column 3's (Analysis) wrapper — yellow deliberately kept off Moves specifically, since that's
  the panel where `MoveTree`'s `text-yellow-600` "inaccuracy" annotations appear.

### src/lib/backNav.ts (new)
- `pushBackTarget(url)` / `popBackTarget(currentSearchParams, fallback)` — sessionStorage-backed
  stack (array, not a single slot) replacing `saveBackNav`/`useBackNav` for this project. Pushing
  appends the current page's URL; popping removes the last entry and overrides its `player` param
  with its current live value from `currentSearchParams` before returning the URL to navigate to —
  every other param in the popped URL (e.g. `eco`/`opening`/`dateFrom`, or Position Detail's own
  `tab`/`move`) is left as the historical snapshot. The override is applied lazily, only at pop
  time, since a stack entry can only ever be observed by being popped.
- **Fix**: `GLOBAL_FILTER_BACK_KEYS` narrowed from `['player', 'eco', 'opening', 'dateFrom']` to
  `['player']` only. `eco`/`opening`/`dateFrom` only exist on pages that actually have those
  filters (Games/Habits/Graph/Openings/Termination) — `/analyze` and `/position/[id]` never carry
  them, so overriding from those pages was deleting legitimate values from the popped target
  instead of restoring them. `player` doesn't have this problem since it's genuinely present on
  every page in the chain.

### src/ui/BackButton.tsx (new)
- Small client component (`fallback`, `label?`, `className?`) styled to match `MyBackHomeNav`'s
  existing link look. `onClick` calls `router.push(popBackTarget(searchParams, fallback))` — the
  click-time logic `MyBackHomeNav`'s plain `<a href>` can't provide.

### src/lib/chesscom.ts
- `ChessComGame` gained two new optional fields: `termination?: string | null` and
  `finalEval?: number | null`.

### src/app/analyze/page.tsx
- Populates `raw.termination`/`raw.finalEval` from `row.gd_termination`/`row.gd_final_eval` when
  building the `ChessComGame` object — every `/analyze` load already fetches the full
  `tgd_gamesdecon` row via `getGameById()`, so no other call site needed changes.
- Removed `useBackNav`/`BACK_KEY`/`backPath` (no longer computed or passed to `ChessBoardView`).
  The error-state branch now renders `<MyBackHomeNav />` + `<BackButton fallback='/' />`.

### src/app/position/[id]/page.tsx
- Removed `useBackNav`/`BACK_KEY`/`backPath` — no longer computed or passed to `PositionDetail`
  (it resolves its own back target internally via `BackButton` now).

### src/ui/analysis/PositionDetail.tsx
- Removed `backPath` from `PositionDetailProps` and the `saveBackNav`/`BACK_KEY` import; added
  `usePathname`/`useSearchParams`. Header now renders `<MyBackHomeNav />` + `<BackButton
  fallback='/habits' />`. The Game History row click now calls `pushBackTarget()` with Position
  Detail's own current URL (built from `pathname`/`searchParams`, matching `useGlobalFilter.ts`'s
  existing pattern) instead of `saveBackNav(BACK_KEY)`.

### src/ui/HomeDashboard.tsx
- `handleSelectGame` now calls `pushBackTarget()` (current URL via `usePathname`/`useSearchParams`)
  instead of `saveBackNav(BACK_KEY)`.
- Removed the dead `lastAnalyzedGdid` pass-through prop.

### src/app/openings/page.tsx
- Same change as `HomeDashboard.tsx`'s `handleSelectGame`.
- Removed the `highlightParam`/`lastAnalyzedGdid` computation and prop passed to
  `OpeningScoreChart`.

### src/ui/analysis/HabitsTable.tsx (back-nav)
- Row click now calls `pushBackTarget()` (current URL via `usePathname`/`useSearchParams`) instead
  of `saveBackNav(BACK_KEY)`.

### src/lib/constants.ts (back-nav)
- Removed `BACK_KEY` — no remaining consumers anywhere in the project.

### src/ui/charts/RatingChart.tsx
- Added `overrideClass='h-6 md:h-6'` to the "Granularity" `MySelect`.

### src/app/owner/pipeline/page.tsx
- Added `h-6 md:h-6` to the run-id picker's existing `overrideClass='w-28'`.

### src/ui/player/DeconstructButton.tsx
- Added `overrideClass='h-6 md:h-6'` to the "Records" `MySelect`.

### src/lib/analysis/chessdb.ts
- `MoveRow` gained `eva_depth: number | null`; both `getMovesForPosition` and
  `getMoveSummaryForPosition` now select `e.eva_depth` alongside `e.eva_cp`.
- `buildHabitsFilter` gained a `sinceDate` opt and returns a new `sinceFilter` clause
  (`AND h.hab_last_occurred >= $N`, converted from the date string the same way `games.ts` already
  converts `dateFrom` — `Math.floor(new Date(...).getTime() / 1000)`).
- `getHabitsData`/`getHabitsCount` accept `sinceDate`, apply `sinceFilter`, and `getHabitsData`
  returns `last_occurred`.

### src/lib/analysis/buildHabits.ts
- Aggregate query adds `MAX(d.gd_end_time)::int AS last_occurred`; `HabitAggregate` gained
  `lastOccurred`; the upsert's INSERT column list, params, and `ON CONFLICT` `SET` clause now
  include `hab_last_occurred`.
- Added a `cache_clearTable('thab_habits', 'buildHabits')` call after the upsert loop — its upsert
  is a raw `table_query` write, which (unlike `table_write`/`table_update`/`table_upsert`/
  `table_delete`) never auto-clears the cache, so every Habits page read cached before a pipeline
  run was staying stale forever afterward. Same pattern `upgradePositionEvaluation` already uses
  for its own raw writes (`chessdb.ts:356-357`).

### scripts/schema.sql
- `thab_habits` gained `hab_last_occurred integer`, appended at the end (no reorder needed).

### src/lib/constants.ts
- `DEFAULT_DATE_FROM` changed from `'2025-01-01'` to `'2024-01-01'`.
- Added `WIDTH_GAME_NUMBER = 'w-16'` for the new Games table `gdid` filter input.

### src/app/owner/constants/page.tsx
- Added the `WIDTH_GAME_NUMBER` import and its `CONSTANTS_SECTIONS` entry.

### src/lib/actions/games.ts
- `GameFilters` gained `gdid?: number`; `buildFilters` adds an exact-match
  `{ column: 'gd_gdid', operator: '=', value: filters.gdid }` filter when set.

### src/app/habits/page.tsx
- Joined the existing shared `dateFrom` global filter (`useGlobalFilter('dateFrom')`, defaulting to
  `DEFAULT_DATE_FROM`) alongside the existing Opening/ECO globals — same draft-state-until-Filter-
  click pattern as `GameList.tsx`. `handleApplyOpeningEcoFilter`/`openingEcoFilterPending` renamed
  to `handleApplyFilters`/(passed as `filtersPending`) since the same Filter button now applies all
  three. `dateFromFilter` passed to `getHabitsData`/`getHabitsCount` as `sinceDate` and added to the
  relevant effect dependency arrays.
- `MyPaginationFooter` now passes `totalRows={totalCount}` — already-fetched real count, no new
  query needed.
- `handleToggleDismiss` now calls `load()` (re-fetches the current page) after
  `dismissHabit`/`undismissHabit` completes, instead of locally filtering `rows` — a page now
  backfills to `rowsPerPage` from the next row in sort order instead of ending up short.

### src/ui/analysis/HabitsTable.tsx
- Added `dateFrom`/`onDateFromChange`/`onApplyFilters`/`filtersPending` props (renamed from
  `onApplyOpeningEcoFilter`/`openingEcoFilterPending`), a `FilterDateInput` in the filter row, a
  "Last occurred" column (header, filter-row cell, and formatted `dd/mm/yy` data cell via new local
  `formatLastOccurred`), `last_occurred` added to `HabitRow`, and the empty-state `colSpan` updated
  from 13 to 14.
- Swapped the filter-row order of the "Show dismissed" ✕/↺ toggle and the "Filter" button — toggle
  now comes first, Filter after it.
- Fixed the per-row Dismiss/Restore ✕/↺ button showing a blue background it never had before the
  raw-`<button>`-to-`MyButton` conversion: added `bg-transparent hover:bg-transparent` to its
  `overrideClass` (same bug class, same fix, as the earlier `MoveBadge` fix).
- Row click now calls `saveBackNav(BACK_KEY)` (captures the current Habits URL, including all
  active filters) immediately before navigating to `/position/${row.pos_id}`.

### src/app/position/[id]/page.tsx
- `PositionDetailContent` now reads `useBackNav(BACK_KEY) ?? '/habits'` (same pattern
  `analyze/page.tsx` already uses) and passes it down as a new `backPath` prop.

### src/ui/analysis/PositionDetail.tsx
- Accepts a new `backPath: string` prop instead of a hardcoded `<MyBackHomeNav backPath='/habits'
  />` — the back button now restores whatever URL (with filters) the user actually came from,
  instead of always discarding them and landing on a bare `/habits`.

### src/ui/games/GameList.tsx
- `MyPaginationFooter` now passes `totalRows={totalCount}` — already-fetched real count, no new
  query needed.
- Removed the dead `lastAnalyzedGdid` prop and its row-highlighting className.
- Reordered columns — "Player" moved to the first column; a new "Game #" column (`row.gd_gdid`)
  added directly after "Date", with a `FilterTextInput` (exact match, `updateFilter`'s `parseInt`
  branch extended to cover `gdid`) in its filter-row cell. Empty/loading-state `colSpan` updated
  from 13 to 14.
- Swapped "#" back to the first column, ahead of "Player". Final order: #, Player, Date, Game #,
  Color, Time, Opponent, Opp. rating, My rating, Result, Termination, Opening, ECO, (Analyze).

### src/ui/board/ChessBoardView.tsx (temporary diagnostic)
- Added `console.log('runAnalysis depth:', depth, '(stockfishDepth prop:', stockfishDepth, ')')`
  right before the `engine.analyzeGame(...)` call in `runAnalysis()`, to confirm at runtime whether
  the Depth dropdown's selected value actually reaches the Stockfish call. **To be removed** once
  the "Saved at depth: 16" vs. selected Depth 20 discrepancy is diagnosed.
- Removed the above diagnostic `console.log` now that the discrepancy is attributed to Fast Refresh
  resetting `stockfishDepth` state during concurrent file edits, not a code bug.
- Changed the "Analyzing..." progress label from `Move {current} / {total}` to
  `Ply {current} / {total}` — `analysisProgress` counts plies (half-moves) within the selected
  From/To range, not full moves, so "Move" was misleading (e.g. showed "Move 2 / 17" on a
  13-full-move game).
- Fixed the actual depth-mismatch bug: the Game Analysis "Depth" dropdown's `value` fallback
  changed from `?? STOCKFISH_DEFAULTS.depth` (16, not a valid option in this dropdown) to
  `?? STOCKFISH_DEFAULTS.reanalyzeDepth` (20, matches the dropdown's own first option) — same fix
  as `analyze/page.tsx`'s `useState` default below, applied here too for consistency/defensiveness.

### src/lib/constants.ts (Stockfish reanalyze default)
- Added `STOCKFISH_REANALYZE_DEFAULT_DEPTH = 20` — the Game Analysis "Depth" dropdown's own initial
  value, distinct from `STOCKFISH_DEPTH` (16, the background pipeline's default depth, which isn't
  one of this dropdown's own options).

### src/lib/stockfish.ts
- `STOCKFISH_DEFAULTS` gained a new `reanalyzeDepth` field (`STOCKFISH_REANALYZE_DEFAULT_DEPTH`) —
  `depth` (16) is unchanged and still used as-is for the pipeline/fallback default elsewhere in this
  file.

### src/app/analyze/page.tsx (depth-default bug fix)
- `stockfishDepth`'s initial `useState` changed from `STOCKFISH_DEFAULTS.depth` (16 — not a valid
  option in the Game Analysis Depth dropdown's list of `['20','22','24','26','28','30','40']`) to
  `STOCKFISH_DEFAULTS.reanalyzeDepth` (20). Root cause of the whole depth-mismatch investigation: a
  native `<select value="16">` with no matching `<option value="16">` silently displays the first
  option ("20") as selected while the underlying state stays 16 — so the dropdown looked correct on
  every fresh page load without ever actually being at the depth it appeared to show.

### src/app/owner/constants/page.tsx (Stockfish reanalyze default)
- Added the `STOCKFISH_REANALYZE_DEFAULT_DEPTH` import and its `CONSTANTS_SECTIONS` entry.

### src/ui/board/ChessBoardView.tsx (Infinite removal)
- Removed `'Infinite'`/`'infinite'` entirely: the Position Analysis Depth dropdown's `options` list
  no longer includes it, its `value`/`onChange` no longer special-case it, `deepAnalysisDepth`/
  `onDeepAnalysisDepthChange` props and `buildSavedAnalysisFromMoveSummary`'s `targetDepth` param
  are now plain `number` instead of `number | 'infinite'`.

### src/app/analyze/page.tsx (Infinite removal)
- `deepAnalysisDepth` state narrowed from `useState<number | 'infinite'>` to `useState<number>`.

### src/lib/stockfish.ts (Infinite removal)
- `startInfiniteAnalysis`'s `maxDepth` param narrowed from `number | 'infinite'` to `number`; always
  sends `go depth ${maxDepth}` now — an unbounded engine search is no longer reachable anywhere in
  the app.

### src/app/owner/constants/page.tsx (Infinite removal)
- `STOCKFISH_DEEP_ANALYSIS_DEPTH`'s description updated to drop its stale "deep/infinite" wording.

### src/ui/board/ChessBoardView.tsx (button width revert)
- Reverted the "Re-analyse"/"Analyze Game" button and the "Analyze Position" button from
  `overrideClass='w-32'`/`'w-32 bg-purple-600 hover:bg-purple-700'` back to `'w-full'`/`'w-full
  bg-purple-600 hover:bg-purple-700'` — now bounded by Column 3's fixed 440px width instead of the
  unbounded page width these were originally capped against.

### src/ui/charts/OpeningScoreChart.tsx
- Removed the dead `lastAnalyzedGdid` prop and its identical row-highlighting className.

### src/app/page.tsx
- Removed the `searchParams`/`params.highlight`/`lastAnalyzedGdid` computation — `Home` no longer
  needs `searchParams` at all now that nothing reads `?highlight=`.

### src/ui/AppNav.tsx
- Updated the `GLOBAL_FILTER_KEYS` comment to drop its now-stale reference to `?highlight=` (the
  feature it was explaining no longer exists), keeping the general "explicitly enumerated, not
  forwarded" reasoning.

### src/ui/analysis/PipelineLogTable.tsx
- Added `fetchTotalRows` import and a `totalRows` state, fetched alongside the existing
  `fetchTotalPages` call in `fetchdata()` (same `table`/`filters`/`skipCache: true`), and passed to
  `MyPaginationFooter` as `totalRows`.

### src/ui/board/ChessBoardView.tsx (move label + Position Analysis title)
- `getCurrentMoveLabel()` tightened from `"7. d5"`/`"7... d5"` (space before the move) to
  `"7.d5"`/`"7...d5"` (no space) — applies everywhere it's used.
- "Position Analysis" `MyBox` title changed from a static `'Position Analysis'` back to
  `` `Position Analysis — ${currentMoveLabel}` ``, using the tightened format above.

### src/ui/board/ChessBoardView.tsx (Save Line/Save Full Analysis removal)
- Removed `handleSaveLine`/`handleSaveTree`, the `saveMessage` state, the "Save Line" button, and
  the now-unused `saveAnalysisLine`/`saveAnalysisTree` imports — confirmed nothing in the app ever
  reads this data back (`getSavedAnalyses` was never called anywhere). `handleSaveTree` had no
  button calling it either — already fully dead code before this removal.
- Simplified the "Branch indicator + save" wrapper down to just the branch indicator (the "Variation
  / Return to main line" controls) now that the save button/message sharing that row are gone.

### src/lib/actions/games.ts (Save Line/Save Full Analysis removal)
- Removed `saveAnalysisLine`, `saveAnalysisTree`, `getSavedAnalyses`, and the now-unused
  `SAVED_TABLE` constant.

### scripts/schema.sql (Save Line/Save Full Analysis removal)
- Removed the `tsa_savedanalyses` table definition (columns, identity sequence, primary key,
  index).

### src/lib/actions/games.ts (gev_cp_change fix)
- `upgradeGameEval` gained a `cpChange: number` parameter; SQL now also sets
  `gev_cp_change = $5` alongside `gev_cp`/`gev_depth`.

### src/ui/board/ChessBoardView.tsx (gev_cp_change fix)
- `persistAnalysisLines()` — `cpChange`/`cpLoss` are now computed before the `upgradeGameEval` call
  (was: after) and passed through so they're actually persisted, not just kept in local state.

### src/lib/analysis/chessdb.ts (teva_evaluations caching)
- Added `getPositionEvaluationsBulk(fens: string[])` — one batched query (`pos_fen = ANY($1)`)
  against `tpos_positions`/`teva_evaluations`, returning a map keyed by truncated FEN.

### src/lib/stockfish.ts (teva_evaluations caching)
- `analyzeGame()` gained an optional `cachedEvals` parameter. For each of the N+1 positions, if a
  cached eval exists at/above the target depth, its `cp`/`bestMove` are used directly (no
  `this.evaluate()` call) — `cp` is used as-is since `teva_evaluations` already stores White's-
  perspective cp, matching every other caller's convention; no `pv` is cached (the table only
  stores one best move), so a cached position contributes no `bestLineSans` for its ply.
- Each ply's `depth` is now `Math.min` of its two constituent positions' actual depths (which can
  exceed the requested target when either side came from a deeper cache hit), instead of always
  being stamped with the requested target depth regardless of what was actually used.

### src/ui/board/ChessBoardView.tsx (teva_evaluations caching wiring)
- `runAnalysis()` — calls `getPositionEvaluationsBulk(fens)` before `engine.analyzeGame(...)` and
  passes the result through as `cachedEvals`.
- Fixed the same stray `STOCKFISH_DEFAULTS.depth` fallback (16, not a valid Depth-dropdown option)
  found earlier in the dropdown's `value` prop — `runAnalysis()`'s own `const depth = stockfishDepth
  ?? STOCKFISH_DEFAULTS.depth` was still using it too; changed to `.reanalyzeDepth`, matching the
  earlier fix.

### src/ui/board/MoveTree.tsx (depth bracket)
- `EvalCell` and `InlineVariation`'s eval span now append `<span className='text-gray-400'> ({depth})</span>`
  after the formatted eval, mirroring `MoveBadge`'s existing `(count)` bracket style.

### src/ui/board/ChessBoardView.tsx (From/To move number inputs)
- Replaced both "From move" and "To move" `MySelect` dropdowns with `MyInput type='number'`
  (`min`/`max` bounded to `1..totalFullMoves`, `w-16 h-6 md:h-6`, label as a plain sibling `<span>`
  matching `owner/pipeline/page.tsx`'s numeric-input pattern, since `MyInput` has no built-in label
  prop unlike `MySelect`).
- Enforced To ≥ From via `onBlur` (not `onChange`) on both inputs, after finding live per-keystroke
  clamping made it impossible to type a value whose first digit was below the current floor (e.g.
  typing "11" snapped back to "5" after just the first "1"). `onChange` now only parses/sets state;
  `onBlur` clamps bounds and keeps To ≥ From once the user leaves the field.
- **Second bug found and fixed**: blanking the field to retype (e.g. clearing "To move" before
  typing "11") still snapped back instantly, without leaving the field — `parseInt('', 10)` is
  `NaN`, and the old `onChange`'s `... || totalFullMoves` fallback treated that as "invalid, use the
  default" on every keystroke, not just at blur. Fixed: `fromMove`/`toMove` can now transiently hold
  `NaN` while the field is empty mid-edit (`onChange` sets `NaN` directly for `''`, no fallback);
  `value` renders `''` when the state is `NaN` (so the field actually looks empty, matching what's
  typed) instead of snapping to a number; `onBlur` resolves a lingering `NaN` back to a real default
  (`1` for From, `totalFullMoves` for To) before applying the usual bounds/To-≥-From clamp. Every
  other reader of `fromMove`/`toMove` (slice math, `existingDepthRange`) already treats `NaN` as `0`
  via `Array.prototype.slice`'s own coercion — harmless and self-correcting once blur fires, and
  blur always fires before the Analyze button (a separate element) can be clicked, so `runAnalysis()`
  itself never sees `NaN`.
- Removed the now-unused `fullMoveOptions` array (only consumer was the old "From move" dropdown).

Manual SQL for the user to run (given in chat, not executed here):
```sql
ALTER TABLE thab_habits ADD COLUMN hab_last_occurred integer;
```
```sql
DROP TABLE tsa_savedanalyses;
```

## Testing
- [ ] Run the `ALTER TABLE thab_habits ADD COLUMN hab_last_occurred integer;` SQL above on local
      before testing Habits (see "Give me the SQL to update local" earlier in this session).
- [ ] On `/analyze`, confirm each evaluated move in the Moves panel (main line and any variations)
      shows its depth in small gray text after the eval, e.g. "+50 (16)", and that it doesn't wrap
      or get clipped within the narrow Eval column.
- [ ] On `/analyze`'s Game Analysis panel (after any analysis exists), confirm "From move" and "To
      move" are now number inputs, not dropdowns, and that you can type a full multi-digit value
      like "11" without it snapping back after the first digit.
- [ ] Type a From value greater than the current To value, then click/tab away from the field —
      confirm To bumps up to match only once you leave the field, not while typing. Try setting To
      below the current From value directly, then leave the field — confirm it clamps back up to
      From.
- [ ] On "To move" (or "From move"), select-all/backspace to blank the field without leaving it —
      confirm it stays visibly empty (doesn't snap back to a number) so you can type a fresh
      multi-digit value like "11" from scratch; confirm leaving the field empty and then blurring
      resolves it to a sensible default instead of staying blank or erroring.
- [ ] Open a game on `/analyze`, navigate to a position that already has deep-enough saved analysis
      (e.g. a popular opening position analyzed before) with the Depth dropdown at or below its
      saved depth — confirm the "Position Analysis" panel shows results immediately (with "From
      saved analysis" instead of nodes/nps/timeMs) rather than a bare "Analyze Position" button.
- [ ] On that same panel, raise the Depth dropdown above what's saved, or navigate to a
      never-analyzed position — confirm it correctly falls back to the plain "Analyze Position"
      button.
- [ ] Click "Analyze Position" on a position where "Moves From This Position" shows moves at
      noticeably different depths (e.g. one deep, one shallow — like the 7.d3 example discussed
      this session). After it completes, confirm the shallow candidates' Eval/depth in "Moves From
      This Position" have been upgraded to the just-analyzed depth (may take a few seconds after
      the main search completes, since the extra evaluations run afterward).
- [ ] Open `/habits`, confirm a "Last occurred" column appears with a date (or "—" for habits from
      before this column existed, until the next Build Habits pipeline run backfills it).
- [ ] Set the shared Date From filter (via Habits' new filter box, or via `/games`, since it's the
      same `?dateFrom=` URL param) and click Filter — confirm Habits, Games, Graph, and Openings all
      reflect the same date, and that Habits' row set actually changes (habits with no occurrence
      since that date drop out).
- [ ] Confirm `/games`, `/graph`, and the Openings chart now default to `2024-01-01` instead of
      `2025-01-01` when no `dateFrom` is set (clear the URL param / open in a fresh tab).
- [ ] Run the Pipeline's "Build Habits" step at least once after the schema change, and confirm no
      errors — this is what actually populates `hab_last_occurred` for existing habit rows.
- [ ] Open `/games`, `/habits`, and the Owner Pipeline Log table — confirm each footer's row-count
      text now shows the real row count (e.g. not a suspiciously round `totalPages * rowsPerPage`
      figure on a partially-filled last page).
- [ ] Run Build Habits again, then reload `/habits` in the same browser tab without a hard refresh —
      confirm newly-populated/changed data shows up immediately (no more stale-cache "no data" until
      a manual cache clear or server restart).
- [ ] On `/habits`, confirm the per-row Dismiss/Restore ✕/↺ button has no blue background (blends
      into the row, matching its original look before the `MyButton` conversion).
- [ ] On `/habits`, confirm the filter-row order is now ✕/↺ toggle first, "Filter" button after it.
- [ ] On a page with more habits than fit on one page (e.g. rowsPerPage=3, more than 3 total),
      dismiss a row — confirm the page re-fills to a full 3 rows (backfilled from what was the next
      page) instead of shrinking to 2, and that `totalCount` in the footer still decrements by 1.
- [ ] On `/habits`, set a Player and ECO filter, click "Filter", then click into a habit row to open
      Position Detail, then click "← Back" — confirm you land back on `/habits` with the same
      Player/ECO filters still applied (not cleared).
- [ ] From Position Detail's "Game History" tab, click into a game (goes to `/analyze`), then click
      "← Back" from there — confirm it returns to that same Position Detail page (not `/habits`
      directly) — and from there, "← Back" again returns to Habits with filters intact.
- [ ] Confirm none of `/analyze`, `/position/[id]`, or `/habits` ever show a `back=` (or similarly
      polluted) query param in the address bar — the stack lives only in sessionStorage.
- [ ] Starting with no player selected, go Habits → Position Detail → Analyze, pick a player on
      Analyze (via the PlayerProfile header), then click "← Back" twice — confirm the picked player
      is still selected on Habits (not reverted to "no player"), while `eco`/`opening`/`dateFrom`
      still restore to whatever Habits actually had when you left it.
- [ ] On `/analyze`, use the "Games From This Position" panel to switch between 3+ different games
      in a row, then click "← Back" once — confirm it returns directly to the original parent page
      (Position Detail/Home/Openings), not to the previous game.
- [ ] Confirm the actual browser back button/gesture (not the app's "← Back" link) is unaffected by
      this change — it continues to step through raw browser history as before; this is expected,
      not a bug.
- [ ] Open a game on `/analyze` (e.g. `?game=33624&player=stricade`) — confirm a line under the
      bottom player box shows the game's Date, Termination, and Final evaluation (e.g. "06/08/26 ·
      Resignation · Final eval: +2.34").
- [ ] Open `/analyze` for a specific player (from Home, Openings, or Position Detail) — confirm the
      PlayerProfile header highlights only that one player's card, not both.
- [ ] Set Player/ECO/Date From on Habits, go Habits → Position Detail → Analyze, then click "← Back"
      twice back to Habits — confirm ECO and Date From are still applied (this was the actual bug
      reported — previously they were stripped on the way back through Analyze/Position Detail).
- [ ] Open a game on `/analyze` — confirm "Game #<id>" now appears in the info line alongside
      Date/Termination/Final evaluation.
- [ ] On `/analyze`, confirm the Depth/Lines/From move/To move dropdowns are now the same height as
      Habits' "Date From" filter, especially at desktop window widths (this is where `MySelect`'s
      old default grew taller). Also spot-check `/graph` (Granularity), Owner Pipeline (run-id
      picker), and a player page's Deconstruct panel (Records).
- [ ] On `/analyze`, confirm the same 5 dropdowns are now narrow (`w-20`) instead of stretching wide
      for a 2-digit number.
- [ ] On `/analyze`, confirm the White/Black move columns in the "Moves" panel are now a consistent
      `w-20` width instead of auto-sizing to each move's text length.
- [ ] On `/analyze`, confirm the two Eval columns are also `w-20` with no visible gap before the
      following move column (White's Eval sitting flush against Black's move).
- [ ] On `/analyze`, confirm "Analyze all moves"/"Re-analyse" and "Analyze Position" are now `w-32`
      instead of stretching full-width, and that their text fits on one line without wrapping.
- [ ] On `/analyze`, confirm the Moves table no longer grows wider than 352px regardless of window
      size, and there's no visible gap between columns even on a wide screen.
- [ ] On `/analyze`, confirm the board's Top/Bottom player boxes no longer extend wider than the
      board itself (440px), even on a wide screen.
- [ ] On `/analyze`, confirm the "Moves" heading is gone, and the opening name/ECO/time class now
      appear as a single line above the whole Board/Moves/Analysis area (not inside the Moves
      panel).
- [ ] On `/analyze`, confirm the Moves table's rows are visibly tighter (about half the previous
      vertical spacing) without any row text being clipped.
- [ ] On `/analyze`, confirm rows are noticeably tighter still after the `MoveBadge` height fix
      (`h-4`), and that move text/annotation symbols aren't clipped at that height.
- [ ] On `/analyze` at a wide window size, confirm all three columns (Board/Moves/Analysis) stay at
      a fixed 440px and don't expand to fill extra screen space; confirm "Moves From This
      Position"/"Games From This Position" tables scroll horizontally within their column instead of
      forcing the column wider.
- [ ] Narrow the browser window until the layout stacks (below the `xl` breakpoint) — confirm the
      "Game Analysis"/"Position Analysis" boxes no longer stretch full-width, staying at 440px like
      Board and Moves.
- [ ] On `/analyze` at a wide window size, confirm there's now a visible gap to the right of the
      Board column and the Moves column (not just butted up against the next column).
- [ ] On `/analyze`, confirm the Moves panel has a light pink background and the Analysis panel
      (Game Analysis/Position Analysis boxes) has a light yellow background, and that an
      "inaccuracy"-classified move's yellow annotation text in the Moves panel is still clearly
      readable against the pink background.
- [ ] On `/` (Home) and `/openings`, confirm no game row is ever highlighted yellow anymore — the
      dead "just analyzed" feature is fully removed, nothing should visibly change since it never
      actually fired before either.
- [ ] On `/analyze`, confirm the Moves panel rows are now visibly tighter than before this latest
      fix — the `MoveBadge` height should actually be `h-4` at every window width now, not just
      below the `md:` breakpoint.
- [ ] On `/analyze` with a game around 40 full moves, confirm the Moves panel shows all (or nearly
      all) of them without a scrollbar; on a longer game, confirm the scrollbar appears as expected
      instead of the panel growing indefinitely.
- [ ] On `/analyze`, confirm the button says "Analyze Game" before any analysis exists (and still
      "Re-analyse" afterward), and the Position Analysis box title is now just "Position Analysis"
      with no move-label suffix.
- [ ] On `/` (Home) and `/openings` (or wherever the Games table renders), confirm "#" is the first
      column, "Player" is second, and a new "Game #" column appears right after "Date" showing the
      real database ID.
- [ ] Type a known game's ID into the new "Game #" filter and click Filter — confirm it returns
      exactly that one game.
- [ ] Open a game, set Depth to 20, click "Re-analyse", and check the browser console for the
      "runAnalysis depth:" log — report back what it actually prints (both the computed `depth` and
      the raw `stockfishDepth` prop) so the depth-mismatch bug can be diagnosed.
- [ ] Retest the Depth dropdown end-to-end with no concurrent file edits happening (i.e. not mid
      `#code`): set Depth to a non-default value (e.g. 24), click "Re-analyse", and confirm both
      "Saved at depth:" and the actual analysis time reflect that depth, not the default (16).
- [ ] Open a game on `/analyze`, click "Re-analyse" or "Analyze Game", and confirm the progress text
      now reads "Ply X / Y" instead of "Move X / Y".
- [ ] Open any game (ideally a never-before-visited one) on a freshly restarted server / new tab —
      confirm the Game Analysis "Depth" dropdown still visually shows "20" as before, but now
      clicking "Re-analyse" without touching the dropdown actually analyzes at depth 20 (check
      "Saved at depth:" updates to 20 after, and the run takes noticeably longer than a depth-16
      run would).
- [ ] On `/analyze`'s Position Analysis panel, confirm the Depth dropdown no longer offers
      "Infinite" as an option — only `20`/`22`/`24`/`26`/`28`/`30`/`40`.
- [ ] On `/analyze`, confirm "Re-analyse"/"Analyze Game" and "Analyze Position" now stretch to fill
      Column 3's width (440px) instead of sitting at a fixed 32-width, and don't overflow the panel.
- [ ] On `/analyze`, navigate to a move and confirm "Moves From This Position" and "Position
      Analysis" both show the tightened move label (e.g. "7.d5" for White, "7...d5" for Black, no
      space) — and that Position Analysis's title now includes the move label again.
- [ ] Run the `DROP TABLE tsa_savedanalyses;` SQL above on local, then confirm `/analyze` no longer
      shows a "Save Line" button and nothing errors when navigating/exploring variations.
- [ ] On a game with an already-upgraded ply (e.g. game 74412's ply 11, upgraded to depth 24 earlier
      this session), reload `/analyze` and confirm the Move Tree's classification/eval for that ply
      is now consistent with its `cp` (no more silently-stale blunder/mistake/inaccuracy label).
- [ ] Re-analyze a game containing at least one position also reached by other games (e.g. an early
      opening position likely already deepened by "Deepen Popular Positions") — confirm it completes
      noticeably faster than a full fresh analysis would, and that the resulting depth/eval for that
      ply reflects the cached (possibly deeper-than-requested) value, not a downgrade.
