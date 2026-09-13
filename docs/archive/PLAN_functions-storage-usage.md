# PLAN_functions-storage-usage — chess

## Title
Functions Storage usage issue

## Plan
- [x] User deletes existing Vercel deployments to reclaim Functions Storage, and disables/limits
      deployment retention so it never re-accumulates (manual, Vercel dashboard — see chat for
      exact steps; not a code change).
- [x] Add `outputFileTracingExcludes` to `next.config.mjs`, scoped to the `/api/analysis/**`
      routes, excluding every `node_modules/stockfish/bin/*` file except
      `stockfish-18-lite-single.js`/`.wasm` — the only variant `enrichPositionsStockfish.ts`'s
      `StockfishWasm.init()` ever requests (`initEngine('lite-single')`). This should cut each of
      the 4 affected functions (`evaluate-positions`, `deepen-popular-positions`,
      `evaluate-game-endings`, `update-cp-change`) from ~348MB down to ~7.3MB of bundled stockfish
      files.

- [x] **MyInputNumeric migration** (unrelated task, tracked here per "one plan at a time"). Replace
      every `MyInput type='number'` call site with `nextjs-shared`'s new `MyInputNumeric`
      (v2.1.88+, already reinstalled — includes the `clampOnBlur` prop added for this migration).
      Agreed design:
      - Every min/max-bounded field uses `clampOnBlur` — this also aligns `pipelinegames`' Depth/
        Batch (currently clamped on every keystroke) with the "type freely, clamp on blur" pattern
        `DepthInput_shared`/`GameAnalysisPanel_shared` already use elsewhere in this project.
      - `DepthInput_shared.tsx` (line 43): internals rewritten to use `MyInputNumeric` with
        `integerOnly` + `clampOnBlur` + existing `min`/`max`. External prop API unchanged
        (`value: number`, `onChange: (depth: number) => void`, NaN-for-empty) since 3 other files
        call it — only the internal empty/NaN ↔ `''`/`null` translation and the manual
        onBlur-clamp logic (now handled by `clampOnBlur`) change.
      - `GameAnalysisPanel_shared.tsx` — From move (line 101) and To move (line 118): switch to
        `MyInputNumeric` with `integerOnly` + `clampOnBlur` + existing `min`/`max`. The cross-field
        "bump To move up if From move's clamped value exceeds it" logic moves into the `onChange`
        wrapper (fires on the clamped value MyInputNumeric passes back), since `onBlur` can no
        longer reliably read a same-tick "already clamped" value once clamping lives inside the
        component. Keep NaN-for-empty at this file's own state boundary (`fromMove`/`toMove` stay
        `number`, translated to/from `''`/`null` at the `MyInputNumeric` boundary only).
      - `pipelinegames/page.tsx` — Depth (line 621) and Batch (line 625): switch to
        `MyInputNumeric` with `integerOnly` + `clampOnBlur` + existing `min`/`max`, replacing the
        current inline `Math.min`/`Math.max` clamp in `onChange`.
      - `ChessBoardView_shared.tsx` (Min rating line 1456, Year line 1468) and
        `MasterGameView_master.tsx` (Min rating line 1303, Year line 1315): direct replace, no
        `min`/`max`/clamp today — straightforward swap, gains hidden spin arrows + error styling
        for free (currently relies on the global `globals.css` spin-arrow rule, which stays in
        place for any native number inputs elsewhere and is harmless to leave alongside
        `MyInputNumeric`'s own per-instance hiding).

## Root cause (for the record)
`src/lib/analysis/enrichPositionsStockfish.ts:115` does `await import('stockfish')` as the
production WASM fallback engine (native `STOCKFISH_PATH` binary isn't available on Vercel).
`next.config.mjs` already has `serverExternalPackages: ['stockfish']`, which stops Next from
bundling/tree-shaking the package — so Vercel's output file tracer conservatively includes the
*entire* 348MB `node_modules/stockfish/bin/` directory (all engine variants: full 113MB×2,
asm.js 10.5MB, lite 7MB, lite-single 7MB) into every one of the 4 routes that import it, even
though only the `lite-single` variant (~7.3MB) is ever loaded at runtime. That's re-bundled on
every deployment (prod + preview), so it accumulates in Functions Storage across deployment
history — ~348MB × ~88 deployments lines up with the 30.53GB reported.

## Changes
- 2026-09-12: Deployment Retention Policy set to 1 day (user, Vercel dashboard). All 35 existing
  `rs7-chess` deployments deleted via Vercel CLI (`vercel remove`) except the current live
  production deployment (`rs7-chess-hjjnxs13g-richardstuart007s-projects.vercel.app`, per user's
  explicit instruction to keep it). Run via a user-supplied 7-day all-projects access token, scoped
  to the `rs7-chess` project only for every command.
- 2026-09-12: User asked to extend the same deployment cleanup to all 5 other Vercel projects
  (`rs7-dashboard`, `rs7-bridgeschool`, `rs7-bridge`, `rs7-bridgeschool-dev`, `nextjs-chess`),
  keeping each project's live deployment. A hand-rolled "detect the live deployment via `vercel
  inspect` output parsing" script had a bug (matched the wrong string), and a `TaskStop` call meant
  to abort it did not take effect instantly — one extra deletion went through before the process
  actually died, and it deleted `rs7-dashboard`'s live deployment
  (`rs7-dashboard-2c2nqnhim-...`), taking `rs7-dashboard.vercel.app` offline (404). Immediately
  remediated by promoting the newest surviving old deployment
  (`rs7-dashboard-qy71f6bjx-...`, 10 days old) back to production — site is back to 200 OK, but
  running 10-day-stale code until the user redeploys it themselves (their choice, not done here).
  `rs7-chess`'s own cleanup was unaffected (it used a hardcoded, manually-verified deployment ID,
  not the buggy auto-detection). Found `vercel remove` has a built-in `--safe` flag ("skip
  deployments with an active alias", verified server-side by Vercel) that should have been used
  from the start instead of custom detection logic. Per user's decision, the cross-project cleanup
  (rs7-dashboard's remaining old deployments + the other 4 projects) is paused, not resumed, as of
  this entry. The 7-day all-projects access token used for all of this is still live — revoke it in
  Vercel → Settings → Tokens once no longer needed.

### next.config.mjs
- Added `outputFileTracingExcludes` scoped to `/api/analysis/**`, excluding every
  `node_modules/stockfish/bin/*` file except `stockfish-18-lite-single.js`/`.wasm` (the only
  variant `enrichPositionsStockfish.ts`'s `StockfishWasm.init()` ever requests). Verified via
  `npm run build` that the trace manifests (`.next/server/app/api/analysis/*/route.js.nft.json`)
  for `evaluate-positions`, `deepen-popular-positions`, `evaluate-game-endings`, and
  `update-cp-change` now include only the lite-single `.js`/`.wasm` pair — none of the excluded
  113MB/10.5MB/7MB variants appear. `npx tsc --noEmit` passes.

### src/ui/board/DepthInput_shared.tsx
- Switched internals from `MyInput type='number'` to `MyInputNumeric` with `integerOnly` +
  `clampOnBlur`. External prop API (`value: number`, `onChange: (depth: number) => void`,
  NaN-for-empty) is unchanged — 3 callers untouched. The "empty on blur → defaults to `min`"
  behavior is preserved via a small `onBlur` wrapper (`clampOnBlur` itself only corrects
  out-of-range values, it doesn't fill in a default for an empty field).

### src/ui/board/GameAnalysisPanel_shared.tsx
- "From move": switched to `MyInputNumeric` with `integerOnly` + `clampOnBlur` (min/max are
  static — `1`/`totalFullMoves` — so `clampOnBlur` applies cleanly). The "bump To move up if
  From move's clamped value exceeds it" cross-field logic now reads a `useRef`
  (`fromMoveLatestRef`) updated inside `onChange`, checked only inside `onBlur` — preserves the
  original timing exactly (bump evaluated once, at blur, using the settled/clamped value), since
  reading the `fromMove` prop directly inside `onBlur` would see a stale pre-clamp value (state
  hasn't re-rendered yet within the same synchronous blur handler).
- "To move": switched to `MyInputNumeric` with `integerOnly` **only** — deliberately did **not**
  use `clampOnBlur` here, despite the plan step saying so. Discovered during implementation: To
  move's real lower bound is dynamic (`fromMove`, not the static `min={1}` prop) — using
  `clampOnBlur` would have let To move clamp down to 1 regardless of From move's value, breaking
  the `toMove >= fromMove` invariant. Kept the original manual `onBlur` clamp math unchanged
  instead (same as before this migration), only the base input component changed.

### src/app/owner/pipelinegames/page.tsx
- Depth and Batch switched to `MyInputNumeric` with `integerOnly` + `clampOnBlur`, replacing the
  inline `Math.min`/`Math.max` in `onChange`. Note: previously Depth only clamped its *upper*
  bound (8 was never enforced) and Batch only clamped its *lower* bound (1000 was never
  enforced) — both bounds are now genuinely enforced on blur, matching the `min`/`max` values
  already declared in the JSX. Kept the existing literal `50` empty-fallback for Batch as-is
  (did not substitute the unrelated `DEFAULT_BATCH_SIZE_Player` constant, which is `200` — a
  different value; flagging that pre-existing inconsistency here rather than silently changing
  either one).

### src/ui/board/ChessBoardView_shared.tsx, src/ui/board/MasterGameView_master.tsx
- Min rating and Year switched to `MyInputNumeric` (`integerOnly`, no min/max — unchanged, none
  set previously). `year`'s local state type changed from `string` to `number | ''` to match
  `MyInputNumeric`'s value type — confirmed safe: chess.com's search comparison operator lives in
  the separate `lsty` dropdown, not embedded in the year string itself, so `year` was always a
  plain numeric value, just loosely typed as `string` for convenience when building
  `URLSearchParams`.

### src/lib/actions/chesscomSearch.ts
- `ChessComSearchFilters.year` type changed from `string` to `number | ''` to match the two
  callers' new state type. `searchChessComGames`'s `URLSearchParams` construction updated to
  `filters.year === '' ? '' : String(filters.year)`, mirroring the existing `mr` field's pattern
  exactly.

## Testing
- [ ] Deploy to Vercel and confirm the 4 analysis routes still work (Owner → Pipeline Games page:
      run "Evaluate Positions", "Deepen Popular Positions", "Evaluate Game Endings", and
      "Update CP Change" — each should complete without errors, same as before).
- [ ] After the next deployment, check Vercel Usage → Functions Storage — new deployments should
      add only a few MB of stockfish files per function instead of ~348MB, so the metric should
      stop growing sharply on future deploys.
- [ ] On `/analyze` and `/analyzemaster`: type an out-of-range Depth value in the Stockfish/Game
      Analysis panel, confirm it shows red (error styling) while typing and snaps to the nearest
      bound on blur.
- [ ] On the same pages: after running an analysis, try From move/To move — confirm typing a From
      move greater than the current To move bumps To move up to match, and that typing a From/To
      move below 1 or above the game's total moves clamps correctly on blur.
- [ ] On `/analyze`'s or `/analyzemaster`'s Chess.com Games panel: type a Min rating and a Year,
      confirm the search filter still works and returns results.
- [ ] On Owner → Pipeline Games: change Depth and Batch to values outside their bounds (e.g. Depth
      3 or 30, Batch 0 or 2000), confirm they clamp to the nearest bound on blur, and that running
      a pipeline step uses the corrected value.
