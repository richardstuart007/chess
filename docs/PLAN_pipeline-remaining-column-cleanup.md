# PLAN_pipeline-remaining-column-cleanup — chess

## Title
Clean up Run Pipeline table's Remaining column: drop the redundant "remaining:" label, show Step 9's three depth tiers. Also: move cron depth/batch/schedule values into constants.ts. Also: add a "Functions" tab to the Constants page reverse-indexing which constants/env vars each function uses.

## Plan
- [x] Remove the literal "remaining: " text prefix from the Remaining-column cell in every step row of the Run Pipeline table (`src/app/owner/pipeline/page.tsx`) — steps 1, 2, 3, 4 (Purge), 5 (Evaluate Positions), 6 (Update CP Change), 7 (Build Habits), 8 (Evaluate Game Endings), 9 (Deepen Popular Positions). The column header already reads "Remaining", so the word was redundant. Keep the `<strong>{count}</strong>` and any `{eta(...)}` suffix as-is — only the leading text goes.
- [x] Change `refreshDeepenPopularStatus` (`src/lib/actions/pipelineStatus.ts`) to return a per-tier breakdown instead of one aggregate number — one `{ depth: number; remaining: number }` entry per entry in `POPULAR_POSITION_DEPTH_TIERS` (`src/lib/constants.ts`: depth 30/reach 50+, depth 24/reach 30+, depth 22/reach 10+), built dynamically from that constant (not re-hardcoded) so the display can never drift out of sync with the tiers actually used by `deepenPopularPositions`.
- [x] Update the `sDeepenPopular` state type in `src/app/owner/pipeline/page.tsx` to hold the tier array instead of a single `remaining` number.
- [x] Update Step 9's Remaining-column cell to render all three tiers, one per line item, format **"d30: X · d24: Y · d22: Z"** (label by target depth, per user's confirmed choice) — driven by mapping over the returned tier array, not hardcoded field names.
- [x] Update Step 9's `StatusBadge`/completeness check and `eta()` call to use the sum of `remaining` across all tiers (unchanged behavior — still "0 = complete", still one ETA figure).
- [x] Reorder the Run Pipeline table's columns (`src/app/owner/pipeline/page.tsx`) to: **Step, Description, Help, Processed, SQL, Refresh (↻), Remaining, Status, Result, Run** — reordering both the header `<th>`s and every step row's `<td>`s to match (currently: Step, Description, Help, Refresh, Remaining, Status, SQL, Result, Run). This adds the new Processed column (see next item) in the process.
- [x] Move each step's last-run output count into its new Processed cell (plain text, no "Done"/"Server done" wording, no remaining/ETA repeated — that stays exclusively in the Remaining column):
  - Step 1 (Game Sync): one aggregate number — total `inserted` summed across all players in `syncResult.players` — e.g. "38 games synced". The existing per-player breakdown is dropped entirely (per user's confirmed choice), so Result goes back to just `syncError` on failure, empty otherwise.
  - Step 2 (Build Game Positions): "`{gamesProcessed}` games, `{positions}` game-position records"
  - Step 3 (Sync Position Tree): "`{positionsSynced}` positions synced"
  - Step 4 (Purge): "`{purged}` positions purged"
  - Step 5 (Evaluate Positions): "`{processed}` evaluated"
  - Step 6 (Update CP Change): "`{updated}` rows updated"
  - Step 7 (Build Habits): "`{built}` habit rows built/refreshed"
  - Step 8 (Evaluate Game Endings): "`{processed}` evaluated (`{reused}` reused from tracked positions)"
  - Step 9 (Deepen Popular Positions): "`{processed}` deepened"
- [x] Result column becomes empty on a fully clean successful run for every step (1 through 9). It keeps showing text only as an exception in two cases: (a) the run failed outright — existing `Error: ...` / `syncError` text, unchanged; (b) the run partly succeeded with some per-item errors (steps 2, 5, 8, 9's `errors` count) — Result shows just "`{errors}` errors" in that case, while Processed still shows the clean processed count only (errors count does not appear in Processed).
- [x] Drop the remaining-based green/blue text color on steps 5, 8, 9's result paragraph (`text-green-600` vs `text-blue-700` keyed off `remaining === 0`) — now that Processed/Result no longer restate remaining-vs-done, that color distinction is redundant with the Remaining column and the Status badge. Result text (errors or Error:) renders in a single neutral/error color instead (e.g. red for both failure cases, matching steps 1/3/4/6/7's existing `Error:` styling). Flagging this since it wasn't explicitly asked for — straightforward simplification once the color's original reason (signaling done-vs-remaining) no longer applies, but easy to revert if you'd rather keep it.

- [x] Add `CRON_DEEPEN_POPULAR_BATCH_SIZE = 100` to `src/lib/constants.ts` (Batch / Pagination / Concurrency section) — Step 9's cron batch size, distinct from `DEFAULT_BATCH_SIZE` (200) since it's a genuinely different value.
- [x] Add `PIPELINE_CRON_SCHEDULE: Record<number, string>` to `src/lib/constants.ts`, one entry per pipeline step, matching `vercel.json`'s actual cron schedule exactly (user-confirmed):
  ```ts
  export const PIPELINE_CRON_SCHEDULE: Record<number, string> = {
    1: '3:00am',  // Game Sync
    2: '3:20am',  // Build Game Positions
    3: '3:40am',  // Sync Position Tree
    4: '4:00am',  // Purge Stale Positions
    5: '4:20am',  // Evaluate Positions
    6: '4:40am',  // Update CP Change
    7: '5:00am',  // Build Habits
    8: '5:20am',  // Evaluate Game Endings
    9: '5:40am',  // Deepen Popular Positions
  }
  ```
- [x] Wire each route's fallback default (currently an inline magic number, disconnected from both `vercel.json` and `constants.ts`) to the actual constant, so the constant becomes the single real source of truth instead of a fourth disconnected copy:
  - `src/app/api/analysis/build-tree/route.ts`: `limit` fallback → `DEFAULT_BATCH_SIZE` (was inline `'100'`)
  - `src/app/api/analysis/evaluate-positions/route.ts`: `limit` fallback → `DEFAULT_BATCH_SIZE` (was `'50'`), `depth` fallback → `STOCKFISH_DEPTH` (was inline `'16'`)
  - `src/app/api/analysis/evaluate-game-endings/route.ts`: same as evaluate-positions
  - `src/app/api/analysis/deepen-popular-positions/route.ts`: `limit` fallback → `CRON_DEEPEN_POPULAR_BATCH_SIZE` (was inline `'50'`)
- [x] Update `vercel.json`'s cron paths to drop the now-redundant explicit query params, relying on the route's constant-backed default instead (per user's confirmed choice — no more duplication to drift out of sync):
  - `/api/analysis/build-tree?limit=200&skipSync=true` → `/api/analysis/build-tree?skipSync=true` (drop only `limit`; `skipSync` is an unrelated behavior flag, not a depth/batch value, so it stays)
  - `/api/analysis/evaluate-positions?limit=200&depth=16` → `/api/analysis/evaluate-positions`
  - `/api/analysis/evaluate-game-endings?limit=200&depth=16` → `/api/analysis/evaluate-game-endings`
  - `/api/analysis/deepen-popular-positions?limit=100` → `/api/analysis/deepen-popular-positions`
- [x] Update `JOB_GROUPS` in `src/app/owner/pipeline/page.tsx` to stop hardcoding a `schedule` literal per entry — look up `PIPELINE_CRON_SCHEDULE[group.step]` wherever `group.schedule` is currently rendered, instead of carrying its own separately-hardcoded copy of the same value.
- [x] Fix the Owner UI's Depth field (`src/app/owner/pipeline/page.tsx`, `globalDepth` state) to initialize from the existing `STOCKFISH_DEPTH` constant instead of the hardcoded `useState(16)` — per user's confirmed choice, use the existing constant, no new one.
- [x] Add `CRON_DEEPEN_POPULAR_BATCH_SIZE` and `PIPELINE_CRON_SCHEDULE` to the Constants page (`src/app/owner/constants/page.tsx`), Batch / Pagination / Concurrency section — import, add a `ConstantSection` entry each with description + consumers, following the existing pattern for every other constant on that page. Update `DEFAULT_BATCH_SIZE`'s and `STOCKFISH_DEPTH`'s existing consumer lists to include the newly-wired routes (and, for `STOCKFISH_DEPTH`, the Owner UI's `globalDepth` init).

- [ ] Fix the 4 inconsistent `consumers` entries in `src/app/owner/constants/page.tsx` that don't follow either parseable convention (bare file path, no `: functionName` and no `(module scope)`) — these were introduced in the cron-constants work above:
  - `DEFAULT_BATCH_SIZE`: `'api/analysis/build-tree/route.ts'` → `'api/analysis/build-tree/route.ts: GET'`; `'api/analysis/evaluate-positions/route.ts'` → `'api/analysis/evaluate-positions/route.ts: GET'`; `'api/analysis/evaluate-game-endings/route.ts'` → `'api/analysis/evaluate-game-endings/route.ts: GET'`
  - `CRON_DEEPEN_POPULAR_BATCH_SIZE`: `'api/analysis/deepen-popular-positions/route.ts'` → `'api/analysis/deepen-popular-positions/route.ts: GET'`
  - `STOCKFISH_DEPTH`: `'api/analysis/evaluate-positions/route.ts'` → `'api/analysis/evaluate-positions/route.ts: GET'`; `'api/analysis/evaluate-game-endings/route.ts'` → `'api/analysis/evaluate-game-endings/route.ts: GET'`
  - `PIPELINE_CRON_SCHEDULE`: `'owner/pipeline/page.tsx: PipelinePage (JOB_GROUPS schedule display)'` → `'owner/pipeline/page.tsx: PipelinePage'` (drop the redundant trailing detail so this reference matches the identical `PipelinePage` reference used by other constants, instead of forking into a separate row in the new Functions tab)
- [ ] In `src/ui/owner/ConstantsViewer.tsx`, add a reverse-index builder function (e.g. `buildFunctionIndex(sections: ConstantSection[]): { usedIn: string; names: string[] }[]`) that:
  - Walks every section's every entry's `consumers` array
  - Skips any consumer string equal to `'none yet'` (placeholder meaning "not used anywhere")
  - If a string ends in `" (module scope)"` with no `: `, treats the whole string as one reference
  - Otherwise splits on `": "` into a file part and a comma-separated functions part, producing one reference (`"file: functionName"`) per function
  - Groups by reference, collecting the (deduplicated, sorted) list of constant/env-var names that reference it
  - Returns the result sorted alphabetically by reference
- [ ] Add a third top-level tab, **"Functions"**, to `ConstantsViewer.tsx`'s `Tab` union and tab bar, alongside "Constants" and ".env" — per user's confirmed choice, one combined tab (not split by Constants vs .env), since a function can use both a constant and an env var and should show both together in one row.
- [ ] When the "Functions" tab is active: hide the section-pill row entirely (this view is flat, not split into sections — a function can span multiple sections' constants), and render a new flat table built from `buildFunctionIndex([...constantsSections, ...envSections])`, columns **"Used In"** (the reference string) and **"Constants / Env Vars Used"** (the matched names — inline if short, behind the existing `PopoverButton` "Show" pattern if long, consistent with the existing "Used by" column's behavior).

## Changes

### src/app/owner/pipeline/page.tsx
- Reordered the Run Pipeline table's columns to Step, Description, Help, Processed, SQL, Refresh (↻), Remaining, Status, Result, Run — both the header row and every one of the 9 step rows.
- Added a new Processed column showing each step's last-run output count in plain text (no "Done"/"Server done" wording): Step 1 shows an aggregate `inserted` count summed across `syncResult.players` ("X games synced"), Steps 2-9 show their respective processed counts (games/positions/purged/evaluated/updated/built/deepened).
- Removed the redundant "remaining: " text prefix from every Remaining-column cell — the column header already says "Remaining".
- Step 9's Remaining cell now renders all three `POPULAR_POSITION_DEPTH_TIERS` tiers ("d30: X · d24: Y · d22: Z") instead of one summed number; its `StatusBadge` completeness check and `eta()` call now use the sum of `remaining` across the three tiers.
- Result column now stays empty on a fully clean run for every step; it only shows text for an outright failure (`Error: ...` / `syncError`, unchanged) or a partial per-item `errors` count (steps 2, 5, 8, 9), always in red — dropped the green/blue "done vs. remaining" color distinction on steps 5, 8, 9 since it's now redundant with the Remaining column and Status badge.
- Step 1's per-player insertion/deconstruction breakdown was removed from the Result column (superseded by the aggregate Processed count).

### src/lib/actions/pipelineStatus.ts
- `refreshDeepenPopularStatus` now returns `{ tiers: { depth: number; remaining: number }[] }` (one entry per `POPULAR_POSITION_DEPTH_TIERS` tier) instead of a single aggregate `{ remaining: number }`, calling the new `countRemainingPopularPositionsByTier` instead of `countRemainingPopularPositions`.

### src/lib/analysis/enrichPositionsStockfish.ts
- Added `countRemainingPopularPositionsByTier`, a new exported function that returns the Deepen Popular Positions backlog broken out per depth tier (one `COUNT(*) FILTER` per `POPULAR_POSITION_DEPTH_TIERS` entry) instead of summed into one number — built dynamically from the constant so it can't drift from the tiers `deepenPopularPositions` actually uses. `countRemainingPopularPositions` (the aggregate version) is unchanged and still used internally by the batch's own end-of-run log line.

### src/lib/constants.ts
- Added `CRON_DEEPEN_POPULAR_BATCH_SIZE = 100` (Step 9's cron batch size, distinct from `DEFAULT_BATCH_SIZE`).
- Added `PIPELINE_CRON_SCHEDULE: Record<number, string>`, one display time per pipeline step, matching `vercel.json`'s actual cron schedule exactly.

### src/app/api/analysis/build-tree/route.ts
- `limit` fallback now reads `DEFAULT_BATCH_SIZE` instead of an inline `'100'`.

### src/app/api/analysis/evaluate-positions/route.ts
- `limit` fallback now reads `DEFAULT_BATCH_SIZE` (was `'50'`); `depth` fallback now reads `STOCKFISH_DEPTH` (was inline `'16'`).

### src/app/api/analysis/evaluate-game-endings/route.ts
- Same change as evaluate-positions/route.ts: `limit` → `DEFAULT_BATCH_SIZE`, `depth` → `STOCKFISH_DEPTH`.

### src/app/api/analysis/deepen-popular-positions/route.ts
- `limit` fallback now reads `CRON_DEEPEN_POPULAR_BATCH_SIZE` instead of an inline `'50'`.

### vercel.json
- Dropped the now-redundant `?limit=...&depth=...` query params from the build-tree, evaluate-positions, evaluate-game-endings, and deepen-popular-positions cron paths (build-tree keeps `?skipSync=true`, an unrelated behavior flag) — each route now falls back to its constants.ts-backed default, so there's a single real source of truth instead of vercel.json and the route disagreeing.

### src/app/owner/pipeline/page.tsx
- `JOB_GROUPS` no longer carries its own hardcoded `schedule` string per entry; both places it's rendered now look up `PIPELINE_CRON_SCHEDULE[group.step]` instead.
- `globalDepth` now initializes from `STOCKFISH_DEPTH` (was a hardcoded `useState(16)`), and its input's parse-failure fallback also uses `STOCKFISH_DEPTH` instead of a literal `16`.

### src/app/owner/constants/page.tsx
- Added `CRON_DEEPEN_POPULAR_BATCH_SIZE` and `PIPELINE_CRON_SCHEDULE` entries to the Batch / Pagination / Concurrency section.
- Updated `DEFAULT_BATCH_SIZE`'s and `STOCKFISH_DEPTH`'s descriptions/consumer lists to reflect that they now back the cron routes' fallback defaults (and, for `STOCKFISH_DEPTH`, the Owner UI's Depth field).

## Testing
- [ ] Open /owner/pipeline and confirm the Run Pipeline table's column order reads Step, Description, Help, Processed, SQL, Refresh (↻), Remaining, Status, Result, Run.
- [ ] Confirm no Remaining-column cell shows the word "remaining" anymore (just the count and optional ETA).
- [ ] Confirm Step 9's Remaining cell shows three values (d30/d24/d22) instead of one number, and that its Status badge (Completed/Incomplete) still reflects whether any tier still has a backlog.
- [ ] Run Step 1 (Game Sync) and confirm Processed shows an aggregate "X games synced" count, and Result stays empty on success (no per-player list).
- [ ] Run a couple of other steps (e.g. Evaluate Positions, Build Habits) and confirm Processed shows the plain count with no "Done"/"Server done" wording, and Result stays empty unless there's an error or partial-errors count.
- [ ] Trigger a step failure if easy to simulate (or just confirm visually) that the Result column still shows a clear red `Error: ...` message when a run fails outright.
- [ ] Confirm the Pipeline Jobs summary table's Schedule column still shows the correct 3:00am-5:40am times for all 9 steps (now sourced from PIPELINE_CRON_SCHEDULE instead of a hardcoded literal).
- [ ] Confirm the Run Pipeline table's Depth input still defaults to 16 on page load.
- [ ] Open /owner/constants and confirm CRON_DEEPEN_POPULAR_BATCH_SIZE and PIPELINE_CRON_SCHEDULE both appear under Batch / Pagination / Concurrency with sensible values.
- [ ] Confirmed via `npx tsc --noEmit` (clean) that all route/constant/page changes type-check — vercel.json's cron paths still parse as valid JSON.
