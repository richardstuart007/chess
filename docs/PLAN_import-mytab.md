# PLAN_import-mytab — chess

## Title
import MyTab. When the shared project has written the MyTab component, then the existing tabs will be converted.

MaintenancePanel: replace dead-import raw select with MySelect (styling preserved via overrideClass).

Delete unused Maintenance route (owner/maintenance page, MaintenancePanel, SyncProgress) and its dead-only functions (fetchPlayer, fetchPlayerStats, upsertPlayer); remove menu entry and dangling references.

## Plan
- [x] Create `src/ui/AppTab.tsx` — project-wide wrapper around `nextjs-shared/MyTab`, overriding
      `underlineActiveClass`/`underlineInactiveClass` to the project's current underline look
      (`px-4 py-2 text-sm font-medium border-b-2 -mb-px` / active `border-blue-600 text-blue-600`,
      inactive `border-transparent text-gray-500 hover:text-gray-700`). Pill variant is left at
      `MyTab`'s own defaults (already an exact match for `ConstantsViewer.tsx`'s pill row).
- [x] Convert `src/ui/analysis/PositionDetail.tsx`'s tab row (Moves/History) to use `AppTab`
      (`variant='underline'`) in place of the hand-rolled `<button>` markup.
- [x] Convert `src/ui/MarkdownLiteView.tsx`'s local `TabBar` helper to render `AppTab`
      (`variant='underline'`) instead of a raw `<button>`.
- [x] Convert `src/ui/owner/ConstantsViewer.tsx`'s two tab rows to `AppTab` — top-level
      Constants/.env row as `variant='underline'`, second-level section-picker row as
      `variant='pill'`.
- [x] Leave `src/ui/AppNav.tsx` unchanged — its items are `next/link` `Link`s for real route
      navigation, not local-state tabs; out of scope for this conversion (explicit decision).
- [x] Run `npx tsc --noEmit` and `npm run build` to verify the conversion.
- [x] In `src/ui/player/MaintenancePanel.tsx` (~lines 128-140), replace the raw `<select>` player
      picker with `MySelect` (already imported, currently unused), passing options as `children`
      (value/label differ, so the `options: string[]` prop doesn't fit):
      ```tsx
      <MySelect value={username} onChange={e => setUsername(e.target.value)}
        overrideClass='h-auto md:h-auto w-auto px-2 rounded border-gray-300 hover:border-gray-300 focus:border-gray-300 text-gray-700'>
        {players.map(p => (
          <option key={p.username} value={p.username}>
            {p.display_name ? `${p.display_name} (${p.username})` : p.username}
          </option>
        ))}
      </MySelect>
      ```
      `overrideClass` reproduces the current raw-select look exactly (agreed: keep current look,
      not MySelect's default blue/rounded-md/w-72 styling) — `h-auto`/`md:h-auto` cancel both of
      MySelect's responsive height defaults (`h-6 md:h-8`), `w-auto` cancels the fixed `w-72`,
      `border-gray-300`/`hover:border-gray-300`/`focus:border-gray-300` cancel the default blue
      border in all three states, `rounded` replaces `rounded-md`, `px-2` replaces the default's
      `px-1` (its `md:px-2` already matches), `text-gray-700` adds the text color the default
      doesn't set.
- [x] Run `npx tsc --noEmit` and `npm run build` to verify.
- [x] Delete `src/app/owner/maintenance/` (the whole route folder).
- [x] Delete `src/ui/player/MaintenancePanel.tsx`.
- [x] Delete `src/ui/player/SyncProgress.tsx` (its only consumer was `MaintenancePanel`).
- [x] In `src/lib/chesscom.ts`, remove `fetchPlayer`, `fetchPlayerStats`, and the
      `ChessComPlayer`/`ChessComRatings` interfaces — confirmed unused anywhere else.
- [x] In `src/lib/actions/players.ts`, remove `upsertPlayer` — confirmed its only caller was the
      maintenance page.
- [x] In `src/app/owner/page.tsx`, remove the Maintenance entry from the `TOOLS` array.
- [x] In `src/ui/HomeDashboard.tsx`, reword the "No Players" empty state from "No players in the
      database yet. Go to Maintenance to add players." to just "No players in the database yet."
      (drop the dead CTA — Maintenance never actually added players, and there's no other in-app
      add-player flow to point to instead).
- [x] In `src/app/owner/constants/page.tsx`, remove the stale `owner/maintenance/page.tsx` /
      `MaintenancePanel.tsx` entries from the `consumers` lists for `INCLUDED_TIME_CLASSES`,
      `DEFAULT_PLAYER`, and `PLAYER_TIME_CLASSES`.
- [x] Run `npx tsc --noEmit` and `npm run build` to verify.

## Changes

### src/ui/AppTab.tsx
- New project-wide wrapper around `nextjs-shared/MyTab`. Overrides the underline variant's
  active/inactive classes to match this project's pre-existing tab look (`px-4 py-2 ...
  text-blue-600`); pill variant left at `MyTab`'s own defaults.

### src/ui/analysis/PositionDetail.tsx
- Tab row (Moves/History) now renders `AppTab` instead of a hand-rolled `<button>` with inline
  active/inactive class logic.

### src/ui/MarkdownLiteView.tsx
- Local `TabBar` helper now renders `AppTab` (with `overrideClass='whitespace-nowrap'` to keep
  the no-wrap behavior) instead of a raw `<button>`. Also corrected the header comment's stale
  reference to a nonexistent `src/ui/TabBar.tsx` file — now points at `src/ui/AppTab.tsx`.

### src/ui/owner/ConstantsViewer.tsx
- Top-level Constants/.env tab row and the second-level section-picker row both now render
  `AppTab` (`variant='underline'` and `variant='pill'` respectively) instead of hand-rolled
  `<button>`s. The top-level row's appearance now matches the rest of the app's underline tabs
  (`px-4/py-2/text-blue-600`) rather than its previous slightly different styling
  (`px-3/py-1.5/text-blue-700`), as a result of unifying on the shared `AppTab` wrapper.

### src/ui/AppNav.tsx
- No change — confirmed out of scope (route-navigation `Link`s, not local-state tabs).

### src/ui/player/MaintenancePanel.tsx
- Player picker in section 1 (Player Statistics) now renders `MySelect` (already imported but
  previously unused) instead of a raw `<select>`, passing options as `children` since the option
  value (`p.username`) differs from its displayed label. `overrideClass` reproduces the exact
  prior look (rounded border-gray-300, auto width/height, text-gray-700) rather than adopting
  `MySelect`'s default blue/rounded-md/w-72 styling — explicit choice confirmed with the user.

### src/app/owner/maintenance/, src/ui/player/MaintenancePanel.tsx, src/ui/player/SyncProgress.tsx
- Deleted. Route, panel, and progress component were confirmed unused elsewhere — the panel
  never actually added new players (its dropdown only ever listed existing players), so there was
  no in-app add-player flow being lost.

### src/lib/chesscom.ts
- Removed `fetchPlayer`, `fetchPlayerStats`, and the `ChessComPlayer`/`ChessComRatings`
  interfaces — confirmed their only caller was the deleted maintenance page. Cron sync's own
  rating update (`updatePlayerRating` in `players.ts`) computes ratings from already-downloaded
  games in the DB, not from these chess.com live-stats calls, so it's unaffected.

### src/lib/actions/players.ts
- Removed `upsertPlayer` (only caller was the deleted maintenance page) and the now-unused
  `table_write` import it required.

### src/app/owner/page.tsx
- Removed the Maintenance card from the `TOOLS` array.

### src/ui/HomeDashboard.tsx
- "No Players" empty state no longer links to `/owner/maintenance` — reworded to plain "No
  players in the database yet." since there's no remaining in-app add-player flow to point to.

### src/app/owner/constants/page.tsx
- Removed stale `owner/maintenance/page.tsx` / `MaintenancePanel.tsx` entries from the
  `consumers` lists for `INCLUDED_TIME_CLASSES`, `DEFAULT_PLAYER`, and `PLAYER_TIME_CLASSES`.

## Testing
- [x] Confirm the tab rows on `/analyze` (Position Detail Moves/History), the Markdown-lite view,
      and `/owner/constants` (both tab rows) still look and behave as before after the `AppTab` conversion
- [x] Confirm `/owner/maintenance` now 404s (route deleted) and the Maintenance card is gone from `/owner`
- [x] Confirm the home page's "No Players" empty state (if reachable) no longer references Maintenance
- [x] Confirm `/owner/constants` no longer lists any Maintenance-related consumers for
      `INCLUDED_TIME_CLASSES`, `DEFAULT_PLAYER`, `PLAYER_TIME_CLASSES`
- [x] Confirm Cron Sync (`/owner/pipeline` or `/api/cron/sync`) and general game sync still work
      normally (verifies `upsertPlayerRating`/`initSync`/`syncArchive`/`markPlayerSynced` weren't
      broken by the cleanup)
