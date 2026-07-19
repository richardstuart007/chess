'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, LabelList, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import FilterPlayerSelect from '@/src/ui/filters/FilterPlayerSelect'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import FilterDateInput from '@/src/ui/filters/FilterDateInput'
import FilterActionButton from '@/src/ui/filters/FilterActionButton'
import FilterNumberRange from '@/src/ui/filters/FilterNumberRange'
import FilterMultiCheckbox from '@/src/ui/filters/FilterMultiCheckbox'
import { MyButton } from 'nextjs-shared/MyButton'
import { getOpeningScores, fetchFilteredGames } from '@/src/lib/actions/games'
import { DEFAULT_DATE_FROM, DEFAULT_MIN_GAMES, DEFAULT_FILTER_TERMINATIONS } from '@/src/lib/constants'
import { ChessComGame } from '@/src/lib/chesscom'

const MIN_GAMES_OPTIONS = ['10', '25', '50', '100', '200', '500']
const RESULTS_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: '10' }, { value: '20', label: '20' }, { value: '30', label: '30' },
  { value: '50', label: '50' }, { value: '0', label: 'All' }
]
const TODAY = new Date().toISOString().slice(0, 10)

const RESULT_STYLES: Record<string, string> = {
  win:  'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

function barColor(score: number): string {
  if (score >= 60) return '#16a34a'
  if (score >= 40) return '#6b7280'
  return '#dc2626'
}

function sso<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

interface OpeningScoreChartProps {
  players: { username: string; display_name: string | null }[]
  onSelectGame?: (game: ChessComGame, username: string) => void
  lastAnalyzedGameId?: number
}

export default function OpeningScoreChart({ players, onSelectGame, lastAnalyzedGameId }: OpeningScoreChartProps) {
  const searchParams = useSearchParams()
  const playerFilter = searchParams.get('player') ?? ''
  const usernames = useMemo(
    () => playerFilter ? [playerFilter] : players.map(p => p.username),
    [playerFilter, players]
  )

  const [color, setColor]               = useState<'both' | 'white' | 'black'>(() => sso('chess-osc-color', 'both'))
  const [from, setFrom]                 = useState<'Best' | 'Worst'>(() => sso('chess-osc-from', 'Best'))
  const [minGames, setMinGames]         = useState(() => sso('chess-osc-mingames', DEFAULT_MIN_GAMES))
  const [resultsCount, setResultsCount] = useState(() => sso('chess-osc-results-count', '20'))
  const [dateFrom, setDateFrom]         = useState(() => sso('chess-osc-datefrom', DEFAULT_DATE_FROM))
  const [data, setData]                 = useState<{ eco_code: string; opening_name: string; games: number; score_pct: number }[]>([])
  const [loading, setLoading]           = useState(false)

  const [selectedEco, setSelectedEco]   = useState<string | null>(() => sso('chess-osc-eco', null))
  const [selectedName, setSelectedName] = useState(() => sso('chess-osc-name', ''))
  const [gameRows, setGameRows]         = useState<any[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)

  const [sortBy, setSortBy]                         = useState<'date' | 'moves'>(() => sso('chess-osc-sort', 'date'))
  const [filterColors, setFilterColors]             = useState<string[]>(() => sso('chess-osc-colors', []))
  const [filterResults, setFilterResults]           = useState<string[]>(() => sso('chess-osc-results', []))
  const [filterTerminations, setFilterTerminations] = useState<string[]>(() => sso('chess-osc-terminations', DEFAULT_FILTER_TERMINATIONS))
  const [filterRatingMin, setFilterRatingMin]       = useState<string>(() => sso('chess-osc-rating-min', ''))
  const [filterRatingMax, setFilterRatingMax]       = useState<string>(() => sso('chess-osc-rating-max', ''))

  useEffect(() => {
    if (usernames.length === 0) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const limit   = resultsCount === '0' ? 0 : parseInt(resultsCount, 10)
      const sortDir = from === 'Best' ? 'DESC' : 'ASC'
      const rows = await getOpeningScores(
        usernames, color,
        parseInt(minGames, 10), limit, sortDir,
        dateFrom || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [usernames, color, from, minGames, resultsCount, dateFrom])

  useEffect(() => {
    try {
      sessionStorage.setItem('chess-osc-color', JSON.stringify(color))
      sessionStorage.setItem('chess-osc-from', JSON.stringify(from))
      sessionStorage.setItem('chess-osc-mingames', JSON.stringify(minGames))
      sessionStorage.setItem('chess-osc-results-count', JSON.stringify(resultsCount))
      sessionStorage.setItem('chess-osc-datefrom', JSON.stringify(dateFrom))
    } catch {}
  }, [color, from, minGames, resultsCount, dateFrom])

  useEffect(() => {
    try {
      sessionStorage.setItem('chess-osc-eco', JSON.stringify(selectedEco))
      sessionStorage.setItem('chess-osc-name', JSON.stringify(selectedName))
      sessionStorage.setItem('chess-osc-sort', JSON.stringify(sortBy))
      sessionStorage.setItem('chess-osc-colors', JSON.stringify(filterColors))
      sessionStorage.setItem('chess-osc-results', JSON.stringify(filterResults))
      sessionStorage.setItem('chess-osc-terminations', JSON.stringify(filterTerminations))
      sessionStorage.setItem('chess-osc-rating-min', JSON.stringify(filterRatingMin))
      sessionStorage.setItem('chess-osc-rating-max', JSON.stringify(filterRatingMax))
    } catch {}
  }, [selectedEco, selectedName, sortBy, filterColors, filterResults, filterTerminations, filterRatingMin, filterRatingMax])

  useEffect(() => {
    if (!selectedEco || usernames.length === 0) { setGameRows([]); return }
    let cancelled = false
    setGamesLoading(true)
    async function loadGames() {
      const colorFilter = color === 'both' ? undefined : color
      const rows = await fetchFilteredGames(
        usernames,
        {
          eco: selectedEco!,
          openingNameExact: selectedName,
          color: colorFilter,
          dateFrom: dateFrom || undefined
        },
        1, 500
      )
      if (!cancelled) { setGameRows(rows); setGamesLoading(false) }
    }
    loadGames().catch(() => { if (!cancelled) setGamesLoading(false) })
    return () => { cancelled = true }
  }, [selectedEco, selectedName, usernames, color, dateFrom])

  function handleSelectGame(row: any) {
    if (!onSelectGame) return
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

  function handleBarClick(data: any) {
    const eco  = data?.eco
    const name = data?.fullName
    if (!eco) return
    if (eco === selectedEco) { setSelectedEco(null); return }
    setSelectedEco(eco)
    setSelectedName(name ?? eco)
  }

  const availableTerminations = useMemo(() =>
    [...new Set(gameRows.map((r: any) => r.gd_termination).filter(Boolean))].sort() as string[]
  , [gameRows])

  const displayRows = useMemo(() => {
    let rows = gameRows
    if (filterColors.length > 0)
      rows = rows.filter((r: any) => filterColors.includes(r.gd_player_color))
    if (filterResults.length > 0)
      rows = rows.filter((r: any) => filterResults.includes(r.gd_player_result))
    if (filterTerminations.length > 0)
      rows = rows.filter((r: any) => filterTerminations.includes(r.gd_termination))
    const rMin = filterRatingMin !== '' ? parseInt(filterRatingMin, 10) : null
    const rMax = filterRatingMax !== '' ? parseInt(filterRatingMax, 10) : null
    const rOverlap = rMin !== null && rMax !== null && rMin > rMax
    if (!rOverlap) {
      if (rMin !== null) rows = rows.filter((r: any) => r.gd_opponent_rating >= rMin)
      if (rMax !== null) rows = rows.filter((r: any) => r.gd_opponent_rating <= rMax)
    }
    if (sortBy === 'moves')
      rows = [...rows].sort((a: any, b: any) =>
        (a.gd_opening_moves ?? '').localeCompare(b.gd_opening_moves ?? '')
      )
    return rows
  }, [gameRows, sortBy, filterColors, filterResults, filterTerminations, filterRatingMin, filterRatingMax])

  const chartData = data.map(r => ({
    label:     `${r.eco_code} ${r.opening_name}`.slice(0, 100),
    fullName:  r.opening_name,
    eco:       r.eco_code,
    score_pct: r.score_pct,
    games:     r.games
  }))

  const chartHeight = Math.max(200, chartData.length * 28)

  return (
    <MyBox title='Openings'>
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        <FilterPlayerSelect players={players} width='w-24' />
        <FilterSelect
          label='Colour'
          options={[{ value: 'both', label: 'All' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]}
          value={color}
          onChange={v => setColor(v as 'both' | 'white' | 'black')}
          width='w-20'
        />
        <FilterSelect
          label='Min games'
          options={MIN_GAMES_OPTIONS}
          value={minGames}
          onChange={setMinGames}
          width='w-16'
        />
        <FilterSelect
          label='From'
          options={[{ value: 'Best', label: 'Best' }, { value: 'Worst', label: 'Worst' }]}
          value={from}
          onChange={v => setFrom(v as 'Best' | 'Worst')}
          width='w-16'
        />
        <FilterSelect
          label='Show'
          options={RESULTS_OPTIONS}
          value={resultsCount}
          onChange={setResultsCount}
          width='w-16'
        />
        <FilterDateInput
          label='From date'
          value={dateFrom}
          onChange={setDateFrom}
          max={TODAY}
          width='w-32'
        />
      </div>

      {loading && <p className='text-xs text-gray-400'>Loading...</p>}

      {!loading && chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No openings with {minGames}+ games.</p>
      )}

      {!loading && chartData.length > 0 && (
        <>
          <p className='mb-1 text-xxs text-gray-400'>Click a bar to see the games</p>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <BarChart
              layout='vertical'
              data={chartData}
              margin={{ top: 4, right: 55, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray='3 3' horizontal={false} stroke='#f0f0f0' />
              <XAxis
                type='number'
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 9 }}
              />
              <YAxis
                type='category'
                dataKey='label'
                tick={{ fontSize: 9, width: 480 }}
                width={480}
              />
              <Tooltip
                formatter={(value: any, _: any, props: any) =>
                  [`${props.payload.score_pct}% (${props.payload.games} games)`, props.payload.eco]
                }
                labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName ?? ''}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey='score_pct' radius={[0, 3, 3, 0]} onClick={handleBarClick} cursor='pointer'>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={barColor(entry.score_pct)}
                    opacity={selectedEco && entry.eco !== selectedEco ? 0.35 : 1}
                  />
                ))}
                <LabelList
                  dataKey='score_pct'
                  position='right'
                  formatter={(v) => `${v ?? ''}%`}
                  style={{ fontSize: 9, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {selectedEco && (
            <div className='mt-4'>
              <div className='mb-2 flex items-center justify-between'>
                <p className='text-xs font-medium text-gray-700'>{selectedEco} — {selectedName}</p>
                <FilterActionButton
                  onClick={() => setSelectedEco(null)}
                  variant='secondary'
                >
                  Close
                </FilterActionButton>
              </div>

              {gamesLoading && <p className='text-xs text-gray-400'>Loading games...</p>}

              {!gamesLoading && gameRows.length > 0 && (
                <>
                  <div className='mb-2 flex items-center gap-4'>
                    <FilterSelect
                      label='Sort'
                      options={[{ value: 'date', label: 'Date' }, { value: 'moves', label: 'Opening moves' }]}
                      value={sortBy}
                      onChange={v => setSortBy(v as 'date' | 'moves')}
                      width='w-28'
                    />
                    <span className='text-xxs text-gray-400 ml-auto'>
                      {displayRows.length !== gameRows.length
                        ? `filtered ${displayRows.length} of ${gameRows.length} games`
                        : `${gameRows.length} games`}
                    </span>
                  </div>

                  {displayRows.length === 0 && (
                    <p className='text-xs text-gray-400'>No games match the selected filters.</p>
                  )}

                  <div className='overflow-x-auto'>
                    <table className='w-full text-left text-xs'>
                      <thead>
                        <tr className='border-b border-gray-200 text-gray-500'>
                          <th className='pb-1 pr-2'>Player</th>
                          <th className='pb-1 pr-2'>#</th>
                          <th className='pb-1 pr-2'>Date</th>
                          <th className='pb-1 pr-2'>
                            <FilterMultiCheckbox
                              label='Colour'
                              options={[{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]}
                              selected={filterColors}
                              onChange={setFilterColors}
                              width='w-20'
                            />
                          </th>
                          <th className='pb-1 pr-2'>Opponent</th>
                          <th className='pb-1 pr-2'>
                            <FilterNumberRange
                              label='Opp. Rating'
                              min={filterRatingMin}
                              max={filterRatingMax}
                              onMinChange={setFilterRatingMin}
                              onMaxChange={setFilterRatingMax}
                              width='w-12'
                            />
                          </th>
                          <th className='pb-1 pr-2'>
                            <FilterMultiCheckbox
                              label='Result'
                              options={[{ value: 'win', label: 'Win' }, { value: 'loss', label: 'Loss' }, { value: 'draw', label: 'Draw' }]}
                              selected={filterResults}
                              onChange={setFilterResults}
                              width='w-20'
                            />
                          </th>
                          <th className='pb-1 pr-2'>
                            <FilterMultiCheckbox
                              label='Termination'
                              options={availableTerminations}
                              selected={filterTerminations}
                              onChange={setFilterTerminations}
                              width='w-20'
                            />
                          </th>
                          <th className='pb-1 pr-2'>Moves</th>
                          {onSelectGame && <th className='pb-1' />}
                        </tr>
                      </thead>
                      <tbody>
                          {displayRows.map((row: any, i: number) => {
                            const d = new Date(row.gd_end_time * 1000)
                            const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                            const moves = row.gd_opening_moves ?? ''
                            return (
                              <tr
                                key={row.gd_gdid}
                                className={`border-b border-gray-100 ${onSelectGame ? 'cursor-pointer hover:bg-blue-50' : ''} ${row.gd_gdid === lastAnalyzedGameId ? 'bg-yellow-50 outline outline-1 outline-yellow-300' : ''}`}
                                onClick={() => handleSelectGame(row)}
                              >
                                <td className='py-1 pr-2 text-gray-600'>{row.gd_player}</td>
                                <td className='py-1 pr-2 text-gray-400'>{i + 1}</td>
                                <td className='py-1 pr-2 whitespace-nowrap'>{dateStr}</td>
                                <td className='py-1 pr-2'>{row.gd_player_color}</td>
                                <td className='py-1 pr-2'>{row.gd_opponent_username}</td>
                                <td className='py-1 pr-2'>{row.gd_opponent_rating}</td>
                                <td className={`py-1 pr-2 ${RESULT_STYLES[row.gd_player_result] ?? ''}`}>
                                  {row.gd_player_result}
                                </td>
                                <td className='py-1 pr-2 text-gray-500'>{row.gd_termination}</td>
                                <td className='py-1 pr-2 font-mono text-xxs max-w-xs truncate' title={moves}>
                                  {moves}
                                </td>
                                {onSelectGame && (
                                  <td className='py-1'>
                                    <MyButton
                                      onClick={e => { e.stopPropagation(); handleSelectGame(row) }}
                                      overrideClass='text-xxs px-2 py-0.5 h-5 md:h-5'
                                    >
                                      Analyse
                                    </MyButton>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                </>
              )}

              {!gamesLoading && gameRows.length === 0 && (
                <p className='text-xs text-gray-400'>No games found.</p>
              )}
            </div>
          )}
        </>
      )}
    </MyBox>
  )
}
