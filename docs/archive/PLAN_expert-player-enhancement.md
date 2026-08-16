# PLAN_expert-player-enhancement — chess

## Title
Expert player enhancement — compare openings against grandmaster games (e.g. Magnus Carlsen, one opening)

## Plan

Scope for this pass: aggregate master-level opening theory only, via the Lichess Masters
Opening Explorer API. Player-specific comparison against a named grandmaster (e.g. via chess.com)
is deliberately deferred to a future pass.

**Discovered during execution (2026-08-16): the Explorer is no longer free/anonymous.** Both
`explorer.lichess.ovh/masters` and `explorer.lichess.org/masters` now return `401 Unauthorized`
for unauthenticated requests — Lichess locked the endpoint behind a personal API token after a
DDoS in Feb 2026 ([lila#19610](https://github.com/lichess-org/lila/issues/19610), confirmed live
against both hosts). User decision: get a free personal Lichess API token and continue as planned,
sending it as a `Bearer` token from the server. This also means the call must be genuinely
server-only (the token can't reach the client bundle), so the originally-planned two-file split
(mirroring `chesscom.ts` + a thin action wrapper) collapses into a single `'use server'` file —
there's no client-safe helper here the way `chesscom.ts` has `getPlayerResult`/
`extractOpeningFromPgn`.

- [x] User generates a free personal API token at `lichess.org/account/oauth/token` (no scopes
      needed — public explorer data only) and adds it to `.env.locallocal` / `.env.localprod` as
      `LICHESS_API_TOKEN` (placeholder lines added by this plan; user fills in the real value) —
      done, confirmed working (live API calls with the real token return `200` with real data)
- [x] Add `src/lib/actions/lichess.ts` (`'use server'`) with `getMastersExplorer(fen)`, calling
      `https://explorer.lichess.org/masters` with an `Authorization: Bearer` header from
      `LICHESS_API_TOKEN`, returning the full parsed response (top-level white/draws/black totals,
      every per-move field, and the `topGames` list) — pass everything through rather than
      trimming fields, so it's all visible for step 4 below
- [x] Add `MASTERS_EXPLORER_MOVES_LIMIT = 12` to `src/lib/constants.ts` (matches the Lichess API's
      own default move count), and mirror it into `/owner/constants` per project convention.
      Mirror the new `LICHESS_API_TOKEN` env var into `/owner/constants` too, per the same
      convention already used for `CRON_SECRET`/`STOCKFISH_PATH`
- [x] Add a new, separate "Masters" panel to `ChessBoardView.tsx` (`src/ui/board/ChessBoardView.tsx`),
      positioned alongside the existing "Moves From This Position" box — not merged into it, and
      not constrained to that column's 440px width if the data needs more room. Show every field
      returned by the Lichess Masters Explorer response for `getCurrentPositionFen()`: per-move
      Move / Games / White% / Draw% / Black% / Avg Rating, plus any sample/top-game info the
      response includes (players, year, result). Whether to merge with "Moves From This Position"
      later is a follow-up decision once this data is visible.
- [x] Handle the empty case where no master games reach the position (deep/rare positions) with a
      clear "no master games recorded from this position" message, matching the existing empty
      states elsewhere on the page

**Follow-up (2026-08-16): "Masters" ≠ "grandmasters".** The Lichess Masters database is FIDE
2200+ (National Master level and up), not GM-specific, and it's a static historical corpus
(~1952–2022, confirmed via Lichess forum posts) rather than live-updated — explaining why results
looked old and not GM-caliber. User decision: add a rating filter, as a constant with a
user-overridable input in the panel. **Verified scope limit**: this can only filter the **Top
Games** list (each entry has real per-player ratings) — the per-move stats table is pre-aggregated
by Lichess across the whole 2200+ pool with no rating breakdown available from the API, so it's
unaffected by the filter; the UI must make that limitation visible, not silent. Also confirmed
`topGames` already returns the API's max (15) by default, so there's no larger pool to draw from —
filtering only narrows within those 15.

- [x] Add `MASTERS_EXPLORER_MIN_RATING = 2500` to `src/lib/constants.ts` (Masters Explorer
      section), mirrored into `/owner/constants`
- [x] Add a rating-threshold number input to the Masters panel, initialized from
      `MASTERS_EXPLORER_MIN_RATING`, live-editable (client-side state, not persisted). Filters the
      Top Games table to rows where both players' ratings meet the threshold. Add a short note by
      the input clarifying it only affects Top Games, not the per-move stats table above it
- [x] Add a distinct empty state for "Top Games has entries but none meet the current threshold"
      (e.g. "No Top Games at or above {threshold}") separate from the existing "no master games at
      all for this position" message

## Changes

### src/lib/actions/lichess.ts (new)
- Added `getMastersExplorer(fen)` — server-only call to `explorer.lichess.org/masters` with a
  `Bearer` token from `LICHESS_API_TOKEN`, returning the full response (`white`/`draws`/`black`
  totals, `moves[]`, `topGames[]`, `opening`). Returns `null` on any failure (missing token,
  network error, non-2xx) so the caller can show an empty state — matches this file's other
  best-effort external lookups.

### src/lib/constants.ts
- Added `MASTERS_EXPLORER_MOVES_LIMIT = 12` (new "Masters Explorer (Lichess)" section).

### src/app/owner/constants/page.tsx
- Mirrored `MASTERS_EXPLORER_MOVES_LIMIT` into `CONSTANTS_SECTIONS` and `LICHESS_API_TOKEN` into
  `envSections`, per project convention.

### .env.locallocal, .env.localprod
- Added a placeholder `LICHESS_API_TOKEN=` line (empty) with a comment pointing at
  `lichess.org/account/oauth/token` — the user still needs to generate and fill in the real token.

### src/ui/board/ChessBoardView.tsx
- Added `mastersData` state and a `useEffect` (same trigger as the existing "Moves From This
  Position" effect) calling `getMastersExplorer` for whatever position is currently on the board.
- Added a new "Masters" panel — a separate `MyBox` (not merged into "Moves From This Position"),
  showing: a summary line (total master games, White/Draw/Black %), a per-move table (Move / Games
  / White% / Draw% / Black% / Avg Rating), and a "Top games" table (players, ratings, year, result,
  a `view` link to the game on lichess.org). Shows "No master games recorded from this position."
  when the explorer returns no moves for the position.

### src/lib/constants.ts, src/app/owner/constants/page.tsx (follow-up)
- Added `MASTERS_EXPLORER_MIN_RATING = 2500`, mirrored into `CONSTANTS_SECTIONS`.

### src/ui/board/ChessBoardView.tsx (follow-up)
- Added `mastersMinRating` state, initialized from `MASTERS_EXPLORER_MIN_RATING`.
- Top Games table now has a "Min rating" number input above it, filtering to rows where both
  players' ratings meet the threshold, plus a distinct "No Top Games at or above {threshold}"
  empty state, and a note clarifying the filter doesn't affect the per-move stats table (the API
  doesn't provide a rating breakdown for that aggregate data).

## Testing
- [ ] Generate a free personal API token at
      https://lichess.org/account/oauth/token (no scopes needed), set it as
      `LICHESS_API_TOKEN` in `.env.locallocal` (replacing the empty placeholder line), and restart
      the dev server so the new env var is picked up
- [ ] Open `/analyze?game=<id>&player=<player>` for any synced game
- [ ] Confirm a new "Masters" panel appears in the third column, below "Moves From This Position"
- [ ] Step through the opening moves (arrow keys, or clicking moves in the move tree) and confirm
      the Masters panel updates each time to match the position now on the board
- [ ] Confirm the panel shows a summary line (total master games, White/Draw/Black %) and a
      per-move table (Move / Games / White% / Draw% / Black% / Avg Rating)
- [ ] Confirm a "Top games" table appears below it, and clicking a `view` link opens that game on
      lichess.org in a new tab
- [ ] Navigate deep into a game (move ~20+, well past typical opening theory) and confirm the panel
      shows "No master games recorded from this position." instead of erroring
- [ ] Temporarily blank out `LICHESS_API_TOKEN` again and confirm the panel still shows the same
      empty-state message rather than a crash — confirms the missing-token case fails gracefully
- [ ] Open `/owner/constants` and confirm `MASTERS_EXPLORER_MOVES_LIMIT`, `MASTERS_EXPLORER_MIN_RATING`
      (Constants tab) and `LICHESS_API_TOKEN` (Env tab) all appear
- [ ] On the Masters panel, confirm a "Min rating" input sits above Top Games, defaulted to 2500
- [ ] Raise the threshold (e.g. to 2700) and confirm Top Games narrows to only rows where both
      players meet it, or shows "No Top Games at or above 2700." if none qualify
- [ ] Lower the threshold (e.g. to 2200) and confirm more/all of the original 15 Top Games reappear
- [ ] Confirm the per-move stats table above Top Games does NOT change when the rating threshold
      changes — it's documented as unaffected, not a bug
