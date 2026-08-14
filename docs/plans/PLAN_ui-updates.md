# PLAN_ui-updates — chess

## Title
UI updates.

## Plan

### Design: filter components + constants (bridge-project pattern)

All filters are already components (`src/ui/filters/*.tsx`, 7 total: FilterSelect,
FilterPlayerSelect, FilterTextInput, FilterDateInput, FilterNumberRange, FilterMultiCheckbox,
FilterActionButton). Modeled directly on `next-bridge`'s actual `constants.ts`
(`ScoringTypeSelect`/`FilterDayOfWeek`-style dedicated components + `WIDTH_*` constants, verified
by reading the file, not assumed):

- **Only `WIDTH_*` constants** — no `LABEL_*` constants. Bridge has none; a dedicated component
  bakes its own default label in (exactly like this project's existing `FilterPlayerSelect`, whose
  default `label = 'Player'` is already overridable per call site — same pattern, no new rule
  needed).
- **`UPPER_SNAKE_CASE`** naming, matching this project's existing `constants.ts` (not bridge's
  lowercase `filter_<column>` state-variable style, which is a different naming context).
- **One `WIDTH_*` constant per DD item**, shared wherever that exact item/value/role repeats
  (bridge's `WIDTH_CLUB` precedent); kept **separate** when a repeated concept has a genuinely
  different width per layout context (a tight table-header `<th>` vs. an open filter bar) — no
  forced value merge in that case, only the option-list/logic gets unified.
- **A recurring filter concept becomes a dedicated component** (`ColorSelect`, not a raw
  `FilterSelect` call repeated per page) when it is genuinely the same DD column reused with
  divergent value encodings across files — matching "Reusable UI components — build once, use
  many" and "Catch duplication before writing the second copy" in the global CLAUDE.md.

**Verified DD groupings** (read `src/lib/actions/games.ts`, `HabitsTable.tsx`,
`enrichPositionsStockfish.ts` directly — not assumed):
- `gd_player_color` (`tgd_gamesdecon`, values `'white'`/`'black'`) — GameList, OpeningScoreChart
  (top select + nested multi-select), TerminationChart. **These three unify.**
- `pos_color` (`tpos_positions`, FEN-style values `'w'`/`'b'`) — HabitsTable only. **Does NOT
  unify with the above** — it's a different DD column with a different value domain; forcing it
  into the same encoding would violate the "match the DD value" naming rule. Stays a local,
  single-use select; only its width gets extracted.
- `gd_time_class` — GameList, graph/page. Identical option values today. Unifies.
- `gd_player_result` — GameList (single-select, has an "All" sentinel), OpeningScoreChart nested
  (multi-select, no sentinel). Same column, two shapes → two components.
- `gd_termination` — GameList (fixed full taxonomy, default list), OpeningScoreChart nested
  (dynamic `availableTerminations`, computed at runtime). Same column → one component, options
  overridable per call site.

**New reusable components in `src/ui/filters/`:**
| Component | Wraps | Default options constant | Default width | Default label | Value domain |
|---|---|---|---|---|---|
| `ColorSelect` | FilterSelect | `OPTIONS_COLOR` = `[{value:'',label:'All'},{value:'white',label:'White'},{value:'black',label:'Black'}]` | `WIDTH_COLOR = 'w-20'` | `'Colour'` | `gd_player_color` |
| `ColorMultiSelect` | FilterMultiCheckbox | `OPTIONS_COLOR_MULTI` = `[{value:'white',label:'White'},{value:'black',label:'Black'}]` | `WIDTH_COLOR_MULTI = 'w-20'` | `'Colour'` | `gd_player_color` |
| `TimeClassSelect` | FilterSelect | `OPTIONS_TIME_CLASS` = `[{value:'',label:'All'},{value:'blitz',label:'Blitz'},{value:'rapid',label:'Rapid'}]` | `WIDTH_TIME_CLASS = 'w-20'` | `'Time'` | `gd_time_class` |
| `ResultSelect` | FilterSelect | `OPTIONS_RESULT` = `[{value:'',label:'All'},{value:'win',label:'Win'},{value:'loss',label:'Loss'},{value:'draw',label:'Draw'}]` | `WIDTH_RESULT = 'w-16'` | `'Result'` | `gd_player_result` |
| `ResultMultiSelect` | FilterMultiCheckbox | `OPTIONS_RESULT_MULTI` = `[{value:'win',label:'Win'},{value:'loss',label:'Loss'},{value:'draw',label:'Draw'}]` | `WIDTH_RESULT_MULTI = 'w-20'` | `'Result'` | `gd_player_result` |
| `TerminationMultiSelect` | FilterMultiCheckbox | `OPTIONS_TERMINATION` = `['Resignation','Checkmate','Time','Repetition','Agreement','Stalemate','Insufficient','50 Moves','Timeout','Abandoned']` (moved from GameList's local `TERMINATION_OPTIONS`) | `WIDTH_TERMINATION = 'w-20'` | `'Termination'` | `gd_termination` (options overridable — OpeningScoreChart passes its own `options={availableTerminations}`) |

Per-call-site width overrides (kept separate — same reasoning as the already-agreed
`WIDTH_PLAYER` precedent, but here the difference is a real layout constraint, not a bug):
- `ColorSelect` in `GameList.tsx`: `width={WIDTH_COLOR_GAMES}` = `'w-16'` (table-header context)
- `TimeClassSelect` in `GameList.tsx`: `width={WIDTH_TIME_CLASS_GAMES}` = `'w-16'`

**Ripple effect (contained, single caller):** `OpeningScoreChart`'s top-level color state changes
from `'both'|'white'|'black'` to `''|'white'|'black'` to match `ColorSelect`'s value domain. This
also changes `getOpeningScores`'s `color` parameter type in `src/lib/actions/games.ts` from
`'white' | 'black' | 'both'` to `'white' | 'black' | ''` — verified `getOpeningScores` has exactly
one caller (`OpeningScoreChart.tsx`), so this is a contained rename, not a wider ripple.

**Existing `FilterPlayerSelect` — fix, not a new component:**
- Option label changes from `p.display_name ?? p.player` to `p.player`, so the dropdown always
  shows the chess.com username (e.g. `stricade`/`astarboy`) instead of the display name.
  ([FilterPlayerSelect.tsx:39](../../src/ui/filters/FilterPlayerSelect.tsx#L39))
- `WIDTH_PLAYER = 'w-24'` becomes the component's default width, shared by all 5 call sites —
  `GameList.tsx`'s current `'w-20'` is a fix (agreed), not a preserved difference.

**`WIDTH_DATE_FROM = 'w-32'`** — already-generic `FilterDateInput`, shared by GameList,
OpeningScoreChart, TerminationChart, graph/page (identical value everywhere). No new component
needed; label text differs slightly per page (`'From'` ×2, `'From date'` ×1, none in GameList) and
stays inline — not a DD-value inconsistency, just page-specific phrasing.

**`WIDTH_OPPONENT_RATING = 'w-12'`** — `gd_opponent_rating`, shared by GameList and
OpeningScoreChart's nested game table (identical value, same column). `FilterNumberRange` stays
generic, no dedicated component needed (no divergent encoding to unify).

**Single-use widths (page-specific, no dedicated component, options stay inline in the page file
per the "genuinely single-use dropdown" exemption):**
| Constant | Value | File |
|---|---|---|
| `WIDTH_OPPONENT` | `'w-24'` | GameList (`gd_opponent_username` text filter) |
| `WIDTH_OPENING` | `'w-40'` | GameList (`gd_opening_name` text filter) |
| `WIDTH_ECO` | `'w-16'` | GameList (`gd_eco_code` text filter) |
| `PLACEHOLDER_TEXT_FILTER` | `'Filter...'` | GameList (shared literal — opponent + opening text inputs) |
| `PLACEHOLDER_ECO` | `'e.g. B27'` | GameList |
| `WIDTH_MIN_GAMES` | `'w-16'` | OpeningScoreChart |
| `WIDTH_SORT_DIRECTION` | `'w-16'` | OpeningScoreChart (Best/Worst) |
| `WIDTH_RESULTS_COUNT` | `'w-16'` | OpeningScoreChart (Show 10/20/30/50/All) |
| `WIDTH_GAME_SORT` | `'w-28'` | OpeningScoreChart (nested Sort date/moves) |
| `WIDTH_GRAPH_LIMIT` | `'w-20'` | graph/page |
| `WIDTH_POSITION_COLOR` | `'w-20'` | HabitsTable (`pos_color` — width only, options `'all'/'w'/'b'` stay inline, NOT unified with `ColorSelect`) |
| `WIDTH_QUALITY` | `'w-20'` | HabitsTable |
| `WIDTH_MIN_MOVE` | `'w-20'` | HabitsTable (options built dynamically from existing `MIN_ANALYSIS_MOVE`) |
| `WIDTH_MIN_REACHED` | `'w-20'` | HabitsTable |
| `WIDTH_SORT_BY` | `'w-24'` | HabitsTable |

### Implementation steps
- [x] Add all `WIDTH_*`/`OPTIONS_*`/`PLACEHOLDER_*` constants above to `src/lib/constants.ts`
      under a new "Filter Settings" section
- [x] Build `ColorSelect.tsx`, `ColorMultiSelect.tsx`, `TimeClassSelect.tsx`, `ResultSelect.tsx`,
      `ResultMultiSelect.tsx`, `TerminationMultiSelect.tsx` in `src/ui/filters/`
- [x] Update `FilterPlayerSelect.tsx` — option label uses `p.player`; default `width` imports `WIDTH_PLAYER`
- [x] Update `src/lib/actions/games.ts` — `getOpeningScores`'s `color` param: `'both'` → `''`
- [x] Update `GameList.tsx` — swap in `ColorSelect`/`TimeClassSelect`/`ResultSelect`/`TerminationMultiSelect`
      with their width overrides; extract remaining single-use widths/placeholders
- [x] Update `OpeningScoreChart.tsx` — swap in `ColorSelect`/`ColorMultiSelect`/`ResultMultiSelect`/
      `TerminationMultiSelect` (options override for terminations); update `color` state type;
      extract remaining single-use widths (local `MIN_GAMES_OPTIONS`/`RESULTS_OPTIONS` stay local)
- [x] Update `TerminationChart.tsx` — swap in `ColorSelect`
- [x] Update `graph/page.tsx` — swap in `TimeClassSelect`; extract `WIDTH_GRAPH_LIMIT` (local
      `GRAPH_LIMIT_OPTIONS` stays local)
- [x] Update `HabitsTable.tsx` — extract single-use widths only; `pos_color` select stays local/unchanged otherwise
- [x] Update `src/app/owner/constants/page.tsx` — add every new constant to `CONSTANTS_SECTIONS`
      with description and `consumers` list, per this project's standing rule
- [x] Re-order the "Filter Settings" section's `entries` array in
      `src/app/owner/constants/page.tsx` alphabetically by `name`, so `OPTIONS_*`, `PLACEHOLDER_*`,
      and `WIDTH_*` each cluster together on the Constants tab
- [x] `GameList.tsx` — center the Colour filter dropdown in its `<th>` (wrap `ColorSelect` in a
      `flex justify-center` div) to match the centered "Color" header label and the centered
      `ColorSwatch` in the row below
- [x] `GameList.tsx` — center the Time filter dropdown in its `<th>` the same way, to match the
      centered "Time" header label and the row's centered `gd_time_class` value
- [x] `GameList.tsx` — center the Result filter dropdown (`ResultSelect`) in its `<th>` the same
      way, to match the centered "Result" header label and the row's centered `gd_player_result`
      value
- [x] `GameList.tsx` — widen the Opponent filter (`WIDTH_OPPONENT` in `src/lib/constants.ts`) from
      `'w-24'` to `'w-48'` (user-specified, revised from an initial `'w-36'` mid-run) so it matches
      the row's opponent-username column width
- [x] Filter dropdown option labels should show the raw DD data value, not an invented capitalized
      version — user-confirmed, applies to every `gd_*`-backed filter dropdown consistently. In
      `src/lib/constants.ts`, lowercase the labels (not the `value`s, which already match the DD
      value) in: `OPTIONS_TIME_CLASS` (`Blitz`→`blitz`, `Rapid`→`rapid`), `OPTIONS_RESULT` and
      `OPTIONS_RESULT_MULTI` (`Win`→`win`, `Loss`→`loss`, `Draw`→`draw`), `OPTIONS_COLOR` and
      `OPTIONS_COLOR_MULTI` (`White`→`white`, `Black`→`black`). The `'All'` sentinel option stays
      `'All'` — it has no corresponding DD value, it's a UI-only "no filter" choice
- [x] `GameList.tsx` — the column showing `gd_termination` is mislabeled "End" in the header
      ([GameList.tsx:252](../../src/ui/games/GameList.tsx#L252)); rename the header to
      "Termination" and set the column width to `w-36` (user-specified, revised from an initial
      `w-24` mid-run)
- [x] `WIDTH_OPENING` in `src/lib/constants.ts` changes from `'w-40'` to `'w-48'` (user-specified
      value) — used by both the Opening `FilterTextInput` and, newly, the row `<td>`'s truncation
      cap ([GameList.tsx:404](../../src/ui/games/GameList.tsx#L404), currently a hardcoded
      `max-w-40` class not wired to any constant), so the filter and its column's data stay the
      same width, same pattern as the Opponent-column fix above
- [x] `WIDTH_OPENING` in `src/lib/constants.ts` changes again, from `'w-48'` to `'w-64'`
      (user-specified)
- [x] Remove the ECO filter's placeholder text in `GameList.tsx` (drop the
      `placeholder={PLACEHOLDER_ECO}` prop from its `FilterTextInput`). `PLACEHOLDER_ECO` becomes
      unused, so delete it from `src/lib/constants.ts` and remove its entry from
      `src/app/owner/constants/page.tsx`'s "Filter Settings" section
- [x] **Bug fix (regression from this session's `'both'`→`''` change):** `OpeningScoreChart.tsx`'s
      sessionStorage hydration for `color` (`sso(osc-color, '')`) returns whatever was previously
      stored, including a stale `'both'` value from before the domain changed. `getOpeningScores`
      then adds `AND gd_player_color = 'both'` to its SQL, which matches no rows — reproduced as
      "No openings with 10+ games" even with valid filters. Fix: after reading the stored value,
      validate it's `'white'`/`'black'`, else fall back to `''`, instead of trusting the stored
      value as-is
- [x] `WIDTH_OPENING` in `src/lib/constants.ts` changes again, from `'w-64'` to `'w-96'`
      (user-specified)
- [x] `GameList.tsx` — `MyPaginationFooter`'s own div (`grid grid-cols-3 ... bg-yellow-100`, from
      `nextjs-shared`, correct as-is) shrink-wraps its content instead of filling the row. Pass
      `overrideClass='flex-1'` to `<MyPaginationFooter>` so it grows to fill the space between the
      leading spacer `<div>` and the trailing "Page X of Y" text — not `w-full`, which would
      conflict with its flex siblings and cause overflow
- [x] `GameList.tsx` — remove the local "Page X of Y (N games)" `<span>` entirely (user will place
      a shared component for this display later, if wanted)
- [x] Rename `GAME_LIST_ITEMS_PER_PAGE` → `GAME_LIST_ROWS_DEFAULT` (user-requested, more meaningful
      name) and change its value from `15` to `20` (user-specified). Update all references:
      `src/lib/constants.ts` (definition), `GameList.tsx` (import + both usages), and
      `src/app/owner/constants/page.tsx` (import + `CONSTANTS_SECTIONS` entry)
- [x] `habits/page.tsx` — change `HABITS_ITEMS_PER_PAGE`'s value from `10` to `6` (user-specified
      new default), and add a new `HABITS_ROWS_OPTIONS = [6, 10, 20, 50] as const` constant in
      `src/lib/constants.ts` (user-agreed list), passed as `rowsOptions` to `<MyPaginationFooter>`
      — currently it has no `rowsOptions` prop, so it falls back to `nextjs-shared`'s shared default
      `[10, 20, 50, 100]`, which doesn't include `6`
- [x] `habits/page.tsx` — same footer-width fix as `GameList.tsx`: add `overrideClass='flex-1'` to
      `<MyPaginationFooter>` so it fills the row instead of shrink-wrapping its content
- [x] `habits/page.tsx` — remove the local "Page X of Y (N moves)" `<span>` entirely, same as
      `GameList.tsx`
- [x] Add `HABITS_ROWS_OPTIONS` to `src/app/owner/constants/page.tsx`'s `CONSTANTS_SECTIONS`
      (description + `consumers: ['habits/page.tsx: HabitsContent']`), and update
      `HABITS_ITEMS_PER_PAGE`'s displayed value (automatic, same entry already exists)
- [x] `HabitsTable.tsx`'s `MiniBoard` — extract the hardcoded `'64px'` board size into a new
      `HABITS_BOARD_SIZE_PX = '96px'` constant in `src/lib/constants.ts` (user-specified value),
      imported and used for both `boardStyle.width` and `boardStyle.height`; add the new constant
      to `src/app/owner/constants/page.tsx`
- [x] **Bug fix (pre-existing, unrelated to filters/constants work):** `/position/[id]` crashes at
      runtime with `[nuqs] nuqs requires an adapter to work with your framework`. Root cause:
      `PositionDetail.tsx` uses `nextjs-shared`'s `useTabQueryState` (built on `nuqs`), but
      `src/app/layout.tsx` never wraps the app in `nuqs`'s required `NuqsAdapter` — confirmed
      missing by reading the file; the Suspense boundary `nuqs` also requires is already correctly
      in place in `position/[id]/page.tsx`. Fix, per `nextjs-shared/CONSUMING_PROJECTS.md`'s
      documented one-time setup: import `NuqsAdapter` from `nuqs/adapters/next/app` and wrap
      `layout.tsx`'s `{children}` in it
- [x] `PositionDetail.tsx` — extract the hardcoded `boardStyle: { width: '400px', height: '400px'
      }` into a new `POSITION_BOARD_SIZE_PX = '400px'` constant in `src/lib/constants.ts`, imported
      and used for both dimensions; add it to `src/app/owner/constants/page.tsx`
- [x] `HABITS_BOARD_SIZE_PX` changes from `'96px'` to `'200px'` (`HabitsTable.tsx`'s `MiniBoard`
      wrapper `<div>` switched from Tailwind `w-24 h-24` classes to inline `style` sized directly
      from the constant, since 200px isn't a value on Tailwind's default spacing scale)
- [x] `HABITS_ITEMS_PER_PAGE` changes from `6` to `3` (user-specified, requested mid-run), and
      `HABITS_ROWS_OPTIONS` becomes `[3, 6, 10, 20, 50]` to include the new default
- [x] Add an Opening (name + ECO) column to the Habits table, sourced from the latest game that
      reached each habit's position:
  - `src/lib/analysis/chessdb.ts`'s `getHabitsData` — add a `LEFT JOIN LATERAL` per row: match
    `tgam_game_positions` where `gam_pos_id = h.hab_pos_id OR gam_resulting_pos_id = h.hab_pos_id`
    (per this project's "reach counts both directions" rule — a habit's position can be reached
    either as a tracked player's own move choice or as the resulting position after any tracked
    move), join `gam_gdid` to `tgd_gamesdecon`, `ORDER BY gd_end_time DESC LIMIT 1` to get exactly
    one (the latest) game's `gd_opening_name`/`gd_eco_code`. Both indexed (`idx_tgam_pos_id`,
    `idx_tgam_resulting_pos_id`, `idx_tgam_gdid`), and only ever runs for one page (3-50 rows) at a
    time, so no batching/perf concern.
  - Add `opening_name: string | null` and `eco_code: string | null` to `getHabitsData`'s return
    type and row mapping.
  - `HabitsTable.tsx` — add "Opening" and "ECO" columns (matching `GameList.tsx`'s pattern: opening
    name truncated with a `title` tooltip for the full text). New `WIDTH_HABITS_OPENING = 'w-40'`
    constant in `src/lib/constants.ts` for the Opening column (this table is denser than GameList,
    whose own `WIDTH_OPENING` is now `'w-96'` — too wide here); the ECO column reuses the existing
    `WIDTH_ECO` constant (short, fixed-format value, same everywhere).
  - Add both new/reused constants' entries to `src/app/owner/constants/page.tsx` as needed
    (`WIDTH_HABITS_OPENING` is new; `WIDTH_ECO`'s existing entry gets `HabitsTable.tsx: HabitsTable`
    added to its `consumers` list).
- [x] Extract `MiniBoard` (currently a private function inside `HabitsTable.tsx`) into its own
      component at `src/ui/board/MiniBoard.tsx` (alongside the existing `ChessBoardView.tsx`/
      `MoveTree.tsx`). Same behavior as today, but with a `size?: string` prop (defaulting to the
      existing `HABITS_BOARD_SIZE_PX` constant) instead of hardcoding that constant internally —
      makes it genuinely reusable (e.g. by `PositionDetail.tsx` later, at `POSITION_BOARD_SIZE_PX`,
      if that dedup is wanted) rather than just relocating Habits-specific code to a new file.
      `HabitsTable.tsx` imports it and drops its own copy, still relying on the default size.
- [x] Move the Opening and ECO columns to sit right after Colour (both header rows and data-row
      `<td>`s in `HabitsTable.tsx`), and make both filterable:
  - **Filter trigger (user-confirmed):** an explicit "Filter" button, not instant-on-keystroke —
    matches `GameList.tsx`'s precedent for text filters specifically, and avoids firing a query
    (with the extra `LATERAL` join) on every character typed. Habits' *existing* dropdown filters
    (Colour/Quality/Min move/Min reached/Sort by) stay instant, unchanged — only these two new text
    filters use draft state.
  - `src/app/habits/page.tsx` — add `draftOpening`/`draftEco` state (bound to the new text inputs,
    updates every keystroke) and `opening`/`eco` state (applied, only updated when Filter is
    clicked, alongside `setCurrentPage(1)` — matching the reset-to-page-1 pattern already used
    elsewhere). Both persisted to sessionStorage under the existing `STORAGE_KEY`, matching the
    other filters. `opening`/`eco` (not the drafts) get passed into `getHabitsData`/`getHabitsCount`
    and added to `load()`'s dependency array.
  - `src/lib/analysis/chessdb.ts` — `getHabitsCount` currently has no join to
    `tgam_game_positions`/`tgd_gamesdecon` at all, so filtering by opening/ECO means it needs the
    same `LATERAL` join `getHabitsData` already has. Extract that join into one shared SQL fragment
    (a local constant/function in this file) used by both, instead of duplicating it.
    `buildHabitsFilter` gets new `opening?: string`/`eco?: string` opts, producing filter fragments
    against `latest_game.gd_opening_name`/`latest_game.gd_eco_code` using
    `LOWER(column) LIKE '%lowercased_value%'` — the exact case-insensitive partial-match convention
    `nextjs-shared`'s own `LIKE`-operator handling already uses (verified in
    `buildSqlQuery.ts`), for consistency with how every other text filter in this app behaves.
  - `HabitsTable.tsx` — new props: `opening`, `onOpeningChange`, `eco`, `onEcoChange`,
    `onApplyOpeningEcoFilter`, `openingEcoFilterPending` (drives `FilterActionButton`'s
    `pending`/`primary` variant, same as `GameList.tsx`). New `FilterTextInput`s in the Opening/ECO
    filter-row cells (reusing the existing `WIDTH_HABITS_OPENING`/`WIDTH_ECO` constants for width;
    Opening reuses the existing shared `PLACEHOLDER_TEXT_FILTER`, ECO gets no placeholder — matching
    the earlier decision to drop `PLACEHOLDER_ECO` from `GameList.tsx` entirely). The new
    `FilterActionButton` goes in the action column's filter-row cell, alongside the existing "Show
    dismissed" toggle button (no new column needed — that column already exists, just currently
    holds one button instead of two).
- [x] Add a "Date" column to the Game History tab on `/position/[id]`. `getPositionDetail`'s
      `games` query (`src/lib/analysis/chessdb.ts`) doesn't select `gd_end_time` at all, unlike the
      sibling function `getGamesForPosition`, which already formats it identically
      (`TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS game_date`) — reuse that exact
      pattern. Add `date: string | null` to `getPositionDetail`'s return type and the `GameHit`
      interface in `PositionDetail.tsx`; add a "Date" header + cell to the history table, placed
      first (before Game ID).
- [x] **Bug fix (Habits-scoped, user-confirmed):** when "All" players is selected on `/habits`, the
      query enumerates every tracked player explicitly (`WHERE h.hab_player IN ('stricade',
      'astarrboy')`) instead of applying no player filter at all. Verified `getHabitsData`/
      `getHabitsCount` are only ever called from `habits/page.tsx` (safe to change without
      affecting `GameList.tsx`/`OpeningScoreChart.tsx`/etc., which use the same enumerate-all-
      players idiom but weren't flagged — this fix is scoped to Habits only).
  - `src/lib/analysis/chessdb.ts`'s `buildHabitsFilter` — change `playerPlaceholders` (always
    assumed present in the base `WHERE`) into an optional `playerFilter` fragment, same shape as
    `colorFilter`/`qualityFilter`: `''` when `opts.players` is empty/undefined, an
    `AND h.hab_player IN (...)` fragment otherwise.
  - `getHabitsData`/`getHabitsCount` — move the player condition out of the mandatory base `WHERE`
    into the new optional `${playerFilter}` fragment; remove the
    `if (!opts.players || opts.players.length === 0) return []/0` early guard (now a legitimate
    "no filter" case, not "nothing to query" — the frontend already prevents calling these before
    the player list has loaded, via its own `playersToFetch.length === 0` check on `load()`/
    `loadCount()`, so this guard was only ever needed for that loading window).
  - `src/app/habits/page.tsx` — pass `players: playerFilter ? [playerFilter] : undefined` to both
    `getHabitsData`/`getHabitsCount` calls, instead of `playersToFetch` (the enumerated list).
    `playersToFetch` itself stays unchanged, still used for the existing "player list not loaded
    yet" guard.
- [x] **Denormalize opening/ECO onto `thab_habits`** (user-agreed), replacing the per-request
      `LATERAL` join with columns computed once by `buildHabits()`'s existing full-rebuild pass —
      matching how `hab_move_cp`/`hab_move_times`/etc. already work (only as fresh as the last
      rebuild, not live). Same "latest game" logic (latest by `gd_end_time`, matching the habit's
      position as either `gam_pos_id` or `gam_resulting_pos_id`), just computed at write time
      instead of read time.
  - **Schema change (SQL for the user to run manually via pgAdmin4, not executed by Claude):**
    ```sql
    ALTER TABLE thab_habits ADD COLUMN hab_opening_name text;
    ALTER TABLE thab_habits ADD COLUMN hab_eco_code character varying(8);
    ```
    Appended at the end of the table — no reorder/backup dance needed, this is a plain `ADD COLUMN`.
  - Update `scripts/schema.sql`'s `thab_habits` definition to include both new columns, matching
    the SQL above (source of truth).
  - `src/lib/analysis/buildHabits.ts` — add the same "latest game" computation (currently only in
    `chessdb.ts`'s `LATEST_GAME_LATERAL_JOIN`) to the main aggregation query, so each
    (player, pos_id, move_san) group also gets `gd_opening_name`/`gd_eco_code` from its own latest
    game. Add both to `HabitAggregate`, the `INSERT` column list/`VALUES` placeholders, and the
    `ON CONFLICT ... DO UPDATE SET` clause (refreshes every rebuild, same as the other computed
    fields).
  - `src/lib/analysis/chessdb.ts` — remove `LATEST_GAME_LATERAL_JOIN` and its `LEFT JOIN LATERAL`
    from both `getHabitsData` and `getHabitsCount` entirely. `opening_name`/`eco_code` in
    `getHabitsData`'s `SELECT` become `h.hab_opening_name`/`h.hab_eco_code` (plain columns, no
    join). `buildHabitsFilter`'s `openingFilter`/`ecoFilter` change from
    `LOWER(latest_game.gd_opening_name) LIKE ...` to `LOWER(h.hab_opening_name) LIKE ...` (same for
    ECO) — same `LIKE` convention, just against the denormalized column.
  - **After the schema change and code deploy:** re-run "Build Habits" from the Owner Pipeline page
    to populate the new columns on existing rows — no separate backfill SQL needed, since
    `buildHabits()` already does a full upsert of every row on each run.
- [x] **Component-adoption audit (user-requested):** two filter primitives render raw HTML instead
      of wrapping the shared component, unlike `FilterTextInput`/`FilterDateInput`/
      `FilterActionButton`/`FilterMultiCheckbox`, which already correctly wrap
      `MyInput`/`MyButton`/`MySelectMulti`:
  - `src/ui/filters/FilterSelect.tsx` — raw `<select>`, should wrap `nextjs-shared/MySelect`.
    `MySelect`'s `options?: string[]` doesn't support `{value, label}` pairs (needed for e.g. "All"
    where `value` is `''` but the label isn't blank), so use `MySelect`'s existing `children`
    fallback — render the normalized `<option>` list as children instead of passing `options` —
    rather than proposing a `nextjs-shared` amendment, since `children` is already a
    designed-for-this escape hatch, not a workaround. `value`/`onChange` pass through `MySelect`'s
    `...rest` spread onto the underlying `<select>` automatically. This is the shared base for
    `FilterPlayerSelect`, `ColorSelect`, `TimeClassSelect`, `ResultSelect`, and every other
    single-select filter built this session, so fixing it here fixes all of them at once.
  - `src/ui/filters/FilterNumberRange.tsx` — two raw `<input type='text' inputMode='numeric'>`
    (min/max), should each wrap `nextjs-shared/MyInput`, matching `FilterTextInput`'s existing
    pattern.
  - **6 raw `<button>` elements found outside the filters directory (user confirmed: fix these
    too)**, each converting to `MyButton` with its current classes passed via `overrideClass`
    (`MyButton` spreads `...rest`, so `onClick`/`title`/`type`/`data-*` attributes all pass through
    unaffected):
    - `HabitsTable.tsx` — the "Show dismissed" toggle (`th`, ~line 218) and the per-row
      Dismiss/Restore toggle (`td`, ~line 310)
    - `PositionDetail.tsx` — the "× clear" selected-move filter link (~line 224)
    - `MoveTree.tsx` — the move-node button (~line 56; carries a `data-node-id` attribute that
      must keep passing through)
    - `PipelineHelp.tsx` — the "Help" trigger button (~line 142) and the popover's "×" close
      button (~line 155)
- [x] **"All means no selection" (user-confirmed, generalized beyond Habits):** the same
      enumerate-every-tracked-player pattern already fixed for `getHabitsData`/`getHabitsCount`
      exists in `src/lib/actions/games.ts`, used by `GameList.tsx`, `OpeningScoreChart.tsx`,
      `RatingChart.tsx`, `TerminationChart.tsx`, and `graph/page.tsx`. Same fix, same shape: an
      empty/absent player list means no `gd_player` condition at all, instead of listing every
      tracked username.
  - `buildFilters` (used by `fetchFilteredGames`/`getGamesPageCount`) — currently always pushes a
    `gd_player IN/=` filter unconditionally; skip it entirely when the players array is empty.
  - `getOpeningScores` — currently `WHERE gd_player IN (${playerPlaceholders}) ${colorFilter}
    ${dateFilter}` with no other guaranteed condition; restructure so the player condition is
    optional (e.g. `WHERE 1=1 ${playerFilter} ${colorFilter} ${dateFilter}`, matching the
    optional-fragment pattern already used in `chessdb.ts`).
  - `getTerminationStats` — `gd_termination IN (...)` is already a second guaranteed condition, so
    the player condition can become optional the same way, anchored on termination instead.
  - `getEarliestGameDate` — currently always builds `WHERE gd_player IN (${placeholders})`; make it
    optional (no `WHERE` clause restricting player at all when the list is empty).
  - **Callers** (`GameList.tsx`, `OpeningScoreChart.tsx`, `RatingChart.tsx`, `TerminationChart.tsx`,
    `graph/page.tsx`) — each already computes a `playersToFetch` enumerated list, used both for
    triggering these queries and for a "player list not loaded yet" guard
    (`playersToFetch.length === 0`). Same careful split as the Habits fix: keep `playersToFetch`
    exactly as-is for that guard, but pass a *separate* `playerFilter ? [playerFilter] : []` value
    to the actual query functions, instead of `playersToFetch` itself.
  - **`HomeDashboard.tsx` is explicitly NOT touched** — its `players.map(p => p.player)` calls
    always want every tracked player by design (no "All vs specific player" toggle exists there),
    unlike the other five files, which do have that toggle.
- [x] **Make the global player selector's "both selected" state visually explicit
      (user-requested):** `AppShell.tsx`'s `PlayerHeader` already provides a global player
      selector (two `PlayerProfile` cards writing to the shared `?player=` URL param), and clicking
      the already-selected card already toggles the filter back to `''` (both/all) — but neither
      card shows any visual indicator in that state, so a user has no way to tell "both" is active
      versus "nothing selected yet." User-agreed fix, user-specified color (yellow border):
  - `PlayerProfile.tsx` — change the existing `selected` outline color from
    `outline-blue-400` to `outline-yellow-400` (kept as the same outline treatment, just recolored
    for visibility against the card's `bg-blue-50` background).
  - `AppShell.tsx`'s `PlayerHeader` — change each card's `selected` computation from
    `players.length > 1 && playerFilter === p.player` to
    `players.length > 1 && (playerFilter === p.player || playerFilter === BOTH)`, so when the
    filter is unset (both), both cards show the yellow border together (visually "both showing");
    when a specific player is selected, only that card does. No new "Both" button — the existing
    click-to-toggle behavior (click the selected card again to return to both) is unchanged, only
    made visually discoverable.

- [x] **Bug fix: global player selection doesn't survive tab navigation.** `AppNav.tsx`'s tab links
      use a plain `href={s.href}` (`/`, `/habits`, `/graph`, `/openings`, `/endings`) with no query
      string, so clicking a tab after selecting a player in the header drops `?player=` entirely —
      landing on "both" instead of staying on the selected player. Fix: `AppNav` reads the current
      `player` param via `useSearchParams()` and appends it to each tab's `href` when present (e.g.
      `/?player=stricade`), so the selection survives tab navigation the same way it already
      survives a manual URL edit or a page refresh.

- [x] **Wording fix (user-requested):** `HabitsTable.tsx`'s Sort-by dropdown option
      `'Biggest impact first'` overflows the dropdown box; shorten to `'Biggest'`. The sibling
      option `'Most played'` is unaffected.

- [x] **Width fix (user-requested):** `WIDTH_HABITS_OPENING` changes from `'w-40'` to `'w-96'`, to
      match `GameList.tsx`'s `WIDTH_OPENING` — user reconsidered the earlier deliberate narrower
      value (denser table) and asked for parity instead, accepting the Habits table getting wider.

- [x] **Colour dots → text, everywhere (user-requested, broadened from a Habits-only ask):**
      `ColorSwatch.tsx` currently renders a filled circle (white/black) and is shared by both
      `GameList.tsx` and `HabitsTable.tsx`. Fix at the shared component itself — not per call site —
      so both consumers pick up the change automatically: replace the `<span>` dot with the literal
      text `'black'`/`'white'` (derived the same way, `color === 'black' || color === 'b'`),
      centered the same way the dot was. `ColorSwatch.tsx`'s filename/export name is left unchanged
      (not explicitly asked to rename it), even though it's no longer a literal swatch.

- [x] **Move the "selected" yellow outline to the outer box (user-requested):**
      `PlayerProfile.tsx`'s selected-state outline is currently on the inner `<div>` inside
      `<MyBox className='bg-blue-50'>`; move it onto `MyBox` itself instead (its `className` prop
      is merged with its default class via `myMergeClasses`, so it accepts extra classes cleanly).

- [x] **Global time-class filter, driven by the header rating badges (user-requested, fully
      speced via clarifying questions):** clicking a player's blitz/rapid rating badge in the
      `AppShell` header filters on both that player and that time class at once — not the normal
      toggle-off-on-second-click behavior the whole card has, always sets both values.
  - **`?timeClass=` becomes a second global URL param**, alongside `?player=`, synced the same
    way — read directly via `searchParams.get('timeClass')` on every page that has a Time filter,
    applies instantly (bypassing each page's own Filter/Refresh button, since only Time becomes
    instant — every other filter on those pages keeps its existing gating).
  - **Habits is explicitly excluded** — `thab_habits` is pre-aggregated across all time classes
    (`buildHabits.ts`'s `GROUP BY` has no `gd_time_class`), so there's no way to filter it by time
    class without a real schema/pipeline change. Out of scope for this step.
  - New `src/ui/filters/FilterTimeClassSelect.tsx` — mirrors `FilterPlayerSelect.tsx` exactly:
    reads/writes `?timeClass=` itself via `useRouter`/`usePathname`/`useSearchParams`, wraps the
    existing `TimeClassSelect` (which stays a plain controlled component, unchanged). One shared
    component used by all 4 pages below, instead of duplicating the URL-sync logic per page.
  - `PlayerProfile.tsx` — new `onRatingClick?: (control: string) => void` prop; each rating badge
    gets `onClick` (with `e.stopPropagation()`, so it doesn't also trigger the card's own
    onClick) and cursor/hover styling when the prop is passed.
  - `AppShell.tsx`'s `PlayerHeader` — new `handleRatingClick(player, control)` that sets both
    `player` and `timeClass` URL params in one `router.push` (no toggle logic, always sets),
    passed to each `PlayerProfile` as `onRatingClick`.
  - `AppNav.tsx` — also carries `?timeClass=` forward on tab navigation, same mechanism already
    added for `?player=`.
  - `src/lib/actions/games.ts` — `getOpeningScores` gains a new trailing `timeClass?: string`
    param; `getTerminationStats` gains a new trailing `timeClass?: string` param. Both add an
    optional `AND gd_time_class = ...` fragment, same pattern as their existing `color`/`dateFrom`
    fragments. `fetchFilteredGames`/`getGamesPageCount` need no change — `GameFilters.timeClass`
    and `buildFilters`'s handling of it already exist.
  - `GameList.tsx` — Time filter cell swaps `TimeClassSelect` (bound to `draftFilters.timeClass`,
    gated behind the Filter button) for `FilterTimeClassSelect` (global, instant). A new
    `effectiveFilters` merges `filters` with the live `timeClass` from the URL, used in place of
    `filters` for both the count and page-fetch effects (and the page-reset-to-1 key). The
    hydration effect strips any stale `timeClass` key from restored `draftFilters`/`filters`
    (old sessionStorage from before this change), so `filtersPending` never falsely shows
    "pending" because of a leftover value in a field that's no longer part of the draft/apply flow.
  - `graph/page.tsx` — removes its local `timeClass` state/sessionStorage entirely; swaps
    `TimeClassSelect` for `FilterTimeClassSelect`. A new `effectiveFilters` merges `appliedFilters`
    with the live `timeClass` from the URL, passed to `<RatingChart>` instead of `appliedFilters`
    directly. `filtersPending` drops its `timeClass` comparison (always in sync now).
  - `OpeningScoreChart.tsx` — gains a new `FilterTimeClassSelect` in its filter bar (previously no
    time-class concept at all). `getOpeningScores` and the nested `fetchFilteredGames` (games for
    a selected opening) both receive the live `timeClass` value; both effects' dependency arrays
    updated.
  - `TerminationChart.tsx` — gains a new `FilterTimeClassSelect` in its filter bar.
    `getTerminationStats` receives the live `timeClass` value; its effect's dependency array
    updated.

- [x] **Global `dateFrom`/`opening`/`eco` filters + visual "this is global" marker
      (user-requested, fully speced via clarifying questions and real-data verification):**
  - **Scope decided via data, not just theory:** confirmed via `hab_move_cp < 0` bad-habit query
    that `hab_opening_name`/`hab_eco_code` genuinely diverge from `gd_opening_name`/`gd_eco_code`
    on the same position ~34-50% of the time (real transposition, not hypothetical) — but since
    Opening/ECO are free-text substring searches (not exact-match, unlike `pos_color`), sharing
    the typed value across pages is still sound: each page applies it against its own column,
    same as any other approximate text search. `dateFrom` (`gd_end_time`) has no such issue — same
    column, same shape, on every page it appears.
  - `dateFrom` joins `player`/`timeClass` as a global URL param (`?dateFrom=`), but — unlike
    `timeClass` — stays gated behind each page's existing Filter/Refresh button (user-decided): a
    native date input doesn't have the per-keystroke-query risk of free text, but the user chose
    consistency with the existing gate over instant-apply.
  - `opening`/`eco` also become global URL params (`?opening=`, `?eco=`), gated behind each page's
    Filter button (unchanged reasoning from when they were first built as page-local drafts —
    avoid firing a query per keystroke).
  - **Visual marker (user-decided: purple border)**: `GLOBAL_FILTER_BORDER_CLASS` in
    `constants.ts`, applied only to the actual global-role instances of these controls — every
    other (page-local) use of the same shared components keeps the default blue border, unaffected.
  - New `src/lib/hooks/useGlobalFilter.ts` — `useGlobalFilter(key): [string, (next: string) =>
    void]`, the read/write URL-param mechanics factored out of `FilterPlayerSelect`/
    `FilterTimeClassSelect` (now the 3rd/4th+ occurrence of the identical pattern). Both existing
    components refactored to use it internally instead of duplicating `useRouter`/`usePathname`/
    `useSearchParams` logic.
  - New `borderClass?: string` override prop added to `FilterSelect.tsx`, `TimeClassSelect.tsx`
    (passthrough), `FilterTextInput.tsx`, and `FilterDateInput.tsx` — their border color was
    previously hardcoded inline with no way for a caller to override it. Defaults preserve the
    existing blue border exactly; only call sites that pass `GLOBAL_FILTER_BORDER_CLASS`
    explicitly change appearance.
  - `AppNav.tsx` — `buildHref`'s enumerated key list extended from `player`/`timeClass` to also
    include `dateFrom`/`opening`/`eco`. **Not** simplified to forward the whole query string as
    originally considered — `?highlight=` already lives in the URL on `/` and `/openings` as a
    page-specific, one-time "just analyzed this game" signal, and blindly forwarding it would leak
    it into unrelated tabs. The explicit `GLOBAL_FILTER_KEYS` list is the correct design, even
    though it means a future global filter needs one more line here.
  - `GameList.tsx` — Date From, Opening, ECO filter cells read/write the global params (via
    `useGlobalFilter`, gated behind the existing Filter button, same `effectiveFilters`-merge
    pattern already used for `timeClass`) and get the purple `borderClass`. Opening/ECO's typed
    (draft) value moves out of the shared `draftFilters` object into their own local state,
    mirroring the pattern `habits/page.tsx` already used for its Opening/ECO fields.
  - `graph/page.tsx`, `OpeningScoreChart.tsx`, `TerminationChart.tsx` — Date From becomes global
    the same way (gated behind each page's own Filter/Refresh button), purple `borderClass`.
  - `habits/page.tsx`/`HabitsTable.tsx` — Opening/ECO (already had their own local draft/apply
    micro-state from an earlier plan step) now read/write the global params instead of purely
    local component state, purple `borderClass`.
  - `src/lib/actions/games.ts` — **no changes needed**: `buildFilters`/`GameFilters` already fully
    supports `opening`/`eco`/`dateFrom` (confirmed by reading the file), and `getOpeningScores`/
    `getTerminationStats` already accept `dateFrom`. All the SQL-level plumbing already existed;
    this step is purely about making the *values* flow through the URL instead of page-local state.
  - `src/app/owner/constants/page.tsx` — new `GLOBAL_FILTER_BORDER_CLASS` entry; `useGlobalFilter`
    gets a brief mention in `FilterPlayerSelect`/`FilterTimeClassSelect`'s descriptions if relevant.

- [x] **Uppercase the ECO filter as typed (user-requested):** the SQL comparison is already fully
      case-insensitive (`nextjs-shared`'s `LIKE` handling lowercases both column and value; Habits'
      own `ecoFilter` does the same explicitly), so this is a display-only change — uppercase the
      typed value at both ECO input call sites (`GameList.tsx`'s `setDraftEco`, `habits/page.tsx`'s
      `onEcoChange` prop passed to `HabitsTable`), matching conventional ECO code formatting (`B28`,
      not `b28`).

- [x] **Bug fix: applying more than one global filter at once silently drops all but the last
      one.** Reported by the user (Games list: set Date From + typed ECO C69 + clicked Filter →
      row count showed the full unfiltered total and the rows list hung on "Loading..." forever).
      Root-caused by writing a diagnostic script that called `getGamesPageCount`/
      `fetchFilteredGames` directly with the same filters — both returned correct results in
      ~100-200ms, proving the SQL/query layer was fine and the bug was in the frontend's URL
      writes. `GameList.tsx`'s `handleApplyFilters` called `setDateFromFilter`,
      `setOpeningFilter`, and `setEcoFilter` (three separate `useGlobalFilter` setters)
      back-to-back; each one builds its new URL from the *same* pre-click `searchParams` snapshot
      (the component hasn't re-rendered between the three synchronous calls), so each
      `router.push` overwrites the previous one instead of composing — only the last call's param
      survives. Same bug existed in `habits/page.tsx`'s `handleApplyOpeningEcoFilter` (opening +
      eco, two setters).
  - `src/lib/hooks/useGlobalFilter.ts` — added a new `useGlobalFilters()` hook (plural) that
    builds one `URLSearchParams` from multiple `{key: value}` updates and does a single
    `router.push`. `useGlobalFilter(key)`'s existing `setValue` is now implemented in terms of it
    (a one-entry update) — single-key call sites (`FilterPlayerSelect`, `FilterTimeClassSelect`,
    `OpeningScoreChart`/`TerminationChart`'s instant `dateFrom`) are unaffected, since they only
    ever call `setValue` once per interaction and were never exposed to this bug.
  - `GameList.tsx`'s `handleApplyFilters` and `habits/page.tsx`'s `handleApplyOpeningEcoFilter`
    both switched to a single `setGlobalFilters({ ... })` call instead of multiple sequential
    single-key setters.
  - `AppShell.tsx`'s `handleClick`/`handleRatingClick` were not affected — both already built one
    combined `URLSearchParams` and did one `router.push` per call, the correct pattern all along.
    Left as their own inline implementation rather than migrated to the new hook, since they're
    already correct and not broken.

- [x] **Bug fix (user-reported regression from the earlier button-adoption audit):** `MoveBadge`
      in `MoveTree.tsx` (Analyze page's move tree) shows a blue background on every move.
      `MyButton`'s default class includes `bg-blue-500 hover:bg-blue-600`
      ([MyButton constants](node_modules/nextjs-shared/src/constants.ts)); `MoveBadge`'s
      `overrideClass` never overrode it (the raw `<button>` it replaced had no background at all).
      Fix: add `bg-transparent hover:bg-transparent` for the inactive case and an explicit
      `hover:bg-green-200` alongside `bg-green-200` for the active case, so hover doesn't revert to
      blue either way.

- [x] **Bug fix (user-reported):** `/position/[id]` is centered in the viewport
      (`max-w-5xl mx-auto`), inconsistent with every other page in the app (left-anchored/full-width).
      Drop `mx-auto`, keep `max-w-5xl` as the width cap.

## Changes

### src/lib/constants.ts
- Added a new "Filter Settings" section: `WIDTH_PLAYER`, `WIDTH_DATE_FROM`, `WIDTH_OPPONENT_RATING`,
  `OPTIONS_COLOR`/`WIDTH_COLOR`, `OPTIONS_COLOR_MULTI`/`WIDTH_COLOR_MULTI`,
  `OPTIONS_TIME_CLASS`/`WIDTH_TIME_CLASS`, `OPTIONS_RESULT`/`WIDTH_RESULT`,
  `OPTIONS_RESULT_MULTI`/`WIDTH_RESULT_MULTI`, `OPTIONS_TERMINATION`/`WIDTH_TERMINATION`,
  `WIDTH_COLOR_GAMES`, `WIDTH_TIME_CLASS_GAMES`, `WIDTH_OPPONENT`, `WIDTH_OPENING`, `WIDTH_ECO`,
  `PLACEHOLDER_TEXT_FILTER`, `PLACEHOLDER_ECO`, `WIDTH_MIN_GAMES`, `WIDTH_SORT_DIRECTION`,
  `WIDTH_RESULTS_COUNT`, `WIDTH_GAME_SORT`, `WIDTH_GRAPH_LIMIT`, `WIDTH_POSITION_COLOR`,
  `WIDTH_QUALITY`, `WIDTH_MIN_MOVE`, `WIDTH_MIN_REACHED`, `WIDTH_SORT_BY`.

### src/ui/filters/ColorSelect.tsx (new)
- gd_player_color single-select dropdown wrapping `FilterSelect`, default options/width/label baked in.

### src/ui/filters/ColorMultiSelect.tsx (new)
- gd_player_color multi-select checkbox group wrapping `FilterMultiCheckbox`.

### src/ui/filters/TimeClassSelect.tsx (new)
- gd_time_class select dropdown wrapping `FilterSelect`.

### src/ui/filters/ResultSelect.tsx (new)
- gd_player_result single-select dropdown wrapping `FilterSelect`.

### src/ui/filters/ResultMultiSelect.tsx (new)
- gd_player_result multi-select checkbox group wrapping `FilterMultiCheckbox`.

### src/ui/filters/TerminationMultiSelect.tsx (new)
- gd_termination multi-select checkbox group wrapping `FilterMultiCheckbox`; default options are
  the full taxonomy, overridable via an `options` prop for OpeningScoreChart's dynamic list.

### src/ui/filters/FilterPlayerSelect.tsx
- Option label changed from `p.display_name ?? p.player` to `p.player`, so the dropdown always
  shows the chess.com username instead of the display name.
- Default `width` now imports `WIDTH_PLAYER` instead of the inline literal `'w-24'`.

### src/lib/actions/games.ts
- `getOpeningScores`'s `color` parameter type changed from `'white' | 'black' | 'both'` to
  `'white' | 'black' | ''`, matching `ColorSelect`'s value domain (verified this function has
  exactly one caller, `OpeningScoreChart.tsx`).

### src/ui/games/GameList.tsx
- Removed the local `TERMINATION_OPTIONS` array (moved to `constants.ts` as `OPTIONS_TERMINATION`,
  now owned by `TerminationMultiSelect`).
- Swapped the color/time-class/result/termination filter cells to `ColorSelect`, `TimeClassSelect`,
  `ResultSelect`, `TerminationMultiSelect` (color and time-class pass a narrower
  `WIDTH_COLOR_GAMES`/`WIDTH_TIME_CLASS_GAMES` override for the table-header layout).
- `FilterPlayerSelect`'s width override removed (fixed from `'w-20'` to the shared `WIDTH_PLAYER`
  default).
- Replaced remaining inline widths/placeholders with `WIDTH_DATE_FROM`, `WIDTH_OPPONENT`,
  `WIDTH_OPPONENT_RATING`, `WIDTH_RESULT`, `WIDTH_OPENING`, `WIDTH_ECO`, `PLACEHOLDER_TEXT_FILTER`,
  `PLACEHOLDER_ECO`.
- Wrapped `ColorSelect`, `TimeClassSelect`, and `ResultSelect` each in a `flex justify-center` div
  in their filter `<th>`, matching their centered column headers/row values.
- Header renamed from "End" to "Termination" (the column was always `gd_termination`), with an
  explicit `w-36` width added to the header `<th>`.
- The Opening row `<td>`'s hardcoded `max-w-40 truncate` changed to
  `` `${WIDTH_OPENING} truncate` `` — now driven by the same constant as the Opening filter, instead
  of an untracked literal.
- (follow-up) Removed the `placeholder={PLACEHOLDER_ECO}` prop from the ECO `FilterTextInput`, per
  request; the import list no longer includes `PLACEHOLDER_ECO`.
- (follow-up) Added `overrideClass='flex-1'` to `<MyPaginationFooter>` so it grows to fill the row
  instead of shrink-wrapping its content, between the leading spacer `<div>` and the trailing
  "Page X of Y" text.
- (follow-up) Removed the "Page X of Y (N games)" `<span>` entirely, per request.
- (follow-up) Renamed `GAME_LIST_ITEMS_PER_PAGE` → `GAME_LIST_ROWS_DEFAULT` throughout (import +
  both usages, for `rowsPerPage`'s initial state and its sessionStorage-hydration fallback).

### src/lib/constants.ts (follow-up)
- `WIDTH_OPPONENT`: `'w-24'` → `'w-48'` (user-specified), to match the row's opponent-username
  column width.
- `WIDTH_OPENING`: `'w-40'` → `'w-48'` → `'w-64'` → `'w-96'` (user-specified, three revisions), now
  shared by the filter and the row's truncation width (previously only the filter used a named
  constant).
- Lowercased the option labels in `OPTIONS_COLOR`, `OPTIONS_COLOR_MULTI`, `OPTIONS_TIME_CLASS`,
  `OPTIONS_RESULT`, `OPTIONS_RESULT_MULTI` (e.g. `'White'`→`'white'`, `'Blitz'`→`'blitz'`,
  `'Win'`→`'win'`) so every filter dropdown shows the raw DD data value instead of an invented
  capitalized version — the `'All'` sentinel option is unaffected (no corresponding DD value).
- Removed `PLACEHOLDER_ECO` (now unused, since `GameList.tsx`'s ECO filter no longer sets a
  placeholder).
- Renamed `GAME_LIST_ITEMS_PER_PAGE` → `GAME_LIST_ROWS_DEFAULT` and changed its value from `15` to
  `20` (both user-requested).
- `HABITS_ITEMS_PER_PAGE`: `10` → `6` → `3` (user-specified, two revisions). Added
  `HABITS_ROWS_OPTIONS`, revised from `[6, 10, 20, 50]` to `[3, 6, 10, 20, 50]` to include the
  final default.
- Added `POSITION_BOARD_SIZE_PX = '400px'` (extracted from `PositionDetail.tsx`'s hardcoded
  `boardStyle`) and `HABITS_BOARD_SIZE_PX`'s value changed from `'96px'` to `'200px'`
  (user-specified).

### src/app/habits/page.tsx
- `<MyPaginationFooter>` now passes `rowsOptions={HABITS_ROWS_OPTIONS}` (previously had no
  `rowsOptions` prop, so it fell back to `nextjs-shared`'s shared default `[10, 20, 50, 100]`,
  which didn't include `6`) and `overrideClass='flex-1'`, same full-width fix as `GameList.tsx`.
- Removed the local "Page X of Y (N moves)" `<span>` entirely, same as `GameList.tsx`.

### src/ui/charts/OpeningScoreChart.tsx
- `color` state type changed from `'both' | 'white' | 'black'` to `'' | 'white' | 'black'`
  (including its sessionStorage-hydration fallback and the `colorFilter` computation used by the
  nested game-list fetch), to match `ColorSelect`'s value domain.
- Bug fix (follow-up): the sessionStorage-hydration read for `color` now validates the stored
  value is `'white'`/`'black'` before trusting it, falling back to `''` otherwise — a stale
  `'both'` value left over from before the domain change above was being passed straight into
  `getOpeningScores`'s SQL as `AND gd_player_color = 'both'`, matching zero rows regardless of
  the actual filters shown.
- Swapped the top-level Colour dropdown to `ColorSelect`, and the nested game table's Colour/Result/
  Termination checkboxes to `ColorMultiSelect`/`ResultMultiSelect`/`TerminationMultiSelect`
  (Termination keeps its dynamic `options={availableTerminations}` override).
- Replaced remaining inline widths with `WIDTH_MIN_GAMES`, `WIDTH_SORT_DIRECTION`,
  `WIDTH_RESULTS_COUNT`, `WIDTH_DATE_FROM`, `WIDTH_GAME_SORT`, `WIDTH_OPPONENT_RATING`. Local
  `MIN_GAMES_OPTIONS`/`RESULTS_OPTIONS` arrays kept local (single-use, page-specific).

### src/ui/charts/TerminationChart.tsx
- Swapped the Colour dropdown to `ColorSelect`; `FilterPlayerSelect`/`FilterDateInput` widths now
  use `WIDTH_DATE_FROM` (player width override removed, uses the shared default).

### src/app/graph/page.tsx
- Swapped the Time dropdown to `TimeClassSelect`; replaced remaining inline widths with
  `WIDTH_DATE_FROM`, `WIDTH_GRAPH_LIMIT` (player width override removed). Local
  `GRAPH_LIMIT_OPTIONS` kept local (single-use, page-specific).

### src/ui/analysis/HabitsTable.tsx
- Replaced inline widths with `WIDTH_POSITION_COLOR`, `WIDTH_QUALITY`, `WIDTH_MIN_MOVE`,
  `WIDTH_MIN_REACHED`, `WIDTH_SORT_BY`. The `pos_color` select itself is unchanged — it targets a
  different DD column (`pos_color`, `'w'/'b'`) than `ColorSelect`'s `gd_player_color`
  (`'white'/'black'`), so it is intentionally not unified. `FilterPlayerSelect`'s width override
  removed (uses the shared `WIDTH_PLAYER` default).
- (follow-up) `MiniBoard`'s hardcoded `boardStyle: { width: '64px', height: '64px' }` now uses the
  new `HABITS_BOARD_SIZE_PX` constant (`'96px'`) for both; the wrapping `<div>`'s className changed
  from `w-16 h-16` to `w-24 h-24` to match (64px→96px), so the larger board isn't clipped.
- (follow-up) `HABITS_BOARD_SIZE_PX` revised to `'200px'`. Since 200px isn't on Tailwind's default
  spacing scale, the wrapper `<div>` switched from Tailwind `w-24 h-24` classes to an inline
  `style={{ width: HABITS_BOARD_SIZE_PX, height: HABITS_BOARD_SIZE_PX }}`, sized directly from the
  constant so it always matches exactly regardless of future value changes.
- (follow-up) Added `opening_name`/`eco_code` to the `HabitRow` interface. New "Opening" and "ECO"
  columns added to both header rows (title + blank filter cell — no filter control for either) and
  the data rows, placed after the Eval/CP column and before the Dismiss/Restore action column.
  Opening truncates with a `title` tooltip (`WIDTH_HABITS_OPENING`), matching `GameList.tsx`'s
  pattern; ECO reuses the existing `WIDTH_ECO` constant. Empty-state `colSpan` updated from `11` to
  `13` for the two new columns.
- (follow-up) Removed the local `MiniBoard` function and its now-unused `useMemo`/`Chessboard`/
  `HABITS_BOARD_SIZE_PX` imports; now imports `MiniBoard` from `src/ui/board/MiniBoard.tsx`
  (unchanged call site — still relies on the component's default size).
- (follow-up) Moved the Opening/ECO header cells, filter cells, and data `<td>`s to sit right after
  Colour (previously after Eval/CP). Opening/ECO filter cells now hold real `FilterTextInput`s
  (`value`/`onChange` from new `opening`/`eco`/`onOpeningChange`/`onEcoChange` props) instead of
  blank cells. The action column's filter-row cell now holds two controls side by side: the new
  `FilterActionButton` ("Filter", `pending`/`primary` variant driven by the new
  `openingEcoFilterPending` prop) plus the pre-existing "Show dismissed" toggle button.

### src/ui/board/MiniBoard.tsx (new)
- Extracted from `HabitsTable.tsx`, same behavior, now takes an optional `size?: string` prop
  (defaulting to `HABITS_BOARD_SIZE_PX`) instead of hardcoding that constant internally — reusable
  by other pages (e.g. `PositionDetail.tsx` at `POSITION_BOARD_SIZE_PX`) if wanted later.

### src/lib/analysis/chessdb.ts
- `getHabitsData` — added a `LEFT JOIN LATERAL` that finds the latest game (`ORDER BY gd_end_time
  DESC LIMIT 1`) whose `tgam_game_positions` row matches the habit's position as either
  `gam_pos_id` or `gam_resulting_pos_id` (per the project's "reach counts both directions" rule),
  joined through `gam_gdid` to `tgd_gamesdecon` for `gd_opening_name`/`gd_eco_code`. Both new
  fields added to the function's return type and row mapping. `habits/page.tsx` needed no changes
  — it passes `getHabitsData`'s result straight through to `HabitsTable` via `setRows(data)`.
- (follow-up) Extracted the `LEFT JOIN LATERAL` above into a shared `LATEST_GAME_LATERAL_JOIN`
  module-level constant, now also used by `getHabitsCount` (which previously had no join to
  `tgam_game_positions`/`tgd_gamesdecon` at all). `buildHabitsFilter` gained `opening?`/`eco?`
  opts, producing `openingFilter`/`ecoFilter` WHERE fragments against
  `latest_game.gd_opening_name`/`latest_game.gd_eco_code` using
  `LOWER(column) LIKE '%lowercased_value%'` — matching `nextjs-shared`'s own `LIKE`-operator
  convention (verified in `buildSqlQuery.ts`). Both `getHabitsData` and `getHabitsCount` now accept
  and apply `opening`/`eco` opts, so the same "latest game" is used consistently for both fetching
  rows and counting them.
- (follow-up) `getPositionDetail`'s `games` query now also selects
  `TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS game_date`, matching the identical pattern
  already used by `getGamesForPosition`. New `date: string | null` field added to the return type
  and row mapping.
- (follow-up, bug fix) `buildHabitsFilter`'s `playerPlaceholders` (always assumed present in the
  base `WHERE`) replaced with an optional `playerFilter` fragment (`''` when `opts.players` is
  empty/undefined, an `AND h.hab_player IN (...)` fragment otherwise) — same shape as
  `colorFilter`/`qualityFilter`. `getHabitsData`/`getHabitsCount` moved the player condition into
  that optional fragment and dropped their
  `if (!opts.players || opts.players.length === 0) return []/0` early guards, since an
  empty/undefined `players` is now a legitimate "no filter" request rather than "nothing to
  query."
- (follow-up, denormalization) Removed `LATEST_GAME_LATERAL_JOIN` and its `LEFT JOIN LATERAL`
  entirely from both `getHabitsData` and `getHabitsCount`. `opening_name`/`eco_code` in
  `getHabitsData`'s `SELECT` now read `h.hab_opening_name`/`h.hab_eco_code` directly (plain
  columns). `buildHabitsFilter`'s `openingFilter`/`ecoFilter` changed from
  `LOWER(latest_game.gd_opening_name) LIKE ...` to `LOWER(h.hab_opening_name) LIKE ...` (same for
  ECO) — same `LIKE` convention, now against the denormalized columns computed by `buildHabits()`.

### src/lib/analysis/buildHabits.ts (denormalization)
- Restructured the aggregation query into a `WITH agg AS (...)` CTE, so a new `LEFT JOIN LATERAL`
  (same "latest game" logic as the one removed from `chessdb.ts`, correlated on the already-grouped
  `agg.pos_id`) runs once per final habit row instead of once per raw source row — keeping the
  same efficiency characteristics as the original per-request join, just moved to build time.
- Added `openingName`/`ecoCode` to `HabitAggregate`, the `INSERT` column list/`VALUES`
  placeholders (10 → 12 params per row), and the `ON CONFLICT ... DO UPDATE SET` clause, so both
  refresh on every full rebuild like every other computed field in this table.

### scripts/schema.sql
- Added `hab_opening_name text` and `hab_eco_code character varying(8)` to `thab_habits`, matching
  the manually-run `ALTER TABLE` (appended at the end, no reorder needed).

### src/app/habits/page.tsx (follow-up)
- Added `draftOpening`/`draftEco`/`opening`/`eco` state — the drafts track the new text inputs on
  every keystroke, `opening`/`eco` (applied only on Filter click via the new
  `handleApplyOpeningEcoFilter`) drive `getHabitsData`/`getHabitsCount` and are added to `load()`'s
  and the count effect's dependency arrays. Both persisted to sessionStorage under the existing
  `STORAGE_KEY`, and included in the page-reset-to-1 key alongside the other filters. New props
  passed to `<HabitsTable>`: `opening`, `onOpeningChange`, `eco`, `onEcoChange`,
  `onApplyOpeningEcoFilter`, `openingEcoFilterPending` (`true` when either draft differs from its
  applied value).
- (follow-up, bug fix) `getHabitsData`/`getHabitsCount` calls now pass
  `players: playerFilter ? [playerFilter] : undefined` instead of the enumerated `playersToFetch`
  list, so selecting "All" applies no player filter at all rather than listing every tracked
  username. `playersToFetch` itself is unchanged, still used for the "player list not loaded yet"
  guard on `load()`/`loadCount()`.

### src/ui/analysis/PositionDetail.tsx
- Extracted the hardcoded `boardStyle: { width: '400px', height: '400px' }` into the new
  `POSITION_BOARD_SIZE_PX` constant, imported and used for both dimensions.
- (follow-up) Added `date: string | null` to `GameHit`; added a "Date" header + cell to the Game
  History tab's table, placed first (before Game ID).

### src/app/owner/constants/page.tsx
- Added a new "Filter Settings" `CONSTANTS_SECTIONS` entry covering all 30 new constants, plus
  `FUNCTION_DESCRIPTIONS` entries for the 6 new components and `FilterPlayerSelect`.
- Re-ordered the "Filter Settings" section's `entries` array alphabetically by `name`, so
  `OPTIONS_*`, `PLACEHOLDER_*`, and `WIDTH_*` each cluster together on the Constants tab.
- (follow-up) Removed the `PLACEHOLDER_ECO` entry and import, since the constant no longer exists.
- (follow-up) Renamed `GAME_LIST_ITEMS_PER_PAGE` → `GAME_LIST_ROWS_DEFAULT` in the import and its
  "Batch / Pagination / Concurrency" `CONSTANTS_SECTIONS` entry; description updated to "Default
  rows-per-page for the GameList UI component."
- (follow-up) Added `HABITS_ROWS_OPTIONS` to the "Batch / Pagination / Concurrency" section, and
  updated `HABITS_ITEMS_PER_PAGE`'s description to "Default rows-per-page for the /habits table."
- (follow-up) Added `HABITS_BOARD_SIZE_PX` to the "UI Display" section, plus a
  `FUNCTION_DESCRIPTIONS` entry for `HabitsTable.tsx: MiniBoard` (not previously listed).
- (follow-up) Added `POSITION_BOARD_SIZE_PX` to the "UI Display" section, plus a
  `FUNCTION_DESCRIPTIONS` entry for `PositionDetail.tsx: PositionDetail` (not previously listed).
- (follow-up) `HABITS_ITEMS_PER_PAGE`'s displayed value updates automatically (now `3`);
  `HABITS_ROWS_OPTIONS`'s displayed value updates automatically (now `[3, 6, 10, 20, 50]`) — no
  entry text changes needed for either, since only the underlying values changed.
- (follow-up) Added `WIDTH_HABITS_OPENING` to the "Filter Settings" section; added
  `HabitsTable.tsx: HabitsTable` to `WIDTH_ECO`'s existing `consumers` list, since it's now reused
  there.
- (follow-up) `MiniBoard` moved files, so `HABITS_BOARD_SIZE_PX`'s `consumers` entry and its
  `FUNCTION_DESCRIPTIONS` key both updated from `HabitsTable.tsx: MiniBoard` to
  `MiniBoard.tsx: MiniBoard`.

### src/ui/filters/FilterSelect.tsx
- Rewritten to wrap `nextjs-shared/MySelect` instead of a raw `<select>`. Options may be plain
  strings or `{ value, label }` pairs; rendered as `<option>` children (via `MySelect`'s `children`
  fallback, since its own `options?: string[]` prop only supports flat strings) rather than via the
  `options` prop.

### src/ui/filters/FilterNumberRange.tsx
- Rewritten so both the min and max inputs wrap `nextjs-shared/MyInput` instead of raw
  `<input type='text' inputMode='numeric'>`, matching `FilterTextInput`'s existing pattern.

### src/ui/analysis/HabitsTable.tsx (button audit)
- The "Show dismissed" toggle and the per-row Dismiss/Restore toggle both converted from raw
  `<button>` to `MyButton`, same classes passed via `overrideClass`.

### src/ui/analysis/PositionDetail.tsx (button audit)
- The "× clear" selected-move filter link converted from raw `<button>` to `MyButton`.

### src/ui/board/MoveTree.tsx (button audit)
- `MoveBadge`'s button converted from raw `<button>` to `MyButton`, `data-node-id` passed through
  unaffected via `MyButton`'s `...rest` spread.

### src/ui/analysis/PipelineHelp.tsx (button audit)
- The "Help" trigger button and the popover's "×" close button both converted from raw `<button>`
  to `MyButton`.

### src/lib/actions/games.ts ("All means no selection")
- `buildFilters` — now returns no `gd_player` condition at all when the players array is empty,
  instead of enumerating every tracked username.
- `getOpeningScores` — player condition changed from a mandatory `WHERE gd_player IN (...)` to an
  optional `${playerFilter}` fragment, anchored on `WHERE 1=1`.
- `getTerminationStats` — same optional-fragment change, anchored on the always-present
  `gd_termination IN (...)` condition instead.
- `getEarliestGameDate` — the whole `WHERE` clause is now conditional; omitted entirely when the
  players array is empty instead of restricting to an enumerated list.

### src/ui/games/GameList.tsx ("All means no selection")
- Added a `queryPlayers` value (`players.length === 1 ? [players[0].player] : playerFilter ?
  [playerFilter] : []`), passed to `getGamesPageCount`/`fetchFilteredGames` instead of
  `playersToFetch`. `playersToFetch` itself unchanged, still used as the "player list not loaded
  yet" guard.

### src/ui/charts/OpeningScoreChart.tsx ("All means no selection")
- Same `queryPlayers` split, passed to both `getOpeningScores` and the nested `fetchFilteredGames`
  call (games-for-opening lookup), `playersToFetch` unchanged as the loading guard.

### src/ui/charts/RatingChart.tsx ("All means no selection")
- Same `queryPlayers` split (preserving the existing `players.length === 1` special case), passed
  to `fetchFilteredGames` instead of `playersToFetch`.

### src/ui/charts/TerminationChart.tsx ("All means no selection")
- Same `queryPlayers` split (no `players.length === 1` special case, matching its simpler existing
  `playersToFetch` shape), passed to `getTerminationStats`.

### src/app/graph/page.tsx ("All means no selection")
- The inline `fetchMin` effect now guards on `players.length === 0` (player list not loaded) instead
  of the enumerated list's length, and passes a separate `playerFilter ? [playerFilter] : []` value
  to `getEarliestGameDate` instead of the enumerated `playersToFetch`.

### src/ui/player/PlayerProfile.tsx (global player selector visibility)
- `selected` state's outline color changed from `outline-blue-400` to `outline-yellow-400`, per
  user request, so the selection indicator reads clearly against the card's `bg-blue-50` background.

### src/ui/AppShell.tsx (global player selector visibility)
- `PlayerHeader`'s `selected` computation for each `PlayerProfile` card changed from
  `playerFilter === p.player` to `playerFilter === p.player || playerFilter === BOTH`, so when no
  player is selected (`?player=` unset — "both"), both cards now show the yellow selection border
  together instead of neither showing any indicator. No new "Both" button added — the existing
  click-the-selected-card-again-to-deselect behavior is unchanged, just now visually discoverable.

### src/ui/AppNav.tsx (bug fix — global player selection dropped on tab navigation)
- Reads the current `player` query param via `useSearchParams()` and appends it to each tab's
  `href` when present (e.g. `/?player=stricade`), instead of the previous bare path. Safe to call
  `useSearchParams()` here — `AppNav` is only ever rendered from `AppShell.tsx`'s `PlayerHeader`,
  already wrapped in `<Suspense>`.

### src/ui/analysis/HabitsTable.tsx (wording fix)
- Sort-by dropdown option label changed from `'Biggest impact first'` to `'Biggest'` (was
  overflowing the dropdown box); `'Most played'` unchanged.

### src/lib/constants.ts (width fix)
- `WIDTH_HABITS_OPENING`: `'w-40'` → `'w-96'` (user-specified), now matching `GameList.tsx`'s
  `WIDTH_OPENING` instead of a deliberately narrower value.

### src/app/owner/constants/page.tsx (follow-up)
- `WIDTH_HABITS_OPENING`'s description updated to reflect it now matches `WIDTH_OPENING`, instead
  of noting it as intentionally narrower.

### src/ui/player/PlayerProfile.tsx (yellow outline moved to outer box)
- `selected`'s outline classes moved from the inner `<div>` to `MyBox`'s `className` prop (merged
  with its default class via `myMergeClasses`), so the yellow selection border now wraps the whole
  card instead of just the inner content area.

### src/ui/ColorSwatch.tsx (dots → text)
- Replaced the filled-circle `<span>` with plain text (`'black'`/`'white'`), derived the same way
  (`color === 'black' || color === 'b'`). Both consumers (`GameList.tsx`, `HabitsTable.tsx`) pick
  up the change automatically since they call the shared component; neither call site changed.
  Filename/export name left as `ColorSwatch` (not explicitly asked to rename it).

### src/ui/filters/FilterTimeClassSelect.tsx (new)
- gd_time_class global filter, mirroring `FilterPlayerSelect`'s structure: reads/writes
  `?timeClass=` itself via `useRouter`/`usePathname`/`useSearchParams`, wraps the existing
  `TimeClassSelect` (unchanged, stays a plain controlled component).

### src/ui/player/PlayerProfile.tsx (rating badges clickable)
- New `onRatingClick?: (control: string) => void` prop; each rating badge span gets `onClick`
  (with `e.stopPropagation()` so it doesn't also trigger the card's own onClick) and
  cursor-pointer/hover styling when the prop is passed.

### src/ui/AppShell.tsx (rating badges clickable)
- `PlayerHeader` gained `handleRatingClick(player, control)`, which sets both `player` and
  `timeClass` URL params in one `router.push` (no toggle — always sets, unlike `handleClick`'s
  toggle-off-on-second-click behavior). Passed to each `PlayerProfile` as `onRatingClick`.

### src/ui/AppNav.tsx (carries timeClass forward too)
- Extended the earlier player-carrying fix: now reads `timeClass` via `searchParams.get` as well
  and builds each tab's `href` via a new `buildHref` helper that includes both params when
  present, instead of only `player`.

### src/lib/actions/games.ts (global time-class filter)
- `getOpeningScores` gained a new trailing `timeClass?: string` param, with an optional
  `AND gd_time_class = ...` fragment added to its `WHERE`, same pattern as `color`/`dateFrom`.
- `getTerminationStats` gained the same new trailing `timeClass?: string` param and fragment.
  `fetchFilteredGames`/`getGamesPageCount` needed no changes — `GameFilters.timeClass` and
  `buildFilters`'s handling of it already existed.

### src/ui/games/GameList.tsx (global time-class filter)
- Time filter cell swapped from `TimeClassSelect` (bound to `draftFilters.timeClass`, gated
  behind the Filter button) to `FilterTimeClassSelect` (global, instant, reads `?timeClass=`
  directly).
- New `effectiveFilters` (`useMemo`) merges `filters` with the live `timeClassFilter` from the
  URL; used in place of `filters` for the count effect, the page-fetch effect, and the
  page-reset-to-1 key.
- The hydration effect now strips any stale `timeClass` key from restored
  `draftFilters`/`filters` (leftover sessionStorage from before this change), so `filtersPending`
  can't falsely show "pending" from a field no longer part of the draft/apply flow.

### src/app/graph/page.tsx (global time-class filter)
- Removed the local `timeClass` state and its sessionStorage read/write entirely; reads
  `timeClassFilter` from `?timeClass=` directly. Swapped `TimeClassSelect` for
  `FilterTimeClassSelect`.
- New `effectiveFilters` (`useMemo`) merges `appliedFilters` (still Refresh-gated for
  `dateFrom`) with the live `timeClassFilter`, passed to `<RatingChart>` instead of
  `appliedFilters` directly. `filtersPending` no longer compares `timeClass` (always in sync now).

### src/ui/charts/OpeningScoreChart.tsx (global time-class filter, new to this page)
- New `timeClassFilter` read from `?timeClass=`; new `<FilterTimeClassSelect />` added to the
  filter bar (previously no time-class concept at all). Both `getOpeningScores` and the nested
  `fetchFilteredGames` (games for a selected opening) now receive the live `timeClass` value;
  both effects' dependency arrays updated.

### src/ui/charts/TerminationChart.tsx (global time-class filter, new to this page)
- Same addition: new `timeClassFilter` read, new `<FilterTimeClassSelect />` in the filter bar,
  `getTerminationStats` now receives the live `timeClass` value, dependency array updated.

### src/app/owner/constants/page.tsx (follow-up)
- Added a `FUNCTION_DESCRIPTIONS` entry for `FilterTimeClassSelect.tsx: FilterTimeClassSelect`,
  matching the existing `FilterPlayerSelect` entry's pattern. Updated `TimeClassSelect.tsx:
  TimeClassSelect`'s description, since it's no longer called directly by `GameList`/`graph/page`
  — now wrapped by `FilterTimeClassSelect`.

### src/lib/hooks/useGlobalFilter.ts (new)
- `useGlobalFilter(key): [string, (next: string) => void]` — reads/writes one URL search param.
  Factors out the identical `useRouter`/`usePathname`/`useSearchParams` read/write logic that had
  been duplicated in `FilterPlayerSelect`/`FilterTimeClassSelect` and was about to be duplicated
  again for `dateFrom`/`opening`/`eco`.

### src/lib/constants.ts (global filter styling)
- Added `GLOBAL_FILTER_BORDER_CLASS = 'border-purple-400 hover:border-purple-400 focus:border-purple-400'`
  (user-specified color), applied only to the actual global-role instances of filter components.

### src/ui/filters/FilterSelect.tsx (global filter styling)
- New `borderClass?: string` prop (default `'border-blue-500 focus:border-blue-500
  hover:border-blue-500'`, preserving the exact previous appearance) — the border color was
  previously hardcoded inline with no way for a caller to override it.

### src/ui/filters/TimeClassSelect.tsx (global filter styling)
- New `borderClass?: string` passthrough prop to `FilterSelect`.

### src/ui/filters/FilterTextInput.tsx, src/ui/filters/FilterDateInput.tsx (global filter styling)
- New `borderClass?: string` prop (default `''`, appended into `overrideClass` — `MyInput`'s own
  default blue border shows through unchanged unless a caller passes an override).

### src/ui/filters/FilterPlayerSelect.tsx (refactor + global filter styling)
- Refactored to use the new `useGlobalFilter('player')` hook instead of its own duplicated
  `useRouter`/`usePathname`/`useSearchParams` logic. Now passes `borderClass=
  {GLOBAL_FILTER_BORDER_CLASS}` to `FilterSelect`.

### src/ui/filters/FilterTimeClassSelect.tsx (refactor + global filter styling)
- Refactored to use `useGlobalFilter('timeClass')`. Now passes `borderClass=
  {GLOBAL_FILTER_BORDER_CLASS}` through to `TimeClassSelect`.

### src/ui/AppNav.tsx (extended global filter carry-forward)
- `GLOBAL_FILTER_KEYS` extended from `['player', 'timeClass']` to also include `'dateFrom'`,
  `'opening'`, `'eco'`. Considered simplifying `buildHref` to forward the whole current query
  string instead of enumerating keys, but rejected: `?highlight=` already lives in the URL on `/`
  and `/openings` as a page-specific, one-time "just analyzed this game" signal, and blindly
  forwarding it would leak it into unrelated tabs. Kept the explicit list.

### src/ui/games/GameList.tsx (dateFrom/opening/eco global)
- Date From, Opening, and ECO now read/write global URL params via `useGlobalFilter`, gated
  behind the existing Filter button (matching this page's existing draft/apply pattern for every
  other filter). New `draftDateFrom`/`draftOpening`/`draftEco` local state tracks the typed/picked
  value; a sync effect keeps them aligned with the global values whenever those change externally
  (mount, tab navigation, or this page's own Filter click). `draftFilters`/`filters` no longer
  carry `dateFrom`/`opening`/`eco` at all (both `useState` initializers changed from `{ dateFrom:
  DEFAULT_DATE_FROM }` to `{}`); the hydration effect strips any stale values a returning user's
  sessionStorage might still carry for all three fields (alongside the existing `timeClass`
  strip). `effectiveFilters` extended to merge in the three global values. `filtersPending` gained
  explicit comparisons for the three fields (no longer covered by the `draftFilters`/`filters`
  diff, since they've moved out of those objects). All three filter cells get the purple
  `borderClass`.

### src/app/graph/page.tsx (dateFrom global)
- Removed the local `dateFrom` state and its sessionStorage read/write entirely; reads/writes it
  via `useGlobalFilter('dateFrom')` instead, still gated behind the existing Refresh button (new
  `draftDateFrom` local state + a sync effect, same pattern as GameList). `appliedFilters` state
  removed entirely (it only ever held `dateFrom`, now sourced from the URL instead); a new
  `effectiveFilters` merges `dateFrom`/`timeClass` from the URL directly. `filtersPending` no
  longer compares `dateFrom` against a local "applied" copy — compares the draft against the live
  global value instead. Purple `borderClass` on the Date From input.

### src/ui/charts/OpeningScoreChart.tsx, src/ui/charts/TerminationChart.tsx (dateFrom global)
- Neither page has a Filter/Refresh gate at all — every filter already applies instantly — so
  `dateFrom` becomes global via `useGlobalFilter('dateFrom')` with a direct instant write (no
  draft state needed, unlike GameList/graph/page). Removed the local `dateFrom` state and its
  sessionStorage read/write entirely. TerminationChart's "Clear" button now clears the global
  value (`setDateFromFilter('')`) and its visibility check uses the raw (un-defaulted) URL value,
  since the defaulted value is never empty. Purple `borderClass` on both Date From inputs.

### src/app/habits/page.tsx (opening/eco global)
- Removed the local `opening`/`eco` state and their sessionStorage persistence (previously bundled
  into the page's single `STORAGE_KEY` JSON blob alongside color/quality/etc.) entirely; reads/
  writes them via `useGlobalFilter('opening')`/`useGlobalFilter('eco')` instead, still gated
  behind the existing "Filter" button (`draftOpening`/`draftEco` unchanged in role, now synced to
  the global values via a new effect instead of to local `opening`/`eco` state).
  `handleApplyOpeningEcoFilter` now calls the global setters. `filtersResetKeyRef`'s key and both
  `getHabitsCount`/`getHabitsData` calls updated to use the global values.

### src/ui/analysis/HabitsTable.tsx (opening/eco global styling)
- Both Opening/ECO `FilterTextInput`s now pass `borderClass={GLOBAL_FILTER_BORDER_CLASS}`.

### src/app/owner/constants/page.tsx (follow-up)
- Added `GLOBAL_FILTER_BORDER_CLASS` to the "Filter Settings" section (alphabetically first,
  `G` < `O`), with a `consumers` list covering every component/page that applies it.

### src/ui/games/GameList.tsx, src/app/habits/page.tsx (ECO uppercase)
- ECO input's `onChange` now uppercases the typed value before storing it in draft state
  (`v => setDraftEco(v.toUpperCase())` in both files) — display-only, since the SQL comparison
  was already case-insensitive on both pages.

### src/lib/hooks/useGlobalFilter.ts (bug fix — batched global filter writes)
- Added `useGlobalFilters()`, a companion hook that sets multiple URL params in a single
  `router.push`. `useGlobalFilter(key)` refactored to call it internally instead of duplicating
  the read/write logic.

### src/ui/games/GameList.tsx (bug fix)
- `handleApplyFilters` now calls `setGlobalFilters({ dateFrom, opening, eco })` once instead of
  three sequential single-key setter calls, which had been silently dropping all but the last of
  the three on every Filter click.

### src/app/habits/page.tsx (bug fix)
- `handleApplyOpeningEcoFilter` now calls `setGlobalFilters({ opening, eco })` once instead of two
  sequential single-key setter calls, same bug/fix as GameList.

### src/ui/board/MoveTree.tsx (bug fix — blue background regression)
- `MoveBadge`'s `overrideClass` now includes `bg-transparent hover:bg-transparent` for the
  inactive case and `hover:bg-green-200` alongside the active case's `bg-green-200`, overriding
  `MyButton`'s default `bg-blue-500 hover:bg-blue-600` that was showing through on every move.

### src/ui/analysis/PositionDetail.tsx (bug fix — page centered instead of left-anchored)
- Outer wrapper's `mx-auto` removed, `max-w-5xl` kept as the width cap.

### src/app/layout.tsx (bug fix, unrelated to filters/constants work)
- Imported `NuqsAdapter` from `nuqs/adapters/next/app` and wrapped the body's existing content
  (`DevLayoutHeader` + `<main><AppShell>{children}</AppShell></main>`) in it. Fixes a runtime
  crash on `/position/[id]` (`[nuqs] nuqs requires an adapter to work with your framework`) —
  `PositionDetail.tsx` uses `nextjs-shared`'s `useTabQueryState`, which is built on `nuqs` and
  requires this app-wide adapter, which had never been added.

## Testing
- [ ] Open /openings, /endings, /graph, and the Games list (home page) — confirm the player
      dropdown now shows chess.com usernames (e.g. `stricade`/`astarboy`) instead of display names,
      and every filter row/bar looks the same as before (same widths)
- [ ] On the Games list: confirm the Colour, Time, and Result filter dropdowns are now centered
      under their (already-centered) column headers, matching the row values below them
- [ ] On the Games list: confirm the column previously labeled "End" now reads "Termination" and
      is `w-36` wide
- [ ] On the Games list: confirm the Opponent filter box is `w-48` wide, and the Opening filter
      box/column is now `w-96` wide (widened several times across this session); long opening
      names still truncate with a tooltip on hover
- [ ] On the Games list: confirm the ECO filter box no longer shows placeholder text ("e.g. B27")
- [ ] On the Games list: confirm the pagination footer (rows-per-page + page numbers, yellow
      background) now spans the full width of the row instead of sitting as a narrow island, and
      that the "Page X of Y (N games)" text is gone entirely (removed per request)
- [ ] On the Games list: confirm the default/initial rows-per-page is now 20 (was 15), and the
      dropdown still offers 10/15/20/50
- [ ] Across the Games list, Openings page, Endings chart, and Habits table: confirm every
      Colour/Time/Result filter dropdown now shows lowercase option text (`white`/`black`,
      `blitz`/`rapid`, `win`/`loss`/`draw`) instead of Title Case, with "All" unchanged — and that
      filtering still works correctly with the new lowercase values
- [ ] **Regression check:** on /openings, with an existing browser session (one that used this
      page before today's `color` state change), confirm results now load correctly instead of
      showing "No openings with N+ games" for every filter combination — this was caused by a
      stale sessionStorage `'both'` value breaking the SQL filter, now fixed by validating the
      stored value before trusting it. If your browser never hit the bug, this is just a normal
      Colour-filter check: confirm results still update correctly, including selecting "All";
      click into a bar and use the nested Colour/Result/Termination filters on the games table
- [ ] On /graph: use the Time filter and confirm the rating chart still updates
- [ ] On /habits: confirm the Colour (All/White/Black — unchanged, still `pos_color`), Quality,
      Min move, Min reached, and Sort by filters all still work as before
- [ ] On /habits: confirm the default rows-per-page is now 3, the dropdown offers 3/6/10/20/50, and
      the pagination footer spans the full row width with the "Page X of Y (N moves)" text removed
- [ ] Open /owner/constants, Filter Settings section — confirm every constant renders (grouped
      alphabetically) with its updated value, and the Functions tab still resolves correctly
- [ ] Open /owner/constants, "Batch / Pagination / Concurrency" section — confirm
      `HABITS_ITEMS_PER_PAGE` shows `3` and the new `HABITS_ROWS_OPTIONS` entry shows `[3, 6, 10, 20, 50]`
- [ ] On /habits: confirm the mini chessboards are now visibly larger (200px, up from the original
      64px) and not clipped/cut off by their surrounding cell, and still render/interact correctly
      now that `MiniBoard` lives in its own file (`src/ui/board/MiniBoard.tsx`)
- [ ] Open /position/[id] (e.g. http://localhost:4050/position/27325?player=stricade) — confirm the
      main board still renders at 400px and looks unchanged
- [ ] Open /owner/constants, "UI Display" section — confirm `HABITS_BOARD_SIZE_PX` shows `'200px'`
      and the new `POSITION_BOARD_SIZE_PX` entry shows `'400px'`
- [ ] Open a `/position/[id]` page (e.g. click into a position from the Habits table or a game's
      analysis) — confirm it loads without the "[nuqs] nuqs requires an adapter" runtime crash, and
      that tab/move switching on that page still updates the URL query string correctly
- [ ] On /habits: confirm the "Opening" and "ECO" columns now appear right after Colour (not near
      the end), show a plausible opening name/code for most rows, truncate long names with a hover
      tooltip, and show "—" for any position with no matching game found
- [ ] Open /owner/constants, Filter Settings section — confirm the new `WIDTH_HABITS_OPENING` entry
      renders and `WIDTH_ECO`'s consumers list now includes `HabitsTable.tsx: HabitsTable`
- [ ] On /habits: type into the new Opening filter box and click "Filter" — confirm the table
      narrows to matching rows (case-insensitive partial match) and the total count updates to
      match; repeat for the ECO filter box; confirm typing alone (without clicking Filter) does
      *not* trigger a query, and that the Filter button shows a "pending" look while a typed value
      hasn't been applied yet
- [ ] On /habits: confirm the existing Colour/Quality/Min move/Min reached/Sort by filters still
      apply instantly on change, unaffected by the new Opening/ECO draft-filter behavior
- [ ] On /habits: confirm the "Show dismissed" toggle button still works, now sitting next to the
      new Filter button in the same cell
- [ ] Open /position/[id]?tab=history on any position with games — confirm a "Date" column now
      appears first in the Game History table, showing a real YYYY-MM-DD date per row
- [ ] On /habits with Player set to "All": confirm results still show habits from every tracked
      player (not empty, not restricted) — this is the actual regression check, since the fix
      removed the explicit enumerate-all-players query and the early-return guard it relied on
- [ ] On /habits with a specific Player selected: confirm results are still correctly scoped to
      just that player (unaffected by the fix)
- [ ] **After running the `ALTER TABLE thab_habits ADD COLUMN ...` SQL manually**, re-run "Build
      Habits" from the Owner Pipeline page, then confirm on /habits that Opening/ECO still show
      real values (now sourced from `hab_opening_name`/`hab_eco_code` instead of a live join) and
      that the Opening/ECO filters still work correctly
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass with no errors (also
      re-verified via a full `#reinstall`: node_modules/package-lock.json/.next removed and
      rebuilt from scratch)
- [ ] Across the app: confirm every dropdown that used to be a raw `<select>` (Player, Colour, Time,
      Result, Termination filters, etc.) and the Opp. Rating min/max boxes still look and behave
      identically after wrapping `MySelect`/`MyInput` — no visual or functional regressions
- [ ] On /habits: confirm the "Show dismissed" toggle and each row's Dismiss/Restore button still
      work and look the same, now that they're `MyButton`
- [ ] On /position/[id]: confirm the "× clear" filtered-move link, and on the Analyze page the
      move-tree's move badges, still work identically as `MyButton`
- [ ] On the Owner Pipeline page: confirm the "Help" trigger button and its popover's "×" close
      button still work identically as `MyButton`
- [ ] On the home page / Games list, /openings, /graph, and /endings: with Player set to "All",
      confirm results still show data from every tracked player (not empty, not restricted) — the
      actual regression check for the games.ts fix, since it removed the enumerate-all-players
      query path for these five call sites
- [ ] Same four pages with a specific player selected: confirm results are still correctly scoped
      to just that player
- [ ] On any page (e.g. the home page): confirm the two player cards in the header — when neither
      has been explicitly clicked (`?player=` unset) — now both show a yellow border, making clear
      both players' data is currently shown; click one card and confirm only that card keeps the
      yellow border while the other loses it; click the same card again and confirm both cards
      regain the yellow border (back to "both")
- [ ] Select a specific player in the header (e.g. `stricade`), then click each tab in turn (Games,
      Habits, Graph, Openings, Endings) — confirm the header stays showing `stricade` selected
      (yellow border) and each page's data stays scoped to that player, instead of resetting to
      "both" on navigation
- [ ] On /habits: confirm the Sort-by dropdown's first option now reads "Biggest" (no longer
      overflowing the box) and still sorts by biggest CP impact first when selected
- [ ] On /habits: confirm the Opening filter box and column are now the same width as GameList's
      (`w-96`, up from `w-40`), and the Opening filter still works correctly at the new width
- [ ] On any page: click a player card to select it — confirm the yellow selection border now wraps
      the entire card (avatar/name/ratings included), not just an inner strip; confirm it still
      looks correct on both cards when "both" is active (unset `?player=`)
- [ ] On the Games list and on /habits: confirm the Colour column now shows the text "white"/"black"
      instead of a filled dot, in both places
- [ ] On Games, Graph, Openings, and Endings: confirm the Player, Time, and Date From filter
      controls all show a purple border instead of blue; on Games and Habits, confirm the Opening
      and ECO filter boxes also show a purple border. Every other, page-local filter (Opponent,
      Result, Termination, Opp. Rating, Habits' Quality/Min move/Min reached/Sort by, etc.) should
      still show the normal blue border, unaffected
- [ ] On the Games list: set a Date From value and click Filter — confirm it applies, then switch
      to Openings, Endings, or Graph and confirm the same Date From value is already applied there
      (no need to re-enter it), and vice versa in each direction
- [ ] On Openings and Endings specifically: confirm Date From still applies instantly (no Filter
      button on these pages) — same as before this change, just now shared globally
- [ ] On Endings: confirm the "Clear" button next to Date From still works (resets to the default
      2025-01-01 date rather than truly unbounded history — an accepted, user-confirmed tradeoff of
      making dateFrom a URL param)
- [ ] On the Games list: type an Opening or ECO search and click Filter — confirm it applies, then
      switch to /habits and confirm the same search text now appears in Habits' Opening/ECO boxes
      and narrows its results too (against `hab_opening_name`/`hab_eco_code`, not the literal
      per-game value — results may differ from Games' matches, which is expected)
- [ ] On /habits: type an Opening or ECO search and click Filter — confirm it applies, then switch
      to the Games list and confirm the same search carries over there too
- [ ] Click through all 5 tabs with Date From/Opening/ECO all set — confirm none of them get
      dropped on any tab (extends the same check already done for player/timeClass)
- [ ] With an existing browser session (used Games/Habits before today's change): confirm no false
      "pending" Filter-button state appears on page load from stale sessionStorage values left over
      for dateFrom/opening/eco
- [ ] On the Games list and on /habits: type a lowercase ECO code (e.g. `b28`) into the ECO filter
      box — confirm it displays as uppercase (`B28`) as you type, and still filters correctly
- [ ] On the Games list: set Date From to a non-default value, type an Opening or ECO search, and
      click Filter — confirm all three actually apply together (row count and results reflect all
      three, not just the last one changed), and don't get silently dropped
- [ ] On /habits: type both an Opening and an ECO search and click Filter — confirm both apply
      together, not just whichever was typed last
- [ ] Open http://localhost:4050/analyze?game=2360&user=stricade — confirm the moves in the move
      tree no longer show a blue background; blunder/mistake/inaccuracy colour-coding and the
      green highlight on the currently-selected move both still look correct
- [ ] Open http://localhost:4050/position/48202?player=stricade&move=Kxh2&tab=history — confirm
      the page (board + tabs/panel) is now left-anchored instead of centered in the viewport
- [ ] On any page: click a player's blitz or rapid rating badge in the header — confirm it selects
      that player (yellow border) AND filters to that time class, and that clicking the same badge
      again doesn't toggle it off (unlike clicking the player card itself)
- [ ] After clicking a rating badge, confirm the Games list, Graph, Openings, and Endings pages all
      immediately reflect the selected time class (no need to click Filter/Refresh on any of them),
      and that their own Time dropdown shows the same value
- [ ] On the Games list: change the Time dropdown directly — confirm results update immediately
      (no Filter click needed), while changing another filter (e.g. Opponent) still requires
      clicking Filter as before
- [ ] On /graph: change the Time dropdown directly — confirm the chart updates immediately, while
      changing Date From still requires clicking Refresh as before
- [ ] On /openings and /endings: confirm a Time filter now exists (previously absent) and works
      correctly, both standalone and combined with the other filters on those pages
- [ ] Select a time class via a rating badge, then click through all 5 tabs (Games, Habits, Graph,
      Openings, Endings) — confirm it stays applied on Games/Graph/Openings/Endings, and that
      Habits is unaffected (no time-class filter there, by design)
- [ ] With an existing browser session (used the Games list before today's change): confirm the
      Filter button doesn't show a false "pending" state on page load from a stale timeClass value
      left over in old sessionStorage
