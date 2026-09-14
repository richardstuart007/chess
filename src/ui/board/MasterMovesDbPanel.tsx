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
//                 (see masterGamesList.ts's getMasterGamesForFen for why); Eval is always blank
//                 here — not worth a cross-database join for this panel
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { getMasterGamesForFen } from '@/src/lib/master/masterGamesList'
import { MASTER_GAMES_FOR_FEN_LIMIT } from '@/src/lib/constants'
import { useLazyFetch } from 'nextjs-shared/useLazyFetch'
import MovesListTable from './MovesListTable'

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

  return (
    <MyBox title='Master Moves (Our DB)' collapsible defaultOpen={defaultOpen}>
      {!loaded ? (
        <MyButton onClick={load} disabled={loading} overrideClass='text-xs'>
          {loading ? 'Loading...' : 'Fetch Master Moves'}
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
              avgRating: m.avgOpponentRating,
              eval:      null
            }))}
          />
        </div>
      )}
    </MyBox>
  )
}
