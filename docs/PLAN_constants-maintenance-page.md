# PLAN_constants-maintenance-page — chess

## Title
Constants maintenance page

## Plan

**Design decision (revised from an earlier registry/shared-component approach):** no shared
component, no registry export from `constants.ts`, no separate `envRegistry.ts`. Everything the
UI needs — name, value, description, consumers — is hardcoded directly in the new page's own data
arrays, the same pattern already used by `src/ui/analysis/PipelineHelp.tsx`'s `STEPS` array.
`constants.ts` itself keeps only values + section headers; the explanatory text that used to live
in per-constant `//` comments moves to the UI (single source, not duplicated). Adding a new
constant later means: add the `export const` in the right section of `constants.ts`, then add one
entry to the page's data array — no abstraction layer to keep in sync.

**Scope note:** this PLAN only covers work executable from this session (project `chess`). A
shared `nextjs-shared` component was considered and explicitly dropped — see design decision above
— so there is no multi-project handoff for this task.

- [x] Step 1 — Restructure `src/lib/constants.ts`
  - Keep every existing individual `export const NAME = ...` unchanged (same names, same values,
    same helper `getPlayerTimeClasses`) so all current call sites keep working with no changes.
  - Remove the existing per-constant `//` comment blocks — their explanatory content moves into
    the new page's data array (Step 3), so it isn't duplicated in two places. Section-header
    comments marking the 5 groups below stay (structural, not per-constant explanation).
  - Reorder the physical declarations into 5 sections:
    - **Player / Filter Defaults**: `INCLUDED_TIME_CLASSES`, `DEFAULT_PLAYER`, `DEFAULT_DATE_FROM`,
      `DEFAULT_MIN_GAMES`, `DEFAULT_FILTER_TERMINATIONS`, `TERMINATION_CHART_TYPES`
    - **Analysis Pipeline Thresholds**: `MIN_ANALYSIS_MOVE`, `MOVE_COUNT_MIN_MOVE`,
      `MAX_ANALYSIS_MOVE`, `PURGE_REACH_GRACE_DAYS`, `MIN_REACH_TO_KEEP`, `HABITS_MIN_REACH_FLOOR`,
      `HABITS_MOVE_CP_CLAMP`, `RESULT_MISMATCH_CP_THRESHOLD`, `POPULAR_POSITION_DEPTH_TIERS`
    - **Batch / Pagination / Concurrency**: `DEFAULT_BATCH_SIZE`, `POSITION_INSERT_CHUNK_SIZE`,
      `GAMES_ITEMS_PER_PAGE`, `GAME_LIST_ITEMS_PER_PAGE`, `PIPELINE_LOG_ROWS_PER_PAGE`,
      `HABITS_ITEMS_PER_PAGE`, `GAME_ENDINGS_CONCURRENCY`
    - **Player Overrides + Helpers**: `PLAYER_TIME_CLASSES`, `getPlayerTimeClasses`
    - **Stockfish Analysis** (new — moved out of `.env`, see Step 2): `STOCKFISH_DEPTH`,
      `STOCKFISH_BLUNDER_CP`, `STOCKFISH_MISTAKE_CP`, `STOCKFISH_INACCURACY_CP`, `STOCKFISH_HASH`,
      `STOCKFISH_BESTLINE_LENGTH`, `STOCKFISH_DEEP_ANALYSIS_DEPTH`, `STOCKFISH_DEEP_ANALYSIS_MULTIPV`
  - New Stockfish Analysis constants — agreed values (each is the value currently in effect today,
    i.e. the `.env` value where one was set, otherwise the hardcoded fallback that's always been
    used since `NEXT_PUBLIC_STOCKFISH_DEEP_ANALYSIS_DEPTH`/`_MULTIPV` were never actually defined
    in any `.env` file):
    - `STOCKFISH_DEPTH = 16`
    - `STOCKFISH_BLUNDER_CP = 200`
    - `STOCKFISH_MISTAKE_CP = 100`
    - `STOCKFISH_INACCURACY_CP = 50`
    - `STOCKFISH_HASH = 128`
    - `STOCKFISH_BESTLINE_LENGTH = 5`
    - `STOCKFISH_DEEP_ANALYSIS_DEPTH = 24`
    - `STOCKFISH_DEEP_ANALYSIS_MULTIPV = 3`
  - Update `src/lib/stockfish.ts`'s `STOCKFISH_DEFAULTS` object to reference these 8 new constants
    directly instead of `process.env.NEXT_PUBLIC_STOCKFISH_*` + `parseInt` + hardcoded fallback.
    Keep the exported name `STOCKFISH_DEFAULTS` and its property names unchanged so nothing
    downstream changes.

- [x] Step 2 — Clean up `.env.locallocal`, `.env.localdev`, `.env.localprod` (kept structurally
  identical). **Never touch `.env` itself** — it's a generated file, overwritten on every dev-server
  start by the `copy /Y .env.<target> .env` step in the npm scripts, not a source file.
  - Remove the whole "Stockfish Analysis Settings" section (6 defined lines: `NEXT_PUBLIC_STOCKFISH_
    DEPTH`, `_MULTIPV`, `_BLUNDER_CP`, `_MISTAKE_CP`, `_INACCURACY_CP`, `_HASH`, `_BESTLINE_LENGTH`)
    — values now live in `constants.ts` per Step 1. This also removes `NEXT_PUBLIC_STOCKFISH_MULTIPV`,
    which was already unused by any code.
  - Remove `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` — redundant,
    not read anywhere; only `POSTGRES_URL` actually drives the DB connection.
  - Keep `OLLAMA_URL`, `OLLAMA_MODEL` as-is — currently unused by any code, but flagged as
    deliberate scaffolding for a planned feature rather than cruft, so left in place.
  - Everything else stays: `POSTGRES_URL`, `POSTGRES_DATABASE_LOCATION`, `NEXT_PUBLIC_APPENV_ISDEV`,
    `NEXT_PUBLIC_APPENV_DBHANDLER`, `NEXT_PUBLIC_APPENV_LOG_I`, `NEXT_PUBLIC_APPENV_LOG_D`,
    `CRON_SECRET`, `PORT`, `STOCKFISH_PATH`.

- [x] Step 3 — Build a new read-only page at `/owner/constants` with two tabs, each backed by a
  hardcoded data array co-located in the page/component (`PipelineHelp.tsx`'s `STEPS` pattern) —
  `{ heading, entries: [{ name, value, description, consumers }] }` per tab, no shared file:
  - **Constants tab** — one entry per `constants.ts` export, `value` imported from the real const.
    Descriptions carried over from the removed `//` comments (Step 1); consumers per this mapping
    (file: function/component):
    - `INCLUDED_TIME_CLASSES` — sync.ts: syncArchive; players.ts: updatePlayerRating;
      deconstruct.ts: getUndeconstructedCount, deconstructGames; owner/maintenance/page.tsx: handleSearch
    - `DEFAULT_PLAYER` — players.ts: getPlayers; owner/maintenance/page.tsx: MaintenancePage
    - `DEFAULT_DATE_FROM` — graph/page.tsx: GraphContent; GameList.tsx: GameList;
      OpeningScoreChart.tsx: OpeningScoreChart; TerminationChart.tsx: TerminationChart
    - `DEFAULT_MIN_GAMES` — OpeningScoreChart.tsx: OpeningScoreChart
    - `DEFAULT_FILTER_TERMINATIONS` — OpeningScoreChart.tsx: OpeningScoreChart
    - `TERMINATION_CHART_TYPES` — games.ts: getTerminationStats
    - `MIN_ANALYSIS_MOVE` — HabitsTable.tsx: HabitsTable; buildHabits.ts: buildHabits;
      habits/page.tsx: HabitsContent; buildPositionTree.ts: buildPositionTree;
      pipelineStatus.ts: refreshHabitsStatus; owner/pipeline/page.tsx (module-scope SQL_STATUS_HABITS);
      deconstruct.ts (module-scope MIN_TRACKABLE_HALF_MOVES)
    - `MOVE_COUNT_MIN_MOVE` — ChessBoardView.tsx: ChessBoardView
    - `MAX_ANALYSIS_MOVE` — buildPositionTree.ts: buildPositionTree
    - `PURGE_REACH_GRACE_DAYS` — purgePositions.ts: purgeStaleReachOnePositions;
      pipelineStatus.ts: refreshPurgeStatus; owner/pipeline/page.tsx (module-scope SQL_STATUS_PURGE)
    - `MIN_REACH_TO_KEEP` — enrichPositionsStockfish.ts: countRemainingPositions,
      getResultingFensToEvaluate, enrichPositionsStockfish; purgePositions.ts: purgeStaleReachOnePositions;
      pipelineStatus.ts: refreshStep4, refreshCpChangeStatus, refreshPurgeStatus;
      owner/pipeline/page.tsx (module-scope SQL_STATUS_4, SQL_STATUS_CP, SQL_STATUS_PURGE)
    - `HABITS_MIN_REACH_FLOOR` — buildHabits.ts: buildHabits; pipelineStatus.ts: refreshHabitsStatus;
      owner/pipeline/page.tsx (module-scope SQL_STATUS_HABITS)
    - `HABITS_MOVE_CP_CLAMP` — buildHabits.ts: buildHabits
    - `DEFAULT_BATCH_SIZE` — enrichPositionsStockfish.ts: deepenPopularPositions, evaluateGameEndings;
      owner/pipeline/page.tsx: PipelinePage
    - `POSITION_INSERT_CHUNK_SIZE` — enrichPositionsStockfish.ts: evaluateGameEndings;
      buildPositionTree.ts: insertGamePositions; buildHabits.ts: buildHabits
    - `GAMES_ITEMS_PER_PAGE` — games.ts: fetchFilteredGames, getGamesPageCount
    - `GAME_LIST_ITEMS_PER_PAGE` — GameList.tsx: GameList
    - `PIPELINE_LOG_ROWS_PER_PAGE` — PipelineLogTable.tsx: fetchdata
    - `HABITS_ITEMS_PER_PAGE` — habits/page.tsx: HabitsContent
    - `GAME_ENDINGS_CONCURRENCY` — enrichPositionsStockfish.ts: evaluateGameEndings
    - `RESULT_MISMATCH_CP_THRESHOLD` — chessdb.ts: getGamesForPosition
    - `POPULAR_POSITION_DEPTH_TIERS` — enrichPositionsStockfish.ts: popularPositionTierSql
    - `PLAYER_TIME_CLASSES` (via `getPlayerTimeClasses`) — AppShell.tsx: loadAll;
      DeconstructButton.tsx: handleCheckCounts, handlePopulate; MaintenancePanel.tsx: handlePopulate;
      owner/maintenance/page.tsx: handleSearch
    - the 8 new `STOCKFISH_*` constants — src/lib/stockfish.ts: `STOCKFISH_DEFAULTS`
  - **.env tab** — one entry per remaining `.env` var (post Step 2 cleanup), `value` read live via
    `process.env.NAME` (raw, unmasked — page is restricted to the Owner route, single-user access),
    description hand-authored (env vars have no per-line comments to draw from), grouped:
    - **Database**: `POSTGRES_URL` — nextjs-shared/src/tables/db.ts, nextjs-shared/next.config.mjs,
      lib/sync-games.ts, lib/deconstruct-games.ts; `POSTGRES_DATABASE_LOCATION` — src/app/layout.tsx
    - **Application Environment**: `NEXT_PUBLIC_APPENV_ISDEV` — src/app/layout.tsx;
      `NEXT_PUBLIC_APPENV_DBHANDLER` — nextjs-shared/src/tables/db.ts; `NEXT_PUBLIC_APPENV_LOG_I`,
      `NEXT_PUBLIC_APPENV_LOG_D` — nextjs-shared/src/tables/tableGeneric/write_logging.ts;
      `CRON_SECRET` — src/app/api/cron/sync/route.ts, lib/cron-sync.ts; `PORT` — lib/cron-sync.ts
      only (the npm dev scripts hardcode `--port` instead)
    - **Ollama**: `OLLAMA_URL`, `OLLAMA_MODEL` — no current consumers (planned feature, not yet built)
    - **Stockfish Binary**: `STOCKFISH_PATH` — src/lib/analysis/enrichPositionsStockfish.ts
  - Non-scalar values (`POPULAR_POSITION_DEPTH_TIERS`, `PLAYER_TIME_CLASSES`) render as formatted
    JSON since they're not simple scalars.
  - No edit controls anywhere on either tab — pure display.

- [x] Step 4 — Add a nav link to `/owner/constants` alongside the existing `/owner/maintenance`,
  `/owner/pipeline`, `/owner/pipelinelog` links (matching whatever nav pattern those already use).

- [ ] Step 5 — Test in this project. Claude hands over the page URL; user runs their own dev
  server and verifies (per standing dev-server workflow).

- [x] Step 6 — Fix table width/column consistency across sections
  - Found during testing: each `SectionTable` in `ConstantsViewer.tsx` currently auto-sizes its
    own columns to its own content, so column widths drift between sections instead of lining up.
  - Fix in the one shared `SectionTable` component (applies to every section on both tabs at once):
    switch the `<table>` to `table-fixed`, give Name and Value fixed widths, give Used By a fixed
    width, and let Description take the remaining space — same widths on every table, so all
    sections and both tabs look identical.

- [x] Step 7 — Add a second tab row, one tab per section, within each top-level tab
  - `ConstantsViewer` currently stacks every section's table vertically under whichever top-level
    tab (Constants / .env) is active. Add a second level: below the Constants/.env tabs, one more
    tab per section heading in the active top-level tab (e.g. under Constants: Player / Filter
    Defaults, Analysis Pipeline Thresholds, Batch / Pagination / Concurrency, Player Overrides +
    Helpers, Stockfish Analysis — 5 tabs; under .env: Database, Application Environment, Ollama,
    Stockfish Binary — 4 tabs). Only the selected section's table renders at a time.
  - Switching the top-level tab resets the section-tab selection to the first section in the newly
    active tab (Constants and .env have different section lists, so there's no meaningful "same"
    section to preserve across the switch).

- [x] Step 8 — Remove the panel's max-width cap
  - Found during testing: `ConstantsViewer`'s outer wrapper has `max-w-5xl`, which caps the panel
    width and forces Description/Used By text to wrap/fold. Remove `max-w-5xl` so the panel uses
    the full available width instead.

- [x] Step 9 — Widen the Name and Value columns
  - Name column: widen (from `w-48` to `w-96`, generous enough that the longest current name,
    `NEXT_PUBLIC_STOCKFISH_DEEP_ANALYSIS_MULTIPV`, comfortably fits) and switch from `break-words`
    to `whitespace-nowrap` so it can never wrap past one line, since names are the most important,
    always-short identifier column.
  - Value column: widen (from `w-40` to `w-64`). Keeps `break-words` rather than `whitespace-nowrap`
    — most values are short, but `POSTGRES_URL` is a long connection string that would blow out the
    table width if forced onto one line, so this column stays wrap-if-needed rather than a hard
    single-line guarantee.
  - Description and Used By keep their current widths/behavior; the extra Name/Value width comes
    from the panel's now-unrestricted full width (Step 8), not from shrinking the other columns.

- [x] Step 10 — Replace the Used By column's inline text with a Help button + popover, as a list
  - Reuses the exact pattern already in `src/ui/analysis/PipelineHelp.tsx` (small "Help" button,
    own `useState`, absolutely-positioned popover on click, × to close) — new shared
    `PopoverButton({ label, children })` component in `ConstantsViewer.tsx`, self-contained per
    row (no table-level "which row is open" state needed). Reused in Step 11.
  - `ConstantEntry.consumers` changes type from `string` to `string[]` — one array entry per
    file/consumer group (e.g. `'sync.ts: syncArchive'`, `'players.ts: updatePlayerRating'`), not
    one semicolon-joined string. `PopoverButton` renders it as an actual `<ul>`/`<li>` list, not
    a continuous string. Every hardcoded `consumers: '...; ...; ...'` entry in
    `src/app/owner/constants/page.tsx` gets split into its equivalent `consumers: ['...', '...']`
    array (splitting on the existing `;` separators — no information lost, just restructured).
  - Used By column header/width shrinks from `w-72` to fit just the button (e.g. `w-24`) — freed
    width goes to Description, since the actual consumers list now only shows on click.

- [x] Step 11 — Object/array Value entries also use the Step 10 popover button
  - `renderValue()`: when the value is an object/array (currently rendered inline as a `<pre>`
    JSON block — `POPULAR_POSITION_DEPTH_TIERS`, `PLAYER_TIME_CLASSES`), render a `PopoverButton`
    (label "Display") instead, with the formatted JSON as its `children`. Scalar values (the
    common case) are unaffected — still print inline as today.

- [x] Step 12 — Drop the redundant heading inside every popover, and widen the popover
  - Neither popover needs its `{label}` repeated as a heading inside itself — the button that
    opens it already says "Display" or "Used by". Remove the heading `<p>` from `PopoverButton`
    entirely (no per-instance flag needed, since both current uses want it gone); keep just the ×
    close button, right-aligned.
  - Widen the popover from `w-80` to `w-[32rem]` — "Used by" entries were wrapping mid-line at the
    old width.

- [x] Step 13 — Rename both popover button labels to "Show"
  - `label='Display'` (Value column, object/array entries) and `label='Used by'` (Used By column)
    both change to `label='Show'` — button text only, no other behavior change.

- [x] Step 14 — Long scalar Value entries also go behind the Show button
  - Agreed threshold: **40 characters**. New constant `VALUE_DISPLAY_MAX_LENGTH = 40` in
    `src/lib/constants.ts` (new "UI Display" section), plus a matching entry in `CONSTANTS_SECTIONS`
    (`src/app/owner/constants/page.tsx`) — same pattern as every other constant.
  - `renderValue()`: value goes behind the Show popover (as plain text, not JSON) if it's an
    object/array (existing behavior) **or** its stringified length exceeds
    `VALUE_DISPLAY_MAX_LENGTH` — e.g. `POSTGRES_URL` (~90 chars) and `STOCKFISH_PATH` (~47 chars)
    now hide behind Show; short values (dates, small filter lists, `OLLAMA_URL`, etc.) stay inline.

- [x] Step 15 — Open the Value column's Show popover to the right instead of the left
  - `PopoverButton` gets an `align?: 'left' | 'right'` prop (default `'right'` — today's behavior,
    popover's right edge anchors to the button, so it expands leftward). Used By keeps the default
    (unchanged, still opens to the left). The Value column's `renderValue()` call passes
    `align='left'` — popover's left edge anchors to the button instead, so it expands rightward.

## Changes

### src/lib/constants.ts
- Restructured into 5 sections with header comments (Player / Filter Defaults, Analysis Pipeline
  Thresholds, Batch / Pagination / Concurrency, Player Overrides + Helpers, Stockfish Analysis).
  All existing exports unchanged in name/value. Removed per-constant `//` comment blocks — their
  explanatory content now lives solely in the new `/owner/constants` page's data arrays.
- Added 8 new constants (`STOCKFISH_DEPTH`, `STOCKFISH_BLUNDER_CP`, `STOCKFISH_MISTAKE_CP`,
  `STOCKFISH_INACCURACY_CP`, `STOCKFISH_HASH`, `STOCKFISH_BESTLINE_LENGTH`,
  `STOCKFISH_DEEP_ANALYSIS_DEPTH`, `STOCKFISH_DEEP_ANALYSIS_MULTIPV`), moved out of `.env` with
  their currently-effective values preserved.

### src/lib/stockfish.ts
- `STOCKFISH_DEFAULTS` now references the 8 new `constants.ts` exports directly instead of reading
  `process.env.NEXT_PUBLIC_STOCKFISH_*` with `parseInt` + hardcoded fallback. Exported name and
  property names unchanged.

### .env.locallocal, .env.localdev, .env.localprod
- Removed the "Stockfish Analysis Settings" block (values now in `constants.ts`), which also
  removed `NEXT_PUBLIC_STOCKFISH_MULTIPV` (was already unused by any code).
- Removed `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` — redundant,
  not read anywhere; only `POSTGRES_URL` drives the DB connection.
- `.env` itself was never touched (generated file, overwritten by the npm scripts' `copy` step).

### src/ui/owner/ConstantsViewer.tsx (new)
- Client component: tabbed (Constants / .env) read-only table renderer. Takes `ConstantSection[]`
  props for each tab; no edit controls. Non-scalar values render as formatted JSON.

### src/app/owner/constants/page.tsx (new)
- Server component. Hardcodes `CONSTANTS_SECTIONS` (name/value/description/consumers per
  `constants.ts` export, values imported live) and builds `envSections` from `process.env` at
  render time (raw/unmasked — page is under the single-user-access `/owner` route). Renders
  `ConstantsViewer` with both.

### src/app/owner/page.tsx
- Added a "Constants" nav card linking to `/owner/constants`, matching the existing tool-card
  pattern.

### src/ui/owner/ConstantsViewer.tsx
- Restructured to two tab levels: top-level Constants/.env (unchanged), plus a new second tab row
  listing every section heading in the active top-level tab — only the selected section's table
  renders at a time, instead of all sections stacked vertically.
- `SectionTable` switched to `table-fixed` with fixed widths on Name/Value/Used By and Description
  taking the remaining space, so every table (any section, either tab) has identical columns.
- Switching the top-level tab resets section selection to index 0.
- Removed `max-w-5xl` from the outer wrapper so the panel uses the full available width instead of
  forcing Description/Used By text to wrap.
- Name column widened `w-48` → `w-96` and switched `break-words` → `whitespace-nowrap` (never
  wraps). Value column widened `w-40` → `w-64` (still `break-words`, since `POSTGRES_URL` is a
  long connection string).
- Added shared `PopoverButton({ label, children })` component (same interaction pattern as
  `PipelineHelp.tsx`'s Help button). `ConstantEntry.consumers` changed from `string` to `string[]`;
  Used By column is now a "Used by" popover button rendering the consumers as an actual `<ul>`
  list, column width shrunk `w-72` → `w-24`. Object/array `Value` entries (`POPULAR_POSITION_
  DEPTH_TIERS`, `PLAYER_TIME_CLASSES`) now render behind a "Display" popover button instead of an
  inline `<pre>` block.

### src/app/owner/constants/page.tsx
- Every hardcoded `consumers` entry converted from a semicolon-joined string to a `string[]`
  matching the new `ConstantEntry.consumers` type.

### src/ui/owner/ConstantsViewer.tsx
- `PopoverButton` no longer repeats `{label}` as a heading inside its own popover — applies to
  both "Display" and "Used by" since they share the one component. Popover widened `w-80` →
  `w-[32rem]` (Used By entries were wrapping mid-line at the old width).
- Both popover buttons renamed to "Show". `renderValue()` now also hides long scalar strings
  behind the Show button (stringified length > `VALUE_DISPLAY_MAX_LENGTH`), not just objects/arrays.

### src/lib/constants.ts
- Added `VALUE_DISPLAY_MAX_LENGTH = 40` in a new "UI Display" section.

### src/app/owner/constants/page.tsx
- Added a "UI Display" section to `CONSTANTS_SECTIONS` documenting `VALUE_DISPLAY_MAX_LENGTH`.

### src/ui/owner/ConstantsViewer.tsx
- `PopoverButton` gets an `align?: 'left' | 'right'` prop (default `'right'`, unchanged for Used
  By). Value column's Show button passes `align='left'`, so its popover now opens to the right.
