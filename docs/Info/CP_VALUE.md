# CP Value — how centipawn evaluations work in this app

Cross-cutting reference for every place a centipawn ("CP") value is stored or shown. Complements
[Dataflow.md](Dataflow.md), which documents each table's pipeline flow — this doc instead follows
one concept (CP) across every table and function that touches it, since it doesn't otherwise live
in one place.

**Status of this document**: written 2026-07-19, updated the same day once the CP-consistency and
good/bad-habits plan below was implemented. Everything in this doc reflects the current state of
the code.

## The two conventions (Current)

Every CP value in the app is one of exactly two things. Nothing else should ever be introduced
without extending this doc.

1. **Absolute position evaluation** — Stockfish's assessment of *one exact position*, always
   normalized to **White's perspective**: positive = good for White, negative = good for Black,
   regardless of whose move it is. Source of truth: `teva_evaluations.eva_cp`.
2. **Move delta ("cp_change")** — the swing caused by *one move*, always from the **mover's
   perspective**: positive = good for whoever played it, whether White or Black. Computed as
   `pos_color='w' ? eva_cp(after) - eva_cp(before) : eva_cp(before) - eva_cp(after)`. This is
   never displayed to the user under a "CP" label — it's an internal signal for detecting bad/good
   moves (blunder/mistake/inaccuracy classification, Habits detection and sorting).

**The rule going forward**: any value labeled "CP" in the UI is always convention #1 — specifically,
*the absolute evaluation of the position resulting from playing that move*. Never a delta, never an
average, never a "loss" magnitude. If a delta is genuinely needed (classification, sorting,
detection), it's computed and used internally, named `cp_change`, and never surfaced as a "CP"
number.

## Database columns

### `teva_evaluations.eva_cp` (integer, nullable) — Current, unchanged

Absolute Stockfish evaluation of one position, White's-perspective. The one true source for
convention #1.

- **Written by**: `enrichPositionsStockfish.ts`'s `saveEvaluation()` (batch pipeline "Evaluate
  Positions" step; normalizes raw engine output via `fenColor==='b' ? -rawCp : rawCp`).
  `upgradePositionEvaluation()` in `chessdb.ts` (interactive merge-back from live Position
  Analysis on the Analyze page — only upgrades if the new depth exceeds what's stored).
- **Read by**: `getEvaluationForPosition`; `getHabitsData` (as `pos_cp`, the position *before* the
  move); `getPositionDetail` (`posEval`); `upgradePositionEvaluation` and `bulkUpdateCpLoss`
  (read before+after to compute `gam_cp_change`); pipeline bookkeeping
  (`countRemainingPositions`, `getResultingFensToEvaluate`).

### `tgam_game_positions.gam_cp_change` (integer, nullable) — Current

The move-delta convention (#2), mover's-perspective.

- **Written by**: `bulkUpdateCpLoss` (batch "Update CP Change" pipeline step) and
  `upgradePositionEvaluation` (interactive) — identical formula, consistent with each other.
  Deliberately mover's-perspective, not White's — see "Open decisions, resolved" below.
- **Read by**: `buildHabits.ts` (picks the single worst-magnitude occurrence into `hab_move_cp`,
  and the sign drives Habits' Bad/Good filter); `pipelineStatus.ts` (counts remaining `NULL` rows
  for pipeline progress, not a displayed value). No longer read for direct UI display anywhere —
  `getMovesForPosition`/`getMoveSummaryForPosition`/`getPositionDetail`'s move query now compute
  `mov_result_cp` via a direct `eva_cp` lookup of the move's resulting position instead of
  `AVG(gam_cp_change)` (no aggregation needed — every game sharing a move from a position reaches
  the identical resulting position), and `getGamesForPosition`/`getPositionDetail`'s games array no
  longer select it at all (the old `cp_loss` field is gone — redundant once CP is a per-move
  constant already shown once in the parent row).

### `thab_habits.hab_move_cp` (numeric(6,2), nullable) — Current

The single largest-magnitude `gam_cp_change` occurrence for a (player, position, move) triple,
clamped to ±`HABITS_MOVE_CP_CLAMP`.

- **Written by**: `buildHabits.ts` — for both good and bad recurring moves (the old
  `WHERE move_cp < 0` filter was removed; "Habits" is no longer synonymous with "blunders").
- **Read by**: `getHabitsData`/`getHabitsCount` — as the internal detection/sort/filter signal
  only, never displayed directly. The Bad/Good filter (`quality` option, default `'bad'`) reads its
  sign (`hab_move_cp < 0` / `> 0`); the default sort is `ORDER BY ABS(hab_move_cp) DESC`
  ("Biggest impact first" in the UI), which works the same regardless of which filter is active.
  The displayed "CP" column instead comes from a join through `hab_resulting_pos_id` (new nullable
  column, populated by `buildHabits.ts`, deterministic per position+move) → `teva_evaluations.eva_cp`.

### `tgev_game_evals.gev_cp` / `.gev_cp_change` (both integer, nullable) — Current, unchanged

Per-move evals for the *currently open game only* (the Analyze page's whole-game "Game Analysis"
batch run) — entirely separate pipeline from the positions/habits system above, keyed by
`(gdid, ply)`, no `tpos_positions`/`teva_evaluations` involvement.

- `gev_cp` = `MoveEvaluation.cp` — absolute White's-perspective eval **after** that ply's move.
  Already matches convention #1 exactly.
- `gev_cp_change` = `MoveEvaluation.cpChange` — mover's-perspective delta (convention #2), feeding
  `cpLoss`/blunder-mistake-inaccuracy classification and the board's colored-square highlighting.
- **Written/read by**: `saveGameEvaluations()` / `getGameEvals()` in `games.ts`.
- Live blunder/mistake/inaccuracy detection for the open game (`classifyMove`, `CLASSIFICATION_SQUARE_COLORS`
  in `ChessBoardView.tsx`, the "Game Analysis" summary counts) stays exactly as-is — it's inherently
  a delta comparison with no absolute-eval equivalent, and is explicitly out of scope for the
  CP-consistency changes above.

### `tqui_quiz.qui_cp_change` (integer, nullable) — dead, unused

Zero references anywhere in `src/`. Leftover from the `next-chess-analysis` fork's Quiz feature,
never ported into this consolidated project. Not part of the live CP system.

## Application-level (non-DB) CP fields — Current, unchanged

Defined in `src/lib/stockfish.ts`, the origin of everything written into the DB columns above:

- `MoveEvaluation.cp` / `cpBefore` — convention #1 (absolute, after/before the move). Source for
  `teva_evaluations.eva_cp` and `tgev_game_evals.gev_cp` writes.
- `MoveEvaluation.cpChange` / `cpLoss` / `classification` — convention #2 (mover's-perspective
  delta) plus the derived non-negative "how bad" magnitude and blunder/mistake/inaccuracy label.
  Source for `tgam_game_positions.gam_cp_change` and `tgev_game_evals.gev_cp_change`; also drives
  `ChessBoardView.tsx`'s live square-highlighting and Game Analysis counts, entirely in-memory for
  the open game.
- `MultiPvResult.cp` (deep analysis / `AlternativeLines.tsx`) — convention #1 (each candidate
  line's eval is the position after playing it). Persisted into `teva_evaluations.eva_cp` only
  when its top line completes, via `upgradePositionEvaluation`.

## Open decisions, resolved

**Mover's-perspective, not White's, for `gam_cp_change`.** The delta exists to answer "was this
move bad for whoever played it" — inherently mover-relative. White's-perspective would make
"negative = bad" stop being universally true (a great move by Black would show negative), pushing
color-awareness onto every consumer instead of resolving it once at the source.

**`gam_cp_change` stays a materialized column**, not computed live from a
`eva_cp(before)`/`eva_cp(after)` join. It's fully derivable — no new information lives in the
stored column, it's a cache — but `buildHabits.ts`'s aggregation runs over a large row count and a
live join adds real per-row cost; `thab_habits` itself already exists for the identical reason
("rather than live-aggregating `tgam_game_positions` on every request"); and the dedicated
`bulkUpdateCpLoss` / "Update CP Change" pipeline step uses `gam_cp_change IS NULL` as its own
completeness/scheduling signal, which a computed-on-the-fly column wouldn't provide. No code
changed here — this is the pre-existing design, confirmed rather than altered.

## Naming rule, going forward

- "CP" always means convention #1 — the absolute evaluation of a specific position, White's
  perspective, no exceptions.
- Never name a field `cp_loss` for a value that can be positive — if it's a signed delta, call it
  `cp_change`.
- Never aggregate/average CP across games for a fixed (position, move) pair — it's deterministic
  (every game sharing a move from a position reaches the identical resulting position), so an
  "average" is always just that one value with extra steps. Look it up directly instead.
