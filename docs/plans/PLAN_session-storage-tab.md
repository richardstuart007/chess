# PLAN_session-storage-tab — chess

## Title
Add Session Storage tab to Owner page

## Plan
- [x] Prerequisite (user-owned, separate from this plan): chess's `/owner` page is currently a
      link-list landing page (`TOOLS` array of `Link`s to standalone routes like `/owner/logging`,
      `/owner/cache`), not `nextjs-shared`'s `OwnerPage` tab component that infostore/
      next-bridgeschool/next-bridge use. User will restructure `/owner` to use `OwnerPage` tabs
      (matching the other projects) before this step can be added the same way. — Done: `/owner`
      now uses `OwnerPage` tabs (`Logging`, `Cache`, `Tools`, `Dataflow`, `Constants`).
- [x] Once `/owner` uses `OwnerPage` tabs: import `OwnerTableSessionStorage` from `nextjs-shared`
      and add `{ label: 'Session Storage', content: <OwnerTableSessionStorage /> }` to the tabs
      array.
- [x] Discovered mid-rollout: `nextjs-shared`'s `package.json` was missing the
      `./OwnerTableSessionStorage` exports entry (fixed in that project, version 2.1.60).
      Reinstalled `nextjs-shared` here to pull the fix.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] Note (not yet agreed, separate follow-up): chess already writes ~20 of its own
      `sessionStorage` keys (`chess-gl-*`, `chess-osc-*`, `chess-tc-*`, `chess-habits-*`,
      `chess-graph_*`) but none use the `rs7_` prefix `OwnerTableSessionStorage` filters on, so
      none of them will appear in the new tab as-is. Migrating those keys to an `rs7_ch_`
      sub-prefix so they show up is a separate, larger task — out of scope here unless agreed.
      — Agreed: adopt `rs7_chess_` as the project's sub-prefix (see steps below).
- [x] Add `SESSION_STORAGE_PREFIX = 'rs7_chess_'` to `src/lib/constants.ts` (module scope) and
      mirror the entry into `CONSTANTS_SECTIONS` in `src/app/owner/constants/page.tsx`.
- [x] `src/ui/games/GameList.tsx`: rename keys `chess-gl-draftFilters` → `${SESSION_STORAGE_PREFIX}gl-draftFilters`,
      `chess-gl-filters` → `${SESSION_STORAGE_PREFIX}gl-filters`,
      `chess-gl-page` → `${SESSION_STORAGE_PREFIX}gl-page`,
      `chess-gl-rows` → `${SESSION_STORAGE_PREFIX}gl-rows`.
- [x] `src/ui/charts/TerminationChart.tsx`: rename keys `chess-tc-color` → `${SESSION_STORAGE_PREFIX}tc-color`,
      `chess-tc-dateFrom` → `${SESSION_STORAGE_PREFIX}tc-dateFrom`.
- [x] `src/app/graph/page.tsx`: change `STORAGE_KEY = 'graph_filters'` to
      `STORAGE_KEY = \`${SESSION_STORAGE_PREFIX}graph_filters\`` (feeds the existing
      `_dateFrom`/`_timeClass`/`_limit` suffixed keys unchanged).
- [x] `src/app/habits/page.tsx`: change `STORAGE_KEY = 'habits_filters'` to
      `STORAGE_KEY = \`${SESSION_STORAGE_PREFIX}habits_filters\``; rename keys
      `chess-habits-page` → `${SESSION_STORAGE_PREFIX}habits-page`,
      `chess-habits-rows` → `${SESSION_STORAGE_PREFIX}habits-rows`.
- [x] `src/ui/charts/OpeningScoreChart.tsx`: rename all 13 keys (`chess-osc-color`, `chess-osc-from`,
      `chess-osc-mingames`, `chess-osc-results-count`, `chess-osc-datefrom`, `chess-osc-eco`,
      `chess-osc-name`, `chess-osc-sort`, `chess-osc-colors`, `chess-osc-results`,
      `chess-osc-terminations`, `chess-osc-rating-min`, `chess-osc-rating-max`) from the literal
      `chess-` prefix to `${SESSION_STORAGE_PREFIX}osc-...`, suffix unchanged.
- [x] No migration/back-compat shim for old keys — sessionStorage is per-tab and ephemeral, so
      existing in-flight filter state simply resets on next visit to each page.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] Bug found during testing (not caused by the key rename — pre-existing, just surfaced by it):
      hydration mismatch on `/` — `GameList.tsx`'s `filtersPending` (line 201, compares
      `draftFilters` vs `filters`) can differ between server render (always `false`, since
      `sessionStorage` is unavailable server-side so `ss()` returns the same fallback for both)
      and client hydration (`true`, if a genuine unapplied draft/applied divergence is stored),
      causing `FilterActionButton`'s `variant` prop — and its rendered className/text — to mismatch.
      Same lazy-`sessionStorage`-read-in-`useState`-initializer pattern (`ss`/`sso`) is used in
      `GameList.tsx`, `TerminationChart.tsx`, `OpeningScoreChart.tsx`, `graph/page.tsx`, and
      `habits/page.tsx` — any of them could hit an analogous mismatch. Agreed scope: fix all 5
      components.
- [x] `GameList.tsx`: `draftFilters`/`filters`/`currentPage`/`rowsPerPage` now initialize to
      plain defaults and restore from `sessionStorage` in a mount-only `useEffect`, gated behind
      a new `hydrated` flag; all downstream write/fetch effects gated on `hydrated` too. The
      existing "reset to page 1 on filters/players change" effect is guarded with a
      `filtersResetKeyRef` (skips the one transition caused by the hydration restore itself, so
      it doesn't clobber a restored page number, while still resetting on genuine later changes).
- [x] `TerminationChart.tsx`: `color`/`dateFrom` now initialize to plain defaults and restore
      post-mount via the same `hydrated`-gated pattern.
- [x] `graph/page.tsx`: `dateFrom`/`timeClass`/`limit` now initialize to plain defaults and
      restore post-mount via the same `hydrated`-gated pattern. The existing "sync applied
      filters" effect now also depends on `hydrated` so it re-syncs once right after restore,
      avoiding a spurious "pending" flash for values the user never actually changed this
      session.
- [x] `habits/page.tsx`: `currentPage`/`rowsPerPage` (the only two fields still using the old
      unsafe pattern — `color`/`quality`/`sortBy`/`minMove`/`minReached`/`showDismissed` already
      used the safe default-then-restore pattern) now initialize to plain defaults and restore
      in the same mount effect that already restored the other filters, gated behind the same
      `hydrated` flag. The existing "reset to page 1 on filter change" effect gets the same
      `filtersResetKeyRef` guard as `GameList.tsx`, for the same reason.
- [x] `OpeningScoreChart.tsx`: all 13 fields now initialize to plain defaults and restore
      post-mount via the same `hydrated`-gated pattern.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### src/app/owner/page.tsx
- Added `Session Storage` tab to the existing `OwnerPage` tabs (`Logging`, `Cache`, `Tools`,
  `Dataflow`, `Constants`), using `nextjs-shared/OwnerTableSessionStorage`.

### package.json / package-lock.json
- Reinstalled to pull `nextjs-shared@2.1.60` (adds the `OwnerTableSessionStorage` export).

### src/lib/constants.ts
- Added `SESSION_STORAGE_PREFIX = 'rs7_chess_'` (new "Session Storage" section) — the project's
  own sub-prefix under nextjs-shared's umbrella `rs7_` prefix, so chess's own sessionStorage keys
  are picked up by `OwnerTableSessionStorage`.

### src/app/owner/constants/page.tsx
- Mirrored `SESSION_STORAGE_PREFIX` into `CONSTANTS_SECTIONS` under a new "Session Storage"
  heading, listing every consumer file/function.

### src/ui/games/GameList.tsx
- Renamed sessionStorage keys `chess-gl-draftFilters`, `chess-gl-filters`, `chess-gl-page`,
  `chess-gl-rows` to `${SESSION_STORAGE_PREFIX}gl-...` equivalents.

### src/ui/charts/TerminationChart.tsx
- Renamed sessionStorage keys `chess-tc-color`, `chess-tc-dateFrom` to
  `${SESSION_STORAGE_PREFIX}tc-...` equivalents.

### src/app/graph/page.tsx
- Changed `STORAGE_KEY` from `'graph_filters'` to `` `${SESSION_STORAGE_PREFIX}graph_filters` ``.

### src/app/habits/page.tsx
- Changed `STORAGE_KEY` from `'habits_filters'` to `` `${SESSION_STORAGE_PREFIX}habits_filters` ``.
- Renamed sessionStorage keys `chess-habits-page`, `chess-habits-rows` to
  `${SESSION_STORAGE_PREFIX}habits-...` equivalents.

### src/ui/charts/OpeningScoreChart.tsx
- Renamed all 13 sessionStorage keys (`chess-osc-color`, `chess-osc-from`, `chess-osc-mingames`,
  `chess-osc-results-count`, `chess-osc-datefrom`, `chess-osc-eco`, `chess-osc-name`,
  `chess-osc-sort`, `chess-osc-colors`, `chess-osc-results`, `chess-osc-terminations`,
  `chess-osc-rating-min`, `chess-osc-rating-max`) to `${SESSION_STORAGE_PREFIX}osc-...`
  equivalents.
- Fixed a hydration mismatch: all 13 fields moved from a synchronous `sessionStorage`-reading
  `useState` initializer to plain defaults + a mount-only restore `useEffect` gated behind a new
  `hydrated` flag, so the first client render matches the server-rendered HTML.

### src/ui/games/GameList.tsx (hydration fix)
- `draftFilters`/`filters`/`currentPage`/`rowsPerPage` moved to the same plain-default +
  mount-restore + `hydrated` flag pattern. All effects that read these values (persist-to-storage,
  total-count fetch, page fetch) are now gated on `hydrated` so they don't fire prematurely with
  default values before the real restore completes.
- The existing "reset to page 1 when players/filters change" effect now uses a
  `filtersResetKeyRef` ref to distinguish the one-time hydration-restore transition (skipped, so
  it doesn't stomp a restored page number) from a genuine later filter/player change (still
  resets to page 1, as before).

### src/ui/charts/TerminationChart.tsx (hydration fix)
- `color`/`dateFrom` moved to the same plain-default + mount-restore + `hydrated` flag pattern;
  the stats-fetch and persist effects are gated on `hydrated`.

### src/app/graph/page.tsx (hydration fix)
- `dateFrom`/`timeClass`/`limit` moved to the same plain-default + mount-restore + `hydrated`
  flag pattern; the persist effect is gated on `hydrated`.
- The existing "sync applied filters on player change" effect now also depends on `hydrated`, so
  it re-syncs `appliedFilters`/`appliedLimit` once right after the restore completes — otherwise
  a restored `dateFrom`/`timeClass`/`limit` would show the Refresh button as "pending" for a
  change the user never actually made this session.

### src/app/habits/page.tsx (hydration fix)
- `currentPage`/`rowsPerPage` (the only two fields still using the unsafe synchronous-read
  pattern — the other filters already restored post-mount) moved into the existing mount-restore
  effect, gated behind a new `hydrated` flag; downstream write/count/load effects gated on
  `hydrated` too.
- The existing "reset to page 1 on filter change" effect gets the same `filtersResetKeyRef` guard
  as `GameList.tsx`, for the same reason (don't let the hydration-restore transition reset the
  just-restored page).

## Testing
- [ ] User runs:
      npm run dev
- [ ] Open `/owner` — confirm a "Session Storage" tab appears alongside the existing tabs and
      renders without error.
- [ ] Visit `/`, apply filters on the Games list, Opening Score chart, Termination chart, the
      Graph page, and the Habits page (change a few filter values on each), then open `/owner` →
      Session Storage tab and confirm keys like `rs7_chess_gl-filters`, `rs7_chess_osc-color`,
      `rs7_chess_graph_filters_dateFrom`, `rs7_chess_habits_filters`, `rs7_chess_tc-color` appear
      in the list with the values you set.
- [ ] Confirm each of those 5 pages still restores its filter/pagination state correctly on page
      reload (same-tab) — the rename shouldn't have broken read/write, only the key names.
- [ ] On the Games list (`/`), leave the current page at something other than 1, reload the page,
      and confirm it stays on that page (rather than snapping back to page 1) — this is the
      specific "restored page number surviving the hydration restore" behavior the
      `filtersResetKeyRef` guard is meant to preserve. Repeat on `/habits`.
- [ ] On `/`, open the browser console, reload, and confirm no hydration-mismatch error appears
      (the originally-reported bug). Spot-check `/graph`, `/habits`, `/openings` (Opening Score
      chart), and the Termination chart the same way.
- [ ] On `/graph`, set a date/time-class/records filter, reload, and confirm the Refresh button
      does *not* show its "pending" state immediately after reload (only after you actually
      change something new).
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass.
