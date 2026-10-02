# PLAN_code-cleanup-2026-10-02 — chess

## Title
Code-convention cleanup — 19 phases, audit then approve each

Mode: auto (default) — a clean phase chains straight into the next phase's audit; `manual` switches to stopping after every phase.

## Plan
- [x] Phase 1 — require() → import
- [x] Phase 2 — .then()/.catch()/.finally() → await / try/catch
- [x] Phase 3 — table_query: add table:
- [x] Phase 4 — Return-const
- [x] Phase 5 — JSX calculation moved above the return (four /owner pipeline pages deferred — see Phase 5 scope decisions)
- [x] Phase 6 — Inline comments in the 3-line format
- [x] Phase 7 — interface → type
- [x] Phase 8 — console.error → write_Logging
- [x] Phase 9 — Named exports only in server-action files
- [x] Phase 10 — SQL text rules (no table.column notation) — 12 simple queries only, by user scope decision
- [x] Phase 11 — File structure (directive, constants, useState order) — pipeline pages deferred
- [x] Phase 12 — Multi-export split (one exported function/component per file)
- [x] Phase 13 — function-order
- [x] Phase 14 — function-headers
- [x] Phase 15 — Convention findings list (report-only) — 43 findings recorded; none selected as work yet
- [x] Phase 16 — Component-authoring checks (report-only; nextjs-shared only) — n/a, this project is not nextjs-shared
- [x] Phase 17 — Shared-component adoption (needs Testing)
- [x] Phase 18 — window.location → router hooks (needs Testing) — nothing to change
- [x] Phase 19 — Naming corrections (needs Testing)

### Raised during testing (2026-10-02) — duplicate games in tgd_gamesdecon
Found by the user while testing: local `tgd_gamesdecon` holds 206 games twice (ids 75369–75574 duplicate 75057–75262-range originals; e.g. 75057/75369). Cause (local `xlg_logging`, 2026-09-29): the second game sync's deconstruct read at `deconstructGames_Player.ts:48` was a `CACHE_HIT` returning the first sync's list, and the table has no unique rule on the game's uuid. Predates the cleanup.
User decision: `gd_chesscom_uuid` alone is the unique key across all players — `gd_player` is not part of it — and it must be checked before a game is deconstructed.
- [x] D1 — Data repair on local (manual SQL, given in chat): back up, delete the 5,046 `tgam_game_positions` rows and 206 `tgd_gamesdecon` rows for ids 75369–75574, recount `pos_reached`/`pos_move_num` for the 4,606 affected positions; then Build Tree + Sync Position Tree + habits rebuild from the pipeline page. Prod not yet checked. SQL handed to the user in chat 2026-10-02 (D1 repair + D4 index) — user confirmed 2026-10-02 that all of it has been run on local (backups `bk1_tgd_gamesdecon`, `bk1_tgam_game_positions`; deletes; reach recount; `CREATE UNIQUE INDEX idx_tgd_chesscom_uuid`). Still for the user: Build Tree, Sync Position Tree and habits rebuild from the pipeline page. `scripts/schema.sql` does not yet have the index (D4).
- [x] D2 — Check `gd_chesscom_uuid` (alone, uncached) before a game is deconstructed in `deconstructGames_Player` — user decision 2026-10-02: option B, a per-game lookup. Inside the loop, before a raw game is deconstructed, look up its `gr_chesscom_uuid` in `tgd_gamesdecon` on `gd_chesscom_uuid` alone — `table_fetch`, `limit: 1`, `skipCache: true`, the same check-then-write shape `upsertEcoReference` already uses in this file; if a row exists, count the game as skipped and continue; if the lookup itself fails, log 'E', count an error and do not insert. Also add `skipCache: true` to the batch fetch at line 48 (a pipeline "next batch" read). Options not taken: A mirror `deconstructGames_Master`'s existing-uuid set (first recommended by Claude), C NOT EXISTS with `skipCache: true` only
- [x] D3 — Drop `AND d.gd_player = r.gr_player` from every "not yet deconstructed" match so all agree with the uuid-only key: `deconstructGames_Player.ts:50` and `:230` (`getUndeconstructedCount`, also uncached-read), `pipelineStatus.ts:44` and `:118`, `owner/pipelinegames/page.tsx:96` (SQL preview), `lib/deconstruct-games.ts:63`, and the wording in `src/ui/dataflow/sections.tsx:233`
- [x] D4 — Unique index on `tgd_gamesdecon (gd_chesscom_uuid)`: manual SQL after D1, plus `scripts/schema.sql` — index name `idx_tgd_chesscom_uuid` (agreed 2026-10-02)

## Changes

### Phase 1 — proposed
No changes. No `require()`, `require.resolve` or `module.exports` in `src/`, `lib/` or the root config files (`next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts` are all ESM). The only matches are inside the vendored, minified `public/stockfish/stockfish-18-lite-single.js`, which is out of scope.

### Phase 1 — applied
No changes.

### Phase 2 — proposed
31 items across 19 files. Scope scanned: `src/`, `lib/`, root config files.

**lib/cron-*.ts (9 files, same shape)** — `main().catch(err => { console.error(err); process.exit(1) })` → the handler moves inside `main()` as `try { …existing two lines… } catch (err) { console.error(err); process.exit(1) }`, and the last line becomes a plain `main()`. Top-level `await` is not used because `package.json` has no `"type": "module"`.
2.1 lib/cron-build-habits.ts:15
2.2 lib/cron-build-tree.ts:16
2.3 lib/cron-deepen-popular.ts:16
2.4 lib/cron-evaluate-game-endings.ts:16
2.5 lib/cron-evaluate-positions.ts:16
2.6 lib/cron-purge.ts:15
2.7 lib/cron-sync-tpos.ts:15
2.8 lib/cron-sync.ts:15
2.9 lib/cron-update-cp-change.ts:15

**src/app/owner/pipelinegames/page.tsx** — seven fire-and-forget `getPipelineRates().then(setRates)` calls, each inside a handler's `try`. A plain `await` there would block the handler and route a failure into that step's error message, so the proposal keeps them fire-and-forget through a new helper that mirrors the existing `doRefreshStepN` one-liners.
2.10 after `doRefreshDeepenPopular` (line 276) — add helper `async function doRefreshRates() { setRates(await getPipelineRates()) }` with a dashed title header. New function name: `doRefreshRates`.
2.11 :335 — `getPipelineRates().then(setRates)` → `doRefreshRates()`
2.12 :366 — same
2.13 :396 — same
2.14 :430 — same
2.15 :490 — same
2.16 :550 — same
2.17 :582 — same

**src/app/position/[id]/page.tsx**
2.18 :41 — `getPositionDetail_player(posId, player).then(d => { setData(d); setLoading(false) })` → inner `async function load() { const d = await getPositionDetail_player(posId, player); setData(d); setLoading(false) }` then `load()`. No `catch` added (there was none).

**src/lib/fide/fideStaging.ts** — event-callback bridges inside `new Promise`; each callback becomes `async` with a `try/catch` that calls `reject`.
2.19 :146 — `flushFullChunks().then(() => readStream.resume()).catch(reject)` → `try { await flushFullChunks(); readStream.resume() } catch (err) { reject(err) }` (the `'data'` callback becomes `async`)
2.20 :150-153 — `flushFullChunks().then(…writeChunk(pending)…).then(resolve).catch(reject)` → `try { await flushFullChunks(); if (pending.length > 0) await writeChunk(pending); resolve() } catch (err) { reject(err) }` (the `'end'` callback becomes `async`)
2.21 :264-280 — `;(async () => { … })().catch(reject)` → the loop body is wrapped in `try { … } catch (err) { reject(err) }` inside the same IIFE, and the trailing `.catch(reject)` is removed

**src/ui/AppNav.tsx**
2.22 :91-93 — `getMasterPlayers('', true).then(rows => setMasterCards(rows.slice(0, 4))).catch(() => setMasterCards([]))` → inner `async function load()` with `try { const rows = await getMasterPlayers('', true); setMasterCards(rows.slice(0, 4)) } catch { setMasterCards([]) }`, then `load()`

**src/ui/board/ChessBoardView_shared.tsx** — each becomes an inner `async function load()` with `try/catch`, handler bodies preserved, `cancelled` checks unchanged.
2.23 :188-196 — `getMovePlayCounts_player(fens, player).then(…).catch(…)`
2.24 :213-215 — `getMoveSummaryForPosition_player(fen, player).then(…).catch(…)`
2.25 :272-277 — `Promise.all([…]).then(([games, totalRows]) => …).catch(…)` → `const [games, totalRows] = await Promise.all([…])`

**src/ui/board/MasterGameView_master.tsx**
2.26 :224-232 — `getMovePlayCounts_master(fens, row.mgd_player).then(…).catch(…)` → inner `async function load()` with `try/catch` (parallel of 2.23)

**`load().catch(…)` / `fetchPage().catch(…)` on an existing inner async function** — the handler moves inside that function as a `try/catch` around its body, and the call becomes a plain `load()` / `fetchPage()`.
2.27 src/ui/charts/OpeningScoreChart.tsx:162 — `load().catch(() => { if (!cancelled) setLoading(false) })`
2.28 src/ui/charts/RatingChart.tsx:132 — `load().catch(() => { if (!cancelled) finish() })`
2.29 src/ui/charts/TerminationChart.tsx:119 — `load().catch(() => { if (!cancelled) setLoading(false) })`
2.30 src/ui/games/GameList.tsx:322 — `fetchPage().catch(() => { if (!cancelled) setLoading(false) })`
2.31 src/ui/games/MasterGameList.tsx:232 — `fetchPage().catch(() => { if (!cancelled) setLoading(false) })`

Flagged (not changed):
- lib/deconstruct-games.ts:166 — `run().catch(err => { console.error('Failed:', err); process.exit(1) })`. `run()` is ~130 lines with its own `try/finally` (`client.end()`); moving the handler inside means nesting the whole body in a second `try`, or adding a `catch` to the existing `try`, which would exit before `client.end()` runs.
- lib/sync-games.ts:81 — same shape and same reason (`run()` with its own `try/finally`).

Not targets (left alone): the `void (async () => { try … catch … })()` blocks in `ChessBoardView_shared.tsx` and `MasterGameView_master.tsx` `runAnalysis` — already `await` + `try/catch`, and not inside a `useEffect`.

### Phase 2 — applied
User reply: `approve` (all 31 items). `npx tsc --noEmit` passed after each file (once for the nine identical `lib/cron-*.ts` edits together).
- lib/cron-build-habits.ts — 1 edit
- lib/cron-build-tree.ts — 1 edit
- lib/cron-deepen-popular.ts — 1 edit
- lib/cron-evaluate-game-endings.ts — 1 edit
- lib/cron-evaluate-positions.ts — 1 edit
- lib/cron-purge.ts — 1 edit
- lib/cron-sync-tpos.ts — 1 edit
- lib/cron-sync.ts — 1 edit
- lib/cron-update-cp-change.ts — 1 edit
- src/app/owner/pipelinegames/page.tsx — 8 edits (new `doRefreshRates` helper + 7 call sites)
- src/app/position/[id]/page.tsx — 1 edit (new inner `load`, with a dashed title header)
- src/lib/fide/fideStaging.ts — 3 edits
- src/ui/AppNav.tsx — 1 edit (new inner `load`, with a dashed title header)
- src/ui/board/ChessBoardView_shared.tsx — 3 edits (three new inner `load` functions, each with a dashed title header; `fen!` used inside 2.24 and 2.25 because narrowing does not carry into a function declaration — same as the existing Masters effect)
- src/ui/board/MasterGameView_master.tsx — 1 edit (new inner `load`, with a dashed title header)
- src/ui/charts/OpeningScoreChart.tsx — 1 edit
- src/ui/charts/RatingChart.tsx — 1 edit
- src/ui/charts/TerminationChart.tsx — 1 edit
- src/ui/games/GameList.tsx — 1 edit
- src/ui/games/MasterGameList.tsx — 1 edit

Flagged (not changed) — still open:
- lib/deconstruct-games.ts:166 — `run().catch(…)`, `run()` has its own `try/finally`
- lib/sync-games.ts:81 — same
- Options explained to the user (add a `catch` to the existing `try` — changes behaviour; wrap the whole body in an outer `try/catch` — identical behaviour, large re-indent; leave as-is). User replied `continue` without choosing, so both stay flagged and unchanged.

### Phase 3 — proposed
No changes. All 101 `table_query` calls in `src/` and `lib/` already pass `table:` (a string literal or a module-level table-name constant such as `DECON_TABLE`).

### Phase 3 — applied
No changes.

### Phase 4 — proposed
121 items across 66 files. Every item is `return <call or ternary>` → `const <name> = <same expression>; return <name>`. The expression itself is not altered; `await` is kept exactly as written (4.x `lichess.ts:65` keeps its `await`, `sync.ts:152` stays un-awaited).

Names (for the user to check):
- `response` — every `NextResponse.json(…)` return in the `src/app/api/**` route handlers, used uniformly across all routes because most of them already hold a `result` in scope.
- `result` — the default, wherever no `result` is already in scope.
- Non-default names, used where `result` is already in scope or the value has an obvious name: `opposite`, `count`, `openingScores`, `terminationStats`, `earliestGameDate`, `ratingOverTime`, `masterPlayers`, `players`, `recentRunIds`, `moveSummary`, `games`, `total`, `cnt`, `mstid`, `masterGames`, `objectiveResult`, `san` — each shown on its item below.

Where pulling the value out of the `return` loses the type the function's return type was supplying (for example `new Promise(…)`, `new Set()`), an explicit type is added to the `const`. If an item still fails the type-check it is undone and moved to Flagged.

**src/app/analyze/page.tsx**
4.1 :80 (`oppositeResult`) — `return result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw'` → `const opposite = …; return opposite`

**src/app/api/analysis/build-habits/route.ts**
4.2 :17 (`GET`) — `return NextResponse.json({ ok: true, built })` → `const response = …; return response`
4.3 :20 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/build-tree/route.ts**
4.4 :25 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.5 :28 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/deconstruct/route.ts**
4.6 :53 (`GET`) — `return NextResponse.json({ ok: true, results })` → `const response = …; return response`
4.7 :55 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/deepen-popular-positions/route.ts**
4.8 :22 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.9 :25 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/diag/route.ts**
4.10 :25 (`GET`) — `return NextResponse.json({ error: [totalResult, forPlayerResult, sampleResult].filter(r => !r.ok)…` → `const response = …; return response`
4.11 :30 (`GET`) — `return NextResponse.json({ total_rows: totalResult.data, rows_for_player: forPlayerResult.data, p…` → `const response = …; return response`

**src/app/api/analysis/evaluate-game-endings/route.ts**
4.12 :23 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.13 :26 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/evaluate-positions/route.ts**
4.14 :23 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.15 :26 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/purge/route.ts**
4.16 :20 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.17 :23 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/sync-tpos/route.ts**
4.18 :21 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.19 :24 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/analysis/update-cp-change/route.ts**
4.20 :20 (`GET`) — `return NextResponse.json({ ok: true, updated })` → `const response = …; return response`
4.21 :23 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/cron/sync/route.ts**
4.22 :18 (`GET`) — `return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` → `const response = …; return response`
4.23 :24 (`GET`) — `return NextResponse.json(result)` → `const response = …; return response`
4.24 :33 (`GET`) — `return NextResponse.json({ error: String(err) }, { status: 500 })` → `const response = …; return response`

**src/app/api/fide/download-zip/route.ts**
4.25 :21 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.26 :24 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/fide/parse/route.ts**
4.27 :20 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.28 :23 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/fide/populate-top-players/route.ts**
4.29 :21 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.30 :24 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/fide/refresh-ratings/route.ts**
4.31 :21 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.32 :24 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/fide/unzip/route.ts**
4.33 :20 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.34 :23 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/historicalgames/deconstruct/route.ts**
4.35 :21 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.36 :24 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/historicalgames/upload/route.ts**
4.37 :23 (`POST`) — `return NextResponse.json({ ok: false, error: 'collection and pgnText are required' }, { status: 4…` → `const response = …; return response`
4.38 :28 (`POST`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.39 :31 (`POST`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/mastergames/build-tree/route.ts**
4.40 :27 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.41 :30 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/mastergames/sync-tpos/route.ts**
4.42 :22 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.43 :25 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/api/mastergames/sync/route.ts**
4.44 :26 (`GET`) — `return NextResponse.json({ ok: false, error: 'player and year query params are required' }, { sta…` → `const response = …; return response`
4.45 :31 (`GET`) — `return NextResponse.json({ ok: true, ...result })` → `const response = …; return response`
4.46 :34 (`GET`) — `return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })` → `const response = …; return response`

**src/app/graph/page.tsx**
4.47 :224 (`ss`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/app/habits/page.tsx**
4.48 :304 (`ss`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/app/owner/pipelinegames/page.tsx**
4.49 :1121 (`n`) — `return val === undefined ? '—' : val.toLocaleString()` → `const result = …; return result`

**src/app/owner/pipelinehistoricalgames/page.tsx**
4.50 :530 (`n`) — `return val === undefined ? '—' : val.toLocaleString()` → `const result = …; return result`

**src/app/owner/pipelinemastergames/page.tsx**
4.51 :493 (`n`) — `return val === undefined ? '—' : val.toLocaleString()` → `const result = …; return result`

**src/app/owner/pipelinemasters/page.tsx**
4.52 :528 (`n`) — `return val === undefined ? '—' : val.toLocaleString()` → `const result = …; return result`

**src/lib/actions/chesscomSearch.ts**
4.53 :141 (`parseRating`) — `return match ? parseInt(match[0], 10) : null` → `const result = …; return result`

**src/lib/actions/deconstructGames_Player.ts**
4.54 :240 (`getUndeconstructedCount`) — `return Number(result.data[0].count)` → `const count = …; return count`

**src/lib/actions/games.ts**
4.55 :669 (`getOpeningScores`) — `return result.data.map((r: any) => ({ eco_code: r.gd_eco_code ?? '', opening_name: r.gd_opening_n…` → `const openingScores = …; return openingScores`
4.56 :743 (`getTerminationStats`) — `return result.data.map((r: any) => ({ termination: r.termination, win: Number(r.win), loss: Numbe…` → `const terminationStats = …; return terminationStats`
4.57 :853 (`getEarliestGameDate`) — `return new Date(Number(minTime) * 1000).toISOString().slice(0, 10)` → `const earliestGameDate = …; return earliestGameDate`
4.58 :968 (`getPlayerRatingOverTime`) — `return result.data.map((r: any) => ({ date: r.date, avgRating: r.avg_rating, games: r.games }))` → `const ratingOverTime = …; return ratingOverTime`

**src/lib/actions/lichess.ts**
4.59 :65 (`getMastersExplorer`) — `return await res.json()` → `const result = …; return result`

**src/lib/actions/masterPlayers.ts**
4.60 :82 (`getMasterPlayers`) — `return result.data.map((r: any) => ({ mstid: Number(r.mst_mstid), firstName: (r.mst_first_name as…` → `const masterPlayers = …; return masterPlayers`
4.61 :223 (`getMasterSyncYearStatus`) — `return new Set()` → `const players = …; return players`
4.62 :225 (`getMasterSyncYearStatus`) — `return new Set(result.data.map((r: any) => r.mgd_player as string))` → `const players = …; return players`
4.63 :240 (`combineName`) — `return firstName ? `${firstName} ${lastName}` : lastName` → `const result = …; return result`

**src/lib/actions/pipelineLog.ts**
4.64 :270 (`getRecentRunIds`) — `return result.data.map((r: any) => ({ runId: Number(r.pip_run_id), created: r.pip_created }))` → `const recentRunIds = …; return recentRunIds`

**src/lib/actions/players.ts**
4.65 :244 (`getPlayers`) — `return mapped.sort((a: { player: string }, b: { player: string }) => a.player === DEFAULT_PLAYER …` → `const players = …; return players`

**src/lib/actions/sync.ts**
4.66 :152 (`getLatestGameEndTime`) — `return getPlayerLastSyncedEndTime(player)` → `const result = …; return result`

**src/lib/analysis/buildHabits.ts**
4.67 :152 (`fetchHabitAggregates`) — `return selectRes.data.map((r: any) => ({ player: r.player, posId: Number(r.pos_id), moveSan: r.mo…` → `const result = …; return result`

**src/lib/analysis/chessdb_master.ts**
4.68 :167 (`getMoveSummaryForPosition_master`) — `return rows.map(r => { const pose = r.resulting_fen ? poseEvals[truncateFen(r.resulting_fen)] : u…` → `const moveSummary = …; return moveSummary`
4.69 :301 (`fetchGamesForPosition_master`) — `return result.data.map(mapMasterPositionGameRow)` → `const games = …; return games`

**src/lib/analysis/chessdb_player.ts**
4.70 :369 (`fetchGamesForPosition_player`) — `return result.data.map(mapPositionGameRow)` → `const games = …; return games`
4.71 :630 (`getHabitsData_player`) — `return queryResult.data.map((r: any) => ({ pos_id: Number(r.pos_id), pos_fen: r.pos_fen, pos_colo…` → `const result = …; return result`
4.72 :705 (`getHabitsCount_player`) — `return result.data.length > 0 ? Number(result.data[0].total) : 0` → `const total = …; return total`

**src/lib/analysis/enrichPositionsStockfish.ts**
4.73 :39 (`nextLine`) — `return Promise.resolve(this.pending.shift()!)` → `const result = …; return result` (braces added to the one-line `if`)
4.74 :40 (`nextLine`) — `return new Promise(resolve => { this.waiter = resolve })` → `const result = …; return result`
4.75 :468 (`countRemainingPopularPositions`) — `return parseInt(rows.data[0]?.cnt ?? '0')` → `const cnt = …; return cnt`
4.76 :518 (`countRemainingPopularPositionsByTier`) — `return POPULAR_POSITION_DEPTH_TIERS_Player.map(t => ({ depth: t.depth, remaining: 0 }))` → `const result = …; return result`
4.77 :521 (`countRemainingPopularPositionsByTier`) — `return POPULAR_POSITION_DEPTH_TIERS_Player.map(t => ({ depth: t.depth, remaining: parseInt(r[`d${…` → `const result = …; return result`
4.78 :745 (`countRemainingPositions`) — `return parseInt(result.data[0]?.cnt ?? '0')` → `const cnt = …; return cnt`
4.79 :856 (`getGamesNeedingFinalEval`) — `return rows.data.map((r: any) => ({ gdid: Number(r.gd_gdid), pgn: r.gd_pgn as string }))` → `const result = …; return result`

**src/lib/analysis/evalSessionCache.ts**
4.80 :25 (`getCachedEval`) — `return cache.get(truncateFen(fen))` → `const result = …; return result`

**src/lib/analysisTree.ts**
4.81 :261 (`getMainLineIndex`) — `return tree.mainLine.indexOf(node)` → `const result = …; return result`

**src/lib/backNav.ts**
4.82 :58 (`popBackTarget`) — `return newQs ? `${path}?${newQs}` : path` → `const result = …; return result`
4.83 :70 (`readStack`) — `return raw ? JSON.parse(raw) as string[] : []` → `const result = …; return result`

**src/lib/chesscom.ts**
4.84 :59 (`fetchRecentGames`) — `return games.slice(-count)` → `const result = …; return result`

**src/lib/fen.ts**
4.85 :15 (`truncateFen`) — `return fen.split(' ').slice(0, 4).join(' ')` → `const result = …; return result`
4.86 :52 (`applyUciMove`) — `return move ? g.fen() : null` → `const result = …; return result`

**src/lib/fide/fidePipeline.ts**
4.87 :263 (`findUnlinkedRowByName`) — `return Number(bySurname[0].mst_mstid)` → `const mstid = …; return mstid` (braces added to the one-line `if`)
4.88 :266 (`findUnlinkedRowByName`) — `return Number(byFirstNameToo[0].mst_mstid)` → `const mstid = …; return mstid` (braces added to the one-line `if`)

**src/lib/formatCp.ts**
4.89 :15 (`formatCp`) — `return cp > 0 ? `M${10000 - cp}` : `-M${10000 + cp}`` → `const result = …; return result`
4.90 :18 (`formatCp`) — `return cp > 0 ? `+${val}` : val` → `const result = …; return result`

**src/lib/historicalPlayerSlug.ts**
4.91 :19 (`historicalPlayerSlug`) — `return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, '-')` → `const result = …; return result`

**src/lib/master/importHistoricalGames.ts**
4.92 :342 (`splitIntoGames`) — `return pgnText .split(/\n(?=\[Event )/) .map(g => g.trim()) .filter(g => g.length > 0)` → `const result = …; return result`
4.93 :385 (`parseHistoricalDate`) — `return Math.floor(Date.UTC(year, month - 1, day) / 1000)` → `const result = …; return result`

**src/lib/master/masterGamesList.ts**
4.94 :170 (`fetchFilteredMasterGames`) — `return result.data.map((row: any) => ({ ...row, mgd_player_name: nameMap[(row.mgd_player as strin…` → `const masterGames = …; return masterGames`
4.95 :323 (`fetchMasterGamesForFenPage`) — `return gamesResult.data.map((r: any) => ({ mgd_mgdid: r.mgd_mgdid, move_played: r.mgam_move_playe…` → `const result = …; return result`
4.96 :371 (`getMasterGamesForFenCount`) — `return countResult.data.length > 0 ? Number(countResult.data[0].total) : 0` → `const total = …; return total`

**src/lib/objectiveGameResult.ts**
4.97 :23 (`objectiveGameResult`) — `return whiteWon ? '1-0' : '0-1'` → `const objectiveResult = …; return objectiveResult`

**src/lib/parsePgn.ts**
4.98 :105 (`parsePgnOpening`) — `return moves.slice(0, halfMoves).join(' ')` → `const result = …; return result`
4.99 :119 (`parsePlayedDate`) — `return utcDate.replace(/\./g, '-')` → `const result = …; return result`

**src/lib/stockfish.ts**
4.100 :103 (`uciToSan`) — `return result ? result.san : uciMove` → `const san = …; return san`
4.101 :145 (`init`) — `return new Promise((resolve, reject) => { try { this.worker = new Worker('/stockfish/stockfish-18…` → `const result = …; return result`
4.102 :308 (`evaluate`) — `return new Promise((resolve) => { let stockBestCp = 0 let stockBestMove = '' let stockBestPv = ''…` → `const result = …; return result`

**src/lib/winPct.ts**
4.103 :17 (`winPct`) — `return Math.round(((wins + draws * 0.5) / times) * 100)` → `const result = …; return result`

**src/ui/AppNav.tsx**
4.104 :123 (`buildHref`) — `return qs ? `${base}?${qs}` : base` → `const result = …; return result`

**src/ui/analysis/PipelineLogTable.tsx**
4.105 :253 (`formatCreated`) — `return new Date(pipCreated).toLocaleString(undefined, { hour12: false })` → `const result = …; return result`

**src/ui/analysis/PositionDetail.tsx**
4.106 :201 (`pct`) — `return m.mov_times > 0 ? Math.round((count / m.mov_times) * 100) : 0` → `const result = …; return result`

**src/ui/board/AlternativeLines_shared.tsx**
4.107 :111 (`formatLine`) — `return parts.join(' ')` → `const result = …; return result`

**src/ui/board/MovesListTable.tsx**
4.108 :92 (`pct`) — `return total > 0 ? Math.round((count / total) * 100) : 0` → `const result = …; return result`

**src/ui/charts/OpeningScoreChart.tsx**
4.109 :338 (`sso`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/ui/charts/RatingChart.tsx**
4.110 :301 (`tickFormatter`) — `return d.getMonth() === 0 ? String(d.getFullYear()) : ''` → `const result = …; return result`
4.111 :316 (`labelFormatter`) — `return chartSpanDays <= 92 ? d.toLocaleString('default', { day: 'numeric', month: 'long', year: '…` → `const result = …; return result`
4.112 :371 (`aggregateForPlayer`) — `return rows .map(row => ({ date: new Date(row.gd_end_time * 1000).toISOString(), avgRating: row.g…` → `const result = …; return result`
4.113 :398 (`aggregateForPlayer`) — `return Array.from(groups.entries()) .sort(([a], [b]) => a.localeCompare(b)) .map(([key, ratings])…` → `const result = …; return result`
4.114 :416 (`parseDate`) — `return new Date(d)` → `const result = …; return result` (braces added to the one-line `if`)
4.115 :418 (`parseDate`) — `return new Date(y, m - 1, day ?? 1)` → `const result = …; return result`
4.116 :434 (`generateDateTicks`) — `return Array.from({ length: count }, (_, i) => Math.round(fromMs + (i / (count - 1)) * (toMs - fr…` → `const result = …; return result`

**src/ui/charts/TerminationChart.tsx**
4.117 :235 (`ss`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/ui/games/ChessComSearchPanel_shared.tsx**
4.118 :288 (`readChesscomCache`) — `return raw ? JSON.parse(raw) as ChesscomCache : null` → `const result = …; return result`

**src/ui/games/GameList.tsx**
4.119 :605 (`ss`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/ui/games/MasterGameList.tsx**
4.120 :471 (`ss`) — `return v ? JSON.parse(v) as T : fallback` → `const result = …; return result`

**src/ui/owner/ConstantsViewer.tsx**
4.121 :167 (`buildFunctionIndex`) — `return index.sort((a, b) => a.usedIn.localeCompare(b.usedIn))` → `const result = …; return result`

Flagged (not changed):
- src/ui/board/ChessBoardView_shared.tsx:1030 — ternary returned from an immediately-invoked arrow `(() => { … })()`; neither a named function nor a callback passed as an argument, so the rule's scope is unclear.
- src/ui/board/MasterGameView_master.tsx:795 — same (the master parallel).
- src/ui/games/GameList.tsx:544 — ternary returned from an immediately-invoked arrow inside JSX; belongs to Phase 5 (JSX calculation).
- src/ui/owner/ConstantsViewer.tsx:144 — call returned from an immediately-invoked arrow inside JSX; belongs to Phase 5.

Not targets (exempt inline callbacks): ChessBoardView_shared.tsx:777 and MasterGameView_master.tsx:634 (`lines.map` callbacks), MasterMovesDbPanel.tsx:66 (`.map` callback), RatingChart.tsx:156 and :171 and FilterGraphTimeClassSelect.tsx:47 (`useMemo` callbacks).

### Phase 4 — applied
User reply: `approve` (all 121 items). 121 edits across 66 files.

Deviations from the per-file routine:
- The edits were applied in one scripted pass and `npx tsc --noEmit` was run once afterwards, not after each of the 66 files. It reported 5 errors in 3 files, all the anticipated lost-return-type case; each was fixed by adding the explicit type, and the type-check then passed. Nothing was undone.
- Explicit types added: `new Set<string>()` (masterPlayers.ts, 4.x :223), `new Promise<string>(…)` (enrichPositionsStockfish.ts `nextLine`), `new Promise<void>(…)` (stockfish.ts `init`), `new Promise<{ cp: number; bestMove: string; pv: string }>(…)` (stockfish.ts `evaluate`).
- The six one-line `ss`/`sso` session-storage helpers (graph/page.tsx, habits/page.tsx, OpeningScoreChart.tsx, TerminationChart.tsx, GameList.tsx, MasterGameList.tsx) keep their one-line `try { … } catch { … }` layout: `return v ? JSON.parse(v) as T : fallback` became `const result = v ? JSON.parse(v) as T : fallback; return result` on the same line.
- A re-scan after applying finds no remaining direct return of a call or ternary outside the exempt inline callbacks and the four flagged IIFEs.

- src/app/analyze/page.tsx — 1 edit
- src/app/api/analysis/build-habits/route.ts — 2 edits
- src/app/api/analysis/build-tree/route.ts — 2 edits
- src/app/api/analysis/deconstruct/route.ts — 2 edits
- src/app/api/analysis/deepen-popular-positions/route.ts — 2 edits
- src/app/api/analysis/diag/route.ts — 2 edits
- src/app/api/analysis/evaluate-game-endings/route.ts — 2 edits
- src/app/api/analysis/evaluate-positions/route.ts — 2 edits
- src/app/api/analysis/purge/route.ts — 2 edits
- src/app/api/analysis/sync-tpos/route.ts — 2 edits
- src/app/api/analysis/update-cp-change/route.ts — 2 edits
- src/app/api/cron/sync/route.ts — 3 edits
- src/app/api/fide/download-zip/route.ts — 2 edits
- src/app/api/fide/parse/route.ts — 2 edits
- src/app/api/fide/populate-top-players/route.ts — 2 edits
- src/app/api/fide/refresh-ratings/route.ts — 2 edits
- src/app/api/fide/unzip/route.ts — 2 edits
- src/app/api/historicalgames/deconstruct/route.ts — 2 edits
- src/app/api/historicalgames/upload/route.ts — 3 edits
- src/app/api/mastergames/build-tree/route.ts — 2 edits
- src/app/api/mastergames/sync-tpos/route.ts — 2 edits
- src/app/api/mastergames/sync/route.ts — 3 edits
- src/app/graph/page.tsx — 1 edit
- src/app/habits/page.tsx — 1 edit
- src/app/owner/pipelinegames/page.tsx — 1 edit
- src/app/owner/pipelinehistoricalgames/page.tsx — 1 edit
- src/app/owner/pipelinemastergames/page.tsx — 1 edit
- src/app/owner/pipelinemasters/page.tsx — 1 edit
- src/lib/actions/chesscomSearch.ts — 1 edit
- src/lib/actions/deconstructGames_Player.ts — 1 edit
- src/lib/actions/games.ts — 4 edits
- src/lib/actions/lichess.ts — 1 edit
- src/lib/actions/masterPlayers.ts — 4 edits
- src/lib/actions/pipelineLog.ts — 1 edit
- src/lib/actions/players.ts — 1 edit
- src/lib/actions/sync.ts — 1 edit
- src/lib/analysis/buildHabits.ts — 1 edit
- src/lib/analysis/chessdb_master.ts — 2 edits
- src/lib/analysis/chessdb_player.ts — 3 edits
- src/lib/analysis/enrichPositionsStockfish.ts — 7 edits
- src/lib/analysis/evalSessionCache.ts — 1 edit
- src/lib/analysisTree.ts — 1 edit
- src/lib/backNav.ts — 2 edits
- src/lib/chesscom.ts — 1 edit
- src/lib/fen.ts — 2 edits
- src/lib/fide/fidePipeline.ts — 2 edits
- src/lib/formatCp.ts — 2 edits
- src/lib/historicalPlayerSlug.ts — 1 edit
- src/lib/master/importHistoricalGames.ts — 2 edits
- src/lib/master/masterGamesList.ts — 3 edits
- src/lib/objectiveGameResult.ts — 1 edit
- src/lib/parsePgn.ts — 2 edits
- src/lib/stockfish.ts — 3 edits
- src/lib/winPct.ts — 1 edit
- src/ui/AppNav.tsx — 1 edit
- src/ui/analysis/PipelineLogTable.tsx — 1 edit
- src/ui/analysis/PositionDetail.tsx — 1 edit
- src/ui/board/AlternativeLines_shared.tsx — 1 edit
- src/ui/board/MovesListTable.tsx — 1 edit
- src/ui/charts/OpeningScoreChart.tsx — 1 edit
- src/ui/charts/RatingChart.tsx — 7 edits
- src/ui/charts/TerminationChart.tsx — 1 edit
- src/ui/games/ChessComSearchPanel_shared.tsx — 1 edit
- src/ui/games/GameList.tsx — 1 edit
- src/ui/games/MasterGameList.tsx — 1 edit
- src/ui/owner/ConstantsViewer.tsx — 1 edit

Flagged (not changed) — still open: the four immediately-invoked arrows listed in the proposal (ChessBoardView_shared.tsx, MasterGameView_master.tsx, GameList.tsx, ConstantsViewer.tsx).

### Phase 4 — amendment (proposed, awaiting approval)
User comment on the flagged ChessBoardView_shared.tsx:1030: "this should change". The flagged item becomes a proposed item, together with its identical master parallel. The name is `depthRange`, not `result`, because both components already hold a component-level `result`.
4.122 src/ui/board/ChessBoardView_shared.tsx:1030 (IIFE assigned to `existingDepthRange`) — ``return minDepth === maxDepth ? String(minDepth) : `${minDepth}–${maxDepth}` `` → `const depthRange = …; return depthRange`
4.123 src/ui/board/MasterGameView_master.tsx:795 (IIFE assigned to `existingDepthRange`) — same line, same change (the master parallel)

### Phase 4 — amendment applied
User reply: `approve` (4.122 and 4.123). `npx tsc --noEmit` passed after each file.
- src/ui/board/ChessBoardView_shared.tsx — 1 edit
- src/ui/board/MasterGameView_master.tsx — 1 edit

Flagged (not changed) — still open, carried into Phase 5: src/ui/games/GameList.tsx:544 and src/ui/owner/ConstantsViewer.tsx:144 (immediately-invoked arrows inside JSX).

### Phase 5 — audit summary and scope decisions
Audit: about 550 JSX calculations in 45 `.tsx` files (213 ternaries, 108 calls, 80 template strings, 64 `&&`/`||`/`??` expressions, 63 `&&` on an inline condition, the rest arithmetic/comparison/literals with computed values). 155 sit inside a `.map()` row callback.

Decisions agreed with the user before any proposal was written:
- **Batching:** by file group, each sub-batch (5a, 5b, …) with its own proposal list and approval.
- **Calls:** plain function calls in JSX (`{n(x)}`, `{formatCp(cp)}`, `value={String(limit)}`) move to named consts too.
- **Row callbacks:** calculations inside a `.map()` callback become named consts inside that callback (block body, computed before its own `return`), not a prepared array above the component's return.
- **Pipeline pages deferred:** the four `/owner` pipeline pages (`pipelinegames`, `pipelinemastergames`, `pipelinehistoricalgames`, `pipelinemasters` — about 230 items) are left out of Phase 5 and flagged. Every step row there is a hand-written copy of one shape; Phase 15 records a finding to extract a shared step-row component first, so the calculations live once inside it.

Sub-batches:
- 5a — `ChessBoardView_shared.tsx` + `MasterGameView_master.tsx` (the parallel pair)
- 5b — the other `src/ui/board/` files
- 5c — `src/ui/analysis/` + `src/ui/games/`
- 5d — everything else (app pages, AppNav, AppShell, charts, filters, owner, player, dataflow)

Flagged (not changed): src/app/owner/pipelinegames/page.tsx (100 items), src/app/owner/pipelinemastergames/page.tsx (47), src/app/owner/pipelinehistoricalgames/page.tsx (43), src/app/owner/pipelinemasters/page.tsx (40) — deferred by user decision, see above.

### Phase 5a — proposed (ChessBoardView_shared.tsx + MasterGameView_master.tsx)
79 items in 2 files. Every new `const` goes after the hooks and just before the JSX `return` (in `MasterGameView_master`, after its `if (!tree) return null`). The same value gets the same name in both files. Line numbers are the current ones.

Conventions used throughout:
- A JSX ternary `{cond ? <A/> : <B/>}` becomes two named booleans and `{showA && <A/>}{showB && <B/>}`.
- An immediately-invoked arrow inside JSX (`{cond && (() => { … return <X/> })()}`) is removed: its local consts move above the `return` and the JSX is rendered directly behind a named boolean.
- A `rows={list.map(x => ({ … }))}` prop that builds data (not JSX) moves above the `return` as a named array.
- Values that today sit behind a JSX null-check (`mastersData`, `deepAnalysisData`, `currentNode`) get the same guard in the `const` (e.g. `deepAnalysisData ? … : ''`).

**src/ui/board/ChessBoardView_shared.tsx** (44)
5a.1 :1055 — `{opening || 'Unknown'}` → `const openingLabel`
5a.2 :1066 — `{playerColor === 'white' ? game.black.username : game.white.username}` → `const topUsername`
5a.3 :1068 — `({playerColor === 'white' ? game.black.rating : game.white.rating})` → `const topRating`
5a.4 :1071 — `{result === 'win' ? '0' : result === 'loss' ? '1' : '1/2'}` → `const topScore`
5a.5 :1079 — `options={{ position: displayGame.current.fen(), … }}` → `const boardOptions = { … }`
5a.6 :1095 — bottom player username ternary → `const bottomUsername`
5a.7 :1097 — bottom player rating ternary → `const bottomRating`
5a.8 :1100 — `{result === 'win' ? '1' : result === 'loss' ? '0' : '1/2'}` → `const bottomScore`
5a.9 :1105 — `{gdid != null && <span>…}` → `const showGdid = gdid != null`
5a.10 :1106 — `{formatGameDate(game.end_time)}` → `const endTimeLabel`
5a.11 :1107 — `{game.termination && <span>…}` → `const showTermination = !!game.termination`
5a.12 :1109 — `{game.finalEval != null ? formatCp(game.finalEval) : '—'}` → `const finalEvalLabel`
5a.13 :1114 — `{!onMainLine && (…)}` → `const showVariation = !onMainLine`
5a.14 :1134 — `depth={stockfishDepth ?? STOCKFISH_DEFAULTS.reanalyzeDepth}` → `const reanalyzeDepth`
5a.15 :1181 — `{getCurrentPositionFen()}` → `const currentPositionFen`
5a.16 :1183 — `{fenCopied ? 'Copied' : 'Copy FEN'}` → `const copyFenLabel`
5a.17 :1194 — `value={deepAnalysisDepth ?? STOCKFISH_DEFAULTS.deepAnalysisDepth}` → `const deepAnalysisDepthValue`
5a.18 :1200 — `value={String(deepAnalysisMultiPv ?? STOCKFISH_DEFAULTS.deepAnalysisMultiPv)}` → `const deepAnalysisMultiPvValue`
5a.19 :1205 — `{deepAnalyzing ? <Stop button> : <Analyze button>}` → `{deepAnalyzing && <Stop button>}` + `const showStartDeepAnalysis = !deepAnalyzing`
5a.20 :1211 — `{analyzing ? 'Game analysis running...' : 'Analyze Position'}` → `const startDeepAnalysisLabel`
5a.21 :1217 — `{(deepAnalysisData.nodes / 1000000).toFixed(1)}` → `const deepNodesLabel`
5a.22 :1219 — `{(deepAnalysisData.nps / 1000).toFixed(0)}` → `const deepNpsLabel`
5a.23 :1221 — `{(deepAnalysisData.timeMs / 1000).toFixed(1)}` → `const deepTimeLabel`
5a.24 :1230 — `results={deepAnalysisData?.lines ?? []}` → `const deepAnalysisLines`
5a.25 :1231 — `loading={deepAnalyzing && !deepAnalysisData}` → `const deepAnalysisLoading`
5a.26 :1245 — `{moveSummary.length === 0 ? <p>No games…</p> : <MovesListTable/>}` → `const showNoMoveSummary` + `const showMoveSummary`
5a.27 :1249 — `rows={moveSummary.map(m => ({ … }))}` → `const moveSummaryRows`
5a.28 :1269 — `{moveSummary.length > 0 && (() => { const positionGamesTotalPages = …; return <MyBox…/> })()}` → IIFE removed; `positionGamesTotalPages` becomes a `const` above the `return`; rendered behind `showMoveSummary`
5a.29 :1277 — `{positionGames.length === 0 ? <p>No games match…</p> : <GamesListTable/>}` → `const showNoPositionGames` + `const showPositionGames`
5a.30 :1281 — `rows={positionGames.map((g, i) => ({ … }))}` → `const positionGamesRows`
5a.31 :1296 — `currentKey={gdid != null ? String(gdid) : null}` → `const currentGameKey`
5a.32 :1305 — `{positionGamesTotalPages > 1 && (…)}` → `const showPositionGamesPagination`
5a.33 :1341 — `{!mastersData || mastersData.moves.length === 0 ? <p>No master games…</p> : (() => { const total = …; return <div…/> })()}` → `const showNoMastersMoves` + `const showMastersMoves`; IIFE removed; `total` becomes `const mastersTotal`
5a.34 :1349 — `{total.toLocaleString()}` → `const mastersTotalLabel`
5a.35 :1350 — `{total > 0 ? Math.round((mastersData.white / total) * 100) : 0}` → `const mastersWhitePct`
5a.36 :1351 — same for draws → `const mastersDrawsPct`
5a.37 :1352 — same for black → `const mastersBlackPct`
5a.38 :1355 — `rows={mastersData.moves.map(m => { … })}` → `const mastersMovesRows`
5a.39 :1372 — `{lichessMissingEval.missingCount > 0 && (…)}` → `const showAnalyzeMissing`
5a.40 :1375 — `disabled={lichessMissingEval.analyzing || analyzing || deepAnalyzing}` → `const analyzeMissingDisabled`
5a.41 :1378 — `{lichessMissingEval.analyzing ? \`Analyzing …\` : \`Analyze missing (…)\`}` → `const analyzeMissingLabel`
5a.42 :1393 — `{mastersData && mastersData.topGames.length > 0 && (() => { const filteredTopGames = …; return <MyBox…/> })()}` → IIFE removed; `const filteredTopGames` above the `return`; rendered behind `const showTopGames`
5a.43 :1403 — `{filteredTopGames.length === 0 ? <p>No games match…</p> : <GamesListTable/>}` → `const showNoFilteredTopGames` + `const showFilteredTopGames`
5a.44 :1407 — `rows={filteredTopGames.map((g, i) => ({ … }))}` → `const topGamesRows`

**src/ui/board/MasterGameView_master.tsx** (35) — the master parallel; same names for the same values
5a.45 :822 — `{row.mgd_opening_name || 'Unknown'}` → `const openingLabel`
5a.46 :823 — `{row.mgd_eco_code && <span>…}` → `const showEcoCode = !!row.mgd_eco_code`
5a.47 :833 — top player username ternary → `const topUsername`
5a.48 :835 — top player rating ternary → `const topRating`
5a.49 :838 — top score ternary → `const topScore`
5a.50 :844 — `options={{ … }}` → `const boardOptions = { … }`
5a.51 :860 — bottom player rating ternary → `const bottomRating`
5a.52 :863 — bottom score ternary → `const bottomScore`
5a.53 :869 — `{formatGameDate(row.mgd_end_time)}` → `const endTimeLabel`
5a.54 :870 — `{row.mgd_termination && <span>…}` → `const showTermination = !!row.mgd_termination`
5a.55 :873 — `{!onMainLine && (…)}` → `const showVariation = !onMainLine`
5a.56 :889 — `disabled={!currentNode}` → `const prevDisabled`
5a.57 :899 — `disabled={currentNode != null && currentNode.children.length === 0}` → `const nextDisabled`
5a.58 :951 — `{getCurrentPositionFen()}` → `const currentPositionFen`
5a.59 :953 — `{fenCopied ? 'Copied' : 'Copy FEN'}` → `const copyFenLabel`
5a.60 :967 — `value={String(deepAnalysisMultiPv)}` → `const deepAnalysisMultiPvValue`
5a.61 :972 — `{deepAnalyzing ? <Stop button> : <Analyze button>}` → `{deepAnalyzing && …}` + `const showStartDeepAnalysis = !deepAnalyzing`
5a.62 :978 — `{analyzing ? 'Game analysis running...' : 'Analyze Position'}` → `const startDeepAnalysisLabel`
5a.63 :984 — nodes → `const deepNodesLabel`
5a.64 :986 — nps → `const deepNpsLabel`
5a.65 :988 — time → `const deepTimeLabel`
5a.66 :997 — `results={deepAnalysisData?.lines ?? []}` → `const deepAnalysisLines`
5a.67 :998 — `loading={deepAnalyzing && !deepAnalysisData}` → `const deepAnalysisLoading`
5a.68 :1023 — Lichess Moves ternary + IIFE → `const showNoMastersMoves` + `const showMastersMoves`; IIFE removed; `const mastersTotal`
5a.69 :1031 — `{total.toLocaleString()}` → `const mastersTotalLabel`
5a.70 :1032 — `const mastersWhitePct`
5a.71 :1033 — `const mastersDrawsPct`
5a.72 :1034 — `const mastersBlackPct`
5a.73 :1037 — `rows={mastersData.moves.map(m => { … })}` → `const mastersMovesRows`
5a.74 :1054 — `{lichessMissingEval.missingCount > 0 && (…)}` → `const showAnalyzeMissing`
5a.75 :1057 — `disabled={… || analyzing || deepAnalyzing}` → `const analyzeMissingDisabled`
5a.76 :1060 — analyze-missing button label ternary → `const analyzeMissingLabel`
5a.77 :1074 — Lichess Games `&&` + IIFE → IIFE removed; `const filteredTopGames`; `const showTopGames`
5a.78 :1084 — `{filteredTopGames.length === 0 ? … : …}` → `const showNoFilteredTopGames` + `const showFilteredTopGames`
5a.79 :1088 — `rows={filteredTopGames.map((g, i) => ({ … }))}` → `const topGamesRows`

Flagged (not changed): none in these two files.

Not targets (left in JSX): `{eco && …}`, `{tree && …}`, `{currentNode && …}`, `{deepAnalysisData && …}`, `{saveAnalysisMessage && …}` (a named value on the left of `&&`); inline event-handler arrows (`onClick`, `onChange`, `onRowClick`, `setRowsPerPage`).

### Phase 5a — applied
User reply: `approve` (all 79 items). `npx tsc --noEmit` passed after each file. A re-scan finds no JSX calculation left in either file.
- src/ui/board/ChessBoardView_shared.tsx — 44 items (one block of named consts above the `return`, in three commented groups, plus the JSX edits)
- src/ui/board/MasterGameView_master.tsx — 35 items (same structure, placed after `if (!tree) return null`)

Additions needed to keep the type-check passing once values left the JSX (both files):
- `boardOptions` is typed `ChessboardOptions` (imported from `react-chessboard`), so `onPieceDrop`'s parameters keep their types.
- The hoisted row arrays are typed `MovesListRow[]` / `GamesListRow[]` (imported from `./MovesListTable` / `./GamesListTable`), so `highlight` keeps its `'pink' | 'green' | null` type.
- `topGamesRows` reads `mastersData?.moves` (optional chaining) because it is now computed outside the `mastersData &&` check; `filteredTopGames` is empty whenever `mastersData` is null, so the result is the same.

### Phase 5b — proposed (the other src/ui/board/ files)
61 items in 8 files. The audit script now also catches data-building `rows={list.map(…)}` props (7 project-wide, 2 in this batch). In a component, each new `const` goes just before the `return`; inside a `.map()` callback or a `for` loop that builds JSX, it goes inside that callback/loop before the JSX is created.

**src/ui/board/MoveTree_shared.tsx** (16)
5b.1 :55 (main-line `for` loop) — ``key={`main-${i}`}`` → `const mainKey`
5b.2 :60 — `isActive={currentNode?.id === whiteNode.id}` → `const whiteIsActive`
5b.3 :70 — `isActive={currentNode?.id === blackNode.id}` → `const blackIsActive` (`blackNode != null && …`, since it is now computed outside the `{blackNode && …}` check)
5b.4 :76 — `node={blackNode ?? undefined}` → `const blackEvalNode`
5b.5 :86 (white-variation loop) — ``key={`var-w-${branch.id}`}`` → `const whiteVariationKey`
5b.6 :106 (black-variation loop) — ``key={`var-b-${branch.id}`}`` → `const blackVariationKey`
5b.7 :110 — `startPly={i + 1}` → `const blackStartPly`
5b.8 :177 (`MoveBadge`) — ``overrideClass={`inline-flex … ${textColor} ${isActive ? … : …}`}`` → `const badgeClass`
5b.9 :183 (`MoveBadge`) — `{count !== undefined && count > 1 && (…)}` → `const showCount`
5b.10 :221 (`EvalCell`) — ``className={`py-px w-24 font-mono text-xxs ${evalColor(cp)}`}`` → `const cellClass`
5b.11 :222 (`EvalCell`) — `{formatCp(cp)}` → `const cpLabel`
5b.12 :292 (`InlineVariation` map callback) — `{!isWhite && p === startPly && (…)}` → `const showBlackMoveNum`
5b.13 :297 — `isActive={currentNode?.id === n.id}` → `const isActive`
5b.14 :301 — `{n.evaluation && (…)}` → `const showEvaluation = !!n.evaluation` (the depth inside reads `n.evaluation?.depth`)
5b.15 :302 — ``className={`text-xxs font-mono ${evalColor(n.evaluation.cp)}`}`` → `const evalClass`
5b.16 :303 — `{formatCp(n.evaluation.cp)}` → `const cpLabel`

**src/ui/board/GamesListTable.tsx** (11, all inside the `rows.map` callback, which already has a block body)
5b.17 :78 — ``className={`${rowBg} ${isCurrent ? … : ''} ${clickable ? 'cursor-pointer' : ''}`}`` → `const rowClass`
5b.18 :79 — `onClick={clickable ? () => onRowClick!(r.key) : undefined}` → `const handleRowClick`
5b.19 :82 — white cell class template → `const whiteClass`
5b.20 :83 — `{r.whiteRating != null && <span>…}` → `const showWhiteRating`
5b.21 :85 — black cell class template → `const blackClass`
5b.22 :86 — `{r.blackRating != null && <span>…}` → `const showBlackRating`
5b.23 :88 — `{r.date ?? '—'}` → `const dateLabel`
5b.24 :90 — `{r.termination ?? '—'}` → `const terminationLabel`
5b.25 :91 — final-eval cell class template → `const finalEvalClass`
5b.26 :92 — `{r.finalEval != null ? formatCp(r.finalEval) : '—'}` → `const finalEvalLabel`
5b.27 :95 — `{r.externalHref ? <a…>view</a> : clickable ? 'View' : ''}` → `const showExternalLink` + `const viewLabel`

**src/ui/board/GameAnalysisPanel_shared.tsx** (9)
5b.28 :104 — `{plyEvals.length > 0 ? <summary badges> : <span>No analysis yet</span>}` → `const hasPlyEvals` + `const showNoAnalysis`
5b.29 :122 — `{plyEvals.length > 0 && (…From/To move…)}` → reuses `hasPlyEvals`
5b.30 :131 — `value={Number.isNaN(fromMove) ? '' : fromMove}` → `const fromMoveValue`
5b.31 :154 — `value={Number.isNaN(toMove) ? '' : toMove}` → `const toMoveValue`
5b.32 :166 — `{!analyzing && (…)}` → `const showRun`
5b.33 :169 — `{plyEvals.length > 0 ? 'Re-analyse' : 'Analyze Game'}` → `const runLabel`
5b.34 :187 — ``style={{ width: `${…}%` }}`` → `const progressStyle`
5b.35 :193 — ``{analysisProgress.moveNumber != null && `Move …`}`` → `const progressMoveLabel` (empty string when there is no move number)
5b.36 :196 — ``{analysisProgress.move && ` — ${analysisProgress.move}`}`` → `const progressSanLabel`

**src/ui/board/MovesListTable.tsx** (8, all inside the `rows.map` callback)
5b.37 :61 — row class ternary/template → `const rowClass`
5b.38 :62 — `onClick={onSelectMove ? () => onSelectMove(isSelected ? null : r.key) : undefined}` → `const handleRowClick`
5b.39 :65 — `{r.times.toLocaleString()}` → `const timesLabel`
5b.40 :66 — `{pct(r.white, r.times)}` → `const whitePct`
5b.41 :67 — `{pct(r.draws, r.times)}` → `const drawsPct`
5b.42 :68 — `{pct(r.black, r.times)}` → `const blackPct`
5b.43 :69 — eval cell class template → `const evalClass`
5b.44 :70 — `{r.eval != null ? formatCp(r.eval) : '—'}` → `const evalLabel`

**src/ui/board/AlternativeLines_shared.tsx** (5, all inside the `results.map` callback)
5b.45 :59 — line row class template → `const lineClass`
5b.46 :66 — ``className={`flex-shrink-0 w-10 font-mono font-bold ${cpColor}`}`` → `const cpClass`
5b.47 :67 — `{formatCp(line.cp)}` → `const cpLabel`
5b.48 :74 — `{line.lineSans.length > 1 && (…)}` → `const showContinuation`
5b.49 :76 — `{formatLine(line.lineSans.slice(1), positionPly + 1)}` → `const continuationLabel`

**src/ui/board/MasterMovesDbPanel.tsx** (6)
5b.50 :73 — three-way ternary `{!loaded ? <Fetch button> : moves.length === 0 ? <p>No synced…</p> : <div…/>}` → `const showFetch` + `const showNoMoves` + `const showMoves`
5b.51 :75 — `{loading ? 'Loading...' : 'Fetch Moves'}` → `const fetchLabel`
5b.52 :81 — `{reached.toLocaleString()}` → `const reachedLabel`
5b.53 :83 — `rows={moves.map(m => ({ … }))}` → `const movesRows` (typed `MovesListRow[]`)
5b.54 :93 — `{missingEval.missingCount > 0 && (…)}` → `const showAnalyzeMissing`
5b.55 :99 — analyze-missing button label ternary → `const analyzeMissingLabel`

**src/ui/board/MasterGamesDbPanel.tsx** (5)
5b.56 :81 — three-way ternary `{!loaded ? <Fetch button> : games.length === 0 ? <p>No synced…</p> : <div…/>}` → `const showFetch` + `const showNoGames` + `const showGames`
5b.57 :83 — `{loading ? 'Loading...' : 'Fetch Games'}` → `const fetchLabel`
5b.58 :89 — `{moveOptions.length > 1 && (…)}` → `const showMoveFilter`
5b.59 :103 — `rows={games.map(g => ({ … }))}` → `const gamesRows` (typed `GamesListRow[]`)
5b.60 :119 — `{totalPages > 1 && (…)}` → `const showPagination`

**src/ui/board/DepthInput_shared.tsx** (1)
5b.61 :54 — `value={Number.isNaN(value) ? '' : value}` → `const depthValue`

Flagged (not changed): none.

Not targets (left in JSX): `{blackNode && …}`, `{ann && …}`, `{isWhite && …}`, `{isActualMove && …}`, `{existingDepthRange && …}`, `{disableRun && …}`, `{analysisResultMessage && …}`, `{analyzing && …}`, `{analysisError && …}`; inline event handlers; `count={moveCounts?.[node.id]}` (a plain read); `{moveOptions.map(m => <option…/>)}` (a `.map` over a prepared array that returns JSX).

### Phase 5b — applied
User reply: `approve` (all 61 items). `npx tsc --noEmit` passed after each file. A re-scan finds no JSX calculation left anywhere in `src/ui/board/`.
- src/ui/board/MoveTree_shared.tsx — 16 items
- src/ui/board/GamesListTable.tsx — 11 items, plus one extra const: `externalHref = r.externalHref ?? undefined` (the `<a href>` now sits behind `showExternalLink` instead of a truthiness check on `r.externalHref`, so its `string | null | undefined` type had to be narrowed outside the JSX)
- src/ui/board/GameAnalysisPanel_shared.tsx — 9 items
- src/ui/board/MovesListTable.tsx — 8 items
- src/ui/board/AlternativeLines_shared.tsx — 5 items (`continuationLabel` is now computed for every line, including single-move lines where it is an unused empty string)
- src/ui/board/MasterMovesDbPanel.tsx — 6 items (`MovesListRow` type import added)
- src/ui/board/MasterGamesDbPanel.tsx — 5 items (`GamesListRow` type import added)
- src/ui/board/DepthInput_shared.tsx — 1 item

### Phase 5c — proposed (src/ui/analysis/ + src/ui/games/)
101 items in 7 files. Same conventions as 5a/5b. Where a row callback is an expression-bodied arrow (`rows.map(row => (<tr…/>))`), it gains a block body so the consts can sit before its `return`. A value that does not depend on the row (a class built only from a width constant or a prop) goes above the component's `return` once, not inside the callback.

**src/ui/analysis/HabitsTable.tsx** (26)
Above the component's `return`:
5c.1 :211 — ``options={[{ value: String(MIN_ANALYSIS_MOVE_Player), label: `From ${MIN_ANALYSIS_MOVE_Player}` }]}`` → `const minMoveOptions`
5c.2 :212 — `value={String(minMove)}` → `const minMoveValue`
5c.3 :227 — `value={String(minReached)}` → `const minReachedValue`
5c.4 :262 — `title={dismissedView ? 'Showing dismissed' : 'Show dismissed'}` → `const dismissedToggleTitle`
5c.5 :263 — dismissed-toggle button class template → `const dismissedToggleClass`
5c.6 :265 — `{dismissedView ? '↺' : '✕'}` → `const dismissIcon`
5c.7 :269 — `variant={filtersPending ? 'pending' : 'primary'}` → `const refreshVariant`
5c.8 :278 — `{rows.length === 0 && (…)}` → `const showNoRows`
5c.9 :281 — the "No dismissed habits." / "No … habits found…" ternary → `const noRowsMessage`
5c.11 :313 — ``className={`px-3 py-2 ${WIDTH_HABITS_OPENING} truncate`}`` → `const openingCellClass` (row-independent)
5c.14 :318 — ``className={`px-3 py-2 ${WIDTH_ECO} text-gray-400`}`` → `const ecoCellClass` (row-independent)
5c.16 :324 — quality badge class template → `const qualityBadgeClass` (row-independent)
5c.17 :325 — `{quality === 'good' ? 'Good' : 'Bad'}` → `const qualityLabel` (row-independent)
5c.25 :368 — `title={dismissedView ? 'Restore — …' : "Dismiss — …"}` → `const dismissTitle` (row-independent)
5c.26 :372 — `{dismissedView ? '↺' : '✕'}` → reuses `dismissIcon`
Inside the `rows.map` callback (gains a block body):
5c.10 :289 — ``key={`${row.pos_id}-${row.move_san}-${i}`}`` → `const rowKey`
5c.12 :313 — `title={row.opening_name ?? ''}` → `const openingTitle`
5c.13 :314 — `{row.opening_name ?? '—'}` → `const openingLabel`
5c.15 :319 — `{row.eco_code ?? '—'}` → `const ecoLabel`
5c.18 :330 — ``className={`… ${cpClass(row.pos_cp)}`}`` → `const posCpClass`
5c.19 :331 — `{row.pos_cp != null ? formatCp(row.pos_cp) : '—'}` → `const posCpLabel`
5c.20 :341 — `{row.move_num ?? '—'}` → `const moveNumLabel`
5c.21 :351 — `{winPct(row.move_wins, row.move_losses, row.move_times)}` → `const moveWinPct`
5c.22 :355 — ``className={`… ${cpClass(row.move_cp)}`}`` → `const moveCpClass`
5c.23 :356 — `{row.move_cp != null ? formatCp(row.move_cp) : '—'}` → `const moveCpLabel`
5c.24 :361 — `{row.last_occurred != null ? formatLastOccurred(row.last_occurred) : '—'}` → `const lastOccurredLabel`

**src/ui/analysis/PipelineHelp.tsx** (2)
5c.27 :180 — `step.input.map((s, i) => <div className={i > 0 ? 'mt-0.5' : ''}>…)` → callback gains a block body; `const lineClass`
5c.28 :192 — same for `step.output.map` → `const lineClass`

**src/ui/analysis/PipelineLogTable.tsx** (9)
5c.29 :179 — `{tabledata && tabledata.length > 0 ? tabledata.map(…) : <tr>No data available</tr>}` → `const pipelineLogRows = tabledata ?? []` + `const showNoData`; JSX becomes `{pipelineLogRows.map(…)}{showNoData && <tr…/>}`
5c.30 :183 — row class template → `const rowClass` (callback gains a block body)
5c.31 :189 — `{stepLabel(row)}` → `const rowStepLabel`
5c.32 :191 — `{formatCreated(row.pip_created)}` → `const createdLabel`
5c.33 :193 — `{row.pip_input_recs.toLocaleString()}` → `const inputRecsLabel`
5c.34 :195 — `{row.pip_output_recs.toLocaleString()}` → `const outputRecsLabel`
5c.35 :220 — `{popup !== null && (…)}` → `{popup && (…)}` (a named value on the left of `&&`; no new const, and `popup` stays narrowed for `<PipelineLogDetail row={popup} />`)
5c.36 :282 (`PipelineLogDetail`) — `{stepLabel(row)}` → `const rowStepLabel`
5c.37 :290 (`PipelineLogDetail`) — `{formatCreated(row.pip_created)}` → `const createdLabel`

**src/ui/analysis/PositionDetail.tsx** (20)
5c.38 :126 — player-colour badge class template → `const playerColorBadgeClass`
5c.39 :140 — position-eval class template → `const positionCpClass`
5c.40 :141 — `{positionCp != null ? formatCp(positionCp) : '—'}` → `const positionCpLabel`
5c.41 :151 — `{bestMoveSan ?? '—'}` → `const bestMoveLabel`
5c.42 :152 — `{positionCp != null && (…)}` → `const showPositionCp`
5c.43 :153 — `{formatCp(positionCp)}` → reuses `positionCpLabel`
5c.44 :166 (`TABS.map` callback, gains a block body) — `active={tab === t.key}` → `const isActive`
5c.45 :175 — `{tab === 'moves' && (…)}` → `const showMovesTab`
5c.46 :208 (`moves.map` callback) — row class template → `const rowClass`
5c.47 :218 — `{totalTimes > 0 ? Math.round((m.mov_times / totalTimes) * 100) : 0}` → `const timesPct`
5c.48 :221 — `{pct(m.white)}` → `const whitePct`
5c.49 :222 — `{pct(m.draws)}` → `const drawsPct`
5c.50 :223 — `{pct(m.black)}` → `const blackPct`
5c.51 :224 — eval cell class template → `const poseCpClass`
5c.52 :225 — `{m.pose_cp != null ? formatCp(m.pose_cp) : '—'}` → `const poseCpLabel`
5c.53 :236 — `{tab === 'history' && (…)}` → `const showHistoryTab`
5c.54 :251 — `{filteredGames.length === 0 ? <p>No games…</p> : <table…/>}` → `const showNoFilteredGames` + `const showFilteredGames`
5c.55 :270 (`filteredGames.map` callback) — `className={canClick ? … : 'cursor-default'}` → `const rowClass`
5c.56 :279 — `{g.date ?? '—'}` → `const dateLabel`
5c.57 :282 — `{g.gdid ?? '—'}` → `const gdidLabel`

**src/ui/games/ChessComSearchPanel_shared.tsx** (7)
5c.58 :162 — `{chesscomLoading ? 'Searching…' : 'Search chess.com'}` → `const searchLabel`
5c.59 :220 — `{chesscomGames && (chesscomGames.length === 0 ? <p>No games…</p> : <table…/>)}` → `const showNoChesscomGames` + `const showChesscomGames`, and `const chesscomGameRows = chesscomGames ?? []` for the `.map`
5c.60 :240 (`.map` callback, gains a block body) — `{g.whiteRating != null && <span>…}` → `const showWhiteRating`
5c.61 :243 — `{g.blackRating != null && <span>…}` → `const showBlackRating`
5c.62 :246 — `{g.moves ?? '—'}` → `const movesLabel`
5c.63 :247 — `{g.year ?? '—'}` → `const yearLabel`
5c.64 :265 — `{activeFilters && totalPages > 1 && (…)}` → `const showPagination`

**src/ui/games/GameList.tsx** (17) — draft-filter values follow the file's existing `draftDateFrom` / `draftOpening` / `draftEco` naming
5c.65 :399 — `players={players.map(p => ({ player: p.player, display_name: p.displayName }))}` → `const playerOptions`
5c.66 :415 — `value={draftFilters.gdid != null ? String(draftFilters.gdid) : ''}` → `const draftGdid`
5c.67 :423 — `value={draftFilters.color ?? ''}` → `const draftColor`
5c.68 :440 — `value={draftFilters.opponent ?? ''}` → `const draftOpponent`
5c.69 :448 — `min={String(dRMin)}` → `const draftRatingMin`
5c.70 :449 — `max={String(dRMax)}` → `const draftRatingMax`
5c.71 :459 — `value={draftFilters.result ?? ''}` → `const draftResult`
5c.72 :469 — `selected={draftFilters.termination ?? []}` → `const draftTermination`
5c.73 :495 — `variant={filtersPending ? 'pending' : 'primary'}` → `const refreshVariant`
5c.74 :508 — `{!loading && games.length === 0 && (…)}` → `const showNoGames`
5c.75 :515 — `{!loading && games.map(…)}` → `const showGames = !loading`
5c.76 :540 (row callback) — opponent-rating class built by an immediately-invoked arrow inside a template string → `const playerRating`, `const oppRatingColor`, `const oppRatingClass`; the IIFE is removed. This closes the Phase 4 flag on GameList.tsx:544.
5c.77 :549 — `{row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating}` → reuses `playerRating`
5c.78 :551 — ``className={`flex justify-center ${RESULT_STYLES[row.gd_player_result]}`}`` → `const resultClass`
5c.79 :556 — ``className={`py-1.5 pr-2 ${WIDTH_OPENING} truncate`}`` → `const openingCellClass` (row-independent, above the component's `return`)
5c.80 :557 — `{row.gd_opening_name || 'Unknown'}` → `const openingLabel`
5c.81 :577 — `{totalPages > 1 && (…)}` → `const showPagination`

**src/ui/games/MasterGameList.tsx** (20) — the master parallel; same names for the same values
5c.82 :269 — `value={draftFilters.player ?? ''}` → `const draftPlayer`
5c.83 :277 — `value={draftFilters.dateFrom ?? ''}` → `const draftDateFrom`
5c.84 :284 — `value={draftFilters.mgdid != null ? String(draftFilters.mgdid) : ''}` → `const draftMgdid`
5c.85 :292 — `const draftColor`
5c.86 :302 — `value={draftFilters.timeClass ?? ''}` → `const draftTimeClass`
5c.87 :311 — `const draftOpponent`
5c.88 :319 — `min={String(dRMin)}` → `const draftRatingMin`
5c.89 :320 — `max={String(dRMax)}` → `const draftRatingMax`
5c.90 :331 — `const draftResult`
5c.91 :341 — `const draftTermination`
5c.92 :349 — `value={draftFilters.opening ?? ''}` → `const draftOpening`
5c.93 :357 — `value={draftFilters.eco ?? ''}` → `const draftEco`
5c.94 :365 — `const refreshVariant`
5c.95 :378 — `{!loading && games.length === 0 && (…)}` → `const showNoGames`
5c.96 :386 — `{!loading && games.map(…)}` → `const showGames = !loading`
5c.97 :415 (row callback) — `{row.mgd_player_color === 'white' ? row.mgd_white_rating : row.mgd_black_rating}` → `const playerRating`
5c.98 :417 — `const resultClass`
5c.99 :422 — `const openingCellClass` (row-independent)
5c.100 :423 — `{row.mgd_opening_name || 'Unknown'}` → `const openingLabel`
5c.101 :443 — `{totalPages > 1 && (…)}` → `const showPagination`

Flagged (not changed): none.

Not targets (left in JSX): option arrays made only of literals (`options={[{ value: 'bad', label: 'Bad' }, …]}` in HabitsTable — recorded for Phase 15 as inline option lists); `<Chessboard options={{ … }}>` in PositionDetail (plain values only); `{loading && …}`, `{playerName && …}`, `{selectedMove && …}`, `{lastSearchUrl && …}`; inline event handlers.

### Phase 5c — applied
User reply: `approve` (all 101 items). `npx tsc --noEmit` passed after each file. A re-scan finds no JSX calculation left in `src/ui/analysis/` or `src/ui/games/`.
- src/ui/analysis/HabitsTable.tsx — 26 items (the `rows.map` callback gained a block body; its `<tr>` JSX was re-indented two spaces to match, whitespace only)
- src/ui/analysis/PipelineHelp.tsx — 2 items
- src/ui/analysis/PipelineLogTable.tsx — 9 items
- src/ui/analysis/PositionDetail.tsx — 20 items
- src/ui/games/ChessComSearchPanel_shared.tsx — 7 items
- src/ui/games/GameList.tsx — 17 items (the row callback keeps the removed IIFE's local `oppRating` as a `const`, alongside `playerRating` / `oppRatingColor` / `oppRatingClass`). Closes the Phase 4 flag on GameList.tsx:544.
- src/ui/games/MasterGameList.tsx — 20 items

Scope note: `{showGames && games.map(row => <tr…/>)}` (a named flag in front of a JSX-returning `.map` over a prepared array) is treated as allowed — it combines the two allowed forms. The audit script was updated to match.

### Phase 5d — proposed (everything else outside the pipeline pages)
89 items in 24 files: 88 JSX calculations plus one Phase 4 leftover (5d.89). Same conventions as 5a–5c.

**src/app/endings/page.tsx** (1)
5d.1 :41 — `{players.length > 0 && <TerminationChart…/>}` → `const showChart`

**src/app/graph/page.tsx** (4)
5d.2 :184 — `value={String(limit)}` → `const limitValue`
5d.3 :192 — `variant={filtersPending ? 'pending' : 'primary'}` → `const refreshVariant`
5d.4 :194 — `{loading ? 'Fetching...' : 'Refresh'}` → `const refreshLabel`
5d.5 :199 — `{players.length > 0 && (<RatingChart…/>)}` → `const showChart`

**src/app/habits/page.tsx** (3)
5d.6 :243 — `{loading ? <MyLoadingMessage/> : <HabitsTable…/>}` → `{loading && …}` + `const showTable = !loading`
5d.7 :269 — `filtersPending={draftDateFrom !== dateFromFilter || draftOpening !== openingFilter || draftEco !== ecoFilter}` → `const filtersPending`
5d.8 :275 — `{totalPages > 1 && (…)}` → `const showPagination`

**src/app/layout.tsx** (1)
5d.9 :45 — ``className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}`` → `const htmlClass`

**src/app/openings/page.tsx** (1)
5d.10 :68 — `{players.length > 0 && (<OpeningScoreChart…/>)}` → `const showChart`

**src/app/owner/masterplayers/page.tsx** (9)
5d.11 :80 — ``title={`Known Master Players (${players.length})`}`` → `const boxTitle`
5d.12 :95 — `{findingHandle ? 'Finding…' : 'Find Next Chess.com Handle'}` → `const findHandleLabel`
5d.13 :99 — `{loadingPlayers ? <p>Loading…</p> : <div…table…/>}` → `{loadingPlayers && …}` + `const showTable = !loadingPlayers`
Inside the `players.map` callback (gains a block body):
5d.14 :116 — ``{row.firstName ? `${row.firstName} ${row.lastName}` : row.lastName}`` → `const fullName`
5d.15 :117 — `{row.fideid ?? '—'}` → `const fideidLabel`
5d.16 :118 — `{row.grade ?? '—'}` → `const gradeLabel`
5d.17 :121 — ``inputName={`mst-priority-${row.mstid}`}`` → `const priorityInputName`
5d.18 :127 — `{row.chesscomHandle ? <a…>…</a> : '—'}` → `const showHandleLink` + `const noHandleLabel`
5d.19 :128 — ``href={`https://www.chess.com/member/${row.chesscomHandle}`}`` → `const handleHref`

**src/app/position/[id]/page.tsx** (5) — consts go after `if (loading) return …`
5d.20 :56 — `position={data?.position ?? null}` → `const position`
5d.21 :57 — `moves={data?.moves ?? []}` → `const moves`
5d.22 :58 — `posEval={data?.posEval ?? null}` → `const posEval`
5d.23 :59 — `gameCount={data?.gameCount ?? 0}` → `const gameCount`
5d.24 :60 — `games={data?.games ?? []}` → `const games`

**src/ui/AppNav.tsx** (8)
Inside the `masterCards.map` callback:
5d.25 :183 — ``displayName={m.firstName ? `${m.firstName} ${m.lastName}` : m.lastName}`` → `const displayName`
5d.26 :184 — `avatar={avatarFile ? AVATAR_DIR + avatarFile : MASTER_CARD_AVATAR}` → `const avatar`
5d.27 :185 — `ratings={m.grade != null ? { Grade: m.grade } : undefined}` → `const ratings`
5d.28 :186 — `onClick={handle ? () => handleMasterClick(handle) : undefined}` → `const handleCardClick`
5d.29 :187 — `selected={!!handle && activeMaster === handle.toLowerCase()}` → `const selected`
`TabGroup`:
5d.30 :235 — `className={isGroupActive ? 'bg-pink-100' : 'bg-amber-50'}` → `const groupClass`
5d.31 :241 (`sections.map` callback, gains a block body) — `href={buildHref(s.href)}` → `const href`
5d.32 :242 — tab link class template → `const tabClass`

**src/ui/AppShell.tsx** (7)
5d.33 :179 — `className={players.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}` → `const cardsClass`
Inside the `players.map` callback:
5d.34 :193 — `player={db?.pl_player ?? p.player}` → `const player`
5d.35 :194 — `displayName={db?.pl_display_name ?? undefined}` → `const displayName`
5d.36 :195 — `avatar={avatarFile ? AVATAR_DIR + avatarFile : (db?.pl_avatar ?? undefined)}` → `const avatar`
5d.37 :196 — `ratings={Object.keys(ratings).length > 0 ? ratings : undefined}` → `const profileRatings` (`ratings` is already taken in this callback)
5d.38 :197 — `onClick={players.length > 1 ? () => handleClick(p.player) : undefined}` → `const handleCardClick`
5d.39 :198 — `selected={players.length > 1 && (playerFilter === p.player || playerFilter === BOTH)}` → `const selected`

**src/ui/ColorSwatch.tsx** (1)
5d.40 :18 — `{isBlack ? 'black' : 'white'}` → `const colorLabel`

**src/ui/charts/OpeningScoreChart.tsx** (5)
5d.41 :267 — `const refreshVariant`
5d.42 :269 — `{loading ? 'Fetching...' : 'Refresh'}` → `const refreshLabel`
5d.43 :275 — `{!loading && chartData.length === 0 && (…)}` → `const showNoData`
5d.44 :279 — `{!loading && chartData.length > 0 && (…)}` → `const showChart`
5d.45 :310 (`chartData.map` callback, gains a block body) — `fill={barColor(entry.score_pct)}` → `const barFill`

**src/ui/charts/RatingChart.tsx** (6)
5d.46 :233 — `options={Object.entries(GRAN_LABELS).filter(…).map(…)}` → `const granularityOptions`
5d.47 :238 — ``overrideClass={`${WIDTH_GRAPH_GRANULARITY} h-6 md:h-6`}`` → `const granularityClass`
5d.48 :243 — `{!loading && chartData.length === 0 && (…)}` → `const showNoData`
5d.49 :247 — `{chartData.length > 0 && (…)}` → `const showChart`
5d.50 :275 (`series.map` callback, gains a block body) — `stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}` → `const stroke`
5d.51 :276 — `dot={granularity === 'game' ? { r: 2 } : false}` → `const lineDot` (row-independent, above the component's `return`)

**src/ui/charts/TerminationChart.tsx** (4)
5d.52 :179 — `const refreshVariant`
5d.53 :181 — `const refreshLabel`
5d.54 :187 — `const showNoData`
5d.55 :191 — `const showChart`

**src/ui/dataflow/DataflowTabs.tsx** (4)
5d.56 :24 — `active={activeTab === 'diagram'}` → `const diagramActive`
5d.57 :28 (`SECTIONS.map` callback, gains a block body) — `active={activeTab === section.id}` → `const isActive`
5d.58 :33 — `{activeTab === 'diagram' && <PipelineDiagram />}` → reuses `diagramActive`
5d.59 :34 — `{activeSection && activeSection.content}` → `const activeContent`

**src/ui/dataflow/PipelineDiagram.tsx** (1)
5d.60 :105 (`DiagramNode`) — ``className={`w-44 rounded-md border … ${boxClass}`}`` → `const nodeClass`

**src/ui/filters/** (10)
5d.61 FilterActionButton.tsx:35 — ``overrideClass={`text-xxs px-2 h-6 md:h-6 ${VARIANT_CLASS[variant]}`}`` → `const buttonClass`
5d.62 FilterDateInput.tsx:32 — `className={label ? 'flex flex-col gap-0.5' : ''}` → `const containerClass`
5d.63 FilterDateInput.tsx:40 — ``overrideClass={`${width} h-6 md:h-6 text-xxs ${borderClass}`}`` → `const inputClass`
5d.64 FilterMultiCheckbox.tsx:38 — ``overrideClass={`${width} md:${width} h-6 md:h-6 px-1 text-xxs truncate`}`` → `const selectClass`
5d.65 FilterPlayerSelect.tsx:40 — `options={[{ value: ALL, label: 'All' }, ...players.map(…)]}` → `const playerOptions` (after the early `return null`)
5d.66 FilterSelect.tsx:52 — select class template → `const selectClass`
5d.67 FilterSelect.tsx:54 — `containerClass={label ? 'flex flex-col gap-0.5' : ''}` → `const containerClass`
5d.68 FilterSelect.tsx:55 — `searchClass={…}` (the identical template to :52) → reuses `selectClass`
5d.69 FilterTextInput.tsx:30 — `className={label ? 'flex flex-col gap-0.5' : ''}` → `const containerClass`
5d.70 FilterTextInput.tsx:36 — input class template → `const inputClass`

**src/ui/owner/ConstantsViewer.tsx** (9 + 1)
5d.71 :75 — `active={tab === 'constants'}` → `const constantsActive`
5d.72 :78 — `active={tab === 'env'}` → `const envActive`
5d.73 :81 — `active={tab === 'functions'}` → `const functionsActive`
5d.74 :86 — `{tab === 'functions' ? <FunctionIndexTable…/> : <>…</>}` → `{functionsActive && …}` + `const showSections = !functionsActive`
5d.75 :95 (`sections.map` callback, gains a block body) — `active={i === sectionIndex}` → `const isActive`
5d.76 :198 (`FunctionIndexTable` row callback) — `description={functionDescriptions[entry.usedIn] ?? ''}` → `const description`
5d.77 :225 (`FunctionIndexPopup` row callback) — `className={n.isEnv ? 'text-red-700' : 'text-blue-700'}` → `const nameClass`
5d.78 :257 (`SectionTable` row callback) — `{renderValue(entry.value)}` → `const valueContent`
5d.79 :328 (`PopoverButton`) — popover class template → `const popoverClass`
5d.89 :144 (`buildFunctionIndex`, Phase 4 leftover) — `return functionsPart.split(', ').map(functionName => …)` inside an immediately-invoked arrow → `const functionReferences = …; return functionReferences`. Correction: Phase 4 recorded this as "inside JSX"; it is in a plain function, so it is a return-const item, handled the same way the user asked for ChessBoardView_shared.tsx:1030.

**src/ui/player/DeconstructButton.tsx** (3)
5d.80 :79 — `{processing ? 'Processing...' : 'Populate'}` → `const populateLabel`
5d.81 :98 — `{result.skipped > 0 && <span>…}` → `const showSkipped` (`!!result && result.skipped > 0`)
5d.82 :99 — `{result.errors > 0 && <span>…}` → `const showErrors`

**src/ui/player/PlayerProfile.tsx** (6)
5d.83 :43 — ``className={`bg-blue-50 ${selected ? 'outline …' : ''}`}`` → `const boxClass`
5d.84 :45 — ``className={`flex items-start gap-4 rounded ${onClick ? 'cursor-pointer …' : ''}`}`` → `const cardClass`
5d.85 :61 — `{ratings && Object.keys(ratings).length > 0 && (…)}` → `const showRatings`
5d.86 :63 — `{Object.entries(ratings).map(…)}` → `const ratingEntries` (`ratings ? Object.entries(ratings) : []`)
5d.87 :66 — rating chip class template → `const ratingClass` (row-independent, above the `return`)
5d.88 :67 (`ratingEntries.map` callback, gains a block body) — `onClick={onRatingClick ? (e) => { … } : undefined}` → `const handleRatingClick`

Flagged (not changed): none (the four pipeline pages stay flagged from the scope decision above).

Not targets (left in JSX): literal-only option arrays (`options={[{ value: 'Best', label: 'Best' }, …]}`, `options={['10', '50', …]}`); chart callbacks passed as props (`tickFormatter`, `formatter`, `labelFormatter`); `{IS_DEV && …}`, `{loading && …}`, `{handleResult && …}`, `{counts && …}`, `{result && …}`, `{avatar && …}`, `{displayName && …}`, `{label && …}`, `{description && …}`, `{open && …}`, `{activeSection && <SectionTable…/>}`; inline event handlers.

### Phase 5d — applied
User reply: `approve` (all 89 items).
- src/app/endings/page.tsx — 1 · src/app/openings/page.tsx — 1 · src/app/layout.tsx — 1 · src/ui/ColorSwatch.tsx — 1
- src/ui/dataflow/DataflowTabs.tsx — 4 · src/ui/dataflow/PipelineDiagram.tsx — 1
- src/ui/filters/FilterActionButton.tsx — 1 · FilterDateInput.tsx — 2 · FilterMultiCheckbox.tsx — 1 · FilterPlayerSelect.tsx — 1 · FilterSelect.tsx — 3 · FilterTextInput.tsx — 2
- src/app/graph/page.tsx — 4 · src/app/habits/page.tsx — 3 · src/app/position/[id]/page.tsx — 5 · src/app/owner/masterplayers/page.tsx — 9
- src/ui/AppNav.tsx — 8 · src/ui/AppShell.tsx — 7
- src/ui/charts/OpeningScoreChart.tsx — 5 · RatingChart.tsx — 6 · TerminationChart.tsx — 4
- src/ui/owner/ConstantsViewer.tsx — 10 (9 JSX items + the Phase 4 leftover 5d.89)
- src/ui/player/DeconstructButton.tsx — 3 · src/ui/player/PlayerProfile.tsx — 6 (`handleRatingClick`'s parameter is typed `React.MouseEvent`, since it no longer gets its type from the `onClick` prop)

Type-check cadence: `npx tsc --noEmit` was run once for the twelve small files in the first three lines above together, once for the four app pages together, and after each of the other eight files. Every run passed.

### Phase 5 — overall result
- 330 items applied across 41 files (5a 79, 5b 61, 5c 101, 5d 89).
- Re-scan after 5d: the only JSX calculations left are in the four deferred pipeline pages (234 with the data-building-map check), plus one false positive (`angle={-35}` in TerminationChart.tsx, a negative literal).
- Re-scan of Phase 4 (return-const) after the Phase 5 edits: nothing new; the four immediately-invoked arrows flagged in Phase 4 are all resolved (4.122, 4.123, 5c.76, 5d.89).
- `npm run build` run once after 5d as a sanity check: passed.
- Not run in a browser — the rendering itself is untested until the user's own testing.

Flagged (not changed) — still open: the four `/owner` pipeline pages (deferred by user decision; a Phase 15 finding will propose a shared step-row component).

### Phase 6 — proposed
133 comment blocks in 23 files. Each is an inline `//` comment inside a function body that lacks the empty `//` line above and/or below. The change adds the missing empty `//` line(s) at the same indentation and writes the text lines as `//  text` (two spaces, as in the convention's example); the wording is unchanged. Each item shows the block's first text line.

**lib/sync-games.ts** (2)
6.1 :21 — `// Fetch archive list from Chess.com`
6.2 :54 — `// ON CONFLICT DO NOTHING handles any duplicate safely`

**src/app/owner/pipelinegames/page.tsx** (1)
6.3 :425 — `// No date range — always processes date-independently, ordered by pos_reached DESC`

**src/lib/actions/deconstructGames_Player.ts** (1)
6.4 :205 — `// Ignore duplicate key errors (race condition)`

**src/lib/actions/games.ts** (2)
6.5 :313 — `// Tracks the last ply that actually resolved to a real value — cpChange/cpBefore are` (3 lines)
6.6 :801 — `// table_count has no IS NULL support (unlike table_fetch) — table_query needed here`

**src/lib/analysis/buildPositionTree_Player.ts** (10)
6.7 :154 — `// Process all games in memory — pure chess.js, no DB`
6.8 :176 — `// Phase A — write tgam_game_positions (self-contained, no tpos_positions dependency)`
6.9 :178 — `// Phase B — derive tpos_positions from what Phase A just wrote`
6.10 :239 — `// A revisited position (transposition/repetition) is real and gets its own row each` (9 lines)
6.11 :260 — `// Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires`
6.12 :339 — `// Unresolved backlog size going in — logged as sub-step 3a's pip_input_recs (below)` (7 lines)
6.13 :365 — `// Step 1 — ensure a tpos_positions row exists for every FEN still referenced by an` (3 lines)
6.14 :388 — `// Step 2 — backfill ids wherever still NULL, capturing which positions were touched`
6.15 :435 — `// Step 3 — recompute pos_reached only for touched positions`
6.16 :480 — `// table_query's params type doesn't declare array elements (needed for = ANY($1)),` (2 lines)

**src/lib/analysis/chessdb_shared.ts** (2)
6.17 :255 — `// tpose_positions_eval deliberately never caches opening theory (moves 1..MIN_ANALYSIS_MO…` (5 lines)
6.18 :408 — `// table_query's params type doesn't declare array elements (needed for = ANY($1)),` (2 lines)

**src/lib/analysis/enrichPositionsStockfish.ts** (8)
6.19 :224 — `// Phase 1 FENs — positions in tpos_positions not yet evaluated`
6.20 :257 — `// Phase 2 — resulting positions not yet evaluated (real tpos_positions rows already` (2 lines)
6.21 :285 — `// Normalize to white's perspective: Stockfish reports from side-to-move perspective.`
6.22 :583 — `// Phase 1a — replay every game's PGN in memory (no DB calls) to its true final position`
6.23 :603 — `// Phase 1b — one batched exact-match lookup across every distinct final position in` (2 lines)
6.24 :616 — `// Phase 1c — one batched, chunked multi-row UPDATE for every reuse match, instead of` (2 lines)
6.25 :642 — `// Phase 2 — fresh Stockfish evaluation for whatever wasn't already tracked,` (2 lines)
6.26 :772 — `// Resulting positions now have a real tpos_positions row (created eagerly by Build` (3 lines)

**src/lib/analysis/purgePositions.ts** (7)
6.27 :40 — `// Always start clean — wk_pur_workfile holds only the current run's candidates.`
6.28 :43 — `// Stage 1 — cheap, indexed reach filter. Stage 2 — confirm every occurrence (before` (15 lines)
6.29 :109 — `// 1. Delete evaluations for the candidate set`
6.30 :128 — `// 2. Full-delete tgam rows whose own before-position is a candidate.`
6.31 :147 — `// 3. Null out the resulting-position reference on any surviving row (its own` (8 lines)
6.32 :178 — `// 4. Resurrection guard — stamp any game now left with zero tgam rows`
6.33 :203 — `// 5. Delete the purged tpos_positions rows themselves — safe unconditionally now:` (4 lines)

**src/lib/analysisTree.ts** (4)
6.34 :51 — `// Sentinel root (position before move 1)`
6.35 :114 — `// Check if this exact move already exists as a child`
6.36 :155 — `// Try SAN first, fall back to searching legal moves`
6.37 :158 — `// Try finding the move in legal moves (handles minor notation differences)`

**src/lib/backNav.ts** (1)
6.38 :88 — `// Non-critical — worst case, back navigation falls back to the caller's default`

**src/lib/chesscom.ts** (4)
6.39 :39 — `// Get list of monthly archives`
6.40 :46 — `// Fetch most recent month(s) until we have enough games`
6.41 :53 — `// Filter to standard chess only (no variants)`
6.42 :58 — `// Return the most recent 'count' games`

**src/lib/master/buildPositionTree_Master.ts** (1)
6.43 :236 — `// Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires`

**src/lib/master/masterGamesList.ts** (4)
6.44 :443 — `// Dedup by mgdid per move (a transposition can revisit the same position+move within` (4 lines)
6.45 :462 — `// Eval is resolved per move's resulting FEN — the same position regardless of which game` (3 lines)
6.46 :510 — `// DISTINCT on LOWER(mgd_player), not the bare column — mgd_player is supposed to always b…` (5 lines)
6.47 :672 — `// Tracks the last ply that actually resolved to a real value — cpChange/cpBefore are` (3 lines)

**src/lib/parsePgn.ts** (1)
6.48 :51 — `// Remove move notation suffixes (e.g., "-2...d6-3.d4", "-1...g6-2.g3")`

**src/lib/stockfish.ts** (15)
6.49 :133 — `// partial conversion is fine`
6.50 :199 — `// Remove any previous handler`
6.51 :243 — `// Build update with all current best lines`
6.52 :270 — `// Engine stopped, either manually or by reaching maxDepth`
6.53 :325 — `// multipv is only reported when MultiPV > 1 — absent means rank 1 by definition.` (5 lines)
6.54 :355 — `// Explicit reset — a prior startInfiniteAnalysis() call on this same engine instance may` (2 lines)
6.55 :383 — `// Evaluate every position ONCE (N+1 positions for N moves) — this eliminates` (5 lines)
6.56 :394 — `// tpose_positions_eval already stores cp from White's perspective (same convention` (5 lines)
6.57 :415 — `// Normalize to white's perspective` (3 lines)
6.58 :429 — `// shouldStop() is checked here, right after this position's own evaluation` (6 lines)
6.59 :447 — `// cpChange from the mover's own perspective — positive = good for the mover,` (2 lines)
6.60 :453 — `// cpLoss is just the "how bad was this move" magnitude — never negative`
6.61 :456 — `// Best move from the position before (engine's recommendation)`
6.62 :479 — `// The weaker of this ply's two constituent position depths — a cached hit can be` (3 lines)
6.63 :488 — `// The true final position reached is always the last completed ply's own resulting` (6 lines)

**src/ui/analysis/PositionDetail.tsx** (2)
6.64 :71 — `// Convert best move UCI → SAN`
6.65 :79 — `// Build arrow overlays: green=best, red=habit (skip red if same squares as best)`

**src/ui/board/ChessBoardView_shared.tsx** (43)
6.66 :93 — `// Tree state`
6.67 :107 — `// Display chess instance`
6.68 :110 — `// Analysis state` (4 lines)
6.69 :122 — `// Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game`
6.70 :126 — `// Deep analysis state`
6.71 :133 — `// Force re-render on board changes (displayGame is a ref)`
6.72 :342 — `// Navigate main line by index (for slider)`
6.73 :418 — `// Temporary diagnostic timing — remove once the "Re-analyse" slowness is found.`
6.74 :422 — `// Construction only, no init() call here — analyzeGame() initializes lazily,` (4 lines)
6.75 :446 — `// Deepest-of-tpose-or-tgev per FEN — see getFenEvalsForSkipCheck_shared's header for why` (2 lines)
6.76 :451 — `// Skip overwriting any ply whose existing depth is already >= this run's depth —` (6 lines)
6.77 :464 — `// progress.current is 1-indexed within this slice once a move has been played` (3 lines)
6.78 :487 — `// Fire-and-forget (async IIFE with try/catch, not .then()/.catch()) — don't block` (4 lines)
6.79 :498 — `// Non-critical — a failed merge doesn't block the rest`
6.80 :501 — `// Incrementally persists this exact ply into tgev_game_evals as soon as it's` (5 lines)
6.81 :511 — `// Non-critical — a failed persist doesn't block the rest`
6.82 :528 — `// First-time full analysis just completed — default the next re-analyze range to` (2 lines)
6.83 :534 — `// The range's final resulting position (or, if stopped early, the last ply that` (10 lines)
6.84 :551 — `// Non-critical`
6.85 :612 — `// Captured now, not read fresh in onComplete — onComplete fires asynchronously` (6 lines)
6.86 :625 — `// Build set of legal UCI moves for this position so we can filter engine hallucinations`
6.87 :641 — `// Filter out any moves that are illegal in this position`
6.88 :646 — `// Deduplicate by best move (engine can repeat when fewer distinct moves exist than reques…`
6.89 :658 — `// Always the top N objectively-best lines — the played move is already shown in` (3 lines)
6.90 :669 — `// Track the currently displayed lines for the automatic pose/gev push on completion`
6.91 :719 — `// Non-critical — panel just keeps its previous data`
6.92 :729 — `// Non-critical`
6.93 :762 — `// The one candidate line (if any) that matches what this game actually played next —` (4 lines)
6.94 :793 — `// fen is exactly this game's own position at 'ply' (that's what was analyzed), so the` (3 lines)
6.95 :818 — `// fen is exactly tree.mainLine[ply]'s own resulting position — mirror the ownUpdated` (4 lines)
6.96 :858 — `// The multi-PV was computed for the position AFTER the current move (the board position)` (2 lines)
6.97 :902 — `// Determine parent: current node or root`
6.98 :915 — `// Multi-PV auto-triggers via the currentNode effect`
6.99 :937 — `// Determine cp from white's perspective`
6.100 :943 — `// Also eval before to compute cpLoss`
6.101 :966 — `// Silently fail for background eval`
6.102 :986 — `// Current ply for move numbering`
6.103 :989 — `// Label for whatever position is currently on the board, shown on the Position Analysis /…` (2 lines)
6.104 :993 — `// Highlight squares`
6.105 :1010 — `// Eval bar`
6.106 :1014 — `// Full move numbers for the re-analyze range selectors`
6.107 :1017 — `// Existing saved depth for the currently-selected From/To range — lets the` (3 lines)
6.108 :1398 — `// Deliberately no pushBackTarget here — switching games while already on` (3 lines)

**src/ui/board/MasterGameView_master.tsx** (19)
6.109 :132 — `// Stockfish analysis — hydrated from tmgev_game_evals/tpose_positions_eval on mount,` (2 lines)
6.110 :143 — `// Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game`
6.111 :147 — `// Deep analysis state`
6.112 :389 — `// Deepest-of-tpose-or-tmgev per FEN — see getFenEvalsForSkipCheck_shared's header for why…` (2 lines)
6.113 :393 — `// Skip overwriting any ply whose existing depth is already >= this run's depth —` (3 lines)
6.114 :402 — `// progress.current is 1-indexed within this slice once a move has been played` (3 lines)
6.115 :424 — `// Fire-and-forget (not blocking the engine's own progress) — wrapped in an async` (3 lines)
6.116 :431 — `// Non-critical — a failed top-up doesn't block the rest`
6.117 :434 — `// Incrementally persists this exact ply into tmgev_game_evals as soon as it's` (5 lines)
6.118 :443 — `// Non-critical — a failed persist doesn't block the rest`
6.119 :458 — `// First-time full analysis just completed — default the next re-analyze range to` (2 lines)
6.120 :464 — `// The range's final resulting position (or, if stopped early, the last ply that` (5 lines)
6.121 :474 — `// Non-critical`
6.122 :691 — `// Non-critical — DB save failure doesn't block UI`
6.123 :756 — `// Full move numbers for the re-analyze range selector`
6.124 :759 — `// Current ply for move numbering`
6.125 :762 — `// Label for whatever position is currently on the board, shown on the Position` (2 lines)
6.126 :766 — `// Highlight squares`
6.127 :783 — `// Existing saved depth for the currently-selected From/To range — mirrors` (2 lines)

**src/ui/board/MasterGamesDbPanel.tsx** (1)
6.128 :69 — `// Reset back to page 1 whenever the position/move filter identity changes — same guard pa…` (3 lines)

**src/ui/board/MoveTree_shared.tsx** (2)
6.129 :85 — `// White variations`
6.130 :107 — `// Black variations`

**src/ui/charts/RatingChart.tsx** (1)
6.131 :140 — `// Derive unique (player, timeClass) series from the game data`

**src/ui/games/ChessComSearchPanel_shared.tsx** (1)
6.132 :85 — `// Chess.com Games search filters — param names match chess.com's own search URL. p1/p2 ar…` (3 lines)

**src/ui/games/MasterGameList.tsx** (1)
6.133 :410 — `// No time recorded (e.g. a historical import that only ever had a date) defaults` (2 lines)

Flagged (not changed):
- Dashed-rule blocks (34): comment blocks opened and closed by a `// --------` rule line instead of an empty `//`. They already have a line above and below the text, but converting them means replacing the dashed rules with empty `//` lines — a change to the comment itself. src/ui/board/ChessBoardView_shared.tsx (19), src/ui/board/MasterGameView_master.tsx (14), src/ui/games/ChessComSearchPanel_shared.tsx (1).
- Decorated divider lines (35): single-line section dividers such as `// ── Step 2: Build Position Tree ────`. src/app/owner/pipelinegames/page.tsx (12), src/app/owner/pipelinehistoricalgames/page.tsx (8), src/app/owner/pipelinemastergames/page.tsx (7), src/app/owner/pipelinemasters/page.tsx (8).
- Trailing comments on a line of code (3) — they would have to be moved onto their own lines:
  - src/lib/stockfish.ts:444 — `const cpBefore = mergedPlyPositionEvals[idx].cp  // eval before this move (white's perspective)`
  - src/lib/stockfish.ts:445 — `const cpAfter = mergedPlyPositionEvals[i].cp     // eval after this move (white's perspective)`
  - src/ui/charts/RatingChart.tsx:200 — `const margin     = Math.max(dataSpan * 0.04, 1800000) // 4% or min 30 min`

Not targets (left alone): the `//====` / `//----` function-header blocks; 11 directive comments (`// @ts-…`, `// eslint-…`); comments outside function bodies; `/* … */` and JSX `{/* … */}` comments (85 inside function bodies) — the 3-line format is defined for `//` comments.

### Phase 6 — applied
User reply: `approve` (all 133 blocks). Applied in one scripted pass (comment-only edits), then `npx tsc --noEmit` run once: passed. A re-scan finds no remaining inline `//` comment block outside the 3-line format, apart from the flagged groups.
- src/ui/board/ChessBoardView_shared.tsx — 43 blocks
- src/ui/board/MasterGameView_master.tsx — 19 blocks
- src/lib/stockfish.ts — 15 blocks
- src/lib/analysis/buildPositionTree_Player.ts — 10 blocks
- src/lib/analysis/enrichPositionsStockfish.ts — 8 blocks
- src/lib/analysis/purgePositions.ts — 7 blocks
- src/lib/analysisTree.ts — 4 blocks
- src/lib/chesscom.ts — 4 blocks
- src/lib/master/masterGamesList.ts — 4 blocks
- lib/sync-games.ts — 2 blocks
- src/lib/actions/games.ts — 2 blocks
- src/lib/analysis/chessdb_shared.ts — 2 blocks
- src/ui/analysis/PositionDetail.tsx — 2 blocks
- src/ui/board/MoveTree_shared.tsx — 2 blocks
- src/app/owner/pipelinegames/page.tsx — 1 block
- src/lib/actions/deconstructGames_Player.ts — 1 block
- src/lib/backNav.ts — 1 block
- src/lib/master/buildPositionTree_Master.ts — 1 block
- src/lib/parsePgn.ts — 1 block
- src/ui/board/MasterGamesDbPanel.tsx — 1 block
- src/ui/charts/RatingChart.tsx — 1 block
- src/ui/games/ChessComSearchPanel_shared.tsx — 1 block
- src/ui/games/MasterGameList.tsx — 1 block

Flagged (not changed) — still open: 34 dashed-rule blocks, 35 decorated divider lines, 3 trailing comments (listed in the proposal above).

### Phase 7 — proposed
74 interfaces in 54 files (23 exported, the rest file-local, mostly component `…Props` shapes). Each change replaces the `interface` keyword with `type` and adds ` =` before the opening brace; the members are untouched. None of the 74 uses `extends`, is declared twice, or is an `implements` target.

**src/lib/actions/chesscomSearch.ts**
7.1 :36 — `export interface ChessComSearchGame { … }` → `export type ChessComSearchGame = { … }`
7.2 :55 — `export interface ChessComSearchFilters { … }` → `export type ChessComSearchFilters = { … }`

**src/lib/actions/games.ts**
7.3 :863 — `export interface RatingDataPoint { … }` → `export type RatingDataPoint = { … }`

**src/lib/actions/lichess.ts**
7.4 :25 — `export interface LichessExplorerMove { … }` → `export type LichessExplorerMove = { … }`
7.5 :35 — `export interface LichessExplorerTopGame { … }` → `export type LichessExplorerTopGame = { … }`
7.6 :45 — `export interface LichessExplorerResponse { … }` → `export type LichessExplorerResponse = { … }`

**src/lib/analysis/buildHabits.ts**
7.7 :43 — `interface HabitAggregate { … }` → `type HabitAggregate = { … }`

**src/lib/analysis/buildPositionTree_Player.ts**
7.8 :41 — `interface GameRecord { … }` → `type GameRecord = { … }`
7.9 :46 — `interface PositionRecord { … }` → `type PositionRecord = { … }`

**src/lib/analysis/chessdb_master.ts**
7.10 :29 — `export interface MasterMoveRow { … }` → `export type MasterMoveRow = { … }`
7.11 :184 — `export interface MasterPositionGameHit { … }` → `export type MasterPositionGameHit = { … }`

**src/lib/analysis/chessdb_player.ts**
7.12 :26 — `export interface MoveRow { … }` → `export type MoveRow = { … }`
7.13 :236 — `export interface PositionGameHit { … }` → `export type PositionGameHit = { … }`

**src/lib/analysis/chessdb_shared.ts**
7.14 :26 — `export interface PositionRow { … }` → `export type PositionRow = { … }`
7.15 :33 — `export interface EvaluationRow { … }` → `export type EvaluationRow = { … }`

**src/lib/analysisTree.ts**
7.16 :8 — `export interface MoveNode { … }` → `export type MoveNode = { … }`
7.17 :21 — `export interface AnalysisTree { … }` → `export type AnalysisTree = { … }`
7.18 :26 — `export interface MultiPvResult { … }` → `export type MultiPvResult = { … }`

**src/lib/chesscom.ts**
7.19 :3 — `export interface ChessComGame { … }` → `export type ChessComGame = { … }`

**src/lib/master/buildPositionTree_Master.ts**
7.20 :39 — `interface MasterGameRecord { … }` → `type MasterGameRecord = { … }`
7.21 :44 — `interface MasterPositionRecord { … }` → `type MasterPositionRecord = { … }`

**src/lib/parsePgn.ts**
7.22 :1 — `export interface PgnHeaders { … }` → `export type PgnHeaders = { … }`

**src/lib/stockfish.ts**
7.23 :16 — `export interface PlyEvaluation { … }` → `export type PlyEvaluation = { … }`
7.24 :31 — `export interface AnalysisProgress { … }` → `export type AnalysisProgress = { … }`
7.25 :39 — `export interface InfiniteAnalysisUpdate { … }` → `export type InfiniteAnalysisUpdate = { … }`

**src/ui/AppNav.tsx**
7.26 :42 — `interface AppNavProps { … }` → `type AppNavProps = { … }`

**src/ui/AppShell.tsx**
7.27 :41 — `interface BackNavConfig { … }` → `type BackNavConfig = { … }`

**src/ui/BackButton.tsx**
7.28 :19 — `interface BackButtonProps { … }` → `type BackButtonProps = { … }`

**src/ui/ColorSwatch.tsx**
7.29 :10 — `interface ColorSwatchProps { … }` → `type ColorSwatchProps = { … }`

**src/ui/HomeDashboard.tsx**
7.30 :21 — `interface Player { … }` → `type Player = { … }`
7.31 :26 — `interface HomeDashboardProps { … }` → `type HomeDashboardProps = { … }`

**src/ui/analysis/HabitsTable.tsx**
7.32 :46 — `interface HabitRow { … }` → `type HabitRow = { … }`
7.33 :68 — `interface HabitsTableProps { … }` → `type HabitsTableProps = { … }`

**src/ui/analysis/PositionDetail.tsx**
7.34 :30 — `interface GameHit { … }` → `type GameHit = { … }`
7.35 :39 — `interface PositionDetailProps { … }` → `type PositionDetailProps = { … }`

**src/ui/board/AlternativeLines_shared.tsx**
7.36 :19 — `interface AlternativeLinesProps { … }` → `type AlternativeLinesProps = { … }`

**src/ui/board/ChessBoardView_shared.tsx**
7.37 :75 — `interface ChessBoardViewProps { … }` → `type ChessBoardViewProps = { … }`

**src/ui/board/DepthInput_shared.tsx**
7.38 :31 — `interface DepthInputProps { … }` → `type DepthInputProps = { … }`

**src/ui/board/GameAnalysisPanel_shared.tsx**
7.39 :54 — `export interface GameAnalysisPanelProps { … }` → `export type GameAnalysisPanelProps = { … }`

**src/ui/board/GamesListTable.tsx**
7.40 :45 — `interface GamesListTableProps { … }` → `type GamesListTableProps = { … }`

**src/ui/board/MasterGameView_master.tsx**
7.41 :95 — `export interface MasterGameRow { … }` → `export type MasterGameRow = { … }`
7.42 :113 — `interface MasterGameViewProps { … }` → `type MasterGameViewProps = { … }`

**src/ui/board/MasterGamesDbPanel.tsx**
7.43 :47 — `interface MasterGamesDbPanelProps { … }` → `type MasterGamesDbPanelProps = { … }`

**src/ui/board/MasterMovesDbPanel.tsx**
7.44 :41 — `interface MasterMovesDbPanelProps { … }` → `type MasterMovesDbPanelProps = { … }`

**src/ui/board/MiniBoard.tsx**
7.45 :25 — `interface MiniBoardProps { … }` → `type MiniBoardProps = { … }`

**src/ui/board/MoveTree_shared.tsx**
7.46 :22 — `interface MoveTreeProps { … }` → `type MoveTreeProps = { … }`

**src/ui/board/MovesListTable.tsx**
7.47 :35 — `interface MovesListTableProps { … }` → `type MovesListTableProps = { … }`

**src/ui/board/useMissingEvalAnalysis.ts**
7.48 :33 — `export interface MissingEvalRow { … }` → `export type MissingEvalRow = { … }`

**src/ui/charts/OpeningScoreChart.tsx**
7.49 :53 — `interface OpeningScoreChartProps { … }` → `type OpeningScoreChartProps = { … }`

**src/ui/charts/RatingChart.tsx**
7.50 :37 — `interface PlayerOption { … }` → `type PlayerOption = { … }`
7.51 :55 — `interface RatingChartProps { … }` → `type RatingChartProps = { … }`

**src/ui/charts/TerminationChart.tsx**
7.52 :36 — `interface TerminationChartProps { … }` → `type TerminationChartProps = { … }`

**src/ui/filters/ColorSelect.tsx**
7.53 :19 — `interface ColorSelectProps { … }` → `type ColorSelectProps = { … }`

**src/ui/filters/FilterActionButton.tsx**
7.54 :17 — `interface FilterActionButtonProps { … }` → `type FilterActionButtonProps = { … }`

**src/ui/filters/FilterDateInput.tsx**
7.55 :20 — `interface FilterDateInputProps { … }` → `type FilterDateInputProps = { … }`

**src/ui/filters/FilterGraphTimeClassSelect.tsx**
7.56 :31 — `interface FilterGraphTimeClassSelectProps { … }` → `type FilterGraphTimeClassSelectProps = { … }`

**src/ui/filters/FilterMultiCheckbox.tsx**
7.57 :18 — `interface FilterOption { … }` → `type FilterOption = { … }`
7.58 :23 — `interface FilterMultiCheckboxProps { … }` → `type FilterMultiCheckboxProps = { … }`

**src/ui/filters/FilterNumberRange.tsx**
7.59 :24 — `interface FilterNumberRangeProps { … }` → `type FilterNumberRangeProps = { … }`

**src/ui/filters/FilterPlayerSelect.tsx**
7.60 :26 — `interface FilterPlayerSelectProps { … }` → `type FilterPlayerSelectProps = { … }`

**src/ui/filters/FilterSelect.tsx**
7.61 :30 — `interface FilterOption { … }` → `type FilterOption = { … }`
7.62 :35 — `interface FilterSelectProps { … }` → `type FilterSelectProps = { … }`

**src/ui/filters/FilterTextInput.tsx**
7.63 :19 — `interface FilterTextInputProps { … }` → `type FilterTextInputProps = { … }`

**src/ui/filters/FilterTimeClassSelect.tsx**
7.64 :22 — `interface FilterTimeClassSelectProps { … }` → `type FilterTimeClassSelectProps = { … }`

**src/ui/filters/MasterPlayerMultiSelect.tsx**
7.65 :30 — `interface MasterPlayerMultiSelectProps { … }` → `type MasterPlayerMultiSelectProps = { … }`

**src/ui/filters/MasterPlayerSelect.tsx**
7.66 :33 — `interface MasterPlayerSelectProps { … }` → `type MasterPlayerSelectProps = { … }`

**src/ui/filters/PipelineTypeSelect.tsx**
7.67 :18 — `interface PipelineTypeSelectProps { … }` → `type PipelineTypeSelectProps = { … }`

**src/ui/filters/ResultSelect.tsx**
7.68 :17 — `interface ResultSelectProps { … }` → `type ResultSelectProps = { … }`

**src/ui/filters/TerminationMultiSelect.tsx**
7.69 :20 — `interface TerminationMultiSelectProps { … }` → `type TerminationMultiSelectProps = { … }`

**src/ui/filters/TimeClassSelect.tsx**
7.70 :18 — `interface TimeClassSelectProps { … }` → `type TimeClassSelectProps = { … }`

**src/ui/games/GameList.tsx**
7.71 :39 — `interface PlayerOption { … }` → `type PlayerOption = { … }`
7.72 :44 — `interface GameListProps { … }` → `type GameListProps = { … }`

**src/ui/player/DeconstructButton.tsx**
7.73 :20 — `interface DeconstructButtonProps { … }` → `type DeconstructButtonProps = { … }`

**src/ui/player/PlayerProfile.tsx**
7.74 :23 — `interface PlayerProfileProps { … }` → `type PlayerProfileProps = { … }`

Flagged (not changed):
- src/types/stockfish.d.ts:2 — `interface StockfishEngine` — inside a `declare module` / namespace block

### Phase 7 — applied
User reply: `approve` (all 74 interfaces). Applied in one scripted pass, then `npx tsc --noEmit` run once: passed. A re-scan finds no `interface` left in `src/` or `lib/` apart from the flagged one.
- src/lib/actions/chesscomSearch.ts — 2 edits
- src/lib/actions/games.ts — 1 edit
- src/lib/actions/lichess.ts — 3 edits
- src/lib/analysis/buildHabits.ts — 1 edit
- src/lib/analysis/buildPositionTree_Player.ts — 2 edits
- src/lib/analysis/chessdb_master.ts — 2 edits
- src/lib/analysis/chessdb_player.ts — 2 edits
- src/lib/analysis/chessdb_shared.ts — 2 edits
- src/lib/analysisTree.ts — 3 edits
- src/lib/chesscom.ts — 1 edit
- src/lib/master/buildPositionTree_Master.ts — 2 edits
- src/lib/parsePgn.ts — 1 edit
- src/lib/stockfish.ts — 3 edits
- src/ui/AppNav.tsx — 1 edit
- src/ui/AppShell.tsx — 1 edit
- src/ui/BackButton.tsx — 1 edit
- src/ui/ColorSwatch.tsx — 1 edit
- src/ui/HomeDashboard.tsx — 2 edits
- src/ui/analysis/HabitsTable.tsx — 2 edits
- src/ui/analysis/PositionDetail.tsx — 2 edits
- src/ui/board/AlternativeLines_shared.tsx — 1 edit
- src/ui/board/ChessBoardView_shared.tsx — 1 edit
- src/ui/board/DepthInput_shared.tsx — 1 edit
- src/ui/board/GameAnalysisPanel_shared.tsx — 1 edit
- src/ui/board/GamesListTable.tsx — 1 edit
- src/ui/board/MasterGameView_master.tsx — 2 edits
- src/ui/board/MasterGamesDbPanel.tsx — 1 edit
- src/ui/board/MasterMovesDbPanel.tsx — 1 edit
- src/ui/board/MiniBoard.tsx — 1 edit
- src/ui/board/MoveTree_shared.tsx — 1 edit
- src/ui/board/MovesListTable.tsx — 1 edit
- src/ui/board/useMissingEvalAnalysis.ts — 1 edit
- src/ui/charts/OpeningScoreChart.tsx — 1 edit
- src/ui/charts/RatingChart.tsx — 2 edits
- src/ui/charts/TerminationChart.tsx — 1 edit
- src/ui/filters/ColorSelect.tsx — 1 edit
- src/ui/filters/FilterActionButton.tsx — 1 edit
- src/ui/filters/FilterDateInput.tsx — 1 edit
- src/ui/filters/FilterGraphTimeClassSelect.tsx — 1 edit
- src/ui/filters/FilterMultiCheckbox.tsx — 2 edits
- src/ui/filters/FilterNumberRange.tsx — 1 edit
- src/ui/filters/FilterPlayerSelect.tsx — 1 edit
- src/ui/filters/FilterSelect.tsx — 2 edits
- src/ui/filters/FilterTextInput.tsx — 1 edit
- src/ui/filters/FilterTimeClassSelect.tsx — 1 edit
- src/ui/filters/MasterPlayerMultiSelect.tsx — 1 edit
- src/ui/filters/MasterPlayerSelect.tsx — 1 edit
- src/ui/filters/PipelineTypeSelect.tsx — 1 edit
- src/ui/filters/ResultSelect.tsx — 1 edit
- src/ui/filters/TerminationMultiSelect.tsx — 1 edit
- src/ui/filters/TimeClassSelect.tsx — 1 edit
- src/ui/games/GameList.tsx — 2 edits
- src/ui/player/DeconstructButton.tsx — 1 edit
- src/ui/player/PlayerProfile.tsx — 1 edit

Flagged (not changed) — still open: src/types/stockfish.d.ts:2 `interface StockfishEngine` (inside a `declare module` block).

### Phase 8 — proposed
27 items in 27 files. `write_logging` signature read from `node_modules/nextjs-shared` (`lg_functionname`, `lg_caller`, `lg_msg`, `lg_severity` default `'E'`; it never throws).

Two choices built into this proposal, for the user to confirm or change:
- **Pair, not replace:** `console.error` is kept and `write_logging` is added next to it, because that is the pattern the project already uses in 10 places. The alternative is to remove `console.error` entirely.
- **`lg_caller`:** set to the same value as `lg_functionname` (as `runGameSync` does), since these are entry points with no caller of their own.

**Route handlers (18)** — each `catch` currently has only `console.error('<name> route error', err)`. Proposed: keep that line and add a `write_logging` call directly after it (plus the `write_logging` import), matching the 10 existing `console.error` + `write_logging` pairs elsewhere in the project (e.g. `api/cron/sync/route.ts`):
```ts
await write_logging({
  lg_functionname: 'api/analysis/build-tree',
  lg_caller: 'api/analysis/build-tree',
  lg_msg: 'build-tree route error: ' + (err as Error).message,
  lg_severity: 'E'
})
```
8.1 src/app/api/analysis/build-habits/route.ts:20 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/build-habits'` and `lg_msg` `'build-habits route error: ' + (err as Error).message`
8.2 src/app/api/analysis/build-tree/route.ts:28 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/build-tree'` and `lg_msg` `'build-tree route error: ' + (err as Error).message`
8.3 src/app/api/analysis/deepen-popular-positions/route.ts:25 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/deepen-popular-positions'` and `lg_msg` `'deepen-popular-positions route error: ' + (err as Error).message`
8.4 src/app/api/analysis/evaluate-game-endings/route.ts:26 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/evaluate-game-endings'` and `lg_msg` `'evaluate-game-endings route error: ' + (err as Error).message`
8.5 src/app/api/analysis/evaluate-positions/route.ts:26 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/evaluate-positions'` and `lg_msg` `'evaluate-positions route error: ' + (err as Error).message`
8.6 src/app/api/analysis/purge/route.ts:23 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/purge'` and `lg_msg` `'purge route error: ' + (err as Error).message`
8.7 src/app/api/analysis/sync-tpos/route.ts:24 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/sync-tpos'` and `lg_msg` `'sync-tpos route error: ' + (err as Error).message`
8.8 src/app/api/analysis/update-cp-change/route.ts:23 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/analysis/update-cp-change'` and `lg_msg` `'update-cp-change route error: ' + (err as Error).message`
8.9 src/app/api/fide/download-zip/route.ts:24 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/fide/download-zip'` and `lg_msg` `'download-zip route error: ' + (err as Error).message`
8.10 src/app/api/fide/parse/route.ts:23 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/fide/parse'` and `lg_msg` `'parse route error: ' + (err as Error).message`
8.11 src/app/api/fide/populate-top-players/route.ts:24 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/fide/populate-top-players'` and `lg_msg` `'populate-top-players route error: ' + (err as Error).message`
8.12 src/app/api/fide/refresh-ratings/route.ts:24 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/fide/refresh-ratings'` and `lg_msg` `'refresh-ratings route error: ' + (err as Error).message`
8.13 src/app/api/fide/unzip/route.ts:23 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/fide/unzip'` and `lg_msg` `'unzip route error: ' + (err as Error).message`
8.14 src/app/api/historicalgames/deconstruct/route.ts:24 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/historicalgames/deconstruct'` and `lg_msg` `'historicalgames deconstruct route error: ' + (err as Error).message`
8.15 src/app/api/historicalgames/upload/route.ts:32 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/historicalgames/upload'` and `lg_msg` `'historicalgames upload route error: ' + (err as Error).message`
8.16 src/app/api/mastergames/build-tree/route.ts:30 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/mastergames/build-tree'` and `lg_msg` `'mastergames build-tree route error: ' + (err as Error).message`
8.17 src/app/api/mastergames/sync-tpos/route.ts:25 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/mastergames/sync-tpos'` and `lg_msg` `'mastergames sync-tpos route error: ' + (err as Error).message`
8.18 src/app/api/mastergames/sync/route.ts:35 — add `write_logging` with `lg_functionname` / `lg_caller` `'api/mastergames/sync'` and `lg_msg` `'mastergames sync route error: ' + (err as Error).message`

**Cron scripts (9)** — each `catch` in `main()` has `console.error(err)` then `process.exit(1)`. Proposed: keep `console.error(err)` (the terminal output) and add a `write_logging` call before `process.exit(1)` (plus the import), so a failed cron run is recorded in `xlg_logging`:
8.19 lib/cron-build-habits.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-build-habits'` and `lg_msg` `'cron-build-habits failed: ' + (err as Error).message`
8.20 lib/cron-build-tree.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-build-tree'` and `lg_msg` `'cron-build-tree failed: ' + (err as Error).message`
8.21 lib/cron-deepen-popular.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-deepen-popular'` and `lg_msg` `'cron-deepen-popular failed: ' + (err as Error).message`
8.22 lib/cron-evaluate-game-endings.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-evaluate-game-endings'` and `lg_msg` `'cron-evaluate-game-endings failed: ' + (err as Error).message`
8.23 lib/cron-evaluate-positions.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-evaluate-positions'` and `lg_msg` `'cron-evaluate-positions failed: ' + (err as Error).message`
8.24 lib/cron-purge.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-purge'` and `lg_msg` `'cron-purge failed: ' + (err as Error).message`
8.25 lib/cron-sync-tpos.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-sync-tpos'` and `lg_msg` `'cron-sync-tpos failed: ' + (err as Error).message`
8.26 lib/cron-sync.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-sync'` and `lg_msg` `'cron-sync failed: ' + (err as Error).message`
8.27 lib/cron-update-cp-change.ts — add `write_logging` with `lg_functionname` / `lg_caller` `'cron-update-cp-change'` and `lg_msg` `'cron-update-cp-change failed: ' + (err as Error).message`

Flagged (not changed):
- src/ui/analysis/PipelineLogTable.tsx:108 and src/ui/player/DeconstructButton.tsx:56 — `console.error` in `'use client'` components. No client file in this project calls `write_logging`, and its documented usage is for server actions.
- lib/deconstruct-games.ts:30, :167 and lib/sync-games.ts:11, :86 — standalone command-line scripts that use a raw `pg` client and do not use `nextjs-shared` at all (two of the four are the "POSTGRES_URL not set" message, which cannot be logged to the database by definition).
- `console.log` output (36 calls, not changed): the 9 cron scripts' start banner and JSON result (18); progress output in lib/sync-games.ts and lib/deconstruct-games.ts (9); timing/debug logs in src/lib/stockfish.ts (3) and src/ui/board/ChessBoardView_shared.tsx (6).

Not targets (already compliant): the 10 `console.error` calls that are already followed by `write_logging` (api/cron/sync/route.ts, deconstructGames_Player.ts, sync.ts ×2, buildPositionTree_Player.ts, enrichPositionsStockfish.ts ×4, buildPositionTree_Master.ts).

### Phase 8 — applied
User reply: `approve` (all 27 items, with the two built-in choices: `console.error` kept alongside the new `write_logging`, and `lg_caller` equal to `lg_functionname`). Applied in one scripted pass (the same insertion in every file), then `npx tsc --noEmit` run once: passed. Every `console.error` in `src/app/api` and `lib/cron-*.ts` is now followed by `write_logging`.
- src/app/api/analysis/build-habits/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/build-tree/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/deepen-popular-positions/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/evaluate-game-endings/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/evaluate-positions/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/purge/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/sync-tpos/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/analysis/update-cp-change/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/fide/download-zip/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/fide/parse/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/fide/populate-top-players/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/fide/refresh-ratings/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/fide/unzip/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/historicalgames/deconstruct/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/historicalgames/upload/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/mastergames/build-tree/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/mastergames/sync-tpos/route.ts — 2 edits (import + `write_logging` call)
- src/app/api/mastergames/sync/route.ts — 2 edits (import + `write_logging` call)
- lib/cron-build-habits.ts — 2 edits (import + `write_logging` call)
- lib/cron-build-tree.ts — 2 edits (import + `write_logging` call)
- lib/cron-deepen-popular.ts — 2 edits (import + `write_logging` call)
- lib/cron-evaluate-game-endings.ts — 2 edits (import + `write_logging` call)
- lib/cron-evaluate-positions.ts — 2 edits (import + `write_logging` call)
- lib/cron-purge.ts — 2 edits (import + `write_logging` call)
- lib/cron-sync-tpos.ts — 2 edits (import + `write_logging` call)
- lib/cron-sync.ts — 2 edits (import + `write_logging` call)
- lib/cron-update-cp-change.ts — 2 edits (import + `write_logging` call)

Not run: the cron scripts and routes were not executed, so the new log rows themselves are unverified.

Flagged (not changed) — still open: the two client components, the two standalone scripts, and the 36 `console.log` calls listed in the proposal.

### Phase 9 — proposed
No changes. None of the 25 `'use server'` files in `src/` has an `export default` (or any non-function export).

### Phase 9 — applied
No changes.

### Phase 10 — proposed
Audit: 580 `alias.column` references in 62 SQL strings across 17 files. Scope decision (user): convert only the 12 simple queries — single-level statements that join distinct tables once, with no subquery and no interpolated SQL fragment — and flag the rest. `scripts/schema.sql` report: no `SERIAL`/`BIGSERIAL`, `REFERENCES` or `CASCADE` found.

SQL text is not type-checked: these 12 can only be verified by running them. Each item shows the complete statement after the change.

10.1 src/lib/analysis/chessdb_master.ts:70 (`getMovePlayCounts_master`) — remove the `p` / `gp` / `d` aliases and their 11 `alias.` prefixes. After:
```sql
SELECT mpos_fen, mgam_move_played, COUNT(*)::int AS times
FROM tmpos_positions
JOIN tmgam_game_positions ON mgam_pos_id = mpos_id
JOIN tmgd_gamesdecon ON mgd_mgdid = mgam_mgdid
WHERE mpos_fen IN (${fenPlaceholders})
AND mgam_move_num > 0
AND mgd_player = ${playerPlaceholder}
GROUP BY mpos_fen, mgam_move_played
```
10.2 src/lib/analysis/chessdb_master.ts:126 (`getMoveSummaryForPosition_master`) — remove the `p` / `gp` / `d` aliases and their 26 `alias.` prefixes. After:
```sql
SELECT
mgam_move_played                                   AS move_played,
mgam_move_uci                                      AS move_uci,
COUNT(DISTINCT mgam_mgdid)::int                    AS mov_times,
COUNT(DISTINCT mgam_mgdid) FILTER (
WHERE (mgd_player_color = 'white' AND mgd_player_result = 'win')
OR (mgd_player_color = 'black' AND mgd_player_result = 'loss')
)::int                                                 AS white,
COUNT(DISTINCT mgam_mgdid) FILTER (WHERE mgd_player_result = 'draw')::int AS draws,
COUNT(DISTINCT mgam_mgdid) FILTER (
WHERE (mgd_player_color = 'black' AND mgd_player_result = 'win')
OR (mgd_player_color = 'white' AND mgd_player_result = 'loss')
)::int                                                 AS black,
ROUND(AVG(mgd_opponent_rating))::int                 AS avg_opponent_rating,
MAX(mgam_resulting_fen)                            AS resulting_fen
FROM tmpos_positions
JOIN tmgam_game_positions ON mgam_pos_id = mpos_id
JOIN tmgd_gamesdecon ON mgd_mgdid = mgam_mgdid
WHERE mpos_fen = $1
AND mgam_move_num > 0
AND mgd_player = $2
GROUP BY mgam_move_played, mgam_move_uci
ORDER BY mov_times DESC
```
10.3 src/lib/analysis/chessdb_player.ts:140 (`getMovePlayCounts_player`) — remove the `p` / `gp` / `d` aliases and their 11 `alias.` prefixes. After:
```sql
SELECT pos_fen, gam_move_played, COUNT(*)::int AS times
FROM tpos_positions
JOIN tgam_game_positions ON gam_pos_id = pos_id
JOIN tgd_gamesdecon ON gd_gdid = gam_gdid
WHERE pos_fen IN (${fenPlaceholders})
AND gam_move_num > 0
AND gd_player = ${playerPlaceholder}
GROUP BY pos_fen, gam_move_played
```
10.4 src/lib/analysis/chessdb_shared.ts:404 (`getPositionEvaluationsBulk_shared`) — remove the `p` / `e` aliases and their 9 `alias.` prefixes. After:
```sql
SELECT pos_fen, pose_cp, pose_best_move, pose_depth
FROM tpos_positions
JOIN tpose_positions_eval ON pose_pos_id = pos_id
WHERE pos_fen = ANY($1) AND pose_cp IS NOT NULL AND pose_depth IS NOT NULL
```
10.5 src/lib/analysis/enrichPositionsStockfish.ts:231 (`enrichPositionsStockfish`) — remove the `p` / `e` aliases and their 8 `alias.` prefixes. After:
```sql
SELECT pos_id, pos_fen, pos_color
FROM tpos_positions
LEFT JOIN tpose_positions_eval ON pose_pos_id = pos_id
WHERE pose_pos_id IS NULL
AND pos_reached > ${MIN_REACH_TO_KEEP_Player}
ORDER BY pos_reached DESC
${limit > 0 ? `LIMIT ${posParams.length}` : ''}
```
10.6 src/lib/analysis/enrichPositionsStockfish.ts:748 (`countRemainingPositions`) — remove the `p` / `e` aliases and their 4 `alias.` prefixes. After:
```sql
SELECT COUNT(*) AS cnt FROM tpos_positions
LEFT JOIN tpose_positions_eval ON pose_pos_id = pos_id
WHERE pose_pos_id IS NULL
AND pos_reached > ${MIN_REACH_TO_KEEP_Player}
```
10.7 src/lib/analysis/enrichPositionsStockfish.ts:904 (`findExistingEvals`) — remove the `p` / `e` aliases and their 6 `alias.` prefixes. After:
```sql
SELECT pos_fen, pose_cp
FROM tpos_positions
JOIN tpose_positions_eval ON pose_pos_id = pos_id
WHERE pos_fen IN (${placeholders}) AND pose_cp IS NOT NULL
```
10.8 src/lib/master/masterGamesList.ts:405 (`getMasterGamesForFen`) — remove the `g` / `d` aliases and their 18 `alias.` prefixes. After:
```sql
SELECT mgam_move_played, mgam_move_uci, mgam_resulting_fen,
mgd_mgdid, mgd_white_username, mgd_black_username,
mgd_white_rating, mgd_black_rating,
mgd_player, mgd_player_color, mgd_player_result,
mgd_opponent_rating, mgd_termination, mgd_end_time
FROM tmgam_game_positions
JOIN tmgd_gamesdecon ON mgd_mgdid = mgam_mgdid
WHERE mgam_pos_id = $1
ORDER BY mgd_end_time DESC
LIMIT $2
```
10.9 src/lib/analysis/buildPositionTree_Player.ts:407 (`syncTposFromTgam_Player`) — remove the `g` / `p` aliases and their 5 `alias.` prefixes. After:
```sql
UPDATE tgam_game_positions
SET gam_pos_id = pos_id
FROM tpos_positions
WHERE gam_pos_id IS NULL AND gam_pos_fen = pos_fen
RETURNING pos_id
```
10.10 src/lib/analysis/buildPositionTree_Player.ts:422 (`syncTposFromTgam_Player`) — remove the `g` / `p` aliases and their 5 `alias.` prefixes. After:
```sql
UPDATE tgam_game_positions
SET gam_resulting_pos_id = pos_id
FROM tpos_positions
WHERE gam_resulting_pos_id IS NULL AND gam_resulting_fen = pos_fen
RETURNING pos_id
```
10.11 src/lib/master/buildPositionTree_Master.ts:345 (`syncTposFromTgam_Master`) — remove the `g` / `p` aliases and their 5 `alias.` prefixes. After:
```sql
UPDATE tmgam_game_positions
SET mgam_pos_id = mpos_id
FROM tmpos_positions
WHERE mgam_pos_id IS NULL AND mgam_pos_fen = mpos_fen
RETURNING mpos_id
```
10.12 src/lib/master/buildPositionTree_Master.ts:360 (`syncTposFromTgam_Master`) — remove the `g` / `p` aliases and their 5 `alias.` prefixes. After:
```sql
UPDATE tmgam_game_positions
SET mgam_resulting_pos_id = mpos_id
FROM tmpos_positions
WHERE mgam_resulting_pos_id IS NULL AND mgam_resulting_fen = mpos_fen
RETURNING mpos_id
```

Known consequence: three twins diverge in style — `getMoveSummaryForPosition_master` (converted) vs `getMoveSummaryForPosition_player` (flagged, has a subquery); `getMasterGamesForFen` (converted) vs `fetchMasterGamesForFenPage` (flagged, interpolated fragment); `countRemainingPositions` (converted) vs `refreshStep4` in pipelineStatus.ts (flagged).

Flagged (not changed) — 50 SQL strings:
- **Subquery, CTE or derived table, and/or the same table used in an outer query and its subquery (29)** — removing a prefix here can make a column ambiguous, or silently re-bind it to the inner table: src/lib/actions/deconstructGames_Player.ts:50 (`deconstructGames_Player`, 7 refs); src/lib/actions/deconstructGames_Player.ts:230 (`getUndeconstructedCount`, 6 refs); src/lib/actions/pipelineStatus.ts:39 (`getPipelineStatus`, 9 refs); src/lib/actions/pipelineStatus.ts:114 (`refreshStep1`, 6 refs); src/lib/actions/pipelineStatus.ts:158 (`refreshStep3`, 2 refs); src/lib/actions/pipelineStatus.ts:221 (`refreshStep4`, 4 refs); src/lib/actions/pipelineStatus.ts:253 (`refreshCpChangeStatus`, 7 refs); src/lib/actions/pipelineStatus.ts:294 (`refreshHabitsStatus`, 20 refs); src/lib/actions/pipelineStatus.ts:379 (`refreshPurgeStatus`, 11 refs); src/lib/analysis/buildHabits.ts:102 (`fetchHabitAggregates`, 36 refs); src/lib/analysis/buildPositionTree_Player.ts:75 (`buildPositionTree_Player`, 2 refs); src/lib/analysis/buildPositionTree_Player.ts:125 (`buildPositionTree_Player`, 3 refs); src/lib/analysis/buildPositionTree_Player.ts:484 (`recomputePosReachedByIds_Player`, 3 refs); src/lib/analysis/chessdb_player.ts:70 (`getMovesForPosition_player`, 35 refs); src/lib/analysis/chessdb_player.ts:192 (`getMoveSummaryForPosition_player`, 38 refs); src/lib/analysis/chessdb_player.ts:587 (`getHabitsData_player`, 23 refs); src/lib/analysis/chessdb_player.ts:815 (`getPositionDetail_player`, 34 refs); src/lib/analysis/chessdb_shared.ts:364 (`upgradePositionEvaluation_shared`, 11 refs); src/lib/analysis/enrichPositionsStockfish.ts:355 (`deepenPopularPositions`, 11 refs); src/lib/analysis/enrichPositionsStockfish.ts:452 (`countRemainingPopularPositions`, 7 refs); src/lib/analysis/enrichPositionsStockfish.ts:503 (`countRemainingPopularPositionsByTier`, 7 refs); src/lib/analysis/enrichPositionsStockfish.ts:794 (`getResultingFensToEvaluate`, 8 refs); src/lib/analysis/purgePositions.ts:64 (`purgeStaleReachOnePositions`, 15 refs); src/lib/analysis/purgePositions.ts:193 (`purgeStaleReachOnePositions`, 4 refs); src/lib/master/buildPositionTree_Master.ts:76 (`buildPositionTree_Master`, 4 refs); src/lib/master/buildPositionTree_Master.ts:113 (`buildPositionTree_Master`, 2 refs); src/lib/master/buildPositionTree_Master.ts:415 (`recomputePosReachedByIds_Master`, 3 refs); src/lib/master/masterGamesPipelineStatus.ts:14 (`refreshMasterSyncStatus`, 2 refs); src/lib/master/masterGamesPipelineStatus.ts:40 (`refreshMasterTreeStatus`, 1 refs).
- **Built from interpolated SQL fragments (5)** — the `${…Filter}` / `${whereClause}` pieces are assembled elsewhere and use the same aliases: src/lib/analysis/buildPositionTree_Player.ts:90 (`buildPositionTree_Player`, 3 refs); src/lib/analysis/chessdb_player.ts:683 (`getHabitsCount_player`, 4 refs); src/lib/analysis/chessdb_player.ts:853 (`getPositionDetail_player`, 5 refs); src/lib/analysis/chessdb_player.ts:866 (`getPositionDetail_player`, 11 refs); src/lib/master/masterGamesList.ts:298 (`fetchMasterGamesForFenPage`, 17 refs).
- **Genuine self-join (2)** — `tpose_positions_eval` appears twice (`e_before` / `e_after`); the convention's own exception: src/lib/analysis/chessdb_shared.ts:317 (`upgradePositionEvaluation_shared`, 16 refs); src/lib/analysis/enrichPositionsStockfish.ts:153 (`bulkUpdateCpLoss`, 16 refs).
- **`ON CONFLICT … DO UPDATE … WHERE table.column` (2)** — the qualifier is required there to tell the existing row from `EXCLUDED`: src/lib/actions/games.ts:214 (`upsertGameEval_player`, 1 refs); src/lib/master/masterGamesList.ts:580 (`upsertGameEval_master`, 1 refs).
- **`UPDATE … FROM (VALUES …) AS v(gdid, cp)` (1)** — derived column names: src/lib/analysis/enrichPositionsStockfish.ts:642 (`evaluateGameEndings`, 3 refs).
- **Display-only SQL help text in the pipeline pages (10)** — the `SQL_STATUS_*` strings shown in the "SQL" popovers mirror real queries that are themselves flagged above, so they are left matching: src/app/owner/pipelinegames/page.tsx:93 (`<module>`, 4 refs); src/app/owner/pipelinegames/page.tsx:100 (`<module>`, 1 refs); src/app/owner/pipelinegames/page.tsx:111 (`<module>`, 4 refs); src/app/owner/pipelinegames/page.tsx:116 (`<module>`, 7 refs); src/app/owner/pipelinegames/page.tsx:124 (`<module>`, 20 refs); src/app/owner/pipelinegames/page.tsx:146 (`<module>`, 11 refs); src/app/owner/pipelinegames/page.tsx:165 (`<module>`, 11 refs); src/app/owner/pipelinehistoricalgames/page.tsx:54 (`<module>`, 1 refs); src/app/owner/pipelinemastergames/page.tsx:57 (`<module>`, 2 refs); src/app/owner/pipelinemastergames/page.tsx:60 (`<module>`, 1 refs).
- **Standalone script (1)**: lib/deconstruct-games.ts:40 (`run`, 7 refs).

### Phase 10 — applied
User reply: `continue`, clarified on request as approval of all 12 rewrites. Applied in one scripted pass (the script that produced the SQL shown in the proposal), then `npx tsc --noEmit` run once: passed. A re-scan shows the 12 converted strings no longer contain qualified column references; the 50 flagged strings are unchanged.
- src/lib/analysis/chessdb_master.ts — 2 queries (`getMovePlayCounts_master`, `getMoveSummaryForPosition_master`)
- src/lib/analysis/chessdb_player.ts — 1 query (`getMovePlayCounts_player`)
- src/lib/analysis/chessdb_shared.ts — 1 query (`getPositionEvaluationsBulk_shared`)
- src/lib/analysis/enrichPositionsStockfish.ts — 3 queries (`enrichPositionsStockfish`, `countRemainingPositions`, `findExistingEvals`)
- src/lib/master/masterGamesList.ts — 1 query (`getMasterGamesForFen`)
- src/lib/analysis/buildPositionTree_Player.ts — 2 queries (`syncTposFromTgam_Player`)
- src/lib/master/buildPositionTree_Master.ts — 2 queries (`syncTposFromTgam_Master`)

Not verified: none of the 12 statements has been run against a database. The type-check cannot see inside SQL text, so each needs exercising by the user (to be listed in `## Testing`).

Flagged (not changed) — still open: the 50 SQL strings grouped in the proposal.

### Phase 11 — proposed
20 items: 1 constant move and 19 components whose `useState` declarations are not first (138 declarations in total). Audit also checked: every `'use client'` / `'use server'` directive is already the first line (0 findings), and no module-level `const` is declared below the function that uses it (0 findings).

Moving a `useState` above another hook call changes the order hooks are called in, which React allows as long as the order is the same on every render — it is. No initial value moves above something it depends on (those cases are flagged instead).

11.1 src/ui/analysis/PositionDetail.tsx:105 — `const TABS` is declared inside the `PositionDetail` component but is a static list (it uses no prop or state) → move it to module level, above the component.

**useState order** — one item per component. Each listed `useState` currently sits below a non-state statement (in most components just the `useRouter()` / `useSearchParams()` / `usePathname()` line) and moves up so the component body starts with its state. Order among the moved declarations is unchanged. A comment block directly above a declaration (e.g. the `Tree state` / `Analysis state` labels) moves with it, so the groups keep their labels.
11.2 src/app/analyze/page.tsx (`AnalyzeContent`) — move 7 declarations above `const searchParams = useSearchParams()`: `game`, `gdid`, `loading`, `error`, `stockfishDepth`, `deepAnalysisDepth`, `deepAnalysisMultiPv`
11.3 src/app/analyzemaster/page.tsx (`AnalyzeMasterContent`) — move 3 declarations above `const searchParams = useSearchParams()`: `row`, `loading`, `error`
11.4 src/app/graph/page.tsx (`GraphContent`) — move 7 declarations above `const searchParams = useSearchParams()`: `players`, `limit`, `minDate`, `loading`, `hydrated`, `appliedLimit`, `refreshNonce`
11.5 src/app/habits/page.tsx (`HabitsContent`) — move 13 declarations above `const searchParams = useSearchParams()`: `players`, `color`, `quality`, `sortBy`, `minMove`, `minReached`, `showDismissed`, `rows`, `loading`, `currentPage`, `rowsPerPage`, `totalCount`, `hydrated`
11.6 src/app/openings/page.tsx (`OpeningsContent`) — move 1 declaration above `const router = useRouter()`: `players`
11.7 src/app/owner/masterplayers/page.tsx (`MasterPlayersPage`) — move 2 declarations above `useEffect(() => {`: `findingHandle`, `handleResult`
11.8 src/app/position/[id]/page.tsx (`PositionDetailContent`) — move 2 declarations above `const params = useParams()`: `data`, `loading`
11.9 src/ui/AppNav.tsx (`AppNav`) — move 1 declaration above `const pathname = usePathname()`: `masterCards`
11.10 src/ui/AppShell.tsx (`PlayerHeader`) — move 3 declarations above `const pathname = usePathname()`: `players`, `dbPlayers`, `dbRatings`
11.11 src/ui/HomeDashboard.tsx (`HomeDashboard`) — move 1 declaration above `const router = useRouter()`: `minDate`
11.12 src/ui/analysis/PipelineLogTable.tsx (`PipelineLogTable`) — move 11 declarations above `const functionName = 'PipelineLogTable'`: `pipelineType`, `step`, `stepName`, `run`, `currentPage`, `rowsPerPage`, `tabledata`, `totalPages`, `totalRows`, `message`, `popup`
11.13 src/ui/board/ChessBoardView_shared.tsx (`ChessBoardView_shared`) — move 24 declarations above `const router = useRouter()`: `tree`, `currentNode`, `moveCounts`, `positionGames`, `positionGamesTotalRows`, `positionGamesPage`, `positionGamesRowsPerPage`, `moveSummary`, `selectedPositionMove`, `mastersData`, `selectedMastersMove`, `mastersFenEvals`, `plyEvals`, `analyzing`, `analysisProgress`, `analysisError`, `analysisResultMessage`, `fromMove`, `toMove`, `deepAnalyzing`, `deepAnalysisData`, `saveAnalysisMessage`, `fenCopied`, `boardKey`
11.14 src/ui/board/MasterGameView_master.tsx (`MasterGameView_master`) — move 21 declarations above `const router = useRouter()`: `tree`, `currentNode`, `moveCounts`, `boardKey`, `mastersData`, `mastersFenEvals`, `selectedMastersMove`, `plyEvals`, `analyzing`, `analysisProgress`, `analysisError`, `analysisResultMessage`, `stockfishDepth`, `fromMove`, `toMove`, `deepAnalysisDepth`, `deepAnalysisMultiPv`, `deepAnalyzing`, `deepAnalysisData`, `saveAnalysisMessage`, `fenCopied`
11.15 src/ui/board/MasterGamesDbPanel.tsx (`MasterGamesDbPanel`) — move 3 declarations above `const router = useRouter()`: `moveFilter`, `page`, `rowsPerPage`
11.16 src/ui/charts/OpeningScoreChart.tsx (`OpeningScoreChart`) — move 14 declarations above `const searchParams = useSearchParams()`: `color`, `from`, `minGames`, `resultsCount`, `data`, `loading`, `appliedPlayer`, `appliedTimeClass`, `appliedColor`, `appliedMinGames`, `appliedFrom`, `appliedResultsCount`, `refreshNonce`, `hydrated`
11.17 src/ui/charts/RatingChart.tsx (`RatingChart`) — move 1 declaration above `const playersToFetch = useMemo(() => (`: `granularityOverride`
11.18 src/ui/charts/TerminationChart.tsx (`TerminationChart`) — move 8 declarations above `const searchParams = useSearchParams()`: `color`, `appliedPlayer`, `appliedTimeClass`, `appliedColor`, `refreshNonce`, `data`, `loading`, `hydrated`
11.19 src/ui/games/GameList.tsx (`GameList`) — move 8 declarations above `const searchParams = useSearchParams()`: `draftFilters`, `filters`, `currentPage`, `rowsPerPage`, `hydrated`, `games`, `totalCount`, `loading`
11.20 src/ui/games/MasterGameList.tsx (`MasterGameList`) — move 8 declarations above `const router = useRouter()`: `draftFilters`, `filters`, `currentPage`, `rowsPerPage`, `hydrated`, `games`, `totalCount`, `loading`

Flagged (not changed):
- **`useState` whose initial value depends on an earlier statement (11)** — cannot move above what it reads: src/app/graph/page.tsx:63 `[draftDateFrom, setDraftDateFrom]` (initial value uses `dateFromFilter`); src/app/habits/page.tsx:78 `[draftDateFrom, setDraftDateFrom]` (initial value uses `dateFromFilter`); src/app/habits/page.tsx:79 `[draftOpening, setDraftOpening]` (initial value uses `openingFilter`); src/app/habits/page.tsx:80 `[draftEco, setDraftEco]` (initial value uses `ecoFilter`); src/ui/charts/OpeningScoreChart.tsx:71 `[draftDateFrom, setDraftDateFrom]` (initial value uses `dateFromFilter`); src/ui/charts/OpeningScoreChart.tsx:97 `[appliedDateFrom, setAppliedDateFrom]` (initial value uses `dateFromFilter`); src/ui/charts/TerminationChart.tsx:53 `[draftDateFrom, setDraftDateFrom]` (initial value uses `dateFromFilter`); src/ui/charts/TerminationChart.tsx:63 `[appliedDateFrom, setAppliedDateFrom]` (initial value uses `dateFromFilter`); src/ui/games/GameList.tsx:107 `[draftDateFrom, setDraftDateFrom]` (initial value uses `dateFromFilter`); src/ui/games/GameList.tsx:108 `[draftOpening, setDraftOpening]` (initial value uses `openingFilter`); src/ui/games/GameList.tsx:109 `[draftEco, setDraftEco]` (initial value uses `ecoFilter`).
- **The four `/owner` pipeline pages (62 declarations)** — there each step's state sits beside that step's handler under a `// ── Step N ──` divider. Left out for the same reason as Phase 5: these pages are slated for a shared step-row component (Phase 15 finding), which will restructure this state anyway. src/app/owner/pipelinegames/page.tsx (23), src/app/owner/pipelinehistoricalgames/page.tsx (13), src/app/owner/pipelinemastergames/page.tsx (10), src/app/owner/pipelinemasters/page.tsx (16).
- src/app/layout.tsx:39-40 — `DB_LOCATION` and `IS_DEV` are UPPER_CASE consts inside `RootLayout`; both read `process.env`, and moving them to module level changes when the variable is read.

### Phase 11 — applied
User reply: `approve` (all 20 items). The `useState` moves were applied in one scripted pass, then `npx tsc --noEmit`: passed. `npm run build` run afterwards as a sanity check: passed. A re-scan finds no movable `useState` left outside the four deferred pipeline pages.
- src/ui/analysis/PositionDetail.tsx — 2 edits (`TABS` moved to module level)
- src/app/analyze/page.tsx — 7 declarations moved
- src/app/analyzemaster/page.tsx — 3 declarations moved
- src/app/graph/page.tsx — 7 declarations moved
- src/app/habits/page.tsx — 13 declarations moved
- src/app/openings/page.tsx — 1 declaration moved
- src/app/owner/masterplayers/page.tsx — 2 declarations moved
- src/app/position/[id]/page.tsx — 2 declarations moved
- src/ui/AppNav.tsx — 1 declaration moved
- src/ui/AppShell.tsx — 3 declarations moved
- src/ui/HomeDashboard.tsx — 1 declaration moved
- src/ui/analysis/PipelineLogTable.tsx — 11 declarations moved
- src/ui/board/ChessBoardView_shared.tsx — 24 declarations moved
- src/ui/board/MasterGameView_master.tsx — 21 declarations moved
- src/ui/board/MasterGamesDbPanel.tsx — 3 declarations moved
- src/ui/charts/OpeningScoreChart.tsx — 14 declarations moved
- src/ui/charts/RatingChart.tsx — 1 declaration moved
- src/ui/charts/TerminationChart.tsx — 8 declarations moved
- src/ui/games/GameList.tsx — 8 declarations moved
- src/ui/games/MasterGameList.tsx — 8 declarations moved

Side effects of the move:
- Twelve files were left with a doubled blank line where a declaration had been; these were collapsed to a single blank line (whitespace only).
- Comments were moved, not reworded. At least one now reads slightly off: src/ui/charts/OpeningScoreChart.tsx's "Live filter values" comment says the applied snapshot is "below", and it is now above.

Not run in a browser.

Flagged (not changed) — still open: the 11 `useState` declarations that depend on an earlier statement, the four pipeline pages (62 declarations), and `DB_LOCATION` / `IS_DEV` in src/app/layout.tsx.

### Phase 12 — proposed
Audit: 28 files export more than one function, component or hook. 1 item is proposed; 27 are not candidates or are flagged.

12.1 src/lib/hooks/useGlobalFilter.ts — two exported hooks with no shared private helper. Split:
- `useGlobalFilter` stays in `src/lib/hooks/useGlobalFilter.ts` (the file keeps its name and its numbered main header) and imports `useGlobalFilters` from `./useGlobalFilters`.
- `useGlobalFilters` moves, with its own comment header unchanged, to a new `src/lib/hooks/useGlobalFilters.ts` (`'use client'` first line; imports `useRouter`, `usePathname`, `useSearchParams`).
- No function is renamed. `useGlobalFilter.ts` no longer needs `useRouter` / `usePathname`, so its import narrows to `useSearchParams`.
- Importers to update (2 — the files that import both hooks): src/app/habits/page.tsx, src/ui/games/GameList.tsx. The other 6 importers use only `useGlobalFilter` and are unchanged.

Flagged (not changed):
- **Utility modules of peer functions (4 files, 23 exports)** — src/lib/analysisTree.ts (11 exports), src/lib/parsePgn.ts (6), src/lib/fen.ts (3), src/lib/chesscom.ts (3). No export shares a private helper, so a literal reading of the rule would split them into one file per function (23 new files and every importer updated). Treated here like the server domain modules: a set of peer functions with no single main one. Say so if you want them split.

Not candidates (listed with the reason, not proposed):
- **`'use server'` modules of peer functions (20 files)** — a server-action file exports a set of related async functions with no single main function; most also share private table-name constants or filter builders: actions/deconstructGames_Player.ts (5), actions/fidePipelineStatus.ts (4), actions/games.ts (16), actions/masterPlayers.ts (5), actions/pipelineLog.ts (4), actions/pipelineStatus.ts (10), actions/players.ts (7), actions/sync.ts (3), analysis/buildPositionTree_Player.ts (2), analysis/chessdb_master.ts (4), analysis/chessdb_player.ts (11), analysis/chessdb_shared.ts (9), analysis/enrichPositionsStockfish.ts (6), fide/fidePipeline.ts (2), fide/fideStaging.ts (3), logStep.ts (2), master/buildPositionTree_Master.ts (2), master/importHistoricalGames.ts (3), master/masterGamesList.ts (9), master/masterGamesPipelineStatus.ts (3).
- **Shared module-level state or constant** — src/lib/analysis/evalSessionCache.ts (`getCachedEval` / `setCachedEval` share the private `cache`); src/lib/backNav.ts (`pushBackTarget` / `popBackTarget` share `readStack`, `writeStack`, `BACK_STACK_KEY`); src/lib/stockfish.ts (`classifyMove` and the `StockfishEngine` class both use `STOCKFISH_DEFAULTS` — splitting `classifyMove` out would make the two files import each other).

### Phase 12 — applied
User reply: `approve` (12.1). `npx tsc --noEmit` passed after the split.
- src/lib/hooks/useGlobalFilters.ts — new file (`useGlobalFilters`, moved with its comment header unchanged)
- src/lib/hooks/useGlobalFilter.ts — 2 edits (`useGlobalFilters` removed; import narrowed to `useSearchParams` plus the new `./useGlobalFilters` import)
- src/app/habits/page.tsx — 1 edit (import)
- src/ui/games/GameList.tsx — 1 edit (import)

Note for Phase 14: `useGlobalFilters.ts` still carries the dashed helper-style header it had inside the old file; as the only export of its own file it is due the numbered main header.

Flagged (not changed) — still open: the four utility modules of peer functions (analysisTree.ts, parsePgn.ts, fen.ts, chesscom.ts).

### Phase 13 — proposed
`function-order` skill run in audit-first form over `src/` and `lib/` (rule re-read from the global CLAUDE.md `### Functions` section: `useEffect`s first, then the main function, then helpers by first use). 4 items.

13.1 src/ui/analysis/HabitsTable.tsx — module-level helpers are `formatLastOccurred`, then `cpClass`. After Phase 5 moved the row calculations into named consts, `cpClass` is now used first (in `posCpClass`). Reorder to `cpClass`, then `formatLastOccurred` (each moves with its own header).
13.2 src/ui/board/ChessBoardView_shared.tsx — the last `useEffect` ("Cleanup engine on unmount", lines 1047-1049) sits below the twelve nested handler functions. Move it, with the comment block above it, up to follow the other eight effects (after line 420). It reads no `const` declared in between, and it stays the last effect, so effect order is unchanged. This also matches MasterGameView_master.tsx, where the same effect already sits with the others.
13.3 src/ui/games/GameList.tsx — nested functions `updateFilter`, `updateTerminationFilter`, `handleApplyFilters` (lines 214-248) sit above five `useEffect` calls. Move the three functions, with their headers and in the same order, to just below the last effect (after line 329, ahead of `handleSelectGame`). Function declarations hoist, so nothing that calls them is affected.
13.4 src/ui/games/MasterGameList.tsx — the master parallel: nested functions `updateFilter`, `updateTerminationFilter`, `handleApplyFilters`, `openMasterGame` (lines 134-181) sit above three `useEffect` calls. Move the four functions, with their headers and in the same order, to just below the last effect (after line 237).

Conversion pass: no `const` arrow function is convertible. The only named arrow found is `handler` in src/lib/stockfish.ts:323, whose body uses `this` — a `function` declaration would change the `this` binding, so it stays an arrow (same finding as the 2026-09-20 run).

Flagged (not changed):
- src/lib/analysis/enrichPositionsStockfish.ts — three private classes (`StockfishEngineBase`, `StockfishProcess`, `StockfishWasm`) are declared above the first export. Classes do not hoist the way `function` declarations do, so moving them below their users is not the same safe move.
- src/ui/owner/ConstantsViewer.tsx — `PopoverButton` is called by three helpers (`FunctionIndexPopup`, `SectionTable`, `renderValue`); strict first-use order would put it before `SectionTable`. Its header already records that it was placed last as a judgment call. A genuine multi-caller tie — not guessed.
- The four `/owner` pipeline pages — each has one `useEffect` below its nested functions (10-23 functions per page). Left for the planned step-row restructure, as in Phases 5 and 11.

### Phase 13 — applied
User reply: `approve` (13.1-13.4). One move at a time, `npx tsc --noEmit` after each: all four passed. A re-audit finds only the flagged cases left.
- src/ui/analysis/HabitsTable.tsx — 1 move (`cpClass` now above `formatLastOccurred`)
- src/ui/board/ChessBoardView_shared.tsx — 1 move (the "Cleanup engine on unmount" effect now follows the other effects)
- src/ui/games/GameList.tsx — 1 move (`updateFilter`, `updateTerminationFilter`, `handleApplyFilters` now below the last effect)
- src/ui/games/MasterGameList.tsx — 1 move (`updateFilter`, `updateTerminationFilter`, `handleApplyFilters`, `openMasterGame` now below the last effect)

Flagged (not changed) — still open: the three private classes in enrichPositionsStockfish.ts, the `PopoverButton` multi-caller tie in ConstantsViewer.tsx, and the four pipeline pages. `handler` in stockfish.ts stays an arrow (uses `this`).

### Phase 14 — proposed
`function-headers` skill run in audit-first form over `src/` and `lib/` (convention re-read from the global CLAUDE.md "Function comment headers" section). The audit covered 147 files and 441 non-main functions; 349 already have a complete header and 107 single-export files already have the numbered main header. 86 items in 28 files. Comment-only changes. No `3) CHANGE HISTORY` entries are added.

Every description below was written from the function's own code or its existing comments. They are worth a skim — in particular the class-method headers and the `Returns:` lines.

**Add a `Returns:` section to an otherwise complete header** — the function returns a value but its header did not say what. Each line shows the text added.
14.1 src/lib/actions/fidePipelineStatus.ts:10 `refreshFideZipStatus` — bytes — size in bytes of the zip currently staged
14.2 src/lib/actions/fidePipelineStatus.ts:31 `refreshFideXmlStatus` — chunks — number of chunks currently staged; chars — total characters across those chunks
14.3 src/lib/actions/fidePipelineStatus.ts:53 `refreshFideParsedStatus` — players — row count currently in tfpl_fide_players
14.4 src/lib/actions/fidePipelineStatus.ts:76 `refreshFideTaggedCount` — tagged — tmst_master_players rows currently linked to a FIDE id
14.5 src/lib/actions/masterPlayers.ts:32 `getMasterHandleNameMap` — a map of lowercased identifier (chess.com handle, or historical slug) → display name
14.6 src/lib/actions/masterPlayers.ts:108 `findNextMasterPlayerHandle` — mstid — the master player row that was picked; name — that player's name; handle — the chess.com handle found for them, or null; (the whole result is null once no eligible row remains)
14.7 src/lib/actions/pipelineLog.ts:114 `getPipelineRates` — one field per step (step1-step6, step8, step9) — that step's average ms per item, or null
14.8 src/lib/actions/pipelineStatus.ts:291 `refreshHabitsStatus` — total — row count in thab_habits; dismissed — how many of those rows are dismissed; remaining — qualifying (player, position, move) combinations with no thab_habits row yet
14.9 src/lib/actions/pipelineStatus.ts:336 `refreshGameEndingsStatus` — evaluated — games that have a gd_final_eval; remaining — games still without one
14.10 src/lib/actions/pipelineStatus.ts:365 `refreshDeepenPopularStatus` — tiers — one entry per depth tier: its depth and how many positions remain
14.11 src/lib/analysis/buildHabits.ts:97 `fetchHabitAggregates` — the aggregated habit rows (HabitAggregate[])
14.12 src/lib/analysis/chessdb_shared.ts:47 `getPositionCount_shared` — the total number of positions
14.13 src/lib/analysis/enrichPositionsStockfish.ts:830 `popularPositionTierSql` — caseSql — the shared CASE expression; lowestMinReach — the lowest reach threshold across the tiers
14.14 src/lib/master/importHistoricalGames.ts:296 `refreshHistoricalStatus` — staged — games currently staged, awaiting deconstruction; decon — historical games already in tmgd_gamesdecon
14.15 src/lib/master/masterGamesList.ts:510 `getSyncedMasterPlayers` — one SyncedMasterPlayer per distinct synced mgd_player
14.16 src/lib/master/masterGamesPipelineStatus.ts:11 `refreshMasterSyncStatus` — pending — raw rows not yet deconstructed; allDecon — total deconstructed games
14.17 src/lib/master/masterGamesPipelineStatus.ts:37 `refreshMasterTreeStatus` — allProcessed — tmgd_gamesdecon rows already represented in tmgam_game_positions; allRemaining — rows still outstanding
14.18 src/lib/master/masterGamesPipelineStatus.ts:65 `refreshMasterTposStatus` — positions — total tmpos_positions rows; unresolved — tmgam_game_positions rows with no mgam_pos_id link yet

**Reformat a loose comment into the bordered header style** — the existing wording is kept; the function name is added to the title; the old `// -------` rule lines (or bare `//` block) become the standard dash border; `Params:` / `Returns:` are added where missing.
14.19 src/ui/board/ChessBoardView_shared.tsx:346 `goToNode` — goToNode — Navigate to a tree node [Params]
14.20 src/ui/board/ChessBoardView_shared.tsx:359 `goToMainLineIndex` — goToMainLineIndex — Navigate main line by index (for slider) [Params]
14.21 src/ui/board/ChessBoardView_shared.tsx:434 `runAnalysis` — runAnalysis — Run full-game Stockfish analysis. On re-analysis (plyEvals already
14.22 src/ui/board/ChessBoardView_shared.tsx:635 `getCurrentPositionFen` — getCurrentPositionFen — The position currently shown on the board (after the selected move) — [Returns]
14.23 src/ui/board/ChessBoardView_shared.tsx:643 `copyFenToClipboard` — copyFenToClipboard — Copy the current position's FEN to the clipboard (e.g. to paste into
14.24 src/ui/board/ChessBoardView_shared.tsx:656 `startDeepAnalysis` — startDeepAnalysis — Analyze current position (own Depth/Lines controls, always depth-capped).
14.25 src/ui/board/ChessBoardView_shared.tsx:771 `refreshPositionPanels` — refreshPositionPanels — Re-fetch Moves From This Position / Games panel for whatever's currently
14.26 src/ui/board/ChessBoardView_shared.tsx:820 `persistAnalysisLines` — persistAnalysisLines — Persist Analysis — runs automatically whenever a Position Analysis run [Params]
14.27 src/ui/board/ChessBoardView_shared.tsx:924 `handleSelectPvLine` — handleSelectPvLine — Handle selecting an alternative PV line [Params]
14.28 src/ui/board/ChessBoardView_shared.tsx:950 `handlePieceDrop` — handlePieceDrop — Interactive board: handle piece drop [Params + Returns]
14.29 src/ui/board/MasterGameView_master.tsx:297 `goToNode` — goToNode — Navigate to a tree node [Params]
14.30 src/ui/board/MasterGameView_master.tsx:371 `runAnalysis` — runAnalysis — Run full-game Stockfish analysis. On re-analysis (plyEvals already exist), only
14.31 src/ui/board/MasterGameView_master.tsx:528 `getCurrentPositionFen` — getCurrentPositionFen — The position currently shown on the board (after the selected move) — [Returns]
14.32 src/ui/board/MasterGameView_master.tsx:536 `copyFenToClipboard` — copyFenToClipboard — Copy the current position's FEN to the clipboard (e.g. to paste into
14.33 src/ui/board/MasterGameView_master.tsx:550 `startDeepAnalysis` — startDeepAnalysis — Analyze current position (own Depth/Lines controls, always depth-capped).
14.34 src/ui/board/MasterGameView_master.tsx:650 `persistAnalysisLines_master` — persistAnalysisLines_master — Persist Analysis — runs automatically whenever a Position Analysis run completes. [Params]
14.35 src/ui/board/MasterGameView_master.tsx:733 `handleSelectPvLine` — handleSelectPvLine — Handle selecting an alternative PV line [Params]
14.36 src/ui/board/MasterGameView_master.tsx:753 `handlePieceDrop` — handlePieceDrop — Interactive board: handle piece drop — build-your-own-variation support [Params + Returns]
14.37 src/ui/games/ChessComSearchPanel_shared.tsx:149 `searchChessCom` — searchChessCom — Commit the current filter inputs and trigger the first page's fetch (via the effect above).
14.38 src/app/habits/page.tsx:224 `handleToggleDismiss` — handleToggleDismiss — dismisses or restores depending on which view is showing, then [Params]
14.39 src/lib/stockfish.ts:383 `StockfishEngine.analyzeGame` — analyzeGame — Deliberately does NOT require the engine to already be initialized (unlike [Params + Returns]

**Add a header where there is none** (class methods, two `useCallback` callbacks, one script helper). For `startInfiniteAnalysis` and `stopAnalysis` the existing `/** … */` text is folded into the new header.
14.40 src/lib/analysis/enrichPositionsStockfish.ts:26 `StockfishEngineBase.onLine` — onLine — receives one line of engine output: hands it to a waiting nextLine() caller, or queues it [Params]
14.41 src/lib/analysis/enrichPositionsStockfish.ts:38 `StockfishEngineBase.nextLine` — nextLine — the next line of engine output [Returns]
14.42 src/lib/analysis/enrichPositionsStockfish.ts:47 `StockfishEngineBase.evaluate` — evaluate — evaluates one position to a fixed depth over UCI [Params + Returns]
14.43 src/lib/analysis/enrichPositionsStockfish.ts:81 `StockfishProcess.constructor` — constructor — spawns the native Stockfish binary and feeds its stdout lines to onLine [Params]
14.44 src/lib/analysis/enrichPositionsStockfish.ts:88 `StockfishProcess.send` — send — writes one UCI command to the process's stdin [Params]
14.45 src/lib/analysis/enrichPositionsStockfish.ts:92 `StockfishProcess.init` — init — UCI handshake: waits for uciok, sets Threads to 4, then waits for readyok
14.46 src/lib/analysis/enrichPositionsStockfish.ts:100 `StockfishProcess.quit` — quit — sends quit and kills the process (errors ignored)
14.47 src/lib/analysis/enrichPositionsStockfish.ts:114 `StockfishWasm.send` — send — passes one UCI command to the WASM engine [Params]
14.48 src/lib/analysis/enrichPositionsStockfish.ts:118 `StockfishWasm.init` — init — loads the 'stockfish' WASM package (lite-single build), wires its output to onLine, and completes the UCI handshake
14.49 src/lib/analysis/enrichPositionsStockfish.ts:129 `StockfishWasm.quit` — quit — sends quit (errors ignored)
14.50 src/app/habits/page.tsx:192 `load` — load — fetches the current page of habits for the active filters and stores it in state (does nothing until hydrated and the players are loaded)
14.51 src/app/habits/page.tsx:234 `handleApplyFilters` — handleApplyFilters — writes the draft date / opening / ECO filters to the global URL filters in one update
14.52 src/lib/stockfish.ts:145 `StockfishEngine.init` — init — starts the Stockfish web worker and resolves once the engine reports readyok (does nothing when already ready; rejects if the worker fails to load)
14.53 src/lib/stockfish.ts:180 `StockfishEngine.send` — send — posts one UCI command to the worker [Params]
14.54 src/lib/stockfish.ts:192 `StockfishEngine.startInfiniteAnalysis` — startInfiniteAnalysis — Start deep analysis on a position. Calls onUpdate with live results as [Params]
14.55 src/lib/stockfish.ts:297 `StockfishEngine.stopAnalysis` — stopAnalysis — Stop infinite analysis
14.56 src/lib/stockfish.ts:315 `StockfishEngine.evaluate` — evaluate — evaluates one position to the given depth (throws when the engine is not initialized) [Params + Returns]
14.57 src/lib/stockfish.ts:323 `handler` — handler — worker message listener for this evaluate() call: tracks the rank-1 line's score and PV, and resolves the promise when bestmove arrives [Params]
14.58 src/lib/stockfish.ts:531 `StockfishEngine.destroy` — destroy — terminates the worker and resets the engine to uninitialized
14.59 lib/deconstruct-games.ts:12 `normalizeTermination` — normalizeTermination — maps chess.com's termination text to a short label ('Resignation', 'Time', 'Checkmate', …) [Params + Returns]

**Numbered `1) DESCRIPTION` header sitting on a non-main function → plain dashed style** (content unchanged; the numbered style is reserved for a file's one main function, and this file has three peer exports).
14.60 src/lib/master/importHistoricalGames.ts:72 `uploadHistoricalPgn` — uploadHistoricalPgn — pipeline stage 1. Splits an uploaded PGN blob (one or more files'
14.61 src/lib/master/importHistoricalGames.ts:141 `deconstructHistoricalGames` — deconstructHistoricalGames — pipeline stage 2. Reads every wk_hpg_historicalpgnraw row,

**Title-only header gets its description**
14.62 src/ui/dataflow/sections.tsx:26 `TplPlayersSection` — TplPlayersSection — the Dataflow page's documentation section for "tpl_players"
14.63 src/ui/dataflow/sections.tsx:100 `ChessComApiSection` — ChessComApiSection — the Dataflow page's documentation section for "chess.com API"
14.64 src/ui/dataflow/sections.tsx:151 `TgrGamesrawSection` — TgrGamesrawSection — the Dataflow page's documentation section for "wk_gr_gamesraw"
14.65 src/ui/dataflow/sections.tsx:212 `TgdGamesdeconSection` — TgdGamesdeconSection — the Dataflow page's documentation section for "tgd_gamesdecon"
14.66 src/ui/dataflow/sections.tsx:287 `TgamGamePositionsSection` — TgamGamePositionsSection — the Dataflow page's documentation section for "tgam_game_positions"
14.67 src/ui/dataflow/sections.tsx:412 `TposPositionsSection` — TposPositionsSection — the Dataflow page's documentation section for "tpos_positions"
14.68 src/ui/dataflow/sections.tsx:496 `PurgeSection` — PurgeSection — the Dataflow page's documentation section for "Purge"
14.69 src/ui/dataflow/sections.tsx:594 `PoseEvaluationsSection` — PoseEvaluationsSection — the Dataflow page's documentation section for "tpose_positions_eval"
14.70 src/ui/dataflow/sections.tsx:669 `BulkUpdateCpLossSection` — BulkUpdateCpLossSection — the Dataflow page's documentation section for "bulkUpdateCpLoss"
14.71 src/ui/dataflow/sections.tsx:718 `ThabHabitsSection` — ThabHabitsSection — the Dataflow page's documentation section for "thab_habits"
14.72 src/ui/dataflow/sections.tsx:810 `EvaluateGameEndingsSection` — EvaluateGameEndingsSection — the Dataflow page's documentation section for "Evaluate Game Endings"
14.73 src/ui/dataflow/sections.tsx:891 `DeepenPopularPositionsSection` — DeepenPopularPositionsSection — the Dataflow page's documentation section for "Deepen Popular Positions"

**Add the numbered main header at the top of a script file** (no header exists today).
14.74 lib/cron-build-habits.ts:1 `main` — cron-build-habits / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs buildHabits() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.75 lib/cron-build-tree.ts:1 `main` — cron-build-tree / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs buildPositionTree_Player() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.76 lib/cron-deepen-popular.ts:1 `main` — cron-deepen-popular / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs deepenPopularPositions() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.77 lib/cron-evaluate-game-endings.ts:1 `main` — cron-evaluate-game-endings / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs evaluateGameEndings() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.78 lib/cron-evaluate-positions.ts:1 `main` — cron-evaluate-positions / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs enrichPositionsStockfish() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.79 lib/cron-purge.ts:1 `main` — cron-purge / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs purgeStaleReachOnePositions() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.80 lib/cron-sync-tpos.ts:1 `main` — cron-sync-tpos / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs syncTposFromTgam_Player() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.81 lib/cron-sync.ts:1 `main` — cron-sync / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs runGameSync() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.82 lib/cron-update-cp-change.ts:1 `main` — cron-update-cp-change / main — command-line entry point, run outside Next.js (e.g. from cron). Loads .env, runs bulkUpdateCpLoss() directly and prints the result as JSON. On failure it logs the error (console and write_logging) and exits with code 1.
14.83 lib/sync-games.ts:1 `run` — sync-games / run — standalone command-line script (raw pg client, not nextjs-shared): fetches one player's chess.com monthly archives, oldest first, and syncs their games into the database, printing inserted / skipped counts per month. The player is argv[2], else NEXT_PUBLIC_PRIMARY_USERNAME, else 'stricade'. Exits with code 1 on failure.
14.84 lib/deconstruct-games.ts:1 `run` — deconstruct-games / run — standalone command-line script (raw pg client, not nextjs-shared): deconstructs one player's not-yet-deconstructed raw games in batches of BATCH_SIZE, printing progress and a processed / skipped / errors summary. The player is argv[2], else NEXT_PUBLIC_PRIMARY_USERNAME, else 'stricade'. Exits with code 1 on failure.

**New single-export file from Phase 12**
14.85 src/lib/hooks/useGlobalFilters.ts `useGlobalFilters` — its dashed helper-style header becomes the numbered main header, placed between `'use client'` and the imports: the first sentence becomes `1) DESCRIPTION` with a `Returns:` (a setter taking { key: value } updates; an empty value removes that param), and the existing explanation of why calling `useGlobalFilter`'s setter twice is unsafe moves, word for word, into `2) NOTES`.
14.86 src/lib/hooks/useGlobalFilters.ts `setMultiple` (the returned inner function) — add a header: setMultiple — applies several URL param updates in one router.push [Params]

Flagged (not changed):
- src/lib/actions/pipelineStatus.ts:276-282 — a second, orphaned `refreshPurgeStatus` header block sits directly above `refreshHabitsStatus`'s own header (the real `refreshPurgeStatus`, further down, has its own header). Removing it means deleting a comment, so it is left for the user to decide.
- src/lib/logStep.ts:14 — `logStart`'s header title reads "logStart / logEnd — call-hierarchy tracing for xlg_logging" (a shared title; `logEnd` also has its own). Complete as it stands; not reworded.
- src/lib/analysis/enrichPositionsStockfish.ts:1 — the file starts with an invisible byte-order mark before `'use server'`. Not a header issue; noted for Phase 15.

Not targets: the three `abstract` method declarations in `StockfishEngineBase` (no body); the first export of a multi-export file whose numbered file header already describes it (`deconstructGames_Player`, `runGameSync`, `buildPositionTree_Player`, `buildPositionTree_Master`); `getPlayerTimeClasses` in constants.ts (already has a complete plain header; a constants file has no main function).

### Phase 14 — applied
User reply: `approve` (all 86 items). 84 applied in one scripted pass (the script that produced the headers shown in the proposal), the two `useGlobalFilters.ts` headers by hand; `npx tsc --noEmit` passed. Comment-only: no statement was changed. A re-audit finds only the listed not-targets left (script `main`/`run` functions covered by their new file header, the three abstract declarations, the first export of four multi-export files, `logStart`).
- src/lib/actions/fidePipelineStatus.ts — 4 headers
- src/lib/actions/masterPlayers.ts — 2 headers
- src/lib/actions/pipelineLog.ts — 1 header
- src/lib/actions/pipelineStatus.ts — 3 headers
- src/lib/analysis/buildHabits.ts — 1 header
- src/lib/analysis/chessdb_shared.ts — 1 header
- src/lib/analysis/enrichPositionsStockfish.ts — 11 headers
- src/lib/master/importHistoricalGames.ts — 3 headers
- src/lib/master/masterGamesList.ts — 1 header
- src/lib/master/masterGamesPipelineStatus.ts — 3 headers
- src/ui/board/ChessBoardView_shared.tsx — 10 headers
- src/ui/board/MasterGameView_master.tsx — 8 headers
- src/ui/games/ChessComSearchPanel_shared.tsx — 1 header
- src/app/habits/page.tsx — 3 headers
- src/ui/dataflow/sections.tsx — 12 headers
- src/lib/stockfish.ts — 8 headers
- lib/cron-build-habits.ts — 1 header
- lib/cron-build-tree.ts — 1 header
- lib/cron-deepen-popular.ts — 1 header
- lib/cron-evaluate-game-endings.ts — 1 header
- lib/cron-evaluate-positions.ts — 1 header
- lib/cron-purge.ts — 1 header
- lib/cron-sync-tpos.ts — 1 header
- lib/cron-sync.ts — 1 header
- lib/cron-update-cp-change.ts — 1 header
- lib/sync-games.ts — 1 header
- lib/deconstruct-games.ts — 2 headers
- src/lib/hooks/useGlobalFilters.ts — 2 headers

Side effect on Phase 6's flags: 18 of the 34 dashed-rule comment blocks sat above a function and are now standard headers; 16 remain (above effects and other statements).

Flagged (not changed) — still open: the orphaned `refreshPurgeStatus` header block in pipelineStatus.ts, and the byte-order mark at the start of enrichPositionsStockfish.ts.

### After Phase 14 — build
`npm run build` run after Phase 14 was applied: passed (compiled successfully, all 43 pages generated). `npx tsc --noEmit`: passed.

### Phase 15 — findings (report-only)
Read-only audit of `src/` and `lib/`. Nothing is changed by this phase; the user picks which findings become work, and those are appended to `## Plan` as new unchecked steps. Each finding: where — what — which rule.

**A. Database access outside the shared `table_*` layer**
15.1 lib/sync-games.ts:9, :23 and lib/deconstruct-games.ts:9, :51 — both standalone scripts open a raw `pg` `Client` and run their own SQL — "Database access — always use the shared table_ functions". They also still target `tgr_gamesraw`, a table name that is not in `scripts/schema.sql` (the schema has `wk_gr_gamesraw`), so as written they do not match the current schema. They look superseded by `runGameSync` / `deconstructGames_Player` and the `cron-*.ts` scripts.

**B. Pipeline / maintenance reads without `skipCache: true`** — "Maintenance/pipeline reads must never use the cache". 108 read calls were checked; 42 have no `skipCache`. 28 of those are display reads for app pages, where caching is the intended trade-off. The 14 below are pipeline, status or maintenance reads:
15.2 src/lib/actions/deconstructGames_Player.ts:48 (`deconstructGames_Player` — the fetch of raw games still to process), :227 (`getUndeconstructedCount`), :256 (`getDeconstructedCount`)
15.3 src/lib/actions/games.ts:130 (`getLatestGameEndTime` — the sync cutoff), :773 and :806 (`backfillOpeningMoves`)
15.4 src/lib/actions/players.ts:122 (`updatePlayerRating`, part of game sync)
15.5 src/lib/fide/fidePipeline.ts:64 (`populateFideTopPlayers`), :153 (`refreshFideRatings`), :244 (`findUnlinkedRowByName`)
15.6 src/lib/fide/fideStaging.ts:84 (`unzipFideZip` — reads the staged zip)
15.7 src/app/api/analysis/diag/route.ts:19-21 (three diagnostic reads)

**C. Destructive operations in application code** — "Never embed data-destructive operations in code" (`wk_` tables exempt)
15.8 src/lib/fide/fideStaging.ts:213 — `table_truncate('tfpl_fide_players', …)` inside `parseFideXml`. `tfpl_fide_players` is a `t` table, not a `wk_` workfile, so truncating it in code is outside the documented exemption. The function's own header says it is truncated and fully repopulated every run — so either the table is really a workfile (rename to `wk_`), or this needs recording as an agreed exception.
Not findings: the other `table_truncate` calls are all on `wk_` tables; the three `DELETE` statements in purgePositions.ts are the documented, user-approved purge exception.

**D. Schema file vs code** — "scripts/schema.sql is the single source of truth"
15.9 scripts/schema.sql — `teva_evaluations` and `tqui_quiz` are defined in the schema but no code in `src/` or `lib/` references them.
15.10 scripts/schema.sql — `xrtg_routing` (the nextjs-shared routing table the build log shows being loaded) is not in the schema file, although `xlg_logging` is.
15.11 src/ui/board/MasterGameView_master.tsx:167 — a comment names `tpos_positions_eval`; the table is `tpose_positions_eval`.

**E. Hardcoded tunables and decisions typed inline** — "Constants" and "Explicit choices (4)"
15.12 src/ui/board/ChessBoardView_shared.tsx:1048 and src/ui/board/MasterGameView_master.tsx:713 — `cpLoss > 200 ? 'blunder' : cpLoss > 100 ? 'mistake' : cpLoss > 50 ? 'inaccuracy' : 'good'` re-types the classification thresholds inline, next to a hardcoded `depth: 16`. `classifyMove()` in stockfish.ts already does this from `STOCKFISH_BLUNDER_CP` / `STOCKFISH_MISTAKE_CP` / `STOCKFISH_INACCURACY_CP`, so these two can drift from the constants.
15.13 The mate score `10000` is typed in four places: src/lib/analysis/enrichPositionsStockfish.ts:86, src/lib/stockfish.ts:250 and :381, src/lib/formatCp.ts:14-15.
15.14 Default batch sizes and limits typed in signatures or bodies: src/app/api/analysis/deconstruct/route.ts:36 (`500`), src/lib/actions/games.ts:73 and :376 (`limit = 100`), :607-608 (`minGames = 100`, `limit = 20`), :769 (`batchSize = 500`), src/lib/actions/pipelineLog.ts:249 (`limit = 5`), src/lib/analysis/enrichPositionsStockfish.ts:271 (`opts.limit ?? 50`), src/lib/analysis/chessdb_player.ts:502 (`minReached ?? 3`) and the `LIMIT 50` in `getPositionDetail_player`, src/lib/chesscom.ts:37 (`count = 10`), src/app/habits/page.tsx:54 (`useState(3)`), src/app/owner/pipelinegames/page.tsx:727 (`?? 50`).
15.15 Chunk sizes: src/lib/analysis/buildPositionTree_Player.ts:480 and src/lib/master/buildPositionTree_Master.ts:411 (`start += 1000`); the Stockfish `Threads value 4` in enrichPositionsStockfish.ts (`StockfishProcess.init`).
15.16 UI timings and thresholds: `setFromMove(Math.min(5, …))` in ChessBoardView_shared.tsx:580 and MasterGameView_master.tsx:212, :489; the 1500 ms "Copied" timeout in both board views; the 2000 ms filter debounce in src/ui/analysis/PipelineLogTable.tsx:57; the chart thresholds in src/ui/charts/RatingChart.tsx (tick counts at :223, the 92-day label cut-off at :310/:328, the 14/365-day granularity cut-offs at :346-365) and OpeningScoreChart.tsx (`Math.max(200, n * 28)`, score colour cut-off 40).
15.17 Pipeline step numbers typed as literals in `logPipelineStep({ step: N … })` calls (buildHabits.ts:69, buildPositionTree_Player.ts:458-459, enrichPositionsStockfish.ts:241/324/368/447/484, fidePipeline.ts:218, fideStaging.ts:298, buildPositionTree_Master.ts:393-394) and again in each pipeline page's step table.

**F. The same logic or literal duplicated across files** — "Explicit choices (4)" and "Catch duplication before writing the second copy"
15.18 `ss<T>(key, fallback)` (sessionStorage read helper) — six identical copies: src/app/graph/page.tsx:228, src/app/habits/page.tsx:322, src/ui/charts/TerminationChart.tsx:239, src/ui/games/GameList.tsx:618, src/ui/games/MasterGameList.tsx:491, and `sso` in src/ui/charts/OpeningScoreChart.tsx:343.
15.19 `n(val)` (number formatter) — four identical copies, one per pipeline page (pipelinegames :1122, pipelinehistoricalgames :529, pipelinemastergames :492, pipelinemasters :527).
15.20 Percentage helper — `pct` in src/ui/board/MovesListTable.tsx:99, a nested `pct` in src/ui/analysis/PositionDetail.tsx:217, the three `masters…Pct` lines in each board view, and `winPct` in src/lib/winPct.ts.
15.21 Date formatting from epoch seconds — `formatGameDate` defined twice (ChessBoardView_shared.tsx:1606, MasterGameView_master.tsx:1222), `formatLastOccurred` (HabitsTable.tsx:436), and the same dd/mm/yy assembly written inline in GameList.tsx:530 and MasterGameList.tsx:403.
15.22 Name assembly (first name + last name, or last name alone) — `combineName` in src/lib/actions/masterPlayers.ts:251, and again inline in src/ui/AppNav.tsx (`displayName`) and src/app/owner/masterplayers/page.tsx (`fullName`).
15.23 `normalizeTermination` — defined in lib/deconstruct-games.ts:29 and again in src/lib/parsePgn.ts.
15.24 The cp-change `UPDATE tgam_game_positions … FROM tpos_positions p, tpose_positions_eval e_before, e_after` statement — written twice (src/lib/analysis/chessdb_shared.ts:317 and src/lib/analysis/enrichPositionsStockfish.ts:153), differing only in the final filter.
15.25 The `SQL_STATUS_*` help strings in the pipeline pages re-type the status queries that live in src/lib/actions/pipelineStatus.ts and src/lib/master/masterGamesPipelineStatus.ts (10 strings), including tier thresholds (`pos_reached >= 50 / 30 / 10`, depths 30 / 24 / 22) that `POPULAR_POSITION_DEPTH_TIERS_Player` already holds.
15.26 Locally re-declared types: `LatestRun` ×4 (the pipeline pages), `FilterOption` ×2 (FilterSelect.tsx, FilterMultiCheckbox.tsx), `PlayerOption` ×2, `Quality` ×2, `SortBy` ×2, `Color` ×2, `Tab` ×2. None of them duplicates a type exported by `nextjs-shared/structures` (checked against its export list).

**G. Hardcoded lists and URLs** — "Never create a hardcoded list without explicit confirmation"
15.27 `'stricade'` as the fallback username in lib/sync-games.ts:14 and lib/deconstruct-games.ts:15.
15.28 External base URLs typed where they are used rather than in constants.ts: `https://api.chess.com/pub` (src/lib/chesscom.ts:1, lib/sync-games.ts:32), `https://explorer.lichess.org` (src/lib/actions/lichess.ts:23), `https://lichess.org/` (both board views), `https://www.chess.com/games/search` (src/lib/actions/chesscomSearch.ts:83), `https://www.chess.com/players/` (src/lib/actions/masterPlayers.ts:152), `https://www.chess.com/member/` (src/app/owner/masterplayers/page.tsx:126). The FIDE download URL is already in constants.ts.
Not findings: `TIME_CLASSES_Player`, `PLAYER_AVATARS` and `MASTER_AVATARS` in constants.ts are the agreed curated sets.

**H. Inline option lists and repeated JSX shapes** — "Reusable UI components — build once, use many" and "Multi-tab / multi-panel pages"
15.29 The four `/owner` pipeline pages hand-write one `<tr>` per step with the same shape (help, result, SQL, refresh, remaining + ETA, status badge, error, Run button) — about 28 step rows across the four pages, plus four copies of the run-summary table. A shared step-row component (and one `LatestRun` type, one `n`, one `StatusBadge`) would absorb the ~234 JSX calculations, 62 `useState` declarations and 35 divider comments deferred in Phases 5, 6, 11 and 13.
15.30 ChessBoardView_shared.tsx and MasterGameView_master.tsx duplicate the Stockfish panel, the Lichess Moves panel and the Lichess Games panel as inline JSX (now also as twin blocks of named consts). Already recorded in the project CLAUDE.md "Outstanding items"; listed here for completeness.
15.31 GameList.tsx and MasterGameList.tsx duplicate the filter row and the table body (same columns, same row-callback consts after Phase 5).
15.32 The "Refresh" button block (`refreshVariant` / `refreshLabel`) and the "Loading / No data / chart" trio are repeated in OpeningScoreChart.tsx, TerminationChart.tsx and the graph page.
15.33 Inline option lists that are named, fixed sets: White/Black colour (HabitsTable.tsx:192 — a `ColorSelect` component already exists), Bad/Good quality (:217), Min 2×/3×/5×/10× reach (:238), Biggest/Most played sort (:254), Best/Worst (OpeningScoreChart.tsx:249), engine lines 1-5 (both board views), and record counts 10-1000/All (DeconstructButton.tsx:73).

**I. Explicit types** — "Always type function parameters and return values explicitly"
15.34 288 function declarations have no explicit return type (every parameter is typed). Most are React components and nested event handlers; the largest groups are the four pipeline pages (64), the two board views (30) and sections.tsx (13).

**J. Carried forward from earlier phases (still flagged, listed so nothing is lost)**
15.35 Phase 2 — `run().catch(…)` in lib/sync-games.ts and lib/deconstruct-games.ts (the same two scripts as 15.1).
15.36 Phase 6 — 16 dashed-rule comment blocks above effects, 35 divider comments in the pipeline pages, 3 trailing comments (two in stockfish.ts, one in RatingChart.tsx).
15.37 Phase 7 — `interface StockfishEngine` in src/types/stockfish.d.ts.
15.38 Phase 8 — `console.error` in two client components; 36 `console.log` calls (9 are timing logs in stockfish.ts and ChessBoardView_shared.tsx).
15.39 Phase 10 — 50 SQL strings still using `alias.column` notation.
15.40 Phase 11 — 11 `useState` declarations that depend on an earlier statement; `DB_LOCATION` / `IS_DEV` inside `RootLayout`.
15.41 Phase 12 — analysisTree.ts, parsePgn.ts, fen.ts, chesscom.ts export several peer functions each.
15.42 Phase 13 — three private classes above the first export in enrichPositionsStockfish.ts; the `PopoverButton` ordering tie.
15.43 Phase 14 — the orphaned `refreshPurgeStatus` header block in pipelineStatus.ts:276-282; the byte-order mark at the start of enrichPositionsStockfish.ts.

Checked and clean: only one constants file exists (src/lib/constants.ts); the only `.sql` file is scripts/schema.sql and there are no migration files; no table or column name in code breaks the prefix conventions.

### Phase 15 — decision
User reply: `continue` — no finding was selected to become a plan step at this point. The 43 findings stay recorded above; any of them can still be picked later.

### Phase 16 — n/a
Component-authoring checks apply to `nextjs-shared` only.

### Phase 17 — proposed (gated — always stops)
Shared component list read fresh from `node_modules/nextjs-shared/CONSUMING_PROJECTS.md` §7 (MyButton, MyInput, MyInputNumeric, MySelect, MySelectTable, MySelectMulti, MySelectRows, MyTab, MyTextarea, MyCheckbox, MyToggle, MyConfirmDialog, MyPagination, MyPaginationFooter, MyLink, MyPopup, MyHelp, MyHelpField, MyHelpStep, MyHourGlass, MyLoadingMessage, MyBox), with props checked against the installed source.

Audit result: the project already uses the shared components almost everywhere — there is no raw `<select>`, `<textarea>`, checkbox, confirm dialog or hand-rolled pagination left, and the only raw `<input>` is a file picker. 4 items.

17.1 src/app/owner/pipelinemastergames/page.tsx:285 — a raw `<label htmlFor='master-sync-year' className='font-bold text-xs whitespace-nowrap'>Year</label>` sits beside a `MySelect`. → remove the `<label>` and pass `label='Year'` to that `MySelect`. Prop mapping: the label text moves to `label`; no `labelClass` is needed because `MySelect`'s default label class is exactly `font-bold text-xs whitespace-nowrap`; `id='master-sync-year'` stays on the select. Visible difference: the gap between label and select becomes `gap-2` (MySelect's container) instead of the row's `gap-3`.
17.2 src/ui/board/MasterGamesDbPanel.tsx:117 — `<div className='flex items-center gap-2'><label className='text-xxs text-gray-500'>Move</label><MySelect …/></div>` → `<MySelect label='Move' labelClass='text-xxs text-gray-500' …/>`. The wrapper `<div>` goes, because `MySelect`'s own container is already `flex items-center gap-2`. No visible difference expected.
17.3 src/ui/owner/ConstantsViewer.tsx:337 (`PopoverButton` trigger) — raw `<button type='button' onClick=… className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'>` → `<MyButton type='button' onClick=… overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>`. Prop mapping: `className` → `overrideClass`; `onClick` / `type` unchanged. The override string is the one the pipelinegames page already uses for its small outlined refresh buttons. Visible difference: `rounded-md` instead of `rounded`, and `px-2` instead of `px-1.5` on wide screens.
17.4 src/ui/owner/ConstantsViewer.tsx:348 (`PopoverButton` close "×") — raw `<button onClick=… className='text-gray-400 hover:text-gray-700 text-sm leading-none font-bold' type='button'>` → `<MyButton type='button' onClick=… overrideClass='h-auto md:h-auto px-0 md:px-0 bg-transparent hover:bg-transparent text-gray-400 hover:text-gray-700 text-sm leading-none font-bold'>`. No visible difference expected.

Flagged (not changed):
- src/ui/BackButton.tsx:30 — a raw `<button>` deliberately styled as a plain text link to match `MyBackHomeNav` (its header says so), and its `className` prop lets callers restyle it. `MyButton`'s defaults (blue background, fixed height, padding) would all have to be overridden. Deliberately project-specific.
- src/app/owner/pipelinehistoricalgames/page.tsx:297 — `<input type='file' accept='.pgn' multiple>`. `MyInput` accepts the props, but its defaults are for a text box (border, fixed height); there is no shared file-input component. Possible `nextjs-shared` amendment: a file-input variant.
- src/app/owner/pipelinehistoricalgames/page.tsx:287 — `<label>` beside a `MyInput`. `MyInput` has no `label` prop (unlike `MySelect`). Possible `nextjs-shared` amendment: an opt-in `label` / `labelClass` on `MyInput`, defaulting to none.
- External links with `target='_blank'` — src/app/owner/masterplayers/page.tsx:141, src/ui/board/GamesListTable.tsx:109, src/ui/games/ChessComSearchPanel_shared.tsx:262. `MyLink` wraps Next's `<Link>` and takes a `{ pathname, query }` object for internal routes, so it does not fit an external URL.
- src/ui/AppNav.tsx `TabGroup` — the main tab bar is built from Next `<Link>` elements (real navigation, with hrefs). `MyTab` is a `<button>`, so it is not a fit.
- src/ui/owner/ConstantsViewer.tsx `PopoverButton` and src/ui/analysis/PipelineHelp.tsx — hand-rolled toggle popovers. `MyHelp` takes `text` or structured `items`, not arbitrary children (a list, a `<pre>`, a table), so it is a near-fit only. Possible `nextjs-shared` amendment: `children` support on `MyHelp`.
- src/ui/analysis/PipelineHelp.tsx:146 — observation, not a control swap: its "Help" `MyButton` overrides the text colour to blue but not `MyButton`'s default blue background, so the label may be hard to read. Worth a look when testing /owner/pipelinegames.
- Plain `<p>Loading...</p>` text in OpeningScoreChart.tsx, TerminationChart.tsx, GameList.tsx and MasterGameList.tsx where `MyLoadingMessage` exists — a different look (and inside a table row in the two lists); left as a visual choice.

### Phase 17 — applied
User reply: `approve` (17.1-17.4). `npx tsc --noEmit` after each file: passed. Phase gate: `npx tsc --noEmit` + `npm run build`: both passed. Re-run of the audit half of Phases 4-7 afterwards: nothing new (Phase 4: 0, Phase 5: only the deferred pipeline pages, Phase 6: 0 to convert, Phase 7: 0).
- src/app/owner/pipelinemastergames/page.tsx — 1 edit (raw `<label>` removed; `label='Year'` on the `MySelect`)
- src/ui/board/MasterGamesDbPanel.tsx — 1 edit (raw `<label>` and wrapper `<div>` removed; `label` / `labelClass` on the `MySelect`)
- src/ui/owner/ConstantsViewer.tsx — 3 edits (`MyButton` import; the popover trigger and close buttons now `MyButton`)

Not checked in a browser.

Flagged (not changed) — still open: BackButton.tsx, the PGN file picker and its sibling label, three external links, the AppNav tab bar, the hand-rolled popovers, the plain Loading text, and the PipelineHelp "Help" button colour observation.

### Phase 18 — proposed
No changes. There is no `window.location` (or `document.location` / bare `location.`) use anywhere in `src/` or `lib/`; URLs are already read and built with `usePathname()` / `useSearchParams()` / `router.push()`.

### Phase 18 — applied
No changes.

### Phase 19 — proposed (gated — rename table, agreed row by row)
Rule re-read in full from the global CLAUDE.md ("Variable and identifier naming — always match the Data Dictionary source"). DD source: the 192 columns in `scripts/schema.sql`.

How the audit was done, and its limit: SQL `AS` aliases of real columns (41 found), `useState` names and URL query-param names were scanned mechanically and each hit was then read in context. Local variables, props and parameters were **not** reviewed one by one against the DD, so this table is the clear cases, not a guarantee that nothing else is misnamed.

Risk note: most query results are typed `any` at the point they are read (`data.map((r: any) => …)`), so the type-check does not catch a missed rename there. Each row below lists every place it touches so it can be checked by eye; the SQL itself can only be verified by running it.

**A. SQL aliases** — "default to no alias at all"; an alias stays only for a real same-row collision, and then keeps the DD root.

| # | File / function | Old | New | Also changes |
|---|---|---|---|---|
| 19.1 | chessdb_player.ts `getHabitsData_player` | `hab_pos_id AS pos_id` | `hab_pos_id` (no alias) | mapper read `r.pos_id` → `r.hab_pos_id` |
| 19.2 | same | `hab_player AS player` | `hab_player` | `r.player` → `r.hab_player` |
| 19.3 | same | `hab_move_san AS move_san` | `hab_move_san` | `r.move_san` → `r.hab_move_san` |
| 19.4 | same | `hab_move_uci AS move_uci` | `hab_move_uci` | `r.move_uci` → `r.hab_move_uci` |
| 19.5 | same | `hab_move_num AS move_num` | `hab_move_num` | `r.move_num` → `r.hab_move_num` |
| 19.6 | same | `hab_move_times AS move_times` | `hab_move_times` | `r.move_times` → `r.hab_move_times` |
| 19.7 | same | `hab_move_wins AS move_wins` | `hab_move_wins` | `r.move_wins` → `r.hab_move_wins` |
| 19.8 | same | `hab_move_losses AS move_losses` | `hab_move_losses` | `r.move_losses` → `r.hab_move_losses` |
| 19.9 | same | `hab_opening_name AS opening_name` | `hab_opening_name` | `r.opening_name` → `r.hab_opening_name` |
| 19.10 | same | `hab_eco_code AS eco_code` | `hab_eco_code` | `r.eco_code` → `r.hab_eco_code` |
| 19.11 | same | `hab_last_occurred AS last_occurred` | `hab_last_occurred` | `r.last_occurred` → `r.hab_last_occurred` |
| 19.12 | same | `e.pose_cp AS pos_cp` | `e.pose_cp AS pose_cp_before` | result field `pos_cp` → `pose_cp_before`: the return type in chessdb_player.ts, `HabitRow` in HabitsTable.tsx, 2 reads in HabitsTable.tsx |
| 19.13 | same | `e2.pose_cp AS move_cp` | `e2.pose_cp AS pose_cp_after` | result field `move_cp` → `pose_cp_after`: same two types, 2 reads in HabitsTable.tsx |
| 19.14 | buildPositionTree_Player.ts `buildPositionTree_Player` | `gd_gdid AS gdid` | `gd_gdid` | mapper read `r.gdid` → `r.gd_gdid` |
| 19.15 | same | `gd_pgn AS pgn` | `gd_pgn` | `r.pgn` → `r.gd_pgn` |
| 19.16 | buildPositionTree_Master.ts `buildPositionTree_Master` | `mgd_mgdid AS mgdid` | `mgd_mgdid` | mapper read `r.mgdid` → `r.mgd_mgdid` |
| 19.17 | same | `mgd_pgn AS pgn` | `mgd_pgn` | `r.pgn` → `r.mgd_pgn` |
| 19.18 | games.ts `getTerminationStats` | `gd_termination AS termination` | `gd_termination` | mapper read `r.termination` → `r.gd_termination` |
| 19.19 | buildPositionTree_Player.ts `syncTposFromTgam_Player` | `gam_pos_fen AS fen` | `gam_pos_fen AS pos_fen` | the outer `SELECT DISTINCT fen, split_part(fen, …)` → `pos_fen` |
| 19.20 | same | `gam_resulting_fen AS fen` | `gam_resulting_fen AS pos_fen` | (same statement) |
| 19.21 | buildPositionTree_Master.ts `syncTposFromTgam_Master` | `mgam_pos_fen AS fen` | `mgam_pos_fen AS mpos_fen` | the outer `SELECT DISTINCT fen, …` → `mpos_fen` |
| 19.22 | same | `mgam_resulting_fen AS fen` | `mgam_resulting_fen AS mpos_fen` | (same statement) |

Notes on A:
- 19.1-19.11 change only the SQL and the mapper's reads inside the same function. The object the function returns keeps its current keys (`pos_id`, `player`, `move_san`, …), so no other file changes. Renaming those returned keys to the raw column names as well is listed under Flagged for a decision.
- 19.12/19.13 are a genuine collision (`tpose_positions_eval` joined twice), so an alias is needed; `pos_cp` / `move_cp` are invented, and `move_cp` reads like the different column `hab_move_cp` (the function's own comment warns about exactly that). `_before` / `_after` match the `e_before` / `e_after` naming the cp-change SQL already uses.
- 19.19-19.22: the two unioned columns are inserted into `pos_fen` / `mpos_fen`, so they are named after the column they are written to.

**B. State names**

| # | File | Old | New | Uses |
|---|---|---|---|---|
| 19.23 | src/ui/board/MasterGamesDbPanel.tsx | `moveFilter` / `setMoveFilter` | `filter_move_played` / `setFilter_move_played` | 7 — a filter on `mgam_move_played`, currently in the suffix form the rule names as wrong |
| 19.24 | src/app/habits/page.tsx | `rows` / `setRows` | `habits` / `setHabits` | 6 — loaded `thab_habits` rows |
| 19.25 | src/app/position/[id]/page.tsx | `data` / `setData` | `positionDetail` / `setPositionDetail` | 7 — the result of `getPositionDetail_player` |
| 19.26 | src/ui/analysis/PipelineLogTable.tsx | `tabledata` / `setTabledata` | `pipelinelog` / `setPipelinelog` | 3 — loaded `tpip_pipelinelog` rows |
| 19.27 | src/ui/charts/OpeningScoreChart.tsx | `data` / `setData` | `openingScores` / `setOpeningScores` | 5 — the result of `getOpeningScores` |
| 19.28 | src/ui/charts/TerminationChart.tsx | `data` / `setData` | `terminationStats` / `setTerminationStats` | 6 — the result of `getTerminationStats` |

**C. URL query-param names** — a behaviour change: existing bookmarks, and any back-navigation entries already stored in sessionStorage, that use the old name stop working.

| # | Route | Old | New | Files |
|---|---|---|---|---|
| 19.29 | /analyze | `?game=` (holds `gd_gdid`) | `?gdid=` | read in src/app/analyze/page.tsx; written in src/ui/HomeDashboard.tsx, src/ui/analysis/PositionDetail.tsx, src/ui/board/ChessBoardView_shared.tsx |
| 19.30 | /analyzemaster | `?game=` (holds `mgd_mgdid`) | `?mgdid=` | read in src/app/analyzemaster/page.tsx; written in src/ui/games/MasterGameList.tsx and the `gameLinkBase` default in src/ui/board/MasterGamesDbPanel.tsx |

Comments that mention `?game=` (four in the two page files, one in MasterGamesDbPanel.tsx's header) would go stale; they are updated only if the row is approved.

Flagged (not changed):
- `gam_move_played AS move_played` / `gam_move_uci AS move_uci` in `getMovesForPosition_player`, `getMoveSummaryForPosition_player`, `getPositionDetail_player`, and the `mgam_…` equivalents in `getMoveSummaryForPosition_master` (8 aliases) — the alias is doing real work: it gives the player (`gam_*`) and master (`mgam_*`) queries one shared `MoveRow` shape that MovesListTable and both board views consume.
- `gd_player AS player`, `gam_pos_id AS pos_id`, `gam_move_played AS move_san`, `gd_opening_name AS opening_name`, `gd_eco_code AS eco_code` in `fetchHabitAggregates` (buildHabits.ts), mirrored in `refreshHabitsStatus` and one pipeline-page help string (11 aliases) — each is named after the `thab_habits` column it is written to (`hab_player`, `hab_pos_id`, `hab_move_san`, …), prefix stripped.
- The keys of the object `getHabitsData_player` returns (`pos_id`, `player`, `move_san`, `move_num`, `move_times`, `move_wins`, `move_losses`, `opening_name`, `eco_code`, `last_occurred`) — stripped `hab_` names coming out of a three-table query. A strict reading says they should be the raw column names (`hab_pos_id`, …). That touches the return type, `HabitRow`, about 22 reads in HabitsTable.tsx and the handlers in the habits page. Say so if you want these as rows.
- Other URL params: `eco` (`gd_eco_code`), `opening` (`gd_opening_name`), `color` (`gd_player_color`), `timeClass` (`gd_time_class`), `master` (holds `mgd_player`), `dateFrom` — each is read or written in many files (the global-filter mechanism, `GameFilters`, the header cards), and renaming changes every existing link.
- Filter values not in the `filter_<column>` form: `draftDateFrom` / `draftOpening` / `draftEco` and the `applied…` snapshot state in the charts, graph, habits page and GameList; the filter props of `HabitsTable` (`color`, `quality`, `minMove`, `minReached`, `sortBy`, `dateFrom`, `opening`, `eco`); the `GameFilters` / `MasterGameFilters` field names.
- Display row shapes: `GamesListRow` (`white`, `whiteRating`, …), `PositionGameHit`, `MasterPlayerRow` — deliberate shared shapes fed by both player and master tables.

### Phase 19 — applied
User reply: `approve` (all 30 rows). Applied one row at a time with `npx tsc --noEmit` after each (19.19+19.20 and 19.21+19.22 were applied together, as each pair is one SQL statement): every row passed, none reverted. Phase gate: `npx tsc --noEmit` + `npm run build`: both passed. Re-run of the audit half of Phases 4-7 afterwards: nothing new.
- src/lib/analysis/chessdb_player.ts — rows 19.1-19.13 (11 aliases removed with their mapper reads; `pos_cp` → `pose_cp_before`, `move_cp` → `pose_cp_after` in the SQL, the mapper, the return type and the function's header comment)
- src/ui/analysis/HabitsTable.tsx — rows 19.12-19.13 (`HabitRow` fields and their reads; the local consts `posCpClass` / `posCpLabel` / `moveCpClass` / `moveCpLabel` added in Phase 5 were renamed to `poseCpBeforeClass` / `poseCpBeforeLabel` / `poseCpAfterClass` / `poseCpAfterLabel` to match)
- src/lib/analysis/buildPositionTree_Player.ts — rows 19.14, 19.15, 19.19, 19.20
- src/lib/master/buildPositionTree_Master.ts — rows 19.16, 19.17, 19.21, 19.22
- src/lib/actions/games.ts — row 19.18
- src/ui/board/MasterGamesDbPanel.tsx — row 19.23 (8 occurrences) and row 19.30 (`gameLinkBase` default and its header-comment mention)
- src/app/habits/page.tsx — row 19.24
- src/app/position/[id]/page.tsx — row 19.25
- src/ui/analysis/PipelineLogTable.tsx — row 19.26
- src/ui/charts/OpeningScoreChart.tsx — row 19.27
- src/ui/charts/TerminationChart.tsx — row 19.28
- src/app/analyze/page.tsx, src/ui/HomeDashboard.tsx, src/ui/analysis/PositionDetail.tsx, src/ui/board/ChessBoardView_shared.tsx — row 19.29 (`?game=` → `?gdid=`; three comment mentions in analyze/page.tsx updated)
- src/app/analyzemaster/page.tsx, src/ui/games/MasterGameList.tsx — row 19.30 (`?game=` → `?mgdid=`; three comment mentions in analyzemaster/page.tsx updated)

Not verified: none of the changed SQL (habits read, the two tree builders, termination stats, the two position-tree sync inserts) has been run, and the pages were not opened in a browser. Because the query rows are read as `any`, the type-check cannot confirm these renames — only running them can.

Flagged (not changed) — still open: the items listed under "Flagged" in the proposal (the shared `move_played` / `move_uci` aliases, the habits-build aliases, the returned habit-row keys, the other URL params, the `draft…` / `applied…` state and filter props, the display row shapes).

### Duplicate games fix (D1–D4) — applied 2026-10-02

#### Manual SQL (run by the user on local, confirmed 2026-10-02)
- Backups `bk1_tgd_gamesdecon`, `bk1_tgam_game_positions`
- Deleted the `tgam_game_positions` and `tgd_gamesdecon` rows for duplicate ids 75369–75574
- Recounted `pos_reached` / `pos_move_num` for the positions those tree rows pointed at
- `CREATE UNIQUE INDEX idx_tgd_chesscom_uuid ON tgd_gamesdecon USING btree (gd_chesscom_uuid)`
- Prod: checked read-only 2026-10-02 (`POSTGRES_URL` from `.env.localprod`) — 75,245 rows, 75,245 distinct uuids, 0 duplicates, no uuid under two players; no repair needed. The unique index does not exist on prod yet — `CREATE UNIQUE INDEX idx_tgd_chesscom_uuid` handed to the user in chat 2026-10-02 for prod; user confirmed 2026-10-02 that it has been run on prod

#### src/lib/actions/deconstructGames_Player.ts
- D2: per-game lookup of `gd_chesscom_uuid` (`table_fetch`, `columns: ['gd_gdid']`, `limit: 1`, `skipCache: true`) placed after the `isDeconstructable_Player` skip and immediately before the game is parsed and written; a game already present is counted in `skipped`; a failed lookup is logged 'E', counted in `errors`, and the game is not written
- D2: `skipCache: true` added to the batch read ("raw games not yet deconstructed")
- D3: `AND d.gd_player = r.gr_player` removed from the batch read and from `getUndeconstructedCount`; `skipCache: true` also added to `getUndeconstructedCount` (a backlog count)
- Main header: `skipped` description extended, `2) NOTES` and `3) CHANGE HISTORY` added

#### src/lib/actions/pipelineStatus.ts
- D3: `AND d.gd_player = r.gr_player` removed from the pending count in `getPipelineStatus` and from the pending read in `refreshStep1`

#### src/app/owner/pipelinegames/page.tsx
- D3: `SQL_STATUS_1` preview text — player clause removed to match the real query

#### lib/deconstruct-games.ts
- D3: player clause removed from the "not yet deconstructed" read. Not otherwise touched — this standalone script still reads `tgr_gamesraw` (the table is now `wk_gr_gamesraw`) and does not write `gd_pgn`; it looks stale and was left as-is

#### src/ui/dataflow/sections.tsx
- D3: Deconstruct "Details" — the Select line now says matched on `gd_chesscom_uuid` alone; new "Check" line describing the per-game lookup

#### scripts/schema.sql
- D4: `CREATE UNIQUE INDEX idx_tgd_chesscom_uuid ON public.tgd_gamesdecon USING btree (gd_chesscom_uuid);`

Verification: `npx tsc --noEmit` and `npm run build` pass. The changed queries and the new lookup have not been run.

## Declined

## Testing
Phases 1-14 are applied. Nothing below has been run in a browser or against a database by Claude — only `npx tsc --noEmit` and `npm run build`, which both pass.

Type-check and build
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes

Pages restructured by Phase 5 (JSX calculations) and Phase 11 (useState order) — open each and confirm it looks and behaves as before
- [ ] /analyze (open a game from the Games list): player bars and scores, game info line, the Stockfish panel's Stop / Analyze Position button swap, engine lines, the Players Moves and Games panels (pagination, row click), the Lichess Moves and Games panels, "Analyze missing"
- [ ] /analyzemaster (open a master game): the same panels, plus Prev / Next and the All Masters Moves and Games panels (move filter, pagination)
- [ ] Games list (/) and Master Games list (/mastergames): every column filter, Refresh turning red when filters are pending, the opponent-rating colour, pagination, Analyze button
- [ ] /habits: filters, the Bad/Good badge, dismiss and restore, the dismissed-view toggle, pagination
- [ ] /position/<id> (open a row from Habits): the Your Moves and Game History tabs, percentages, clicking a move then a game
- [ ] /graph, /openings, /endings: charts render, Refresh works, "No data" messages show when filters match nothing
- [ ] /owner/constants (three tabs and the section pills), /owner/masterplayers (table, priority toggle, handle links), /owner/pipelinelog (rows, row detail panel), /owner/dataflow (tabs)
- [ ] Header: player cards and master cards highlight correctly; tab links keep the current filters

SQL rewritten by Phase 10 (cannot be type-checked — each needs running once)
- [ ] /analyze: move-count badges appear on the move list (getMovePlayCounts_player) and evals show in the Lichess Moves panel (getPositionEvaluationsBulk_shared)
- [ ] /analyzemaster: move-count badges (getMovePlayCounts_master) and the All Masters Moves panel (getMasterGamesForFen)
- [ ] /owner/pipelinegames: run Sync Position Tree (syncTposFromTgam_Player), run Evaluate Positions and refresh its status (enrichPositionsStockfish, countRemainingPositions)
- [ ] /owner/pipelinemastergames: run Sync Master Position Tree (syncTposFromTgam_Master)
- [ ] getMoveSummaryForPosition_master and findExistingEvals: not traced to a screen by Claude — confirm where they run and exercise them

Async and logging changes (Phases 2 and 8)
- [ ] /owner/pipelinegames: run any step and confirm the ETA rates still refresh afterwards (doRefreshRates)
- [ ] /owner/pipelinemasters: run Unzip FIDE File and Parse FIDE XML (the stream callbacks in fideStaging.ts were rewritten)
- [ ] Run one cron script from the command line (e.g. the sync one) and confirm it still prints its JSON result
- [ ] Force a failure in one pipeline route or cron script and confirm an 'E' row appears in /owner/logging

Spot-check the diff
- [ ] Phase 4: src/app/api/cron/sync/route.ts, src/lib/fide/fidePipeline.ts (return-const)
- [ ] Phase 6: src/lib/analysis/purgePositions.ts (comment format)
- [ ] Phase 7: src/lib/analysisTree.ts (interface → type)
- [ ] Phase 13: src/ui/games/GameList.tsx (functions now below the effects)
- [ ] Phase 14: skim the new header text in src/lib/stockfish.ts, src/lib/analysis/enrichPositionsStockfish.ts and the `Returns:` lines in src/lib/actions/pipelineStatus.ts — written by Claude from the code

Shared-component swaps (Phase 17)
- [ ] /owner/pipelinemastergames: the Year selector still shows its "Year" label, in the same bold style, and changing the year still works
- [ ] /analyzemaster (or /analyze), All Masters Games panel: when more than one move is available the "Move" filter shows its label and filters the games
- [ ] /owner/constants: every "Show" button opens its popover and looks as before (small outlined blue button); the "×" closes it — check the Value column, the Used by column and the Functions tab

Naming changes (Phase 19) — the SQL here cannot be type-checked, so each needs running once
- [ ] /habits: the table loads with every column filled — Player, Opening, ECO, Pos Eval, Move, Move #, Times, Win%, CP, Last occurred — in both Bad and Good views and in the dismissed view; dismiss and restore still work
- [ ] /habits, Pos Eval and CP columns specifically: values and red/green colouring look as before (these read the renamed pose_cp_before / pose_cp_after)
- [ ] /owner/pipelinegames: run Build Game Positions and confirm it processes games and reports positions (gd_gdid / gd_pgn are now read by their column names)
- [ ] /owner/pipelinegames: run Sync Position Tree and confirm it syncs positions (the INSERT now selects pos_fen)
- [ ] /owner/pipelinemastergames (or /owner/pipelinehistoricalgames): run Build Master Position Tree, then Sync Master Position Tree
- [ ] /endings: the chart shows each termination type by name on the x-axis
- [ ] /openings and /graph: charts still load and refresh
- [ ] /position/<id>: the page loads its board, moves and game history
- [ ] /owner/pipelinelog: rows load, filters and pagination work
- [ ] All Masters Games panel: the Move filter narrows the list and resets to page 1
- [ ] Open a game from the Games list, from a /position game-history row, and from the Players Games panel: each lands on /analyze?gdid=… and loads the game
- [ ] Open a master game from /mastergames and from the All Masters Games panel: each lands on /analyzemaster?mgdid=… and loads the game
- [ ] An old link using ?game= now shows "Game not found" (expected — the parameter was renamed)

Duplicate games fix (D1–D4) — local
- [ ] Games list: 75369 and the other duplicate rows are gone; each game appears once
- [ ] /owner/pipelinegames: run Build Game Positions, then Sync Position Tree, then rebuild habits (restores trees for original games whose duplicate had taken the tree)
- [ ] /owner/pipelinegames: run the game sync twice in a row without restarting the server — the second run reports 0 deconstructed and the Games list shows no new duplicates
- [ ] /owner/pipelinegames: Step 1 status shows 0 pending after a sync, and its SQL preview no longer mentions gd_player
- [ ] /owner/logging after a sync: no 'E' rows from deconstructGames_Player ("uuid lookup failed" or a unique-index rejection)
- [ ] /owner/dataflow: the Deconstruct section's Details list shows the uuid-only wording and the new "Check" line

