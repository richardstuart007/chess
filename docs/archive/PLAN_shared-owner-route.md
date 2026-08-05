# PLAN_shared-owner-route — chess

## Title
Implement shared owner route

## Plan
- [x] Reinstall `nextjs-shared` (currently `2.1.51`; next-bridge is on `2.1.57` with the same
      `OwnerPage`/`OwnerLayout` API) to pick up the latest version before wiring up `OwnerPage`.
      User runs:
      npm install --legacy-peer-deps
- [x] `src/app/owner/page.tsx`: replace the hand-rolled `TOOLS` Link-card list with
      `nextjs-shared/OwnerPage`, mirroring next-bridge's pattern:
      - Tabs, in this order: **Logging** (`<OwnerTableLogging />`), **Cache**
        (`<OwnerTableCache />`), **Tools** (a small link-card list — reusing the existing card
        style — pointing at `/owner/pipeline` and `/owner/pipelinelog`, replacing their two entries
        in the old list), **Dataflow** (`<div className='p-6 md:p-8'><DataflowTabs /></div>`),
        **Constants** (`<ConstantsPage />`).
      - Pass `persistKey='chess-owner-tab'` so the active tab persists across navigation via
        sessionStorage, matching this app's existing persistence convention (habits page, Game
        List rows-per-page).
      - `owner/pipeline` and `owner/pipelinelog` remain their own standalone routes (not folded
        into tabs) — same treatment next-bridge gives its own large pages (`pipeline`, `builddata`,
        `players`).
      - `owner/cache`, `owner/logging`, `owner/dataflow`, `owner/constants` remain as standalone
        routes too (unchanged page content), reachable both directly by URL and via the new tabs —
        matches next-bridge, which keeps sub-routes alongside the tabbed hub rather than removing
        them.
- [x] Delete `src/app/owner/cache/layout.tsx` (the custom full-bleed `w-screen -translate-x-1/2`
      wrapper) — not part of the shared pattern, and redundant now that Cache also renders as a
      normal-width `OwnerPage` tab. `src/app/owner/cache/page.tsx` itself is unaffected.
- [x] `src/app/owner/layout.tsx` — no change; already uses `nextjs-shared/OwnerLayout`.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### package.json / package-lock.json
- Ran `npm install --legacy-peer-deps` (no-op — lockfile already pinned the git commit) then
  `npm update nextjs-shared --legacy-peer-deps` to force re-resolution of the `github:` dependency
  to its current HEAD. `nextjs-shared` bumped `2.1.51` → `2.1.59`. `package.json`'s dependency spec
  (bare `github:richardstuart007/nextjs-shared`, no version rewrite) confirmed unchanged.

### src/app/owner/page.tsx
- Replaced the hand-rolled `TOOLS` Link-card list with `nextjs-shared/OwnerPage`. Tabs: Logging
  (`OwnerTableLogging`), Cache (`OwnerTableCache`), Tools (new local `ToolsPanel` — the same
  link-card style as before, now holding only the Pipeline and Pipeline Log entries), Dataflow
  (`DataflowTabs`), Constants (imports the default export straight from `./constants/page`).
  `persistKey='chess-owner-tab'` persists the active tab in sessionStorage across navigation.
  Default export renamed `Page` (was `OwnerPage`) to avoid colliding with the imported
  `nextjs-shared/OwnerPage` component.

### src/app/owner/cache/layout.tsx
- Deleted — the custom full-bleed (`w-screen -translate-x-1/2`) wrapper isn't part of the shared
  pattern and is redundant now that Cache also renders as a normal-width `OwnerPage` tab.
  `src/app/owner/cache/page.tsx` itself is unchanged and still works as a standalone route.

### .next/
- Deleted stale generated route-type validators (`.next/types/validator.ts`,
  `.next/dev/types/validator.ts`) that still referenced the removed `cache/layout.tsx` and caused
  `npx tsc --noEmit` to fail with a stale module-resolution error; a clean rebuild regenerated them
  correctly. Build artifact only, no source change.

## Testing
- [ ] User runs:
      npm run dev
- [ ] Open `/owner` — confirm the new tab bar (Logging / Cache / Tools / Dataflow / Constants)
      renders instead of the old link-card list, and each tab's content matches what its old
      standalone page showed.
- [ ] Switch tabs a few times, then navigate away (e.g. to `/`) and back to `/owner` — confirm the
      previously-active tab is still selected (sessionStorage persistence via `persistKey`).
- [ ] Tools tab: click through to both `/owner/pipeline` and `/owner/pipelinelog` and confirm they
      still work exactly as before (unchanged pages).
- [ ] Directly visit `/owner/cache`, `/owner/logging`, `/owner/dataflow`, `/owner/constants` by URL
      — confirm each standalone route still renders correctly, and that `/owner/cache` in
      particular looks right now that its custom full-bleed layout wrapper was removed (should sit
      at normal `OwnerLayout` width, same as the other sub-routes).
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly.
