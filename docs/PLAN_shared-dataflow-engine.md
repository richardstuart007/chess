# PLAN_shared-dataflow-engine — chess

## Title
Swap chess's local markdown-lite/Dataflow engine for the shared nextjs-shared versions

## Plan
- [x] `src/app/owner/dataflow/page.tsx` — import `parseMarkdownLite`/`buildSectionTree` from
  `nextjs-shared/parseMarkdownLite` and `MarkdownLiteView` from `nextjs-shared/MarkdownLiteView`
  instead of the local `@/src/lib/parseMarkdownLite` / `@/src/ui/MarkdownLiteView`. No other change
  to this file — it keeps reading chess's own `docs/Dataflow.md` exactly as before.
- [x] Delete `src/lib/parseMarkdownLite.ts` (now dead — chess's copy is functionally identical to
  nextjs-shared's, confirmed by direct diff; only a comment wording difference).
- [x] Delete `src/ui/MarkdownLiteView.tsx` (now dead).
- [x] Type-check and build.

## Design decision (agreed before this plan was written)
Chess's local `MarkdownLiteView.tsx` renders its tab bar via chess's own `AppTab` wrapper
(`px-4 py-2`, active color `text-blue-600`); nextjs-shared's shared `MarkdownLiteView.tsx`
hardcodes plain `MyTab` with its own defaults (`px-3 py-1.5`, active color `text-blue-700`).
Swapping to the shared component **visibly changes `/owner/dataflow`'s tab styling** — slightly
smaller padding, slightly different blue. This was raised explicitly; the user chose to accept the
shared component's own styling as-is rather than first amending nextjs-shared to expose tab-class
override props. `AppTab.tsx` itself is untouched and keeps being used by chess's other tab bars
(`ConstantsViewer.tsx`, `PositionDetail.tsx`) — only the Dataflow page's tab bar changes look.

`parseMarkdownLite.ts` needed no such call: chess's copy and nextjs-shared's are functionally
identical (diffed directly), differing only in a comment's wording (chess's says "used in
docs/Dataflow.md", the shared version's says "used in a Dataflow.md-style doc") — a pure doc-string
generalization, no logic change.

## Changes

All 3 steps were made exactly as drafted above. No other reference to the deleted local files
remained anywhere else in `src/` (verified by grep before deleting). Verified: `npx tsc --noEmit`
and `npm run build` both pass cleanly.


### src/app/owner/dataflow/page.tsx
Before:
```tsx
import { parseMarkdownLite, buildSectionTree } from '@/src/lib/parseMarkdownLite'
import MarkdownLiteView from '@/src/ui/MarkdownLiteView'
```
After:
```tsx
import { parseMarkdownLite, buildSectionTree } from 'nextjs-shared/parseMarkdownLite'
import MarkdownLiteView from 'nextjs-shared/MarkdownLiteView'
```
Everything else in the file (reading `docs/Dataflow.md`, building the tree, rendering) is unchanged.

### src/lib/parseMarkdownLite.ts
Deleted — superseded by `nextjs-shared/parseMarkdownLite`.

### src/ui/MarkdownLiteView.tsx
Deleted — superseded by `nextjs-shared/MarkdownLiteView`.

## Testing
- [ ] `/owner/dataflow` still renders chess's own Dataflow.md content correctly (headings, tabs, flow diagrams, internal `#id` links) — tab bar styling will look slightly different (shared MyTab defaults instead of AppTab), which is expected and accepted.
- [ ] `npx tsc --noEmit` and `npm run build` pass.
