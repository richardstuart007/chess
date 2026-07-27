# PLAN_dataflow-to-jsx — chess

## Title
Convert /owner/dataflow documentation and diagram to plain TSX (React Flow)

## Plan
- [x] Add `@xyflow/react` as a package dependency (npm install — requires approval per the
      install-approval rule when `#code` runs, since it introduces a new package)
- [x] Create `src/ui/dataflow/sections.tsx` exporting `SECTIONS: DataflowSection[]`, one function
      component per doc section (12 total, matching `docs/Dataflow.md`'s `##` headers): chess.com
      API, `tpl_players`, `tgr_gamesraw`, `tgd_gamesdecon`, `tgam_game_positions`,
      `bulkUpdateCpLoss`, `tpos_positions`, Purge, `teva_evaluations`, `thab_habits`, Evaluate Game
      Endings, Deepen Popular Positions — hand-transcoding each section's Purpose / Input /
      Processing (Summary + Details) / Output / Consumers / Rules-gotchas content verbatim into
      JSX, using the same `H4`/`H5`/`P`/`UL`/`OL`/`Code` style-helper pattern as next-bridge's
      `src/ui/dataflow/sections.tsx`
- [x] Create `src/ui/dataflow/PipelineDiagram.tsx` — React Flow (`@xyflow/react`) diagram
      reproducing the current `flow` block's topology: 18 nodes (chess.com API, `tpl_players`,
      Game Sync, `tgr_gamesraw`, Deconstruct Games, `tgd_gamesdecon`, Build Game Positions,
      `tgam_game_positions`, `bulkUpdateCpLoss`, Sync Position Tree, `tpos_positions`, Purge,
      Evaluate Positions, `teva_evaluations`, Build Habits, `thab_habits`, Evaluate Game Endings,
      Deepen Popular Positions) and 21 edges — including Purge's 3 outbound edges (into
      `tgam_game_positions`, `tpos_positions`, `teva_evaluations`), `bulkUpdateCpLoss`'s edge into
      `tgam_game_positions`, Evaluate Game Endings' loop-back edge into `tgd_gamesdecon`, and
      Deepen Popular Positions' two-way relationship with `teva_evaluations` (reads it and writes
      back to it) plus its edge into `tgam_game_positions`
- [x] Create `src/ui/dataflow/DataflowTabs.tsx` — client component with a plain `MyTab` bar
      (`nextjs-shared/MyTab`, same as today) — a "Diagram" tab plus one tab per `SECTIONS` entry —
      same structure as next-bridge's `DataflowTabs.tsx`
- [x] Update `src/app/owner/dataflow/page.tsx` to render `<DataflowTabs />`, removing the
      `readFile`/`parseMarkdownLite`/`buildSectionTree`/`MarkdownLiteView` approach entirely
- [x] Delete `docs/Dataflow.md`
- [x] Confirm no other file in this project still imports `parseMarkdownLite`, `buildSectionTree`,
      or `MarkdownLiteView` from `nextjs-shared` (nextjs-shared itself is not modified)

## Changes

### package.json / package-lock.json
- Added `@xyflow/react` (`^12.11.2`) as a dependency — the React Flow diagram library, same
  version next-bridge pins.

### src/ui/dataflow/sections.tsx (new)
- One function component per pipeline table/process (12 total), hand-transcoded from
  `docs/Dataflow.md`, exporting `SECTIONS: DataflowSection[]` consumed by `DataflowTabs`. Same
  `H4`/`H5`/`P`/`UL`/`OL`/`Code` style-helper pattern as next-bridge's `sections.tsx`. Internal
  doc cross-references and external source-file links are rendered as plain `Code` text (no
  hyperlinks), same convention next-bridge used.

### src/ui/dataflow/PipelineDiagram.tsx (new)
- React Flow diagram: 18 nodes / 21 edges reproducing the `flow` markdown block's exact topology
  — the main top-to-bottom pipeline chain (chess.com API + `tpl_players` → Game Sync →
  `tgr_gamesraw` → … → `thab_habits`) plus four side/loop-back processes (Purge feeding 3 tables;
  `bulkUpdateCpLoss` feeding `tgam_game_positions`; Evaluate Game Endings looping back into
  `tgd_gamesdecon`; Deepen Popular Positions' two-way edge with `teva_evaluations` plus its edge
  into `tgam_game_positions`).

### src/ui/dataflow/DataflowTabs.tsx (new)
- Plain `MyTab` bar (Diagram + one tab per `SECTIONS` entry), same structure as next-bridge's
  `DataflowTabs.tsx`.

### src/app/owner/dataflow/page.tsx
- Replaced the `readFile`/`parseMarkdownLite`/`buildSectionTree`/`MarkdownLiteView` approach with
  `<DataflowTabs />`. No longer imports anything from `nextjs-shared` for this page.

### src/app/owner/page.tsx
- Updated the Dataflow tool card's description, which referenced `docs/Dataflow.md` by name — that
  file no longer exists.

### docs/Dataflow.md
- Deleted — fully superseded by `src/ui/dataflow/sections.tsx` + `PipelineDiagram.tsx`.

## Testing
- [ ] Open /owner/dataflow and confirm the "Diagram" tab renders the full pipeline graph — main
      chain top to bottom, plus Purge/bulkUpdateCpLoss/Evaluate Game Endings/Deepen Popular
      Positions boxes and their connecting arrows, with no visual overlap
- [ ] Click through every section tab (tpl_players, chess.com API, tgr_gamesraw, tgd_gamesdecon,
      tgam_game_positions, tpos_positions, Purge, teva_evaluations, bulkUpdateCpLoss,
      thab_habits, Evaluate Game Endings, Deepen Popular Positions) and confirm each renders its
      Purpose/Input/Processing/Output/Consumers/Rules-gotchas content correctly, matching the old
      markdown page's content
- [ ] Confirm /owner page's Dataflow tool card still links correctly and its description no longer
      mentions the deleted docs/Dataflow.md file
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass clean
