'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterMovesDbPanel — move-breakdown table for an exact FEN, sourced from this project's own
//    synced master-games database (tmpos_positions/tmgam_game_positions/tmgd_gamesdecon), not an
//    external API. Mirrors "Master Moves (Lichess)"'s shape (Move/Games/Score%/Avg Rating).
//    Fully self-contained — fetches its own data from just the fen prop, so it can be dropped
//    onto any page without shared parent state.
//
//    Parameters:
//      fen         — exact FEN to look up
//      autoFetch   — fetch automatically on mount/fen change (default true); when false, shows a
//                    "Fetch" button instead
//      defaultOpen — MyBox's initial collapsed state (default true)
//      limit       — max games to fetch (default MASTER_GAMES_FOR_FEN_LIMIT)
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { getMasterGamesForFen } from '@/src/lib/master/masterGamesList'
import { winPct } from '@/src/lib/winPct'
import { MASTER_GAMES_FOR_FEN_LIMIT } from '@/src/lib/constants'
import { useLazyFetch } from 'nextjs-shared/useLazyFetch'

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
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-gray-500 border-b border-gray-200'>
                  <th className='py-1 pr-2'>Move</th>
                  <th className='py-1 pr-2 text-right'>Games</th>
                  <th className='py-1 pr-2 text-right'>Score%</th>
                  <th className='py-1 text-right'>Avg Opp Rating</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {moves.map(m => (
                  <tr key={m.move_played}>
                    <td className='py-1 pr-2 font-mono font-medium'>{m.move_played}</td>
                    <td className='py-1 pr-2 text-right tabular-nums'>{m.times.toLocaleString()}</td>
                    <td className='py-1 pr-2 text-right tabular-nums text-green-700'>{winPct(m.wins, m.losses, m.times)}%</td>
                    <td className='py-1 text-right tabular-nums'>{m.avgOpponentRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </MyBox>
  )
}
