# Fix stale PORT fallback in lib/cron-sync.ts, then remove the port dependency entirely

## Title

Fix stale PORT fallback in lib/cron-sync.ts, then switch it to call runGameSync() directly

## Plan

### Part 1 — stale fallback (done)

`lib/cron-sync.ts` reads `process.env.PORT` with a hardcoded fallback of `'3027'`, left over from
before this project's ports were renumbered (chess is now 4050 for locallocal/local, 4052 for
localprod/prod). Confirmed via project-wide grep that this is the only place in the project that
reads `process.env.PORT` for logic (the Constants page references it only for display text).

Recommendation (agreed): keep `PORT=` in `.env`/`.env.locallocal`/`.env.localprod` as-is — it's
genuinely needed since localprod (4052) differs from locallocal/local (4050), so a single hardcoded
port in the script can't replace it. Only the stale fallback needed fixing.

### Part 2 — remove the port/HTTP dependency (Option B)

Follow-up investigation found that `cron-sync.ts`'s whole reason for needing `PORT` is that it
calls the sync route over HTTP (`fetch` to a running dev server), rather than the route's actual
logic directly. `src/app/api/cron/sync/route.ts` is a thin wrapper: check `CRON_SECRET`, call
`runGameSync()`, return JSON. `runGameSync()` in `src/lib/actions/sync.ts:166` is a plain exported
async function with no Next.js-specific dependencies — its own header comment already documents
that it's designed to be called directly (as a Server Action from the pipeline UI) or via the HTTP
route, so this isn't a workaround, it's an already-supported calling convention.

Agreed with user:
- Bypassing the `CRON_SECRET` check for the local script is fine — that check exists for the
  external Vercel-scheduled HTTP trigger in production, not for local manual runs.
- All logging (`logStart`/`logEnd`/`write_logging`/`logPipelineStep`) lives inside `runGameSync()`
  itself, not the route wrapper, so nothing is lost by skipping the HTTP layer.
- Expected to run at the same speed or faster (removes HTTP round trip + potential on-demand route
  compile under `next dev`; the sync work itself dominates runtime either way).

Comparison research is in the chat history above — not duplicated here.

### Part 3 — duplicate the full 9-stage cron pipeline locally

`cron-sync.ts` only ever covers stage 1 of production's 9-stage `vercel.json` cron schedule. All 8
other stages follow the exact same thin-route-wrapper pattern confirmed in Part 2 (parse query
params with defaults from `src/lib/constants.ts`, call one plain async function, return JSON), and
each of those functions already calls `logPipelineStep()` internally with its own step number —
same as `runGameSync()` does for step 1 — so Pipeline-tab tracking and run-id chaining (only step
1a allocates a new `pip_run_id`; every other step/sub-step reuses the current max) come for free
with no extra work, confirmed by reading `src/lib/actions/pipelineLog.ts`.

Agreed with user: 9 separate scripts (one per stage, matching each `vercel.json` route 1:1 so any
single stage can be re-run independently), plus one `cron-full` npm script chaining all 9 with
`&&` so a failure stops the chain rather than continuing into a later stage that depends on the
earlier one having succeeded.

Each new script follows the same shape as `lib/cron-sync.ts`: `dotenv.config()`, direct import and
call of the underlying function with the same params/defaults `vercel.json`'s schedule entry uses,
print the JSON result, `.catch()` to log and exit non-zero on failure.

| Script | Function | Params |
|---|---|---|
| `lib/cron-build-tree.ts` | `buildPositionTree` (`@/src/lib/analysis/buildPositionTree`) | `{ limit: DEFAULT_BATCH_SIZE, playerUsername: undefined, skipSync: true, forceNewRun: false }` |
| `lib/cron-sync-tpos.ts` | `syncTposFromTgam` (`@/src/lib/analysis/buildPositionTree`) | `(1, false)` |
| `lib/cron-purge.ts` | `purgeStaleReachOnePositions` (`@/src/lib/analysis/purgePositions`) | `(1, false)` |
| `lib/cron-evaluate-positions.ts` | `enrichPositionsStockfish` (`@/src/lib/analysis/enrichPositionsStockfish`) | `{ limit: DEFAULT_BATCH_SIZE, depth: STOCKFISH_DEPTH, forceNewRun: false }` |
| `lib/cron-update-cp-change.ts` | `bulkUpdateCpLoss` (`@/src/lib/analysis/enrichPositionsStockfish`) | `(1, false)` |
| `lib/cron-build-habits.ts` | `buildHabits` (`@/src/lib/analysis/buildHabits`) | `(1, false)` |
| `lib/cron-evaluate-game-endings.ts` | `evaluateGameEndings` (`@/src/lib/analysis/enrichPositionsStockfish`) | `{ limit: DEFAULT_BATCH_SIZE, depth: STOCKFISH_DEPTH, forceNewRun: false }` |
| `lib/cron-deepen-popular.ts` | `deepenPopularPositions` (`@/src/lib/analysis/enrichPositionsStockfish`) | `{ limit: CRON_DEEPEN_POPULAR_BATCH_SIZE, forceNewRun: false }` |

## Changes

### lib/cron-sync.ts
- Replaced the `fetch('http://localhost:${port}/api/cron/sync', { headers: { Authorization: ... } })`
  call with a direct import and call of `runGameSync()` from `../src/lib/actions/sync` (relative
  import — confirmed `nextjs-shared/*` subpath imports used by that module resolve via its
  `package.json` `exports` map, plain Node resolution, no Next.js bundler needed, so `tsx` handles
  it fine).
- Dropped the `port`/`PORT` read and the `CRON_SECRET` check entirely — both were only needed for
  the HTTP call.
- `main()` now wraps `runGameSync()` directly; the existing `.catch(err => ...)` on `main()` still
  catches and logs any failure the same way as before.

### .env, .env.locallocal, .env.localprod
- Removed the `PORT=` line from all three — nothing in the project reads `process.env.PORT`
  anymore (confirmed via project-wide grep).

### src/app/owner/constants/page.tsx
- Removed the `PORT` entry from the Application Environment section entirely.
- Updated `CRON_SECRET`'s description and `consumers` list to drop `lib/cron-sync.ts` — that script
  no longer checks `CRON_SECRET` since the call is now in-process, not over HTTP.

- [x] `lib/cron-sync.ts:7` — change fallback from `'3027'` to `'4050'` (superseded by Part 2, which
  removes the `port` variable and fallback entirely)
- [x] `lib/cron-sync.ts` — replace the HTTP `fetch` call with a direct `runGameSync()` call
- [x] `lib/cron-sync.ts` — wrap the `runGameSync()` call so a failure is logged equivalently
- [x] `lib/cron-sync.ts` — drop the now-unused `port`/`PORT` read and the `CRON_SECRET` check
- [x] Remove the `PORT=` line from `.env`, `.env.locallocal`, and `.env.localprod`
- [x] Remove the `PORT` entry from the Constants page
- [x] Create `lib/cron-build-tree.ts` — calls `buildPositionTree({ limit: DEFAULT_BATCH_SIZE, playerUsername: undefined, skipSync: true, forceNewRun: false })`
- [x] Create `lib/cron-sync-tpos.ts` — calls `syncTposFromTgam(1, false)`
- [x] Create `lib/cron-purge.ts` — calls `purgeStaleReachOnePositions(1, false)`
- [x] Create `lib/cron-evaluate-positions.ts` — calls `enrichPositionsStockfish({ limit: DEFAULT_BATCH_SIZE, depth: STOCKFISH_DEPTH, forceNewRun: false })`
- [x] Create `lib/cron-update-cp-change.ts` — calls `bulkUpdateCpLoss(1, false)`
- [x] Create `lib/cron-build-habits.ts` — calls `buildHabits(1, false)`
- [x] Create `lib/cron-evaluate-game-endings.ts` — calls `evaluateGameEndings({ limit: DEFAULT_BATCH_SIZE, depth: STOCKFISH_DEPTH, forceNewRun: false })`
- [x] Create `lib/cron-deepen-popular.ts` — calls `deepenPopularPositions({ limit: CRON_DEEPEN_POPULAR_BATCH_SIZE, forceNewRun: false })`
- [x] Add npm scripts to `package.json` for each new file (`cron-build-tree`, `cron-sync-tpos`,
  `cron-purge`, `cron-evaluate-positions`, `cron-update-cp-change`, `cron-build-habits`,
  `cron-evaluate-game-endings`, `cron-deepen-popular`), following the `"cron-sync": "npx tsx
  lib/cron-sync.ts"` pattern
- [x] Add a `cron-full` npm script chaining all 9 stages in `vercel.json` order with `&&`

## Changes (Part 3)

### lib/cron-build-tree.ts, cron-sync-tpos.ts, cron-purge.ts, cron-evaluate-positions.ts, cron-update-cp-change.ts, cron-build-habits.ts, cron-evaluate-game-endings.ts, cron-deepen-popular.ts
- New files, each following `lib/cron-sync.ts`'s shape: `dotenv.config()`, a direct import and call
  of the underlying analysis function with the same params/defaults as `vercel.json`'s
  corresponding schedule entry, print the JSON result, `.catch()` to log and exit non-zero.

### package.json
- Added 8 new npm scripts (`cron-build-tree`, `cron-sync-tpos`, `cron-purge`,
  `cron-evaluate-positions`, `cron-update-cp-change`, `cron-build-habits`,
  `cron-evaluate-game-endings`, `cron-deepen-popular`), each `npx tsx lib/<script>.ts`.
- Added `cron-full`, chaining all 9 stage scripts with `&&` in `vercel.json`'s schedule order, so a
  failure stops the chain before a later, dependent stage runs.

## Testing

- [x] Run:
  npx tsx lib/cron-sync.ts
  with **no dev server running at all**, and confirm it prints a JSON summary
  (`players`/`totalInserted`/`totalDeconstructed`) with no errors — this is the main proof that the
  direct `runGameSync()` call works without a server or port.
- [x] Open `/owner/constants` and confirm the `PORT` row is gone from Application Environment, and
  the `CRON_SECRET` row's description/consumers no longer mention `cron-sync.ts`.
- [x] Run:
  npm run cron-full
  with no dev server running, and confirm all 9 stages complete in order without error (the chain
  stops at the first failure, so if one stage errors you'll see it clearly rather than the script
  silently continuing).
- [x] Open `/owner/pipeline` after the `cron-full` run and confirm all 9 steps show up under the
  same run number (only step 1 should have allocated a new run id; steps 2-9 should show under
  that same run).
- [x] Confirmed via `npx tsc --noEmit` — passes clean with no errors.
