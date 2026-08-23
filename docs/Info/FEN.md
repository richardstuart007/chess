# FEN — how it's stored and used in this app

A FEN (Forsyth-Edwards Notation) string encodes a chess position as 6 space-separated fields:

1. Piece placement
2. Active color (`w`/`b`)
3. Castling availability (`KQkq` or `-`)
4. En passant target square (or `-`)
5. Halfmove clock (plies since last pawn move/capture — 50-move-rule bookkeeping)
6. Fullmove number (increments after Black's move)

This app deliberately stores and compares only the first **4 fields** almost everywhere. Fields 5–6
are dropped because they describe *how a specific game arrived* at a position, not the position
itself — two games can transpose into the identical board at different move numbers and with
different halfmove clocks, and for this app's purposes (position dedup, habit/repeat detection,
move-count lookups) that's the same position. Neither field is otherwise meaningful to the app: no
50-move-rule draw logic exists anywhere, and move number for display/queries is always tracked
through dedicated columns (`gam_move_num`, `pos_move_num`), never parsed back out of a FEN's own
field 6.

## The shared utility — `src/lib/fen.ts`

Single source of truth for the 4-field convention, used by both server and client code (no
`'use server'`/`'use client'` directive — a plain module, like `analysisTree.ts`):

```ts
truncateFen(fen: string): string   // keep fields 1-4, drop halfmove clock + fullmove number
expandFen(fen4: string): string    // fields 1-4 + " 0 1", producing a full 6-field FEN
```

`expandFen()` hardcodes `0 1` rather than accepting a caller-supplied move number — neither value
is ever read back out of a FEN anywhere in the app, so there's nothing for a caller to usefully
supply.

Before this became a shared file, `truncateFen()` existed as three duplicated copies
(`buildPositionTree.ts`, `chessdb.ts`, `ChessBoardView.tsx`) — consolidated into `src/lib/fen.ts` on
2026-07-19.

## Two separate FEN "domains" in this codebase

| Domain | Field count | Where it lives | Purpose |
|---|---|---|---|
| **Position-tree pipeline** | 4-field, always | `tpos_positions`, `tgam_game_positions`, `tpur_workfile` | Deduplicated positions, reach/habit counting, move-count lookups — identity must survive transposition |
| **Live analysis tree** | 6-field, always | In-memory `AnalysisTree`/`MoveNode` (`analysisTree.ts`), the `/analyze` page's interactive board | Per-game move-by-move exploration via `chess.js` — no cross-game dedup involved, so the full FEN chess.js naturally produces is kept as-is |

The two domains meet at specific crossing points (`truncateFen()` calls) where a live-analysis FEN
is used to look something up in the position-tree pipeline — see "Where the two domains meet" below.

---

## Database tables

### `tpos_positions` — the deduplicated position tree
| Column | Type | Field count | Notes |
|---|---|---|---|
| `pos_fen` | `text NOT NULL`, `UNIQUE` | **4-field, always** | The dedup key. Populated by `buildPositionTree.ts`'s `syncTposFromTgam()`, which inserts `DISTINCT` FENs already truncated by `getPositionsFromGame()`. |
| `pos_color` | `character(1)` | n/a | FEN field 2 (active color), extracted at insert time via SQL `split_part(fen, ' ', 2)` — not re-derived from `pos_fen` at read time. |
| `pos_move_num` | `integer` | n/a | Not from the FEN's own field 6 — computed separately as `MIN(gam_move_num)` across all occurrences (see `tgam_game_positions.gam_move_num` below); can change under transposition as new, earlier occurrences are found. |

### `tgam_game_positions` — per-ply before/after FEN for every recorded game position
| Column | Type | Field count | Notes |
|---|---|---|---|
| `gam_pos_fen` | `text` | **4-field, always** | The position before the move. Written by `insertGamePositions()` from `getPositionsFromGame()`'s already-truncated output. |
| `gam_resulting_fen` | `text` | **4-field, always** | The position after the move. Same source. Nulled out (along with `gam_resulting_pos_id`) by the purge pipeline when only the *resulting* side of a row is purge-eligible — see `purgePositions.ts`. |
| `gam_move_num` | `integer` | n/a | Computed as `Math.ceil((i + 1) / 2)` during replay in `getPositionsFromGame()` — not parsed from any FEN. |

### `teva_evaluations`
No FEN column — keyed by `eva_pos_id` (a foreign reference to `tpos_positions.pos_id`), so it never stores a FEN of its own.

### `tpur_workfile` — purge-pipeline scratch table
| Column | Type | Field count | Notes |
|---|---|---|---|
| `pur_pos_fen` | `text NOT NULL` | **4-field, always** | Copied verbatim from `tpos_positions.pos_fen` when a purge candidate is staged (`purgePositions.ts`). |

### `tqui_quiz` — quiz feature
| Column | Type | Field count | Notes |
|---|---|---|---|
| `qui_pos_fen` | `text NOT NULL` | n/a | Declared in `scripts/schema.sql` but **no code in the current app writes or reads this column** — the quiz feature appears unbuilt/unused. |

### `tgev_game_evals` — legacy live per-game analysis cache
| Column | Type | Field count | Notes |
|---|---|---|---|
| `gev_fen_after` | `text NOT NULL` | **4-field since 2026-07-19** (was 6-field before) | Written by `saveGameEvaluations()` in `games.ts`, which now truncates the incoming `chess.js`-produced FEN before storing. |

### `tsa_savedanalyses` — saved analysis lines/trees
| Column | Type | Field count | Notes |
|---|---|---|---|
| `sa_starting_fen` | `text` (nullable) | **4-field since 2026-07-19** (was 6-field before) | Written by `saveAnalysisLine()` in `games.ts`, now truncated the same way. `getSavedAnalyses()` (the only reader) has no current caller anywhere in the app — this feature's read path is currently unused. |
| `sa_tree_data` | `jsonb` | **6-field, always** | Written by `saveAnalysisTree()`; each serialized `MoveNode.fen`/`fenBefore` inside the JSON blob is whatever the live analysis tree held — full 6-field, untouched by this normalization since it's inside an opaque JSON blob, not a queryable FEN column. |

---

## Functions that generate FEN

### `chess.js`'s `.fen()` — the only FEN generator in the app
Every FEN in this codebase ultimately comes from a `chess.js` `Chess` instance's `.fen()` method
(or the hardcoded starting-position string). `chess.js` always emits 6 fields; every 4-field FEN in
this app is produced by truncating that output immediately after.

- **`buildPositionTree.ts`'s `getPositionsFromGame()`** ([buildPositionTree.ts:28-84](../src/lib/analysis/buildPositionTree.ts#L28)) — replays a game's PGN move-by-move with a `chess.js` instance, calling `truncateFen(replay.fen())` for both the before-position (`fen`) and after-position (`resultingFen`) at every ply. This is the sole entry point into the position-tree pipeline.
- **`analysisTree.ts`'s `buildTree()`** ([analysisTree.ts:39-79](../src/lib/analysisTree.ts#L39)) — takes a pre-computed `fens[]` array (one full 6-field FEN per ply, generated by `ChessBoardView.tsx`'s mount effect via repeated `g2.move()` + `g2.fen()`) and attaches them to `MoveNode.fen`/`fenBefore`. No truncation — this is the live-analysis-tree domain.
- **`ChessBoardView.tsx`'s `handlePieceDrop()`** ([ChessBoardView.tsx:475-514](../src/ui/board/ChessBoardView.tsx#L475)) — interactive board move; calls `addBranch(..., g.fen())` with a full 6-field FEN, feeding a new variation node into the live analysis tree.
- **`analysisTree.ts`'s `addPvBranch()`** ([analysisTree.ts:117-148](../src/lib/analysisTree.ts#L117)) — replays an engine PV line, calling `addBranch(..., g.fen())` per move, again full 6-field.

### `src/lib/fen.ts`'s `expandFen()`
Not currently called anywhere in the app — added as the documented, deliberate counterpart to
`truncateFen()` for any future need to reconstitute a 6-field FEN from a stored 4-field one (e.g.
external tooling, export). Hardcodes halfmove clock `0` and fullmove number `1`.

---

## Functions that consume/compare FEN

### Where the two domains meet — `truncateFen()` call sites
Every place a full 6-field, live-analysis-tree FEN needs to be matched against the 4-field
position-tree pipeline calls `truncateFen()` first:

| Call site | Purpose |
|---|---|
| `chessdb.ts`'s `getMovePlayCount()` / `getMovePlayCounts()` ([chessdb.ts:146](../src/lib/analysis/chessdb.ts#L146), [chessdb.ts:169](../src/lib/analysis/chessdb.ts#L169)) | "How many times has this move been played from this position" — looks up `tpos_positions.pos_fen` by a FEN the caller supplies (from the live tree or `AlternativeLines`' `MoveCountCheck`). |
| `chessdb.ts`'s `getMoveSummaryForPosition()` ([chessdb.ts:209](../src/lib/analysis/chessdb.ts#L209)) | "Moves From This Position" panel on the Analyze page — keyed by whatever FEN is currently on the board (`ChessBoardView.tsx:192,197`). |
| `chessdb.ts`'s `getGamesForPosition()` ([chessdb.ts:247](../src/lib/analysis/chessdb.ts#L247)) | "Games From This Position" panel — same pattern (`ChessBoardView.tsx:210,214`). |
| `chessdb.ts`'s `upgradePositionEvaluation()` ([chessdb.ts:335,345](../src/lib/analysis/chessdb.ts#L335)) | Merges a deeper live `/analyze` Stockfish evaluation into `teva_evaluations`, keyed by `tpos_positions.pos_fen`. **Fixed 2026-07-19**: previously compared the raw (6-field) incoming FEN directly, so the lookup silently never matched — now truncates first. |
| `ChessBoardView.tsx`'s move-count-badge effect ([ChessBoardView.tsx:162,170](../src/ui/board/ChessBoardView.tsx#L162)) | Truncates every tree node's `fenBefore` before calling `getMovePlayCounts()`, and truncates again when reading the result back out of the returned map (map keys are 4-field). |
| `games.ts`'s `saveGameEvaluations()` / `saveAnalysisLine()` ([games.ts:120](../src/lib/actions/games.ts#L120), [games.ts:191](../src/lib/actions/games.ts#L191)) | Not a lookup, but the same crossing: truncates a live-tree FEN before it's written into a DB column. |

### Reads that stay entirely within the 4-field domain
- `chessdb.ts`'s `getPositionsToEvaluate()`, `getPositionDetail()`, `getHabitsData()` — all read `pos_fen` straight out of `tpos_positions` and pass it on (to board rendering, to `chess.js`) without needing to compare it against anything, so no truncation is involved.
- `enrichPositionsStockfish.ts` (batch Stockfish evaluation) — reads `pos_fen` directly from `tpos_positions`/via `tgam_game_positions.gam_resulting_pos_id` joins and feeds it straight to the engine.

### `chess.js`'s `Chess(fen)` constructor — tolerates both
Every place a FEN is parsed back into a `chess.js` instance works identically whether given 4 or 6
fields — verified directly: `chess.js@1.4.0` defaults a missing halfmove clock to `0` and fullmove
number to `1` when parsing. Call sites: `PositionDetail.tsx:67` (`new Chess(position.pos_fen)`,
4-field), `ChessBoardView.tsx:192,227,368,479` (mix of 4- and 6-field depending on source),
`analysisTree.ts:124,170` (`addPvBranch`/`replayToNode`, 6-field), `stockfish.ts:56,70`
(`uciToSan`/`uciLineToSans`, whatever the caller passes).

### Stockfish (UCI `position fen`) — tolerates both
Both the batch server-side engine (`enrichPositionsStockfish.ts:41-44`'s `StockfishEngineBase.evaluate()`) and the
client-side Web Worker engine (`stockfish.ts:241-285`'s `StockfishEngine.evaluate()`/`startInfiniteAnalysis()`) send
`position fen <fen>` verbatim to the engine — standard UCI, and the reference FEN parser defaults
missing fields the same way `chess.js` does. Only piece placement and side-to-move materially
affect the search, so 4- vs 6-field is immaterial to evaluation correctness.

### Board rendering — tolerates both
`react-chessboard`'s `Chessboard` component only reads the piece-placement field (field 1) out of
whatever `position` prop it's given. Call sites: `ChessBoardView.tsx:702` (`displayGame.current.fen()`, 6-field),
`PositionDetail.tsx:113` (`position.pos_fen`, 4-field), `HabitsTable.tsx`'s `MiniBoard` (`row.pos_fen`, 4-field).

---

## Summary — field count by table

| Table.Column | Field count |
|---|---|
| `tpos_positions.pos_fen` | 4 |
| `tgam_game_positions.gam_pos_fen` / `gam_resulting_fen` | 4 |
| `tpur_workfile.pur_pos_fen` | 4 |
| `tgev_game_evals.gev_fen_after` | 4 (since 2026-07-19; was 6) |
| `tsa_savedanalyses.sa_starting_fen` | 4 (since 2026-07-19; was 6) |
| `tsa_savedanalyses.sa_tree_data` (embedded FENs in JSON) | 6 |
| `tqui_quiz.qui_pos_fen` | n/a (column exists, unused) |

Every table's stored FEN is now 4-field except the JSON-embedded FENs inside `sa_tree_data`, which
are out of scope for column-level truncation since they're not a queryable/comparable column — they
exist purely to redraw a saved tree's board positions, a purpose 6-field FEN serves equally well.
