# Dataflow

How data moves through the pipeline, table by table. Expand this doc as new stages/tables are
added or existing ones change.

## Pipeline overview

```
chess.com API
     |
     v
tgr_gamesraw  ---(deconstructGames)--->  tgd_gamesdecon
                                                |
                                    (buildPositionTree / getPositionsFromGame)
                                                |
                                                v
                                    tgam_game_positions
                                    (Phase A — self-contained write,
                                     gam_pos_fen/gam_resulting_fen carry the
                                     FEN text, no tpos_positions dependency)
                                                |
                                     syncTposFromTgam (Phase B)
                                     idempotent, scoped to gam_pos_id IS NULL /
                                     gam_resulting_pos_id IS NULL rows only
                                                |
                                                v
                                       tpos_positions
                                (derived: rows created, ids backfilled onto
                                 tgam_game_positions, pos_reached recomputed)
                                                |
                                                v
                                  purgeStaleReachOnePositions
                                  (daily cron — runs BEFORE evaluation so Stockfish
                                   time is never spent on positions about to be
                                   deleted; deletes low-reach, grace-period-expired
                                   rows from tpos/tgam/teva; stamps
                                   tgd_gamesdecon.gd_positions_purged as a
                                   resurrection guard)
                                                |
                                                v
                                      teva_evaluations
              (Phase 1: straight from tpos_positions, ORDER BY pos_reached DESC
               Phase 2: worklist discovered via tgam_game_positions.gam_resulting_pos_id,
                        still written keyed on tpos_positions.pos_id)
                                                |
                                    bulkUpdateCpLoss
                                  (decoupled own step — gam_cp_change for
                                   tgam rows still NULL, once both sides evaluated)
```

## 1. `tgr_gamesraw` — from chess.com

Per-run **staging table**, not a historical archive. [sync.ts](../src/lib/actions/sync.ts):
- `initSync` ([sync.ts:52-83](../src/lib/actions/sync.ts#L52-L83)) deletes all of a player's
  `tgr_gamesraw` rows *before* fetching anything new ([sync.ts:59-71](../src/lib/actions/sync.ts#L59-L71)).
- `syncArchive` → `insertRawGame` re-populates it from the chess.com monthly archive API.
- The incremental-sync resume cutoff comes from `tpl_players.pl_last_synced_end_time`
  ([players.ts:141-152](../src/lib/actions/players.ts#L141-L152)), stamped by `markPlayerSynced`
  after a successful run — **not** `MAX(gr_end_time)` on this table. This is deliberate: it lets
  `tgr_gamesraw` be wiped/archived freely without breaking resume logic (see chess project
  CLAUDE.md lesson 1).

At any given moment, `tgr_gamesraw` only holds the current run's freshly-downloaded games for
whichever player is mid-sync — it is not a queryable history table.

## 2. `tgd_gamesdecon` — additions from `tgr`

[deconstruct.ts](../src/lib/actions/deconstruct.ts) — `deconstructGames`
([deconstruct.ts:67-...](../src/lib/actions/deconstruct.ts#L67)):
- Reads `tgr_gamesraw` rows not yet present in `tgd_gamesdecon` (`NOT EXISTS` match on
  `gd_chesscom_uuid` + `gd_player`).
- Skips (no row written) when:
  - the raw JSON has no `pgn` field, or
  - `countMoves(pgn) === 0` (zero-move / aborted games).
- Otherwise parses PGN headers and writes one `tgd_gamesdecon` row per game.

## 3 & 4. `tgam_game_positions` drives `tpos_positions`

[buildPositionTree.ts](../src/lib/analysis/buildPositionTree.ts) — `buildPositionTree`:
- `getPositionsFromGame` ([buildPositionTree.ts:47-96](../src/lib/analysis/buildPositionTree.ts#L47-L96))
  replays each `tgd_gamesdecon.gd_pgn` with chess.js and emits one record per tracked-player move
  within the analysis window (`MIN_ANALYSIS_MOVE = 4` to `MAX_ANALYSIS_MOVE = 16`,
  [constants.ts:13,21](../src/lib/constants.ts#L13)). Each record carries a "before" FEN
  (`posFen`) and the "resulting" FEN after the move (`resultingFen`).
- **Phase A — `insertGamePositions` writes `tgam_game_positions` directly**, self-contained: the
  FEN text goes straight into `gam_pos_fen`/`gam_resulting_fen`, with `gam_pos_id`/
  `gam_resulting_pos_id` left `NULL`. No dependency on `tpos_positions` at insert time. Chunked by
  whole games (`chunkByGame`) rather than a flat row count, so a single `INSERT` statement always
  covers a complete game — atomic per game by Postgres's own single-statement guarantee, no
  transaction needed.
- **Phase B — `syncTposFromTgam` derives `tpos_positions`**, idempotent and safely re-runnable at
  any time: (1) inserts any `tpos_positions` row still missing for a FEN referenced by an
  unresolved `tgam_game_positions` row (`gam_pos_id`/`gam_resulting_pos_id IS NULL`) — `pos_color`
  is derived straight from the FEN's own active-color field, not carried as a separate column;
  (2) backfills `gam_pos_id`/`gam_resulting_pos_id` by FEN match, capturing which `pos_id`s were
  touched; (3) recomputes `pos_reached` only for those touched positions (reach counts both
  `gam_pos_id` and `gam_resulting_pos_id` matches — see chess project CLAUDE.md lesson 3). Because
  it's scoped by `IS NULL`, already-resolved history is never rescanned, and a batch that dies
  partway through just leaves more `NULL` rows for the next run to pick up — no permanent drift.

Move-number range: `tgam_game_positions.gam_move_num` only ever spans `MIN_ANALYSIS_MOVE` (4) to
`MAX_ANALYSIS_MOVE` (16) — the tracked player's own moves. `tpos_positions.pos_move_num` is set by
`recomputePosReachedByIds` to `MIN(gam_move_num)` across every occurrence (before or resulting
side) of that position — the earliest move number it's ever been reached at. Since the same board
position can be reached at different move numbers via transposition in different games, this is a
"first-known" value, not a fixed property of the position — it's recomputed (never just written
once) every time the position is touched again, so it stays correct if a newer game reaches it
earlier than any prior occurrence. `pos_ply_count` remains unused/`NULL`. `pos_color` is the only
other derived column, load-bearing for CP normalization in `enrichPositionsStockfish.ts`.

**Resolved (2026-07-12):** ~319k `tpos_positions` rows previously had a wrong `pos_reached` value
(mostly stale, a small fraction truly orphaned) because the old design wrote `tpos_positions`
*before* `tgam_game_positions` across four separate non-transactional steps — a partial failure
left them out of sync with no way to self-heal. One-time data repair (full recompute + orphan
cleanup) was run manually via SQL; the redesign above (`tgam` as source of truth, `tpos` fully
derived and idempotently rebuildable) removes the underlying cause rather than just the symptom.

## 5. Purge — reach-based cleanup of `tpos`/`tgam`/`teva`, runs before evaluation

[purgePositions.ts](../src/lib/analysis/purgePositions.ts) — `purgeStaleReachOnePositions`, run
automatically on the daily analysis cron ([cron/route.ts](../src/app/api/analysis/cron/route.ts)),
**before** Evaluate Positions/Update CP Change — deliberately ordered so Stockfish time is never
spent evaluating a position that's about to be deleted. **Deliberate exception to the standing "no
destructive SQL in automation" rule** — see project `.claude/CLAUDE.md` for the approval record.

- **Two-stage candidate query**: cheap, indexed filter first (`tpos_positions.pos_reached <=
  MIN_REACH_TO_KEEP`), *then* join only that small candidate set through `tgam_game_positions` →
  `tgd_gamesdecon` to confirm every occurrence (before or resulting side) is older than
  `PURGE_REACH_GRACE_DAYS` (both constants in [constants.ts](../src/lib/constants.ts)) — driving
  from the small reach-filtered set is far cheaper than starting from "every old game," since most
  of `tgd_gamesdecon` is older than the grace period at any given time.
- **Candidate refinement (2026-07-13)**: a position can independently qualify by reach/age yet
  still be needed as the *after*-position of a `tgam` row whose own *before*-position doesn't
  qualify — that row would survive the purge, so the position can't actually be deleted without
  leaving the row referencing something gone. Before any deletes run, the candidate set is refined:
  repeatedly exclude any candidate still referenced as `gam_resulting_pos_id` by a row whose own
  `gam_pos_id` isn't (currently) also a candidate, looping until stable (excluding one candidate
  can change whether another, dependent on it, should also be excluded — a single pass isn't
  sufficient for correctness, only an approximation). Implemented as a JS-side loop refining an
  id array via repeated `= ANY($1)` queries, **not** a database temp table — `nextjs-shared/db`'s
  local Postgres handler opens a brand-new connection per `db.query()` call and closes it
  immediately after, so a temp table created in one call is invisible to the next.
- **Delete order** (using the *refined* candidate set): `teva_evaluations` for the set →
  `tgam_game_positions` where `gam_pos_id` in the set (full delete — before-position out of scope)
  → stamp `tgd_gamesdecon.gd_positions_purged` on any game now left with zero `tgam` rows → delete
  the `tpos_positions` rows. **No null-out/flag step** — refinement already guarantees every row
  touching a final candidate, as either its own before or an after pointing to it, is captured by
  the `gam_pos_id`-based delete, so nothing is ever left referencing a deleted position.
- **`gd_positions_purged` resurrection guard**: without it, a game purged down to zero `tgam`
  rows is indistinguishable from a never-processed one (`buildPositionTree`'s `NOT EXISTS` check
  can't tell them apart), so the next Build Position Tree run would silently regenerate exactly
  what the purge just removed. `buildPositionTree`'s game-selection and stats queries, and
  `pipelineStatus.ts`'s equivalents, all check `NOT gd_positions_purged` alongside the
  `NOT EXISTS` check. **Confirmed live, not theoretical** — deleting this guard's precursor
  (`__too_short__` sentinel rows) without a replacement during this session caused 3,136 already-
  purged games to be reprocessed and their purged positions regenerated from scratch.
- Per-run row cap (`PURGE_ROW_CAP`, in `purgePositions.ts`) as a defense against a logic bug
  inflating the purge set; every step logged via `write_logging`/`logStart`/`logEnd` same as the
  rest of the pipeline.

## 6. `teva_evaluations` — from `tpos`

[enrichPositionsStockfish.ts](../src/lib/analysis/enrichPositionsStockfish.ts) —
`enrichPositionsStockfish`:
- **Phase 1** ([enrichPositionsStockfish.ts:307-323](../src/lib/analysis/enrichPositionsStockfish.ts#L307-L323)):
  selects straight from `tpos_positions` where no `teva_evaluations` row exists yet, `ORDER BY
  pos_reached DESC` — most commonly reached position first.
- **Phase 2** (`getResultingFensToEvaluate`,
  [enrichPositionsStockfish.ts:199-239](../src/lib/analysis/enrichPositionsStockfish.ts#L199-L239)):
  discovers its worklist by joining through `tgam_game_positions.gam_resulting_pos_id`, but still
  writes `teva_evaluations` keyed on `tpos_positions.pos_id`. **Not** ordered by `pos_reached`.
- Both phases' results are concatenated and evaluated in that order — only the Phase 1 portion of
  any given batch is actually reached-ordered.
- Both phases (and the `countRemainingPositions`/`refreshStep4` status queries) filter out
  `pos_reached <= MIN_REACH_TO_KEEP` — belt-and-suspenders alongside running after Purge (§5):
  Purge already removes old, low-reach positions before this step runs, and the filter here also
  protects against evaluating a low-reach position that's still within its grace period (not yet
  purge-eligible, but not worth spending Stockfish time on either). Dynamic, not permanent: a
  position sitting at reach `1` today is skipped now, but becomes eligible again the moment a later
  game reaches it a second time.

## 6b. `bulkUpdateCpLoss` — `gam_cp_change`, decoupled from evaluation

[enrichPositionsStockfish.ts:246-...](../src/lib/analysis/enrichPositionsStockfish.ts#L246) —
`bulkUpdateCpLoss`, its own pipeline stage (`/api/analysis/update-cp-change` route, own panel in
`/owner/pipeline`), not called from `enrichPositionsStockfish` itself. Also runs unattended on the
daily analysis cron ([cron/route.ts](../src/app/api/analysis/cron/route.ts)), after the Evaluate
Positions step.

Back-fills `tgam_game_positions.gam_cp_change` for rows where `gam_cp_change IS NULL` and both the
before position (`gam_pos_id`) and resulting position (`gam_resulting_pos_id`) now have a
`teva_evaluations` row — scoped to `IS NULL` so it only ever writes newly-eligible rows, never
re-touches already-computed ones (a bug fixed 2026-07-12: the original query had no such guard and
rewrote the entire `computed` set on every run).

## Status queries

Ad-hoc SQL for checking pipeline state lives in [pipelineStatus.ts](../src/lib/actions/pipelineStatus.ts)
(`getPipelineStatus`, `refreshStep1/3/refreshTposStatus/4`) and is mirrored as read-only help text
in [owner/pipeline/page.tsx](../src/app/owner/pipeline/page.tsx) (`SQL_STATUS_1/3/3B/4`).
