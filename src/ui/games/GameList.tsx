'use client'

import { useState, useEffect, useMemo } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MyPagination from 'nextjs-shared/MyPagination'
import { ChessComGame } from '@/src/lib/chesscom'
import { fetchFilteredGames, getGamesPageCount, GameFilters } from '@/src/lib/actions/games'

const ITEMS_PER_PAGE = 15

interface PlayerOption {
  username: string
  displayName: string | null
}

interface GameListProps {
  players: PlayerOption[]
  playerFilter: string
  filters: GameFilters
  onSelectGame: (game: ChessComGame, username: string) => void
  onCountChange?: (count: number) => void
  lastAnalyzedGameId?: number
}

const RESULT_STYLES: Record<string, string> = {
  win: 'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

export default function GameList({ players, playerFilter, filters, onSelectGame, onCountChange, lastAnalyzedGameId }: GameListProps) {
  const [currentPage, setCurrentPage] = useState(() => ss('chess-gl-page', 1))
  const [games, setGames] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const usernamesToFetch = useMemo(() => (
    players.length === 1
      ? [players[0].username]
      : playerFilter
        ? [playerFilter]
        : players.map(p => p.username)
  ), [players, playerFilter])

  useEffect(() => {
    try { sessionStorage.setItem('chess-gl-page', JSON.stringify(currentPage)) } catch {}
  }, [currentPage])

  //
  //  Filters/player selection are owned by the parent (shared with RatingChart) — reset
  //  back to page 1 whenever either changes, same as when the user changed them directly.
  //
  useEffect(() => {
    setCurrentPage(1)
  }, [usernamesToFetch, filters])

  //
  //  Total row count — only depends on usernames/filters, not the current page, so it's
  //  fetched once per filter change rather than re-queried on every page turn. Pages are
  //  derived from it locally rather than issuing a second COUNT query.
  //
  useEffect(() => {
    let cancelled = false
    async function fetchCount() {
      if (usernamesToFetch.length === 0) {
        if (!cancelled) { setTotalCount(0); onCountChange?.(0) }
        return
      }
      const count = await getGamesPageCount(usernamesToFetch, filters, 1)
      if (!cancelled) { setTotalCount(count); onCountChange?.(count) }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [usernamesToFetch, filters])

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchPage() {
      if (usernamesToFetch.length === 0) {
        if (!cancelled) { setGames([]); setLoading(false) }
        return
      }

      const rows = await fetchFilteredGames(usernamesToFetch, filters, currentPage, ITEMS_PER_PAGE)

      if (!cancelled) {
        setGames(rows)
        setLoading(false)
      }
    }

    fetchPage().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [usernamesToFetch, filters, currentPage])

  function handleSelectGame(row: any) {
    const rowUsername = row.gd_player
    const game: ChessComGame = {
      url: row.gd_game_url,
      pgn: '',
      time_control: row.gd_time_control,
      time_class: row.gd_time_class,
      end_time: row.gd_end_time,
      rated: row.gd_is_rated,
      rules: 'chess',
      white: {
        username: row.gd_white_username,
        rating: row.gd_white_rating,
        result: row.gd_player_color === 'white'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      },
      black: {
        username: row.gd_black_username,
        rating: row.gd_black_rating,
        result: row.gd_player_color === 'black'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      }
    }
    ;(game as any)._gameId = row.gd_gdid
    ;(game as any)._openingName = row.gd_opening_name
    ;(game as any)._ecoCode = row.gd_eco_code
    onSelectGame(game, rowUsername)
  }

  return (
    <MyBox title='Games'>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-xs'>
          <thead>
            <tr className='border-b border-gray-200 text-gray-500'>
              <th className='pb-1 pr-2 text-gray-400'>#</th>
              <th className='pb-1 pr-2'>Date</th>
              <th className='pb-1 pr-2'>Player</th>
              <th className='pb-1 pr-2 text-center'>Color</th>
              <th className='pb-1 pr-2 text-center'>Time</th>
              <th className='pb-1 pr-2'>Opponent</th>
              <th className='pb-1 pr-2 text-center'>Opp. Rating</th>
              <th className='pb-1 pr-2 text-center'>My Rating</th>
              <th className='pb-1 pr-2 text-center'>Result</th>
              <th className='pb-1 pr-2 text-center'>End</th>
              <th className='pb-1 pr-2'>Opening</th>
              <th className='pb-1 pr-2'>ECO</th>
              <th className='pb-1'></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={13} className='py-4 text-center text-xs text-gray-500'>Loading...</td>
              </tr>
            )}
            {!loading && games.length === 0 && (
              <tr>
                <td colSpan={13} className='py-4 text-center text-xs text-gray-500'>
                  No games found. Try adjusting your filters or populate games first.
                </td>
              </tr>
            )}
            {!loading && games.map((row, index) => {
              const date = new Date(row.gd_end_time * 1000)
              const dd = String(date.getDate()).padStart(2, '0')
              const mm = String(date.getMonth() + 1).padStart(2, '0')
              const yy = String(date.getFullYear()).slice(2)
              const hh = String(date.getHours()).padStart(2, '0')
              const min = String(date.getMinutes()).padStart(2, '0')
              const dateStr = `${dd}/${mm}/${yy} ${hh}:${min}`
              const gameNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1

              return (
                <tr
                  key={row.gd_gdid}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${row.gd_gdid === lastAnalyzedGameId ? 'bg-yellow-50 outline outline-1 outline-yellow-300' : ''}`}
                  onClick={() => handleSelectGame(row)}
                >
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{gameNumber}</td>
                  <td className='py-1.5 pr-2 whitespace-nowrap'>{dateStr}</td>
                  <td className='py-1.5 pr-2'>{row.gd_player}</td>
                  <td className='py-1.5 pr-2'>
                    <div className='flex justify-center'>
                      <span className={`inline-block h-3 w-3 rounded-full border border-gray-300 ${
                        row.gd_player_color === 'white' ? 'bg-white' : 'bg-gray-800'
                      }`} />
                    </div>
                  </td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center text-gray-500'>{row.gd_time_class}</div></td>
                  <td className='py-1.5 pr-2'>{row.gd_opponent_username}</td>
                  <td className='py-1.5 pr-2'><div className={`flex justify-center ${
                    (() => {
                      const myRating  = row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
                      const oppRating = row.gd_opponent_rating
                      return row.gd_player_result === 'loss' && oppRating < myRating ? 'text-red-500'
                           : row.gd_player_result === 'win'  && oppRating > myRating ? 'text-blue-500'
                           : ''
                    })()
                  }`}>{row.gd_opponent_rating}</div></td>
                  <td className='py-1.5 pr-2 text-center tabular-nums text-gray-700'>{row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating}</td>
                  <td className='py-1.5 pr-2'>
                    <div className={`flex justify-center ${RESULT_STYLES[row.gd_player_result]}`}>
                      {row.gd_player_result}
                    </div>
                  </td>
                  <td className='py-1.5 pr-2 text-center text-gray-500'>{row.gd_termination}</td>
                  <td className='py-1.5 pr-2 max-w-40 truncate' title={row.gd_opening_name}>
                    {row.gd_opening_name || 'Unknown'}
                  </td>
                  <td className='py-1.5 pr-2 text-gray-400'>{row.gd_eco_code}</td>
                  <td className='py-1.5'>
                    <MyButton
                      onClick={(e) => { e.stopPropagation(); handleSelectGame(row) }}
                      overrideClass='text-xxs px-2 py-0.5 h-5'
                    >
                      Analyze
                    </MyButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className='mt-3 flex items-center justify-between'>
        <div />
        {totalPages > 1 && (
          <MyPagination
            totalPages={totalPages}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
          />
        )}
        <span className='text-xxs text-gray-400'>
          Page {currentPage} of {totalPages} ({totalCount.toLocaleString()} games)
        </span>
      </div>
    </MyBox>
  )
}
