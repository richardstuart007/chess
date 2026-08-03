# Restore active tab/filter on back-nav into PositionDetail

## Plan
- [x] Reinstall `nextjs-shared` in chess to pick up `saveBackNav(key, path?)` and the
      `useTabQueryState` Suspense-boundary doc update (published as nextjs-shared v2.1.48):
      delete `node_modules`, `package-lock.json`, `.next`, run `npm install`, then
      `npx tsc --noEmit` and `npm run build` to confirm the new version is actually in place.
- [x] Add `ANALYZE_BACK_KEY` to `src/lib/constants.ts` — the shared sessionStorage key used by
      every save/read site below, so it can't drift between files.
- [x] `src/ui/analysis/PositionDetail.tsx` — replace the `tab`/`selectedMove` `useState` pair
      with `useTabQueryState('tab', 'moves')` and `useTabQueryState('move', '')` (empty string
      standing in for "no filter" instead of `null`); replace the hand-rolled `from=`
      query-string construction on the game-row click with `saveBackNav(ANALYZE_BACK_KEY)` (no
      `from=` in the pushed URL).
- [x] `src/ui/HomeDashboard.tsx` — replace its `from=` construction with
      `saveBackNav(ANALYZE_BACK_KEY)`.
- [x] `src/app/openings/page.tsx` — same replacement.
- [x] `src/ui/board/ChessBoardView.tsx` — its chained game-to-game jump uses
      `saveBackNav(ANALYZE_BACK_KEY, backPath)` (the new explicit-path form) to forward the
      original back-target instead of re-deriving from the current `/analyze` URL.
- [x] `src/app/analyze/page.tsx` — swap `searchParams.get('from')` for
      `useBackNav(ANALYZE_BACK_KEY)`; retire the `from` param entirely.
- [x] Type-check (`npx tsc --noEmit`) and build (`npm run build`) chess.
- [x] Rename the back-nav constant to follow a project-name-suffix convention: identifier
      `ANALYZE_BACK_KEY` → `BACK_KEY_CHESS`, string value `'chess-analyze-back'` →
      `'back-key-chess'`. Updated in `constants.ts` and all 5 call sites; re-ran
      `npx tsc --noEmit` and `npm run build`, both clean.
- [x] Refined the convention further: the identifier itself should be the same across every
      project (`BACK_KEY`, no per-project suffix), with only the sessionStorage string value
      carrying the project-name suffix (`'back_key_chess'`). Renamed `BACK_KEY_CHESS` → `BACK_KEY`
      and value `'back-key-chess'` → `'back_key_chess'` in `constants.ts` and all 5 call sites;
      re-ran `npx tsc --noEmit` and `npm run build`, both clean.
- [ ] Manually test in a running dev server: from `PositionDetail`, switch to "Game History",
      select a move filter, click a game row, then click Back — confirm it lands back on
      "Game History" with the same move filter still applied (not the default "Your Moves" tab).
      Also verify the other three back-nav flows (Home → Analyze → Back, Openings → Analyze →
      Back, and the chained game-to-game jump inside ChessBoardView → Back) still return to the
      correct originating page.

## Changes
### src/lib/constants.ts
- Added the shared sessionStorage key for all back-nav save/read sites below:
  `BACK_KEY = 'back_key_chess'`. Identifier is the same name every project would use; the string
  value carries the project-name suffix. (Went through two intermediate names first —
  `ANALYZE_BACK_KEY = 'chess-analyze-back'`, then `BACK_KEY_CHESS = 'back-key-chess'` — before
  landing on this convention per explicit request.)

### src/ui/analysis/PositionDetail.tsx
- Replaced local `useState` for `tab`/`selectedMove` with `useTabQueryState('tab', 'moves')` /
  `useTabQueryState('move', '')`, putting both into the URL so a path+search snapshot can
  actually capture them. `selectedMove`'s "no filter" sentinel changed from `null` to `''`.
  Game-row click now calls `saveBackNav(BACK_KEY)` before navigating, instead of hand-building a
  `from=` param with a hardcoded path (which never included tab/filter state).

### src/ui/HomeDashboard.tsx, src/app/openings/page.tsx
- Replaced hand-rolled `from=` query param construction with `saveBackNav(BACK_KEY)`. Note: this
  is now an exact-URL snapshot (matches `saveBackNav`'s documented behavior) rather than the
  previous hardcoded `/` or `/openings` — e.g. Home's own `?highlight=` query string, if present,
  is now preserved on the way back too, where before it was silently dropped.

### src/ui/board/ChessBoardView.tsx
- Chained game-to-game jump now calls `saveBackNav(BACK_KEY, backPath)`, forwarding the
  already-known original back-target explicitly (via the new optional `path` param) instead of
  re-deriving it from the current `/analyze` URL, which no longer carries `from=`.

### src/app/analyze/page.tsx
- Reads the back-target via `useBackNav(BACK_KEY)` instead of `searchParams.get('from')`. The
  `from` URL param is retired entirely.

## Testing
- [ ] Run `npm run locallocal` (port 4050), open `/position/[id]` for any position with games,
      switch to the "Game History" tab, select a move to filter by, click a game row to open
      `/analyze`, then click "← Back" — confirm it returns to `/position/[id]` still on the
      "Game History" tab with the same move filter applied (not the default "Your Moves" tab).
- [ ] From `/` (Home), click a game to open `/analyze`, click Back — confirm it returns to `/`.
- [ ] From `/openings`, click a game to open `/analyze`, click Back — confirm it returns to
      `/openings`.
- [ ] From `/analyze`, use the in-page "Games" panel to jump to a different game (the chained
      navigation in `ChessBoardView.tsx`), then click Back on that second game's analyze view —
      confirm it returns to the *original* page you started from (position/home/openings), not
      to the first game's analyze view.
