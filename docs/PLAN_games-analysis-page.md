# PLAN_games-analysis-page — chess

## Title
Dataflow

## Plan
- [x] Add a small local markdown-lite parser (headings, `**bold**`, `` `code` `` spans, numbered/bulleted lists, links) — no new dependency
- [x] New server component page at `src/app/owner/dataflow/page.tsx` — reads `docs/Dataflow.md` from disk, parses it with the new lite-parser, renders it with the typographic treatment already validated in the artifact preview (styled headings, monospace table/column names, section labels)
- [x] Add an entry to `/owner`'s `TOOLS` array (`src/app/owner/page.tsx`) linking to `/owner/dataflow`, matching the existing Pipeline/Logging/etc. entries
- [x] Restructure `docs/Dataflow.md`'s tgam section to use real heading levels (`###` for Purpose/Input/Processing/Output/Consumers/Notable columns/Lifecycle/Rules-gotchas, `####` for Summary/Details nested under Processing) instead of flat bold-paragraph labels; add the five remaining headings as pending placeholders
- [x] Add a section-tree builder that groups `parseMarkdownLite`'s flat block list into nested sections by heading level
- [x] New `'use client'` collapsible-section component: clickable header (chevron + label) per section, indented per nesting depth, expanded by default
- [x] Wire the collapsible section tree into `MarkdownLiteView` in place of the current flat renderer
- [x] Support explicit heading anchors (`{#id}` suffix) in the parser, auto-slug fallback if absent; render as the section wrapper's `id` so table names can be linked to
- [x] Add a `flow` fenced-block type (`` ```flow ``) — each line is a node or a `↓ label` arrow — rendered as a bordered diagram panel with boxed nodes and connector arrows
- [x] Rewrite the Pipeline overview diagram using `flow`, with each table name a clickable link to its section anchor
- [x] Draft `tgr_gamesraw` end to end using the tgam template, verified against `sync.ts`/`games.ts`/`schema.sql`
- [x] Fix the flow diagram: only real tables get boxes (purge/cp-change steps folded into arrow labels); add `up` direction so the final `bulkUpdateCpLoss` step visually and semantically points back to `tgam_game_positions` instead of implying a new forward destination
- [x] Draw a real curved SVG line from the `bulkUpdateCpLoss` step back to the `tgam_game_positions` box, measured from actual rendered positions (not a hand-guessed path)
- [x] Remove process/function names from the diagram entirely (they belong in each table's Processing section, not the overview); curve source changed from the arrow's own row to the actual `teva_evaluations` table box above it
- [x] Remove all remaining label text from the diagram's arrows/back-reference (purge note, write-back note); attach the back-reference directly to `teva_evaluations` via a new node-level `{loop:target}` tag so no trailing arrow row is needed at all — the curve alone carries the meaning
- [x] Add `tpl_players` to the diagram before `chess.com API` (the actual read order — resume cutoff is read before the API call); write full `chess.com API` and `tpl_players` sections and renumber the rest of the document's headings to make room
- [x] Convert `tgd_gamesdecon`, `tpos_positions`, Purge, `teva_evaluations`, and `bulkUpdateCpLoss` to the established template (last of the old-format sections)
- [x] Restructure the page from stacked collapsible sections into tabs: Pipeline overview stays persistently visible above a tab bar, one tab per top-level table section, sub-headings within a tab always fully open (no collapse). Internal `#id` links (including from the diagram) now switch to the right tab and scroll, since only the active tab's content is mounted
- [x] Move Pipeline overview into the tab bar too (no more persistent header) — every top-level section, including the diagram, is now a tab
- [x] Strip the leading section numbers ("1.", "2.", "8b.", etc.) from every heading in `docs/Dataflow.md`; replace the `§N` cross-references in `.claude/CLAUDE.md` with named references (table/section name) instead, since numbers no longer exist to point to
- [x] Restyle the tab bar to match the Home page's `TabBar` (`src/ui/TabBar.tsx`) exactly
- [x] Remove the tab bar's horizontal scrollbar (wrap tabs to a second line instead) and left-align the page (drop `mx-auto`)
- [x] Widen the page — dropped the `max-w-3xl` cap, now full width matching `/owner/cache`'s pattern
- [x] Fix inconsistent tab coloring — labels were rendered through the full inline-markdown renderer, so backtick-wrapped table names picked up code-span blue styling regardless of active state; switched to plain text
- [x] Add `side-node` and `edge` support to the flow diagram DSL: Purge and bulkUpdateCpLoss render as dashed side boxes stacked left of the main chain; Purge gets double-headed (bidirectional-arrowhead) connectors to tpos/tgam/teva; bulkUpdateCpLoss sits on the tpos→tgam path via two single-direction edges. Remove the `## Status queries` section
- [x] Redesign the diagram layout per feedback: tables run left-to-right across the page (horizontal chain, single-direction `→` arrows) instead of top-to-bottom; Purge and bulkUpdateCpLoss both sit in one centered column underneath, each with a straight single-direction arrow up to tgam/tpos/teva (6 lines total, replacing the earlier double-headed/through design). Removed the doc's intro paragraph. Parser now accepts `→`/`←` as arrow triggers (not just `↓`/`↑`) so the source glyph matches what's actually rendered
- [x] Unrelated production task logged in this same file per the "one plan at a time" preference: split the two-cron pipeline (`/api/cron/sync` + combined `/api/analysis/cron`) into six separate `vercel.json` cron entries, one per `/owner/pipeline` step, mirroring that page's own manual buttons exactly (including query params: `skipSync=true` on build-tree so it doesn't also run Phase B internally, `limit=200`/`depth=16` matching `DEFAULT_BATCH_SIZE`/the UI default). Scheduled one full hour apart (3:00–8:00 AM) rather than 20 minutes, after confirming this project is on Vercel's Hobby plan — Hobby only guarantees once-daily execution *within* the scheduled hour, not at the precise minute, so same-hour entries could fire out of order or simultaneously; one-hour spacing keeps each step in its own hour bucket regardless of that imprecision. The old combined `/api/analysis/cron` route file is left in place (still manually callable) but no longer scheduled
- [x] Another unrelated task logged in this same file: drop `tpl_players.pl_rating_blitz` (Outstanding item, resolved). Verified first — never written by the one real `upsertPlayer` call site, never read anywhere. User ran `ALTER TABLE tpl_players DROP COLUMN pl_rating_blitz;` manually via pgAdmin4. Repo updated to match: removed from `scripts/schema.sql`'s `CREATE TABLE`, removed from `upsertPlayer`'s type/column-map in `players.ts`, removed the resolved Outstanding item from `.claude/CLAUDE.md`, updated `tpl_players`'s Rules/gotchas in `docs/Dataflow.md` to drop the stale-column framing and note the column's removal

## Changes

### src/lib/parseMarkdownLite.ts (new)
- Small markdown-lite parser: headings (`#`–`######`), paragraphs, ordered/unordered lists,
  horizontal rules, fenced code blocks (for the ASCII pipeline diagram), and inline
  bold/italic/code/link parsing. Covers exactly the constructs used in `docs/Dataflow.md`, not a
  general CommonMark parser. Written with zero project-specific coupling — the user flagged this
  as a likely future candidate for `nextjs-shared` (same category as logging/caching/table
  helpers), so it's kept portable on purpose. Not moved there in this session — project isolation
  means that has to happen from a session opened in `nextjs-shared` itself.

### src/ui/MarkdownLiteView.tsx (new)
- Renders `parseMarkdownLite`'s block/inline tree with Tailwind styling matching the existing
  `/owner` admin palette (blue accent, gray neutrals, `font-mono` for code spans). Also
  project-agnostic beyond that shared palette, for the same future-`nextjs-shared` reason above.

### src/app/owner/dataflow/page.tsx (new)
- Server component: reads `docs/Dataflow.md` from disk (`process.cwd()`-relative), renders it via
  `MarkdownLiteView`.

### src/app/owner/page.tsx
- Added a `Dataflow` entry to the `TOOLS` array, linking to `/owner/dataflow`.

### docs/Dataflow.md
- Restructured the tgam section to real heading levels (`###` for the eight standard headings,
  `####` for Summary/Details nested under Processing) so the renderer can build real hierarchy
  from it. Added Output/Consumers/Notable columns/Lifecycle/Rules-gotchas as pending placeholders.

### src/lib/parseMarkdownLite.ts
- Added `Section`/`SectionTree`/`LeafBlockNode` types and `buildSectionTree()`: groups the flat
  block list into a heading-nested tree (each heading owns everything up to the next
  equal-or-shallower heading). `LeafBlockNode` excludes `heading` from what a section's own
  `content` array can hold, since headings become tree structure, not content.

### src/ui/MarkdownLiteView.tsx
- Rewritten as a `'use client'` component. Headings are no longer rendered as flat blocks —
  `CollapsibleSection` renders each section recursively: a clickable chevron + label header,
  indentation per nesting depth, expanded by default, independent toggle state per section
  instance. Parsing stays server-side (in `page.tsx`); this component only receives the
  already-parsed `SectionTree` and handles interactive rendering.

### src/app/owner/dataflow/page.tsx
- Now calls `parseMarkdownLite` + `buildSectionTree` itself and passes the resulting `tree` prop
  to `MarkdownLiteView`, instead of passing the raw markdown string.

### src/lib/parseMarkdownLite.ts
- Headings can carry an explicit anchor id via a trailing `{#some-id}` suffix (Pandoc-style);
  falls back to an auto-generated slug (`slugify(plainText(...))`) when absent. `Section` now
  carries `id`. Added `plainText()` to flatten inline nodes to raw text for slugifying.
- Added a `flow` block type: a `` ```flow `` fenced block where each line is either a node or an
  arrow (`↓ label`). Parsed via `parseFlowLines()`. Fence parsing now captures an optional
  language tag so `flow` fences are distinguished from plain ` ``` ` code fences.

### src/ui/MarkdownLiteView.tsx
- Section wrapper `div` now renders `id={section.id}` (plus `scroll-mt-4`) so heading anchors are
  real scroll targets.
- Added `renderFlow()`: renders a `flow` block as a bordered panel, each node as its own boxed
  element, each arrow as a small centered `↓` + label.

### docs/Dataflow.md
- Pipeline overview diagram rewritten from a plain fenced ASCII-art code block (inert, no links)
  into a `` ```flow `` block — each table name is now a clickable link to its section anchor, and
  the verbose parenthetical explanations that used to live in the diagram were cut (that detail
  now lives in each table's own Processing section).
- Added `{#id}` anchors to every table/pipeline-stage heading (`tgr_gamesraw`, `tgd_gamesdecon`,
  `tgam_game_positions`, `tpos_positions`, `purge`, `teva_evaluations`, `cp-change-backfill`).
- `tgam_game_positions`: dropped the `Lifecycle` and `Notable columns` headings (user judged them
  unnecessary — their content was mostly redundant with Rules/gotchas and Output). Simplified
  Output to a title-then-detail line (`tpos_positions`, detail below). Restructured Consumers from
  a flat bullet list into individual `####` sub-headings (title-then-detail per consumer, matching
  the rest of the template). Corrected the reach-counting Rules/gotchas bullet after checking the
  actual SQL in `recomputePosReachedByIds` — it's a sum of two separately-deduplicated counts, not
  a true both-directions distinct count, and can double-count a game that reaches a position from
  both sides. User assessed this as a bug (not yet fixed) — logged in `.claude/CLAUDE.md` under a
  new `## Outstanding items` section.
- Drafted `tgr_gamesraw` full end-to-end (Purpose/Input/Processing/Output/Consumers/Rules-gotchas),
  verified against `sync.ts`, `games.ts`, and `schema.sql` rather than reusing the old doc text.
  Found `games.ts`'s `getRecentGames`/`insertRawGame` are dead code (never imported) — the live
  sync path uses `sync.ts`'s own versions; only `getGameCount` (used by the Maintenance page) is
  a real consumer.

### .claude/CLAUDE.md
- Added `## Outstanding items` section: the `pos_reached` double-counting bug found while
  reviewing `tgam_game_positions`'s Rules/gotchas, not yet fixed (fix is a SQL change to
  `recomputePosReachedByIds`, to be provided in chat for manual execution via pgAdmin4 per
  standing convention, not scripted).

### src/lib/parseMarkdownLite.ts
- `FlowStep`'s arrow variant now carries a `direction: 'down' | 'up'`, set from whether the source
  line starts with `↓` or `↑`. Needed because `purgeStaleReachOnePositions`/`bulkUpdateCpLoss`
  aren't new tables — they operate on tables already earlier in the diagram, and the initial
  straight-down-only diagram had no way to show that honestly.

### src/ui/MarkdownLiteView.tsx
- `renderFlow()` renders `↑` arrows with a distinct (blue-tinted) glyph/label color from the
  default `↓`, so a "loops back to an earlier table" step reads differently from a normal forward
  step at a glance.

### docs/Dataflow.md
- Diagram fix: `purgeStaleReachOnePositions` and the final `bulkUpdateCpLoss` step no longer get
  their own boxed "node" (they're operations, not tables) — folded into their arrow labels instead,
  with the purge label still linking to `#purge`. The final `bulkUpdateCpLoss` arrow is now `↑`
  (not `↓`) and its label says explicitly that it writes back to `tgam_game_positions.gam_cp_change`,
  linking there instead of to a standalone destination.
- Flow syntax extended: the `tgam_game_positions` node carries a flow-internal `{#flow-tgam}` id
  (deliberately distinct from the page-anchor `#tgam_game_positions` used for scrolling, to avoid
  conflating "ref key for drawing a curve" with "DOM id for scroll-to"), and the final `↑` arrow
  targets it via `{to:flow-tgam}`.

### src/lib/parseMarkdownLite.ts
- `FlowStep`'s node variant gained an optional `id`; the arrow variant gained an optional `to`.
  Parsed from trailing `{#some-id}` (node) / `{to:some-id}` (arrow) suffixes, mirroring the heading
  anchor syntax already added. These are separate from heading anchor ids — flow ids are never
  rendered as real DOM `id` attributes, just used as `FlowDiagram`'s internal ref lookup keys.

### src/ui/MarkdownLiteView.tsx
- Replaced the plain `renderFlow()` function with a `FlowDiagram` client component (needs hooks,
  so it can no longer be a bare render function). Holds a ref per node with an `id` and a ref per
  arrow step; after mount (and on window resize), measures their actual `getBoundingClientRect()`
  positions and computes a cubic-bezier SVG `<path>` from any `↑`-with-`to` arrow to its target
  node's box, bulging out to the right of the panel with an arrowhead marker at the end. Falls back
  to rendering nothing extra if a referenced node/arrow isn't found (e.g. a bad `to` id) — silent,
  not a thrown error, since a diagram doc shouldn't crash the page over a typo.

### docs/Dataflow.md
- Pipeline overview: removed every backtick-wrapped process/function name from arrow labels
  (`syncArchive`, `deconstructGames`, `buildPositionTree`, `syncTposFromTgam`,
  `enrichPositionsStockfish`) — user judged these irrelevant to the overview, they belong in each
  table's own Processing section, not the diagram. Kept two short non-function-name annotations
  where an arrow would otherwise be uninterpretable on its own: "(purge runs here)", still linked
  to `#purge`, and "writes back to tgam_game_positions.gam_cp_change" on the final `↑` arrow.

### src/ui/MarkdownLiteView.tsx
- Curve source changed: previously measured from the `↑` arrow's own row; now measured from the
  table box immediately preceding it in the step sequence (`teva_evaluations`), via a new
  `nodeIndexRefs` map keyed by step index (populated for every node, not just ones with an
  explicit `{#id}`). The arrow row itself carries no table now that process names are gone, so
  using its position as the curve's start no longer made sense.
- Dropped the now-unused `arrowRefs` map. Arrow labels are only rendered when non-empty (avoids a
  blank line under bare `↓`/`↑` arrows that no longer carry a function name).

### src/lib/parseMarkdownLite.ts
- `FlowStep`'s node variant gained an optional `loopTo`, parsed from a trailing `{loop:target-id}`
  suffix via a new `stripNodeTags()` helper (strips `{#id}` and/or `{loop:id}` in either order, up
  to one of each). A node with `loopTo` set needs no accompanying arrow row at all.

### src/ui/MarkdownLiteView.tsx
- `computeCurves()` now also handles node-level `loopTo`, drawing the curve straight from that
  node's own box (via `nodeIndexRefs`) — extracted the shared bezier-path math into `buildCurve()`
  so the arrow-based and node-based curve sources don't duplicate it.

### docs/Dataflow.md
- Removed the "(purge runs here)" and "writes back to ..." arrow labels entirely (user: no text at
  all on the arrows, the curve alone should carry the meaning) and removed the trailing `↑` arrow
  row under `teva_evaluations` — it had become a disconnected/orphaned glyph once the curve's
  source moved to the table box above it. The back-reference is now `{loop:flow-tgam}` directly on
  the `teva_evaluations` node.
- Added `## 1. chess.com API` (Purpose/Output/Consumers only — Input/Processing don't apply to an
  external system) and `## 2. tpl_players` (full template, verified against `players.ts`,
  `chesscom.ts`, `schema.sql`), inserted before the old `## 1. tgr_gamesraw`. Renumbered every
  section after them (old 1–6b → new 3–8b) so the sequence stays consistent; heading anchor ids
  are separate explicit strings, not derived from the number, so no links broke. Also fixed two
  now-stale `§N` cross-references this renumbering left behind: one inside this same doc (teva's
  Rules/gotchas pointing at Purge, §5→§7) and one in `.claude/CLAUDE.md`'s purge candidate-
  refinement note (§5→§7) — plus the Outstanding items pointer to tgam's Rules/gotchas (§3→§5).
- Found while verifying `tpl_players`: `pl_avatar`/`pl_display_name`/`pl_rating_blitz` are set once
  at player-add time and never refreshed again — no code path calls `upsertPlayer` a second time.
  The rating actually shown on the Home dashboard comes from `tplr_player_ratings` (kept fresh by
  the daily `updatePlayerRating` cron step), not from this stale `pl_rating_blitz` column. Logged
  as a Rules/gotchas note, not treated as a bug (no evidence it causes an actual problem today).
- Diagram: added `tpl_players` and `chess.com API` as the first two boxes, both now linked to their
  new sections — reflects that `initSync` reads the sync cutoff from `tpl_players` before it ever
  calls the chess.com API.

### .claude/CLAUDE.md
- Fixed the two `§N` references made stale by the Dataflow.md renumbering above (§5→§7 in the
  purge candidate-refinement note, §3→§5 in the Outstanding items `pos_reached` bug pointer).
- Swapped section order so `tpl_players` is `## 1` and `chess.com API` is `## 2` (matches the
  diagram's read order — resume cutoff is read before the API call). Fixed the resulting stale
  `§2`→`§1` reference to the `pl_rating_blitz` Outstanding item.
- Added a second Outstanding item: `pl_avatar` stores chess.com's own hosted URL, never a local
  copy — flagged as a future "store the image ourselves" task, not implemented.
- Rewrote `tgr_gamesraw`'s heading to drop the leftover "— from chess.com" suffix (title/detail
  mixing, same principle as the Processing/Consumers work) and converted its Details/Consumers to
  the terser style established afterward (no function names in Details unless genuinely
  non-obvious; each Consumer gets a short title + one line).
- Converted `tgd_gamesdecon` to the template. Corrected a stale fact from the old doc text along
  the way: games are skipped at 6-or-fewer half-moves (`MIN_TRACKABLE_HALF_MOVES`), not literally
  `countMoves(pgn) === 0` as previously documented. Also noted `deconstructGames` writes a second
  table, `tec_ecoreference`, as a side effect (currently write-only, nothing reads it back).
- Converted `tpos_positions` to the template, verified against `syncTposFromTgam`,
  `recomputePosReachedByIds`, `purgePositions.ts`, `enrichPositionsStockfish.ts`, `chessdb.ts`.
  Found `chessdb.ts`'s `upsertPosition` (an alternate direct write path into `tpos_positions`) is
  dead code — never called; the only live write path is `syncTposFromTgam`. Also found a second,
  browser-run evaluation path (`EvalProgress.tsx`) alongside the server batch pipeline, both
  reading `tpos_positions`.
- Converted `teva_evaluations` and `bulkUpdateCpLoss` to the template, verified against
  `enrichPositionsStockfish.ts` and `chessdb.ts`. Found `getEvaluationForPosition` (`chessdb.ts`)
  is dead code — never called. Corrected another stale claim: the `/owner/pipeline` UI help text
  says evaluations store a search depth, but `teva_evaluations` has no depth column at all.
- Converted Purge (section 7) to the template — last old-format section. Per instruction, dropped
  the Claude-process note ("Deliberate exception to the standing 'no destructive SQL in
  automation' rule...") since that's governance metadata for Claude, not app-behavior documentation
  a reader of this doc needs; that record already lives in `.claude/CLAUDE.md` where it belongs.
- Every table/pipeline-stage section in the document is now in the new template. Only
  `## Status queries` at the end is still in its original form (not yet requested).

### src/ui/MarkdownLiteView.tsx
- Restructured from a flat stack of collapsible sections into a tabbed layout: the document's root
  heading's first subsection (Pipeline overview) stays permanently visible above a tab bar; every
  other top-level table section becomes a tab (`TabBar` component, active tab underlined). Replaced
  `CollapsibleSection` with `SectionContent` — same recursive heading+content+subsections
  rendering, but no toggle/chevron/state, always fully open (user: collapsing adds clicks without
  payoff once you're already looking at one table in isolation).
- Since only the active tab's content is mounted, an internal `#id` link (from the diagram or from
  another table's Input/Output/Consumers text) can no longer just be a plain anchor — its target
  might not exist in the DOM yet. Added a click handler on the root container that intercepts
  `<a href="#...">` clicks, looks up which tab holds that id, switches `activeTab`, and scrolls to
  it in a `useEffect` once that tab has actually rendered.
- Pipeline overview folded into the tab list too (was a persistent header above the tabs) — now
  every root subsection, diagram included, is `tabSections[i]`; simplified `handleClick`'s lookup
  and dropped the now-unused `overview` special case.
- `TabBar` restyled to match the Home page's `TabBar` (`src/ui/TabBar.tsx`) exactly — same
  `border-b-2 -mb-px` underline treatment, same active/inactive color classes — so the tabs here
  feel consistent with the rest of the app rather than a one-off style.

### docs/Dataflow.md
- Stripped the leading section number (`## 1.`, `## 8b.`, etc.) from every heading — numbering
  stopped being meaningful once sections became tabs and are only ever referenced by name/anchor,
  not by position. `## Status queries` and `## Pipeline overview` were already unnumbered.

### .claude/CLAUDE.md
- Replaced the three remaining `§N` cross-references (purge candidate-refinement note, both
  Outstanding items) with named references ("the `tgam_game_positions` section of
  docs/Dataflow.md", etc.) — section numbers no longer exist in the doc to point to.

### src/ui/MarkdownLiteView.tsx
- `TabBar`'s container swapped `overflow-x-auto` for `flex-wrap` — tabs that don't fit on one line
  now wrap to a second line instead of producing a horizontal scrollbar.

### src/app/owner/dataflow/page.tsx
- Dropped `mx-auto` from the page container so the content sits flush left instead of centered.
- Dropped `max-w-3xl` too (page felt too narrow) — now full width, matching `/owner/cache`.

### src/lib/parseMarkdownLite.ts
- Exported `plainText()` (was module-private) so renderers needing an unstyled label — like a tab
  bar — don't have to run heading text through the full inline renderer.

### src/ui/MarkdownLiteView.tsx
- `TabBar` now renders each tab's label via `plainText(tab.heading)` instead of `renderInline`.
  The bug: most headings wrap the table name in backticks (`` `tpl_players` ``), and
  `renderInline` styles inline code with blue text/background — so those tabs always looked
  blue-tinted regardless of whether they were selected, while headings without backticks
  ("chess.com API", "Purge") didn't, producing the inconsistent coloring reported.

### src/lib/parseMarkdownLite.ts
- Added two new `FlowStep` variants: `side-node` (a box rendered outside the main vertical chain,
  optional `{#id}`) and `edge` (a declared `from`/`to` connection with `style: 'single' | 'double'`,
  parsed from `` `edge id1 <-> id2` `` or `` `edge id1 -> id2` `` lines). Neither participates in
  the main chain's sequential node/arrow rendering — both are purely declarative, drawn as curves.

### src/ui/MarkdownLiteView.tsx
- `FlowDiagram` reworked: splits `steps` into `mainSteps` (unchanged vertical-chain rendering),
  `sideNodes` (rendered in a left column, dashed border to distinguish them from real tables), and
  `edges` (each resolved to a curve the same way the existing loop-back curve already was — measure
  real DOM positions after mount, build a cubic-bezier path). `double`-style edges get a second SVG
  marker (`orient="auto-start-reverse"`) so the arrowhead appears at both ends, not just the end.
  The outer container became a row (side column + main column) instead of a single column.

### docs/Dataflow.md
- Pipeline overview: added `Purge` and `bulkUpdateCpLoss` as side boxes (both link to their own
  sections). `Purge` gets bidirectional connectors to `tpos_positions`, `tgam_game_positions`, and
  `teva_evaluations` (it reads from and deletes from all three). `bulkUpdateCpLoss` sits on the
  `tpos_positions → tgam_game_positions` connector via two single-direction edges, rather than a
  separate side link, since that's literally the path it backfills `gam_cp_change` across. Added
  flow-internal ids (`{#flow-tpos}`, `{#flow-teva}`) to the two nodes that needed to be addressable
  as edge targets but didn't have one yet.
- Removed `## Status queries` per instruction.
- Diagram redesigned to horizontal: all seven table nodes now run left-to-right with `→`
  connectors instead of stacking top-to-bottom. `Purge`/`bulkUpdateCpLoss` moved from a left side
  column into a single centered column underneath the table row. Both now get one straight
  single-direction edge each to `tgam`/`tpos`/`teva` (6 edges total) instead of Purge's
  double-headed connectors and bulkUpdateCpLoss's "through the tpos→tgam arrow" design — simpler
  and more consistent, at the cost of the earlier bidirectional/through nuance.
- Source arrows changed from `↓`/`↑` to `→`/`←` throughout, now that the parser accepts both — so
  the raw markdown matches what's actually rendered instead of saying "down" but showing "right."
- Removed the doc's intro paragraph ("How data moves through the pipeline...").

### src/lib/parseMarkdownLite.ts
- `parseFlowLines` now also accepts `→`/`←` as arrow triggers (mapped to the same `down`/`up`
  direction values as `↓`/`↑`), so diagram authors can use whichever glyph matches the actual
  layout instead of always writing `↓` even in a horizontal diagram.

### src/ui/MarkdownLiteView.tsx
- `FlowDiagram` restructured for a horizontal main chain: arrows render as `→`/`←` instead of
  `↓`/`↑`; the outer container is `flex-col` (chain row, then side-node row) instead of `flex-row`
  (side column, then chain column); side nodes render in a centered row below the chain instead of
  a column to its left.
- `buildCurve` rewritten: instead of a fixed rightward-bulging bezier (designed for a vertical
  chain), it now picks whichever edge of each box faces the other (top-to-bottom if source is
  below target, bottom-to-top if above) and draws a straight line — reads correctly now that
  edges commonly run from a box below up to a box above, not top-to-bottom down a single column.

### vercel.json
- Replaced the two-entry `crons` array (`/api/cron/sync` + combined `/api/analysis/cron`) with six
  entries, one per `/owner/pipeline` step, each pointing at the same individual API route that
  step's manual button already calls: `/api/cron/sync` (3:00), `/api/analysis/build-tree`
  (4:00, `?limit=200&skipSync=true`), `/api/analysis/sync-tpos` (5:00), `/api/analysis/purge`
  (6:00), `/api/analysis/evaluate-positions` (7:00, `?limit=200&depth=16`),
  `/api/analysis/update-cp-change` (8:00). One hour apart rather than 20 minutes, because this
  project is on Vercel's Hobby plan, which only guarantees once-daily execution sometime *within*
  the scheduled hour, not at the precise minute — entries sharing an hour could otherwise fire out
  of order. No route/logic changes; `/api/analysis/cron`'s route file is untouched and still
  manually callable, just no longer in the schedule.

### docs/Dataflow.md
- Pipeline overview revisited: removed the `Purge`/`bulkUpdateCpLoss` side boxes and their edges
  "for the moment." Added four new process side boxes matching the newly-scheduled cron jobs —
  Game Sync, Build Game Positions, Sync Position Tree, Evaluate Positions — each linked to the
  table section that documents it, each connected by two single-direction edges (input table down
  into the process, process back up to the output table). Game Sync spans two hops (chess.com
  API → `tgr_gamesraw` → `tgd_gamesdecon`) but is one cron job, so its box connects chess.com API
  directly to `tgd_gamesdecon`, skipping past `tgr_gamesraw` as an unlabeled intermediate stop in
  the main chain (same "skip an intermediate" pattern used earlier for bulkUpdateCpLoss). Reverted
  the main chain back to vertical (`↓` arrows) per instruction; added flow-internal ids
  (`{#flow-chesscom}`, `{#flow-tgd}`) to the two nodes that needed to be addressable but didn't
  have one yet.

### src/ui/MarkdownLiteView.tsx
- Reverted the horizontal-chain experiment: arrow glyphs back to `↓`/`↑`, outer container back to
  a row (side column + main column) instead of a column (chain row + side row), main chain back to
  `flex-col`, side-node row now `flex-col` again (stacked) instead of `flex-row` — matches "process
  boxes in a left column, offset from a vertical chain."
- `buildCurve` generalized: previously always connected top/bottom-facing edges (correct only for
  a vertical relationship). Now picks whichever axis separates the two boxes more — left/right
  facing edges if they're mostly side-by-side (a side-column box next to the main chain, the
  now-common case with 4 process boxes), top/bottom if mostly stacked (the tgam loop-back's own
  in-chain relationship). Needed because the previous single-axis version was written for the
  short-lived horizontal-chain layout and no longer matched the reverted-to vertical one.

### docs/Dataflow.md
- Corrected Game Sync's mapping — it was wrongly spanning all the way to `tgd_gamesdecon`. Actual
  table-level granularity: Game Sync takes two inputs (`tpl_players` for the resume cutoff,
  chess.com API for the game data) and outputs `tgr_gamesraw` only; a separate `Deconstruct Games`
  process (matching `deconstructGames`, distinct from `syncArchive`) takes `tgr_gamesraw` and
  outputs `tgd_gamesdecon`. Both still run inside the same `runGameSync` call/cron job, but the
  diagram now reflects the real per-table process boundaries rather than the cron-job grouping.
  Added flow ids to `tpl_players` and `tgr_gamesraw` (needed as edge endpoints, didn't have one).

### src/ui/MarkdownLiteView.tsx
- Fixed an infinite render loop ("Maximum update depth exceeded"): `computeCurves`'s `useEffect`
  depended on `mainSteps`/`edges`, both `.filter()`-derived on every render (new array reference
  each time) rather than stored state. `setCurves` inside the effect triggered a re-render, which
  produced new `mainSteps`/`edges` references, which re-triggered the effect — indefinitely.
  Dependency array now just `[steps]`, the actual stable input; `mainSteps`/`edges` are derived
  synchronously from it each render, so the effect closure already sees current values without
  needing them listed.
- `buildCurve` gained a `forceBottomStart` param: when true, the source anchor is always the box's
  bottom-center regardless of the dominant-axis logic. Applied only to edges whose `from` is a
  side-node id (a process box's own output edge) via a new `sideNodeIds` lookup set, so a process
  box's outgoing line no longer shares the same edge its incoming line arrives on.
- Main chain container's `gap-0` changed to `gap-2` — it was relying on the (now-removed) arrow
  rows for spacing between table boxes; without them the boxes would render touching each other.

### docs/Dataflow.md
- Removed the `↓` lines between every table in the main chain — the table-to-table connections are
  now shown entirely through the process boxes and their edges (input table → process → output
  table), so the redundant direct arrows were dropped.
- Moved `tpl_players` and `chess.com API` out of the main chain entirely — they're now `{top}`
  side nodes flanking `Game Sync` (left/right) above the rest of the process column, since they're
  really Game Sync's two inputs, not links in the tgr→tgd→tgam→tpos→teva table lineage.

### src/lib/parseMarkdownLite.ts
- `FlowStep`'s side-node variant gained an optional `top` flag, parsed from a new `{top}` tag via
  `stripNodeTags` (now strips up to three trailing tags — `{#id}`, `{loop:id}`, `{top}` — in any
  order, not just two).

### src/ui/MarkdownLiteView.tsx
- Side nodes now split into `topSideItems` (rendered in their own row, `justify-between` so two
  boxes land at opposite ends) and `columnSideItems` (the existing stacked column below that row).
- Color scheme: main-chain table boxes and top-row side nodes (data sources) are yellow
  (`bg-yellow-100`/`border-yellow-400`); the process column (Game Sync, Deconstruct Games, Build
  Game Positions, Sync Position Tree, Evaluate Positions) is brown (`bg-amber-800`/`border-amber-900`,
  Tailwind has no literal "brown" so amber-800 stands in for it). `renderSideNode` picks between the
  two based on `step.top`, since top-row side nodes are data sources styled like tables, not
  processes.
- `renderInline` gained an optional `flat` param: drops the link underline (keeps the color, adds
  `hover:underline` instead of always-on) and the code span's `bg-blue-50` background chip, so a
  box's own colored background isn't fighting a second background/underline from its label text.
  Passed `true` at the two diagram box-label call sites (main-chain boxes, side-node boxes); left
  the default (non-flat) behavior everywhere else in the document, including arrow labels, which
  aren't rendered on a colored background.
- Connector color changed from blue (`#60a5fa`) to black (`#000000`) — both the path stroke and
  both arrowhead marker fills.
- Process-box background lightened: `bg-amber-800`/`border-amber-900`/`text-amber-50` (dark) →
  `bg-amber-200`/`border-amber-400`/`text-amber-900` (light), still visually distinct brown from
  the yellow tables.
- Added `forceVertical` to `buildCurve`: skips axis-detection and always connects top/bottom,
  applied to any edge whose source is a `{top}` side node (via a new `topSideNodeIds` set) — the
  tpl_players/chess.com API → Game Sync edges now run straight down regardless of horizontal
  offset, instead of picking whichever axis happened to dominate.
- Added `{pair}` and `{table}` tags to the side-node syntax (parser: `stripNodeTags` now handles
  up to 6 trailing tags) and `{bottom}` to the node syntax, for the "tgr_gamesraw sits beside Game
  Sync, the other four tables move out of the way for now" restructure:
  - `{pair}` groups a side node into the same row as the side node immediately before it
    (`sideRows` grouping logic in the renderer) — used so `tgr_gamesraw` renders beside `Game Sync`
    instead of below it.
  - `{table}` styles a side node yellow instead of the default process brown — used on
    `tgr_gamesraw` since it's a repositioned table, not a process.
  - `{bottom}` pulls a main-chain node out of the vertical column into its own wrapped row at the
    very bottom of the diagram (`bottomMainItems`, split out of `mainSteps` via `.filter()` on the
    original index so `mainNodeIndexRefs` stays correct either way) — applied to `tgd_gamesdecon`,
    `tgam_game_positions`, `tpos_positions`, `teva_evaluations` per instruction ("moving the other
    tables out of the way and dealing with them one at a time" in later requests).
- Outer diagram container changed from a single row (side column | main column) to a column
  wrapping that row plus the new bottom row beneath it, so the bottom row spans the full width
  under both the process column and the main chain.

### docs/Dataflow.md
- `tgr_gamesraw` moved out of the main chain into a `{table} {pair}` side node beside `Game Sync`.
  `tgd_gamesdecon`/`tgam_game_positions`/`tpos_positions`/`teva_evaluations` all tagged `{bottom}` —
  temporarily relocated out of the way, not yet individually positioned. All existing edges
  reference the same ids regardless of where each node now renders, so no edge declarations needed
  to change.
- Superseded immediately after: every remaining table now paired beside its own process instead of
  sitting in the bottom row — `tgd_gamesdecon` beside Deconstruct Games, `tgam_game_positions`
  beside Build Game Positions, `tpos_positions` beside Sync Position Tree, `teva_evaluations`
  beside Evaluate Positions (same `{table} {pair}` pattern as `tgr_gamesraw`/Game Sync). The main
  chain and bottom row are now both empty — every table lives in the side-node column, paired with
  its process. `{bottom}` tags removed; the flag/rendering support stays in the code for future use.

### src/ui/MarkdownLiteView.tsx
- Added a shared `BOX_WIDTH = 'w-44'` constant, applied to every diagram box (main-chain nodes,
  side-node tables and processes) so a paired process/table row lines up evenly regardless of
  label length — "Build Game Positions" and "Sync Position Tree" wrap to two lines at this width
  rather than stretching the box, keeping width uniform (height still varies naturally with
  wrapped text).
- Paired side-node rows: gap changed from `gap-4` to `gap-44`, matching `BOX_WIDTH`, so the space
  between each process and its table equals the boxes' own width.
- `buildCurve` gained two more forced-connection modes, replacing the now-removed
  `forceBottomStart`: `forceHorizontal` (always connects via each box's vertical-middle side edge
  — a process's output edge to its paired table beside it) and `forceTopEnd` (always ends at the
  target's top-center, starts at the source's bottom-center — a table's edge "dropping into" the
  top of the next process). Edge classification in `computeCurves` now checks both `edge.from` and
  `edge.to` against a refined `processNodeIds` set (`!n.top && !n.table`, previously just `!n.top`,
  which wrongly counted the paired `{table}` side nodes as processes) to decide which of
  `forceVertical`/`forceHorizontal`/`forceTopEnd` applies to a given edge.
- Fixed `tpl_players`/`chess.com API` clashing on Game Sync's top edge — both previously landed at
  the exact center (`t.left + t.width/2`), overlapping. `buildCurve` gained an `endXFraction`
  param (default 0.5) controlling where along the target's top edge a `forceVertical` edge lands.
  `computeCurves` now groups `forceVertical` edges by target, sorts each group's sources by their
  actual measured X position, and assigns fractions `1/(N+1), 2/(N+1), ...` — for the two-source
  case here, 1/3 and 2/3, left-most source landing left, ordered generically so it also works
  correctly if a future target ever gets 3+ top-row inputs.
- Extracted the box color classes into shared `TABLE_BOX_STYLE`/`PROCESS_BOX_STYLE` constants
  (previously duplicated inline in both `renderMainNode` and `renderSideNode`) and added a small
  legend above the diagram — a colored swatch + "Table"/"Process" label for each, using the same
  constants so the legend can never drift out of sync with the actual box colors.
- `TABLE_BOX_STYLE` changed from yellow to blue (`border-blue-400`/`bg-blue-100`/`text-blue-900`)
  — yellow and the process brown (amber) were too close in hue to tell apart at a glance; blue
  sits opposite brown on the color wheel and matches the app's existing accent color used
  elsewhere (headings, links, tab bar). Since every table box and the legend swatch reference this
  one constant, the single change updates all of them consistently.

### src/lib/parseMarkdownLite.ts
- Added `{process}` tag to the main-chain `node` syntax (`stripNodeTags` now handles up to 7
  trailing tags) — the main-chain column's inverse of a side node's `{table}`: styles a
  main-chain node like a process (brown) instead of the always-table default (blue).

### src/ui/MarkdownLiteView.tsx
- `renderMainNode` now picks `PROCESS_BOX_STYLE` vs `TABLE_BOX_STYLE` based on `step.process`,
  same pattern already used in `renderSideNode`.

### docs/Dataflow.md
- Re-added `Purge` and `bulkUpdateCpLoss` (removed earlier "for the moment") as `{process}`-tagged
  main-chain nodes — they render in the main column, which sits to the right of the process/table
  side column, giving "a column of process boxes to the right" using the already-existing (and
  previously empty) main-chain rendering area rather than new layout code. No edges yet — just
  placed, per the same "get it visible first, connect it later" pattern used for the other tables.
- Removed the "Click a table name..." help sentence under Pipeline overview per instruction.
- Moved `Purge` out of the main-chain right column into a `{process} {pair}` side node, declared
  right after `tpos_positions` so it joins that row as a third box — `Sync Position Tree` |
  `tpos_positions` | `Purge` — reusing the existing multi-item row-grouping (`{pair}` already
  supported more than two boxes per row, just hadn't been exercised yet). Added its three edges:
  `Purge` → `tgam_game_positions`, `Purge` → `tpos_positions`, `Purge` → `teva_evaluations`, all
  single-direction (`->`, not `<->`) matching the instruction's plain "arrows to" wording rather
  than the earlier double-headed design. `bulkUpdateCpLoss` stays in the right column, untouched.

### src/ui/MarkdownLiteView.tsx
- Swapped the render order of the two diagram columns: the main-chain column (`bulkUpdateCpLoss`)
  now renders first (left), and the process/table structure (top row + Game Sync onward) renders
  second (right) — a pure JSX reorder inside the existing `flex-row` container, no new layout
  logic, moving the whole Game Sync structure into the space the main column previously occupied.

### docs/Dataflow.md
- Moved `bulkUpdateCpLoss` out of the (now-empty) main-chain column into a `{process} {pair}` side
  node, declared right after `tgam_game_positions` so it joins that row as a third box — `Build
  Game Positions` | `tgam_game_positions` | `bulkUpdateCpLoss` — one row above `Purge`'s row,
  satisfying "above Purge" as a natural consequence of the vertical row order rather than a
  separate positioning rule. No edges added yet for it, same as when `Purge` was first placed.
- Swapped the declaration order of the two `{top}` nodes — chess.com API now declared first
  (renders left, above Game Sync) and `tpl_players` second (renders right, above `tgr_gamesraw`) —
  so each visually aligns above its intended counterpart instead of both sharing one row in
  original declaration order. Edge targets (`flow-tpl -> flow-gamesync`,
  `flow-chesscom -> flow-gamesync`) untouched — the existing measured-position `endXFraction`
  logic automatically re-sorts which source lands at 1/3 vs 2/3 on Game Sync's top edge based on
  the new positions, no code change needed.

### src/ui/MarkdownLiteView.tsx
- The declaration-order swap alone wasn't enough — `justify-between` only spreads a row's items if
  the row itself has more width than its content needs, which isn't guaranteed for a two-box flex
  row with no explicit width. Changed the top row from `justify-between gap-4` to a fixed
  `gap-44` — the same box width and gap as the `Game Sync`/`tgr_gamesraw` row beneath it, so the
  two rows now have identical geometry and their columns actually line up.

### docs/Dataflow.md
- Added `edge flow-bulkupdate -> flow-tgam` — `bulkUpdateCpLoss`'s first connection, showing it
  writes back into `tgam_game_positions` (`gam_cp_change`), matching the same relationship
  documented in that table's own Rules/gotchas.

### scripts/schema.sql
- Dropped `pl_rating_blitz` from `tpl_players`'s `CREATE TABLE` — matches the `ALTER TABLE ...
  DROP COLUMN` the user ran manually via pgAdmin4.

### src/lib/actions/players.ts
- Removed `rating_blitz` from `upsertPlayer`'s type signature and `columnMap`. Verified first: the
  one real call site (`src/app/owner/maintenance/page.tsx:55-59`) never actually passed it, so this
  was dead even before the column was dropped.

### .claude/CLAUDE.md
- Removed the resolved "`pl_rating_blitz` may be redundant" Outstanding item.

### docs/Dataflow.md
- `tpl_players` Rules/gotchas: dropped the stale-column framing for `pl_rating_blitz` (column no
  longer exists) and added a one-line historical note that it was removed 2026-07-15, verified
  unused (never written by the one real call site, never read anywhere) before dropping.
