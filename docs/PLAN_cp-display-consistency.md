# PLAN_cp-display-consistency — chess

## Title
CP display consistency — one shared formatCp function, pawns at 2 decimal places

## Plan
- [x] Create `src/lib/formatCp.ts` exporting `formatCp(cp: number): string` — pawns at 2 decimal
      places (`(cp / 100).toFixed(2)`), explicit `+`/`-` sign, with mate-in-N handling for
      `Math.abs(cp) >= 10000` (consolidating the pattern already present in 3 of the 4 duplicated
      `formatCp` implementations — folding it into the single function is the more correct
      behavior since mate-normalized scores can appear in `eva_cp` anywhere, including the one
      display, `HabitsTable.tsx`, that currently lacks mate handling)
- [x] Replace the 3 duplicated `formatCp()` definitions (`src/ui/board/MoveTree.tsx`,
      `src/ui/board/AlternativeLines.tsx`, `src/ui/board/ChessBoardView.tsx`) with an import from
      `src/lib/formatCp.ts`; remove the local copies
- [x] Replace `src/ui/analysis/HabitsTable.tsx`'s local `cpLabel()` with `formatCp()` (keep
      `cpClass()` as-is — that's just color, a separate concern from number formatting)
- [x] Convert the raw-centipawn-integer displays to use `formatCp()` instead of showing the bare
      integer:
      - `src/ui/analysis/PositionDetail.tsx`'s "Position CP" panel
      - `src/ui/analysis/PositionDetail.tsx`'s "Best move (`X` cp)" line
      - `src/ui/analysis/PositionDetail.tsx`'s "Your Moves" tab CP column (`mov_result_cp`)
      - `src/ui/board/ChessBoardView.tsx`'s "Moves From This Position" table CP column
        (`mov_result_cp`)
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision)
Show which move the current position is "after" on Position Analysis / Moves From This Position

## Plan (revision)
- [x] In `ChessBoardView.tsx`, derive a `currentMoveLabel` from `currentNode` — matching
      `MoveTree.tsx`'s existing move-number notation (`16.` for a White move, `16...` for a Black
      move): `${moveNum}${isWhite ? '.' : '...'} ${currentNode.san}` (e.g. `16. Ng6`), or
      `'Starting position'` when `currentNode` is `null` (root, no move played yet)
- [x] Append it to both boxes' titles: `title={`Position Analysis — ${currentMoveLabel}`}` and
      `title={`Moves From This Position — ${currentMoveLabel}`}`

## Title (revision 2)
Scope "list of games" panels to the current player, ordered by game number descending

## Plan (revision 2)
- [x] `chessdb.ts`'s `getGamesForPosition(fen, excludeGdid?)` → `getGamesForPosition(fen, player,
      excludeGdid?)` — add `AND d.gd_player = $N` filter; change `ORDER BY gp.gam_gamid` →
      `ORDER BY d.gd_gdid DESC` (game ID/"game number", latest first)
- [x] `ChessBoardView.tsx`'s call site: `getGamesForPosition(fen, gdid)` →
      `getGamesForPosition(fen, username, gdid)`
- [x] `chessdb.ts`'s `getPositionDetail(posId)` → `getPositionDetail(posId, player?)` — games query
      gains `AND d.gd_player = $2` (only applied when `player` is given) and switches
      `ORDER BY gp.gam_gamid` → `ORDER BY d.gd_gdid DESC`; `gameCount` query gains a join to
      `tgd_gamesdecon` (currently missing) plus the same player filter, so the displayed count
      matches the now-filtered games list rather than counting all tracked players
- [x] `HabitsTable.tsx`'s row click: `router.push('/position/${row.pos_id}')` →
      `router.push('/position/${row.pos_id}?player=${row.player}')`, so Position Detail knows
      which player's games to show
- [x] `src/app/position/[id]/page.tsx`: read `player` via `useSearchParams()`, pass to
      `getPositionDetail(posId, player ?? undefined)` — falls back to unfiltered (all tracked
      players) when no `player` param is present, for backward compatibility with direct links
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 3)
"Games — <move>" panel: show move number instead of Player, add Date/Opp Rating/Termination

## Plan (revision 3)
- [x] `PositionGameHit` (`chessdb.ts`) gains `date: string | null`, `opponentRating: number | null`,
      `termination: string | null`
- [x] `getGamesForPosition`'s query adds `TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS
      game_date`, `d.gd_opponent_rating`, `d.gd_termination` to the SELECT list; mapping populates
      the 3 new fields (scoped to just this one panel — `getPositionDetail`'s Game History tab is
      untouched by this revision)
- [x] `ChessBoardView.tsx`'s "Games — `<move>`" table: remove the Player column (every row is
      already the same player, per revision 2); add a Move column showing `${g.move_num}.
      ${selectedPositionMove}` (per-row move number, since the same position can be reached at
      different move numbers via transposition); add Date, Opp Rating, and Termination columns.
      New column order: Move / Result / Date / Opp Rating / Termination / Game
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 4)
"Games — <move>" panel: move the move number into the header, out of a per-row column

## Plan (revision 4)
- [x] `ChessBoardView.tsx`'s "Games — `<move>`" `MyBox` title: instead of the bare
      `selectedPositionMove` SAN, show the move number for the move about to be played from the
      *current* board position (not each row's own possibly-differing `move_num`) — same notation
      as `currentMoveLabel`/`MoveTree.tsx` (`16.`/`16...`), computed from `currentPly` treating the
      selected move as the next ply: `nextMoveNum = Math.floor(currentPly / 2) + 1`,
      `nextIsWhite = currentPly % 2 === 0`. Title becomes e.g. `Games — 8. Nbd2`
- [x] Remove the Move column from the table body entirely (every row is the same move already
      named in the title; `move_num` stays in `PositionGameHit`/the query, just unused in this
      render — still legitimate per-game data, not dead code)
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 5)
Label consistency: absolute evaluations say "Eval", never "CP"

## Plan (revision 5)
Per `docs/CP_VALUE.md`, every value currently displayed under a "CP" label is convention #1 (an
absolute Stockfish evaluation) — never a delta. Since that's the only kind ever shown, every
existing "CP" label becomes "Eval" (no display currently needs a "CP Change" label, but that's the
name to use if a delta is ever surfaced later).
- [x] `HabitsTable.tsx`: column headers `"Pos CP"` → `"Pos Eval"`, `"CP"` → `"Eval"`
- [x] `PositionDetail.tsx`: `"Position CP"` label → `"Position Eval"`; `"CP"` column header (Your
      Moves tab) → `"Eval"`
- [x] `ChessBoardView.tsx`: `"CP"` column header (Moves From This Position) → `"Eval"`
- [x] `src/app/habits/page.tsx`: `HABITS_ITEMS` help heading `"CP column"` → `"Eval column"`
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 6)
New pipeline step: evaluate each game's actual final position, store on tgd_gamesdecon

## Plan (revision 6)
Feasibility verified: `tgd_gamesdecon.gd_pgn` already holds the full game PGN (not capped at
`MAX_ANALYSIS_MOVE`, unlike the position-tree pipeline), `chess.js` can replay it to the true final
FEN, and the existing `StockfishEngineBase`/`StockfishProcess`/`StockfishWasm` classes in
`enrichPositionsStockfish.ts` already provide `evaluate(fen, depth)`. This is a genuinely new,
independent pipeline step (step 8) — not derived from or gated by the position-tree/purge pipeline.
Endings-tab display of this data is explicitly **out of scope** — separate plan, after this commits.

- [x] `scripts/schema.sql`: add `gd_final_eval integer` (nullable) to `tgd_gamesdecon`'s `CREATE
      TABLE`, appended at the end (manual `ALTER TABLE tgd_gamesdecon ADD COLUMN gd_final_eval
      integer;` given in chat for the user to run — no backfill needed, nullable, populated by
      this new step going forward and via reprocessing existing games)
- [x] `enrichPositionsStockfish.ts`: new exported `evaluateGameEndings(opts: { limit?, depth?,
      level?, forceNewRun? })` — selects games `WHERE gd_pgn IS NOT NULL AND gd_final_eval IS
      NULL` (batch-limited via `opts.limit ?? DEFAULT_BATCH_SIZE`); per game, loads the PGN into a
      `Chess` instance, takes `.fen()` as the true final position, evaluates it via the existing
      Stockfish engine classes, normalizes to White's perspective from the final position's side
      to move (same pattern as `enrichPositionsStockfish`'s existing normalization), `UPDATE
      tgd_gamesdecon SET gd_final_eval = $1 WHERE gd_gdid = $2`. Malformed-PGN games are skipped
      and counted as errors (same try/catch pattern as `getPositionsFromGame`). Logs via
      `logPipelineStep({ step: 8, subStep: 'a', stepName: 'Evaluate Game Endings', ... })`
- [x] New route `src/app/api/analysis/evaluate-game-endings/route.ts`, mirroring
      `evaluate-positions/route.ts` exactly (`limit`/`depth`/`newRun` query params)
- [x] `vercel.json`: new cron entry, next in the existing 20-minute cadence:
      `{ "path": "/api/analysis/evaluate-game-endings?limit=200&depth=16", "schedule": "20 5 * * *" }`
- [x] `pipelineStatus.ts`: new `refreshGameEndingsStatus(): Promise<{ evaluated: number; remaining:
      number }>`, mirroring `refreshStep4` (`evaluated` = `COUNT(*) WHERE gd_final_eval IS NOT
      NULL`, `remaining` = `COUNT(*) WHERE gd_pgn IS NOT NULL AND gd_final_eval IS NULL`)
- [x] `pipelineLog.ts`'s `getPipelineRates()`: add `step8` (mirrors `step4`/`step5`'s incremental
      rate pattern — Build Habits/step 7 has no rate since it's a full recompute, but this new step
      is incremental like Evaluate Positions, so a rate/ETA applies)
- [x] `src/app/owner/pipeline/page.tsx`: new `JOB_GROUPS` step 8 entry (`schedule: '5:20am'`), new
      status state + refresh function, new handler `handleEvaluateGameEndings`, new `MyBox` block
      mirroring the "5. Evaluate Positions" block (including `MyHelpStep` documentation and a
      status SQL constant), wired into `handleRunAll` and `doRefreshAll`
- [x] `src/ui/analysis/PipelineHelp.tsx`: new `STEPS` entry for step 8 (title, input, processing,
      output), matching the pattern of the existing 7 entries
- [x] `chessdb.ts`: `PositionGameHit` gains `finalEval: number | null`; `getGamesForPosition`'s
      query adds `d.gd_final_eval`; mapping populates it
- [x] `ChessBoardView.tsx`'s "Games — `<move>`" table: add a "Final Eval" column showing
      `formatCp(g.finalEval)` (or `'—'` if null)
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Title (revision 7)
Speed up the historic backfill: reuse existing evals, drop dead filter, concurrent Stockfish locally

## Plan (revision 7)
Three real design gaps found in revision 6's implementation, all fixed here:

1. **Redundant Stockfish calls.** Many games end within the first `MAX_ANALYSIS_MOVE` (16) moves
   (quick checkmates/resignations) — their *actual final position* is already tracked in
   `tpos_positions`/`teva_evaluations`. Re-running Stockfish for those is pure waste. Fix: before
   evaluating, do an exact-FEN lookup (`truncateFen` of the replayed final position, matched
   against `tpos_positions.pos_fen`) and reuse `teva_evaluations.eva_cp` directly if found — no
   Stockfish call at all for that game. Only falls back to a fresh Stockfish call when no exact
   match exists (the common case for games running past move 16). This preserves the column's
   actual meaning ("eval when the game truly ended") — it's not the same as reusing the *last
   tracked* position's eval as an approximation, which would silently redefine the column as
   "eval around move 16" for most games.
2. **Dead filter.** `deconstructGames` (`deconstruct.ts:101-105`) already skips any raw game with
   no PGN before it's ever written to `tgd_gamesdecon` — confirmed by reading the code. So
   `gd_pgn IS NOT NULL` can never be false for an existing row; drop it from every query that has
   it (`getGamesNeedingFinalEval`, the remaining-count query, `refreshGameEndingsStatus`,
   `SQL_STATUS_GAME_ENDINGS`).
3. **No concurrency.** Confirmed running locally with `STOCKFISH_PATH` set (native binary, real
   OS processes) — only the fresh-Stockfish-call subset (after the reuse pass above) runs through
   multiple concurrent `StockfishProcess` instances instead of one at a time, a genuine speedup
   bounded by CPU cores. (The WASM path stays single-instance — `lite-single` is explicitly
   single-threaded with no worker-thread offload, so parallel WASM instances wouldn't actually run
   concurrently, just interleave on one thread.)

- [x] `constants.ts`: add `GAME_ENDINGS_CONCURRENCY = 4` — number of concurrent Stockfish
      processes for the fresh-evaluation fallback (native-binary path only)
- [x] `getGamesNeedingFinalEval`: drop `gd_pgn IS NOT NULL`; add `ORDER BY gd_gdid DESC` (latest
      games populated first)
- [x] New `findExistingEval(truncatedFen, level)`: `SELECT e.eva_cp FROM tpos_positions p JOIN
      teva_evaluations e ON e.eva_pos_id = p.pos_id WHERE p.pos_fen = $1 AND e.eva_cp IS NOT NULL`
- [x] `evaluateGameEndings` restructured into two phases:
      - **Phase 1 (reuse, sequential — cheap DB lookups only, no engine)**: for every fetched game,
        replay the PGN, keep both the full 6-field final FEN (for Stockfish) and its `truncateFen`
        (for the lookup key); call `findExistingEval`; if found, `UPDATE ... gd_final_eval` directly
        and count it under a new `reused` counter; otherwise queue `{ gdid, fen }` for phase 2.
      - **Phase 2 (fresh evaluation, concurrent)**: skipped entirely if the queue is empty. Spins up
        `binPath ? GAME_ENDINGS_CONCURRENCY : 1` engine instances (`StockfishProcess`/`StockfishWasm`,
        matching the existing constructor pattern), round-robins the queue across them, and runs all
        instances' work via `Promise.all` — each instance evaluates its own subset sequentially, same
        per-item try/catch/error-counting as today.
      - Return type gains `reused: number` alongside `processed`/`errors`/`remaining`
        (`processed` = total rows updated, reused + freshly evaluated)
- [x] `evaluate-game-endings/route.ts`: passes through the new `reused` field in its JSON response
- [x] `pipelineStatus.ts` / `src/app/owner/pipeline/page.tsx`'s `SQL_STATUS_GAME_ENDINGS`: drop the
      now-dead `gd_pgn IS NOT NULL` clause
- [x] Pipeline page's result line for step 8: include the reused count, e.g. `"Done — N evaluated
      (M reused from tracked positions), E errors"`
- [x] Update the `MyHelpStep`/`PipelineHelp.tsx` processing text for step 8 to describe the
      reuse-first, then-concurrent-fallback design
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) to confirm no regressions

## Changes

### src/lib/formatCp.ts (new)
- `formatCp(cp: number): string` — pawns at 2 decimal places, explicit `+`/`-` sign, mate-in-N
  handling for `Math.abs(cp) >= 10000`. Single shared implementation replacing 4 duplicated ones.

### src/ui/board/MoveTree.tsx
- Removed local `formatEval()` (functionally identical to the other 3 duplicates, just differently
  named); both call sites now use the imported `formatCp()`.

### src/ui/board/AlternativeLines.tsx
- Removed local `formatCp()`; now imports it from `@/src/lib/formatCp`.

### src/ui/board/ChessBoardView.tsx
- Removed local `formatCp()` (was previously unused/dead in this file); now imports the shared one
  and uses it for the "Moves From This Position" table's CP column (was showing the raw integer).
- Added `getCurrentMoveLabel(currentNode, currentPly)` helper — `"16. Ng6"` / `"16...Ng6"` for the
  position currently on the board, `"Starting position"` at the root — and a `currentMoveLabel`
  derived value using it.
- "Position Analysis" and "Moves From This Position" box titles now append
  ` — ${currentMoveLabel}`.

### src/ui/analysis/HabitsTable.tsx
- Removed local `cpLabel()` (1-decimal, no mate handling); both CP columns (`Pos CP`, `CP`) now
  use the shared `formatCp()`. `cpClass()` (color only) left unchanged.

### src/ui/analysis/PositionDetail.tsx
- "Position CP" panel, "Best move (`X` cp)" line, and "Your Moves" tab's CP column all switched
  from displaying the raw centipawn integer to `formatCp()`.

### src/lib/analysis/chessdb.ts
- `getGamesForPosition(fen, excludeGdid?)` → `getGamesForPosition(fen, player, excludeGdid?)` —
  added `AND d.gd_player = $2`; ordering switched from `gp.gam_gamid` to `d.gd_gdid DESC`.
- `getPositionDetail(posId)` → `getPositionDetail(posId, player?)` — its games query gains an
  optional `AND d.gd_player = $N` filter and the same `d.gd_gdid DESC` ordering; its `gameCount`
  query gains a `tgd_gamesdecon` join (previously counted from `tgam_game_positions` alone) plus
  the same optional player filter, so the displayed count matches the games list.

### src/ui/board/ChessBoardView.tsx (revision 2)
- "Games From This Position" effect now calls `getGamesForPosition(fen, username, gdid)`
  (`username` added to the effect's dependency array).

### src/ui/analysis/HabitsTable.tsx (revision 2)
- Row click now navigates to `/position/${row.pos_id}?player=${row.player}`.

### src/app/position/[id]/page.tsx
- Reads `player` from `useSearchParams()`, passes it to `getPositionDetail(posId, player)`.

### src/lib/analysis/chessdb.ts (revision 3)
- `PositionGameHit` gains `date`, `opponentRating`, `termination`.
- `getGamesForPosition`'s query adds `TO_CHAR(TO_TIMESTAMP(d.gd_end_time), 'YYYY-MM-DD') AS
  game_date`, `d.gd_opponent_rating`, `d.gd_termination`; mapping populates the 3 new fields.

### src/ui/board/ChessBoardView.tsx (revision 3)
- "Games — `<move>`" table: removed the Player column; added a Move column
  (`${g.move_num}. ${selectedPositionMove}`, per-row since transposition can vary the move
  number), plus Date, Opp Rating, and Termination columns. New order: Move / Result / Date /
  Opp Rating / Termination / Game.

### src/ui/board/ChessBoardView.tsx (revision 4)
- Added `getNextMoveLabel(currentPly, san)` helper (the mirror-image of `getCurrentMoveLabel` —
  labels the move about to be played, not the one that led here).
- "Games — `<move>`" `MyBox` title now shows `Games — 8. Nbd2` (computed from the live board
  position) instead of the bare SAN; removed the per-row Move column entirely (`move_num` stays
  in `PositionGameHit`/the query, just unused in this particular render).

### src/ui/analysis/HabitsTable.tsx (revision 5)
- Column headers: `"Pos CP"` → `"Pos Eval"`, `"CP"` → `"Eval"`.

### src/ui/analysis/PositionDetail.tsx (revision 5)
- `"Position CP"` label → `"Position Eval"`; `"CP"` column header (Your Moves tab) → `"Eval"`.

### src/ui/board/ChessBoardView.tsx (revision 5)
- `"CP"` column header (Moves From This Position) → `"Eval"`.

### src/app/habits/page.tsx (revision 5)
- `HABITS_ITEMS` help heading `"CP column"` → `"Eval column"`.

### scripts/schema.sql (revision 6)
- Added nullable `gd_final_eval integer` to `tgd_gamesdecon`. Manual `ALTER TABLE` given in chat;
  user confirmed run.

### src/lib/analysis/enrichPositionsStockfish.ts (revision 6)
- New `getGamesNeedingFinalEval()` (private) and exported `evaluateGameEndings(opts)` — replays
  each game's full PGN with `chess.js` to its true final position (not capped at
  `MAX_ANALYSIS_MOVE`), evaluates it with the existing Stockfish engine classes, normalizes to
  white's perspective, and writes `tgd_gamesdecon.gd_final_eval`. Independent of
  `tpos_positions`/`tgam_game_positions` entirely. Logs via `logPipelineStep` step 8.

### src/app/api/analysis/evaluate-game-endings/route.ts (new)
- Mirrors `evaluate-positions/route.ts` exactly (`limit`/`depth`/`newRun` query params).

### vercel.json (revision 6)
- New cron entry: `evaluate-game-endings?limit=200&depth=16` at `20 5 * * *` (next in the existing
  20-minute cadence after Build Habits).

### src/lib/actions/pipelineStatus.ts (revision 6)
- New `refreshGameEndingsStatus()` — `evaluated`/`remaining` counts against `tgd_gamesdecon`
  directly.

### src/lib/actions/pipelineLog.ts (revision 6)
- `getPipelineRates()` gained `step8` (same incremental-rate pattern as `step4`/`step5`).

### src/app/owner/pipeline/page.tsx (revision 6)
- New `JOB_GROUPS` step 8 entry (`Evaluate Game Endings`, `5:20am`), new status state
  (`sGameEndings`/`sGameEndingsLoading`) and refresh function, new `handleEvaluateGameEndings`
  handler, new `SQL_STATUS_GAME_ENDINGS` constant, new `MyBox` block (mirrors the "5. Evaluate
  Positions" block including `MyHelpStep` docs), wired into `handleRunAll` and `doRefreshAll`.

### src/ui/analysis/PipelineHelp.tsx (revision 6)
- New `STEPS` entry for step 8, matching the existing 7 entries' shape.

### src/lib/analysis/chessdb.ts (revision 6)
- `PositionGameHit` gains `finalEval: number | null`; `getGamesForPosition`'s query adds
  `d.gd_final_eval`; mapping populates it.

### src/ui/board/ChessBoardView.tsx (revision 6)
- "Games — `<move>`" table: added a "Final Eval" column showing `formatCp(g.finalEval)` (or `'—'`).

### src/lib/constants.ts (revision 7)
- Added `GAME_ENDINGS_CONCURRENCY = 4` — concurrent Stockfish process count for the
  fresh-evaluation fallback (native-binary path only).

### src/lib/analysis/enrichPositionsStockfish.ts (revision 7)
- `getGamesNeedingFinalEval`: dropped the dead `gd_pgn IS NOT NULL` check (confirmed via
  `deconstructGames` that a PGN-less game is never written to `tgd_gamesdecon`); added
  `ORDER BY gd_gdid DESC` so the latest games populate first.
- New `findExistingEval(truncatedFen, level)` — exact-FEN lookup against
  `tpos_positions`/`teva_evaluations`.
- `evaluateGameEndings` restructured into two phases: Phase 1 (sequential) replays each game,
  checks `findExistingEval` for its truncated final FEN, and reuses that `eva_cp` directly when
  found (no Stockfish call) — common for games that ended within the tracked move range. Phase 2
  spins up `binPath ? GAME_ENDINGS_CONCURRENCY : 1` engine instances, round-robins whatever wasn't
  reused across them, and runs them concurrently via `Promise.all`. Return type gained
  `reused: number`. Remaining-count query also dropped the dead `gd_pgn IS NOT NULL` clause.

### src/lib/actions/pipelineStatus.ts (revision 7)
- `refreshGameEndingsStatus()`: dropped the dead `gd_pgn IS NOT NULL` clause from the `remaining`
  count.

### src/app/owner/pipeline/page.tsx (revision 7)
- `SQL_STATUS_GAME_ENDINGS`: dropped the dead `gd_pgn IS NOT NULL` clause.
- `gameEndingsResult` state gained `reused`; the result line now reads "Done — N evaluated (M
  reused from tracked positions), E errors".

### src/ui/analysis/PipelineHelp.tsx (revision 7)
- Step 8's `processing` text rewritten to describe the reuse-first, then-concurrent-fallback
  design and the latest-games-first ordering.
