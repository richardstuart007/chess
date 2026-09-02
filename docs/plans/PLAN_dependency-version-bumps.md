# PLAN_dependency-version-bumps — chess

## Title
Dependency version bumps + .npmrc + #reinstall

## Plan
- [x] User edited `package.json` — bumped dependency/devDependency versions and pinned several previously-caret (`^`) ranges to exact versions
- [x] User added `.npmrc` — `save-exact=false`, `legacy-peer-deps=true`
- [x] Run #reinstall — remove `node_modules` / `package-lock.json` / `.next`, `npm install --legacy-peer-deps`, force fresh `nextjs-shared` git-ref resolution, `npx tsc --noEmit`, `npm run build`

## Changes

### package.json (edited by user before this session)
dependencies:
- `@xyflow/react` `^12.11.2` → `12.11.6`
- `cheerio` `^1.2.0` → `1.2.0`
- `pg` `8.21.0` → `8.23.0`
- `react` `19.2.7` → `19.2.8`
- `react-chessboard` `5.10.0` → `5.12.1`
- `react-dom` `19.2.7` → `19.2.8`
- `react-is` `19.2.7` → `19.2.8`
- `recharts` `3.8.1` → `3.10.1`
- `sax` `^1.6.1` → `1.6.1`
- `yauzl` `^3.4.0` → `3.4.0`
- `zod` `4.4.3` → `4.5.4`

devDependencies:
- `@tailwindcss/postcss` `4.3.1` → `4.3.3`
- `@types/pg` `8.20.0` → `8.23.1`
- `@types/react` `19.2.17` → `19.2.18`
- `@types/react-dom` `19.2.3` → `19.2.5`
- `@types/sax` `^1.2.7` → `1.2.7`
- `@types/yauzl` `^3.4.0` → `3.4.0`
- `tailwindcss` `4.3.1` → `4.3.3`
- `tsx` `4.22.4` → `4.23.13`

### .npmrc (new, added by user before this session)
```
save-exact=false
legacy-peer-deps=true
```

### #reinstall (run this session)
- `node_modules`, `package-lock.json`, `.next` removed; `npm install --legacy-peer-deps` — 159 packages added
- `nextjs-shared` fresh git-ref resolution — version 2.1.84 (commit f4f1fafe); `package.json` spec untouched
- `npx tsc --noEmit` — passed
- `npm run build` — passed (39 routes, Next.js 16.2.9)
- `package-lock.json` regenerated to match

## Testing
- [ ] Start the dev server and load `/` — confirm the app boots with no console errors
- [ ] Open `/graph` (recharts) — confirm charts render
- [ ] Open `/analyze` and `/analyzemaster` (react-chessboard) — confirm the board renders and pieces drag
- [ ] Open `/owner/dataflow` (@xyflow/react) — confirm the flow diagram renders
