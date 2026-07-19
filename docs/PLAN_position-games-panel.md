# PLAN_position-games-panel — chess

## Title
Games From This Position panel on the Analyze page

## Plan
- [x] Add `POSITION_GAMES_LIMIT` constant (50) to `src/lib/constants.ts`
- [x] Add `getGamesForPosition(fen, excludeGdid?)` to `src/lib/analysis/chessdb.ts` — looks up
      `tpos_positions` by truncated FEN, joins `tgam_game_positions` + `tgd_gamesdecon`, returns
      `{ player, move_played, move_num, cp_loss, result, gameId }[]` for every tracked game that
      reached this position (excluding `excludeGdid`), capped at `POSITION_GAMES_LIMIT`, ordered
      by `gam_gamid`
- [x] Add a new `MyBox title='Games From This Position'` panel to `ChessBoardView.tsx`, directly
      below the existing "Position Analysis" box — table columns: Player / Move / Result / CP /
      Game ID
- [x] Load the panel via a `useEffect` keyed on `[currentNode, tree, gdid]` (mirrors the existing
      move-count-badges effect) calling `getGamesForPosition` for whatever position is currently
      on the board — no button, loads automatically on every position change
- [x] Clicking a row navigates via `router.push('/analyze?game=...&user=...&from=...')` (same
      pattern as `PositionDetail.tsx`/`HomeDashboard.tsx`), swapping the board to that game

## Title (revision)
Two-panel redesign: per-move summary, then games for the clicked move

## Plan (revision)
- [x] Add `getMoveSummaryForPosition(fen)` to `src/lib/analysis/chessdb.ts` — FEN-keyed version of
      `getMovesForPosition`'s aggregation query (via `tpos_positions.pos_fen` lookup, like
      `getGamesForPosition` already does), unfiltered by player, returning `MoveRow[]`
- [x] Replace the "Games From This Position" panel's table with a "Moves From This Position"
      table — one row per move: Move / Times / Win% / Loss% / avg CP, loaded via a `useEffect`
      keyed on `[currentNode, tree]` calling `getMoveSummaryForPosition`
- [x] Add `selectedPositionMove` state; clicking a move row toggles it (click again to collapse),
      matching `PositionDetail.tsx`'s existing toggle pattern
- [x] Add a second panel, "Games — `<move>`", shown only when `selectedPositionMove` is set —
      filters the existing `positionGames` list (already fetched via `getGamesForPosition`,
      excluding the current game) down to rows where `move_played === selectedPositionMove`
- [x] Keep existing click-to-switch-game behavior on rows in the Games panel, unchanged

## Changes (revision)

### src/lib/analysis/chessdb.ts
- Added `getMoveSummaryForPosition(fen)` — FEN-keyed move aggregation (Times/Win/Loss/avg CP),
  unfiltered by player, reusing `MoveRow`.

### src/ui/board/ChessBoardView.tsx
- Added `moveSummary` and `selectedPositionMove` state, plus a `useEffect` (keyed on
  `[currentNode, tree]`) loading `getMoveSummaryForPosition` and resetting the selected move on
  every position change.
- Replaced the "Games From This Position" table with a "Moves From This Position" table (Move /
  Times / Win% / Loss% / CP); clicking a row toggles `selectedPositionMove`.
- Added a "Games — `<move>`" panel, shown only when a move is selected, filtering the existing
  `positionGames` list client-side by `move_played`; row click-to-switch-game behavior unchanged.

## Changes

### src/lib/constants.ts
- Added `POSITION_GAMES_LIMIT = 50`, the row cap for `getGamesForPosition`.

### src/lib/analysis/chessdb.ts
- Added `PositionGameHit` interface and `getGamesForPosition(fen, excludeGdid?)` — mirrors
  `getMovePlayCount`'s FEN-based `tpos_positions` lookup, joined to `tgam_game_positions` +
  `tgd_gamesdecon`, unfiltered by player (all tracked players), excluding the currently-open game.

### src/ui/board/ChessBoardView.tsx
- Added `positionGames` state and a `useEffect` (keyed on `[currentNode, tree, gdid]`) that loads
  `getGamesForPosition` for whatever position is on the board, independent of the engine-driven
  Position Analysis controls.
- Added a "Games From This Position" `MyBox` panel below "Position Analysis", listing Player /
  Move / Result / CP / Game ID; clicking a row with a `gameId` navigates via
  `router.push('/analyze?game=...&user=...&from=...')`, swapping the board to that game.

## Title (revision 2)
Shared win% (draws worth half), Loss% column removed

## Plan (revision 2)
- [x] Add `src/lib/winPct.ts` exporting `winPct(wins: number, losses: number, times: number): number`
      — rounded `(wins + 0.5×(times-wins-losses)) / times × 100`, draws inferred as
      `times - wins - losses` (no new DB fields needed)
- [x] `ChessBoardView.tsx` "Moves From This Position" table — drop the Loss% column, compute
      Win% via `winPct`
- [x] `PositionDetail.tsx` "Your Moves" tab — drop the Loss% column, compute Win% via `winPct`
- [x] `HabitsTable.tsx` — no Loss% column to remove; switch its Win% column from plain
      `wins/times` to `winPct` (import `move_losses`, already in `HabitRow` but currently unused)

## Changes (revision 2)

### src/lib/winPct.ts
- New file. `winPct(wins, losses, times)` — draws (`times - wins - losses`) count as half a
  point; rounded percentage. Shared by all three Win% displays below.

### src/ui/board/ChessBoardView.tsx
- "Moves From This Position" table: removed the Loss% column; Win% now computed via `winPct`.

### src/ui/analysis/PositionDetail.tsx
- "Your Moves" tab: removed the Loss% column; Win% now computed via `winPct`.

### src/ui/analysis/HabitsTable.tsx
- Win% column switched from plain `wins/times` to `winPct(wins, losses, times)`.
- Removed the now-unused local `pctLabel` helper (its only call site was this Win% column).

## Title (revision 3)
CP consistency (always "value of the position after the move") + good-and-bad Habits

## Plan (revision 3)
Full audit/rationale in `docs/CP_VALUE.md`. Manual SQL for `thab_habits.hab_resulting_pos_id`
given separately in chat (schema change — needs confirmation it ran before `#commit`).

CP consistency:
- [x] `MoveRow.mov_avg_cp` → `mov_result_cp` in `chessdb.ts` — `getMovesForPosition`,
      `getMoveSummaryForPosition`, and `getPositionDetail`'s move query all drop
      `AVG(gam_cp_change)` in favor of a direct `eva_cp` lookup of the move's resulting position
      (via `gam_resulting_pos_id` → `teva_evaluations`) — deterministic per (position, move), no
      aggregation needed
- [x] Drop `cp_loss` entirely — remove the field from `PositionGameHit`/`getGamesForPosition` and
      from `getPositionDetail`'s games array/`GameHit`; remove the CP column from
      `ChessBoardView.tsx`'s "Games — `<move>`" panel and `PositionDetail.tsx`'s "Game History" tab
      (redundant once CP is a per-move constant, already shown once in the parent row)
- [x] Remove the "Rating" column and the now-dead `cpBadge()` function from `PositionDetail.tsx`'s
      "Your Moves" tab — its BAD/POOR/OK/GOOD thresholds don't apply to absolute evals
- [x] Add nullable `thab_habits.hab_resulting_pos_id` (manual SQL, see chat) — populated by
      `buildHabits.ts` going forward (`(ARRAY_AGG(gp.gam_resulting_pos_id))[1]`, deterministic per
      group, same pattern already used there for `move_uci`/`move_num`)
- [x] `getHabitsData`'s displayed `move_cp` switches from `h.hab_move_cp` to a join through
      `h.hab_resulting_pos_id` → `teva_evaluations.eva_cp`; update `HabitsTable.tsx`'s CP tooltip
      text accordingly. `hab_move_cp` itself is unchanged, stays as the internal
      detection/sort/filter signal (see below)

Good and bad habits:
- [x] Remove `buildHabits.ts`'s `WHERE move_cp < 0` filter — both good and bad recurring moves get
      stored
- [x] Add a Bad/Good filter (default Bad) to `getHabitsData`/`getHabitsCount`/`buildHabitsFilter`
      (`AND h.hab_move_cp < 0` / `> 0`), wired through `HabitsTable.tsx` (new `FilterSelect`,
      matching the existing Color filter's pattern) and `src/app/habits/page.tsx` (new `quality`
      state, persisted to `sessionStorage` alongside the other filters)
- [x] Default sort switches to `ORDER BY ABS(hab_move_cp) DESC` ("Biggest impact first"), replacing
      `ASC` ("Worst first") — works the same regardless of which filter is selected
- [x] Rename the page heading "Blunder Habits" → "Habits"; update `HABITS_ITEMS` (`MyHelp` text)
      and the page-count label (`"N bad moves"` → quality-aware) to drop the bad-only framing

Docs:
- [x] Update `docs/CP_VALUE.md` once implemented — flip "Planned" sections to "Current", resolve
      the "materialize vs. derive `gam_cp_change`" open question as "kept materialized, unchanged"
      (no code change was made to that computation)

## Changes (revision 3)

### scripts/schema.sql
- Added nullable `thab_habits.hab_resulting_pos_id integer` (appended at the end — no reorder
  needed). Manual `ALTER TABLE` given in chat; user confirmed run before `#commit`.

### src/lib/analysis/chessdb.ts
- `MoveRow.mov_avg_cp` → `mov_result_cp`. `getMovesForPosition`, `getMoveSummaryForPosition`, and
  `getPositionDetail`'s move query rewritten as a subquery + `LEFT JOIN teva_evaluations` on the
  move's `gam_resulting_pos_id`, replacing `AVG(gam_cp_change)` — no aggregation, deterministic
  per (position, move).
- Removed `cp_loss` from `PositionGameHit`/`getGamesForPosition` and from `getPositionDetail`'s
  games array/return type — field and its `gam_cp_change` selection both dropped.
- `buildHabitsFilter`/`getHabitsData`/`getHabitsCount` gained a `quality: 'bad' | 'good'` option
  (`AND h.hab_move_cp < 0` / `> 0`, default `'bad'`). `getHabitsData`'s sort switched to
  `ORDER BY ABS(h.hab_move_cp) DESC NULLS LAST`. Displayed `move_cp` now comes from a new
  `LEFT JOIN teva_evaluations e2 ON e2.eva_pos_id = h.hab_resulting_pos_id` instead of
  `h.hab_move_cp` directly — that column stays as the internal filter/sort signal only.

### src/lib/analysis/buildHabits.ts
- Removed the outer `WHERE move_cp < 0` filter — both good and bad recurring moves are now
  aggregated and upserted.
- `HabitAggregate` gained `resultingPosId`; the select query now captures
  `(ARRAY_AGG(gp.gam_resulting_pos_id))[1] AS resulting_pos_id` (deterministic per group, same
  reasoning as `move_cp`); the insert/upsert now writes `hab_resulting_pos_id`.
- Log message changed from "aggregating bad-move habits" to "aggregating move habits".

### src/ui/board/ChessBoardView.tsx
- "Moves From This Position" table: `m.mov_avg_cp` → `m.mov_result_cp`.
- "Games — `<move>`" panel: removed the CP column (redundant once CP is a per-move constant
  already shown once in the parent row).

### src/ui/analysis/PositionDetail.tsx
- "Your Moves" tab: `m.mov_avg_cp` → `m.mov_result_cp`; removed the "Rating" column and the
  now-dead `cpBadge()` function (its thresholds don't apply to absolute evals).
- "Game History" tab: removed the CP column; `GameHit` lost `cp_loss`.

### src/ui/analysis/HabitsTable.tsx
- Added a `Quality` type/prop (`'bad' | 'good'`) and a new "Quality" filter column (`FilterSelect`,
  matching the existing Color filter's pattern), with a per-row Bad/Good badge (uniform per page,
  since the quality filter already makes every row homogeneous).
- CP tooltip text updated to "Stockfish's evaluation of the position after this move, white's
  perspective." Sort label "Worst first" → "Biggest impact first". Empty-state message and
  `colSpan` (10 → 11) updated for the new column.

### src/app/habits/page.tsx
- Added `quality` state (default `'bad'`), persisted to `sessionStorage` alongside the other
  filters, wired into `getHabitsData`/`getHabitsCount`/`HabitsTable`.
- Page heading "Blunder Habits" → "Habits"; `HABITS_ITEMS` help text and the page-count label
  updated to drop the bad-only framing.

### docs/CP_VALUE.md
- All "Planned" sections flipped to reflect the implemented state; the "materialize vs. derive
  `gam_cp_change`" open question resolved as "kept materialized, unchanged."
