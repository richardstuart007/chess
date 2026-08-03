# PLAN_pipeline-issue — chess

## Title
Pipeline issue

## Plan
- [x] **Root cause (confirmed via prod `xlg_logging` + `information_schema.columns`)**: prod's
      `tgd_gamesdecon` table is missing the `gd_final_eval` column — present in
      `scripts/schema.sql` and local dev, never added to prod via manual `ALTER TABLE`. This makes
      `refreshGameEndingsStatus`'s SQL fail on prod (`column "gd_final_eval" does not exist`);
      `table_query` swallows the error and returns `[]`; `rows[0]` is then `undefined`, causing the
      `Cannot read properties of undefined (reading 'evaluated')` crash on the Owner Pipeline page.
      It also means Step 8 (Evaluate Game Endings) itself is fully broken on prod, not just its
      status refresh — the write path reads/writes the same missing column
      (`src/lib/analysis/chessdb.ts` / `enrichPositionsStockfish.ts`). Fix: user runs on prod via
      pgAdmin4 (given at `#code` time, not run by Claude):
      ALTER TABLE tgd_gamesdecon ADD COLUMN gd_final_eval integer;
      **Done — user ran this on prod 2026-08-03; verified via `information_schema.columns` that
      `gd_final_eval integer` now exists on prod's `tgd_gamesdecon`.**
- [x] **Same crash also explains the missing "Last Run" column / run numbers.** The Owner Pipeline
      page's `useEffect` `load()` awaits `refreshGameEndingsStatus()` sequentially before
      `getRecentRunIds()`/`getLatestPipelineRuns()` — when it throws, everything after it in that
      function never runs, so `runs`/`recentRunIds` stay empty and every "Last Run" cell renders
      `—`. Guard `rows[0]` in all 8 unguarded functions in `src/lib/actions/pipelineStatus.ts`
      (`getPipelineStatus`, `refreshStep1`, `refreshStep3`, `refreshTposStatus`, `refreshStep4`,
      `refreshCpChangeStatus`, `refreshHabitsStatus`, `refreshGameEndingsStatus`) against an empty
      `rows` array — e.g. `const r = rows[0] ?? {}` — matching the optional-chaining pattern
      `refreshPurgeStatus` already uses in the same file, so a swallowed SQL failure surfaces as a
      zeroed status instead of crashing the whole page and starving everything downstream in the
      same load sequence.
- [x] **Coding-convention fix** (flagged by user): the same 8 functions in
      `src/lib/actions/pipelineStatus.ts` return an object literal built directly from calculated
      values (`return { evaluated: parseInt(...), ... }`) instead of assigning to a named `const`
      first, per the global "never return a function call result directly" rule. Change each to
      `const result = { ... }; return result`.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) chess.
- [x] **Separate small issue, folded into this plan at user's request**: the dev console shows a
      `pg`/`pg-connection-string` "SECURITY WARNING" about SSL mode `'prefer'`/`'require'`/
      `'verify-ca'` being silently aliased to `'verify-full'`, triggered by any query against prod
      (any `sslmode=require` connection). Pre-existing, unrelated to the pipeline crash fix above —
      confirmed it also printed during this session's own `npm run build`. Fix (user-agreed):
      change `sslmode=require` → `sslmode=verify-full` in `.env.localprod`'s `POSTGRES_URL`.
- [x] **Broader prod schema drift found during testing, then resolved independently** — an initial
      full audit (every table in `scripts/schema.sql` diffed against prod's actual
      `information_schema.columns`) found `teva_evaluations` missing `eva_depth`, `thab_habits`
      missing `hab_resulting_pos_id`, and `tgev_game_evals` missing `gev_cp_change`/`gev_ply`,
      matching live crashes seen during testing (`column "eva_depth" does not exist`, etc.). SQL
      was proposed for all three tables, including a `DELETE FROM tgev_game_evals` (44 rows judged
      unreconstructable).
      **Before that SQL was run, the user renamed databases in pgAdmin** (local `chess1` →
      `chess`, and a Neon-side rename/cleanup of old `chess`/`chess1` naming) and updated
      `.env.locallocal` accordingly (`.env.localprod`'s connection string itself was already
      unchanged — same `neondb` host throughout). A re-audit against the current connection
      immediately after came back **completely clean — zero missing columns anywhere**, matching
      the "chess Production" schema the user independently captured via their own schema-compare
      tool. The `tgev_game_evals` SQL was never run — good thing, since `gev_ply`/`gev_cp_change`
      turned out to already exist and the 44 rows were real, not stale (the `DELETE` would have
      destroyed live data based on a wrong premise from the earlier stale read). No SQL needed for
      any of the three tables; only the original `gd_final_eval` fix (already run, see above) was
      ever actually required.
- [x] **`tgev_game_evals` cleanup, discovered via next-dbadmin schema/data compare after the
      above**: user ran the original (later-retracted) 5-statement SQL block before the retraction
      landed, including `DELETE FROM tgev_game_evals` — confirmed live that prod's
      `tgev_game_evals` was temporarily 0 rows (was 44). Low-stakes: this table is pure derived
      data, fully regenerated by `saveGameEvaluations` whenever `/analyze` is reopened for a game.
      Also found: prod had 5 dead legacy columns (old `nextjs-chess`-era naming) on
      `tgev_game_evals` (`gev_move_num`, `gev_fen_before`, `gev_cp_before`, `gev_cp_loss`,
      `gev_classification`) — confirmed zero references anywhere in `src/` or docs, user dropped
      them (backed up first as `bk1_tgev_game_evals`). Also found `scripts/schema.sql` itself was
      stale for `tgev_game_evals` (wrong column order/unnamed constraint vs. true local) —
      corrected to match true local exactly (see Changes).
      **Resolved differently than planned**: instead of running the prepared backup/drop/recreate
      SQL, the user declared **local the master** for this project (not prod) and used
      next-dbadmin's CopyTable facility to copy the relevant tables from local → prod wholesale
      (`teva_evaluations`, `tgam_game_positions`, `tgd_gamesdecon`, `tgev_game_evals`,
      `thab_habits`, `tpos_positions`, `tpur_workfile` — row counts now match local exactly).
      Verified live afterward: `tgev_game_evals` now has 555 rows, correct column order
      (`gev_ply` in position 3), both constraints present (`tgev_game_evals_pkey`,
      `tgev_game_evals_gdid_move_num_key` UNIQUE), and a healthy identity sequence
      (`max_id`/`seq_val` both 733) — fully resolved, no further SQL needed.
      **Two small loose ends noted, not yet resolved** (low priority, no functional impact):
      `tpip_pipelinelog.pip_errors` (dead column, confirmed unused) was never actually dropped
      despite being in the earlier cleanup SQL batch — that table wasn't part of the local→prod
      copy either, so it's an independent leftover; and `xlg_logging` on prod is now 0 rows
      (previously 19,867) — got truncated during the copy process but wasn't part of the tables
      that were actually repopulated from local. Just log history, not app data.
- [x] Drop the leftover `tpip_pipelinelog.pip_errors` dead column on prod (confirmed unused, and
      confirmed via git history — `docs/PLAN_pipeline-run-all-and-cron-cleanup.md`, archived
      2026-07-15 — that this column was deliberately added then deliberately removed in the same
      already-completed plan; this `DROP COLUMN` was simply never actually run on prod at the
      time). Confirmed local never had it (nothing to run there). User ran on prod via pgAdmin4;
      verified via `information_schema.columns` that it's gone.
- [x] `xlg_logging` being 0 rows on prod (down from 19,867) — user confirmed this is routine,
      expected behavior (gets cleared periodically since it grows large from local-against-prod
      activity), not an accident from this session's work. No action needed.

## Changes
### src/lib/actions/pipelineStatus.ts
- Guarded `rows[0]` against an empty `rows` array in all 8 functions that read it
  (`getPipelineStatus`, `refreshStep1`, `refreshStep3`, `refreshTposStatus`, `refreshStep4`,
  `refreshCpChangeStatus`, `refreshHabitsStatus`, `refreshGameEndingsStatus`) — `const r = rows[0]`
  → `const r = rows[0] ?? {}`, matching the optional-chaining pattern already used in
  `refreshPurgeStatus` in the same file. Previously, any swallowed `table_query` SQL failure (e.g.
  a missing column) made `rows` come back `[]`, `rows[0]` `undefined`, and the next line's
  `r.field` throw a TypeError — crashing the whole Owner Pipeline page mid-load and, because the
  page's `useEffect` awaits these sequentially, silently starving every awaited call after the one
  that threw (this is why "Last Run" showed `—` for every row).
- Same 8 functions: changed `return { ... }` (an object literal built directly from calculated
  values) to `const result = { ... }; return result`, per the global "never return a function call
  result / calculated value directly" convention.

### .env.localprod
- Changed `POSTGRES_URL`'s `sslmode=require` → `sslmode=verify-full`, per the `pg`/
  `pg-connection-string` deprecation warning's own suggestion — `require` is currently silently
  aliased to `verify-full` anyway, so this is a no-behavior-change fix, not a strictness increase.
  Verified with a direct test connection before applying: `verify-full` connects cleanly against
  prod Neon with no warning. Note: `.env` itself was **not** edited directly (per convention, it's
  only ever overwritten by copying a named env file) — it still has the old `sslmode=require` until
  the dev server is restarted via `npm run localprod`, which re-copies `.env.localprod` → `.env`.

## Testing
- [ ] Open `/owner/pipeline` on prod and confirm the page loads without the
      "Cannot read properties of undefined (reading 'evaluated')" runtime error.
- [ ] Confirm the "Last Run" column in the Pipeline Jobs table now shows real timestamps (not `—`
      for every row) once at least one run exists for a step.
- [ ] Confirm Step 8 ("Evaluate Game Endings") shows a real Processed/Remaining count instead of
      `—`, and that clicking its "Run" button now works (it was blocked entirely by the missing
      `gd_final_eval` column before the prod `ALTER TABLE`).
- [ ] Click the "↻" refresh on each of the 9 status rows and confirm none of them crash the page,
      even if one of their underlying queries were to fail again in the future.
- [ ] User runs:
  npm run localprod
      Then confirm the "SECURITY WARNING" SSL-mode console message no longer appears.
