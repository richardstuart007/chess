import type { ReactNode } from 'react'

const H4 = 'text-base font-semibold text-gray-800 mt-6 mb-2 first:mt-0'
const H5 = 'text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-1'
const P = 'text-sm text-gray-700 mb-3 leading-relaxed'
const UL = 'list-disc list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'
const OL = 'list-decimal list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'
const CODE = 'font-mono text-[0.85em] bg-blue-50 text-blue-800 rounded px-1 py-0.5'

function Code({ children }: { children: ReactNode }) {
  return <code className={CODE}>{children}</code>
}

//----------------------------------------------------------------------------------------------
//  TplPlayersSection
//----------------------------------------------------------------------------------------------
function TplPlayersSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        One row per tracked player: identity, display metadata, and the sync resume cutoff
        (<Code>pl_last_synced_end_time</Code>) that lets <Code>wk_gr_gamesraw</Code> be wiped every
        run without losing incremental-sync progress.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>Chess.com API — one-time, when a player is added via the Maintenance page.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        A player row is created once, from chess.com&apos;s profile and stats; after that, only the
        sync cutoff timestamp is ever updated.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Add player - Maintenance Page</li>
        <li>Sync cutoff - update <Code>pl_last_synced_end_time</Code></li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>pl_last_synced_end_time</Code> (read by <Code>initSync</Code> as the resume cutoff)
        and the player list itself (read by <Code>getPlayers</Code>).
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Shared PlayerProfile header / game sync</h5>
      <p className={P}>
        <Code>getPlayers</Code> — the player list driving both the cron sync loop and the shared
        PlayerProfile header/nav (<Code>AppShell.tsx</Code>, rendered from the root layout), which
        reads <Code>getPlayer</Code>/<Code>getPlayerRatings</Code> per player once and shows it
        above every page except <Code>/owner/*</Code>. Player selection there writes to a shared{' '}
        <Code>?player=</Code> URL query param, which <Code>HomeDashboard</Code>, the Habits page,
        and the Graph page all read instead of each keeping their own player-selection state.
      </p>
      <h5 className={H5}>wk_gr_gamesraw</h5>
      <p className={P}>
        <Code>initSync</Code> reads <Code>pl_last_synced_end_time</Code> to decide where to resume
        (see <Code>wk_gr_gamesraw</Code>&apos;s Processing).
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <p className={P}>
        <Code>pl_avatar</Code> and <Code>pl_display_name</Code> are set once at add-time and never
        refreshed afterward — no code path calls <Code>upsertPlayer</Code> again for an existing
        player. (<Code>pl_rating_blitz</Code> used to have the same issue, plus was never actually
        written by the one real call site in the first place — dropped 2026-07-15.) The rating
        actually shown on the Home dashboard comes from a separate table,{' '}
        <Code>tplr_player_ratings</Code>, kept fresh by the daily <Code>updatePlayerRating</Code>{' '}
        cron step.
      </p>
      <p className={P}>
        <Code>pl_avatar</Code> stores chess.com&apos;s own hosted image URL as text, not a
        downloaded copy — <Code>PlayerProfile.tsx</Code> renders it as{' '}
        <Code>{'<img src={pl_avatar}>'}</Code> directly. The app never fetches this image again
        after add-time, but it still depends on chess.com continuing to serve that exact URL
        indefinitely. See <Code>.claude/CLAUDE.md</Code> Outstanding items for the suggestion to
        store the image itself.
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  ChessComApiSection
//----------------------------------------------------------------------------------------------
function ChessComApiSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Source of all game and player data for the whole pipeline — every synced game, plus a
        player&apos;s profile and ratings when first added. External system, not a table —
        Input/Processing don&apos;t apply the way they do for the rest of this doc.
      </p>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        Three endpoints, all under <Code>https://api.chess.com/pub</Code>:
      </p>
      <ul className={UL}>
        <li>
          <Code>/player/{'{username}'}/games/archives</Code> + each monthly archive — full game
          list (PGN, players, ratings, time class, result) — <Code>sync.ts</Code>
        </li>
        <li>
          <Code>/player/{'{username}'}</Code> — profile (avatar, display name) —{' '}
          <Code>fetchPlayer</Code> in <Code>chesscom.ts</Code>
        </li>
        <li>
          <Code>/player/{'{username}'}/stats</Code> — ratings per time class —{' '}
          <Code>fetchPlayerStats</Code> in <Code>chesscom.ts</Code>
        </li>
      </ul>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Game sync</h5>
      <p className={P}>
        <Code>sync.ts</Code>&apos;s <Code>initSync</Code>/<Code>syncArchive</Code> — feeds{' '}
        <Code>wk_gr_gamesraw</Code>.
      </p>
      <h5 className={H5}>Add player</h5>
      <p className={P}>
        Maintenance page (<Code>fetchPlayer</Code>/<Code>fetchPlayerStats</Code>) — feeds{' '}
        <Code>tpl_players</Code>, one-time at add.
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TgrGamesrawSection
//----------------------------------------------------------------------------------------------
function TgrGamesrawSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Stage a player&apos;s freshly-downloaded chess.com games for one sync run; not a
        historical archive. It&apos;s fully cleared and rewritten on <em>every</em> sync (not just
        &quot;full replace&quot;) — the resume cutoff comes from{' '}
        <Code>tpl_players.pl_last_synced_end_time</Code>, not this table&apos;s own contents,
        specifically so it can be wiped/archived freely without breaking incremental sync
        (CLAUDE.md lesson 1). At any moment it only holds the current run&apos;s games for
        whichever player is mid-sync.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>Chess.com API</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Clears the player&apos;s existing rows, then re-downloads and inserts every game from the
        resume point forward.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Clear staging - deletes the player&apos;s rows first, every sync (not just &quot;refresh&quot;)</li>
        <li>Fetch archive list - on refresh, resume cutoff comes from <Code>tpl_players</Code></li>
        <li>Download + insert - only rules-chess games in an included time class; skips anything at/before the cutoff</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>wk_gr_gamesraw</Code> itself: one row per game — raw JSON, PGN, end time, time class.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>tgd_gamesdecon</h5>
      <p className={P}>
        <Code>deconstructGames_Player</Code> reads every row not yet present there.
      </p>
      <h5 className={H5}>Maintenance page</h5>
      <p className={P}>
        <Code>getGameCount</Code> (<Code>games.ts</Code>) — total game count per player, shown on{' '}
        <Code>/owner/maintenance</Code>.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <p className={P}>
        &quot;Refresh&quot; sync still fully clears staging first, not additive — easy to assume
        otherwise from the name. <Code>games.ts</Code> also has its own{' '}
        <Code>getRecentGames</Code>/<Code>insertRawGame</Code> on this table, but they&apos;re dead
        code (never imported anywhere) — the live sync path uses <Code>sync.ts</Code>&apos;s own
        versions instead.
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TgdGamesdeconSection
//----------------------------------------------------------------------------------------------
function TgdGamesdeconSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Parses each raw chess.com game into structured, queryable columns — opening, ECO code,
        result, ratings, termination, time class. The first point where a game becomes visible to
        the games list and the analysis pipeline.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>wk_gr_gamesraw</Code></p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Reads raw games not yet deconstructed, skips ones too short to ever produce a trackable
        position, parses PGN headers, and writes one row per game.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Select - rows not yet in <Code>tgd_gamesdecon</Code> (matched on <Code>gd_chesscom_uuid</Code> + <Code>gd_player</Code>)</li>
        <li>Skip - no <Code>pgn</Code> field, or 6 or fewer half-moves (can never reach <Code>MIN_ANALYSIS_MOVE_Player</Code>)</li>
        <li>Parse + insert - PGN headers, opening, termination, per-player color/result/opponent</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>tgd_gamesdecon</Code> — one row per game. Also upserts <Code>tec_ecoreference</Code>{' '}
        (ECO code → opening name) as a side effect whenever both are present — write-only today,
        nothing reads it back yet.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>tgam_game_positions</h5>
      <p className={P}>
        <Code>buildPositionTree_Player</Code> replays <Code>gd_pgn</Code>.
      </p>
      <h5 className={H5}>Home dashboard</h5>
      <p className={P}>
        Games list, opening/termination stats — all read via <Code>games.ts</Code>. Which
        player&apos;s games show is read from the shared <Code>?player=</Code> URL param (see{' '}
        <Code>tpl_players</Code> Consumers above), not local state.
      </p>
      <h5 className={H5}>Graph page</h5>
      <p className={P}>
        Own top-level page/route (<Code>/graph</Code>, separate from the Home dashboard&apos;s tab
        set) — reads <Code>fetchFilteredGames</Code> live via <Code>games.ts</Code> for the
        &quot;Rating Over Time&quot; chart, same as Home dashboard&apos;s Games list does, but with
        its own filter state (date range/time class/records limit; player comes from the shared{' '}
        <Code>?player=</Code> param, same as every other page) instead of the shared{' '}
        <Code>GameFilterPanel</Code>/filters object. Separated the same way Habits was (own route,
        own filters) — but unlike Habits, not backed by a materialized/pipeline-built table, since
        this query is a plain indexed read, not an expensive derived computation. The{' '}
        <Code>AppNav</Code>/PlayerProfile header itself is no longer rendered per-page — it comes
        from the root layout&apos;s <Code>AppShell</Code> (see <Code>tpl_players</Code> Consumers).
      </p>
      <h5 className={H5}>tpl_players</h5>
      <p className={P}>
        <Code>updatePlayerRating</Code> reads the latest rating per time class.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <p className={P}>
        A game is skipped once it&apos;s 6 or fewer half-moves — not just true zero-move games.
        The threshold is derived from <Code>MIN_ANALYSIS_MOVE_Player</Code>, not hardcoded, so it moves
        automatically if that constant changes.
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TgamGamePositionsSection
//----------------------------------------------------------------------------------------------
function TgamGamePositionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        <strong>Produce a centipawn change per ply.</strong>
      </p>
      <p className={P}>
        Each row captures one ply — either side&apos;s turn, not just the tracked player&apos;s
        own. In standard chess notation a &quot;move&quot; is White&apos;s ply plus Black&apos;s
        reply (two plies sharing one move number); a <Code>tgam</Code> row brackets just one side
        of that: <Code>gam_pos_fen</Code> is the board right before the ply,{' '}
        <Code>gam_resulting_fen</Code> is right after it, before the reply. That before/after pair
        is what makes <Code>gam_cp_change</Code> measurable once both FENs are evaluated — and
        it&apos;s computed purely from whoever&apos;s turn it was at <Code>gam_pos_fen</Code> (
        <Code>tpos_positions.pos_color</Code>), so the same logic already works for either side
        with no tracked-player-specific handling. Queries that must stay scoped to the tracked
        player&apos;s own moves (the Habits page) filter explicitly on <Code>pos_color</Code> vs.
        the game&apos;s player color; queries about the position generally (Position Detail)
        intentionally don&apos;t.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>tgd_gamesdecon</Code></p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Creates a <Code>tpos_positions</Code> record for each position — the &quot;before&quot;
        position and, separately, the &quot;after&quot; position — for every ply.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>
          <em>Insert (Phase A)</em> — Replays <Code>gd_pgn</Code> move-by-move with chess.js (
          <Code>getPositionsFromGame_Player</Code>), deriving the before/after FEN for every ply in the
          analysis window (both sides). Writes one <Code>INSERT</Code> per whole game (chunked by
          game, not row count, so it stays atomic per game). FEN text goes straight into{' '}
          <Code>gam_pos_fen</Code>/<Code>gam_resulting_fen</Code>; <Code>gam_pos_id</Code>/
          <Code>gam_resulting_pos_id</Code> are left <Code>NULL</Code>.
        </li>
        <li>
          <em>Backfill (Phase B, <Code>syncTposFromTgam_Player</Code>)</em> — idempotent, re-runnable any
          time. Fills <Code>gam_pos_id</Code>/<Code>gam_resulting_pos_id</Code> by FEN match
          against <Code>tpos_positions</Code>, creating missing <Code>tpos_positions</Code> rows
          as needed.
        </li>
        <li>
          <em>CP-change backfill (<Code>bulkUpdateCpLoss</Code>)</em> — separate pipeline stage,
          own cron step. Fills <Code>gam_cp_change</Code> once both the before and after position
          have a <Code>tpose_positions_eval</Code> row.
        </li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tpos_positions</Code></p>
      <p className={P}>
        One record created (or matched) for each of the &quot;before&quot; and &quot;after&quot;
        positions of every ply — see Processing above for how the FEN match/create is done.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Position Detail / Analyze page</h5>
      <p className={P}>
        <Code>chessdb.ts</Code> — <Code>getMovesForPosition</Code>/
        <Code>getMoveSummaryForPosition</Code> query <Code>tgam_game_positions</Code> directly and
        live for per-move win/loss/CP breakdowns (<Code>mov_wins</Code>, <Code>mov_losses</Code>,{' '}
        <Code>pose_cp</Code> — the resulting position&apos;s own Stockfish eval, looked up
        directly via <Code>gam_resulting_pos_id</Code>, not averaged). Used by the Position Detail
        page&apos;s &quot;Your Moves&quot; tab and the Analyze page&apos;s &quot;Moves From This
        Position&quot; panel — not the Habits page itself, which reads the separate materialized{' '}
        <Code>thab_habits</Code> table instead.
      </p>
      <h5 className={H5}>Evaluate Positions, Phase 2</h5>
      <p className={P}>
        <Code>enrichPositionsStockfish.ts</Code> — discovers its worklist by joining through{' '}
        <Code>gam_resulting_pos_id</Code>.
      </p>
      <h5 className={H5}>Purge</h5>
      <p className={P}>
        <Code>purgePositions.ts</Code> — deletes rows by <Code>gam_pos_id</Code> membership in the
        refined candidate set.
      </p>
      <h5 className={H5}>tpos_positions</h5>
      <p className={P}>
        Phase B derives/backfills itself from unresolved tgam rows (see Processing above).
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          A revisited position (transposition/repetition within the same game) is <strong>not</strong>{' '}
          deduped — it gets its own row each time. <Code>pos_reached</Code> counts{' '}
          <Code>DISTINCT gam_gdid</Code>, so this doesn&apos;t inflate reach counts, but it does
          mean move-frequency queries see every visit.
        </li>
        <li>
          <Code>pos_reached</Code> (on <Code>tpos_positions</Code>) is one{' '}
          <Code>COUNT(DISTINCT gam_gdid)</Code> over the union of both sides —{' '}
          <Code>gam_pos_id</Code> matches OR <Code>gam_resulting_pos_id</Code> matches — so a game
          that reaches a position once as a &quot;before&quot; position and once as an
          &quot;after&quot; position (e.g. a repeated position later in the same game) still only
          counts once. <strong>Fixed</strong> (2026-07-14) — was previously a sum of two
          independently-deduplicated counts, which double-counted that case.
        </li>
        <li>
          Purge only full-deletes a row when <Code>gam_pos_id</Code> is in the candidate set —
          never based on <Code>gam_resulting_pos_id</Code> alone (the before-position can still be
          in scope even when the after-position isn&apos;t).
        </li>
        <li>
          Every ply is recorded (both sides), not just the tracked player&apos;s own — see Purpose
          above. A row has no column identifying whose move it was; that&apos;s derived at query
          time by comparing <Code>tpos_positions.pos_color</Code> (whose turn it was at{' '}
          <Code>gam_pos_fen</Code>) against the game&apos;s player color on{' '}
          <Code>tgd_gamesdecon</Code>.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TposPositionsSection
//----------------------------------------------------------------------------------------------
function TposPositionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        The deduplicated position tree — one row per unique board position (FEN) reached by any
        tracked-player move or its immediate result, with <Code>pos_reached</Code> counting how
        often. The shared substrate both Habits/Quiz and Stockfish evaluation are built on.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>tgam_game_positions</Code></p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Derived entirely from <Code>tgam_game_positions</Code> — never written to directly by the
        live pipeline. Idempotent: safe to re-run any time, only touches rows still unresolved.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Ensure - insert any missing position for a FEN referenced by an unresolved tgam row</li>
        <li>Backfill - fill <Code>gam_pos_id</Code>/<Code>gam_resulting_pos_id</Code> by FEN match, capturing which positions were touched</li>
        <li>Recompute - <Code>pos_reached</Code>/<Code>pos_move_num</Code> only for the positions touched this run</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>pos_reached</Code> (recomputed count), <Code>pos_move_num</Code> (earliest move
        number ever reached at — see Rules/gotchas), <Code>pos_color</Code> (derived from the FEN
        itself).
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Evaluate Positions</h5>
      <p className={P}>
        <Code>enrichPositionsStockfish.ts</Code> (server batch pipeline) and{' '}
        <Code>EvalProgress.tsx</Code> (browser-run, also on <Code>/owner/pipelinegames</Code>) — two
        separate paths, both order by <Code>pos_reached DESC</Code>.
      </p>
      <h5 className={H5}>Purge</h5>
      <p className={P}>
        <Code>purgePositions.ts</Code> — candidate query starts from{' '}
        <Code>pos_reached &lt;= MIN_REACH_TO_KEEP_Player</Code>.
      </p>
      <h5 className={H5}>Position Detail page</h5>
      <p className={P}><Code>getPositionDetail</Code> (<Code>chessdb.ts</Code>).</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          <Code>pos_move_num</Code> is a &quot;first-known&quot; value, not a fixed property of the
          position — recomputed (never just written once) every time the position is touched
          again, since the same position can be reached at different move numbers via
          transposition in different games.
        </li>
        <li>
          <strong>Resolved (2026-07-14):</strong> <Code>pos_ply_count</Code> was unused/
          <Code>NULL</Code> on the live write path — only the dead, never-called{' '}
          <Code>upsertPosition</Code> (<Code>chessdb.ts</Code>) ever set it. Column and function
          both removed.
        </li>
        <li>
          <strong>Resolved (2026-07-12):</strong> ~319k rows previously had a wrong{' '}
          <Code>pos_reached</Code> (mostly stale, a small fraction truly orphaned) because the old
          design wrote <Code>tpos_positions</Code> <em>before</em>{' '}
          <Code>tgam_game_positions</Code> across four separate non-transactional steps — a
          partial failure left them out of sync with no way to self-heal. One-time manual SQL
          repair; the current design (tgam as source of truth, tpos fully derived/idempotent)
          removes the underlying cause.
        </li>
        <li>
          See also the <Code>pos_reached</Code> double-counting issue noted under{' '}
          <Code>tgam_game_positions</Code>&apos;s Rules/gotchas — same root computation,
          referenced here since this is the table it writes to.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  PurgeSection
//----------------------------------------------------------------------------------------------
function PurgeSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Delete low-value positions — and everything that depends on them — once they&apos;ve had a
        fair chance to repeat and didn&apos;t, so the position tree doesn&apos;t grow forever. Runs
        automatically on the daily cron, <em>before</em> Evaluate Positions/Update CP Change, so
        Stockfish time is never spent evaluating a position that&apos;s about to be deleted.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>
        <Code>tpos_positions</Code> — candidates start from{' '}
        <Code>pos_reached &lt;= MIN_REACH_TO_KEEP_Player</Code>.
      </p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        A cheap candidate query, then ordered deletes across four tables — no cross-candidate
        refinement; dangling references are handled by nulling out the specific pointer, not by
        protecting the position.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>
          Candidate query - indexed filter on <Code>pos_reached</Code> first, then confirm every
          occurrence is older than <Code>PURGE_REACH_GRACE_DAYS_Player</Code> by joining through{' '}
          <Code>tgam_game_positions</Code> → <Code>tgd_gamesdecon</Code> (capped to{' '}
          <Code>PURGE_ROW_CAP</Code> rows, plain <Code>LIMIT</Code> on the seed — safe, since no
          candidate&apos;s eligibility depends on which other candidates are in the same batch)
        </li>
        <li>
          Delete - <Code>tpose_positions_eval</Code> → <Code>tgam_game_positions</Code> full-deleted
          where <Code>gam_pos_id</Code> is a candidate → <Code>tgam_game_positions.gam_resulting_pos_id</Code>{' '}
          nulled out (row kept) where only that side is a candidate → stamp{' '}
          <Code>tgd_gamesdecon.gd_positions_purged</Code> on emptied games → <Code>tpos_positions</Code>
        </li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        Rows removed from <Code>tpose_positions_eval</Code>, <Code>tgam_game_positions</Code>,{' '}
        <Code>tpos_positions</Code>. <Code>tgam_game_positions.gam_resulting_pos_id</Code> nulled
        out (row kept) on rows whose before-position wasn&apos;t a candidate.{' '}
        <Code>tgd_gamesdecon.gd_positions_purged</Code> set true on any game left with zero{' '}
        <Code>tgam</Code> rows.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>tgam_game_positions (Build Position Tree)</h5>
      <p className={P}>
        <Code>buildPositionTree_Player</Code> checks <Code>gd_positions_purged</Code> alongside its own{' '}
        <Code>NOT EXISTS</Code> check, so a purged game is never mistaken for an unprocessed one
        (see Rules/gotchas).
      </p>
      <h5 className={H5}>Status queries</h5>
      <p className={P}>
        <Code>pipelineStatus.ts</Code> checks the same flag for its counts.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          The candidate query is deliberately cheap-filter-first (reach, then age) rather than
          starting from &quot;every old game&quot; — most of <Code>tgd_gamesdecon</Code> is older
          than the grace period at any given time, so filtering by reach first is far cheaper.
        </li>
        <li>
          No cross-candidate refinement — each candidate is independently safe to process
          regardless of which other candidates are in the same batch, since dangling references
          are resolved by nulling out the specific pointer (on the referencing row) rather than
          protecting the referenced position from deletion. An earlier design used an iterative
          fixpoint refinement loop instead; replaced (2026-07-15) once it became too slow at scale
          (multi-minute stalls) and was more complex than the documented before/resulting-pair rule
          actually requires.
        </li>
        <li>
          <Code>gd_positions_purged</Code> is a resurrection guard, confirmed live not theoretical:
          deleting its precursor without a replacement once caused 3,136 already-purged games to be
          silently reprocessed and their purged positions regenerated from scratch.
        </li>
        <li>
          No per-run row cap (removed 2026-07-15) — every eligible candidate is purged in one run.
          The earlier cap (<Code>PURGE_ROW_CAP</Code>) limited pace, not risk: since candidates are
          processed independently, a logic bug would be equally catastrophic
          (rebuild-from-scratch) whether it affected a capped batch or the full set, so the cap
          wasn&apos;t actually bounding blast radius.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  PoseEvaluationsSection
//----------------------------------------------------------------------------------------------
function PoseEvaluationsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        One Stockfish evaluation per unique position — centipawn score (normalized to
        white&apos;s perspective) and best move. The evaluation layer Habits, Quiz, Position
        Detail, and cp-change are all built on.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>tpos_positions</Code></p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Evaluates unevaluated positions with Stockfish, most-reached first, writing one row per
        position.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Phase 1 - straight from <Code>tpos_positions</Code>, <Code>pos_reached &gt; MIN_REACH_TO_KEEP_Player</Code>, most-reached first</li>
        <li>Phase 2 - resulting positions discovered via <Code>gam_resulting_pos_id</Code>, not reach-ordered</li>
        <li>Normalize - Stockfish reports from the side-to-move&apos;s perspective; flipped to white&apos;s here</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>tpose_positions_eval</Code> — one row per position (<Code>pose_pos_id</Code> unique,
        upserted so re-runs are safe): centipawn score, best move (UCI). No search depth is
        actually stored, despite what the <Code>/owner/pipelinegames</Code> help text says.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>bulkUpdateCpLoss</h5>
      <p className={P}>
        Reads both the before and after position&apos;s evaluation to compute{' '}
        <Code>gam_cp_change</Code> (see <Code>tgam_game_positions</Code>).
      </p>
      <h5 className={H5}>Habits / Quiz / Position Detail</h5>
      <p className={P}>CP scores and best moves for drill data and the position detail page.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          Two separate Stockfish engines depending on environment: the native binary (
          <Code>STOCKFISH_PATH</Code> set, local dev, multi-threaded) or the WASM package
          (production/Vercel, the only one that actually runs there, single-threaded so slower).
        </li>
        <li>
          Two separate places trigger this evaluation logic: the server batch pipeline (
          <Code>enrichPositionsStockfish</Code>) and a browser-run alternative (
          <Code>EvalProgress.tsx</Code>, also on <Code>/owner/pipelinegames</Code>) — both write through
          the same <Code>saveEvaluation</Code> upsert.
        </li>
        <li>
          <Code>getEvaluationForPosition</Code> (<Code>chessdb.ts</Code>) is dead code — never
          called.
        </li>
        <li>
          Both evaluation phases filter out <Code>pos_reached &lt;= MIN_REACH_TO_KEEP_Player</Code> —
          belt-and-suspenders alongside running after Purge: Purge already removes old, low-reach
          positions before this step runs, and the filter here also protects a low-reach position
          still inside its grace period (not yet purge-eligible, but not worth spending Stockfish
          time on either). Dynamic, not permanent — a position at reach <Code>1</Code> today
          becomes eligible again the moment a later game reaches it a second time.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  BulkUpdateCpLossSection
//----------------------------------------------------------------------------------------------
function BulkUpdateCpLossSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Backfill <Code>tgam_game_positions.gam_cp_change</Code> once both sides of a move have an
        evaluation — decoupled from Evaluate Positions, its own pipeline step and trigger (own
        cron step, own <Code>/owner/pipelinegames</Code> panel, own{' '}
        <Code>/api/analysis/update-cp-change</Code> route).
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>tpose_positions_eval</Code></p>

      <h4 className={H4}>Processing</h4>
      <p className={P}>
        Single <Code>UPDATE</Code>, scoped to <Code>gam_cp_change IS NULL</Code> so it never
        re-touches already-computed rows: <Code>gam_cp_change</Code> = after-eval minus
        before-eval, sign-flipped for Black so it&apos;s always from the tracked player&apos;s own
        perspective.
      </p>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tgam_game_positions.gam_cp_change</Code></p>

      <h4 className={H4}>Consumers</h4>
      <p className={P}>
        Same as <Code>tgam_game_positions</Code>&apos;s Consumers — same column, same readers.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          Only fires once both <Code>gam_pos_id</Code> and <Code>gam_resulting_pos_id</Code> have
          a <Code>tpose_positions_eval</Code> row — a move whose after-position never gets evaluated
          (e.g. reach too low) keeps <Code>gam_cp_change</Code> permanently <Code>NULL</Code>.
        </li>
        <li>
          <strong>Fixed 2026-07-12:</strong> the original query had no <Code>IS NULL</Code> guard
          and rewrote the entire computed set on every run.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  ThabHabitsSection
//----------------------------------------------------------------------------------------------
function ThabHabitsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        One row per <Code>(player, position, move played)</Code> recurring habit —{' '}
        <strong>both good and bad</strong>, not just mistakes. The materialized aggregation the
        Habits page reads instead of live-aggregating <Code>tgam_game_positions</Code> on every
        request.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>
        <Code>tgam_game_positions</Code> joined to <Code>tgd_gamesdecon</Code> (player/color/
        result) and <Code>tpos_positions</Code> (color match) — every tracked-player move at{' '}
        <Code>move_num &gt;= MIN_ANALYSIS_MOVE_Player</Code>.
      </p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Full recompute every run, not incremental — a habit&apos;s stats can change as new games
        arrive for a move already in the table, so there&apos;s no safe &quot;already
        processed&quot; cursor the way row-insertion steps have one.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>
          Aggregate - group by <Code>(player, pos_id, move_san)</Code>, keep only groups reached{' '}
          <Code>HABITS_MIN_REACH_FLOOR_Player</Code>+ times, filtered to the position&apos;s own color
          matching the player&apos;s color (so opponent moves are excluded)
        </li>
        <li>
          <Code>move_cp</Code> - the single largest-magnitude <Code>gam_cp_change</Code> occurrence
          (sign kept), not an average — see Rules/gotchas
        </li>
        <li>
          <Code>resulting_pos_id</Code> - deterministic per <Code>(position, move)</Code> group,
          captured for the eval-lookup join at read time (not stored as a delta itself)
        </li>
        <li>
          Upsert - keyed on <Code>(player, pos_id, move_san)</Code>; never touches{' '}
          <Code>hab_dismissed</Code>, so a dismissed habit stays dismissed across every future
          rebuild even as its stats keep refreshing
        </li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>thab_habits</Code> — times played, wins, losses, <Code>hab_move_cp</Code> (internal
        detection/sort signal only, never displayed directly), <Code>hab_resulting_pos_id</Code>,{' '}
        <Code>hab_dismissed</Code> flag.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Habits page</h5>
      <p className={P}>
        <Code>getHabitsData</Code>/<Code>getHabitsCount</Code> (<Code>chessdb.ts</Code>) — read{' '}
        <Code>thab_habits</Code> directly. The Bad/Good quality filter (default Bad) reads{' '}
        <Code>hab_move_cp</Code>&apos;s sign; default sort is <Code>ABS(hab_move_cp) DESC</Code>{' '}
        (&quot;Biggest impact first&quot;). The displayed &quot;Eval&quot; column comes from a
        join through <Code>hab_resulting_pos_id</Code> → <Code>tpose_positions_eval.pose_cp</Code> —
        never <Code>hab_move_cp</Code> itself.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          Both good and bad recurring moves are stored — &quot;habit&quot; isn&apos;t synonymous
          with &quot;mistake&quot; (the <Code>WHERE move_cp &lt; 0</Code> filter was removed
          2026-07-19).
        </li>
        <li>
          <Code>hab_move_cp</Code> is clamped to ±<Code>HABITS_MOVE_CP_CLAMP_Player</Code> to stay within
          its <Code>numeric(6,2)</Code> column precision, since mate scores are normalized to
          ±10000 and can exceed it.
        </li>
        <li>
          No incremental &quot;remaining&quot; backlog exists the way other steps have one, since
          this is a full recompute — the Owner &gt; Pipeline page instead shows a genuine count of
          brand-new <Code>(player, position, move)</Code> combinations not yet captured at all,
          computed via the same aggregation shape plus a{' '}
          <Code>LEFT JOIN thab_habits ... WHERE hab_habid IS NULL</Code>.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  EvaluateGameEndingsSection
//----------------------------------------------------------------------------------------------
function EvaluateGameEndingsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Evaluate each game&apos;s <strong>actual final position</strong> — not capped at{' '}
        <Code>MAX_ANALYSIS_MOVE_Player</Code> like the rest of the pipeline — the only place in the app
        that reflects how a game actually ended, rather than its early tracked moves.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>
        <Code>tgd_gamesdecon</Code> — games whose <Code>gd_final_eval</Code> is still{' '}
        <Code>NULL</Code>, latest games (<Code>gd_gdid DESC</Code>) first.
      </p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Two phases: reuse an existing tracked-position eval when the game&apos;s true final
        position happens to already be evaluated (free), then fall back to a fresh Stockfish
        evaluation, spread across concurrent engine instances, for the rest.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Replay - chess.js replays each game&apos;s full <Code>gd_pgn</Code> to its true final position (no move cap)</li>
        <li>
          Reuse (Phase 1) - one batched exact-FEN lookup against{' '}
          <Code>tpos_positions</Code>/<Code>tpose_positions_eval</Code> for the whole run; if a
          game&apos;s final position is already tracked/evaluated (common for games ending within
          the first <Code>MAX_ANALYSIS_MOVE_Player</Code> moves), its <Code>pose_cp</Code> is copied
          directly via one batched multi-row <Code>UPDATE</Code> — no Stockfish call
        </li>
        <li>
          Fresh evaluate (Phase 2) - whatever wasn&apos;t reused is evaluated with Stockfish,
          normalized to white&apos;s perspective, spread across{' '}
          <Code>GAME_ENDINGS_CONCURRENCY_Player</Code> concurrent engine instances on the native-binary
          path (real OS-process parallelism); single-instance on the WASM path (production), since{' '}
          <Code>lite-single</Code> has no worker-thread offload
        </li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>tgd_gamesdecon.gd_final_eval</Code> — Stockfish evaluation (white perspective) of
        each game&apos;s actual final position.
      </p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Analyze page</h5>
      <p className={P}>
        <Code>ChessBoardView.tsx</Code>&apos;s &quot;Games — <Code>&lt;move&gt;</Code>&quot;
        panel&apos;s Final Eval column, via <Code>getGamesForPosition</Code> (<Code>chessdb.ts</Code>).
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          Entirely independent of <Code>tpos_positions</Code>/<Code>tgam_game_positions</Code> as a
          pipeline dependency — reads and writes <Code>tgd_gamesdecon</Code> directly. Own cron
          step (<Code>/api/analysis/evaluate-game-endings</Code>), own{' '}
          <Code>/owner/pipelinegames</Code> panel (step 8).
        </li>
        <li>
          Every read here (the reuse lookup, the remaining-count check) must run with{' '}
          <Code>skipCache: true</Code> — see the pipeline-wide caching audit/fix (2026-07-19):{' '}
          <Code>table_query</Code> caches every read by default with no expiry, which is never
          correct for a live maintenance/backlog check.
        </li>
        <li>
          Endings-tab (aggregate win/loss-by-termination chart) display of this data is
          intentionally out of scope so far — planned as separate future work.
        </li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  DeepenPopularPositionsSection
//----------------------------------------------------------------------------------------------
function DeepenPopularPositionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Give frequently-reached positions a deeper (more trustworthy) Stockfish evaluation than
        the default batch depth, in proportion to how popular they actually are — a position
        reached hundreds of times deserves better analysis than one reached just above the purge
        threshold.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>
        <Code>tpos_positions</Code> joined to <Code>tpose_positions_eval</Code> — positions already
        evaluated whose <Code>pos_reached</Code> qualifies for a deeper{' '}
        <Code>POPULAR_POSITION_DEPTH_TIERS_Player</Code> tier than their current <Code>pose_depth</Code>.
      </p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Tiered re-evaluation: the more a position has been reached, the deeper it gets
        re-analyzed, up to three tiers.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>
          <Code>POPULAR_POSITION_DEPTH_TIERS_Player</Code> (<Code>src/lib/constants.ts</Code>) —{' '}
          <Code>pos_reached &gt;= 50</Code> → depth 30, <Code>&gt;= 30</Code> → depth 24,{' '}
          <Code>&gt;= 10</Code> → depth 22
        </li>
        <li>
          Backlog query assigns each candidate row its own qualifying tier&apos;s{' '}
          <Code>target_depth</Code> via a <Code>CASE</Code> expression, filtering to only rows
          where <Code>pose_depth &lt; target_depth</Code>
        </li>
        <li>
          Each qualifying position is re-evaluated with Stockfish at <em>its own</em>{' '}
          <Code>target_depth</Code> — not one uniform depth for the whole batch, since different
          rows can qualify for different tiers
        </li>
        <li>
          Merged via <Code>upgradePositionEvaluation</Code> — the same guarded upgrade (only if
          deeper) and <Code>gam_cp_change</Code> cascade used everywhere else this function is
          called (Analyze page&apos;s Game/Position Analysis)
        </li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        <Code>tpose_positions_eval</Code> — <Code>pose_cp</Code>/<Code>pose_best_move</Code>/
        <Code>pose_depth</Code> upgraded for qualifying positions;{' '}
        <Code>tgam_game_positions.gam_cp_change</Code> recomputed for rows touching an upgraded
        position (via <Code>upgradePositionEvaluation</Code>&apos;s existing cascade).
      </p>

      <h4 className={H4}>Consumers</h4>
      <p className={P}>
        Every reader of <Code>tpose_positions_eval</Code> benefits automatically once a position is
        upgraded — Moves From This Position, the Analyze page&apos;s Position Detail view, and the
        Habits eval column (joined live via <Code>hab_resulting_pos_id</Code>).
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>
          Reuses <Code>upgradePositionEvaluation</Code> rather than a new guarded-UPDATE — no new
          write logic, only new logic for <em>which</em> positions qualify and at what depth.
        </li>
        <li>
          The backlog-count query (<Code>/owner/pipelinegames</Code> panel, step 9) and the batch&apos;s
          own selection query share the same tier-derived SQL (<Code>popularPositionTierSql()</Code>{' '}
          in <Code>enrichPositionsStockfish.ts</Code>), so they can&apos;t drift out of sync with
          each other or with <Code>POPULAR_POSITION_DEPTH_TIERS_Player</Code>.
        </li>
      </ul>
    </div>
  )
}

export type DataflowSection = { id: string; label: string; content: ReactNode }

export const SECTIONS: DataflowSection[] = [
  { id: 'tpl_players',              label: 'tpl_players',              content: <TplPlayersSection /> },
  { id: 'chess-com-api',            label: 'chess.com API',            content: <ChessComApiSection /> },
  { id: 'wk_gr_gamesraw',             label: 'wk_gr_gamesraw',             content: <TgrGamesrawSection /> },
  { id: 'tgd_gamesdecon',           label: 'tgd_gamesdecon',           content: <TgdGamesdeconSection /> },
  { id: 'tgam_game_positions',      label: 'tgam_game_positions',      content: <TgamGamePositionsSection /> },
  { id: 'tpos_positions',           label: 'tpos_positions',           content: <TposPositionsSection /> },
  { id: 'purge',                    label: 'Purge',                    content: <PurgeSection /> },
  { id: 'tpose_positions_eval',         label: 'tpose_positions_eval',         content: <PoseEvaluationsSection /> },
  { id: 'bulk-update-cp-loss',      label: 'bulkUpdateCpLoss',         content: <BulkUpdateCpLossSection /> },
  { id: 'thab_habits',              label: 'thab_habits',              content: <ThabHabitsSection /> },
  { id: 'evaluate-game-endings',    label: 'Evaluate Game Endings',    content: <EvaluateGameEndingsSection /> },
  { id: 'deepen-popular-positions', label: 'Deepen Popular Positions', content: <DeepenPopularPositionsSection /> },
]
