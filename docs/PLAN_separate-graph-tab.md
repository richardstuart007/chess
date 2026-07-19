# PLAN_separate-graph-tab — chess

## Title
Separate Graph tab into its own route, like Habits; shared PlayerProfile/nav layout across all pages; per-column filters on the Games tab; move-play-count feature on the Analyze page

## Plan
- [x] `src/ui/AppNav.tsx`: add `{ key: 'graph', label: 'Graph', href: '/graph' }` to `SECTIONS`, update `activeKey` logic for the new path
- [x] New page `src/app/graph/page.tsx`: modeled on `src/app/habits/page.tsx` — own `AppNav`, own state (player dropdown, date-from/to, time class, records limit, Refresh), own `getPlayers()` load, session-storage persistence of filters (own key, e.g. `graph_filters`); renders `RatingChart` directly from this local state
- [x] `src/ui/HomeDashboard.tsx`: remove `'graph'` from the tab union, the `(tab === 'games' || tab === 'graph')` branch, the `RatingChart` block, and the now-unused `graphLimit`/`draftGraphLimit`/`graphLoading` state
- [x] `src/ui/TabBar.tsx`: remove the `graph` entry from `TABS`
- [x] `src/ui/games/GameFilterPanel.tsx`: drop `mode`, `graphLimit`, `onGraphLimitChange`, `fetching` props and the `isGraph` branch — back to Games-tab-only
- [x] `src/ui/charts/RatingChart.tsx`: no functional change expected — verify it still works fed from the new page's local state (players/playerFilter/filters/limit props unchanged)
- [x] `docs/Dataflow.md`: add a short Graph section (own page/route, own filters, `fetchFilteredGames` live query, no materialization) mirroring how Habits is documented

## Part 2 — shared PlayerProfile header + AppNav across all pages

Agreed design (confirmed with user before execution):
- Layout scope: **root layout** (`src/app/layout.tsx`), applying to every route by default —
  including `/analyze` and `/position/[id]`, which currently show no header/nav at all.
- **Exclusion for `/owner/*`**: those pages keep their existing `OwnerLayout` dev-guard chrome only
  — no PlayerProfile header/nav above it. Implemented as a pathname check inside the new shared
  chrome component (`pathname.startsWith('/owner')` → render `{children}` only), not a separate
  route group — this is Claude's interpretation of "can be in the root layout, but must be below
  owner"; flag now if a route-group split was actually intended instead.
- **Card click behavior**: clicking a PlayerProfile card still selects a player, wired through a
  shared `?player=` URL query param (toggles back to blank/"both" on re-click of the same player,
  same toggle behavior as today), read by every page that currently has its own player-selection
  UI. Consequence: the now-redundant per-page player pickers are removed —
  `GameFilterPanel`'s "Player" dropdown (Games tab), and the local player `<select>` on both the
  Habits and Graph pages — since the header becomes the single place player selection happens.
  Habits/Graph don't support a combined "both" view, so when the URL param is blank they fall back
  to the first tracked player.
- `/analyze` and `/position/[id]` are single-game/single-position detail views (already keyed by
  their own `?user=`/`[id]` params) — they get the header/nav chrome visually, but do not
  themselves read the shared `?player=` param; clicking a card while on those pages updates the URL
  but has no visible effect until navigating to Home/Habits/Graph.

### Plan
- [x] New `src/ui/AppShell.tsx` ('use client'): fetches `getPlayers()` + per-player
  `getPlayer`/`getPlayerRatings` (moved from `HomeDashboard`'s `loadAll` effect); uses
  `usePathname()` to render `{children}` only for `/owner/*`; otherwise renders the PlayerProfile
  card row (click toggles `?player=` via `useRouter().push`, preserving other search params) +
  `<AppNav />` + `{children}`.
- [x] `src/app/layout.tsx`: wrap `{children}` in `<AppShell>{children}</AppShell>`.
- [x] `src/ui/HomeDashboard.tsx`: remove the PlayerProfile rendering, `dbPlayers`/`dbRatings`
  state+effect, `handlePlayerProfileClick`, and the `<AppNav />` import/render (now provided by
  `AppShell`). Read `playerFilter` from `useSearchParams().get('player') ?? BOTH` instead of local
  click-driven state.
- [x] `src/ui/games/GameFilterPanel.tsx`: remove the `players`/`playerFilter`/
  `onPlayerFilterChange` props and the Player dropdown block — selection now happens only via the
  header.
- [x] `src/app/habits/page.tsx`: remove `<AppNav />` import/render and the local player `<select>`
  + its state/sessionStorage entry; read the player from `useSearchParams().get('player')`,
  falling back to the first tracked player (from `getPlayers()`) when blank.
- [x] `src/app/graph/page.tsx`: same treatment as Habits — remove `<AppNav />` import/render and
  the local player dropdown/state, read from the URL with the same fallback.
- [x] `docs/Dataflow.md`: note the shared-header/nav architecture (owned by `AppShell` in the root
  layout, `/owner/*` excluded, player selection now URL-driven via `?player=`) where relevant.

## Changes

### src/ui/AppNav.tsx
- Added a `graph` entry (`/graph`) to `SECTIONS`, alongside `analysis` and `habits`.
- Extended `activeKey` to recognize `/graph` as its own active section.

### src/app/graph/page.tsx (new)
- New standalone route for the rating chart, modeled on `src/app/habits/page.tsx`'s structure
  (own `AppNav`, own `Suspense`-wrapped content component).
- Owns its own filter state locally: player dropdown (plain `<select>`, single-player selection —
  no combined "both players" view, matching the Habits page's pattern), date-from/date-to,
  time class, records limit (100/10,000/All), and a Refresh/Reset button pair — decoupled from
  `HomeDashboard`'s shared `GameFilterPanel`/filters state.
- Persists filters to `sessionStorage` under its own `graph_filters`-prefixed keys.
- Renders `RatingChart` directly, passing `players`/`playerFilter`/`filters`/`limit` built from
  this page's own local state instead of `HomeDashboard`'s.

### src/ui/HomeDashboard.tsx
- Removed `'graph'` from the `tab` union type, the `RatingChart` import, and the `RatingChart`
  render block.
- Removed the now-unused `graphLimit`/`draftGraphLimit`/`graphLoading` state and their references
  in `handleApplyFilters`/`handleFilterReset`.
- `GameFilterPanel` is now only rendered for `tab === 'games'` (was `'games' || 'graph'`), and no
  longer passes the graph-only props (`mode`, `graphLimit`, `onGraphLimitChange`, `fetching`).
- Updated two stale comments that referenced `RatingChart`.

### src/ui/TabBar.tsx
- Removed the `graph` entry from `TABS` — tab bar is now Games / Openings / Endings.

### src/ui/games/GameFilterPanel.tsx
- Removed the `mode`, `graphLimit`, `onGraphLimitChange`, `fetching` props and the `isGraph`/
  `showFull` conditionals — reverted to a Games-tab-only filter panel (full filter set always
  shown, single `Filter`/`Reset` button pair, no Records/Refresh row).

### src/ui/charts/RatingChart.tsx
- No changes — already took `players`/`playerFilter`/`filters`/`limit`/`onLoadingChange` as plain
  props, so it works unchanged fed from the new page's local state.

### docs/Dataflow.md
- Split the `tgd_gamesdecon` → Consumers → "Home dashboard" entry: it now only covers the Games
  list/opening/termination stats, with a new sibling "Graph page" entry documenting the separate
  `/graph` route, its own filter state, and that it deliberately stays a live `fetchFilteredGames`
  query rather than a materialized table (unlike Habits' `thab_habits`), since the underlying
  query is cheap.

### Verification
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; `/graph` appears as its own static route alongside `/habits`.

### src/ui/AppShell.tsx (new)
- New shared chrome component rendered from the root layout. `PlayerHeader` (inner, uses
  `useSearchParams`/`useRouter`/`usePathname`) fetches `getPlayers()` + per-player
  `getPlayer`/`getPlayerRatings` once (moved out of `HomeDashboard`), renders the PlayerProfile
  card row + `<AppNav />`, and writes the clicked player to a shared `?player=` query param
  (toggling back to blank on re-click of the already-selected player, same as the old
  `handlePlayerProfileClick` behavior).
- Outer `AppShell` checks `usePathname().startsWith('/owner')` and renders `{children}` only for
  those routes, so `/owner/*` keeps just its existing `OwnerLayout` dev-guard chrome.
- `PlayerHeader` is wrapped in its own `<Suspense>` inside `AppShell` (required for
  `useSearchParams` in a component that isn't already inside a page-level Suspense boundary).

### src/app/layout.tsx
- Wrapped `{children}` in `<AppShell>{children}</AppShell>` inside `<main>`.

### src/ui/HomeDashboard.tsx
- Removed the `PlayerProfile`/`AppNav` imports and rendering, the `dbPlayers`/`dbRatings` state and
  their `loadAll` effect, and `handlePlayerProfileClick` — all now live in `AppShell`.
- `playerFilter` is now `searchParams.get('player') ?? BOTH` (read directly) instead of local
  state; removed the now-unused `draftPlayerFilter`/`hasMultiple`/`initialPlayerFilter`.
- `handleApplyFilters`/`handleFilterReset` no longer touch player selection — that's the header's
  job, decoupled from the Games tab's own date/color/opponent/etc. filters.
- `GameFilterPanel` call site no longer passes `players`/`playerFilter`/`onPlayerFilterChange`.

### src/ui/games/GameFilterPanel.tsx
- Removed the `players`/`playerFilter`/`onPlayerFilterChange` props and the Player dropdown block
  (and the now-unused `BOTH` constant) — player selection happens only via the shared header now.

### src/app/habits/page.tsx
- Removed the `AppNav` import/render.
- Removed the local `player` state, its `sessionStorage` entry/restore, and the player `<select>`
  — `player` is now `searchParams.get('player') || (players[0]?.username ?? '')`, falling back to
  the first tracked player when the header hasn't selected one.

### src/app/graph/page.tsx
- Same treatment as Habits: removed the `AppNav` import/render, the local `player` state/dropdown,
  and its `sessionStorage` entry — `player` is now derived from `searchParams` with the same
  first-player fallback.

### docs/Dataflow.md
- `tpl_players` → Consumers: replaced "Home dashboard / game sync" with "Shared PlayerProfile
  header / game sync", documenting `AppShell`'s role and the `?player=` param now shared across
  Home/Habits/Graph.
- `tgd_gamesdecon` → Consumers: updated the "Home dashboard" and "Graph page" entries to note
  player selection comes from the shared `?player=` param and that the header/nav is no longer
  rendered per-page.

### Verification (Part 2)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged (`/`, `/habits`, `/graph`, `/analyze`,
  `/position/[id]`, `/owner/*` all still present).

## Part 3 — left-align Habits/Graph pages

### src/app/habits/page.tsx
- Outer wrapper className changed from `"max-w-6xl mx-auto p-4 space-y-4"` to `"space-y-4"`,
  matching `HomeDashboard`'s full-width, left-aligned wrapper (Games tab) instead of a centered,
  fixed-max-width layout.

### src/app/graph/page.tsx
- Same change: outer wrapper className changed from `'max-w-6xl mx-auto p-4 space-y-4'` to
  `'space-y-4'`.

### Verification (Part 3)
- `npx tsc --noEmit` — clean.

## Part 4 — per-column filters on the Games tab

Also added a general rule to `~/.claude/CLAUDE.md` (Coding Conventions → new "Filters" section):
a filter control for a table column must be positioned directly above that column's heading, never
in a separate detached filter bar. Agreed design for this task:
- Vertical order per column: heading label → filter control → data cells; pagination stays below
  the table, unchanged.
- All filters except Player stay gated behind explicit `Filter`/`Reset` buttons (draft state,
  as before) — no live/auto-apply.
- The Player filter is a local select above the `Player` column that reads/writes the same shared
  `?player=` URL param the PlayerProfile header cards use, applying immediately (not gated by
  Apply) — same mechanism, kept in sync both ways.
- The Games tab's "To" date filter is removed (the Graph page's own, unrelated "To" filter is
  untouched).

### Plan
- [x] Delete `src/ui/games/GameFilterPanel.tsx` — its filter inputs and the
  `TerminationCheckboxFilter` helper move into `GameList.tsx`.
- [x] `src/ui/games/GameList.tsx`: add a second `<thead>` row, one filter cell per column
  (`#`/`My Rating`/action column stay empty); own the draft/applied filter state and
  `handleApplyFilters`/`handleFilterReset` (moved from `HomeDashboard`); read/write the Player
  select via the shared `?player=` param; drop the `dateTo` control; drop `onCountChange` (dead —
  the footer already shows `totalCount`).
- [x] `src/ui/HomeDashboard.tsx`: remove `GameFilterPanel` usage, `draftFilters`/`filters`/
  `updateFilter`/`updateTerminationFilter`/`handleApplyFilters`/`handleFilterReset`/`gameCount`
  state (all now internal to `GameList`); "Shared Data" box keeps only `TabBar`; still fetches and
  passes `minDate`.

### src/ui/games/GameFilterPanel.tsx (deleted)
- Removed — folded into `GameList.tsx`.

### src/ui/games/GameList.tsx
- Now owns the Games tab's filter state directly: `draftFilters`/`filters` (moved from
  `HomeDashboard`, minus `dateTo`), `updateFilter`, `updateTerminationFilter`,
  `handleApplyFilters`, `handleFilterReset` — same draft/applied split as before, just relocated.
- Added `playerFilter` (read from `searchParams.get('player')`) and `handlePlayerChange` (writes
  the param via `router.push`, same toggle mechanism `AppShell`'s header cards use) — kept as a
  small, deliberate duplication of that logic rather than extracting a two-line shared helper.
- `<thead>` now has two rows: column labels (unchanged), then a filter row with one cell per
  column — `Date` → From-only date input, `Player` → select (only rendered when there's more than
  one tracked player), `Color`/`Time`/`Result` → selects, `Opponent`/`Opening`/`ECO` → text inputs,
  `Opp. Rating` → min/max pair, `End` → the termination checkbox dropdown (that column displays
  `gd_termination`), action column → stacked `Filter`/`Reset` buttons. `#` and `My Rating` have no
  filter.
- Props simplified to `players`/`onSelectGame`/`lastAnalyzedGameId`/`minDate` — `filters`,
  `playerFilter`, and `onCountChange` are gone (state is now internal; the count was already shown
  in the pagination footer, so the callback to the parent was redundant).

### src/ui/HomeDashboard.tsx
- Removed the `GameFilterPanel` import/render and all Games-tab filter state — the "Shared Data"
  box now renders only `TabBar`.
- Still fetches `minDate` via `getEarliestGameDate` and passes it through to `GameList`.

### ~/.claude/CLAUDE.md
- Added a "Filters" subsection under Coding Conventions: filter controls must sit directly above
  the table column they filter, not in a separate detached bar.

### Verification (Part 4)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, route list unchanged.

## Part 5 — red Filter/Refresh button when changes are unapplied

Note: the earlier "remove Reset button" request from this same conversation is still pending —
not part of this `#code` run, since it wasn't re-confirmed alongside this one.

### src/ui/games/GameList.tsx
- Added `filtersPending = JSON.stringify(draftFilters) !== JSON.stringify(filters)`. The `Filter`
  button turns red (`bg-red-500 hover:bg-red-600`) instead of the default blue whenever there are
  unapplied draft changes, reverting to blue once `Filter` is clicked (or the draft otherwise
  matches the applied state).

### src/app/graph/page.tsx
- Added the equivalent `filtersPending` check comparing draft `dateFrom`/`dateTo`/`timeClass`/
  `limit` against the applied `appliedFilters`/`appliedLimit` (normalizing `''` to `undefined` the
  same way `handleRefresh` does). The `Refresh` button turns red the same way.
- Habits page unchanged — its dropdowns already apply live, no draft/apply flow to signal.

### Verification (Part 5)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, route list unchanged.

## Part 6 — remove the Reset button (both remaining spots)

### src/ui/games/GameList.tsx
- Removed `handleFilterReset` and its `Reset` `MyButton` from the filter row's action cell — only
  `Filter` remains there now (no wrapping `flex flex-col` needed for a single button).

### src/app/graph/page.tsx
- Removed `handleReset` and its `Reset` `<button>` — only `Refresh` remains.

### Verification (Part 6)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, route list unchanged.

## Part 7 — Graph "Refresh" bug fix + Habits filter repositioning

### Diagnosis: Graph Refresh button
`RatingChart`'s fetch `useEffect` depended on `[usernamesToFetch, graphFilters, limit]` — plain
values. Clicking `Refresh` without actually changing any field left every one of those identical,
so the effect never re-ran and nothing happened — even though a button literally labeled "Refresh"
should reload every time it's clicked (e.g. to pick up newly-synced games), not only when a value
changed. Ruled out `fetchFiltered`'s server-side cache first (its cache key interpolates actual
parameter values via `buildSql_Readable`, so it does differentiate correctly by filter value).

### src/ui/charts/RatingChart.tsx
- Added optional `refreshNonce?: number` prop, included in the fetch effect's dependency array —
  bumping it forces a re-fetch regardless of whether `filters`/`limit` actually changed.

### src/app/graph/page.tsx
- Added `refreshNonce` state, incremented in `handleRefresh`, passed through to `RatingChart`.

### Habits filter repositioning
Moved Habits' filter bar (previously a standalone row above `HabitsTable`, in `habits/page.tsx`)
into `HabitsTable.tsx` itself as a second `<thead>` row, one filter per column, mirroring the Games
tab: `Color` → **Colour**, `Min move` → **Move #**, `Min reached` → **Times**, `Sort` → **CP**
(judgment call — Sort also relates to Times, but CP is its default target), `Show dismissed` →
the dismiss/restore action column. `Position`/`Pos CP`/`Move`/`Win%`/`Loss%` have no filter.
These already applied live (no draft/apply gating existed here), so nothing changed about *when*
they take effect — only where they're rendered.

### src/ui/analysis/HabitsTable.tsx
- Added `color`/`onColorChange`/`minMove`/`onMinMoveChange`/`minReached`/`onMinReachedChange`/
  `sortBy`/`onSortByChange`/`onShowDismissedToggle` props; renders the filter controls in a new
  `<thead>` row under the column-label row.
- The empty-rows case was previously an early `return` that replaced the whole table (which would
  have hidden the filter row too, once merged in) — changed to a `<tbody>` row with `colSpan={10}`
  instead, so the header + filters stay visible even when a filter combination yields zero rows.

### src/app/habits/page.tsx
- Removed the old standalone filter bar JSX; `HabitsTable` is now called with the filter
  state/handlers instead.

### Verification (Part 7)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, route list unchanged.

## Part 8 — flatten nav to one tab set; Openings/Endings become independent pages; filter persistence

Superseded an earlier sub-decision from this same conversation: Endings was briefly considered for
*sharing* the Games tab's live filters (lifting that state out of `GameList`) — the user reversed
that before execution, confirming the standing rule is "no filter sharing between views" (see
[[project_independent_tab_filters]]). Combined with Openings needing to become independent too,
the two-level nav (`AppNav` pill-style sections + per-page `TabBar` query-param sub-tabs) no longer
made sense — flattened to one tab set.

### src/ui/AppNav.tsx
- Replaced the 3-entry pill-button `SECTIONS` (`Game Analysis`/`Habits`/`Graph`) with a flat
  5-entry list — Games (`/`) / Habits (`/habits`) / Graph (`/graph`) / Openings (`/openings`) /
  Endings (`/endings`) — restyled to `TabBar`'s underline look (`border-b-2`, active/inactive
  color), active state still `usePathname()`-based. Rendered once by `AppShell`, same as before —
  no changes needed there.

### src/ui/TabBar.tsx (deleted)
- Superseded by the flattened `AppNav` — no page has internal sub-tabs anymore.

### src/ui/HomeDashboard.tsx
- Removed the `tab` state/query param, the `TabBar` import/render, the "Shared Data" `MyBox`, and
  the Openings/Endings panels — now just renders `GameList` directly (plus the existing "No
  Players" empty state). `minDate` fetch and `playerOptions` memo unchanged.

### src/ui/charts/OpeningScoreChart.tsx
- Removed the `players: string[]` prop, the local `username`/`setUsername` state (and its
  `chess-osc-username` sessionStorage entry), and the "Player" `MySelect` — replaced with a
  required `username: string` prop, matching the standardization already applied to Habits/Graph
  (player selection comes from the shared `?player=` param, not a per-view picker). Every other
  filter (Colour, Min games, Best/Worst, Show count, date range) is untouched and still
  independently persisted via its existing `sso()`/sessionStorage calls.

### src/ui/charts/TerminationChart.tsx
- Same standardization: removed `players: string[]` prop and local `username` state/dropdown,
  replaced with a required `username: string` prop.
- Added sessionStorage persistence for `color`/`dateFrom`/`dateTo` (new `chess-tc-*` keys) — this
  chart previously had no persistence at all, so switching pages and back used to reset it.

### src/app/openings/page.tsx (new)
- New standalone route, modeled on `graph/page.tsx`'s structure: fetches `getPlayers()`, derives
  `player` from `searchParams.get('player')` falling back to the first tracked player, renders
  `OpeningScoreChart` with that as `username`. Preserves the existing `?highlight=` →
  `lastAnalyzedGameId` behavior and sets `from=/openings` on game selection (both previously
  handled by `HomeDashboard`), so no functionality regresses from the move.

### src/app/endings/page.tsx (new)
- Same pattern, simpler — `TerminationChart` has no game-selection/highlight behavior to carry
  over, so this page is just the player-derivation boilerplate plus the chart.

### src/ui/games/GameList.tsx
- Added sessionStorage persistence for both `draftFilters` and `filters` (new
  `chess-gl-draftFilters`/`chess-gl-filters` keys, restored via lazy `useState` initializers,
  saved via a `useEffect`) — previously had none, so switching pages and back reset every Games-tab
  filter. Persisting the draft (not just applied) means even an unapplied in-progress edit survives
  a switch-away-and-back.

### Verification (Part 8)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list now includes `/endings` and `/openings` alongside the
  existing routes.

## Part 9 — shared filter components; Endings 3-type/no-draw/no-To-date; Player selection (incl. All) on every tab

Three requests from this conversation landed together since they touch the same files:
(1) limit Endings to Resignation/Checkmate/Time and drop the Draw series, (2) remove Endings'
To-date filter, (3) add an explicit Player selector — including an "All" (combined) option — to
Habits/Graph/Openings/Endings, which required extending their underlying queries from a single
username to an array so "All" aggregates correctly in SQL rather than needing client-side
re-combination. Building that Player selector as a shared component led directly into the
also-requested "every filter should be a reusable, consistently-styled component" work, done in
the same pass since it touches the exact same call sites.

### ~/.claude/CLAUDE.md — component placement decision
Confirmed with the user: these filter components are built **locally** in the chess project
(`src/ui/filters/`), not proposed for `nextjs-shared`, despite being presentation-only with no
chess-specific logic — kept local for now since the exact look is still being tightened up here;
revisit moving them to `nextjs-shared` once the design stabilizes.

### src/lib/constants.ts
- Added `TERMINATION_CHART_TYPES = ['Resignation', 'Checkmate', 'Time']`.

### src/lib/actions/games.ts
- `getTerminationStats`: dropped the `draw` `COUNT(*) FILTER` and the `dateTo` parameter; added a
  `gd_termination IN (...)` filter using `TERMINATION_CHART_TYPES`; `username: string` →
  `usernames: string[]`.
- `getOpeningScores`: `username: string` → `usernames: string[]`.
- Both now build a dynamic `IN ($1, $2, ...)` placeholder list per username (one scalar bind param
  per element) rather than a single array-typed bind param — `table_query`'s `params` type
  (`(string | number | boolean | null)[]`, from `nextjs-shared`) doesn't accept array elements, and
  this mirrors the exact pattern `nextjs-shared`'s own `buildSqlQuery` already uses for its `IN`
  filter operator, so it's the established convention, not a workaround.

### src/lib/analysis/chessdb.ts
- `buildHabitsFilter`/`getHabitsData`/`getHabitsCount`: `player?: string` → `players?: string[]`,
  same dynamic `IN (...)` placeholder approach as above. `getHabitsData` now also selects
  `h.hab_player AS player`, added to `HabitRow`'s return shape — needed so combined "All" results
  can show which player each row belongs to.

### src/ui/filters/ (new)
- `FilterSelect` — labeled dropdown; accepts plain strings or `{ value, label }` pairs (needed for
  "All"/"Both" where the value is `''` but the label can't be blank — a real cosmetic bug in the
  pre-existing dropdowns, fixed here since the whole point of this component is consistent,
  correct display).
- `FilterTextInput`, `FilterDateInput` — labeled wrappers around `MyInput`.
- `FilterNumberRange` — labeled min/max pair (Opp. Rating).
- `FilterMultiCheckbox` — labeled checkbox-dropdown, consolidating what used to be two separate
  near-identical local implementations (`GameList`'s `TerminationCheckboxFilter` and
  `OpeningScoreChart`'s `MultiSelectHeader`).
- `FilterActionButton` — small action button (`Filter`/`Refresh`/`Clear`/`Close`), variants
  `primary`/`pending`/`secondary`, wrapping `MyButton`.
- `FilterPlayerSelect` — the new Player picker, shared by every page. Reads/writes the same
  `?player=` URL param the `AppShell` header cards use (blank = "All"), so header clicks and this
  dropdown stay in sync either way. Renders nothing when only one player is tracked.

### src/ui/games/GameList.tsx
- Filter row now uses the shared components throughout; local `TerminationCheckboxFilter` deleted.

### src/ui/analysis/HabitsTable.tsx / src/app/habits/page.tsx
- Added a `Player` column (first) + `FilterPlayerSelect` above it. `habits/page.tsx` now computes
  `usernamesToFetch` (all tracked players when the shared param is blank, else just the selected
  one) and passes it to `getHabitsData`/`getHabitsCount` as `players`. `onToggleDismiss` now also
  receives the row's own player (not the page-level filter) since "All" can show rows from more
  than one player at once — dismiss/restore must target the row's actual owner.
- Filter row rebuilt with the shared components; the empty-state `colSpan` bumped to 11 for the
  new column.

### src/app/graph/page.tsx
- Replaced every raw `<input>`/`<select>`/`<button>` with the shared components, added
  `FilterPlayerSelect`. `player` (single, fallback-to-first) replaced with `playerFilter` (blank =
  All, matching `RatingChart`'s existing "blank means all players" logic, which was previously
  unreachable because of the fallback). Chart visibility now gated on `players.length > 0` instead
  of a truthy single player.

### src/ui/charts/OpeningScoreChart.tsx
- Props: `players: string[]` → `players: { username; display_name }[]` (full list; derives its own
  `usernames` array from the shared `?player=`, same pattern as Graph). `username: string` prop
  removed entirely.
- Local `MultiSelectHeader` deleted — the game-detail sub-table's Colour/Result/Termination filters
  now use `FilterMultiCheckbox`; Opp. Rating uses `FilterNumberRange`; Sort uses `FilterSelect`.
- Added a `Player` column to the sub-table (games can now come from more than one player) and
  `handleSelectGame` now reads `row.gd_player` instead of the outer single `username` for the
  same reason.

### src/ui/charts/TerminationChart.tsx
- Removed the `Draw` bar/field and the `dateTo` state/input entirely.
- Props: `players: string[]` → `players: { username; display_name }[]`; derives its own
  `usernames` the same way as `OpeningScoreChart`.
- Filter bar rebuilt with `FilterPlayerSelect`/`FilterSelect`/`FilterDateInput`/
  `FilterActionButton`.

### src/app/openings/page.tsx, src/app/endings/page.tsx
- Simplified — no longer derive a single fallback username; just pass the fetched `players` list
  straight through, since the charts now compute their own usernames internally from the shared
  `?player=` param.

### Verification (Part 9)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 10 — HabitsTable cleanup: duplicate label, filter widths, help icons, Loss% column

### src/ui/analysis/HabitsTable.tsx
- `FilterPlayerSelect` now passes `label=""` — it was defaulting to `'Player'` and rendering above
  the select, duplicating the `Player` column heading already there.
- The Move #, Min Reached, and Sort filters changed from `width="w-full"` to `width="w-1/2"` — they
  were the only filters in this table not using a compact fixed width.
- Removed the `MyHelpField` (`?`) icon from the `Position`, `Colour`, `Move`, and `Move #` column
  headers (`Pos CP`, `Times`, `Win%`, `CP` keep theirs).
- Removed the `Loss%` column entirely (header cell, the now-redundant second empty filter-row cell,
  and the data cell) — win/loss are complementary given `Win%` is already shown. `move_losses` is
  still fetched/returned by `getHabitsData` (unused now, but not a data-fetching change); empty-
  state `colSpan` dropped from 11 to 10 to match the new column count.

### Verification (Part 10)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 11 — fix Move #/Times/Sort filter alignment in HabitsTable

`width="w-1/2"` made each filter a fraction of its own `<th>`, and every `<th>` has a different
natural width (driven by its column's header text/data) — 50% of three different widths gave three
different absolute sizes, which is what read as "not aligned". Their filter-row cells also weren't
right-aligned like the header/data above and below them (Move #, Times, and CP/Sort are all
`text-right` columns), so the selects sat flush-left against right-aligned numbers.

### src/ui/analysis/HabitsTable.tsx
- Move #, Min Reached, Sort: `width="w-1/2"` → fixed `w-20`/`w-20`/`w-24` (Sort needs more room for
  "Most played"), each now wrapped in `<div className="flex justify-end">` to right-align with
  their column's header/data.

### Verification (Part 11)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 12 — standardize Colour filter's "no filter" label to "All"

Explicit decision: Colour filters stay page-local (no shared `FilterColorSelect`) — value schemes
genuinely differ per page (Habits' `pos_color` is `'w'/'b'`, Games/Openings/Endings' `gd_player_color`
is `'white'/'black'`), so this is chess-domain-specific, not a candidate for the generic shared
filter library. Only the displayed label needed to agree.

### src/ui/charts/OpeningScoreChart.tsx, src/ui/charts/TerminationChart.tsx
- Colour filter's "no filter" option label: `'Both'` → `'All'`, matching Games/Habits. Values
  (`'both'` / `''`) unchanged.

### Verification (Part 12)
- `npx tsc --noEmit` — clean.

## Part 13 — full label/widget consistency pass across all filter sites

Broadened from "make Colour consistent" to "make every same-concept dropdown/filter consistent"
per explicit instruction. Confirmed decision: filters stay page-local (chess-specific value
schemes), this is purely about aligning display labels, widget choice, and widths where the same
conceptual filter appears more than once — not introducing new chess-domain shared components.

### src/ui/filters/FilterMultiCheckbox.tsx
- Extended to accept `(string | { value, label })[]` options, same convention `FilterSelect`
  already used — previously only displayed the raw value, so `OpeningScoreChart`'s sub-table
  Colour/Result checkboxes couldn't show capitalized labels independent of their lowercase values.

### src/ui/games/GameList.tsx
- Colour: `'white'/'black'` (plain strings, displayed lowercase) → `{ value: 'white', label: 'White' }`/`{ value: 'black', label: 'Black' }`.
- Time: `'blitz'/'rapid'` → `Blitz`/`Rapid` labels.
- Result: `'win'/'loss'/'draw'` → `Win`/`Loss`/`Draw` labels.
- Player: replaced the inline `FilterSelect` + local `handlePlayerChange`/`hasMultiple`/
  `playerFilterOptions` with the shared `FilterPlayerSelect` component (`label=''`, matching the
  column heading already shown), same as Habits/Graph/Openings/Endings — removed the now-unused
  `useRouter`/`usePathname` imports and the local player-URL-writing logic they existed for.
- Date From width: `w-28` → `w-32`, matching every other date field in the app.

### src/ui/analysis/HabitsTable.tsx
- Colour: `'W'/'B'` → `White`/`Black` labels, width `w-14` → `w-20` to fit.

### src/app/graph/page.tsx
- Time: `'blitz'/'rapid'` → `Blitz`/`Rapid` labels.

### src/ui/charts/OpeningScoreChart.tsx
- Sub-table Colour multi-checkbox: `'white'/'black'` → `White`/`Black` labels.
- Sub-table Result multi-checkbox: `'win'/'draw'/'loss'` → `Win`/`Loss`/`Draw` labels, reordered to
  match `GameList`'s Result order (was `win/draw/loss`, now `win/loss/draw`).

### Verification (Part 13)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 14 — Graph page: remove To-date filter, Records dropdown 100→1,000

### src/app/graph/page.tsx
- Removed the `dateTo` state, its `sessionStorage` key, the "To" `FilterDateInput`, and every
  reference to it (`appliedFilters`/`handleRefresh`/`filtersPending`) — mirrors the earlier Games/
  Endings "From only" changes.
- `GRAPH_LIMIT_OPTIONS`: `{ value: '100', label: '100' }` → `{ value: '1000', label: '1,000' }`;
  the `limit`/`appliedLimit` fallback defaults updated from `100` to `1000` to match.

### Verification (Part 14)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 15 — remove Clear button from Openings

### src/ui/charts/OpeningScoreChart.tsx
- Removed the conditional "Clear" `FilterActionButton` next to the From/To date fields (cleared
  both dates on click). `FilterActionButton` import stays — still used by the "Close" button
  elsewhere in this file.

### Verification (Part 15)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 16 — remove To-date filter from Openings

### src/ui/charts/OpeningScoreChart.tsx
- Removed `dateTo` state, its `sessionStorage` key, the "To date" `FilterDateInput`, and every
  reference to it in both data-fetching effects (`getOpeningScores`, the game-detail
  `fetchFilteredGames` call) — mirrors the earlier Games/Endings/Graph "From only" changes.

### src/lib/actions/games.ts
- `getOpeningScores`: removed the now-unused `dateTo` parameter entirely (this was its only call
  site), matching the earlier `getTerminationStats` precedent.

### Verification (Part 16)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 17 — Endings date default; AppNav highlight bug; Position Detail back button visibility

### src/ui/charts/TerminationChart.tsx
- `dateFrom` fallback default: `''` → `DEFAULT_DATE_FROM` (`2025-01-01`), matching every other
  page's date-from default (Games/Graph/Openings already used it; Endings was the odd one out).

### src/ui/AppNav.tsx
- `activeKey` no longer defaults to `'games'` for every unmatched pathname — `/analyze` and
  `/position/[id]` are reached from more than one section (Games/Habits/Openings), so no tab
  belongs to them; they now resolve to `null` (nothing highlighted) instead of falsely showing
  "Games" active.

### src/ui/analysis/PositionDetail.tsx
- Root cause of "no back button" on `/position/[id]`: the `<MyBackHomeNav backPath='/habits' />`
  was already there, just rendered bare (small gray text, easy to miss) — unlike Analyze's version,
  which `ChessBoardView.tsx` wraps in a `<MyBox>` card, giving it a visible bordered container.
  Wrapped Position Detail's the same way for a consistent, actually-noticeable back button.

### Verification (Part 17)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 18 — ColorSwatch component; unify Colour column display

### src/ui/ColorSwatch.tsx (new)
- Small filled-circle swatch (white/dark) for the Colour column, normalizing both value schemes
  in one place (`'white'/'black'` from `gd_player_color`, `'w'/'b'` from `pos_color`).

### src/ui/games/GameList.tsx, src/ui/analysis/HabitsTable.tsx
- Both Colour data cells now render `<ColorSwatch color={...} />` instead of their own inline
  markup — `GameList` already used this swatch style; `HabitsTable` previously showed a "W"/"B"
  text badge, now matches.

### Verification (Part 18)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 19 — unify Habits' box/heading with Games/Openings/Endings

### src/app/habits/page.tsx
- Replaced the hand-styled `<div className="bg-white border rounded-lg overflow-hidden">` wrapper
  with `<MyBox>`, matching Games/Openings/Endings.
- Replaced the oversized standalone `<h1 className="text-2xl font-bold">Blunder Habits</h1>` with
  a heading styled to match `MyBox`'s own title convention (`text-xs font-bold mb-2`) — `MyBox`'s
  `title` prop is plain-text-only, so this stays a custom element (not the `title` prop) to keep
  the `MyHelp` icon next to it.
- Moved the pagination footer inside the box, matching `GameList`'s placement.

### Verification (Part 19)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 20 — remove redundant "Games" heading

### src/ui/games/GameList.tsx
- `<MyBox title='Games'>` → `<MyBox>` — the AppNav "Games" tab already labels this section.

### Verification (Part 20)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 21 — remove lines around the filter row (Games/Habits)

### src/ui/games/GameList.tsx, src/ui/analysis/HabitsTable.tsx
- Removed `border-b` from both `<thead>` rows (column labels, filters) in each table — this
  removed the line above the filter row and the line below it, before the data rows. Other
  styling (background, text color) untouched; data-row borders elsewhere are unaffected.

### Verification (Part 21)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 22 — fix board crash on same-square piece drop

### src/ui/board/ChessBoardView.tsx
- `handlePieceDrop` called `g.move({ from, to, ... })` with no guard for `from === to` (dropping a
  piece back on its own square) and no try/catch — chess.js throws on that input instead of
  returning `null`, crashing the page before the existing `if (!moveResult) return false` check
  could ever run.
- Added an early `if (sourceSquare === targetSquare) return false` guard, and wrapped the
  `g.move(...)` call in try/catch as a general safety net — any other malformed/illegal input now
  just snaps the piece back (`return false`) instead of crashing.

### Note
- The earlier "add `md:h-5` to the two Analyze/Analyse buttons" request is still pending — no
  `#code` was sent for it before this crash report arrived.

### Verification (Part 22)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.

## Part 23 — move-play-count feature on the Analyze page

Design agreed through discussion (verified against the codebase before planning, per the standing
"plan → verify → approve → execute" workflow):

- **No new table** — `tgam_game_positions` already records every ply of both colors
  unconditionally (`buildPositionTree.ts:36-92`), and the existing `getMovesForPosition`/
  `getPositionDetail` query pattern (`chessdb.ts`) already filters only by `gd_player = username`
  with no color/opponent filter — so a count naturally spans both the tracked player's own choices
  and every opponent's replies from that position, already matching "irrespective of opponent."
  This feature is computed live at Analyze-page-load time, not materialized.
- **Two display contexts, one shared lookup**:
  1. Automatic, for the recorded move tree (main line + existing variations), from move 6 onward —
     rendered as a small "×N" badge in the existing gap between `MoveBadge` and `EvalCell` in
     `MoveTree.tsx`. Computed once per page load via a **batched** query (all needed FENs in one
     round trip), since the move tree can have dozens of nodes.
  2. Manual, for engine lines (multi-PV) in `AlternativeLines.tsx` — each candidate row gets a
     small secondary button (next to the first-move SAN, `stopPropagation`'d so it doesn't also
     trigger "add this line as a branch") that looks up the count for just that one `(fen, san)`
     pair on click, following the existing idle→spinner→result button convention already used for
     deep analysis in `ChessBoardView.tsx`. The "before" FEN (`getCurrentPositionFen()`/
     `currentNode?.fen`) needs to be threaded down as a new prop to `AlternativeLines`, since
     `MultiPvResult` doesn't currently carry a FEN.
- Only show a count when it's `> 1` (never show "×1" or a bare "1").
- New constant `MOVE_COUNT_MIN_MOVE = 6` in `constants.ts` — deliberately separate from the
  existing `MIN_ANALYSIS_MOVE = 4` (a different, pipeline-wide "skip opening theory" threshold).
- Known gotchas to carry into implementation: `tpos_positions.pos_fen` is truncated to 4 fields
  (`truncateFen()`, `buildPositionTree.ts:15-17`) — any FEN passed into these new queries must be
  truncated the same way before matching, or the lookup silently returns nothing. Positions can
  also come back empty because they were legitimately purged (`purgeStaleReachOnePositions`,
  `pos_reached <= MIN_REACH_TO_KEEP` and 90+ days old) — this must be treated as "no data" (hide
  the badge/button result), not an error.

### Plan
- [x] `src/lib/constants.ts`: add `MOVE_COUNT_MIN_MOVE = 6` with a comment distinguishing it from
  `MIN_ANALYSIS_MOVE`.
- [x] `src/lib/analysis/chessdb.ts`: add `getMovePlayCount(fen, moveSan, player)` (single lookup,
  for the manual engine-line button) and `getMovePlayCounts(fens: string[], player)` (batched, for
  the automatic move-tree badges) — both truncating the FEN the same way `tpos_positions.pos_fen`
  is stored, joining `tpos_positions`→`tgam_game_positions`→`tgd_gamesdecon`, filtered to
  `gd_player = player`, mirroring `getMovesForPosition`'s existing counting semantics (verify its
  exact `COUNT(...)` form before writing the new queries, so counting stays consistent across all
  three functions).
- [x] `src/ui/board/ChessBoardView.tsx`: after building the `AnalysisTree`, collect every node's
  `fenBefore` from move `MOVE_COUNT_MIN_MOVE` onward (truncated), call `getMovePlayCounts` once,
  and pass the resulting `(fen, san) -> count` lookup down to `MoveTree`.
- [x] `src/ui/board/MoveTree.tsx` / `MoveBadge`: render a small "×N" badge in the gap between the
  move and `EvalCell` when a count is available and `> 1`.
- [x] `src/ui/board/AlternativeLines.tsx`: accept the "before" FEN as a new prop; add a small
  secondary button per candidate row that calls `getMovePlayCount` on click and shows the result
  inline (idle → spinner → "×N"/"no data"), without triggering the row's existing "select this
  line" click handler.
- [x] `src/ui/board/ChessBoardView.tsx`: pass the current position's FEN (`getCurrentPositionFen()`)
  down to `<AlternativeLines>` alongside the existing props.

### Changes

### src/lib/constants.ts
- Added `MOVE_COUNT_MIN_MOVE = 6`, immediately after `MIN_ANALYSIS_MOVE = 4`, with a comment
  distinguishing it as Analyze-page-specific rather than the pipeline-wide opening-theory cutoff.

### src/lib/analysis/chessdb.ts
- Added a local `truncateFen` helper (matches `buildPositionTree.ts`'s own truncation — 4
  positional FEN fields only, no halfmove clock/fullmove number).
- Added `getMovePlayCount(fen, moveSan, player)` — single `(fen, san)` lookup via
  `tpos_positions`→`tgam_game_positions`→`tgd_gamesdecon`, `gam_move_num > 0`,
  `gd_player = player`, mirroring `getMovesForPosition`'s existing `COUNT(*)` semantics.
- Added `getMovePlayCounts(fens: string[], player)` — batched version for a whole move tree in one
  round trip; built a dynamic `IN ($1, $2, ...)` clause (one scalar bind param per FEN) since
  `table_query`'s params type doesn't accept raw arrays, grouped by `(pos_fen, gam_move_played)`.

### src/ui/board/ChessBoardView.tsx
- Added `truncateFen` and `collectNodesFromMove(root, minMove)` module-level helpers, the latter
  walking the tree and collecting every node from `MOVE_COUNT_MIN_MOVE` onward.
- Added `moveCounts` state and a `useEffect` (keyed on `[tree, username]`) that collects FENs for
  all eligible nodes, calls `getMovePlayCounts` once, and maps the result back to a `nodeId -> count`
  lookup (only keeping counts `> 0`, so `MoveBadge` can just check `> 1`).
- Passed `moveCounts` to `<MoveTree>`, and `positionFen={getCurrentPositionFen()}` +
  `username={username}` to `<AlternativeLines>`.

### src/ui/board/MoveTree.tsx
- `MoveTreeProps`, `MoveBadge`, and `InlineVariation` all gained an optional `count`/`moveCounts`
  prop, threaded through both the main-line and variation rendering paths.
- `MoveBadge` renders `×N` (gray, monospace, `text-xxs`) after the annotation symbol, only when
  `count !== undefined && count > 1`.

### src/ui/board/AlternativeLines.tsx
- Added `positionFen?: string` and `username: string` props.
- Added a `MoveCountCheck` sub-component: idle state renders a small "check" button; on click, calls
  `getMovePlayCount(fen, moveSan, username)` and shows a spinner, then the `×N` result.
- **Bug caught and fixed before verification**: the per-line row was originally a `<button
  onClick={...}>`; nesting `MoveCountCheck` (which renders its own `<button>` when idle) inside it
  produced invalid nested-`<button>` HTML. Fixed by converting the outer row to a
  `<div role='button' tabIndex={0} onKeyDown={...}>` instead, preserving click/keyboard
  activation semantics without the invalid nesting.

### Verification (Part 23)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.
- Live data check (temporary `npx tsx` script, `SELECT`-only, deleted after use): picked the 3 most
  repeated `(fen, move)` pairs for a real player (move ≥ 6) via a manual raw query, then confirmed
  both `getMovePlayCount` (single) and `getMovePlayCounts` (batched) returned exactly matching
  counts (838, 719, 591) — confirming the join produces no duplication and the batched/single paths
  agree.

### Note
- Two previously-identified fixes remain pending, not yet sent with `#code`: the header
  first-letter-capitalization cleanup (`HabitsTable.tsx` uppercase removal, `GameList.tsx` label
  casing) and the `md:h-5` responsive-height fix on `GameList.tsx`/`OpeningScoreChart.tsx`'s
  per-row Analyze/Analyse buttons.

## Part 24 — header capitalization cleanup + md:h-5 responsive-height fix

Two small fixes identified earlier, previously proposed but not yet `#code`'d.

### Plan
- [x] `src/ui/analysis/HabitsTable.tsx`: remove the `uppercase` class from the header `<tr>`
  (line 105) — headers are already correctly cased in markup ("Player", "Position", "Colour",
  "Pos CP", "Move", "Move #", "Times", "Win%", "CP"); the CSS was forcing all-caps display.
- [x] `src/ui/games/GameList.tsx`: change header text "Opp. Rating" → "Opp. rating" and
  "My Rating" → "My rating" (lines 212-213).
- [x] `src/ui/games/GameList.tsx`: add `md:h-5` alongside the existing `h-5` in the per-row
  Analyze button's `overrideClass` (line 376), matching the same responsive-height-leak fix
  already applied elsewhere (`myMergeClasses` only replaces the exact token given — `h-6` alone
  doesn't override a `md:h-8` variant).
- [x] `src/ui/charts/OpeningScoreChart.tsx`: same `md:h-5` fix on the per-row Analyse button's
  `overrideClass` (line 424).

### Changes

### src/ui/analysis/HabitsTable.tsx
- Removed the `uppercase` class from the header `<tr>` — headers now display as written in
  markup (first-letter-capital) instead of being forced all-caps by CSS.

### src/ui/games/GameList.tsx
- Header labels "Opp. Rating" → "Opp. rating", "My Rating" → "My rating".
- Added `md:h-5` alongside `h-5` in the per-row Analyze button's `overrideClass`, so the
  responsive `md:h-*` variant from `MyButton`'s default is properly overridden at tablet/desktop
  widths (`myMergeClasses` only replaces the exact token given, not the whole height property).

### src/ui/charts/OpeningScoreChart.tsx
- Same `md:h-5` fix on the per-row Analyse button's `overrideClass`.

### Verification (Part 24)
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; route list unchanged.
