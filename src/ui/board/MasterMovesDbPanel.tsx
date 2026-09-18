'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterMovesDbPanel — move-breakdown table for an exact FEN, sourced from this project's own
//    synced master-games database (tmpos_positions/tmgam_game_positions/tmgd_gamesdecon), not an
//    external API. Renders via the shared MovesListTable (same shape as Moves Played and Master
//    Moves (Lichess)). Fully self-contained — fetches its own data from just the fen prop, so it
//    can be dropped onto any page without shared parent state.
//
//    Parameters:
//      fen         — exact FEN to look up
//      autoFetch   — fetch automatically on mount/fen change (default true); when false, shows a
//                    "Fetch" button instead
//      defaultOpen — MyBox's initial collapsed state (default true)
//      limit       — max games to fetch (default MASTER_GAMES_FOR_FEN_LIMIT)
//
//  3) CHANGE HISTORY
//    2026-09-13 — switched to the shared MovesListTable (Move/Times/White%/Draw%/Black%/Avg
//                 Rating/Eval) instead of its own Move/Games/Score%/Avg Rating table; Score%
//                 (personal, mgd_player_result-based) replaced by objective White%/Draw%/Black%
//                 (see masterGamesList.ts's getMasterGamesForFen for why); Eval was blank here —
//                 not worth a cross-database join for this panel
//    2026-09-15 — Avg Rating column removed (MovesListTable-wide); Eval now populated from
//                 getMasterGamesForFen's cp (tmgev_game_evals first, tpose_positions_eval
//                 fallback — see chessdb_shared.ts's getFenEvalsWithFallback_shared), plus an
//                 "Analyze missing" button (useMissingEvalAnalysis) for whatever's still null
//    2026-09-15 — title shortened "Master Moves (Our DB)" -> "Moves"; the "All Masters" group
//                 label above this panel (added by its callers) now carries that context instead
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { getMasterGamesForFen } from '@/src/lib/master/masterGamesList'
import { MASTER_GAMES_FOR_FEN_LIMIT } from '@/src/lib/constants'
import { applyUciMove } from '@/src/lib/fen'
import { useLazyFetch } from 'nextjs-shared/useLazyFetch'
import MovesListTable from './MovesListTable'
import { useMissingEvalAnalysis, MissingEvalRow } from './useMissingEvalAnalysis'

interface MasterMovesDbPanelProps {
  fen: string
  autoFetch?: boolean
  defaultOpen?: boolean
  limit?: number
}

export default function MasterMovesDbPanel({ fen, autoFetch = true, defaultOpen = true, limit = MASTER_GAMES_FOR_FEN_LIMIT }: MasterMovesDbPanelProps) {
  const { data, loaded, loading, load } = useLazyFetch(
    () => getMasterGamesForFen(fen, limit),
    [fen, limit],
    { autoFetch }
  )
  const moves = data?.moves ?? []
  const reached = data?.reached ?? 0

  //
  //  Rows still lacking a DB-sourced eval, for the "Analyze missing" button —
  //  useMissingEvalAnalysis re-checks evalSessionCache internally too, so a position already
  //  analyzed elsewhere in this session shows up here with no engine run needed.
  //
  const missingRows: MissingEvalRow[] = moves
    .map(m => {
      if (m.cp != null || !m.move_uci) return null
      const resultingFen = applyUciMove(fen, m.move_uci)
      return resultingFen ? { key: m.move_played, fen: resultingFen } : null
    })
    .filter((r): r is MissingEvalRow => r != null)
  const missingEval = useMissingEvalAnalysis(missingRows)

  return (
    <MyBox title='Moves' collapsible defaultOpen={defaultOpen}>
      {!loaded ? (
        <MyButton onClick={load} disabled={loading} overrideClass='text-xs'>
          {loading ? 'Loading...' : 'Fetch Moves'}
        </MyButton>
      ) : moves.length === 0 ? (
        <p className='text-xs text-gray-400'>No synced master games recorded from this position.</p>
      ) : (
        <div className='space-y-2'>
          <p className='text-xxs text-gray-500'>{reached.toLocaleString()} times reached</p>
          <MovesListTable
            rows={moves.map(m => ({
              key:       m.move_played,
              move:      m.move_played,
              times:     m.times,
              white:     m.white,
              draws:     m.draws,
              black:     m.black,
              eval:      m.cp ?? missingEval.overrides[m.move_played]?.cp ?? null
            }))}
          />
          {missingEval.missingCount > 0 && (
            <MyButton
              onClick={missingEval.analyzeMissing}
              disabled={missingEval.analyzing}
              overrideClass='text-xxs'
            >
              {missingEval.analyzing
                ? `Analyzing ${missingEval.progress?.done ?? 0}/${missingEval.progress?.total ?? 0}...`
                : `Analyze missing (${missingEval.missingCount})`}
            </MyButton>
          )}
        </div>
      )}
    </MyBox>
  )
}
