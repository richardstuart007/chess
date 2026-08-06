# PLAN_docs-plans-folder — chess

## Title
Move active PLAN file into docs/plans/ folder structure

## Plan
- [x] Create `docs/plans/` folder (parallel to existing `docs/archive/`)
- [x] Move `docs/PLAN_session-storage-tab.md` → `docs/plans/PLAN_session-storage-tab.md`
      (preserve content unchanged, just relocate the file)

## Changes

### docs/plans/ (new folder)
- Created, parallel to existing `docs/archive/`.

### docs/PLAN_session-storage-tab.md → docs/plans/PLAN_session-storage-tab.md
- Moved (content unchanged) so the project's active plan follows the standard
  `docs/plans/PLAN_<slug>.md` location.

## Testing
- [ ] Confirmed via file move only — no application code touched, no `npx tsc --noEmit` /
      `npm run build` needed.
- [ ] Next `#plan` in this project confirms new plans still land in `docs/plans/`.
