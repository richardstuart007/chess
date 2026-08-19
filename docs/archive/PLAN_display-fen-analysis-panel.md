# PLAN_display-fen-analysis-panel — chess

## Title
Display the FEN on the analyse position panel next to the title (Stockfish)

## Plan
- [x] In `src/ui/board/ChessBoardView.tsx`, inside the "Stockfish" `MyBox` panel (~line 1095),
      add a row directly below the title (first line inside the box's children, above the
      depth/lines controls) showing the current position's FEN via `getCurrentPositionFen()`,
      in small monospace text, plus a "Copy" button that copies the full FEN string to the
      clipboard (`navigator.clipboard.writeText`). Not placed inside the `MyBox` title itself —
      `MyBox`'s `title` prop only accepts a plain string, no slot for a button.
- [x] Give brief visual feedback on copy (e.g. button label swaps to "Copied" for ~1-2s, then
      reverts).
- [x] In `src/ui/board/ChessBoardView.tsx`, rename the `MyBox` title `'Master Moves'` (~line 1277)
      to `'Master Moves (Lichess)'` and `'Master games'` (~line 1347) to `'Master Games (Lichess)'`
      — plain label text changes, no behavior change.
- [x] **Superseded by the step below** — the original design for the new panel (filter inputs +
      a "Search chess.com" button that just opened a new tab, with a `CHESSCOM_SEARCH_MIN_RATING`
      constant) was built, then replaced once the user clarified the panel should embed a real
      results table like "Master Games (Lichess)" does, not just link out. The filter-inputs
      constant and UI were removed again as part of that replacement — see the step below for
      what actually shipped.
- [x] **Phase 1 (embedded table, FEN only, no filters)** — chess.com exposes no public API for
      this search, so the results are fetched and parsed server-side:
      - Added `src/lib/actions/chesscomSearch.ts` (`'use server'`): `searchChessComGames(fen)`
        fetches `chess.com/games/search?...&fen=<fen>&opening=&openingId=&...` (all other filter
        params blank/neutral — no result/rating/year/player/sort filter applied) and parses the
        server-rendered results table with `cheerio` (added as a new dependency, matching the
        library `next-bridge` already uses for its own HTML scraping) into one row per game:
        white/black username + rating, result, move count, year, `gameId`, and the
        `chess.com/games/view/<id>` URL. Returns `[]` on any failure. Verified against real
        chess.com HTML (not just the fetch-tool's summarized text) before building this.
      - In `src/ui/board/ChessBoardView.tsx`, replaced the earlier filter-based panel with:
        a "Search chess.com" button (fetches on click — this hits an external site, so it is not
        auto-triggered on every position change like the Lichess panel is) plus a results table
        (White | Black | Result | Moves | Year | Game) once results load, each row's "Game"
        column a "view" link to that specific chess.com game in a new tab — mirroring "Master
        Games (Lichess)"'s own per-row link pattern.
      - Player/rating/year/result/sort filters are explicitly deferred to a later phase — see
        "Chess.com Games panel — phase 2 filters" under Outstanding items in `.claude/CLAUDE.md`.
- [x] **Phase 2 (filters)** — bring back the filter inputs designed earlier (values already
      confirmed against chess.com directly, recorded in the Outstanding items entry this
      supersedes), positioned *after* the "Search chess.com" button this time (not above it, as
      originally built): Player 1 (text), Player 2 (text), "Fixed colors (P1 = White)" toggle,
      Min rating (number, default `CHESSCOM_SEARCH_MIN_RATING = 2600`, re-added to
      `src/lib/constants.ts` + the Constants page), Year (number) + comparison selector (=/≤/≥ →
      `lsty` 1/2/3), Result selector (Any/White wins/Black wins/Draw/Not a draw → `lstresult`
      0/1/2/5/6), Sort selector (Most recent/Oldest/Rating (White)/Rating (Black)/Most moves/
      Fewest moves → `sort` blank-or-7/8/3/4/9/10). `searchChessComGames()` in
      `src/lib/actions/chesscomSearch.ts` takes these as parameters instead of hardcoding the
      neutral/blank values it currently does; `moves`/`lstMoves` stay fixed/unused as before
      (meaning never confirmed). Remove the now-fulfilled "phase 2 filters" Outstanding item in
      `.claude/CLAUDE.md` once this ships.

## Changes
### src/ui/board/ChessBoardView.tsx
- Added `fenCopied` state (grouped with the deep-analysis state) to drive the copy button's
  "Copied" feedback.
- Added `copyFenToClipboard()` — writes the current position's FEN (`getCurrentPositionFen()`) to
  the clipboard via `navigator.clipboard.writeText`, then flips `fenCopied` true for 1.5s.
- In the "Stockfish" panel, added a row above the depth/lines controls showing the current FEN in
  small monospace text plus a "Copy FEN" `MyButton` (label becomes "Copied" briefly after a
  successful copy) — for pasting the position into an external tool such as chess.com's analysis
  board.
- Renamed the `MyBox` titles `'Master Moves'` → `'Master Moves (Lichess)'` and `'Master games'` →
  `'Master Games (Lichess)'`, to distinguish them from the new chess.com panel.
- Added `chesscomGames`/`chesscomLoading` state and `searchChessCom()` (calls
  `searchChessComGames()` for the current position and stores the result).
- Added a new "Chess.com Games" collapsible `MyBox` panel (positioned after "Master Games
  (Lichess)") with a "Search chess.com" button and, once results load, a table matching "Master
  Games (Lichess)"'s layout (White | Black | Result | Moves | Year | Game, per-row "view" link to
  chess.com opening in a new tab).
- (Superseded, then removed in the same pass) `CHESSCOM_YEAR_COMPARISON_OPTIONS`,
  `CHESSCOM_RESULT_OPTIONS`, `CHESSCOM_SORT_OPTIONS`, `buildChessComSearchUrl()`, the `p1`/`p2`/
  `fixedcolors`/`mr`/`year`/`lsty`/`lstresult`/`sort` filter state, and the `MyToggle` import —
  all built for the original filter-based design, then deleted once the panel was rebuilt as an
  embedded table with no filters (phase 1).

### src/lib/actions/chesscomSearch.ts (new file)
- `ChessComSearchGame` type + `searchChessComGames(fen)` — fetches and parses chess.com's own
  `/games/search` results table via `cheerio`. See Plan step above for the full description.

### package.json
- Added `cheerio` as a new dependency (HTML parsing for the chess.com scrape above).

### src/lib/constants.ts / src/app/owner/constants/page.tsx
- `CHESSCOM_SEARCH_MIN_RATING` was added, removed (phase 1 no-filter table), then re-added
  (phase 2) as the Min rating filter's default.

### src/lib/actions/chesscomSearch.ts (phase 2)
- Added `ChessComSearchFilters` (p1, p2, fixedcolors, mr, year, lsty, lstresult, sort) and changed
  `searchChessComGames(fen)` to `searchChessComGames(fen, filters)` — builds the URL from the
  filter values instead of hardcoding neutral/blank ones.

### src/ui/board/ChessBoardView.tsx (phase 2)
- Re-added `CHESSCOM_YEAR_COMPARISON_OPTIONS`/`CHESSCOM_RESULT_OPTIONS`/`CHESSCOM_SORT_OPTIONS`
  module constants, the `MyToggle` import, and filter state (`p1`, `p2`, `fixedcolors`, `mr`,
  `year`, `lsty`, `lstresult`, `sort`).
- `searchChessCom()` now builds a `ChessComSearchFilters` object from that state and passes it to
  `searchChessComGames()`.
- Added the filter inputs to the "Chess.com Games" panel, positioned *after* the "Search
  chess.com" button (Player 1, Player 2, Fixed colors toggle, Min rating, Year value +
  comparison, Result, Sort).

### .claude/CLAUDE.md
- Removed the now-fulfilled "Chess.com Games panel — phase 2 filters" Outstanding item.

## Testing
- [ ] Open a game's analysis page and confirm the "Stockfish" panel shows the current FEN plus a
      working "Copy FEN" button.
- [ ] Confirm the panels previously titled "Master Moves" and "Master games" now read
      "Master Moves (Lichess)" and "Master Games (Lichess)".
- [ ] Confirm the "Chess.com Games" panel shows the "Search chess.com" button first, then the
      filter row(s) below it (Player 1, Player 2, Fixed colors, Min rating, Year + comparison,
      Result, Sort), then results once searched.
- [ ] With no filters changed (Min rating defaults to 2600), click "Search chess.com" and confirm
      it fetches and displays a table of real games that reached the exact current position.
- [ ] Click a "view" link in the results table and confirm it opens that specific game on
      chess.com in a new tab.
- [ ] Set Player 1 to a known strong player (e.g. "Magnus Carlsen"), enable "Fixed colors", set a
      Year with each of the =/≤/≥ comparisons in turn, pick a Result and a Sort option, and
      confirm the results table changes accordingly each time after clicking "Search chess.com".
- [ ] Navigate to a different position/move, click "Search chess.com" again, and confirm the
      results table updates to match the new position.
- [ ] Navigate to a position with no matching chess.com games and confirm the panel shows
      "No games found on chess.com for this position." rather than an empty/broken table.
