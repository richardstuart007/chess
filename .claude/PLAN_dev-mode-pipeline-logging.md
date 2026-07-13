# PLAN_dev-mode-pipeline-logging — chess

## Title
Add dev-mode function-hierarchy logging to the Game Sync and Analysis pipelines

## Plan
- [x] Add `skipCache?: boolean` param to `table_write`/`table_update`/`table_delete`/`table_upsert` in `nextjs-shared`, guarding their `cache_clearTable()` call; bump `nextjs-shared` patch version, commit, push, reinstall in `chess` (done in a separate Claude session; confirmed present after `#reinstall`)
- [x] Create `src/lib/logStep.ts` with `logStart`/`logEnd` helpers — severity `'D'`, required `level: number` param
- [x] Instrument `src/lib/actions/cron.ts` (`runCronSync`) — level 1 start/end + level 2 per-player start/end; route console.error to write_logging too
- [x] Instrument `src/lib/actions/sync.ts` (`initSync`, `syncArchive` — level 2; `runGameSync` — level 1 + level 2 per-player); `skipCache: true` on `insertRawGame`'s table_write and `initSync`'s table_delete; route console.error to write_logging
- [x] Instrument `src/lib/actions/deconstruct.ts` (`deconstructGames` — level 2, batch counts, no per-row logging); `skipCache: true` on its table_write and on `upsertEcoReference`'s table_fetch/table_write; route console.error to write_logging
- [x] Instrument `src/lib/actions/players.ts` (`updatePlayerRating`, `markPlayerSynced` — level 2); `skipCache: true` on `getPlayerLastSyncedEndTime` (pipeline-only, hardcoded) and `markPlayerSynced`'s `table_update`; `getPlayers`/`getPlayer`/`upsertPlayerRating` got a threaded `skipCache` param instead of a hardcode (see Changes — they're also called from non-pipeline, user-facing pages)
- [x] Instrument `src/lib/actions/cronAnalysis.ts` (`runCronAnalysis`) — level 1 start/end + level 2 per-player start/end (passes `level: 2` into `buildPositionTree`); route console.error to write_logging
- [x] Instrument `src/lib/analysis/buildPositionTree.ts` — `buildPositionTree` takes optional `level` (default 1, so it's level 1 when called directly by the cron route, level 2 when called by `runCronAnalysis`); its children `bulkEnsurePositions`/`resolvePositionIds`/`bulkInsertGamePositions`/`recomputePosReached` log at `level + 1` (no per-game logging); route console.error to write_logging
- [x] Instrument `src/lib/analysis/enrichPositionsStockfish.ts` — `enrichPositionsStockfish` takes optional `level` (default 1); its children `bulkUpdateCpLoss`/`getResultingFensToEvaluate` log at `level + 1` (no per-position logging); `skipCache: true` via `chessdb.ts`'s `saveEvaluation` table_upsert; route console.error to write_logging
- [x] Add `write_logging(severity: 'E')` to the catch blocks in `src/app/api/cron/sync/route.ts` and `src/app/api/analysis/cron/route.ts`
- [x] **Pass 2** (after `nextjs-shared` 2.1.17 reinstall): `table_write`/`table_update`/`table_delete`/`table_upsert`/`table_fetch`/`table_query`/`db.query` now all accept `level`/`severity`/`table`/`isupdate` directly, and the write-side ones now always emit a "succeeded, N row(s)" trace line (not just on error). Threaded `level`/`severity: 'D'` through every *bounded, batch-boundary* pipeline DB call (one call per player/run, not per-record) across `sync.ts`, `deconstruct.ts`, `players.ts`, `buildPositionTree.ts`, `enrichPositionsStockfish.ts` — see Changes for the full list. Left per-record calls (`insertRawGame`, per-row `deconstructGames`/`upsertEcoReference` writes, per-position `saveEvaluation`) at default severity `'I'`/level 1 on purpose, to keep the `'D'`-filtered view free of per-record flooding.
- [x] Update `scripts/schema.sql` for the two more `xlg_logging` columns discovered in this pass (`lg_isupdate`, `lg_table`) — not covered by the `lg_level` ALTER TABLE you ran earlier
- [x] `npx tsc --noEmit` and `npm run build` both pass clean (twice — once after the D+level instrumentation, again after the pass-2 `level`/`severity`/`table` threading)
- [ ] User runs the `ALTER TABLE` SQL below (for `lg_isupdate`/`lg_table`) via pgAdmin4, then verifies end-to-end: run both `/owner/cron` buttons, inspect `/owner/logging` filtered to severity `'D'` for a clean start/end hierarchy with correct `lg_level` nesting (now including the automatic "succeeded, N row(s)" trace lines from every batch-boundary DB call) and no `CACHE_*` rows; force one error path to confirm `'E'` rows appear

## Details

### Context
`/owner/cron` runs two pipelines (Run Game Sync, Run Analysis Pipeline). Today the only things
that land in `xlg_logging` are: (a) every raw SQL statement, auto-logged at `'I'` severity by
`nextjs-shared/db.ts`'s `log_query()`, tagged with a generic `functionName` (`table_write`,
`table_fetch`, etc.) and a `caller` string, and (b) DB errors, auto-logged at `'E'` by the
generic table helpers. There is a separate `tpip_pipelinelog` table
(`startPipelineLog`/`completePipelineLog`) that records one summary row per batch run
(attempted/processed/errors/duration) — that's "the pipeline is logged" the user referred to.

What's missing: none of the app-level orchestration functions themselves ever write to
`xlg_logging`. You can see that a SQL statement ran and which function's `caller` string was
attached to it, but you can't see the actual call hierarchy — which top-level function called
which lower-level function, in what order, or when a non-DB step (chess.com `fetch()`, chess.js
parsing, Stockfish evaluation) started and finished. Several catch blocks also only
`console.error` (invisible on Vercel) instead of using `write_logging`, so failures in these
functions don't show up in the table at all.

**Desired output shape** (explicit from the user): a flat, timestamp-ordered sequence in
`xlg_logging` that reads like a call stack trace, e.g.

```
Start function runCronSync - game sync for 2 players
  Start function initSync - fetching archive list for stricade (refresh)
  End function initSync - 3 archives found, resume cutoff 1739000000
  Start function syncArchive - downloading archive .../2025/03
  End function syncArchive - 5 inserted, 12 skipped, 17 total games
  Start function deconstructGames - deconstructing raw games for stricade
  End function deconstructGames - 5 tgd_gamesdecon rows inserted, 0 skipped, 0 errors
End function runCronSync - 2 players processed, 8 inserted, 8 deconstructed
```

Reading `xlg_logging` filtered to severity `'D'`, ordered by `lg_datetime`, gives that
hierarchy directly (indentation above is illustrative — the table itself is flat and ordered by
time, `lg_functionname`/`lg_caller` columns already let you filter/scan; the new `lg_level`
column, added specifically for this feature, makes the nesting depth an actual sortable/
filterable value instead of just implied by read order — see "Severity and level" below).

This log level is meant for dev/inspection only — `NEXT_PUBLIC_APPENV_LOG_I` already exists as
a global kill switch for `'I'`-severity logs (`write_logging` early-returns when it's `'false'`),
and `nextjs-shared` now has a matching `NEXT_PUBLIC_APPENV_LOG_D` switch for the new `'D'`
severity used here — so nothing further needs building for a prod/dev toggle. Local `.env`
doesn't set `NEXT_PUBLIC_APPENV_LOG_D` (only `.env.locallocal` does, `=true`), so this trace is
active locally and can simply be left unset (defaults to logging) or set `'false'` in production
to suppress it.

### Severity and level — `nextjs-shared` update
The `nextjs-shared` session (see top-of-file status note) also added, independently of the
`skipCache` change:
- **Severity `'D'`** (development trace) alongside existing `'E'`/`'W'`/`'I'`, gated by a new
  `NEXT_PUBLIC_APPENV_LOG_D` env var (same early-return pattern as `'I'`/`LOG_I`).
- **`lg_level: number`** column on `xlg_logging` (`NOT NULL DEFAULT 1`), passed through
  `write_logging`'s `WriteLoggingProps`, meant as a call-depth marker (1 = top level, 2 = next
  level down, ...).

This pipeline's tracing uses **severity `'D'`, not `'I'`** — `'I'` stays reserved for the
automatic `DB_SQL` query logging already coming from `nextjs-shared/db.ts`, so filtering by
`'D'` shows *only* the new function-hierarchy trace, cleanly separated from SQL noise.
`lg_level` tracks actual call depth per the scheme in "Functions to instrument" below.

**Schema change required** — the `xlg_logging` table predates `lg_level`. Run this once per
database (local, dev, prod) via pgAdmin4 before this pipeline's logging will populate the
column (until then, `write_logging` will fail on the INSERT since the column doesn't exist):
```sql
ALTER TABLE public.xlg_logging ADD COLUMN lg_level integer NOT NULL DEFAULT 1;
```
`scripts/schema.sql` has already been updated to include `lg_level` in the `xlg_logging`
definition, matching `nextjs-shared`'s own updated schema.

### Scope
Instrument all four real entry points, since the owner-page buttons and the actual Vercel cron
routes run different (partially duplicated) code:
- `runCronSync` (`src/lib/actions/cron.ts`) — owner-page "Run Game Sync" button
- `runGameSync` (`src/lib/actions/sync.ts`) — scheduled `/api/cron/sync`
- `runCronAnalysis` (`src/lib/actions/cronAnalysis.ts`) — owner-page "Run Analysis Pipeline" button
- the analysis cron route (`/api/analysis/cron/route.ts`), which calls `buildPositionTree` **and** `enrichPositionsStockfish`

Because `buildPositionTree`, `enrichPositionsStockfish`, and `deconstructGames` are shared with
a few other manual API routes (`build-tree`, `deconstruct`, `evaluate-positions`), those routes
get the same tracing for free — no extra work needed there.

### New helper — `src/lib/logStep.ts`
One tiny local helper so every call site stays one line, instead of repeating the
`write_logging({...})` shape ~40 times:

```ts
'use server'

import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  logStart / logEnd — dev-mode 'D'-severity call-hierarchy tracing for xlg_logging
//----------------------------------------------------------------------------------
export async function logStart(functionName: string, caller: string, description: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `Start function ${functionName} - ${description}`,
    lg_severity: 'D',
    lg_level: level
  })
}

export async function logEnd(functionName: string, caller: string, status: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `End function ${functionName} - ${status}`,
    lg_severity: 'D',
    lg_level: level
  })
}
```

`caller` = the name of whichever function made the call (matches the existing `table_write`/
`table_fetch` convention where `caller` identifies "who invoked me"). `functionName` = the
function's own name. `description`/`status` are **required, not optional** — every call site
states what the function is about to do (`description`, e.g. "syncing games for stricade from
chess.com") and what it actually did (`status`, e.g. "5 tgr_gamesraw rows inserted, 2 skipped"),
per the user's explicit request for concrete detail at both ends, not just bare start/end
markers. `level` is also required (no default in the helper itself — see per-function levels
below) so every call site is explicit about its depth rather than silently defaulting.

### Instrumentation pattern
- **Wrap every named function in the call chain** with `logStart` right after entry and
  `logEnd` right before each return (including early returns), so start/end always pair up.
- **Loops over a small, bounded set (players, monthly archives)** — log start/end per iteration
  too, since that's exactly the hierarchy detail requested (e.g. "Start function syncArchive"
  once per archive URL, ~12/player).
- **Loops over a large, unbounded set (per-game, per-row, per-position)** — do **not** log
  start/end per iteration (would flood the table with hundreds/thousands of rows per run). The
  enclosing batch function's single start/end pair (with a count in `status`) already covers
  this — e.g. `deconstructGames` logs start once, end once with `processed`/`skipped`/`errors`
  counts, not once per game.
- **Error paths**: wrap each function body so `logEnd` still fires (with an error-indicating
  status) even when the function catches and continues, or use `try { ... } finally { ... }`
  where the function has a single clear exit. Where a catch block currently only does
  `console.error`, also call `write_logging` with `lg_severity: 'E'` so failures are visible in
  the same table — this directly extends the project's own documented convention ("server
  actions use `write_logging`, not `console.error`, for errors") and closes a real gap: right
  now these 7 catch blocks are silent on Vercel.

### Functions to instrument
Each entry below is `logStart` description → `logEnd` status, both required and concrete (table
name + row count where the function writes data), plus the `lg_level` each call site uses.

**Game Sync — `src/lib/actions/cron.ts`**
- `runCronSync` — **level 1**: "game sync for N players" → "N players processed, X inserted, Y deconstructed"; also **level 2** start/end per player inside the loop ("syncing {username}" → "{username}: X inserted, Y deconstructed")
- replace `console.error` at line 27 with `write_logging(severity: 'E')` in addition

**Game Sync — `src/lib/actions/sync.ts`**
- `initSync` — **level 2**: "fetching archive list for {username} ({syncType})" → "N archives found, resume cutoff {latestEndTime}"
- `syncArchive` — **level 2**: "downloading archive {archiveUrl}" → "N inserted, M skipped, T total games" (per archive — small bounded loop, ~12/player)
- `runGameSync` — **level 1** (scheduled-cron duplicate of `runCronSync`) + **level 2** per player
- replace `console.error` at lines 134 and 169 with `write_logging(severity: 'E')` in addition

**Game Sync — `src/lib/actions/deconstruct.ts`**
- `deconstructGames` — **level 2**: "deconstructing raw games for {username}" → "N tgd_gamesdecon rows inserted, M skipped, E errors" — no per-row logging
- replace `console.error` at line 147 with `write_logging(severity: 'E')` in addition

**Game Sync — `src/lib/actions/players.ts`**
- `updatePlayerRating` — **level 2**: "updating tplr_player_ratings for {username}" → "N time classes updated"
- `markPlayerSynced` — **level 2**: "stamping sync cutoff for {username}" → "pl_last_synced_end_time set to {endTime}"

**Analysis — `src/lib/actions/cronAnalysis.ts`**
- `runCronAnalysis` — **level 1**: "analysis pipeline for N players" → "N players processed, X positions, Y errors"; also **level 2** start/end per player inside the loop, passing `level: 2` into its `buildPositionTree` call
- replace `console.error` at line 17 with `write_logging(severity: 'E')` in addition

**Analysis — `src/lib/analysis/buildPositionTree.ts`**
- `buildPositionTree(opts: { ..., level?: number })` — level defaults to **1** (used when called directly by the analysis cron route); `runCronAnalysis` passes **2**. "building position tree, N games fetched" → "X positions recorded, treeBuilt Y, remaining Z"
- `bulkEnsurePositions`, `resolvePositionIds`, `bulkInsertGamePositions`, `recomputePosReached` — log at **`level + 1`** (i.e. 2 or 3 depending on caller) — "ensuring positions for N games" → "N tpos_positions rows inserted/updated", "resolving pos_id for N FENs" → "N ids resolved", "inserting N game-position rows" → "N tgam_game_positions rows inserted", "recomputing pos_reached for N FENs" → "N tpos_positions rows updated"
  (these all run once per whole batch, not per game — safe to log)
- **not** `getPositionsFromGame` (runs once per game, pure/no DB, would be noisy — its work is
  already summarized by `buildPositionTree`'s own end-of-function status)
- replace `console.error` at line 359 with `write_logging(severity: 'E')` in addition

**Analysis — `src/lib/analysis/enrichPositionsStockfish.ts`**
- `enrichPositionsStockfish(opts: { ..., level?: number })` — level defaults to **1** (only called directly by the analysis cron route today, never nested under another instrumented function — default kept for consistency/future-proofing). "evaluating N positions at depth D" → "X processed, Y errors, Z remaining"
- `bulkUpdateCpLoss`, `getResultingFensToEvaluate` — log at **`level + 1`** (2) — "recomputing cp loss" → "N tgam_game_positions rows updated", "fetching resulting FENs to evaluate" → "N FENs found"
- **not** the per-position `sf.evaluate()` loop (unbounded, would flood the table)
- replace `console.error` at line 344 with `write_logging(severity: 'E')` in addition

**API routes**
- `src/app/api/cron/sync/route.ts` — replace `console.error` at line 17 with
  `write_logging(severity: 'E')` in addition (route-level catch, outside `runGameSync` itself)
- `src/app/api/analysis/cron/route.ts` — its two catch blocks currently only populate the JSON
  response; add `write_logging(severity: 'E')` there too

### Cache — the pipeline must never touch it
This is a maintenance/batch pipeline, not a user-facing read path, so it should never read
from, populate, or clear the server-side cache (`userCache_store` in `nextjs-shared`). This also
directly benefits the new hierarchy trace: `cache_get`/`cache_set`/`cache_clearTable` each write
their own `'I'`-severity `CACHE_HIT`/`CACHE_MISS`/`CACHE_SAV`/`CACHE_CLR_TABLE` row to
`xlg_logging` on every call — leaving cache interaction in place would interleave that noise
into the clean start/end sequence this plan is building.

**Reads** — `table_fetch` already has a `skipCache?: boolean` param (also on
`table_fetch_join`/`fetchFiltered`/`fetchTotalPages`, unused by this pipeline). Pass
`skipCache: true` at every pipeline call site:
- `src/lib/actions/players.ts` — `getPlayers()`, `getPlayerLastSyncedEndTime()`, and
  `getPlayer()` (called internally by `markPlayerSynced`)
- `src/lib/actions/deconstruct.ts` — the `table_fetch` inside `upsertEcoReference()`

**Writes** — `table_write`, `table_update`, `table_delete`, `table_upsert` previously had **no**
such param; each unconditionally called `cache_clearTable(table, functionName)` after a
successful write. **Done**: a separate Claude session added `skipCache?: boolean` (default
`false`) to all four in `nextjs-shared`, guarding that call — confirmed present
(`table_write.ts` now has `if (!skipCache) cache_clearTable(table, functionName)`) after
running `#reinstall` in `chess`. Remaining work here is just passing `skipCache: true` at every
pipeline call site:
- `src/lib/actions/sync.ts` — `insertRawGame()`'s `table_write`, `initSync()`'s `table_delete`
  (staging-table clear)
- `src/lib/actions/deconstruct.ts` — `deconstructGames()`'s `table_write`,
  `upsertEcoReference()`'s `table_write`
- `src/lib/actions/players.ts` — `markPlayerSynced()`'s `table_update`,
  `upsertPlayerRating()`'s `table_upsert` (called by `updatePlayerRating`)
- `src/lib/analysis/chessdb.ts` — `saveEvaluation()`'s `table_upsert` (called by
  `enrichPositionsStockfish`)

**Already cache-free, no changes needed**: `buildPositionTree.ts` and
`enrichPositionsStockfish.ts`'s own DB access all goes through raw `db.query()` or
`table_query()` (used for `COALESCE`/`LATERAL`/multi-table SQL), neither of which touch the
cache at all.

### Verification
1. Confirm `xlg_logging` has `lg_level` (already added), plus `lg_isupdate` and `lg_table`
   (added in pass 2 — run the SQL below if not already applied), and that `.env.locallocal`
   still has `NEXT_PUBLIC_APPENV_LOG_D=true`:
   ```sql
   ALTER TABLE public.xlg_logging ADD COLUMN IF NOT EXISTS lg_isupdate boolean NOT NULL DEFAULT false;
   ALTER TABLE public.xlg_logging ADD COLUMN IF NOT EXISTS lg_table character varying DEFAULT '';
   ```
2. Run the dev server, go to `/owner/cron`, click **Run Game Sync**, then **Run Analysis
   Pipeline**.
3. Go to `/owner/logging`, filter to severity `'D'`, sort by time ascending, and confirm the
   trace reads as clean start/end pairs in call order with the expected `lg_level` on each row
   (e.g. `runCronSync` start/end at level 1 → per-player `initSync`/`syncArchive`/
   `deconstructGames` start/end at level 2), now also interleaved with the automatic
   `Table(...) INSERT/UPDATE/DELETE succeeded, N row(s)` and `DB_SQL` trace lines that
   `table_write`/`table_update`/`table_delete`/`table_upsert`/`db.query` emit for every
   batch-boundary call that was given `severity: 'D'` — all at the matching `lg_level`, with
   `lg_table` populated for single-table operations.
4. Force one error path (e.g. temporarily point at a bad chess.com username) and confirm an
   `'E'` row now appears in the log table where previously only a server console line would
   have shown.
5. Confirm no `CACHE_HIT` / `CACHE_MISS` / `CACHE_SAV` / `CACHE_CLR_TABLE` rows appear in
   `xlg_logging` for the run.
6. Confirm per-record operations (raw game inserts, per-game deconstruction rows,
   per-position Stockfish evaluations) do **not** appear in the `'D'`-filtered view — they
   were deliberately left at default severity `'I'` to avoid flooding the trace.

## Changes

### src/lib/logStep.ts (new)
- `logStart(functionName, caller, description, level)` / `logEnd(functionName, caller, status, level)` — thin wrappers around `write_logging` fixed to severity `'D'`, used everywhere below for the call-hierarchy trace.

### src/lib/actions/cron.ts
- `runCronSync` — level 1 start/end around the whole run, level 2 start/end per player; catch block now also calls `write_logging(severity: 'E')` in addition to `console.error`.
- `getPlayers()` call switched to `getPlayers(true)` (skip cache — this pipeline never reads/writes the cache).

### src/lib/actions/sync.ts
- `insertRawGame` — added `skipCache: true` to its `table_write` (pipeline-only helper, no other caller).
- `initSync` — level 2 start/end; added `skipCache: true` to its `table_delete` staging-clear.
- `syncArchive` — level 2 start/end at every early-return point plus the success/catch paths; catch block now also calls `write_logging(severity: 'E')`.
- `runGameSync` (the scheduled-cron duplicate of `runCronSync`) — level 1 start/end + level 2 per-player start/end, same catch-block treatment; `getPlayers()` switched to `getPlayers(true)`.
- `initSync`/`syncArchive` use `caller: 'gameSyncPipeline'` (not `'runCronSync'`) since both are shared by `runCronSync` and `runGameSync` — a single hardcoded caller name would have been wrong for whichever one didn't call it.

### src/lib/actions/deconstruct.ts
- `deconstructGames` — level 2 start/end (batch counts only, no per-row logging since a run can process hundreds of games); added `skipCache: true` to its `table_write`; per-row catch block now also calls `write_logging(severity: 'E')` (kept per-row since individual game failures are informative and rare, unlike the info-level start/end trace).
- `upsertEcoReference` — added `skipCache: true` to both its `table_fetch` and `table_write` (only ever called from `deconstructGames`, itself only reachable from maintenance/pipeline code paths — safe to hardcode rather than thread a param).

### src/lib/actions/players.ts
- `getPlayer(username, skipCache = false)` — added optional param rather than hardcoding, since it's also called by `upsertPlayer` (an admin "add player" flow) and `HomeDashboard.tsx` (user-facing).
- `getPlayers(skipCache = false)` — same reasoning; also called by `page.tsx`, `quiz/page.tsx`, `habits/page.tsx` (all user-facing, must keep caching).
- `getPlayerLastSyncedEndTime` — hardcoded `skipCache: true` directly; its only caller is `sync.ts`'s pipeline-only `getLatestGameEndTime` wrapper.
- `upsertPlayerRating(..., skipCache = false)` — added optional param since it's also called directly from `owner/maintenance/page.tsx`.
- `updatePlayerRating` — level 2 start/end; calls `upsertPlayerRating(..., true)`.
- `markPlayerSynced` — level 2 start/end; calls `getPlayer(username, true)` and added `skipCache: true` to its `table_update`.

### src/lib/actions/cronAnalysis.ts
- `runCronAnalysis` — level 1 start/end around the whole run, level 2 start/end per player (passes `level: 2` into `buildPositionTree`); catch block now also calls `write_logging(severity: 'E')`; `getPlayers()` switched to `getPlayers(true)`.

### src/lib/analysis/buildPositionTree.ts
- `buildPositionTree` — new optional `level` param (default 1); level/`caller` resolved once (`caller = level === 1 ? 'analysisCronRoute' : 'runCronAnalysis'`, the only two current call sites) and used for its own start/end plus passed as `level + 1` to its four DB-writing helpers.
- `bulkEnsurePositions`, `resolvePositionIds`, `bulkInsertGamePositions`, `recomputePosReached` — each now takes a `level` param and logs start/end around its whole batch (not per-record).
- Per-game `chess.js` parse-error catch block now also calls `write_logging(severity: 'E')` in addition to `console.error`.

### src/lib/analysis/enrichPositionsStockfish.ts
- `enrichPositionsStockfish` — new optional `level` param (default 1, its only current caller is the analysis cron route); start/end around the whole run including the early-return "nothing to evaluate" branch.
- `bulkUpdateCpLoss`, `getResultingFensToEvaluate` — each now takes a `level` param and logs start/end (called once per batch, not per position).
- Per-position Stockfish-eval catch block now also calls `write_logging(severity: 'E')`.

### src/lib/analysis/chessdb.ts
- `saveEvaluation` — added `skipCache: true` to its `table_upsert` (only callers are `enrichPositionsStockfish` and the owner-only `EvalProgress.tsx`/`owner/pipeline` UI — both maintenance-scoped, safe to hardcode).

### src/app/api/cron/sync/route.ts
- Catch block now also calls `write_logging(severity: 'E')` in addition to `console.error` (this is the route-level catch around `runGameSync`, separate from `runGameSync`'s own internal catch).

### src/app/api/analysis/cron/route.ts
- Both catch blocks (`buildPositionTree`, `enrichPositionsStockfish`) now also call `write_logging(severity: 'E')` — previously these only populated the JSON response, with nothing logged anywhere on failure.

### scripts/schema.sql
- Added `lg_level integer NOT NULL DEFAULT 1` to the `xlg_logging` table definition, matching `nextjs-shared`'s updated schema (see the `ALTER TABLE` SQL given in chat — still needs to be run manually via pgAdmin4 before this logging will work end-to-end).
- **Pass 2**: added `lg_isupdate boolean NOT NULL DEFAULT false` and `lg_table character varying DEFAULT ''` — two more columns discovered after reinstalling `nextjs-shared` 2.1.17 and re-reading `CONSUMING_PROJECTS.md`, not covered by the earlier `lg_level` ALTER. SQL given in chat and in the Verification section above.

---

## Pass 2 — `level`/`severity`/`table` threaded into every generic table function

After reinstalling `nextjs-shared` (2.1.16 → 2.1.17), `CONSUMING_PROJECTS.md` showed a much
bigger change than just `lg_level`: `table_write`/`table_update`/`table_delete`/`table_upsert`/
`table_fetch`/`table_query`/`db.query` all now accept `level?: number` and `severity?: string`
directly (defaults `1`/`'I'`), plus `table?: string` and `isupdate?: boolean` on the write-side
ones. Every write function now **always** emits a `Table(...) INSERT/UPDATE/DELETE/UPSERT
succeeded, N row(s)` trace line on success (not just on error, as before) — using whatever
`level`/`severity` was passed in.

This meant the pipeline's DB calls could be tied directly into the same `'D'`-severity,
correctly-`lg_level`-nested hierarchy as the `logStart`/`logEnd` markers, instead of always
defaulting to `'I'`/level 1 regardless of where they ran. Applied the same bounded-vs-unbounded
rule as the rest of this plan: every batch-boundary DB call (the same set that already sits
inside a `logStart`/`logEnd` pair) got `level: <matching level>, severity: 'D'` (plus `table:`
where it's a clean single-table operation, and `isupdate: true` for writes going through raw
`db.query`/`table_query` rather than the generic write helpers). Per-record calls inside
unbounded loops (`insertRawGame`, the per-row writes in `deconstructGames`/`upsertEcoReference`,
`saveEvaluation`) were deliberately left untouched at default `severity: 'I'` — promoting those
would have flooded the `'D'`-filtered view with one row per game/position, exactly what the
original plan's "no per-record logging" rule was written to avoid.

**Files touched in this pass** (all mechanical — add `level`/`severity`/`table`/`isupdate` to
an already-`skipCache`d call, or thread a new `level` param through a private helper that
didn't have one yet):
- `src/lib/actions/sync.ts` — `initSync`'s `table_delete`
- `src/lib/actions/deconstruct.ts` — `deconstructGames`'s main SELECT `db.query`
- `src/lib/actions/players.ts` — `getPlayer`/`getPlayers`/`upsertPlayerRating` gained threaded `level`/`severity` params (same reasoning as their `skipCache` params — shared with non-pipeline callers); `getPlayerLastSyncedEndTime`'s `table_fetch` and `updatePlayerRating`'s/`markPlayerSynced`'s `table_update`/`db.query` calls hardcoded to the pipeline's level; all pipeline call sites (`cron.ts`, `sync.ts`, `cronAnalysis.ts`) updated to pass `getPlayers(true, 1, 'D')`
- `src/lib/analysis/buildPositionTree.ts` — the two top-level `db.query` calls (`buildPositionTree_fetch`/`_snap`) and all four batch helpers' `db.query`/`table_query` calls
- `src/lib/analysis/enrichPositionsStockfish.ts` — `countRemainingPositions`/`countEvaluatedPositions` gained a new `level` param (previously had none — private helpers, only called from within this file); phase-1 SELECT, `getResultingFensToEvaluate`, and `bulkUpdateCpLoss` all threaded through
- `npx tsc --noEmit` and `npm run build` re-verified clean after this pass
