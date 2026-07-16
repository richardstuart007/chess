# PLAN_mybackhomenav-rollout — chess

## Title
Replace hardcoded back buttons with MyBackHomeNav; restructure top-level nav (Habits out of TabBar)

## Plan
- [x] `src/ui/board/ChessBoardView.tsx` — change the `onBack: () => void` prop to `backPath: string`;
      replace the header's `<MyButton onClick={onBack}>Back</MyButton>` with
      `<MyBackHomeNav backPath={backPath} />`.
- [x] `src/app/analyze/page.tsx` — compute `backPath` as a plain value (same logic `handleBack`
      used: `from` query param decoded, else `/?highlight={gdid}`, else `/`) instead of a
      `router.push`-calling function; remove `handleBack`, `useRouter`, and the `router` variable
      (unused elsewhere in this file); pass `backPath` to `ChessBoardView`; replace the error-state
      `<MyButton onClick={handleBack}>Back to games</MyButton>` with
      `<MyBackHomeNav backPath={backPath} />`.
- [x] `src/ui/analysis/PositionDetail.tsx` — replace
      `<MyButton onClick={() => router.back()}>← Back to Habits</MyButton>` with
      `<MyBackHomeNav backPath='/habits' />`. Keep `useRouter`/`router` — still used elsewhere in
      this file for `router.push` to `/analyze`.
- [x] `src/app/habits/page.tsx` — add `<MyBackHomeNav />` (default `homePath='/'`, no `backPath` —
      Habits' natural "back" target is Home itself, so only the Home link renders).
- [x] New `src/ui/AppNav.tsx` — top-level section nav, two links styled as pills: "Game Analysis"
      (→ `/`) and "Habits" (→ `/habits`), active section highlighted via `usePathname()`. Genuinely
      separate routes/sections, no shared state — distinct from `TabBar`'s in-page view switcher.
- [x] `src/ui/TabBar.tsx` — remove the `habits` entry from `TABS`; simplify `activeKey` to just
      `searchParams.get('tab') ?? 'games'` (the `pathname === '/habits'` branch is now dead —
      `TabBar` will no longer render on `/habits` at all).
- [x] `src/ui/HomeDashboard.tsx` — render `<AppNav />` at the top; wrap the `PlayerProfile` grid +
      `TabBar` + conditionally-shown `GameFilterPanel` in `<MyBox title='Game Analysis'>` so the
      shared player-selection/filter inputs visually read as one bounded input area feeding the
      four view tabs beneath the box's own heading.
- [x] `src/ui/HomeDashboard.tsx` (refinement) — move the `PlayerProfile` grid back out of the box
      entirely (it sits directly under `AppNav`, no title above it); retitle the box `'Shared Data'`
      and narrow it to just `TabBar` + the conditionally-shown `GameFilterPanel` — the box now
      literally groups only the two things the four view tabs actually share, not the player cards.
- [x] `src/app/habits/page.tsx` — replace `<MyBackHomeNav />` with `<AppNav />` (which already
      covers "go to Game Analysis," making a separate Home link redundant here); remove `<TabBar />`
      and its now-unused import — Habits no longer participates in that shared-view tab group.
- [x] `src/ui/HomeDashboard.tsx` — give the `'Shared Data'` `MyBox` a light yellow background
      (`bg-yellow-50`) so it stands out from the page without being too vivid.
- [x] `src/ui/player/PlayerProfile.tsx` — give each player card's `MyBox` a light blue background
      (`bg-blue-50`).
- [x] `src/ui/player/PlayerProfile.tsx` — color just the rating number (not the control label, not
      the `displayName` title) red in each rating badge.
- [x] `src/app/analyze/page.tsx` — drop the `/?highlight={gdid}` fallback from `backPath`'s
      computation; when there's no `from` param, fall back straight to `'/'` instead, so
      `MyBackHomeNav` suppresses Back entirely (target equals `homePath`) rather than showing a
      raw, unfriendly path like `← /?highlight=74167`. Confirmed this fallback branch was dead for
      every real in-app navigation to `/analyze` (`HomeDashboard.tsx`, `PositionDetail.tsx` ×2 all
      already set an explicit `from`) — only triggers on a direct/bookmarked `/analyze?game=X` URL
      with no `from` at all.
- [x] `src/ui/HomeDashboard.tsx` — `handleSelectGame` was the actual, commonly-hit source of the
      raw-path Back text (`from=/?highlight={gameId}` on every "click a game to analyze" — not an
      edge case). Dropped the `?highlight=` query so `from` is always plain `/`, matching `homePath`
      exactly and suppressing Back consistently — accepted trade-off (user decision): the
      highlight-on-return-to-game-list feature no longer triggers from this flow, since nothing
      else produces `?highlight=` in the URL.
- [x] `src/lib/constants.ts` — add `HABITS_ITEMS_PER_PAGE` (matching how `GAME_LIST_ITEMS_PER_PAGE`
      is declared).
- [x] `src/lib/analysis/chessdb.ts` — add an `offset` param to `getHabitsData` (appends
      `OFFSET $N` to the query); add a new `getHabitsCount(opts)` running the same `WHERE`/
      `GROUP BY`/`HAVING` logic wrapped in `SELECT COUNT(*) FROM (...) AS sub` (no `ORDER BY`/
      `LIMIT`/`OFFSET`) for `MyPagination`'s total-pages calculation.
- [x] `src/app/habits/page.tsx` — add `currentPage` state (session-storage persisted, same pattern
      as `GameList`), fetch `getHabitsCount` once per filter change (reset to page 1 when filters
      change), fetch only the current page via `getHabitsData` with the new `offset`, and render
      `MyPagination` + a "Page X of Y (N total)" footer below `HabitsTable`, matching `GameList`'s
      own footer shape.

## Changes

### src/ui/board/ChessBoardView.tsx
- Replaced the `onBack: () => void` prop with `backPath: string`. Replaced the header's
  `<MyButton onClick={onBack}>Back</MyButton>` with `<MyBackHomeNav backPath={backPath} />`.

### src/app/analyze/page.tsx
- Removed `handleBack`, `useRouter`, and the `router` variable — the target path is now computed
  once as a plain `backPath` value (`from` query param decoded, else `/?highlight={gdid}`, else
  `/`), matching what `handleBack` used to push to. Passed `backPath` to `ChessBoardView`, and
  replaced the error-state `<MyButton onClick={handleBack}>Back to games</MyButton>` with
  `<MyBackHomeNav backPath={backPath} />`.

### src/ui/analysis/PositionDetail.tsx
- Replaced `<MyButton onClick={() => router.back()}>← Back to Habits</MyButton>` with
  `<MyBackHomeNav backPath='/habits' />` — the label already named the real fixed target.
  `useRouter`/`router` kept, still used elsewhere in the file for `router.push` to `/analyze`.

### src/app/habits/page.tsx
- Added `<MyBackHomeNav />` above `TabBar` — this page previously had no back/home link at all.
  No `backPath` passed since Habits' natural "back" target is Home itself (default `homePath='/'`
  already covers it; passing the same value as `backPath` would just suppress the Back link per
  the component's own dedup behavior).

### src/ui/AppNav.tsx (new)
- Top-level section nav — two pill-styled links, "Game Analysis" (`/`) and "Habits" (`/habits`),
  active section highlighted via `usePathname()`. Replaces the previous approach of lumping Habits
  into `TabBar` as a 5th peer tab: these two are genuinely separate routes/sections with no shared
  state, unlike the four in-page view tabs `TabBar` still switches between.

### src/ui/TabBar.tsx
- Removed the `habits` entry from `TABS` and the now-dead `pathname === '/habits'` branch/
  `usePathname` import — `TabBar` no longer renders on `/habits` at all, only on `/` where its four
  remaining tabs (Games/Graph/Openings/Endings) still share one filter/player-selection state.

### src/ui/HomeDashboard.tsx
- Added `<AppNav />` above the existing content.
- Wrapped the `PlayerProfile` grid, `TabBar`, and conditionally-shown `GameFilterPanel` in
  `<MyBox title='Game Analysis'>` (with an inner `space-y-3` wrapper to restore the spacing that
  used to come from the outer `space-y-4`) — the border and heading now make it visually explicit
  that these three elements are one shared input area feeding the four tabs inside it.

### src/ui/HomeDashboard.tsx (box/header refinement)
- Moved the `PlayerProfile` grid back out to a plain, untitled `div` directly under `AppNav` — it's
  not part of what the four tabs specifically share, so it no longer sits inside a titled box.
- Retitled the remaining box `'Shared Data'` and narrowed its contents to just `TabBar` and the
  conditionally-shown `GameFilterPanel` — the box now groups exactly the two elements the tabs
  actually share, with its own heading directly above them instead of above the player cards.

### src/app/habits/page.tsx (AppNav swap)
- Replaced `<MyBackHomeNav />` with `<AppNav />` — the section nav already covers "go back to Game
  Analysis," so a separate Home link was redundant. Removed `<TabBar />` and its import entirely;
  Habits no longer participates in that shared-view tab group.

### src/ui/HomeDashboard.tsx (Shared Data background)
- Gave the `'Shared Data'` `MyBox` a light yellow background (`className='bg-yellow-50'`) so it
  stands out from the page without being too vivid.

### src/ui/player/PlayerProfile.tsx (background)
- Gave each player card's `MyBox` a light blue background (`className='bg-blue-50'`). The existing
  `hover:bg-blue-50` on the inner clickable `div` stays layered on top for the interactive case.

### src/ui/player/PlayerProfile.tsx (rating color)
- Wrapped just the `{rating}` number in each rating badge with `text-red-600 font-semibold`,
  leaving the `{control}:` label and the `displayName` title unchanged.

### src/app/analyze/page.tsx (backPath fallback simplification)
- Dropped the `/?highlight={gdid}` fallback from `backPath` — now falls back straight to `'/'`
  when there's no `from` param, so `MyBackHomeNav` suppresses Back entirely instead of showing a
  raw path as its link text. Verified this fallback branch is dead in every real in-app navigation
  path to `/analyze` — only reachable via a direct/bookmarked URL missing `from`.

### src/lib/constants.ts (Habits pagination)
- Added `HABITS_ITEMS_PER_PAGE`, matching `GAME_LIST_ITEMS_PER_PAGE`'s declaration — set to `10`
  per user decision (not `15`, `GameList`'s value).

### src/lib/analysis/chessdb.ts (Habits pagination)
- Factored the shared `WHERE`/color-filter logic out of `getHabitsData` into `buildHabitsFilter`.
- `getHabitsData` gains an `offset` param, appending `OFFSET $N` to the query.
- Added `getHabitsCount(opts)` — same `FROM`/`JOIN`/`WHERE`/`GROUP BY`/`HAVING` shape as
  `getHabitsData`, wrapped in `SELECT COUNT(*)::int AS total FROM (...) AS sub` (no `ORDER BY`/
  `LIMIT`/`OFFSET`), for `MyPagination`'s total-pages calculation.

### src/app/habits/page.tsx (Habits pagination)
- Added `currentPage`/`totalCount` state, session-storage-persisted page (`chess-habits-page`,
  same pattern as `GameList`'s `chess-gl-page`). Added a filter-change effect that resets to page 1
  and a `getHabitsCount` effect that refetches the total whenever `player`/`color`/`minMove`/
  `minReached` change. `load()` now requests `HABITS_ITEMS_PER_PAGE` rows at the current page's
  `offset` instead of a flat `limit: 200`. Replaced the old "N bad moves shown" footer with a
  `MyPagination` control plus a "Page X of Y (N total)" label, matching `GameList`'s footer shape
  exactly.
