'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterGamesDbPanel — game list for an exact FEN, sourced from this project's own synced
//    master-games database, not an external API. Mirrors "Master Games (Lichess)"'s shape
//    (Move/White/Black/Year/Result/Game). Fully self-contained — fetches its own data from just
//    the fen prop and owns its own move filter, so it can be dropped onto any page without
//    shared parent state.
//
//    Parameters:
//      fen          — exact FEN to look up
//      autoFetch    — fetch automatically on mount/fen change (default true); when false, shows
//                     a "Fetch" button instead
//      defaultOpen  — MyBox's initial collapsed state (default true)
//      limit        — max games to fetch (default MASTER_GAMES_FOR_FEN_LIMIT)
//      gameLinkBase — URL prefix a game row click navigates to (default '/analyzemaster?game=')
//
//  2) NOTES
//    Result is shown as objective chess notation (1-0/0-1/½-½), and the tracked master's own
//    name is bolded, since mgd_player_result alone (win/loss/draw) is ambiguous without knowing
//    which side they played.
//==================================================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import { getMasterGamesForFen } from '@/src/lib/master/masterGamesList'
import { MASTER_GAMES_FOR_FEN_LIMIT } from '@/src/lib/constants'
import { useLazyFetch } from 'nextjs-shared/useLazyFetch'

interface MasterGamesDbPanelProps {
  fen: string
  autoFetch?: boolean
  defaultOpen?: boolean
  limit?: number
  gameLinkBase?: string
}

export default function MasterGamesDbPanel({ fen, autoFetch = true, defaultOpen = true, limit = MASTER_GAMES_FOR_FEN_LIMIT, gameLinkBase = '/analyzemaster?game=' }: MasterGamesDbPanelProps) {
  const router = useRouter()
  const [moveFilter, setMoveFilter] = useState('')
  const { data, loaded, loading, load } = useLazyFetch(
    () => getMasterGamesForFen(fen, limit),
    [fen, limit],
    { autoFetch }
  )
  const games = data?.games ?? []

  const moveOptions = [...new Set(games.map(g => g.move_played))]
  const filteredGames = moveFilter ? games.filter(g => g.move_played === moveFilter) : games

  return (
    <MyBox title='Master Games (Our DB)' collapsible defaultOpen={defaultOpen}>
      {!loaded ? (
        <MyButton onClick={load} disabled={loading} overrideClass='text-xs'>
          {loading ? 'Loading...' : 'Fetch Master Games'}
        </MyButton>
      ) : games.length === 0 ? (
        <p className='text-xs text-gray-400'>No synced master games recorded from this position.</p>
      ) : (
        <div className='space-y-2'>
          {moveOptions.length > 1 && (
            <div className='flex items-center gap-2'>
              <label className='text-xxs text-gray-500'>Move</label>
              <MySelect
                value={moveFilter}
                onChange={e => setMoveFilter(e.target.value)}
                overrideClass='w-24 h-6 md:h-6'
              >
                <option value=''>All</option>
                {moveOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </MySelect>
            </div>
          )}
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-gray-500 border-b border-gray-200'>
                  <th className='py-1 pr-2'>Move</th>
                  <th className='py-1 pr-2'>White</th>
                  <th className='py-1 pr-2'>Black</th>
                  <th className='py-1 pr-2 text-right'>Year</th>
                  <th className='py-1 pr-2 text-center'>Result</th>
                  <th className='py-1 text-right'>Game</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {filteredGames.map(g => {
                  const isWhiteMaster = g.white_username === g.player
                  const isBlackMaster = g.black_username === g.player
                  return (
                    <tr key={g.mgd_mgdid} className='cursor-pointer hover:bg-gray-50' onClick={() => router.push(`${gameLinkBase}${g.mgd_mgdid}`)}>
                      <td className='py-1 pr-2 font-mono font-medium'>{g.move_played}</td>
                      <td className={`py-1 pr-2 ${isWhiteMaster ? 'font-semibold text-gray-900' : ''}`}>{g.white_username}</td>
                      <td className={`py-1 pr-2 ${isBlackMaster ? 'font-semibold text-gray-900' : ''}`}>{g.black_username}</td>
                      <td className='py-1 pr-2 text-right tabular-nums'>{g.year}</td>
                      <td className='py-1 pr-2 text-center tabular-nums'>{g.result}</td>
                      <td className='py-1 text-right text-blue-600'>View</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </MyBox>
  )
}
