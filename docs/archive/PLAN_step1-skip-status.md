# PLAN_step1-skip-status — chess

## Title
Make pipelinegames Step 1 status not show Incomplete for validly skipped games

## Plan
- [x] `deconstructGames_Player.ts`: extract the two inline skip checks (no PGN; `countMoves(pgn) <= MIN_TRACKABLE_HALF_MOVES`) into a new exported helper `isDeconstructable_Player(rawData)`; the deconstruct loop calls it in place of the inline checks (behaviour unchanged)
- [x] `pipelineStatus.ts` `refreshStep1`: add the `INCLUDED_TIME_CLASSES_Player` time-class filter to the pending query, fetch the unmatched raw rows (not just a count), and count only rows where `isDeconstructable_Player` is true — validly skipped games no longer count as pending, so the badge shows Completed
- [x] No "N skipped" note in the UI — skipped games simply drop out of the Remaining figure (user decision)
- [x] `/owner/constants` page: add `pipelineStatus.ts: refreshStep1` to `INCLUDED_TIME_CLASSES_Player`'s consumers (`MIN_ANALYSIS_MOVE_Player` already listed as `deconstruct.ts (module scope)` — unchanged)
- [x] `npx tsc --noEmit` passes

## Changes
### src/lib/actions/deconstructGames_Player.ts
- New exported helper `isDeconstructable_Player(rawData)` — single source of the deconstruct skip rules (PGN present and more than `MIN_TRACKABLE_HALF_MOVES` half-moves). Async only because every export of a `'use server'` file must be.
- `deconstructGames_Player`'s loop now calls it in place of the two inline skip checks; behaviour unchanged.

### src/lib/actions/pipelineStatus.ts
- `refreshStep1`: pending now filters on `INCLUDED_TIME_CLASSES_Player` (matching the deconstruct fetch), fetches the unmatched `gr_raw_data` rows and counts only those `isDeconstructable_Player` accepts — games validly skipped (no PGN / too short) no longer show as pending, so Step 1 shows Completed. `all_decon` moved to its own `COUNT(*)` query.
- `getPipelineStatus` has the same raw pending count but has no callers — left unchanged.

### src/app/owner/constants/page.tsx
- `INCLUDED_TIME_CLASSES_Player` consumers: added `pipelineStatus.ts: refreshStep1`.

## Testing
- [ ] Open /owner/pipelinegames (local) and click ↻ on Step 1 — Remaining shows 0 and the badge shows Completed (the 3 short games — stricade e4 d5 exd5 Qd6, astarrboy e4 c5 Nf3, astarrboy e4 Nc6 — no longer count)
- [ ] Run Step 1 (Game Sync) again — it still reports those games as skipped, and the status stays Completed afterward
- [ ] Open /owner/constants and confirm `INCLUDED_TIME_CLASSES_Player` lists `pipelineStatus.ts: refreshStep1` as a consumer
