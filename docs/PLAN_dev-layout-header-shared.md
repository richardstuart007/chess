# PLAN_dev-layout-header-shared — chess

## Title
Reinstall to pick up nextjs-shared@2.1.37 and switch to shared DevLayoutHeader

## Plan
- [x] User runs:
  Remove-Item -Recurse -Force node_modules
- [x] User runs:
  Remove-Item -Force package-lock.json
- [x] User runs:
  npm install
- [x] User runs:
  Remove-Item -Recurse -Force .next
- [x] User runs:
  npx tsc --noEmit
- [x] In src/app/layout.tsx, replace the local DevHeader import with `import { DevLayoutHeader } from 'nextjs-shared/DevLayoutHeader'`
- [x] In src/app/layout.tsx, change `<DevHeader dbLocation={DB_LOCATION} />` to `<DevLayoutHeader dbLocation={DB_LOCATION} />`, leaving the existing `{IS_DEV && ...}` / `{NEXT_PUBLIC_APPENV_ISDEV && ...}` wrapper as-is and not passing `extraLinks`
- [x] Delete the now-unused local DevHeader.tsx
- [x] User runs:
  npx tsc --noEmit
- [x] User runs:
  npm run build

## Changes

### package.json / package-lock.json
- Reinstalled dependencies from scratch (removed `node_modules`, `package-lock.json`, `.next`, ran `npm install`) to pick up `nextjs-shared@2.1.37`, confirmed via `node_modules/nextjs-shared/package.json`.

### src/app/layout.tsx
- Replaced the local `DevHeader` import/usage with the shared `DevLayoutHeader` from `nextjs-shared/DevLayoutHeader`. Kept the existing `{IS_DEV && ...}` wrapper as-is; `DevLayoutHeader` self-gates on `NEXT_PUBLIC_APPENV_ISDEV` internally too, which is a harmless double-guard. Did not pass `extraLinks` (defaults to `[]`, matching prior behavior of no extra nav links).

### src/ui/DevHeader.tsx
- Deleted — superseded by the shared `nextjs-shared/DevLayoutHeader`, which has equivalent markup and `sessionStorage.setItem('ownerFrom', pathname)` logic. Confirmed no other references to `DevHeader` remain in `src/`.

## Testing
- [ ] Open any page in dev mode (e.g. `/` or `/owner`) with `NEXT_PUBLIC_APPENV_ISDEV=true` and confirm the dev header still appears at the top, showing the "Owner" link and the DB location badge, matching its prior appearance (no extra nav links)
- [ ] Click the "Owner" link from a non-`/owner` page and confirm it still navigates to `/owner` and that the "back" link on `/owner` still returns to the page you came from (`sessionStorage` `ownerFrom` behavior unchanged)
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both passed cleanly after the reinstall and code change
