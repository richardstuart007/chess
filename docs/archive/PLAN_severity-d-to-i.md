# PLAN_severity-d-to-i — chess

## Title
Change pipeline log severity from D to I

## Plan
- [x] Confirmed: real deployed production (Vercel env vars, separate from this repo's
      `.env.localprod`, which is only for local dev pointed at the prod DB) already has
      `NEXT_PUBLIC_APPENV_LOG_I=false`. Relabeling `severity: 'D'` → `'I'` therefore suppresses
      these entries in real production (already-false `LOG_I`) while they stay visible locally
      (`.env.locallocal` has `LOG_I=true`). No `.env` file changes needed — `write_logging`'s
      filter is purely per-severity, already correctly configured in real prod.
- [x] Change every `severity: 'D'` → `severity: 'I'` in `table_query` calls across:
      `enrichPositionsStockfish.ts` (10), `purgePositions.ts` (6), `buildPositionTree.ts` (6),
      `players.ts` (3), `buildHabits.ts` (2), `fideStaging.ts` (2), `fidePipeline.ts` (2),
      `deconstruct.ts` (1), `sync.ts` (1).
- [x] Change `lg_severity: 'D'` → `'I'` in `logStep.ts`'s `logStart`/`logEnd` (used by every
      pipeline function's "Start function X"/"End function X" trace pair).
- [x] `npx tsc --noEmit` clean.

## Changes
### src/lib/logStep.ts, src/lib/analysis/{enrichPositionsStockfish,purgePositions,buildPositionTree,buildHabits}.ts, src/lib/actions/{players,deconstruct,sync}.ts, src/lib/fide/{fideStaging,fidePipeline}.ts
- Every `severity: 'D'` (35 `table_query` call sites) and `lg_severity: 'D'` (`logStart`/`logEnd`)
  changed to `'I'`. No behavior change locally (`.env.locallocal` has both `LOG_D`/`LOG_I` true);
  in real production (`NEXT_PUBLIC_APPENV_LOG_I=false`, set outside this repo in Vercel) these
  entries now stop being written, since they moved from the already-true `LOG_D` gate to the
  already-false `LOG_I` gate. No `.env` file changes.

## Testing
- [ ] Confirmed via `npx tsc --noEmit` — passes.
- [ ] Run any pipeline step locally (e.g. `/owner/pipelinegames` or `/owner/pipelinemasters`) and
      confirm `xlg_logging` still shows these entries locally (now tagged 'I' instead of 'D').
- [ ] After deploying, confirm these entries stop appearing in the production `xlg_logging` table
      (verify against production's actual `NEXT_PUBLIC_APPENV_LOG_I` value in Vercel, not this
      repo's `.env.localprod`).
