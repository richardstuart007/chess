# chess — project skill file

## Origin and purpose

This project consolidates and replaces two prior projects:
- **`nextjs-chess`** (`C:\Users\richa\claude\github\nextjs-chess`) — the original chess app: game sync, game browsing, single-game Stockfish analysis (`tsa_savedanalyses`, `tgev_game_evals`), player ratings, auth.
- **`next-chess-analysis`** (`C:\Users\richa\claude\github\next-chess-analysis`) — a pattern-analysis pipeline forked/scaffolded from `nextjs-chess`: position-tree building, reach-based habit detection, batch Stockfish evaluation, Habits/Quiz/Position Detail UI.

Since the fork, both projects have independently synced the *same* chess.com players' games into separately-evolved copies of `tgr_gamesraw`/`tgd_gamesdecon`, and their schemas/conventions have drifted apart. Rather than reconciling two live, diverged databases, this project does a **fresh sync from chess.com** and rebuilds cleanly — porting over the lessons below and (selectively, TBD) already-built analysis data from `next-chess-analysis`.

**Do not treat this as a from-scratch product.** Read both source projects' code before designing anything — most of what's needed already exists and works; the point of the rebuild is a clean, unified schema and function set, not new functionality.

## What's different between the two source projects (chess vs. analysis)

TBD — to be filled in collaboratively with the user, who knows both projects' current functional scope in detail. Do not assume; ask before designing.

## Critical lessons from the next-chess-analysis cleanup session — read before designing the schema

These were discovered the hard way over a long session. Rediscovering them will cost real time — read this list first.

1. **The chess.com sync "refresh" cutoff has a hidden dependency.** `nextjs-shared/chess/sync.ts`'s `getLatestGameEndTime()` reads `MAX(gr_end_time) FROM tgr_gamesraw` to know where incremental sync resumes. If this project doesn't keep raw game JSON/PGN indefinitely (likely, given `tgr_gamesraw` is otherwise unused after deconstruction), that cutoff logic needs to read from somewhere else *before* any truncation/archiving happens — e.g., a `latest_synced_end_time` column on a one-row-per-player table — or every sync will look like "no history" and re-fetch + re-insert the entire chess.com archive.

2. **Table naming conventions** (per the global CLAUDE.md, apply here too): `t` + 3-char identifier + `_` + name for project tables (`x` + 3-char for `nextjs-shared`-owned tables). The 3-char identifier must be unique across the *entire* schema — check before creating a table. Surrogate primary keys should follow `{prefix}_{prefix}id` (e.g. `gam_gamid`, `gd_gdid`) — `next-chess-analysis` had real drift here (`eva_id`→`eva_evaid`, `qui_id`→`qui_quiid` fixed late; `tpos_positions.pos_id` was left as an accepted, scale-driven exception, not fixed). Get this right from row one in the new schema — it's far more painful to fix after data accumulates.

3. **Position "reach" must count both directions.** If tracking "how often has this exact board position been reached," it can happen either as a tracked player's own deliberate move choice, or as the position immediately after any tracked move (the opponent's resulting position). A position can be one thing in one game and the other in a different game — the true reach count is the sum of both, not either alone. See `recomputePosReached()` in `next-chess-analysis/src/lib/analysis/buildPositionTree.ts` for a reference implementation.

4. **Any "before/resulting position" pair table has two independent references that need independent purge/archive handling.** If a row references both a "before" position and a "resulting" position (two different surrogate IDs), never delete/archive the row based on either reference alone — a row can have an out-of-scope resulting position while its before-position is still very much in scope (and vice versa). Rule: full-delete only when the *before* reference is out of scope; null out just the resulting reference otherwise, keep the row.

5. **Any reach-based (or similar "no repeating pattern") purge needs a grace period.** A position always starts at reach=1 the moment it's first created. A purge rule of "delete reach=1 positions" applied without a time floor would delete every newly-tried opening before it ever gets a second chance to repeat. Solution used: only purge if the position's one occurrence is 30+ days old (derived from the game's own end-time, no extra column needed). Whatever the new design's equivalent concept is, give it the same protection.

6. **Move-number ceiling, data-verified (re-verify with fresh data before trusting the exact number)**: in `next-chess-analysis`'s dataset, 0% of positions past move ~18 had ever been reached more than 3 times — repeat/habit value drops off sharply starting around move 14-16. Worth tracking positions only up to a data-justified ceiling (was 16 there) rather than an arbitrary high number — avoids generating large amounts of data that will only ever need purging later. Re-derive this from scratch in the new project once real data exists; don't just copy the number blindly.

7. **`pg_stat_user_tables.n_live_tup` is a stale estimate, not a live count.** It only updates when `ANALYZE`/autovacuum runs. A table can show 0 rows despite having real data if it's never been analyzed. Always check `last_analyze`/`last_autoanalyze` before trusting a row-count query, or just run `ANALYZE` first.

8. **A client-side Bash/psql timeout does not kill the server-side Postgres query.** If a long-running query appears to time out from a tool call, check `pg_stat_activity` (`WHERE state != 'idle'`) afterward and `pg_terminate_backend()` anything still running — otherwise it silently keeps consuming CPU/I/O and can badly slow down later, unrelated queries (this caused real confusion more than once).

9. **Per-move/per-occurrence breakdowns (e.g., "which move did I play from this position, how often, what was the win rate") typically have no cache — they're computed live from raw occurrence rows every time.** If any archiving/pruning strategy removes raw occurrence rows, this kind of breakdown silently loses historical detail for archived games, even though aggregate stats (like total reach) can survive fine if cached separately. Decide up front whether this is an acceptable tradeoff (breakdown only reflects non-archived/recent data) or whether a frozen aggregate needs designing in — don't leave this undecided until users notice the numbers changed.

10. **Postgres `IDENTITY` surrogate keys never reuse deleted IDs.** This makes dangling foreign-style references safe by construction — a stale reference can never accidentally start pointing at a different, unrelated row later. Useful to know when deciding whether a cleanup step is strictly necessary vs. just good hygiene.

## Global conventions

This project is a normal Next.js project under `C:\Users\richa\claude\github` — all conventions from `C:\Users\richa\.claude\CLAUDE.md` (global) apply as-is: plan-by-default workflow, all DB schema/data changes as SQL given in chat and run manually via pgAdmin4 (never executed by Claude, never scripted), `scripts/schema.sql` as the single source of truth, the full coding-convention set (function headers, comment format, `GENERATED BY DEFAULT AS IDENTITY`, etc.).

## Open decisions — to be made with the user, not assumed

- Exact function/database choices: which existing functions from `nextjs-shared`, `nextjs-chess`, and `next-chess-analysis` get ported as-is, rewritten, or dropped entirely.
- Whether this project fully replaces both source projects, or has a narrower scope (e.g., analysis-only, with `nextjs-chess` continuing to exist for non-analysis features).
- Archive/purge strategy specifics for this project (frozen aggregates vs. accepted historical-detail-loss tradeoffs — see lesson 9).
- Whether/how to migrate `next-chess-analysis`'s already-built analysis data (`tpos_positions`/`teva_evaluations` — expensive Stockfish work) versus starting that fresh too. If migrating, game IDs need remapping from old to new via the stable natural key (player username + chess.com UUID), since a fresh sync assigns new surrogate IDs.

**Do not make any of the above decisions unilaterally. Ask the user first — this project's whole premise is deliberate, collaborative design, not a default carried over from either source project.**
