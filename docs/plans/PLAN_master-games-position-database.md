# PLAN_master-games-position-database — chess

## Title
Master games position database (proof of concept — Magnus Carlsen, 2026)

## Plan

Builds a pre-computed position index for master players' own chess.com games, mirroring the
existing raw→deconstruct→position-tree pipeline used for tracked players, but stored in a new
**second physical database** (`local_chess_masters` locally, `POSTGRES_URL1`) via nextjs-shared's
multi-database routing (`xrtg_routing`). This replaces the old idea of live-scanning a master
player's entire chess.com history per FEN lookup (far too slow) with an indexed local query.
Scoped as a proof of concept: **Magnus Carlsen only, 2026 games only**, to prove the pipeline works
end-to-end before expanding to the other 148 tracked master players.

**Verified against real chess.com data before writing this plan:** chess.com's `time_class` field
is only ever `bullet`/`blitz`/`rapid`/`daily` — no `classical` value exists — and Magnus's recent
archives include `chess960` variant games alongside standard `chess`, which must be filtered out
(`rules === 'chess'`) exactly like the existing player-sync pipeline already does.

**Agreed constants** (`src/lib/constants.ts`, new "Master Games" section — never reused from the
player-pipeline's own constants, per explicit instruction that master-domain naming must stay
visibly distinct):
- `MASTER_INCLUDED_TIME_CLASSES = ['blitz', 'rapid']` (bullet excluded; `'daily'` not included —
  confirmed by the user)
- `MASTER_MIN_ANALYSIS_MOVE = 4` (same starting value as `MIN_ANALYSIS_MOVE`, own constant)
- `MASTER_MAX_ANALYSIS_MOVE = 16` (same starting value as `MAX_ANALYSIS_MOVE`, own constant)
- `MASTER_POSITION_INSERT_CHUNK_SIZE = 500` (same starting value as `POSITION_INSERT_CHUNK_SIZE`,
  own constant)

**New tables** (all in the **secondary** database — `local_chess_masters` — none in primary), keyed
by the lowercased chess.com username string (`mgr_player`/`mgd_player`), never by `mst_mstid`, so no
query ever needs to join back to `tmst_master_players` in the primary database:

| Table | Mirrors | Notes |
|---|---|---|
| `tmgr_mastergamesraw` | `tgr_gamesraw` | Per-run staging: raw PGN/JSON from chess.com |
| `tmgd_mastergamesdecon` | `tgd_gamesdecon` | One row per game — no `gd_positions_purged`/`gd_final_eval` equivalents (no purge, no eval feature for this POC) |
| `tmps_masterpositions` | `tpos_positions` | FEN → reach count |
| `tmgp_mastergamepositions` | `tgam_game_positions` | Per-game (position, move-played) rows — no `gam_cp_change` equivalent |

`tmps_masterpositions`/`tmgp_mastergamepositions` both live in the secondary DB, so
`getMasterMovesForPosition` can join them in one SQL statement exactly like the existing
`getMovesForPosition` does — the no-cross-database-join constraint only bites when a query would
need to reach into the primary database at the same time (e.g. resolving `mst_mstid` → player name),
which this design avoids entirely by keying everything off the username string instead.

No `tpur_workfile`/purge equivalent (a position reached only once by a master player is exactly the
interesting signal here, not noise to discard) and no `mst_last_synced_end_time` sync-cursor column
yet (deferred — the POC always does a fresh one-year pull, not an incremental resume; needed once
this expands beyond a single bounded year).

- [ ] Add the 4 new constants to `src/lib/constants.ts` ("Master Games" section) and mirror them
      into `src/app/owner/constants/page.tsx` per project convention
- [ ] Add the 4 new table definitions to `scripts/schema.sql` (source of truth for structure, even
      though these tables physically live in the secondary database)
- [ ] Give the user, in chat, the exact `CREATE TABLE` SQL for the 4 tables (to run against
      `local_chess_masters`) and the `INSERT INTO xrtg_routing` rows (to run against `local_chess`,
      the primary DB, since routing control always lives there) — never run by Claude
- [ ] Build `src/lib/master/masterSync.ts` — `syncMasterGames(chesscomHandle, year)`: fetches that
      player's chess.com archives for the given year only, filters `rules === 'chess'` and
      `MASTER_INCLUDED_TIME_CLASSES.includes(time_class)`, inserts into `tmgr_mastergamesraw`
- [ ] Build `src/lib/master/masterDeconstruct.ts` — `deconstructMasterGames(chesscomHandle)`: mirrors
      `deconstructGames`, reads `tmgr_mastergamesraw`, writes `tmgd_mastergamesdecon`; reuses the
      existing shared `tec_ecoreference` table in the primary database unchanged (a second,
      independent `table_write` call, not a join)
- [ ] Build `src/lib/master/masterPositionTree.ts` — `buildMasterPositionTree(chesscomHandle)`:
      mirrors `buildPositionTree`, replays each deconstructed game's PGN and populates
      `tmps_masterpositions`/`tmgp_mastergamepositions` for plies within
      `MASTER_MIN_ANALYSIS_MOVE`..`MASTER_MAX_ANALYSIS_MOVE`
- [ ] Build `src/lib/master/masterChessdb.ts` — `getMasterMovesForPosition(fen)`: single-query join
      (within the secondary database) returning every move played from that FEN across synced
      master games, with counts — mirrors `getMovesForPosition`'s shape
- [ ] Add a minimal POC trigger page `src/app/owner/mastergames/page.tsx`: a button that runs
      sync → deconstruct → build-tree in sequence for the hardcoded POC target
      (`chesscomHandle = 'magnuscarlsen'`, `year = 2026`) and shows the resulting row counts, plus a
      FEN input that calls `getMasterMovesForPosition` and displays the result — proves the pipeline
      end-to-end without building any permanent UI yet
- [ ] Re-run `npx tsc --noEmit` and `npm run build` to confirm everything compiles clean

## Changes
