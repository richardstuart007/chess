# PLAN_world-championship-games — chess

## Title
Add all World Chess Championship games into the masters database, sourced from the chess.com
collection: https://www.chess.com/analysis/collection/world-chess-championship-1886-2018-X3t6iYnr/12Kn6RV2GE/games
— also considering a new "World Champions" logo/badge.

## Plan

Design agreed 2026-09-14:
- **Direct PGN import** — no chess.com API JSON fabrication. `wk_mgr_gamesraw`/`deconstructGames_Master`
  (the real chess.com-sync path) are untouched; games are parsed straight from PGN headers into
  `tmgd_gamesdecon`.
- **Handle-less masters**: historical players with no chess.com account get a `tmst_master_players` row
  with `mst_chesscom_handle = NULL`. `mgd_player` (and the app-code handle lookup,
  `getMasterHandleNameMap`) falls back to a normalized full-name slug (e.g. `wilhelm-steinitz`) whenever
  a player has no real handle; a player who already has a real handle (e.g. Carlsen, Caruana — 7 of the
  37 WCC players already exist as tracked masters) keeps using that handle as `mgd_player`, so their
  existing games/queries are unaffected.
- **One `tmgd_gamesdecon` row per game** (matches the existing chess.com-sync dedup convention) —
  accepted tradeoff: the "other" player in a two-tracked-master game won't see it in their own
  Moves/Games Played list. Rule for which side owns the row: **White is always `mgd_player`** (simple,
  deterministic).
- **New Owner Pipeline** (new page, reusable for future historical PGN collections — e.g. Morphy games
  later), mirroring the existing FIDE-zip-upload pattern (raw file staged into a `wk_` workfile table,
  then parsed):
  1. Upload PGN collection — new `wk_` workfile table holding raw PGN text + a collection label (e.g.
     "World Chess Championship 1886-2018").
  2. Deconstruct — parse each game's PGN headers directly (reusing `parsePgn.ts`'s `countMoves`;
     opening-name extraction will be blank for these since there's no chess.com `ECOUrl` header — falls
     back to the `ECO` code only), insert into `tmgd_gamesdecon`, auto-creating any missing
     `tmst_master_players` rows (matched by full name against existing rows first) along the way.
  3. Build Position Tree — reuse `buildPositionTree_Master` unchanged.
  4. Sync Position Tree — reuse `syncTposFromTgam_Master` unchanged.
- **No chess.com UUID** — `mgd_chesscom_uuid` stays `NULL` for these games; re-run idempotency needs a
  natural-key check instead (White + Black + Date + Round) — exact mechanism worked out at `#code` time.
- **Resolved 2026-09-14**: add `mgd_event`/`mgd_round` (nullable text) columns to `tmgd_gamesdecon` to
  preserve tournament context ("World Chess Championship 1886", "Round 3"). Append-only, no reorder
  needed.
- Table/column identifiers (the new `wk_` staging table, any new columns) to be finalized via the
  `db-naming` skill at `#code` time, not locked in here.

- [x] Add the new `wk_` staging table for raw PGN text (per collection) — `wk_hpg_historicalpgnraw`
      (`hpg_collection`, `hpg_pgn`), no PK (matches other workfile tables), indexed on
      `hpg_collection`. SQL given in chat for manual execution, `scripts/schema.sql` updated.
- [x] Add `mgd_event`/`mgd_round` nullable text columns to `tmgd_gamesdecon` — SQL given in chat for
      manual execution, `scripts/schema.sql` updated.
- [x] Build the Owner Pipeline's Upload step: split an uploaded PGN file into individual games, insert
      one row per game into the new staging table tagged with a user-entered collection label. Checked
      `nextjs-shared` for an existing file-upload component — none exists; used a plain native
      `<input type="file" multiple>` (not a value-list control, so the "build a reusable wrapper"
      convention doesn't apply).
- [x] Write the direct-PGN decon function (parallel to, not reusing, `deconstructGames_Master`): reads
      `White`/`Black`/`Date`/`Result`/`Event`/`Round`/`ECO` headers (the collection has no
      `WhiteElo`/`BlackElo`/`Termination`/`TimeControl` headers at all — confirmed by inspecting the
      actual files), reuses `parsePgn.ts`'s `countMoves`/`parsePgnOpening`/`normalizeTermination`;
      derives `mgd_player` (White)/`mgd_player_color`/`mgd_player_result`/`mgd_opponent_username`/
      `mgd_opponent_rating`; added `HISTORICAL_TIME_CLASS = 'classical'` to `constants.ts` (+
      Constants page) for `mgd_time_class`; leaves `mgd_chesscom_uuid` NULL.
- [x] Auto-create missing `tmst_master_players` rows: for each unique White/Black name not already
      matched (by surname, disambiguated by first name on a collision — mirrors
      `fidePipeline.ts`'s `findUnlinkedRowByName`, but matches every existing row, not only
      fideid-less ones, since a historical player can already be a fully-linked master under a
      spelling variant of their first name — e.g. PGN "Alexey Shirov" vs. already-tracked "Alexei
      Shirov") to an existing row, inserts `mst_first_name`/`mst_last_name` from the PGN header,
      `mst_chesscom_handle = NULL`, `mst_fideid = NULL`, `mst_grade = NULL`, `mst_priority = false`.
- [x] Extended `getMasterHandleNameMap` to fall back to the same normalized full-name slug
      (`historicalPlayerSlug`, extracted to a new plain `src/lib/historicalPlayerSlug.ts` since
      `masterPlayers.ts`/`importHistoricalGames.ts` both have `'use server'`, which requires every
      export to be an async server action) for masters with `mst_chesscom_handle IS NULL`.
- [x] Added the 4 pipeline steps to a new Owner page (`/owner/pipelinehistoricalgames`) — steps 1-2
      are new (`uploadHistoricalPgn`/`deconstructHistoricalGames`), steps 3-4 directly reuse the
      existing `/api/mastergames/build-tree`/`/api/mastergames/sync-tpos` endpoints unchanged (both
      are already global/unfiltered, so they pick up historical games with no code changes needed).
      Registered on `/owner` (Pipeline > Masters tab).
- [x] Ran `npx tsc --noEmit` and `npm run build` — both clean (build caught and fixed one JSX
      apostrophe-in-single-quoted-attribute syntax error).
- [x] Ran the pipeline against all 20 downloaded PGN files
      (`C:\Users\richa\Downloads\World Chess Championship_ 1886-2018*.pgn`, 980 games). Result:
      **964 games imported**, 16 skipped (too short to be trackable — pre-move-4 draws/resignations).
      **Bug found and fixed during the run**: `mgd_end_time` (32-bit `integer`) can't hold a Unix
      timestamp before 1901-12-13 — every pre-1901 WCC game (115 of them: Steinitz vs. Zukertort
      1886, vs. Chigorin 1889/1892, vs. Gunsberg 1890-91, vs. Lasker 1894, Lasker vs. Steinitz
      1896-97) failed on first pass. User decided (after an initial workaround attempt was tried
      and reverted) on the real fix: **`ALTER TABLE tmgd_gamesdecon ALTER COLUMN mgd_end_time TYPE
      bigint`** (manual SQL, run by user) — `parseHistoricalDate` stores the real date unmodified,
      no offset/placeholder. The 115 affected rows plus their 2,990 `tmgam_game_positions` rows
      (built during the failed workaround) were manually deleted and cleanly re-imported. Verified:
      real dates now correct (e.g. Steinitz vs. Zukertort games show their true 1886-01-13/
      01-18/02-03 dates), 31 new handle-less `tmst_master_players` rows created (matches the 31 of
      37 WCC players with no pre-existing chess.com-handle-based row), 964 total historical games,
      position tree fully built (0 remaining).
- [x] Ran `npx tsc --noEmit` after every code change; clean throughout.

## Changes

### src/lib/constants.ts
- Added `PIPELINE_TYPE_HISTORICALGAMES = 'historicalgames'` (own `tpip_pipelinelog.pip_pipeline_type`
  value, scoped separately from every other pipeline) and `HISTORICAL_TIME_CLASS = 'classical'` (the
  `mgd_time_class` written for every historical-collection import — these games predate chess.com's
  blitz/rapid/bullet concept).

### src/lib/actions/pipelineLog.ts
- Added `PIPELINE_TYPE_HISTORICALGAMES` to the `PipelineType` union so `logPipelineStep`/
  `getLatestPipelineRuns`/`getRecentRunIds` accept it.

### src/lib/historicalPlayerSlug.ts (new)
- `historicalPlayerSlug(firstName, lastName)` — normalized full-name slug identifier for a master
  with no real chess.com handle. Extracted to its own plain (no `'use server'`) file since both of
  its callers (`importHistoricalGames.ts`, `masterPlayers.ts`) have `'use server'`, which requires
  every export to be an async server action — matches the existing `winPct.ts`/`formatCp.ts`/
  `objectiveGameResult.ts` pattern.

### src/lib/master/importHistoricalGames.ts (new)
- `uploadHistoricalPgn(collection, pgnText, level, forceNewRun)` — pipeline stage 1: splits a
  multi-game PGN blob into individual games, truncates and restages `wk_hpg_historicalpgnraw` under
  the given collection label.
- `deconstructHistoricalGames(level, forceNewRun)` — pipeline stage 2: parses every staged game's
  PGN headers directly (no chess.com JSON), resolves/creates `tmst_master_players` rows for every
  unique White/Black name via `resolveHistoricalMasterIdentifiers` (surname match, first-name
  disambiguation on a collision, new handle-less row otherwise), and inserts into `tmgd_gamesdecon`
  (White always `mgd_player`; natural-key dedup on White+Black+end_time+Round since there's no
  chess.com UUID).
- `refreshHistoricalStatus()` — staged/deconstructed counts for the Owner Pipeline page.
- Internal helpers: `getHeader`, `splitIntoGames`, `splitPgnPlayerName`, `parseHistoricalDate`,
  `resolveHistoricalMasterIdentifiers`.

### src/lib/actions/masterPlayers.ts
- `getMasterHandleNameMap` now keys every master (not only ones with a real handle) — falls back to
  `historicalPlayerSlug` for a master with `mst_chesscom_handle IS NULL`, matching the identifier
  `deconstructHistoricalGames` writes as `mgd_player`.

### src/app/api/historicalgames/upload/route.ts (new), src/app/api/historicalgames/deconstruct/route.ts (new)
- Thin route wrappers for `uploadHistoricalPgn` (POST, JSON body) and `deconstructHistoricalGames`
  (GET, query params), mirroring the existing `/api/mastergames/*` route style.

### src/app/owner/pipelinehistoricalgames/page.tsx (new)
- New Owner Pipeline page: collection-label input + multi-file `.pgn` picker, 4 numbered steps (Upload
  PGN Collection, Deconstruct Historical Games — both new; Build Master Position Tree, Sync Master
  Position Tree — both reuse the existing `/api/mastergames/build-tree`/`/api/mastergames/sync-tpos`
  endpoints unchanged), Jobs summary table + Run All, mirroring `/owner/pipelinemastergames`'s
  layout/conventions.

### src/app/owner/page.tsx
- Registered the new page in `TOOLS_MASTERS` (Pipeline > Masters tab).

### src/app/owner/constants/page.tsx
- Added `PIPELINE_TYPE_HISTORICALGAMES` to the Pipeline Types section and a new "Historical Games
  Import (bulk PGN collections)" heading with `HISTORICAL_TIME_CLASS`.

## Testing
- [ ] Open `/owner/pipelinehistoricalgames`. Confirm the Jobs summary shows a completed run for all
      4 steps, and the Run Pipeline table's Status column shows 964 games deconstructed, 0 remaining
      for Build/Sync Position Tree.
- [ ] Open `/owner/masterplayers`, search "Steinitz" (or "Zukertort", "Capablanca", "Lasker", etc.)
      and confirm a row exists with no chess.com handle — these are the 31 newly-created historical
      master players.
- [ ] Open `/mastergames`, find a World Chess Championship game (e.g. search Steinitz or Zukertort),
      open it on `/analyzemaster`, and confirm: the board/move list loads correctly, the date shown
      is the real historical date (e.g. a Steinitz vs. Zukertort game from January 1886 — not
      shifted to any other year), and Moves Played/Games Played panels work normally.
- [ ] Confirm an already-tracked master with a real chess.com handle (e.g. Magnus Carlsen, Fabiano
      Caruana) still shows correctly on `/mastergames` and `/analyzemaster` — their existing games
      should be completely unaffected by this import.
- [ ] Open `/owner/constants` and confirm `PIPELINE_TYPE_HISTORICALGAMES` and `HISTORICAL_TIME_CLASS`
      appear with their descriptions.
- [ ] On `/owner/pipelinehistoricalgames`, try uploading one of the 20 source PGN files again (with
      the same collection label) and running Deconstruct — confirm it reports 0 newly processed (all
      already present), verifying the pipeline is safely re-runnable.

### scripts/schema.sql
- Added `mgd_event`/`mgd_round` nullable text columns to `tmgd_gamesdecon` (appended at the end of
  the column list) to preserve tournament context for historical-collection imports.
- Added new workfile table `wk_hpg_historicalpgnraw` (`hpg_collection text NOT NULL`, `hpg_pgn text
  NOT NULL`, indexed on `hpg_collection`, no PK — matches the existing workfile-table style) for
  staging a bulk PGN-file upload before deconstruction.
- Widened `mgd_end_time` from `integer` to `bigint` (found necessary mid-import — a 32-bit integer
  can't hold a Unix timestamp before 1901-12-13, and several WCC games predate that). Also required
  a new `xrtg_routing` row (`wk_hpg_historicalpgnraw` → `POSTGRES_URL1`, run by the user as a plain
  `INSERT`, not a schema change) so the new staging table resolves to the masters database.
