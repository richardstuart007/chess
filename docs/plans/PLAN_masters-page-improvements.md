# Masters page improvements & workfile-table redesign

## Plan

- [x] In [MasterGameView.tsx:308](../../src/ui/board/MasterGameView.tsx#L308), change the second
      column's width from `w-[360px]` to `w-[600px]`, matching the width of the player analysis
      page's analysis column ([ChessBoardView.tsx:1203](../../src/ui/board/ChessBoardView.tsx#L1203))
      that holds its "Master Moves (Lichess)" table. This column contains the Moves tree box,
      Master Moves (Lichess) table, and Master Games (Lichess) table, stacked — all three widen
      together (chosen over splitting into a separate Moves column + analysis column, which would
      more closely mirror the player page's structure but is a bigger layout change).

- [x] Add `getMasterSyncYearStatus(year)` server action (in `src/lib/actions/masterPlayers.ts`),
      returning the set of chess.com handles that already have 1+ rows in `tmgr_mastergamesraw`
      with `mgr_end_time` falling within the given calendar year (a `GROUP BY mgr_player` count via
      `table_query`, since this needs a year-range filter beyond plain `table_fetch`). "Already
      downloaded" = any games at all in that year, not a count comparison against chess.com's own
      archive.

- [x] Add `MasterPlayerMultiSelect` component (`src/ui/filters/MasterPlayerMultiSelect.tsx`),
      wrapping `nextjs-shared/MySelectMulti`, following the existing `ColorMultiSelect`/
      `TerminationMultiSelect` wrapper pattern. Fetches `getMasterPlayers('', true)` (grade
      descending) and `getMasterSyncYearStatus(selectedYear)`; options are chess.com handles
      labeled with a "✓" suffix for players already downloaded for the selected year. Re-fetches
      status whenever `selectedYear` changes. Default `selected` = every handle NOT yet downloaded
      for that year.

- [x] Rework `src/app/owner/pipelinemastergames/page.tsx`:
      - Replace `selectedHandle: string` / `MasterPlayerSelect` with `selectedHandles: string[]` /
        `MasterPlayerMultiSelect`.
      - `handleRunAll` loops over `selectedHandles` sequentially (not parallel — matches the
        existing chess.com anti-throttling precedent noted in `findNextMasterPlayerHandle`); for
        each handle, runs Sync → Deconstruct → Build Tree in order, same as today's single-player
        sequence, just repeated per player.
      - Each individual step's "Run" button (Sync/Deconstruct/Build Tree rows) also loops over
        `selectedHandles` the same way, rather than requiring "Run All".
      - Result displays (`syncResult`/`deconResult`/`treeResult`) become sums across all processed
        players for that run, instead of one player's numbers.

- [x] Remove the hardcoded `isAllocator = step === 1 && subStep === 'a'` special case from
      `resolvePipRunId` ([pipelineLog.ts:18](../../src/lib/actions/pipelineLog.ts#L18)) — allocate
      a new run id purely from the explicit `forceNew` argument, no step-number guessing. Add
      `forceNewRun: true` explicitly to `runGameSync`'s step-1a log call
      ([sync.ts:224](../../src/lib/actions/sync.ts#L224)), which currently omits it and has always
      relied on the implicit `isAllocator` guess. No other call site changes needed — every other
      download-step call (`syncMasterGames`, `downloadFideZip`) already explicitly passes
      `forceNewRun: true` at its real call sites, so they keep working once the special case is
      gone. Every non-download step (Deconstruct, Build Tree, Unzip, Parse, Purge sub-steps, Build
      Habits, etc.) is untouched — they already pass a genuinely-varying `forceNewRun` and never
      relied on `isAllocator`.

- [x] Fix the misleading "all steps running together" behavior on
      `pipelinemastergames/page.tsx` — first attempt reinvented a new `anyRunning`
      mutual-exclusion mechanism (duplicating the sync/decon/tree fetch calls inline inside
      `handleRunAll`), which doesn't exist anywhere else in the codebase. Corrected to mirror the
      already-established `pipelinegames/page.tsx` pattern instead: `handleRunAll` there just
      calls the exact same handler functions used by each step's own "Run" button
      (`handleGameSync()`, `handleBuildTree(false)`, etc.) sequentially with `await` — no separate
      concurrency-prevention concept needed, since each handler already toggles its own running
      flag correctly and calling them one at a time naturally shows only one step busy at a time.
      Applied the same idea here: `handleSync`/`handleDeconstruct`/`handleBuildTree` gained an
      optional `handles: string[] = selectedHandles` parameter, and `handleRunAll` now calls
      those exact same functions (passing `[handle]` for one player at a time) instead of
      duplicating their fetch logic — the only real difference from `pipelinegames`' Run All is
      the outer per-player loop, needed to keep each player's own run id (see the run-id design
      above). Buttons are disabled by their own individual running flag again, exactly like
      `pipelinegames` — no `anyRunning`.

- [x] Remove the descriptive intro paragraph ("A pre-computed position index for master players'
      own chess.com games...") from `pipelinemastergames/page.tsx` entirely.

- [x] Rebuild the "Year" control on `pipelinemastergames/page.tsx` locally (a plain `label` +
      `nextjs-shared/MySelect`, not `FilterSelect`) so it visually matches
      `MasterPlayerMultiSelect` exactly: bold label (`font-bold text-xs whitespace-nowrap`),
      `bg-white` background, same single row (`flex items-center gap-3`) as the Masters control.
      `FilterSelect` itself is left untouched — it's reused elsewhere for table-column-aligned
      filters that rely on its stacked label-above-value layout, so this page opts out of it
      rather than changing its shared default.

- [x] `MasterPlayerMultiSelect` — remove the auto-selection behavior entirely. It currently calls
      `onChange` on mount and on every year change to pre-check every not-yet-downloaded handle,
      which in practice pre-selects nearly all 146 players. Selection becomes fully owned by the
      parent page (starts at `[]`, the user checks whoever they want); year changes only refresh
      the "✓" labels on the existing option list, never force-change what's checked.

- [x] Remove "Proof of Concept"/"POC" wording everywhere it appears in live app code (not the
      archived plan docs in `docs/archive/`, which stay as historical record):
      - `src/lib/constants.ts:152` — comment header.
      - `src/app/owner/page.tsx:15` — nav card label ("Pipeline (Master Games POC)") and
        description (also drop the stale "scoped to Magnus Carlsen/2026" — no longer true now
        that the page supports multi-player/multi-year).
      - `src/app/owner/pipelinemastergames/page.tsx:261` — page heading.
      - `src/app/owner/constants/page.tsx:236` and `:328` — section heading and description
        (same stale "scoped to Magnus Carlsen/2026" text to reword).
      - Also found and fixed 4 more occurrences in code comments (`masterSync.ts`,
        `masterPositionTree.ts` ×2, `masterDeconstruct.ts`) and 1 more in live UI text
        (`MasterGameList.tsx`'s empty-state message) beyond the 5 originally listed above, to
        honor "everywhere" fully. Left `masterChessdb.ts` and `owner/mastergames/page.tsx`
        untouched — those belong to the Master Games FEN Lookup feature, which is a separate
        pending deletion request (see below), not yet actioned.

- [x] Split the "Tools" tab on `/owner` ([owner/page.tsx](../../src/app/owner/page.tsx)) into two
      tabs, "Players" and "Masters", in that order, replacing the single "Tools" tab. Generalize
      `ToolsPanel` to accept a `tools` list prop instead of a hardcoded array. "Players" contains
      only `Pipeline (Games)`; "Masters" contains everything else currently in `TOOLS` —
      `Pipeline (Masters)`, `Pipeline Log`, `Master Players`, `Pipeline (Master Games)` (renamed
      per the POC-wording removal above), `Master Games — FEN Lookup`.

- [x] Delete the Master Games — FEN Lookup feature entirely: `src/app/owner/mastergames/page.tsx`
      route, and `src/lib/master/masterChessdb.ts` — its only consumer, so the whole file became
      dead. Removed its entry from `TOOLS_MASTERS` in `owner/page.tsx`, and dropped the now-invalid
      `consumers: ['/owner/mastergames — FEN Lookup panel']` from Step 3's `MyHelpStep` in
      `pipelinemastergames/page.tsx` (no `consumers` prop at all now, since there's currently no
      live consumer of the position-tree data). Confirmed the unrelated public `/mastergames`
      route (`src/app/mastergames/page.tsx`, the browsable master-games list via
      `MasterGameList.tsx`) is untouched — same-looking name, entirely different feature.

- [x] Owner nav reorganization, `src/app/owner/page.tsx`:
      - Rename the `Pipeline (Masters)` (`/owner/pipelinemasters`) card to `Pipeline (FIDE)`, and
        move it to the last position in `TOOLS_MASTERS`.
      - Rename the `Master Players` (`/owner/masterplayers`) card to
        `FIDE/Chess.com Master Players Matching`.
      - Remove `Pipeline Log` from `TOOLS_MASTERS` entirely and promote it to its own top-level
        `OwnerPage` tab (it covers all three pipelines — games, FIDE, master games — not just one
        category), placed right after the "Masters" tab. Reuse `PipelineLogTable` directly (same
        pattern `ConstantsPage` already uses to double as both a route and inline tab content) —
        import it from `@/src/ui/analysis/PipelineLogTable` rather than embedding the
        `/owner/pipelinelog` route.
      - Resulting `TOOLS_MASTERS` order: `FIDE/Chess.com Master Players Matching`,
        `Pipeline (Master Games)`, `Pipeline (FIDE)`.

- [x] **New naming convention — `wk_` prefix for workfile tables.** Add a new subsection to
      `~/.claude/CLAUDE.md`'s "Database / table conventions" section: tables that are pure
      staging/pass-through workfiles — always re-derivable from an external source (chess.com,
      FIDE) or fully rebuildable from another table, never the sole copy of real data — use `wk_`
      as their fixed prefix (in place of the usual `t`), followed by the table's existing
      identifier and name unchanged (e.g. `tgr_gamesraw` → `wk_gr_gamesraw`). Column names are
      untouched — only the table-name prefix changes. **`wk_`-prefixed tables may be truncated
      directly in application code** (this is the one exception to "never embed data-destructive
      operations in code"); every `t`/`x`-prefixed table remains strictly manual-SQL-only, no
      exceptions. This clarifies the original rule's real intent (protecting permanent data, not
      staging tables) and retroactively documents `buildMasterPositionTree`'s existing
      `table_truncate` calls as no longer needing a case-by-case exception once (if) its own
      tables are decided on (see the still-open question below).

- [x] **Rename 5 tables to the `wk_` prefix** — give the user this SQL to run manually via
      pgAdmin4 (never executed by Claude, per standing convention):
      ```sql
      ALTER TABLE tgr_gamesraw RENAME TO wk_gr_gamesraw;
      ALTER TABLE tmgr_mastergamesraw RENAME TO wk_mgr_mastergamesraw;
      ALTER TABLE tfzp_fide_zip RENAME TO wk_fzp_fide_zip;
      ALTER TABLE tfxm_fide_xml RENAME TO wk_fxm_fide_xml;
      ALTER TABLE tpur_workfile RENAME TO wk_pur_workfile;
      ```
      Postgres automatically renames the table's own indexes'/constraints' dependency on the old
      name is preserved (index/constraint names themselves are left as-is, still referencing the
      old `t*` text within their own names — cosmetic only, not functionally required to change).
      Update `scripts/schema.sql` to match (table name, and the `CREATE INDEX`/constraint
      statements' table references) — the index/constraint *names themselves* can stay as-is,
      matching the now-renamed table's history.
      Update every application-code reference to the 5 old names — confirmed via grep across
      `src/`, ~21 files: `pipelinemastergames/page.tsx`, `masterDeconstruct.ts`, `masterSync.ts`,
      `owner/constants/page.tsx`, `sync.ts`, `masterPlayers.ts`, `pipelinemasters/page.tsx`,
      `masterGamesPipelineStatus.ts`, `fideStaging.ts`, `deconstruct.ts`, `pipelineStatus.ts`,
      `fidePipelineStatus.ts`, `api/analysis/diag/route.ts`, `purgePositions.ts`, `players.ts`,
      `games.ts`, `pipelinegames/page.tsx`, `dataflow/sections.tsx`, `dataflow/PipelineDiagram.tsx`,
      `analysis/PipelineHelp.tsx`, `api/analysis/deconstruct/route.ts` — covering SQL query
      strings, `table_fetch`/`table_write`/`table_delete`/`table_truncate`/`table_query`'s
      `table:`/`FROM`/`INTO` references, comments, dataflow diagram labels, and
      `owner/constants/page.tsx` consumer strings.

- [x] **Step 1 becomes a real truncate-then-download workfile, both pipelines** — once each
      table is renamed, replace the incremental/per-player clearing logic with a single full
      `table_truncate` at the very start of the whole sync operation (not per player, and not
      inside the per-player-scoped sync function — see the sequencing note above):
      - `sync.ts`'s `runGameSync` — replace `initSync`'s per-player `table_delete` on
        `tgr_gamesraw`/`wk_gr_gamesraw` with one `table_truncate` call at the top of
        `runGameSync`, before its player loop begins.
      - `masterSync.ts`/`pipelinemastergames/page.tsx` — add a `table_truncate` on
        `wk_mgr_mastergamesraw`, called **once** before the per-player sync loop starts (in
        `handleSync`/`handleRunAll` on the page, or a new small orchestrating function — not
        inside `syncMasterGames` itself, since that's still called once per selected player).
      - `fideStaging.ts`'s `downloadFideZip`/`unzipFideZip` — already truncate
        `tfzp_fide_zip`/`tfxm_fide_xml` today (just renamed now); confirm no change in behavior
        needed there, only the table name.
      - An interrupted run (raw rows downloaded but never deconstructed) is no longer an error
        needing manual cleanup — the next full run's truncate wipes it automatically. Update the
        Data flow docs / this project's own lessons-learned notes if they still describe the old
        per-player-delete/manual-cleanup model.

- [x] **Step 2 (Deconstruct) becomes fully global for master games** — `deconstructMasterGames`
      in `masterDeconstruct.ts`: drop the `chesscomHandle` parameter and the `mgr_player`/
      `mgd_player` filters entirely; process every row in `wk_mgr_mastergamesraw` not yet in
      `tmgd_mastergamesdecon` (matched on `mgd_chesscom_uuid` alone — globally unique, no player
      qualifier needed), regardless of which player it came from. Called once per run, not once
      per selected player.

- [x] **Step 3 (Build Position Tree) — rewritten as incremental/non-destructive, mirroring
      `buildPositionTree`/`syncTposFromTgam`, not truncate-and-rebuild.** Resolved: `tmps_
      masterpositions`/`tmgp_mastergamepositions` are genuinely permanent, app-facing tables
      (used by real features, not just pipeline staging) — they stay `t`-prefixed, and `table_
      truncate` must come out of `buildMasterPositionTree` entirely; bulk `DELETE` is equally
      off-limits, so "rebuild" here means "process only what's new," not "wipe and redo."
      Mirror the regular pipeline's existing, already-correct pattern exactly:
      - Drop the `chesscomHandle` parameter and the `mgd_player` filter (global, like Step 2).
      - Fetch only `tmgd_mastergamesdecon` rows **not yet** represented in
        `tmgp_mastergamepositions` (a `NOT EXISTS` check on `mgp_mgdid`, mirroring
        `buildPositionTree`'s `tgam_game_positions` check) — not "every row," which would
        reprocess already-built games every single run.
      - Phase A: `INSERT` those games' positions into `tmgp_mastergamepositions` only — no
        truncate.
      - Phase B: a new `syncTmpsFromTmgp`-equivalent function, mirroring `syncTposFromTgam`
        exactly — `INSERT ... ON CONFLICT (mps_fen) DO NOTHING` for any FEN not yet in
        `tmps_masterpositions`, backfill `mgp_pos_id`/`mgp_resulting_pos_id` via
        `UPDATE ... WHERE ... IS NULL`, then recompute `mps_reached` only for the specific
        positions actually touched by this run (not a full table recompute).
      - Called once per run, not once per selected player (same as Step 2).

- [x] **`'D'` severity → `'I'`, all 11 confirmed call sites** (verified each target function's
      signature first to confirm `'D'` genuinely lands on a `severity` param, not an unrelated
      positional argument): `buildPositionTree_Player.ts:130,384`,
      `buildPositionTree_Master.ts:113,332`, `fideStaging.ts:46,90,186`, `purgePositions.ts:31`,
      `sync.ts:166`, `players.ts:114,154`. Excludes the 2 unrelated `'D'` (draw-result label)
      occurrences in `PositionDetail.tsx`/`ChessBoardView.tsx`.

- [x] Widen `WIDTH_PIPELINE_TYPE` (`src/lib/constants.ts`) from `w-24` to `w-32`, so the Pipeline
      Log's Type filter dropdown (`PipelineTypeSelect`) is less cramped. Widened further to `w-40`
      after testing showed `w-32` was still too narrow. **Root cause of the width appearing not to
      change at all**: `PipelineLogTable.tsx`'s call site passes `width='w-full'` to
      `PipelineTypeSelect`, overriding the `WIDTH_PIPELINE_TYPE` default entirely — and with the
      table's `table-fixed` layout, the real constraint was the header `<th className='...w-24'>`
      for the Type column. Widened that header cell to `w-40` to match; `width='w-full'` on the
      filter-row component is correct as-is (fills whatever the column width is).

- [x] **Fix `getMasterSyncYearStatus`'s stale "already downloaded" source** — it queried
      `wk_mgr_gamesraw` (the transient raw workfile, fully truncated before every sync run per the
      earlier Step 1 redesign), so the Masters multi-select's "✓" flags only ever reflected
      whoever was in the *most recent* run, not true sync history. Found via a direct DB check: the
      workfile held only `vincentkeymer` while the permanent `tmgd_gamesdecon` table actually had 5
      players including `magnuscarlsen`. Fix: query `tmgd_gamesdecon` (`mgd_player`/`mgd_end_time`)
      instead of `wk_mgr_gamesraw` (`mgr_player`/`mgr_end_time`) — same query shape, correct
      (permanent) source table.

- [x] **Stop auto-loading Status on page mount, `pipelinemastergames/page.tsx`** — mirroring
      `pipelinegames/page.tsx`'s existing pattern exactly (its mount `useEffect` never calls its
      status refreshers, only players/rates/run-history), since the user reported Step 3's Status
      showing large permanent totals next to an un-clicked "Run" button reads as a stale/misleading
      result. Changed the mount `useEffect` to call `doRefreshRuns()` only, not
      `doRefreshAllStatus()` — `sSync`/`sDecon`/`sTree` now stay `null` until the "Refresh" button,
      a step's own "↻", or that step's own Run completes (each already refreshes its own status
      afterward).

- [x] **Sort already-processed (✓) players to the end of `MasterPlayerMultiSelect`'s option
      list.** `MySelectMulti` already puts checked/selected items at top with a divider, then
      renders the rest in whatever order its `options` array is given — previously grade
      descending, so an already-downloaded high-grade player could land right after the divider.
      Sorted `handleOptions` so non-downloaded players come first (grade order preserved),
      downloaded ones last (grade order preserved within that group too).

- [x] **`handleRunAll` restructured to process each selected player fully before the next
      starts** — found via testing: it synced every selected player first, then ran one shared
      Deconstruct and one shared Build Tree at the end, diverging from its own comment header
      ("every stage in order, per selected player") and from the originally agreed per-player
      pipeline design. Moved the Deconstruct/Build Tree calls inside the per-player loop — Step
      2/3 stay global (no player filter, per the earlier explicit design decision), but calling
      them right after each player's own sync means each call only picks up that player's
      newly-synced rows, since earlier players' rows are already processed. Each player now gets
      one complete run id covering Sync→Deconstruct→Build Tree, instead of only the last player's
      run having matching Deconstruct/Build Tree rows.

- [x] **Player name added to Sync/Deconstruct/Build Tree results and pipeline log.** Added an
      optional display-only `playerLabel`/`player` parameter, threaded from
      `pipelinemastergames/page.tsx` → the two API routes → `deconstructGames_Master`/
      `buildPositionTree_Master`, used only to tag the logged `stepName` (e.g. `'Deconstruct
      Master Games (lovevae)'`) — no filtering effect, both functions stay global. The page's own
      Result cells (Sync/Deconstruct/Build Tree) now prefix with the player handle when the
      result is scoped to one player (always true from Run All; still blank for the standalone
      "Run" buttons processing multiple/no specific player). Deliberately scoped to the
      master-games pipeline only, not mirrored onto the player-side pipeline — the player pipeline
      already has an actual per-call player filter baked into its query, so the same ambiguity
      doesn't exist there.

- [x] **Master-games pipeline restructured to 3 steps, mirroring the player pipeline's
      already-correct Sync/Build-Tree/Sync-Tree design exactly.** Root cause: the Jobs table
      silently consolidated multiple sub-step log rows into one displayed row (matched by
      `pip_step` only, dropping every row beyond the first found); investigating that surfaced a
      genuine `subStep` key collision (Build Master Position Tree and Sync tmpos_positions both
      logged as `3a`); investigating *that* led to reviewing whether Build Tree and Sync Position
      Tree should be independent steps at all (per the "workfile dependency" test: `syncTposFromTgam_Master`
      queries `tmgam_game_positions WHERE mgam_pos_id IS NULL` — a real backlog, not scoped to
      "whatever the last Build Tree call just wrote" — so yes, independent, matching player's
      `buildPositionTree_Player`/`syncTposFromTgam_Player` split exactly, which was already the
      established pattern); which led to reviewing whether Sync and Deconstruct should also be
      independent, since master had them as two separate top-level steps while player bundles
      Sync+Deconstruct into one (`runGameSync` calls `deconstructGames_Player` internally) — by
      the same workfile test, `wk_mgr_gamesraw` is truncated at the start of every run and has no
      independent value between a download and its deconstruction, so **not** independent; master
      diverged from player's already-correct bundling for no real reason. Final design:
      - **Step 1 — Sync Master Games** (bundled: download + deconstruct, mirrors `runGameSync`).
        `syncMasterGames` (`masterSync.ts`) now calls `deconstructGames_Master` internally right
        after each player's download, and logs `1a` Query chess.com API / `1b` Fetch & Insert Raw
        Games / `1c` Deconstruct Master Games itself (mirrors `runGameSync`'s 4-substep pattern,
        minus a `1d` since master has no per-player rating update). `deconstructGames_Master`
        dropped its `forceNewRun`/`playerLabel` params and its own `logPipelineStep` call entirely
        — mirrors `deconstructGames_Player`, which never logs its own pipeline step, only the
        orchestrating caller does. No more standalone Deconstruct button/route.
      - **Step 2 — Build Master Position Tree** (Phase A only). `buildPositionTree_Master`'s route
        now always passes `skipSync: true` (mirrors `handleBuildTree` on the player page); its
        outer log call renumbered `3a` → `2a`.
      - **Step 3 — Sync Master Position Tree** (Phase B, new independent step). New route
        `api/mastergames/sync-tpos/route.ts` (mirrors `api/analysis/sync-tpos/route.ts`) calls the
        already-exported `syncTposFromTgam_Master` directly; its two log calls renumbered `4a`/`4b`
        (from an interim, since-superseded numbering) to `3a`/`3b`.
      - **Player-name prefixing, consistent format**: every master-games step name that has a
        known player (all of Step 1's `1a`/`1b`/`1c`, plus Step 2/3 when triggered via Run All)
        is now prefixed `player: description` (e.g. `viditchess: Sync Master Games`) — not
        `description (player)`, which an earlier round had used inconsistently and incompletely.
        Standalone "Run" buttons (no specific player, process everything outstanding) still log
        with no prefix.
      - **`handleRunAll`** now does Sync → Build Tree → Sync Position Tree per selected player (3
        calls instead of 4), each player still getting their own run id.
      - **Jobs table** rewritten as a `JOB_GROUPS`-style structure (mirroring
        `pipelinegames/page.tsx` exactly) matching on `(pip_step, pip_sub_step)` — every sub-step
        now shows as its own row, nothing silently dropped.
      - **Status queries** (`masterGamesPipelineStatus.ts`) redesigned to mirror
        `pipelineStatus.ts`'s per-step shapes: `refreshMasterSyncStatus` → `{pending, allDecon}`
        (mirrors `refreshStep1`), `refreshMasterTreeStatus` → `{allProcessed, allRemaining}`
        (mirrors `refreshStep3`), new `refreshMasterTposStatus` → `{positions, unresolved}`
        (mirrors `refreshTposStatus`). `refreshMasterDeconStatus` removed (folded into Step 1's
        merged status).

- [x] **Per-sub-step timing fix, both pipelines.** Found via testing: `1a`/`1b`/`1c` (master) and
      `1a`/`1b`/`1c`/`1d` (player) all logged the exact same `durationMs` — one total computed
      after the whole combined operation, reused across every sub-step's own log call, so each
      sub-step's displayed duration was actually the full Step 1 duration, not its own. Fixed both
      `syncMasterGames` (`masterSync.ts`) and `runGameSync` (`sync.ts`) to track separate
      `queryMs`/`fetchMs`/`deconstructMs`(/`ratingsMs` on player) checkpoints around each actual
      phase, and log each sub-step with its own real duration.

- [x] **Step 1 casing + `1c` Input Recs fix.** `syncMasterGames` logged its `1a`/`1b`/`1c` step
      names using the lowercased `player` variable, while Step 2/3 (page-level) use the original,
      un-lowercased handle — fixed to use `chesscomHandle` (unmodified) for consistency. Also,
      `1c`'s `inputRecs` showed this player's own `inserted` count (e.g. 278), which understated
      the real workload — `deconstructGames_Master` has no player filter and scans the *entire*
      current `wk_mgr_gamesraw` table (every player synced so far in a Run All pass), which is why
      its duration could look disproportionate next to a small displayed Input Recs. Added
      `rawScanned` to `deconstructGames_Master`'s return value (the true `wk_mgr_gamesraw` row
      count it fetched) and used that for `1c`'s `inputRecs` instead of `inserted`.

- [x] **FIDE tab split** — `owner/page.tsx`: new `TOOLS_FIDE` array (`FIDE/Chess.com Master
      Players Matching`, `Pipeline (FIDE)`), `TOOLS_MASTERS` reduced to just
      `Pipeline (Master Games)`; new "FIDE" tab inserted right after "Masters".

- [x] Pipeline Log's "Step Name" column widened again, `w-60` → `w-96`.

- [x] **Search box in `MasterPlayerMultiSelect`** — narrows the *unselected* candidates by
      name/handle as you type; already-selected players always stay visible regardless of the
      search text (so unchecking one never requires clearing the search first). Uses
      `nextjs-shared/MyInput`, not a raw `<input>`.

- [x] Rework `pipelinemastergames/page.tsx` to match the new step shapes:
      - `handleSync` stays a per-player loop (each selected player is still a real, separate
        chess.com API call) — but the new one-time `wk_mgr_mastergamesraw` truncate happens once,
        before this loop starts.
      - `handleDeconstruct`/`handleBuildTree` become single calls with no `handles` parameter and
        no per-player loop — each just runs once, globally.
      - `handleRunAll`: truncate once → loop `handleSync` per selected player (each still gets
        its own run id, as today) → one `handleDeconstruct()` call → one `handleBuildTree()` call
        (both join whichever run id was most recently allocated — i.e. the last player's sync
        run — since they're no longer player-specific).
      - Individual "Run" buttons for Deconstruct/Build Tree no longer depend on `selectedHandles`
        at all (they process everything regardless of what's checked) — only Sync's button still
        needs a non-empty selection.

## Changes

### src/ui/board/MasterGameView.tsx
- Widened the Moves/Master Moves/Master Games column from `w-[360px]` to `w-[600px]` so the
  Master Moves (Lichess) table matches the width of the corresponding table on the player
  analysis page.

### src/lib/actions/masterPlayers.ts
- Added `getMasterSyncYearStatus(year)` — returns the set of chess.com handles with 1+ rows in
  `tmgr_mastergamesraw` whose `mgr_end_time` falls within the given calendar year, via a
  `table_query` (`mgr_end_time >= $1 AND < $2`, UTC year boundaries).

### src/ui/filters/MasterPlayerMultiSelect.tsx (new)
- New wrapper around `nextjs-shared/MySelectMulti`, following the `ColorMultiSelect`/
  `TerminationMultiSelect` pattern. Loads master players (grade descending) and the selected
  year's sync status, labels each option with a "✓" suffix if already downloaded for that year,
  and resets the selection to every not-yet-downloaded handle whenever the year changes.

### src/app/owner/pipelinemastergames/page.tsx
- Replaced the single-player `selectedHandle`/`MasterPlayerSelect` with
  `selectedHandles: string[]`/`MasterPlayerMultiSelect`.
- `handleSync`/`handleDeconstruct`/`handleBuildTree` now loop sequentially over
  `selectedHandles`, calling the same per-player API routes as before and summing results into
  one aggregate total. Each player's call independently honors `forceNewRun` (own pipeline run id
  per player, same as clicking the step once per player individually) — not shared across
  players, since `logPipelineStep` inserts one row per call and the Jobs summary table only
  displays the first row per step/run, so sharing a run id across players would have hidden every
  player's numbers but the first.
- `handleRunAll` now loops over every selected player, running Sync → Deconstruct → Build Tree
  in order for each — each player gets their own run id (Sync always passes `newRun=true`;
  Deconstruct/Build Tree join that same run), i.e. today's single-player Run All behavior
  repeated once per selected player (mirrors `runGameSync`'s per-player loop in the regular games
  pipeline, which also treats each player as an independent unit of work).
- Updated the "Run" button disabled checks and help text for the new multi-player scope.

### src/lib/actions/pipelineLog.ts
- `resolvePipRunId` no longer takes `step`/`subStep` or special-cases step 1/sub-step 'a' — it
  allocates a new run id purely from the explicit `forceNew` argument now. `logPipelineStep`'s
  call site updated to match the new (pipelineType, forceNewRun) signature.

### src/lib/actions/sync.ts
- `runGameSync`'s step-1a log call now passes `forceNewRun: true` explicitly, matching every
  other download-step call site — previously relied on the removed `isAllocator` special case.

### src/app/owner/pipelinemastergames/page.tsx (follow-up round)
- `handleSync`/`handleDeconstruct`/`handleBuildTree` gained an optional
  `handles: string[] = selectedHandles` parameter, defaulting to today's "process everyone
  selected" behavior for their own "Run" button.
- `handleRunAll` rewritten to mirror `pipelinegames/page.tsx`'s pattern: it calls those exact
  same three functions sequentially with `await` (passing `[handle]` per player, in an outer
  per-player loop), instead of duplicating their fetch logic inline. This was a correction of a
  first attempt that had invented a new `anyRunning` mutual-exclusion mechanism not used anywhere
  else in the codebase — removed. Each button is disabled by its own running flag again, exactly
  like `pipelinegames`; only one step ever shows busy at a time because `handleRunAll` awaits each
  call before starting the next, same as the existing pattern.
- Removed the descriptive intro paragraph and the "(Proof of Concept)" heading suffix.
- Replaced the `FilterSelect`-based Year control with a local `label` + `nextjs-shared/MySelect`
  (bold label, `bg-white`, same row as the Masters multi-select) — `FilterSelect` itself is
  unchanged, still used elsewhere with its stacked layout.
- Removed the now-unused `FilterSelect` import.

### src/ui/filters/MasterPlayerMultiSelect.tsx (follow-up round)
- Removed the `onChange(...)` auto-selection call — the component no longer force-changes
  `selected` on mount or on year change; it only recomputes each option's "✓" label.

### src/lib/constants.ts, src/app/owner/page.tsx, src/app/owner/constants/page.tsx,
### src/lib/master/masterSync.ts, src/lib/master/masterPositionTree.ts,
### src/lib/master/masterDeconstruct.ts, src/ui/games/MasterGameList.tsx
- Removed "Proof of Concept"/"POC" wording throughout (comments and user-facing text), and
  reworded the stale "scoped to Magnus Carlsen/2026" descriptions to reflect the current
  multi-player/multi-year functionality. `masterPositionTree.ts`'s comment referencing
  `/owner/mastergames POC page` was also corrected to the actual route,
  `/owner/pipelinemastergames`.

### src/app/owner/page.tsx (Tools tab split)
- Split `TOOLS` into `TOOLS_PLAYERS` (`Pipeline (Games)` only) and `TOOLS_MASTERS` (everything
  else: `Pipeline (Masters)`, `Pipeline Log`, `Master Players`, `Pipeline (Master Games)`,
  `Master Games — FEN Lookup`). `ToolsPanel` now takes a `tools` prop instead of a hardcoded
  list. The single "Tools" tab is replaced by two tabs, "Players" and "Masters", in that order.

### Master Games — FEN Lookup deletion
- Deleted `src/app/owner/mastergames/page.tsx` and `src/lib/master/masterChessdb.ts` (its only
  consumer). Removed the `TOOLS_MASTERS` entry pointing at it in `owner/page.tsx`, and dropped
  the now-dangling `consumers` prop from Step 3's `MyHelpStep` in `pipelinemastergames/page.tsx`.
  Cleared the stale `.next` build cache, which still referenced the deleted route's generated
  types after the file removal.

### Owner nav reorg
- `owner/page.tsx`: renamed `Pipeline (Masters)` → `Pipeline (FIDE)` (moved to last in
  `TOOLS_MASTERS`), `Master Players` → `FIDE/Chess.com Master Players Matching`. Promoted
  `Pipeline Log` out of `TOOLS_MASTERS` into its own top-level `OwnerPage` tab (reuses
  `PipelineLogTable` directly, same pattern `ConstantsPage` uses).

### `wk_` workfile-table rename (5 tables) + database relocation
- Renamed `tgr_gamesraw`→`wk_gr_gamesraw`, `tpur_workfile`→`wk_pur_workfile` (primary db);
  `tmgr_mastergamesraw`→`wk_mgr_mastergamesraw` (later `wk_mgr_gamesraw`, see below),
  `tfzp_fide_zip`/`tfxm_fide_xml`→`wk_fzp_fide_zip`/`wk_fxm_fide_xml` (moved from primary to
  secondary database — they belong with the rest of the master/FIDE tables). Updated
  `scripts/schema.sql` and every application-code reference (~21 files). Documented the `wk_`
  convention in `~/.claude/CLAUDE.md`. Fixed `xrtg_routing` rows in the primary database to match
  (including one initially missed for `wk_mgr_gamesraw`, caught by a follow-up verification pass).
  All SQL run and verified against both databases directly (table names, columns, routing rows).

### Identifier-consistency rename (`mgam`/`mpos`, drop "master" from table names)
- `tmgp_mastergamepositions`(`mgp_*`)→`tmgam_game_positions`(`mgam_*`),
  `tmps_masterpositions`(`mps_*`)→`tmpos_positions`(`mpos_*`),
  `tmgr_mastergamesraw`→`wk_mgr_gamesraw`, `tmgd_mastergamesdecon`→`tmgd_gamesdecon` — matching
  the player-side tables' own identifiers with a plain `m` prefix, instead of full "master"
  wording. Updated `scripts/schema.sql`, all application code, and ran/verified the matching
  rename SQL in the secondary database plus `xrtg_routing` updates in primary.

### `_Player`/`_Master` function and file naming
- Renamed `buildPositionTree`→`buildPositionTree_Player`, `deconstructGames`→
  `deconstructGames_Player`, `syncTposFromTgam`→`syncTposFromTgam_Player`, and their master-side
  equivalents (`buildMasterPositionTree`→`buildPositionTree_Master`, etc.), plus 3 previously
  master-only-named private helpers, to a consistent `_Player`/`_Master` suffix instead of
  `master` embedded mid-name. Renamed the 4 files that own these functions to match:
  `buildPositionTree.ts`→`buildPositionTree_Player.ts`, `masterPositionTree.ts`→
  `buildPositionTree_Master.ts`, `deconstruct.ts`→`deconstructGames_Player.ts`,
  `masterDeconstruct.ts`→`deconstructGames_Master.ts`. Extracted the duplicated `chunkByGame`
  helper (identical logic, different field names) into one shared, generic
  `src/lib/chunkByGame.ts`, parameterized by a `getGameId` accessor so each side keeps its own DD
  field name (`gdid` vs `mgdid`).

### `buildPositionTree_Master`/`syncTposFromTgam_Master` — full parity rewrite
- First attempt at the incremental Step 3 rewrite silently dropped several things
  `buildPositionTree_Player` has: `limit`/batching, `treeBuilt`/`remaining` progress stats,
  `skipSync` debug option, and per-game error isolation (`try`/`catch` around each game). Rewrote
  `buildPositionTree_Master` as a true line-by-line mirror — every parameter, stat, and the exact
  same return shape (`{gamesProcessed, positions, errors, treeBuilt, remaining}`), master's own
  table/column names substituted, no `player` filter (Step 3 is deliberately global).

### `POSITION_TREE_LIMIT_Player`/`POSITION_TREE_LIMIT_Master` constants
- Empirically timed (via `tpip_pipelinelog`) at ~25-32ms/game — confirmed fast enough that the
  inline `100` default (copied from the pre-existing player-side code) was overly conservative.
  Added dedicated constants (`3000`/`10000`) replacing the inline `100` in both functions and
  their routes/cron script — deliberately *not* reusing the shared `DEFAULT_BATCH_SIZE`, since
  that constant is also used by the genuinely-slow Stockfish-evaluation steps and bumping it
  would have silently affected those too. Constants page updated to match.

### Constants audit — `_Player` suffix for player-pipeline-specific constants
- Reviewed all ~70 constants in `constants.ts`, categorized as: existing Player/Master pairs
  (renamed both sides to the `_Player`/`_Master` suffix, dropping the legacy `MASTER_` prefix —
  `INCLUDED_TIME_CLASSES`, `MIN_ANALYSIS_MOVE`, `MAX_ANALYSIS_MOVE`, `POSITION_INSERT_CHUNK_SIZE`,
  `GAME_LIST_ROWS_DEFAULT`, `GAME_LIST_ROWS_OPTIONS`, plus `GAMES_SYNC_YEARS_Master` with no
  player pair); player-only-but-pipeline-specific (renamed to `_Player`: `DEFAULT_DATE_FROM`,
  `DEFAULT_MIN_GAMES`, `DEFAULT_FILTER_TERMINATIONS`, `TERMINATION_CHART_TYPES`,
  `MOVE_COUNT_MIN_MOVE`, `PURGE_REACH_GRACE_DAYS`, `MIN_REACH_TO_KEEP`, `HABITS_MIN_REACH_FLOOR`,
  `HABITS_MOVE_CP_CLAMP`, `HABITS_ITEMS_PER_PAGE`, `HABITS_ROWS_OPTIONS`,
  `RESULT_MISMATCH_CP_THRESHOLD`, `POPULAR_POSITION_DEPTH_TIERS`, `DEFAULT_BATCH_SIZE`,
  `CRON_DEEPEN_POPULAR_BATCH_SIZE`, `GAMES_ITEMS_PER_PAGE`, `POSITION_GAMES_ROWS_DEFAULT`,
  `POSITION_GAMES_ROWS_OPTIONS`, `GAME_ENDINGS_CONCURRENCY`, `PIPELINE_CRON_SCHEDULE`,
  `PLAYER_TIME_CLASSES`→`TIME_CLASSES_Player`); and genuinely generic/shared (left unchanged:
  filter-UI `WIDTH_*`/`OPTIONS_*`, `MASTERS_EXPLORER_MOVES_LIMIT`, `PIPELINE_TYPE_*`, UI/infra
  constants). `DEFAULT_PLAYER` deliberately excluded from the `_Player` suffix (would read as
  `DEFAULT_PLAYER_Player`, redundant).

### `handleDeconstruct`/`handleBuildTree` global-scope fix (`pipelinemastergames/page.tsx`)
- Caught during a final review pass: these two functions still looped over `selectedHandles` and
  called the API once per selected player, even though Step 2/3 are now global and ignore any
  `player` param entirely — meaning 2+ players selected would silently re-run the same full
  global operation multiple times. Fixed to be single, parameterless calls; their "Run" buttons no
  longer require a non-empty selection. Also corrected Step 3's help text, which still described
  the old truncate-and-rebuild, per-player behavior.

### Pipeline Log — Step Name column widened
- `PipelineLogTable.tsx`: Step Name column `w-40` → `w-60`, to comfortably fit the new
  player-tagged step names (e.g. "Deconstruct Master Games (lovevae)").

### Pipeline Log — pipeline_type column + filter
- `PipelineLogTable.tsx`: added `pip_pipeline_type` to the row type, a "Type" column, and its
  value to the detail popup. New `PipelineTypeSelect` component (`src/ui/filters/`, backed by new
  `OPTIONS_PIPELINE_TYPE`/`WIDTH_PIPELINE_TYPE` constants) positioned directly above the column,
  matching the table's existing filter-row pattern — wired into the same `fetchdata()` filters
  array as the existing Run/Step/Step Name filters.

### Pipeline Log — follow-up fixes (found during testing)
- `OPTIONS_PIPELINE_TYPE` labels changed from invented display names ("FIDE", "Master Games") to
  the exact `pip_pipeline_type` string values (`games`/`masters`/`mastergames`), matching what the
  Type column itself displays verbatim.
- "Created" column widened (`w-32`→`w-44`) and reformatted to 24-hour time
  (`toLocaleString(undefined, { hour12: false })`, via a new shared `formatCreated` helper used by
  both the table row and the detail popup) instead of the locale-default AM/PM.
- **Real bug**: `pipelinemastergames/page.tsx`'s `handleRunAll` called `handleDeconstruct()`/
  `handleBuildTree()` with no arguments, defaulting `forceNewRun` to `true` — so every "Run All"
  click minted a *separate* new run id for Deconstruct and another for Build Tree, instead of
  joining the run id the last player's Sync had just allocated (the intended design, per the
  run-id section above). Fixed to `handleDeconstruct(false)`/`handleBuildTree(false)`.

### `getPositionsFromGame_Player`/`getPositionsFromGame_Master` — SetUp/FEN replay bug
- Found during testing: `buildPositionTree_Master` threw "Invalid move: Qe4" on a real game
  (mgd_mgdid 2040) — its PGN has `[SetUp "1"]`/`[FEN "..."]` headers (a chess.com Live Chess
  reconnect game starting mid-game from a non-standard position, not move 1). `replay = new
  Chess()` always seeded from the standard starting position regardless, so any such game's first
  replayed move fails unconditionally — not a chess.js quirk, a real bug affecting every
  SetUp/FEN game. The per-game `try`/`catch` (part of the just-completed `_Master` parity rewrite)
  correctly caught it and kept the pipeline running, which is what surfaced it instead of it
  failing silently. **This bug already existed on the player side too** (`getPositionsFromGame_Player`
  has the identical `new Chess()` with no FEN) — fixed both, by reading `chess.getHeaders()` after
  `loadPgn` and seeding `replay` from the `FEN` header whenever `SetUp === '1'`.

### `'D'` severity → `'I'` (11 call sites)
- Verified each target function's signature (`table_query`, `table_truncate`, `getPlayer`,
  `getPlayers`, `upsertPlayerRating`) to confirm the literal `'D'` genuinely lands on a `severity`
  parameter before changing it — 2 other `'D'` occurrences in the codebase
  (`PositionDetail.tsx`/`ChessBoardView.tsx`, a draw-result display label) are unrelated and left
  untouched. Changed: `buildPositionTree_Player.ts:130,384`, `buildPositionTree_Master.ts:113,332`,
  `fideStaging.ts:46,90,186`, `purgePositions.ts:31`, `sync.ts:166`, `players.ts:114,154`.

### `WIDTH_PIPELINE_TYPE` widened
- `src/lib/constants.ts`: `w-24` → `w-32`, so the Pipeline Log's Type filter dropdown
  (`PipelineTypeSelect`) is less cramped. Widened again to `w-40` after the user found `w-32`
  still too narrow when testing.

### Pipeline Log Type column width — real fix
- `WIDTH_PIPELINE_TYPE` alone had no visible effect: `PipelineLogTable.tsx`'s
  `<PipelineTypeSelect ... width='w-full' />` call site overrides the constant's default, and the
  table's `table-fixed` layout means the header `<th>`'s own width class is what actually sets the
  column width. Widened the Type column header `<th>` from `w-24` to `w-40` to match. Both then
  brought back down to `w-32` (constant and header `<th>` together) after further testing.

### `getMasterSyncYearStatus` — stale "already downloaded" source fix
- Was querying `wk_mgr_gamesraw` (the transient raw workfile, truncated at the start of every sync
  run since the earlier Step 1 redesign) — so the Masters multi-select's "✓" flags only ever
  reflected the most recently run player(s), currently just `vincentkeymer`, even though
  `tmgd_gamesdecon` (permanent) actually had 5 players synced including `magnuscarlsen`. Found via
  a direct DB check after the user restarted the dev server and still saw only Vincent flagged.
  Fixed to query `tmgd_gamesdecon` (`mgd_player`/`mgd_end_time`) instead of `wk_mgr_gamesraw`
  (`mgr_player`/`mgr_end_time`) — same query shape, correct permanent source. Renamed the file's
  now-unused `MASTER_GAMES_TABLE` constant to `MASTER_DECON_TABLE = 'tmgd_gamesdecon'`.

### Status no longer auto-loads on page mount
- `pipelinemastergames/page.tsx`'s mount `useEffect` called `doRefreshAllStatus()` (all 3 steps'
  Status columns, i.e. `wk_mgr_gamesraw` row count, deconstruct backlog, and permanent
  `tmpos_positions`/`tmgam_game_positions` totals), unlike the regular games pipeline's page, whose
  mount effect never auto-loads status for the same reason it was skipped there originally
  (page-load time). Changed to `doRefreshRuns()` only, matching `pipelinegames/page.tsx` exactly —
  Status now populates only via the "Refresh" button, a step's own "↻", or after that step's own
  Run completes.

### `MasterPlayerMultiSelect` — already-processed players sorted to the end
- `src/ui/filters/MasterPlayerMultiSelect.tsx`: `handleOptions` now sorted (non-downloaded first,
  downloaded last, grade order preserved within each group) before being passed to
  `MySelectMulti`, so a ✓ player no longer appears near the top of the unselected list just
  because of a high grade.

### `handleRunAll` per-player restructuring + player name in results/log
- `pipelinemastergames/page.tsx`: moved `handleDeconstruct(false, handle)`/
  `handleBuildTree(false, handle)` inside the per-player loop, right after that player's own
  `handleSync`, instead of running once after the whole sync loop finished. Updated the stale
  comment header to describe the corrected sequence.
- `deconstructGames_Master.ts`/`buildPositionTree_Master.ts`: added an optional display-only
  `playerLabel`/`opts.playerLabel` parameter, used only in the logged `stepName` — no change to
  either function's global (no-filter) query behavior.
- `api/mastergames/deconstruct/route.ts`/`api/mastergames/build-tree/route.ts`: read a new
  `player` query param, pass through unchanged.
- `syncResult`/`deconResult`/`treeResult` state types gained an optional `player` field; the
  Result cells for all 3 steps now prefix with the player handle when set (always set from Run
  All's per-player calls; unset for the standalone "Run" buttons, matching their existing
  multi-player/no-player scope). **Superseded by the 3-step restructuring below** — `deconResult`
  no longer exists (Step 2/Deconstruct folded into Step 1), and the player-prefix format changed
  from `description (player)` to `player: description`.

### Master-games pipeline restructured to 3 steps (Sync bundled with Deconstruct; Build Tree and
### Sync Position Tree split into independent steps)
- `src/lib/master/masterSync.ts` — `syncMasterGames` now calls `deconstructGames_Master(level)`
  internally after each player's download; logs `1a`/`1b`/`1c` itself (`${player}: ...` format),
  replacing the single old `1a` "Sync Master Games" call; return type gained `deconstructed`.
- `src/lib/master/deconstructGames_Master.ts` — dropped `forceNewRun`/`playerLabel` params and its
  own `logPipelineStep` call entirely (mirrors `deconstructGames_Player`, which has never logged
  its own pipeline step). No longer imports `logPipelineStep`/`PIPELINE_TYPE_MASTERGAMES`.
- `src/lib/master/buildPositionTree_Master.ts` — Phase A's outer log call renumbered `3a` → `2a`;
  Phase B's (`syncTposFromTgam_Master`) two log calls renumbered `4a`/`4b` → `3a`/`3b`; both now use
  `${playerLabel}: description` format instead of `description (playerLabel)`.
- `src/app/api/mastergames/deconstruct/route.ts` — deleted (folded into Step 1).
- `src/app/api/mastergames/sync-tpos/route.ts` — new, mirrors `api/analysis/sync-tpos/route.ts`,
  calls `syncTposFromTgam_Master` directly.
- `src/lib/master/masterGamesPipelineStatus.ts` — rewritten: `refreshMasterSyncStatus` now returns
  `{pending, allDecon}` (mirrors `refreshStep1`), `refreshMasterTreeStatus` now returns
  `{allProcessed, allRemaining}` (mirrors `refreshStep3`), new `refreshMasterTposStatus` returns
  `{positions, unresolved}` (mirrors `refreshTposStatus`); `refreshMasterDeconStatus` removed.
- `src/app/owner/pipelinemastergames/page.tsx` — full rewrite: `JOB_GROUPS`-style Jobs table
  (mirrors `pipelinegames/page.tsx`, matches on `(pip_step, pip_sub_step)`, nothing consolidated);
  removed `handleDeconstruct`/`deconRunning`/`deconResult`/`deconError` and Step 2's old row
  entirely; `handleBuildTree` now always sends `skipSync: 'true'`; new `handleSyncTpos` +
  `tposRunning`/`tposResult`/`tposError` state, own "Sync Master Position Tree" row (Step 3);
  `handleRunAll` now does Sync → Build Tree → Sync Position Tree per player (3 calls, not 4); Step
  1's help text/output updated to describe the bundled deconstruct; Step 2/3 status cells updated
  to the new `{pending/allDecon}`/`{allProcessed/allRemaining}`/`{positions/unresolved}` shapes.
- `src/app/owner/constants/page.tsx` — `PIPELINE_TYPE_MASTERGAMES`'s consumer list fixed (was
  referencing pre-rename filenames `masterDeconstruct.ts`/`masterPositionTree.ts` and the
  no-longer-true `deconstructGames_Master` pipeline-step-logging consumer).

### Per-sub-step timing fix (both pipelines)
- `src/lib/master/masterSync.ts` — `syncMasterGames` now tracks `queryMs` (archive list fetch),
  `fetchMs` (monthly archive fetch/insert loop), `deconstructMs` (the internal
  `deconstructGames_Master` call), and logs `1a`/`1b`/`1c` with each phase's own duration instead
  of one shared total.
- `src/lib/actions/sync.ts` — `runGameSync` now accumulates `queryMs`/`fetchMs`/`deconstructMs`/
  `ratingsMs` across its per-player loop (summed across all players, since logging happens once
  after the whole loop) and logs `1a`/`1b`/`1c`/`1d` with each phase's own accumulated duration.

### Step 1 casing + `1c` Input Recs fix
- `masterSync.ts`: `1a`/`1b`/`1c` step names now use `chesscomHandle` (original casing) instead of
  the lowercased `player`, matching Step 2/3's display.
- `deconstructGames_Master.ts`: return value gained `rawScanned` (the actual `wk_mgr_gamesraw` row
  count fetched); `masterSync.ts` now logs `1c`'s `inputRecs` as `decon.rawScanned` instead of
  `inserted`, reflecting deconstruct's true (unfiltered, whole-workfile) scan size.

### FIDE tab split, Step Name width, Masters search box
- `owner/page.tsx`: split `TOOLS_MASTERS` into `TOOLS_MASTERS` (just Pipeline (Master Games)) and
  new `TOOLS_FIDE` (the two FIDE-related entries); new "FIDE" tab after "Masters".
- `PipelineLogTable.tsx`: Step Name column `w-60` → `w-96`.
- `MasterPlayerMultiSelect.tsx`: added a `MyInput` search box next to the multi-select, filtering
  unselected options by name/handle live; selected players are never hidden by the search.

## Testing

**FIDE tab split, Step Name width, Masters search box**
- [ ] `/owner` — confirm tab order Logging, Cache, Players, Masters, FIDE, Pipeline Log, Dataflow,
      Constants, Session Storage, Routing Maintenance; "Masters" now shows only
      `Pipeline (Master Games)`; "FIDE" shows `FIDE/Chess.com Master Players Matching` and
      `Pipeline (FIDE)`.
- [ ] Pipeline Log's Step Name column is visibly wider than before.
- [ ] On `/owner/pipelinemastergames`, type a partial name/handle into the new search box next to
      Masters — the dropdown's unchecked candidates narrow to matches; any already-checked player
      stays visible even if it doesn't match the search text.

**Step 1 casing + Input Recs**
- [ ] Run Step 1 for a player whose handle has mixed case (e.g. `TRadjabov`) — confirm `1a`/`1b`/
      `1c` all show the same casing as Step 2/3's player prefix, not lowercased.
- [ ] In a multi-player Run All, confirm `1c`'s Input Recs grows for later players (reflecting the
      whole `wk_mgr_gamesraw` table, not just that player's own new rows).

**Per-sub-step timing**
- [ ] Run Step 1 (either pipeline) and check the Pipeline Log — `1a`/`1b`/`1c`(`/1d`) should each
      show a different, plausible duration (query fast, fetch/insert slowest, deconstruct
      moderate), not all four identical.

**Master-games pipeline restructuring (3 steps)**
- [ ] `/owner/pipelinemastergames` — confirm exactly 3 top-level steps now: "1. Sync Master Games"
      (no separate Deconstruct step), "2. Build Master Position Tree", "3. Sync Master Position
      Tree" (new).
- [ ] Click "Run" on Step 1 with 1 player selected — confirm the Result line shows
      `player: N inserted, M skipped, T total found, D deconstructed`, and the Jobs table / Pipeline
      Log shows 3 separate rows for this run — `1a` Query chess.com API, `1b` Fetch & Insert Raw
      Games, `1c` Deconstruct Master Games — each prefixed `player: `.
- [ ] Click "Run" on Step 2 — confirm it processes outstanding `tmgd_gamesdecon` rows into
      `tmgam_game_positions` only (no `tmpos_positions` change), logged as `2a`.
- [ ] Click "Run" on Step 3 — confirm it derives `tmpos_positions` from `tmgam_game_positions`,
      logged as `3a`/`3b`, with no key collision against Step 2's `2a`.
- [ ] With 2+ masters selected, click "Run All" — confirm the sequence per player is Sync → Build
      Tree → Sync Position Tree (not Sync → Deconstruct → Build Tree), each step's Result line
      prefixed with that player's handle, and the Jobs table shows every sub-step row (no
      consolidation) for the whole run.
- [ ] Refresh Step 1/2/3's Status cells — confirm they show the new shapes (`pending`/
      `deconstructed` counts for Step 1, `remaining` for Step 2, `positions`/`unresolved` for Step
      3) and that clicking each step's own "↻" or "Refresh" populates them without error.
- [ ] Confirm the Pipeline Log tab's Type filter still shows correct `mastergames` rows for a Run
      All, with no `3a` name collision anywhere in the row list.

**`MasterPlayerMultiSelect` sort order**
- [ ] Open the Masters dropdown on `/owner/pipelinemastergames` for a year with some players
      already synced — confirm every ✓-labeled (already processed) player sits at the bottom of
      the unselected list, below every non-✓ player, regardless of grade.

**Status no longer auto-loads on mount**
- [ ] Load `/owner/pipelinemastergames` fresh — all three Status cells (Sync/Build Tree/Sync
      Position Tree rows) should be blank, not showing numbers, until "Refresh", a row's own "↻",
      or that step's own Run is clicked.
- [ ] Page load should feel faster (no longer waiting on 3 status queries before the page settles).

**`getMasterSyncYearStatus` fix**
- [ ] On `/owner/pipelinemastergames`, with Year set to a year that has synced games, confirm the
      Masters multi-select shows "✓" next to every player actually present in `tmgd_gamesdecon`
      for that year (e.g. Magnus Carlsen, Hikaru, Fabiano Caruana, Javokhir Sindarov, Vincent
      Keymer), not just Vincent Keymer.

**`'D'` severity → `'I'` / Pipeline Type dropdown width**
- [ ] Run any of the 11 affected operations (e.g. Game Sync, Build Position Tree on either
      pipeline, a FIDE zip download/unzip, Purge) and confirm new `xlg_logging`/`tpip_pipelinelog`
      rows show severity `I`, not `D`.
- [ ] On `/owner`'s Pipeline Log tab, confirm the Type filter dropdown is visibly wider than
      before.

**Pipeline Log follow-up fixes**
- [ ] The Type filter dropdown's options read `games`/`masters`/`mastergames` (lowercase, exact),
      not "FIDE"/"Master Games".
- [ ] "Created" column is wider and shows 24-hour time (e.g. `14:27:37`, not `2:27:37 PM`), in
      both the table and the detail popup.
- [ ] On `/owner/pipelinemastergames`, select 2+ masters and click "Run All" — check the Pipeline
      Log, filtered to `mastergames` — each player's Sync should have its own run id, and that
      same player's Deconstruct/Build Tree rows (from the end of the run) should share the *last*
      player's run id, not each mint a separate one.

**SetUp/FEN replay bug fix**
- [ ] Click "Run" on Step 3 (Build Master Position Tree) — game mgd_mgdid 2040 (or any other
      SetUp/FEN game) should no longer log a "chess.js error" / increment `errors`; its positions
      should now be recorded starting from move 37 (its actual first replayed ply), not skipped.
- [ ] Spot-check the regular player pipeline's Build Position Tree step too, since the identical
      fix was applied there — no new errors introduced, and any player game with a SetUp/FEN
      header (if one exists in the current dataset) now processes correctly instead of failing.

**Analyze page (unrelated small change, from early in this plan)**
- [ ] Open https://rs7-chess.vercel.app/analyzemaster?game=1330 (or local) — confirm the
      Moves/Master Moves (Lichess)/Master Games (Lichess) column is 600px wide, not cramped, and
      the overall layout still looks reasonable.

**`/owner` nav**
- [ ] Confirm the old single "Tools" tab is gone, replaced by three tabs in order: "Players"
      (containing only Pipeline (Games)), "Masters" (`FIDE/Chess.com Master Players Matching`,
      `Pipeline (Master Games)`, `Pipeline (FIDE)` — in that order), and "Pipeline Log" (shows
      history for all three pipelines).
- [ ] Confirm no leftover "Proof of Concept"/"POC" text anywhere (page headings, nav card
      labels/descriptions, empty-state messages).
- [ ] Confirm `/owner/mastergames` (FEN Lookup) now 404s, and the public `/mastergames` route
      (browsable master games list) still works exactly as before.

**`/owner/pipelinemastergames` — layout**
- [ ] "Masters" is a multi-select starting with **no** players checked; already-downloaded
      players for the selected year show "✓". Changing Year updates the "✓" labels without
      changing what's checked.
- [ ] Intro paragraph is gone, heading no longer says "(Proof of Concept)", Year control sits
      inline with Masters (bold label, white background, same row).

**`/owner/pipelinemastergames` — Step 1 (Sync), still per-player**
- [ ] With one master selected, click "Run" on Step 1 — only Step 1's button shows "Syncing...",
      the other 3 buttons are disabled only while their own operation runs (not blocked by Step 1).
- [ ] Select 2+ masters (including one already synced for the selected year) and click "Run" on
      Step 1 — result line shows summed inserted/skipped/total, already-synced players report
      mostly "skipped" (no duplicates), Jobs table's Step 1 row updates.
- [ ] Confirm Step 1's "Run" button is disabled with nothing selected; Step 2/3's buttons are
      **not** — they should work with any (or no) selection now, since they're global.

**`/owner/pipelinemastergames` — Step 2/3 (Deconstruct, Build Tree), now global**
- [ ] Click "Run" on Step 2 (Deconstruct) with 0, 1, and 2+ masters selected — confirm it behaves
      identically regardless of selection (processes all outstanding raw games once, not once per
      selected player). Same for Step 3 (Build Tree).
- [ ] Step 3's help text should describe incremental/non-destructive behavior ("processes only
      what's new"), not "truncate-and-rebuild".
- [ ] Click "Run" on Step 3 twice in a row with no new games synced in between — second run
      should report 0 new games processed (nothing outstanding), not reprocess everything.

**`/owner/pipelinemastergames` — Run All**
- [ ] With 2+ masters selected, click "Run All" — busy indicator moves Sync → (next player's)
      Sync → ... for each player in turn, then one Deconstruct pass, then one Build Tree pass —
      never more than one button showing busy at once.
- [ ] Check the run id dropdown — each selected player's Sync gets its own run id; Deconstruct and
      Build Tree join whichever run was most recently allocated (the last player's).

**Regular player pipeline — must be unaffected by the constant rename**
- [ ] `/owner/pipelinegames` still loads and its "Run" buttons still work (Game Sync, Build
      Position Tree, Evaluate Positions, Habits, etc.) — this page imports the largest number of
      renamed constants, so it's the most likely place a bad rename would silently break something
      `tsc` wouldn't catch.
- [ ] On /owner/pipelinegames, click "Run" on Step 1 (Game Sync) — confirm it still allocates a
      fresh run id each time, and confirm `wk_gr_gamesraw`'s row count resets to reflect a full
      fresh sync (not incremental) after the run — verifies the truncate-once-per-run change.
- [ ] Spot-check the FIDE pipeline's (`/owner/pipelinemasters`) "Run All" still groups its steps
      under one shared run id as before.

**Database (already verified directly by Claude via read-only queries, not required but worth a
spot-check if you want extra confidence)**
- [ ] `wk_gr_gamesraw`, `wk_pur_workfile` exist in primary; `wk_mgr_gamesraw`, `wk_fzp_fide_zip`,
      `wk_fxm_fide_xml`, `tmgd_gamesdecon`, `tmpos_positions`, `tmgam_game_positions` exist in
      secondary with the expected columns; `xrtg_routing` in primary has 6 rows, all correct.
