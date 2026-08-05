# PLAN_pagination-footer — chess

## Title
Add nextjs-shared's MyPaginationFooter (page controls + rows-per-page dropdown) to the 3 UI
locations that currently render bare MyPagination with a fixed page-size constant and no
rows-per-page control: habits page, Pipeline Log table, and Game List. Each site's default rows
value comes from its existing constant; rows-options lists vary per site where the existing
default isn't one of MySelectRows's standard options.

## Plan
- [x] Reinstall `nextjs-shared` (was `2.1.48`, needed `2.1.49`+ for `MySelectRows`/
      `MyPaginationFooter`) — confirmed `2.1.51` now installed.
- [x] Add two new constants to `src/lib/constants.ts`, next to the existing page-size constants:
      `PIPELINE_LOG_ROWS_OPTIONS = [10, 20, 40, 100] as const` (agreed — mirrors nextjs-shared's own
      OwnerTableLogging pattern, same default value 40) and
      `GAME_LIST_ROWS_OPTIONS = [10, 15, 20, 50] as const` (agreed). `HABITS_ITEMS_PER_PAGE` (10)
      needs no new options constant — 10 is already one of `MySelectRows`'s standard defaults
      (`[10, 20, 50, 100]`).
- [x] `src/app/habits/page.tsx`:
      - Replace `import MyPagination from 'nextjs-shared/MyPagination'` with
        `import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'`.
      - Add `const [rowsPerPage, setRowsPerPage] = useState(() => ss('chess-habits-rows',
        HABITS_ITEMS_PER_PAGE))` and a persistence effect mirroring the existing `currentPage`
        pattern (`sessionStorage.setItem('chess-habits-rows', ...)` on change) — matches this
        file's own established convention for `currentPage`.
      - Change `totalPages` from `Math.ceil(totalCount / HABITS_ITEMS_PER_PAGE)` to
        `Math.ceil(totalCount / rowsPerPage)`; change the fetch effect's `limit`/`offset` to use
        `rowsPerPage` instead of the fixed constant; add `rowsPerPage` to that effect's dependency
        array.
      - Replace the `<MyPagination totalPages statecurrentPage setStateCurrentPage />` usage with
        `<MyPaginationFooter totalPages statecurrentPage setStateCurrentPage rowsPerPage
        setRowsPerPage={v => { setRowsPerPage(v); setCurrentPage(1) }} />` (default `rowsOptions`,
        no override needed). The existing "Page X of Y (N moves)" label stays exactly as-is
        (agreed) — not trimmed or removed, even though page position is now also shown by the
        footer's own buttons.
- [x] `src/ui/analysis/PipelineLogTable.tsx`:
      - Replace the `MyPagination` import with `MyPaginationFooter`; import
        `PIPELINE_LOG_ROWS_OPTIONS` alongside the existing `PIPELINE_LOG_ROWS_PER_PAGE`.
      - Add `const [rowsPerPage, setRowsPerPage] = useState(PIPELINE_LOG_ROWS_PER_PAGE)` (plain
        `useState`, no sessionStorage persistence — this file has no existing persistence pattern
        for `currentPage` either, so none is added here).
      - Update the `fetchFiltered`/`fetchTotalPages` calls' `limit`/`offset`/`items_per_page` to use
        `rowsPerPage` instead of the fixed constant; add `rowsPerPage` to the fetch effect's
        dependency array.
      - Replace `MyPagination` with `MyPaginationFooter`, passing
        `rowsOptions={PIPELINE_LOG_ROWS_OPTIONS}` and `setRowsPerPage={v => { setRowsPerPage(v);
        setCurrentPage(1) }}`.
- [x] `src/ui/games/GameList.tsx`:
      - Replace the `MyPagination` import with `MyPaginationFooter`; import
        `GAME_LIST_ROWS_OPTIONS` alongside the existing `GAME_LIST_ITEMS_PER_PAGE`.
      - Add `const [rowsPerPage, setRowsPerPage] = useState(() => ss('chess-gl-rows',
        GAME_LIST_ITEMS_PER_PAGE))` and a persistence effect mirroring this file's own existing
        `currentPage` sessionStorage pattern.
      - Change `totalPages` and the `fetchFilteredGames(...)` call to use `rowsPerPage` instead of
        the fixed constant; add `rowsPerPage` to the fetch effect's dependency array.
      - Replace `MyPagination` with `MyPaginationFooter`, passing
        `rowsOptions={GAME_LIST_ROWS_OPTIONS}` and `setRowsPerPage={v => { setRowsPerPage(v);
        setCurrentPage(1) }}`. The existing "Page X of Y (N games)" label stays exactly as-is
        (agreed, same treatment as habits page).
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### src/lib/constants.ts
- Added `GAME_LIST_ROWS_OPTIONS = [10, 15, 20, 50] as const` and
  `PIPELINE_LOG_ROWS_OPTIONS = [10, 20, 40, 100] as const`.

### src/app/habits/page.tsx
- `MyPagination` → `MyPaginationFooter`. Added `rowsPerPage` state (seeded from
  `HABITS_ITEMS_PER_PAGE`, sessionStorage-persisted under `chess-habits-rows`, matching the
  existing `currentPage` pattern). `totalPages` and the fetch effect's `limit`/`offset` now use
  `rowsPerPage`. Default `rowsOptions` (no override — 10 is already a standard option). The
  "Page X of Y (N moves)" label is unchanged.

### src/ui/analysis/PipelineLogTable.tsx
- `MyPagination` → `MyPaginationFooter`. Added `rowsPerPage` state (plain, seeded from
  `PIPELINE_LOG_ROWS_PER_PAGE`, no persistence — matches this file's existing lack of a
  `currentPage` persistence pattern). `fetchFiltered`/`fetchTotalPages` now use `rowsPerPage`.
  `rowsOptions={PIPELINE_LOG_ROWS_OPTIONS}`.

### src/ui/games/GameList.tsx
- `MyPagination` → `MyPaginationFooter`. Added `rowsPerPage` state (seeded from
  `GAME_LIST_ITEMS_PER_PAGE`, sessionStorage-persisted under `chess-gl-rows`, matching the
  existing `currentPage` pattern). `totalPages`, `fetchFilteredGames(...)`, and the `gameNumber`
  calculation now use `rowsPerPage`. `rowsOptions={GAME_LIST_ROWS_OPTIONS}`. The
  "Page X of Y (N games)" label is unchanged.

## Testing
- [ ] User runs:
      npm run dev
- [ ] Habits page: confirm the new footer (rows-per-page dropdown + centered pagination) replaces
      the old bare pagination; changing rows-per-page refetches and resets to page 1; the "Page X
      of Y (N moves)" label still shows correctly; rows-per-page choice persists across a reload
      (sessionStorage).
- [ ] Pipeline Log tab (`/owner/pipelinelog`): same checks — footer renders, rows-per-page options
      are `10/20/40/100` (default `40`), changing it refetches and resets to page 1.
- [ ] Games list (wherever `GameList` renders, e.g. a player's game history): footer renders, rows
      options are `10/15/20/50` (default `15`), changing it refetches, resets to page 1, and
      persists across reload; the "Page X of Y (N games)" label and game numbering both stay
      correct after changing rows-per-page.
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly.
