# PLAN_cosmetic-changes — chess

## Title
Cosmetic changes

## Plan

### Constants
- [x] Add to `src/lib/constants.ts`:
  - `DEFAULT_GRAPH_LIMIT = 0` (0 = All records)
  - `DEFAULT_GRAPH_GRANULARITY = 'week'`
  - `DEFAULT_GRAPH_TIME_CLASS = 'blitz'` (valid for both tracked players)
- [x] Mirror all three in `/owner/constants` page (`src/app/owner/constants/page.tsx`) — import, `ConstantSection` entry, description, `consumers` list, following the existing pattern

### Records default → All
- [x] `src/app/graph/page.tsx` — replace the three inline `1000` defaults (`limit` useState, `appliedLimit` useState, `ss()` fallback) with `DEFAULT_GRAPH_LIMIT`

### Granularity default → Weekly
- [x] `src/ui/charts/RatingChart.tsx` — initialise `granularityOverride` state to `DEFAULT_GRAPH_GRANULARITY` instead of `null`. Existing `granularityOverride && available.includes(granularityOverride) ? … : defaultGran(spanDays)` guard already falls back to the auto pick when the fetched span is under 14 days (Weekly not offered)
- [x] Granularity stays non-persisted (no sessionStorage) — always defaults to Weekly on load

### Graph time-class: player-aware single-select (Graph page only)
- [x] New `src/ui/filters/FilterGraphTimeClassSelect.tsx` — a single-select time-class dropdown, **Graph page only**. Shared `FilterTimeClassSelect` / `TimeClassSelect` and the other 3 consumers (Games, Openings, Endings) + `MasterGameList` are left untouched
  - Takes the loaded `players` list as a prop; reads `?player=` and `?timeClass=` via `useSearchParams` / `useGlobalFilter('timeClass')` (same as `FilterTimeClassSelect`)
  - Options: when one player is selected → `getPlayerTimeClasses(player)` (`stricade` → `['blitz']`, `astarrboy` → `['blitz','rapid']`). When no player selected (All) → union of all tracked players' classes
  - No "All" option
  - Writes the global `?timeClass=` param (keeps it in sync with the profile-header rating badges, as today)
- [x] Stale-selection guard — if the carried-in `?timeClass=` value is not in the current player's option list (e.g. `rapid` carried in, then `stricade` selected), fall back to `DEFAULT_GRAPH_TIME_CLASS`
- [x] `src/app/graph/page.tsx` — swap `<FilterTimeClassSelect />` for `<FilterGraphTimeClassSelect players={players} />`
- [x] `src/ui/charts/RatingChart.tsx` — with a single concrete time class always applied at fetch time, `allSeries` naturally yields one series per player for that class. No post-fetch `getPlayerTimeClasses` filter needed — the stale `stricade (rapid)` games are excluded at the query. Also fixes the Y-axis overshoot, since the low-rated historical rapid points are gone. (No RatingChart change was required for this step beyond the granularity/width edits above.)

### Filter-row height / width consistency (graph)
- [x] `src/ui/filters/FilterSelect.tsx` — change `overrideClass` `h-6` → `h-6 md:h-6` so the shared default's `md:h-8` no longer wins at the `md` breakpoint. Makes every `FilterSelect` app-wide (Player, Time, Records, Color, Result, …) a consistent 24px, matching `FilterDateInput` / `FilterActionButton` which already force `md:h-6`
- [x] Add `WIDTH_GRAPH_GRANULARITY = 'w-28'` to `src/lib/constants.ts` (+ constants-page mirror) — enough to fit "Weekly Avg" / "Monthly Avg"
- [x] `src/ui/charts/RatingChart.tsx` — the Granularity `MySelect` passes no width class, so it inherits `MySelect`'s default `w-72` (288px). Add `WIDTH_GRAPH_GRANULARITY` to its `overrideClass` to match the other graph filters

### Endings tab — remove Clear button, gate ALL filters behind a Refresh button
- [x] `src/ui/charts/TerminationChart.tsx` — remove the `{rawDateFromFilter && (<FilterActionButton variant='secondary'>Clear</FilterActionButton>)}` block (lines ~131-138). `import FilterActionButton` stays (reused for Refresh below)
- [x] `src/ui/charts/TerminationChart.tsx` — introduce an "applied" snapshot layer so no filter re-fetches on change (same approach as the Openings change below, smaller filter set — Player, Colour, Time Class, Date From):
  - new state: `appliedPlayer`, `appliedColor`, `appliedTimeClass`, `appliedDateFrom`, `refreshNonce`; new local `draftDateFrom` (+ an effect syncing it from `dateFromFilter` when an incoming `?dateFrom=` arrives)
  - the load effect (currently deps `[playersToFetch, queryPlayers, color, dateFromFilter, timeClassFilter, hydrated]`) now depends only on `applied*` + `refreshNonce` + `hydrated` + the `players.length` guard; `getTerminationStats` reads `applied*`
  - `FilterDateInput` → `value={draftDateFrom}` / `onChange={setDraftDateFrom}` (no longer writes the URL directly)
  - new `<FilterActionButton>` "Refresh" at the end of the filter row → commits `setDateFromFilter(draftDateFrom)` + copies `playerFilter`/`color`/`timeClassFilter`/`draftDateFrom` into `applied*` + bumps `refreshNonce`. `variant={anyLiveValue !== its applied counterpart ? 'pending' : 'primary'}` (red while pending — existing `FilterActionButton` behaviour)
  - hydration effect also seeds `applied*` so a reload shows data without a manual Refresh

### Rename the "Filter" apply button → "Refresh" (Games, Habits, Master Games)
- [x] `src/ui/games/GameList.tsx`, `src/ui/games/MasterGameList.tsx`, `src/ui/analysis/HabitsTable.tsx` — `<FilterActionButton>` label `Filter` → `Refresh`. No behaviour change — already `variant={filtersPending ? 'pending' : 'primary'}`
- [x] Updated the "Filter button" / "Filter click" wording in the header + inline comments of `GameList.tsx` and `habits/page.tsx` to "Refresh"

### Openings tab — default From=Worst, Show=All, gate ALL filters behind a Refresh button
User decision: on the Openings tab NO filter re-fetches on change — Player, Color, Time Class, Min
games, From, Show, From-date all only take effect on Refresh. Deliberate divergence from the Graph
tab (where global Player/Time Class stay instant). Nested drill-down table filters (ColorMultiSelect
/ ResultMultiSelect / TerminationMultiSelect / Opp. rating / Sort) are unchanged — they're
client-side refinement of the already-loaded game set, not chart inputs.

- [x] Added `DEFAULT_OPENINGS_SORT_FROM = 'Worst'`, `DEFAULT_OPENINGS_SHOW = '0'` to `src/lib/constants.ts` + `/owner/constants` mirror (named constants, matching `DEFAULT_MIN_GAMES_Player`)
- [x] `src/ui/charts/OpeningScoreChart.tsx` — defaults: `from` `'Best'` → `DEFAULT_OPENINGS_SORT_FROM`, `resultsCount` `'20'` → `DEFAULT_OPENINGS_SHOW` (each in both the `useState` init and the `sso()` hydration fallback). NB: only affects fresh sessions — existing `osc-from` / `osc-results-count` sessionStorage values still win until re-picked
- [x] `src/ui/charts/OpeningScoreChart.tsx` — introduce an "applied" snapshot layer, mirroring `graph/page.tsx`'s `appliedLimit` / `refreshNonce` pattern but covering every filter:
  - new state: `appliedPlayer`, `appliedTimeClass`, `appliedColor`, `appliedMinGames`, `appliedFrom`, `appliedResultsCount`, `appliedDateFrom`, `refreshNonce`; new local `draftDateFrom`
  - the chart-load effect (currently deps `[playersToFetch, queryPlayers, color, from, minGames, resultsCount, dateFromFilter, timeClassFilter, hydrated]`) now depends only on the `applied*` values + `refreshNonce` + `hydrated` + the `players.length` load guard
  - `getOpeningScores` / drill-down `fetchFilteredGames` calls read `applied*` (drill-down `queryPlayers` derived from `appliedPlayer`) so a bar click shows games consistent with the displayed chart
  - `FilterPlayerSelect` / `FilterTimeClassSelect` still write `?player=` / `?timeClass=` live (shared components, can't gate the URL write) — but the chart doesn't react until Refresh snapshots them. Header player-card highlight still updates immediately (reads the URL directly)
  - `FilterDateInput` → `value={draftDateFrom}` / `onChange={setDraftDateFrom}`; no longer writes the URL directly. An effect syncs `draftDateFrom` from `dateFromFilter` when an incoming `?dateFrom=` arrives from another tab
  - new `<FilterActionButton>` "Refresh" at the end of the filter row: commits `setDateFromFilter(draftDateFrom)` to the global URL + copies `playerFilter`/`timeClassFilter`/`color`/`minGames`/`from`/`resultsCount`/`draftDateFrom` into the `applied*` state + bumps `refreshNonce`. `variant='pending'` whenever any live/draft value differs from its `applied*` counterpart, else `'primary'`
  - hydration effect also seeds `applied*` from the restored drafts + current URL, so a reload shows data for the restored filter set without a manual Refresh (matches Graph's `appliedLimit` re-sync on `[hydrated]`)

### FilterNumberRange (Min/Max) height
- [x] `src/ui/filters/FilterNumberRange.tsx` line 30 — `inputClass` `h-6` → `h-6 md:h-6`, so the Min/Max inputs (Opp. Rating on Games + Openings) stop inheriting `MyInput`'s default `md:h-8` and match every other 24px filter control. Confirmed via a full `src/ui/filters/` audit that this is the last component still missing the `md:` height override.

### Habits — ✕/↺ dismissed-view toggle button height
- [x] `src/ui/analysis/HabitsTable.tsx` — the `MyButton` ✕/↺ toggle in the last header cell had no explicit height so it inherited `MyButton_dftClass` `md:h-8` (32px on desktop, taller than the Refresh button beside it). Added `h-6 md:h-6` to its `overrideClass`.

### Openings drill-down → navigate to the Games tab instead of an inline table
Bigger than the rest of this plan: replace `OpeningScoreChart`'s inline per-opening games table
with navigation to the Games tab (`/`) with the opening preset. `GameList` already reads `?eco=` /
`?opening=` as global filters and applies them on arrival, and `player` / `timeClass` / `dateFrom`
are already global URL params that carry automatically.

Decisions (agreed):
- Bar click = **immediate navigation** (like clicking a game row today). Push the current
  `/openings` URL as a back target first (`pushBackTarget`), so the chart is one Back away.
- Pass **both** `?eco=<code>` and `?opening=<name>` so the Games list matches the exact bar (a bar
  is one `eco_code` + `opening_name` pair).
- **Colour does not carry** — Games opens with its own last Colour (usually All); user re-picks if
  needed. No `GameList` change.
- `Min games` / `From` / `Show` are Openings-only and don't carry.

- [x] `src/ui/charts/OpeningScoreChart.tsx` — removed the whole drill-down (state, the games-load effect, the `osc-eco`/`osc-name`/`osc-sort`/`osc-colors`/`osc-results`/`osc-terminations`/`osc-rating-min`/`osc-rating-max` sessionStorage save+restore, `handleSelectGame`, `availableTerminations`, `displayRows`, the inline `<table>` + "Close" button). `handleBarClick` → `onSelectOpening?.(eco, fullName ?? eco)`. Prop `onSelectGame` → `onSelectOpening: (eco, openingName) => void`. Dropped imports `FilterNumberRange` / `ColorMultiSelect` / `ResultMultiSelect` / `TerminationMultiSelect` / `MyButton` / `fetchFilteredGames` / `ChessComGame`, and constants `DEFAULT_FILTER_TERMINATIONS_Player` / `WIDTH_GAME_SORT` / `WIDTH_OPPONENT_RATING`. Bar `Cell` no longer dims non-selected bars.
- [x] `src/app/openings/page.tsx` — `handleSelectGame` → `handleSelectOpening(eco, openingName)`: `pushBackTarget(current url)` then `router.push('/?' + params)` with `params = new URLSearchParams(searchParams)` + `eco`/`opening` set (player/timeClass/dateFrom carry automatically). Dropped the `ChessComGame` import.
- [x] `src/lib/constants.ts` — deleted the now-orphaned `DEFAULT_FILTER_TERMINATIONS_Player`, `WIDTH_GAME_SORT`, `OPTIONS_COLOR_MULTI`, `WIDTH_COLOR_MULTI`, `OPTIONS_RESULT_MULTI`, `WIDTH_RESULT_MULTI`.
- [x] Deleted `src/ui/filters/ColorMultiSelect.tsx` and `src/ui/filters/ResultMultiSelect.tsx` (used only by the removed drill-down).
- [x] `src/app/owner/constants/page.tsx` — removed the imports + `ConstantSection` entries for the 6 deleted constants; removed the `ColorMultiSelect` / `ResultMultiSelect` `FUNCTION_DESCRIPTIONS` entries; updated the `TerminationMultiSelect` blurb and `WIDTH_OPPONENT_RATING` consumers to drop the OpeningScoreChart reference (now GameList + MasterGameList).
- [x] Updated `OpeningScoreChart`'s `1) DESCRIPTION` + added a `3) CHANGE HISTORY` entry for the bar-click-navigates change.

**Scope note:** the user agreed to "delete orphaned + constants" for `ColorMultiSelect` /
`ResultMultiSelect`. Executing that also orphaned `DEFAULT_FILTER_TERMINATIONS_Player` and
`WIDTH_GAME_SORT` (the drill-down's termination-default + Sort-dropdown width) — deleted those two
as well, same category, flagged in the completion message for veto.

### Openings → Games: also carry the Colour filter
Reverses the earlier "colour doesn't carry" decision. (Player / Time Class / Date From already
carry as global URL params; Min games / From / Show are opening-chart-shaping controls, not game
filters, so nothing to carry from them.)
- [x] `src/ui/charts/OpeningScoreChart.tsx` — `onSelectOpening?: (eco, openingName, color: '' | 'white' | 'black') => void`; `handleBarClick` passes `appliedColor`. Header `Parameters:` updated.
- [x] `src/app/openings/page.tsx` — `handleSelectOpening(eco, openingName, color)`; `if (color) params.set('color', color); else params.delete('color')`. Comment updated (colour now carried; these are every attribute that decides a bar's game set).
- [x] `src/ui/games/GameList.tsx` — hydration effect reads `searchParams.get('color')`; if `'white'`/`'black'`, seeds both `hydratedDraft.color` and `hydratedFilters.color` (one-shot arrival preset — applied immediately, no Refresh, no false "pending"). Added `// eslint-disable-next-line react-hooks/exhaustive-deps` (effect stays `[]`-deps, mount-only). `?color=` lingers in the URL like `?eco=`/`?opening=`.

### Click a Master card (nav) → Master Games list filtered to that master
Same one-shot-URL-preset pattern as Openings→Games. New param `?master=<handle>` (NOT `?player=`,
which is the global tracked-player param).
- [x] `src/ui/AppNav.tsx` — imported `useRouter` + `pushBackTarget`; added `handleMasterClick(handle)` (pushes current URL as back target, `router.push('/mastergames?master=' + encodeURIComponent(handle))`, no-op on empty handle) and `activeMaster = pathname === '/mastergames' ? searchParams.get('master') : null`. Each master `PlayerProfile` now gets `onClick={handle ? () => handleMasterClick(handle) : undefined}` and `selected={!!handle && activeMaster === handle}`. Updated `2) NOTES` + added a `3) CHANGE HISTORY` entry.
- [x] `src/ui/games/MasterGameList.tsx` — imported `useSearchParams`; hydration effect builds `hydratedDraft`/`hydratedFilters` from `ss()`, then if `searchParams.get('master')` is set, assigns it to both `.player` fields before `setDraftFilters`/`setFilters` (one-shot arrival preset — applied immediately, no Refresh, no false "pending"). `// eslint-disable-next-line react-hooks/exhaustive-deps`, stays `[]`-deps.
  - Accepted (user): `FilterMasterPlayerSelect` lists only *synced* masters, so a top-4 card for a master with no synced games seeds a `.player` value not in the dropdown options — the query still filters correctly; the list just shows that master's synced games (possibly none).

### Fix: Master card click should carry + apply the Colour filter
Bug report: clicking a master card (e.g. Magnus) from the Games tab (which may hold `?color=` from
an Openings bar click) lands on `/mastergames` with (1) no colour carried and (2) whatever colour
`mgl-*` sessionStorage holds shown as an unapplied/pending draft.
- [x] `src/ui/AppNav.tsx` `handleMasterClick` — target URL is now built from `URLSearchParams` with `master` + (when present in the current URL) `color`.
- [x] `src/ui/games/MasterGameList.tsx` hydration effect — also reads `searchParams.get('color')`; if `'white'`/`'black'`, assigns it to **both** `hydratedDraft.color` and `hydratedFilters.color` (overriding sessionStorage) so it arrives applied, no pending. Absent → colour stays as the restored `mgl-*` state. Comment updated to cover both presets.
- Not in scope: carrying time class / date range (MasterGameList has its own local Time/Date filters and ignores global URL params).

### Fix: clicking a second Master card doesn't update the filter
Bug: on `/mastergames?master=Magnus`, clicking the Fabi card changes `?master=` and the nav outline
but not the list — the `?master=`/`?color=` seeding is only in the mount-time hydration effect, and
a same-route nav (Master box is on `/mastergames` too) doesn't remount `MasterGameList`.
- [x] `src/ui/games/MasterGameList.tsx` — hoisted `masterParam` + `presetColor` (`colorParam` narrowed to `'white'|'black'|undefined`) to top-level `const`s. Added a reactive effect `[hydrated, masterParam, presetColor]` that merges `{ player, color }` into **both** `draftFilters` and `filters` via functional `setState` when either param is set (no Refresh; `filtersResetKeyRef` handles the page-1 reset). Param → null leaves that filter unchanged. Mount hydration effect keeps the equivalent seeding for the no-flash first paint.

### Carry opening / eco / time class / date (not just colour) from Games → Master Games
Follow-up: clicking a master card should bring across the whole opening context you're looking at,
not just colour.
- [x] `src/ui/AppNav.tsx` — added module const `MASTER_CARRY_KEYS = ['color', 'timeClass', 'dateFrom', 'opening', 'eco']`. `handleMasterClick` sets `master` then loops `MASTER_CARRY_KEYS`, copying each present in the current URL.
- [x] `src/ui/games/MasterGameList.tsx` — hoisted `masterParam` / `colorParam` / `timeClassParam` / `dateFromParam` / `openingParam` / `ecoParam`; a `presetUpdates` `useMemo` (keyed on all six) builds the `Partial<MasterGameFilters>` patch. Mount hydration `Object.assign`s it into both `hydratedDraft` / `hydratedFilters`; the reactive effect (deps `[hydrated, presetUpdates]`) merges it into both `draftFilters` / `filters` on any param change. Absent param → that filter stays as the `mgl-*` restored value. Added `useMemo` import.

### Keep the Master card outline while viewing a master's game
Bug: clicking a game row goes to `/analyzemaster?game=<mgdid>` (no `?master=`), so AppNav's
`activeMaster` (gated to `pathname === '/mastergames'`) becomes null and every card loses its outline.
- [x] `src/ui/games/MasterGameList.tsx` — extracted `openMasterGame(row)` (the two identical `router.push` call sites — row `onClick` + "Analyze" button — now call it); it navigates to `/analyzemaster?game=<mgdid>&master=<handle>`
- [x] `src/ui/AppNav.tsx` — `activeMaster` condition widened to `pathname === '/mastergames' || pathname === '/analyzemaster'`
- `/analyzemaster` ignores the extra param (reads only `?game=`); it's just for the outline.

### Fix: `?master=` casing — highlight drops on a game-row click, dropdown shows blank
`mgd_player` is stored lowercase (`masterSync` lowercases the handle); the nav card's
`m.chesscomHandle` keeps its DB case (`Hikaru`). A card click sends `?master=Hikaru`, a game-row
click sends `?master=hikaru` — the `activeMaster === handle` compare then fails, and
`FilterMasterPlayerSelect`'s lowercase option values don't match `Hikaru` either.
- [x] `src/ui/AppNav.tsx` — `handleMasterClick` now `params.set('master', handle.toLowerCase())`; the card `selected` compare is `activeMaster === handle.toLowerCase()`. `?master=` is canonically lowercase (matches `mgd_player`, `openMasterGame`'s `row.mgd_player`, and the `FilterMasterPlayerSelect` option values).

### Fix: Back from a master game returns to the wrong master
`/analyzemaster`'s `← Back` (AppShell BackNavRow, pops the backNav stack) lands on the previous
master, not the one whose game you opened. Cause: `handleMasterClick` pushes to the stack on every
card click (incl. lateral switches on `/mastergames`, which has no Back button to pop them), while
`openMasterGame` pushes nothing — so Back pops the stale pre-switch entry.
- [x] `src/ui/games/MasterGameList.tsx` `openMasterGame` — now `pushBackTarget('/mastergames' + (searchParams.toString() ? '?…' : ''))` before `router.push('/analyzemaster?…')`. Added the `pushBackTarget` import.
- [x] `src/ui/AppNav.tsx` `handleMasterClick` — removed the `pushBackTarget(...)` call + the now-unused import; comment updated to explain why (list tab, no Back button). `pathname` is still used elsewhere so it stays.

## Changes

### src/lib/constants.ts
- Added `DEFAULT_GRAPH_LIMIT = 0`, `DEFAULT_GRAPH_GRANULARITY = 'week'`, `DEFAULT_GRAPH_TIME_CLASS = 'blitz'` to the "Player / Filter Defaults" section, with a block comment explaining each. `DEFAULT_GRAPH_GRANULARITY`'s literal type `'week'` is assignable to `RatingGranularity` without importing it (avoids a constants.ts → actions/games.ts circular import, since games.ts already imports from constants.ts).
- Added `WIDTH_GRAPH_GRANULARITY = 'w-28'` next to `WIDTH_GRAPH_LIMIT`.

### src/app/owner/constants/page.tsx
- Imported the four new constants.
- Added `ConstantSection` entries: `DEFAULT_GRAPH_LIMIT` / `DEFAULT_GRAPH_GRANULARITY` / `DEFAULT_GRAPH_TIME_CLASS` under "Player / Filter Defaults"; `WIDTH_GRAPH_GRANULARITY` under "Filter Settings" (after `WIDTH_GRAPH_LIMIT`). Each with description + `consumers` in the `file.ts: functionName` form.
- Added `FUNCTION_DESCRIPTIONS` entries for the two new consumer references: `RatingChart.tsx: RatingChart` and `FilterGraphTimeClassSelect.tsx: FilterGraphTimeClassSelect`.

### src/app/graph/page.tsx
- Records default: `limit` / `appliedLimit` useState and the `ss()` sessionStorage fallback now use `DEFAULT_GRAPH_LIMIT` (0 = All) instead of the inline `1000`.
- Swapped `FilterTimeClassSelect` for the new `FilterGraphTimeClassSelect`, passing `players`.
- Updated the main header description to note Time Class is now a player-aware single-select (no "All"), one series per player.

### src/ui/charts/RatingChart.tsx
- `granularityOverride` now initialises to `DEFAULT_GRAPH_GRANULARITY` (`'week'`) instead of `null`, with an inline comment noting the existing guard still falls back to the span-based auto pick when Weekly isn't offered, and that it is not persisted.
- The Granularity `MySelect` `overrideClass` now includes `WIDTH_GRAPH_GRANULARITY` (`w-28`) so it no longer inherits `MySelect`'s default `w-72` and matches the other graph filters' width.
- Imported both constants from `@/src/lib/constants`.

### src/ui/filters/FilterSelect.tsx
- `overrideClass` `h-6` → `h-6 md:h-6`, so the shared `MySelect_dftClass` `md:h-8` no longer wins at the `md` breakpoint. Every `FilterSelect` in the app (Player, Time, Records, Color, Result, …) is now a consistent 24px at all breakpoints, matching `FilterDateInput` / `FilterActionButton`.

### src/ui/filters/FilterNumberRange.tsx
- `inputClass` `h-6` → `h-6 md:h-6` — the Min/Max inputs (Opp. Rating) were the last filter control still inheriting `MyInput`'s `md:h-8`; now 24px like everything else. Full `src/ui/filters/` audit confirmed no other component was missing the `md:` override.

### src/ui/filters/FilterGraphTimeClassSelect.tsx (new)
- Graph-only time-class picker. Single-select, no "All". Option list is player-aware via `getPlayerTimeClasses()` — the selected player's classes, or the union across all tracked players when the Player filter is "All". Writes the shared global `?timeClass=` param (borderColor `GLOBAL_FILTER_BORDER_CLASS`, purple, like the other global filters).
- An effect forces a concrete valid value whenever the current `?timeClass=` isn't in the option list — covering both an unset param and a stale one carried in from another page (e.g. `rapid` then switching to `stricade`), preferring `DEFAULT_GRAPH_TIME_CLASS` and falling back to the first option.

### src/lib/constants.ts (Openings)
- Added `DEFAULT_OPENINGS_SORT_FROM = 'Worst'` and `DEFAULT_OPENINGS_SHOW = '0'` under a new "Openings chart defaults" comment block.

### src/app/owner/constants/page.tsx (Openings)
- Imported + added `ConstantSection` entries for `DEFAULT_OPENINGS_SORT_FROM` / `DEFAULT_OPENINGS_SHOW` under "Player / Filter Defaults", noting the persisted-value-wins caveat. `OpeningScoreChart.tsx: OpeningScoreChart` already had a `FUNCTION_DESCRIPTIONS` entry.

### src/ui/games/GameList.tsx, src/ui/games/MasterGameList.tsx, src/ui/analysis/HabitsTable.tsx
- Apply button label `Filter` → `Refresh` (no behaviour change; still `variant={filtersPending ? 'pending' : 'primary'}`).
- GameList: updated the `1) DESCRIPTION` header line and two inline comments ("Filter button" / "Filter click" → "Refresh").
- HabitsTable: added `h-6 md:h-6` to the ✕/↺ dismissed-view toggle `MyButton` so it matches the 24px Refresh button beside it (was inheriting `MyButton_dftClass` `md:h-8`).

### src/app/habits/page.tsx
- Updated the `1) DESCRIPTION` header line and two inline comments ("Filter click" / "Filter button" → "Refresh").

### src/ui/charts/TerminationChart.tsx (Endings)
- Removed the conditional dateFrom "Clear" button.
- Added an "applied" snapshot layer (`appliedPlayer` / `appliedColor` / `appliedTimeClass` / `appliedDateFrom` / `refreshNonce`) + local `draftDateFrom`. The load effect now depends only on `applied*` + `refreshNonce` + `hydrated` + `players.length`; `getTerminationStats` reads `applied*`.
- `FilterDateInput` now edits `draftDateFrom` (no live URL write). A sync effect refreshes `draftDateFrom` from `dateFromFilter` when an incoming `?dateFrom=` arrives.
- New "Refresh" `<FilterActionButton>` (`variant='pending'` = red while any live/draft value differs from its `applied*` counterpart) commits everything into `applied*`, writes `draftDateFrom` back to the global `?dateFrom=`, and bumps `refreshNonce`.
- Hydration effect seeds `applied*` so a reload still shows data without a manual Refresh. Colour still persists to sessionStorage. Added a `3) CHANGE HISTORY` entry.

### src/ui/charts/OpeningScoreChart.tsx (Openings)
- `from` default `'Best'` → `DEFAULT_OPENINGS_SORT_FROM` (`'Worst'`); `resultsCount` default `'20'` → `DEFAULT_OPENINGS_SHOW` (`'0'` = All) — in both the `useState` init and the `sso()` hydration restore.
- Added an "applied" snapshot layer (`appliedPlayer` / `appliedTimeClass` / `appliedColor` / `appliedMinGames` / `appliedFrom` / `appliedResultsCount` / `appliedDateFrom` / `refreshNonce`) + `appliedQueryPlayers` + local `draftDateFrom`. Removed the now-unused `playersToFetch` / `queryPlayers` memos.
- Both the chart-load effect and the drill-down games-load effect now read `applied*` only (drill-down games therefore always match the chart the bar came from). Guards switched to `players.length`.
- `FilterDateInput` edits `draftDateFrom` (no live URL write) + a sync effect from `dateFromFilter`.
- New "Refresh" `<FilterActionButton>` after the date input — `variant='pending'` (red) whenever any live/draft filter differs from its `applied*` counterpart; on click commits all filters into `applied*`, writes `draftDateFrom` back to `?dateFrom=`, bumps `refreshNonce`.
- Hydration effect seeds `applied*` from the restored drafts + current URL (persisted values still win, no spurious "pending"). Updated the `1) DESCRIPTION` header + added a `3) CHANGE HISTORY` entry.

## Testing
- [ ] Open `/graph` with no query params. Confirm: Records defaults to **All**, Granularity defaults to **Weekly Avg**, Time defaults to **blitz**, and the URL gains `?timeClass=blitz`.
- [ ] Confirm the Granularity dropdown is now about the same width as the other filters (not the old very-wide `w-72`), and that "Weekly Avg" / "Monthly Avg" still fit without clipping.
- [ ] Confirm all filter controls on the graph row (Player, From, Time, Records, Refresh) are the same height on a desktop-width window (previously Player/Time/Records were taller).
- [ ] With Player = "All": confirm the Time dropdown offers **blitz** and **rapid**; pick `blitz` → one series per player; pick `rapid` → only `astarrboy` (stricade has no rapid).
- [ ] Select Player = `stricade`: confirm the Time dropdown offers **blitz only** (no "All", no "rapid"), and there is exactly one `stricade (blitz)` series.
- [ ] Select Player = `astarrboy`, pick Time = `rapid`, then switch Player back to `stricade`: confirm Time auto-corrects to `blitz` (no stale `rapid`), and the chart updates.
- [ ] Change Granularity manually to e.g. Daily, then reload the page: confirm it resets to Weekly (not persisted).
- [ ] Narrow the Date From range to under ~2 weeks and Refresh: confirm Granularity falls back sensibly (Per Game / Daily) rather than showing an empty Weekly chart.
- [ ] Spot-check Games / Openings (`OpeningScoreChart`) / Endings (`TerminationChart`) pages: their Time Class dropdown still has the old `[All, blitz, rapid]` list and is unchanged apart from now being 24px tall (consistent with the inputs beside it).
- [ ] Check `/owner/constants` — the six new constants appear with descriptions, and the Functions tab resolves `RatingChart` / `FilterGraphTimeClassSelect`.

### Endings (`/endings`)
- [ ] Open `/endings`. The old grey "Clear" button is gone; a "Refresh" button sits at the end of the filter row.
- [ ] Type into the From date — the chart does **not** re-fetch on each keystroke; the Refresh button turns **red**.
- [ ] Change Player / Colour / Time Class — chart stays put, Refresh goes red. Click **Refresh** → chart updates and the button returns to blue.
- [ ] Reload the page — the chart loads without needing a manual Refresh (applied snapshot seeded from URL + stored Colour).

### Games / Habits / Master Games — button rename
- [ ] The apply button on Games (`/`), Habits (`/habits`), Master Games (`/mastergames`) now reads **Refresh** (was "Filter"); still turns red when a filter differs from what's applied, and behaves exactly as before.
- [ ] On Habits, the ✕/↺ "show dismissed" toggle button in the header is the same height (24px) as the Refresh button next to it.

### Openings (`/openings`)
- [ ] Fresh session (clear `sessionStorage` for the origin, or use a new private window): From defaults to **Worst**, Show defaults to **All**.
- [ ] If you'd used Openings before this change, confirm your previously-picked From/Show values are still honoured (persisted-wins) and the Refresh button is **not** red on load.
- [ ] Change any filter — Player, Colour, Time Class, Min games, From, Show, or type in From date — the chart does **not** move and Refresh turns **red**. Click **Refresh** → chart updates, button back to blue.
- [ ] Click a bar to drill in, then change a top filter without hitting Refresh: the drilled game list stays consistent with the chart (it uses the applied filters, not the pending ones).
- [ ] The nested game-table column filters (colour / result / termination / opp. rating / sort) still filter instantly — those were intentionally left client-side.
- [ ] The Opp. Rating **Min / Max** inputs (Openings drill-down table, and the Games tab) are now the same 24px height as the other filter controls, not taller.
- [ ] Reload `/openings` — chart loads without a manual Refresh.

### Openings bar click → Games tab
- [ ] On `/openings`, click a bar. You land on the Games tab (`/`) with that opening's games showing — no inline table under the chart any more, and no Refresh needed on Games.
- [ ] The Games ECO + Opening filter inputs show the clicked opening's values; the Games Refresh button is **not** red on arrival.
- [ ] `player` / time class / date range you had on Openings are still applied on Games.
- [ ] Set Colour = White (or Black) on `/openings`, Refresh, then click a bar → the Games tab opens with that Colour applied (Colour dropdown shows white/black, games are that colour only), and the Games Refresh button is **not** red. With Colour = All on Openings, the Games Colour is left as Games had it.
- [ ] Back (browser back or the app's Back control) returns you to `/openings` with the chart as you left it.
- [ ] `/owner/constants` no longer lists `ColorMultiSelect` / `ResultMultiSelect` / `OPTIONS_COLOR_MULTI` / `WIDTH_COLOR_MULTI` / `OPTIONS_RESULT_MULTI` / `WIDTH_RESULT_MULTI` / `DEFAULT_FILTER_TERMINATIONS_Player` / `WIDTH_GAME_SORT`; the Functions tab still resolves for every remaining reference.

### Master nav card → Master Games list
- [ ] In the Master box (visible on every non-owner page), click a master card → you land on `/mastergames` with that master's games showing; no Refresh needed, the Refresh button is not red, and the Player dropdown reflects the master (or is blank if that master isn't in the synced list — accepted).
- [ ] While on `/mastergames?master=X`, the card for master X shows the yellow selected outline; the others don't. Navigating away from `/mastergames` clears the outline.
- [ ] Browser Back from `/mastergames` returns to the page you clicked the card from.
- [ ] Clicking a different master card swaps the filter (and the selected outline) to that master.
- [ ] Changing the Player dropdown manually on `/mastergames` + Refresh still works as before; a later reload with `?master=` still in the URL re-applies that master (same lingering-param behaviour as `?eco=`).
- [ ] Colour carry: on `/openings` set Colour = White, Refresh, click an opening bar (→ Games tab, `?color=white`), then click a master card → `/mastergames` opens filtered to that master **and** White; the Colour dropdown shows white, games are White only, and the Refresh button is **not** red.
- [ ] Click a master card from a page with no `?color=` in the URL (e.g. straight from `/habits`) → `/mastergames` opens with that master and whatever Colour `mgl-*` sessionStorage last held (unchanged behaviour).
- [ ] **Second click while already on `/mastergames`:** click Magnus (list → Magnus), then click Fabi → the list and Player dropdown switch to Fabi, pagination resets to page 1, Refresh button not red. Repeat back to Magnus — switches again.
- [ ] **Opening context carries:** on `/openings` pick an opening bar (→ Games tab with `?eco=`/`?opening=`/`?timeClass=`/`?dateFrom=`/maybe `?color=`), then click a master card → `/mastergames` opens showing *that master's* games in *that opening / time class / date range / colour*; the Opening + ECO + Time + Date + Colour filter inputs all reflect it; Refresh button not red.
- [ ] Clicking a second master card from that state keeps the opening context and swaps only the master.
- [ ] From `/mastergames?master=X`, click a game row (or its "Analyze" button) → `/analyzemaster` — master X's card stays outlined in the Master box. Back to `/mastergames` keeps it outlined too.
- [ ] Specifically for a mixed-case handle like **Hikaru**: click the Hikaru card → outlined, and the `/mastergames` Player dropdown shows "Hikaru (…)" (not blank). Click one of Hikaru's game rows → `/analyzemaster`, Hikaru's card **stays** outlined.
- [ ] Back-nav: click Magnus card, then Fabi card, then open one of Fabi's games → on `/analyzemaster` click **← Back** → returns to `/mastergames` filtered to **Fabi** (with the same opening/colour context), not Magnus.
