# Termination dropdown width, master-games FEN panel, function-header & function-order convention rollout

## Plan

- [x] Widen `WIDTH_TERMINATION` (`src/lib/constants.ts:36`) from `w-20` to `w-40`.

- [x] **New panels on `/analyzemaster` showing master games that reached the exact current FEN**,
      sourced from our own pipeline data (`tmpos_positions`/`tmgam_game_positions`/
      `tmgd_gamesdecon`) rather than an external API. Two separate, standalone, reusable
      components (each takes just `fen: string`, no shared parent state — droppable onto any
      page), mirroring the existing "Master Moves (Lichess)"/"Master Games (Lichess)" pair's
      shape/columns exactly, placed as a visually-separated new section (below a divider labeled
      "From our own synced master games") rather than interleaved with the Lichess panels:
      - `MasterMovesDbPanel` ("Master Moves (Our DB)") — move-breakdown table (Move / Games /
        Score% / Avg Opponent Rating), no interactivity.
      - `MasterGamesDbPanel` ("Master Games (Our DB)") — game list (Move / White / Black / Year /
        Result / Game — clicking a row navigates to `/analyzemaster?game=X`), with its own
        self-contained move filter dropdown (not cross-wired to the Moves panel).
      - New `getMasterGamesForFen(fen)` server action (`masterGamesList.ts`): looks up
        `mpos_id`/`mpos_reached` from `tmpos_positions` (unique-indexed on `mpos_fen`), then joins
        `tmgam_game_positions` (indexed on `mgam_pos_id`) to `tmgd_gamesdecon` for player/result
        data; aggregates the per-move breakdown in JS from the same fetched row set.
      - Extracted `resultBadge` (previously local to `PositionDetail.tsx`) into a shared
        `src/lib/resultBadge.ts`, since this is its second use site.

- [x] **FEN truncation bug fix in `getMasterGamesForFen`** — found via testing: a known-popular
      position showed "No synced master games recorded" for both new panels. Root cause:
      `tmpos_positions.mpos_fen` stores the truncated 4-field FEN (matching how
      `buildPositionTree_Master` writes positions via `truncateFen()`), but the new function
      queried `WHERE mpos_fen = $1` using the raw, full 6-field FEN passed in from
      `currentNode.fen` — an exact-string mismatch that never matched anything, regardless of
      popularity. Fixed by truncating the incoming `fen` (via the existing `truncateFen()` from
      `src/lib/fen.ts`) before querying, matching the established pattern used elsewhere.

- [x] **`autoFetch`/`defaultOpen` props added to both new panels** — `autoFetch?: boolean`
      (default `true`, matching current behavior) shows a "Fetch Master Moves"/"Fetch Master
      Games" button instead of loading automatically when `false`; `defaultOpen?: boolean`
      (default `true`) passed straight through to `MyBox`'s own existing `defaultOpen` prop.
      Existing call sites (`MasterGameView.tsx`/`ChessBoardView.tsx`) left on the defaults, so
      current auto-fetch/open behavior is unchanged — the new props are opt-in for future call
      sites.

- [x] **`limit`/`gameLinkBase` props added to both new panels.** `limit?: number` (default
      `MASTER_GAMES_FOR_FEN_LIMIT = 50`, new constant) caps games fetched by
      `getMasterGamesForFen` — a real correctness/scalability gap, since the query was previously
      unbounded and a popular position (e.g. the starting position) could match hundreds/thousands
      of rows. `gameLinkBase?: string` (`MasterGamesDbPanel` only, default
      `'/analyzemaster?game='`) decouples the row-click navigation target from being hardcoded, so
      a future call site elsewhere in the app isn't forced to link to `/analyzemaster`.

- [x] **`useLazyFetch` hook extracted** (initially `src/lib/useLazyFetch.ts`) — the identical
      `loaded`/`loading`/`load()`/reset-on-deps-change pattern was duplicated across
      `MasterMovesDbPanel` and `MasterGamesDbPanel`; extracted into a generic, chess-agnostic hook
      (`useLazyFetch<T>(fetchFn, deps, {autoFetch})`) matching `nextjs-shared`'s existing
      non-`My`-prefixed hook convention (`useTabQueryState`, `useBackNav`). Both panels refactored
      to use it, verified via `tsc`/`npm run build`. Handed to a `nextjs-shared` session, which
      added `error` state and a `requestIdRef`-based stale-response guard (more robust than the
      local version's plan) before shipping it as `nextjs-shared/useLazyFetch`
      (`v2.1.83`) — both panels then switched to import it from there, and the local copy was
      deleted (`#reinstall` pulled the new version first).

- [x] **Result column clarity fix** — `resultBadge(g.player_result)` showed W/L/D relative to the
      tracked master, with nothing indicating which side (White/Black) that was — genuinely
      ambiguous. `getMasterGamesForFen` now returns `player` (the tracked master's handle) and an
      objective `result` (`'1-0'/'0-1'/'½-½'`, derived server-side from `mgd_player_color` +
      `mgd_player_result` via a new `objectiveResult` helper) instead of the ambiguous
      `player_result`, mirroring how "Master Games (Lichess)" already displays results.
      `MasterGamesDbPanel` bolds whichever of White/Black matches `player`.

- [x] **Panels reordered before the Lichess panels** — on both `MasterGameView.tsx` and
      `ChessBoardView.tsx`, the "From our own synced master games" section (both new panels) now
      renders before "Master Moves (Lichess)"/"Master Games (Lichess)", not after.

- [x] **Apply the function-headers convention across `src/`** — the numbered main-header
      convention (`1) DESCRIPTION` / `2) NOTES` / `3) CHANGE HISTORY`, double-equals bordered,
      positioned between the `'use client'`/`'use server'` directive and imports) just rolled out
      in `nextjs-shared`, applied here too. Use the `function-headers` skill to audit and apply it
      consistently across `src/`, rather than re-deriving the convention from memory.

- [x] **Same two panels also wired into `/analyze` (`ChessBoardView.tsx`)** — since each is
      already self-contained (just a `fen` prop, no shared state), dropping them in was
      mechanical. Placed at the same relative position as on `/analyzemaster`: immediately after
      "Master Games (Lichess)", before "Chess.com Games", using the identical divider/section
      styling, so both routes present the same panels in the same place.

- [x] **Apply the function-order convention across `src/`** — same ~121 files just swept for
      function-headers (`src/ui/`, `src/lib/`, `src/app/`). Use the `function-order` skill:
      convert eligible `const` arrow functions used as named functions into `function`
      declarations (never `useCallback`/`useMemo`-wrapped arrows or inline prop/event-handler
      callbacks), then reorder each file so `useEffect` calls come first, then the main
      exported function/component, then helper functions ordered by first use. Type-check after
      each individual move/conversion, not batched. Flag any genuinely ambiguous multi-caller
      ordering case rather than guessing.

## Changes

### src/lib/constants.ts
- `WIDTH_TERMINATION`: `w-20` → `w-40`.

### src/lib/resultBadge.ts (new)
- Extracted from `PositionDetail.tsx`'s local `resultBadge` function — now shared, since a second
  call site (the new `MasterGamesDbPanel`) needs the identical W/L/D badge logic.

### src/ui/analysis/PositionDetail.tsx
- Imports `resultBadge` from the new shared location instead of defining it locally.

### src/lib/master/masterGamesList.ts
- Added `getMasterGamesForFen(fen, limit = MASTER_GAMES_FOR_FEN_LIMIT)` — returns
  `{reached, moves, games}` for an exact FEN, via `tmpos_positions` → `tmgam_game_positions` →
  `tmgd_gamesdecon`. Added `MasterFenMoveBreakdown`/`MasterFenGameHit` types. Truncates the
  incoming `fen` via `truncateFen()` before querying (`tmpos_positions.mpos_fen` stores the
  truncated 4-field form, not the raw 6-field FEN callers pass in) — fixes a real bug where even
  popular positions matched nothing. `limit` caps the games query (`LIMIT $2`).

### src/lib/constants.ts
- Added `MASTER_GAMES_FOR_FEN_LIMIT = 50`.

### src/ui/board/MasterMovesDbPanel.tsx (new)
- Move-breakdown panel for an exact FEN, sourced from `getMasterGamesForFen`. Mirrors "Master
  Moves (Lichess)"'s table shape. Self-contained — takes `fen`, plus `autoFetch`/`defaultOpen`
  (both default `true`) and `limit` (default `MASTER_GAMES_FOR_FEN_LIMIT`). When `autoFetch` is
  `false`, shows a "Fetch Master Moves" button instead of loading on mount/fen change.

### src/ui/board/MasterGamesDbPanel.tsx (new)
- Game-list panel for an exact FEN, sourced from `getMasterGamesForFen`. Mirrors "Master Games
  (Lichess)"'s table shape, with its own internal move filter dropdown. Self-contained — takes
  `fen`, plus `autoFetch`/`defaultOpen` (both default `true`), `limit` (default
  `MASTER_GAMES_FOR_FEN_LIMIT`), and `gameLinkBase` (default `'/analyzemaster?game='`); clicking a
  row navigates to `${gameLinkBase}${mgd_mgdid}`. When `autoFetch` is `false`, shows a "Fetch
  Master Games" button instead of loading on mount/fen change.

### src/app/owner/constants/page.tsx
- Added `MASTER_GAMES_FOR_FEN_LIMIT` entry to the "Master Games (position database)" section.

### src/lib/useLazyFetch.ts (new, later deleted)
- Generic lazy-load state-machine hook (`{data, loaded, loading, load}`), extracted from the
  duplicated logic in both new panels. Chess-agnostic, no dependencies beyond React — handed to a
  `nextjs-shared` session as a proven-out reference; that session shipped an improved version
  (added `error`, a `requestIdRef` stale-response guard) as `nextjs-shared/useLazyFetch`. Once
  pulled in via `#reinstall` (`nextjs-shared@2.1.83`), both panels switched their import to
  `nextjs-shared/useLazyFetch` and this local file was deleted.

### src/lib/master/masterGamesList.ts (result clarity fix)
- `MasterFenGameHit` gained `player` (tracked master's handle) and `result` (objective
  `'1-0'/'0-1'/'½-½'`), replacing the ambiguous `player_result`. New `objectiveResult(playerColor,
  playerResult)` helper derives it server-side. Query now also selects `mgd_player`/
  `mgd_player_color`.

### src/ui/board/MasterMovesDbPanel.tsx / MasterGamesDbPanel.tsx (refactor)
- Both rewritten to use `useLazyFetch` instead of hand-rolled `loaded`/`loading` state.
  `MasterGamesDbPanel` also: shows `g.result` (objective notation) instead of a W/L/D badge
  (dropped the `resultBadge` import, no longer needed here), and bolds whichever of
  White/Black username matches `g.player`.

### src/ui/board/MasterGameView.tsx / ChessBoardView.tsx (reorder)
- Moved the "From our own synced master games" section to render before "Master Moves
  (Lichess)"/"Master Games (Lichess)" on both pages (previously rendered after).

### src/ui/board/MasterGameView.tsx
- Wired both new panels in as a visually-separated new section (below a divider labeled "From our
  own synced master games"), passing `currentNode.fen`.

### src/ui/board/ChessBoardView.tsx
- Wired both new panels in at the same relative position as `MasterGameView.tsx` (right after
  "Master Games (Lichess)", before "Chess.com Games"), passing `currentNode.fen` — same divider
  styling, so `/analyze` and `/analyzemaster` show the panels in the same place.

### Function-headers convention rollout (`src/` — full sweep, ~121 files reviewed)
- Applied the numbered `1) DESCRIPTION` / `2) NOTES` / `3) CHANGE HISTORY` main-header convention
  (double-equals bordered, positioned between the `'use client'`/`'use server'` directive — or the
  very top for files with none — and imports), using the `function-headers` skill.
- **`src/ui/` (47 files converted, 1 skipped)** — every `filters/`, `board/`, `analysis/`,
  `charts/`, `dashboard/`, `dataflow/`, `games/`, `owner/`, `player/`, and root `src/ui/` file with
  a single dominant export. `src/ui/dataflow/sections.tsx` skipped (genuine multi-export module —
  ~12 equally-weighted `XxxSection()` components plus a `SECTIONS` data export, no single main).
- **`src/lib/` (full sweep)** — converted `buildHabits.ts`, `purgePositions.ts`,
  `deconstructGames_Master.ts`, `masterSync.ts`, `deconstructGames_Player.ts`,
  `chesscomSearch.ts`, `lichess.ts`, `sync.ts`, `buildPositionTree_Player.ts`,
  `buildPositionTree_Master.ts`, plus the standalone utilities `formatCp.ts`, `winPct.ts`,
  `resultBadge.ts`, `chunkByGame.ts`, `useGlobalFilter.ts`. Left untouched (genuine multi-export,
  no single main): `fen.ts`, `backNav.ts`, `logStep.ts`, `analysisTree.ts`, `chesscom.ts`,
  `stockfish.ts` (both `classifyMove` and the `StockfishEngine` class are independently
  significant), `parsePgn.ts`, `chessdb.ts`, `games.ts`, `masterPlayers.ts`, `pipelineLog.ts`,
  `pipelineStatus.ts`, `players.ts`, `enrichPositionsStockfish.ts`, `masterGamesList.ts`,
  `masterGamesPipelineStatus.ts`, `fidePipeline.ts`, `fideStaging.ts`, `fidePipelineStatus.ts`.
- **`src/app/` (full sweep)** — every `page.tsx`/`layout.tsx` (root layout, owner layout, all 18
  page routes) and every `route.ts` under `src/app/api/` (20 files) given a header describing its
  main export/route handler, request/URL params, and returns.
- Fixed several duplicate/misplaced-header issues found along the way (an old header left behind
  after adding a new one at the top, or an old header sitting before a private helper rather than
  the actual exported function) by removing the stale copy once confirmed via grep/re-read.
- Verified with `npx tsc --noEmit` after each batch and a final `npm run build` — both clean.

### Function-order convention rollout (`src/` — full sweep)
- Applied the top-down ordering rule from `~/.claude/CLAUDE.md`'s `### Functions` section: `main`
  function/component first, helpers below ordered by first use; converted eligible `const` arrow
  functions used as named functions into `function` declarations.
- **Arrow-to-function conversion**: scanned all of `src/` for `const name = (...) => {...}`
  patterns. Found zero real conversions needed — every existing arrow-const in the codebase is
  legitimately exempt (an event-handler reference passed to `addEventListener`/`removeEventListener`
  in `stockfish.ts`, or `useCallback`/JSX-prop formatter callbacks in `RatingChart.tsx`). Everything
  else already uses `function` declarations.
- **Ordering pass, ~40 files reordered** (main moved to the top, helpers moved below, ordered by
  first use) across `src/app/` (`analyze`, `analyzemaster`, `openings`, `endings`, `graph`,
  `habits`, `position/[id]`, `owner` page, `owner/masterplayers`, `owner/pipelinemasters`,
  `owner/pipelinemastergames`, `owner/pipelinegames` — top-level only, see below), `src/lib/`
  (`sync.ts`, `buildPositionTree_Player.ts`, `buildPositionTree_Master.ts`, `buildHabits.ts`,
  `deconstructGames_Player.ts`, `masterSync.ts`, `pipelineLog.ts`), and `src/ui/` (`AppShell.tsx`,
  `HabitsTable.tsx`, `FilterSelect.tsx`, `AlternativeLines.tsx`, `TerminationChart.tsx`,
  `GameList.tsx`, `MasterGameList.tsx`, `OpeningScoreChart.tsx`, `RatingChart.tsx`,
  `ConstantsViewer.tsx`, `MoveTree.tsx`, `PipelineLogTable.tsx`, `MasterGameView.tsx`,
  `ChessBoardView.tsx` — top-level only, see below). Added a plain single-dash title/description
  header (per user decision mid-task) to every function that didn't already have one, wherever it
  was touched by a move.
- **Judgment calls made, flagged here rather than decided silently**:
  - **Deliberately-grouped pages left as-is (user decision)**: `pipelinegames/page.tsx`,
    `pipelinemasters/page.tsx`, `pipelinemastergames/page.tsx` organize each pipeline step's own
    state + handler together, in step order, with comment dividers — not by JSX first-use. Only
    each file's top-level helpers (`n`/`eta`/`StatusBadge`) were moved after the main export;
    the nested per-step handler/`useEffect` order inside the component body was left untouched.
  - **`ChessBoardView.tsx`, internal body left as-is**: only the 3 top-level helpers
    (`collectNodesFromMove`/`getCurrentMoveLabel`/`formatGameDate`) were moved after the main
    export. The ~20 nested `useEffect`s/handlers inside the 1500+ line component body were not
    reordered — same reasoning as the pipeline pages (tightly interdependent, some handlers are
    `useCallback`-wrapped and positionally required before the effects that call them), and
    reordering that scale of interleaved logic blind carried real risk for uncertain benefit.
  - **`PipelineDiagram.tsx` left as-is**: `DiagramNode`/`pos`/`edge` sit before the main export,
    immediately followed by the `NODE_TYPES`/`NODES`/`EDGES` data literals they construct — moving
    the functions after the main component would separate them from that data with no readability
    win, so this grouping was treated as intentional, same principle as the pipeline pages.
  - **Two genuine multi-caller ambiguities** (per the skill's explicit instruction to flag rather
    than guess): `ConstantsViewer.tsx`'s `PopoverButton` is called from three different helpers
    (`FunctionIndexPopup`, `SectionTable`, `renderValue`) with no single caller to anchor its
    position to — placed last, after all three. `MoveTree.tsx`'s `evalColor` is called from both
    `EvalCell` and `InlineVariation` — placed right after `EvalCell` (its first caller in the
    current layout). Both are working code either way; the placement is a readability judgment
    call, not a correctness one.
- Verified with `npx tsc --noEmit` after each file/small batch and a final `npm run build` — both
  clean throughout.

## Testing
- [ ] Confirm the Termination filter dropdown (wherever `WIDTH_TERMINATION` is used) is visibly
      wider than before.
- [ ] On `/analyzemaster`, select a move in the move tree — confirm two new panels appear below a
      divider, under the existing Lichess panels: "Master Moves (Our DB)" and "Master Games (Our
      DB)".
- [ ] Pick a position with known synced master activity (e.g. a common opening reached by Magnus
      Carlsen/Hikaru/etc.) — confirm the move-breakdown table shows real move/games/score%/rating
      data, and the game list shows real games with working "View" links to
      `/analyzemaster?game=X`.
- [ ] Use the Master Games (Our DB) panel's own move filter — confirm it narrows the game list
      correctly and doesn't affect the Master Moves (Our DB) panel above it.
- [ ] Pick a position with no synced master game data — confirm both panels show the "No synced
      master games recorded from this position" empty state instead of erroring.
- [ ] Spot-check `/position/[id]` (the player-side `PositionDetail` page) still renders its W/L/D
      badges correctly after the `resultBadge` extraction.
- [ ] On `/analyze` (the player page), select a move — confirm the same two "Our DB" panels
      appear right after "Master Games (Lichess)", in the same relative position/styling as on
      `/analyzemaster`.
- [ ] Confirm both panels still auto-load and start open on both existing pages (default
      behavior unchanged) — `autoFetch`/`defaultOpen`/`limit`/`gameLinkBase` are opt-in for future
      call sites, not yet exercised by `MasterGameView.tsx`/`ChessBoardView.tsx`.
- [ ] On a very popular position (e.g. the starting position), confirm the game list caps at 50
      rows rather than fetching everything, and confirm game-row clicks still land on
      `/analyzemaster?game=X` (the unchanged default).
- [ ] Confirm both "Our DB" panels now appear *before* "Master Moves (Lichess)"/"Master Games
      (Lichess)" on both `/analyze` and `/analyzemaster`.
- [ ] In the Master Games (Our DB) panel, confirm the Result column shows `1-0`/`0-1`/`½-½` (not
      W/L/D), and the tracked master's own name (whichever side they played) is visibly bolded.
- [ ] Confirm both panels' fetch/loading/collapse behavior is unchanged after the `useLazyFetch`
      refactor (auto-loads on open, no console errors).
- [ ] Confirm both panels still work correctly after switching to `nextjs-shared/useLazyFetch`
      (post-`#reinstall`) — same behavior as the local version, no regressions from the added
      `error`/stale-request-guard logic.
- [ ] Function-headers sweep is comment-only (no logic changes) — verified via `npx tsc --noEmit`
      and `npm run build`, both clean. Spot-check a few converted files in the editor (e.g.
      `src/ui/board/ChessBoardView.tsx`, `src/lib/actions/sync.ts`, `src/app/analyze/page.tsx`) to
      confirm the new numbered header reads correctly and no duplicate/stray old header remains.
- [ ] Function-order sweep is a pure reordering pass (no logic changes, verified via
      `npx tsc --noEmit` and `npm run build`) — exercise the app's main flows to confirm nothing
      broke in practice: `/analyze` and `/analyzemaster` (board, move tree, Stockfish
      analysis/deep-analysis, master panels), `/graph`, `/habits`, `/openings`, `/endings`,
      `/owner/pipelinegames`, `/owner/pipelinemastergames`, `/owner/pipelinemasters`,
      `/owner/masterplayers`, `/owner/constants` (Functions tab), and `/owner` generally.
