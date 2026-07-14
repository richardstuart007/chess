# PLAN_remove-gam-player-columns — chess

## Title
tgam_game_positions cleanup: remove redundant columns, fix pos_reached double-count, record both plies, redesign purge

## Plan
- [x] In `src/lib/analysis/buildPositionTree.ts`: drop the `player` and `result` fields from
      `GameRecord`/`PositionRecord`, stop selecting `d.gd_player AS player` /
      `d.gd_player_result AS result` in the game-fetch query, and remove `gam_player`/
      `gam_player_result` from the `insertGamePositions` INSERT column list and params
- [x] In `src/lib/analysis/chessdb.ts`, switch every read of `gam_player` / `gam_player_result` to
      join `tgd_gamesdecon d ON d.gd_gdid = gam_gdid` and read `d.gd_player` / `d.gd_player_result`
      instead: `getMovesForPosition` (player filter + win/loss counts), `getHabitsData` (player
      filter + win/loss counts), `getPositionDetail`'s move-breakdown query (win/loss counts) and
      games query (already joins `tgd_gamesdecon` — just switch the two selected columns)
- [x] Remove the `gam_player` and `gam_player_result` column definitions and the `idx_tgam_player`
      index from `scripts/schema.sql`
- [x] Provide DROP COLUMN SQL in chat for the user to run manually via pgAdmin4:
      `ALTER TABLE tgam_game_positions DROP COLUMN gam_player;`
      `ALTER TABLE tgam_game_positions DROP COLUMN gam_player_result;`
      (drops `idx_tgam_player` automatically as a dependent index)
- [x] Fix `pos_reached` double-counting: change `recomputePosReachedByIds`
      (`src/lib/analysis/buildPositionTree.ts`) to compute a single
      `COUNT(DISTINCT gam_gdid)` over the union of the before/resulting match conditions
      (`OR`, not two independently-summed subqueries)
- [x] Provide one-time recompute SQL in chat for the user to run manually via pgAdmin4, to correct
      existing `pos_reached` values for all already-processed positions using the fixed logic
- [x] Update the `tgam_game_positions` Rules/gotchas bullet in `docs/Dataflow.md` to reflect the
      bug is fixed, and remove the resolved "pos_reached double-counting bug" entry from the
      Outstanding items section of `.claude/CLAUDE.md`
- [x] Widen `tgam_game_positions` to record both plies going forward (not just the tracked
      player's own move): in `getPositionsFromGame` (`buildPositionTree.ts`), drop the
      `color === game.playerColor` condition so every ply in the analysis window is recorded.
      Only applies to games synced after this change ships — the user is separately backfilling
      already-processed game history, no reprocessing step included here.
- [x] In `src/lib/analysis/chessdb.ts`'s `getHabitsData` (the Habits page — must stay scoped to
      the tracked player's own moves now that opponent plies share the same table), add
      `AND p.pos_color = CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END` to the
      WHERE clause. `getPositionDetail` and `getMovesForPosition` are intentionally left
      unfiltered by mover — they show all recorded activity at a position, not just one player's.
- [x] Update the `tgam_game_positions` Purpose/Processing section of `docs/Dataflow.md` — it
      currently states "Each row captures one ply — the tracked player's own turn only," which
      becomes inaccurate once both plies are recorded
- [x] Remove dead `pos_ply_count` handling: delete the `pos_ply_count` field from `PositionRow`
      and both `getPositionsToEvaluate` SELECTs, and delete the dead `upsertPosition` function
      entirely (`src/lib/analysis/chessdb.ts`) — it's the only thing that ever wrote the column
      and has no callers
- [x] Remove the `pos_ply_count` column definition from `scripts/schema.sql`
- [x] Provide DROP COLUMN SQL in chat for the user to run manually via pgAdmin4:
      `ALTER TABLE tpos_positions DROP COLUMN pos_ply_count;`
- [x] Update the `tpos_positions` Rules/gotchas bullet in `docs/Dataflow.md` — remove the
      "`pos_ply_count` is unused/NULL" note since the column and `upsertPosition` are gone
- [x] Fix `purgeStaleReachOnePositions`'s row-cap bug (`src/lib/analysis/purgePositions.ts`):
      `PURGE_ROW_CAP` was applied as a `LIMIT` on the seed query *before* candidate refinement,
      which could arbitrarily sever a candidate from a dependency the refinement logic needed to
      correctly decide whether either was safe to delete — causing a capped run to purge far fewer
      positions than a full (uncapped) computation would allow, and observed live (44 purged vs.
      61,306 eligible). Fix: seed uncapped, refine to a stable fixpoint (extracted into a
      `refineWorkfile` helper, correctness pass), cap to `PURGE_ROW_CAP` by `DELETE ... WHERE
      pur_pos_id NOT IN (... ORDER BY pur_pos_id LIMIT PURGE_ROW_CAP)`, then refine again (safety
      pass, repairs any dependency the cap broke) before the delete phase runs
- [x] Add `idx_tpur_pos_id` (btree on `pur_pos_id`) to `scripts/schema.sql` for `tpur_workfile` —
      already created manually via pgAdmin4 during live debugging (the refinement query's
      correlated subquery was doing full table scans without it, causing multi-minute stalls at
      the ~1.18M-row candidate scale introduced by the both-ply backfill); this step just brings
      the schema file in sync with what's already live
- [x] Rewrite the purge seed query's `(g.gam_pos_id = p.pos_id OR g.gam_resulting_pos_id =
      p.pos_id)` condition as two separate `AND`ed `NOT EXISTS` checks, in all three places it
      appears — `purgeStaleReachOnePositions`'s seed query (`purgePositions.ts`),
      `refreshPurgeStatus`'s candidate query (`pipelineStatus.ts`), and the display-only
      `SQL_STATUS_PURGE` string (`owner/pipeline/page.tsx`) — so each half can use its own
      single-column index (`idx_tgam_pos_id` / `idx_tgam_resulting_pos_id`) instead of forcing the
      planner to reconcile an OR across two different indexed columns. Pure performance rewrite,
      no semantic change (`NOT EXISTS(A OR B)` ≡ `NOT EXISTS(A) AND NOT EXISTS(B)`)
- [x] Redesign `purgeStaleReachOnePositions` (`purgePositions.ts`) to replace the fixpoint
      refinement loop with the simpler two-reference rule already documented in
      `.claude/CLAUDE.md`'s "before/resulting position pair" lesson — full-delete a row when its
      *before* reference is a candidate; null out just the *resulting* reference otherwise, keep
      the row. New flow: seed candidates into `tpur_workfile` (same reach/age query, OR-rewrite
      already applied) with `PURGE_ROW_CAP` restored as a plain `LIMIT` on the seed (safe now —
      no cross-candidate dependency exists to break, unlike the old refinement-based design) →
      `DELETE FROM tgam_game_positions WHERE gam_pos_id IN (candidates)` → `UPDATE
      tgam_game_positions SET gam_resulting_pos_id = NULL WHERE gam_resulting_pos_id IN
      (candidates)` → `DELETE FROM teva_evaluations WHERE eva_pos_id IN (candidates)` → `DELETE
      FROM tpos_positions WHERE pos_id IN (candidates)` → resurrection guard, unchanged. Remove
      the `refineWorkfile` helper and both refinement passes entirely.
- [x] Simplify `refreshPurgeStatus` (`pipelineStatus.ts`) to match — "eligible" is now just the
      seed/candidate count, no refinement loop needed.
- [x] Simplify the display-only `SQL_STATUS_PURGE` string (`owner/pipeline/page.tsx`) to match —
      drop the refinement CTE, it's just the candidate count now.
- [x] Remove `MAX_REFINEMENT_ITERATIONS` from `src/lib/constants.ts` — verified unused everywhere
      else once both refinement loops above are removed.
- [x] Update the purge exception writeup in `.claude/CLAUDE.md` and the Purge section of
      `docs/Dataflow.md` to describe the new algorithm (no more refinement/fixpoint language).
- [x] Remove `PURGE_ROW_CAP` permanently (user decision, upgraded from the one-off plan) — no
      per-run row cap at all going forward, including the unattended cron. Removed the `LIMIT` from
      the seed query in `purgeStaleReachOnePositions` (`purgePositions.ts`), removed the constant
      from `src/lib/constants.ts`, and updated `.claude/CLAUDE.md`'s purge exception writeup and
      `docs/Dataflow.md`'s Purge Rules/gotchas to record why: since candidates are processed
      independently (the null-out redesign), a logic bug is equally catastrophic
      (rebuild-from-scratch) at any batch size, so the cap was only ever limiting pace, not risk.

## Changes

### src/lib/analysis/buildPositionTree.ts
- Removed `player`/`result` fields from `GameRecord` and `PositionRecord` — they existed only to
  carry `gam_player`/`gam_player_result` values through to the INSERT.
- `getPositionsFromGame` no longer populates `player`/`result` on pushed records.
- `insertGamePositions`'s INSERT now writes 6 columns instead of 8 (dropped `gam_player`,
  `gam_player_result`); params and placeholder generation updated to match.
- The game-fetch query no longer selects `d.gd_player AS player` / `d.gd_player_result AS result`
  from `tgd_gamesdecon` — those values are never used once the row is fetched.

### src/lib/analysis/chessdb.ts
- `getMovesForPosition`: joins `tgd_gamesdecon d` and reads `d.gd_player` (player filter) /
  `d.gd_player_result` (win/loss counts) instead of the dropped `tgam` columns.
- `getHabitsData`: added `JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid`; player filter and
  win/loss counts now read from `d.gd_player` / `d.gd_player_result`.
- `getPositionDetail`'s move-breakdown query: added the same join for its win/loss counts.
- `getPositionDetail`'s games query: already joined `tgd_gamesdecon` — switched the two selected
  columns from `gp.gam_player`/`gp.gam_player_result` to `d.gd_player`/`d.gd_player_result`.

### scripts/schema.sql
- Removed `gam_player` and `gam_player_result` column definitions from `tgam_game_positions`.
- Removed the now-obsolete `idx_tgam_player` index definition.

### src/lib/analysis/buildPositionTree.ts (pos_reached fix + both-ply recording)
- `recomputePosReachedByIds`: `pos_reached` is now one `COUNT(DISTINCT gam_gdid)` over
  `(gam_pos_id = p.pos_id AND gam_move_num > 0) OR gam_resulting_pos_id = p.pos_id`, replacing the
  previous sum of two independently-deduplicated counts that double-counted a game hitting both
  sides of the same position.
- `getPositionsFromGame`: removed the `color === game.playerColor` condition — every ply in the
  analysis window is now recorded, not just the tracked player's own. The `fen`/`resultingFen`
  pairing logic (before/after this one ply) was already color-agnostic and needed no change.
- Removed the now-unused `color` local and the now-unused `playerColor` field from `GameRecord`
  (and the `player_color`/`gd_player_color` selection that fed it) — nothing reads it anymore now
  that the ply filter is gone.

### src/lib/analysis/chessdb.ts (getHabitsData own-move filter)
- Added `AND p.pos_color = CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END` to
  `getHabitsData`'s WHERE clause — now that `tgam_game_positions` holds both sides' plies,
  `d.gd_player = $1` alone only narrows to the player's games, not to their own moves within them.
  `getPositionDetail`/`getMovesForPosition` left unfiltered by mover, as intended.

### docs/Dataflow.md
- `tgam_game_positions` Purpose/Processing/Output sections reworded from "tracked player's own
  ply/move only" to "every ply," and note the Habits-page `pos_color` scoping.
- Rules/gotchas: `pos_reached` bullet updated to describe the fixed (unioned) computation instead
  of the old double-counting bug; added a bullet noting both plies are recorded with no
  mover-identity column, derived instead from `pos_color` vs. the game's player color.

### .claude/CLAUDE.md
- Removed the resolved "`pos_reached` double-counting bug" entry from Outstanding items.

### src/lib/analysis/chessdb.ts (pos_ply_count removal)
- Removed the `pos_ply_count` field from `PositionRow`.
- Deleted the dead `upsertPosition` function — the only code that ever wrote `pos_ply_count`, and
  it had no callers.
- Removed `pos_ply_count` from both `getPositionsToEvaluate` SELECT statements.

### scripts/schema.sql (pos_ply_count removal)
- Removed the `pos_ply_count` column definition from `tpos_positions`.

### docs/Dataflow.md (pos_ply_count removal)
- `tpos_positions` Rules/gotchas: replaced the "unused/NULL" note with a resolved entry recording
  that the column and `upsertPosition` were removed.

### scripts/schema.sql (purge index)
- Added `idx_tpur_pos_id` (btree on `pur_pos_id`) for `tpur_workfile` — already live via manual
  pgAdmin4 creation during debugging; this brings the schema file in sync. No longer load-bearing
  after the purge redesign below (nothing queries `tpur_workfile` by `pur_pos_id` anymore), but
  harmless to keep on a table that's truncated every run.

### src/lib/analysis/purgePositions.ts, src/lib/actions/pipelineStatus.ts, src/app/owner/pipeline/page.tsx (purge redesign)
- `purgeStaleReachOnePositions`: replaced the iterative fixpoint refinement loop with the
  before/resulting-pair rule already documented in `.claude/CLAUDE.md` — full-delete a
  `tgam_game_positions` row when its own before-position is a candidate; otherwise, if only its
  resulting-position is a candidate, null out just that reference and keep the row. No
  cross-candidate dependency check needed, so `PURGE_ROW_CAP` is a plain `LIMIT` on the seed query
  again. Also rewrote the seed query's `(gam_pos_id = p.pos_id OR gam_resulting_pos_id =
  p.pos_id)` as two separate `AND`ed `NOT EXISTS` checks so each side can use its own
  single-column index.
- `refreshPurgeStatus`: simplified to match — "eligible" is just the candidate count, no
  refinement loop; same OR → two-`NOT EXISTS` rewrite.
- `SQL_STATUS_PURGE` (display-only, `owner/pipeline/page.tsx`): simplified to match, and its
  processing description updated to describe the null-out rule instead of refinement.
- Removed `MAX_REFINEMENT_ITERATIONS` from `src/lib/constants.ts` (no longer used anywhere).
- Replaces a design that computed the same "no dangling references" guarantee via an expensive,
  iterative graph-closure refinement — correct, but complex and too slow once the both-ply backfill
  roughly doubled edge density (multi-minute stalls, and a live-observed correctness bug where
  capping the seed before refinement could purge far fewer positions than the true eligible count:
  44 purged vs. 61,306 eligible in one observed run). The null-out rule achieves the same
  referential-integrity guarantee non-iteratively.

### src/lib/analysis/purgePositions.ts, src/lib/constants.ts (PURGE_ROW_CAP removed permanently)
- Removed the `LIMIT ${PURGE_ROW_CAP}` from the purge seed query and the `PURGE_ROW_CAP` constant
  itself — no per-run cap at all now, including on the unattended cron. User decision: since
  candidates are processed independently under the redesign above, a logic bug is equally
  catastrophic (full rebuild-from-scratch) at any batch size, so the cap was only ever limiting
  pace, not risk. `.claude/CLAUDE.md`'s purge exception writeup and `docs/Dataflow.md`'s Purge
  Rules/gotchas updated to record the decision and reasoning.
