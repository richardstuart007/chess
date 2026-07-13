'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MyButton } from 'nextjs-shared/MyButton'
import TabBar from '@/src/ui/TabBar'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import GameList from '@/src/ui/games/GameList'
import GameFilterPanel from '@/src/ui/games/GameFilterPanel'
import RatingChart from '@/src/ui/charts/RatingChart'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import TerminationChart from '@/src/ui/charts/TerminationChart'
import MyBox from 'nextjs-shared/MyBox'
import { getPlayer, getPlayerRatings } from '@/src/lib/actions/players'
import { getEarliestGameDate, GameFilters } from '@/src/lib/actions/games'
import { ChessComGame } from '@/src/lib/chesscom'
import { getPlayerTimeClasses, DEFAULT_DATE_FROM } from '@/src/lib/constants'

interface Player {
  username: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
  lastAnalyzedGameId?: number
}

const BOTH = ''

export default function HomeDashboard({ players, lastAnalyzedGameId }: HomeDashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') as 'games' | 'graph' | 'openings' | 'endings' | null) ?? 'games'
  const [dbPlayers,  setDbPlayers]  = useState<any[]>([])
  const [dbRatings,  setDbRatings]  = useState<Record<string, Record<string, number>>>({})

  const hasMultiple = players.length > 1
  const initialPlayerFilter = hasMultiple ? BOTH : (players[0]?.username ?? '')

  //
  //  Draft state feeds the filter panel inputs directly (instant, responsive typing).
  //  Applied state is what GameList/RatingChart actually fetch with — only updated when
  //  the user clicks Filter, so an expensive re-query doesn't fire on every keystroke.
  //
  const [draftPlayerFilter, setDraftPlayerFilter] = useState<string>(initialPlayerFilter)
  const [playerFilter, setPlayerFilter] = useState<string>(initialPlayerFilter)
  const [draftFilters, setDraftFilters] = useState<GameFilters>({ dateFrom: DEFAULT_DATE_FROM })
  const [filters, setFilters] = useState<GameFilters>({ dateFrom: DEFAULT_DATE_FROM })
  const [draftGraphLimit, setDraftGraphLimit] = useState<number>(100)
  const [graphLimit, setGraphLimit] = useState<number>(100)
  const [graphLoading, setGraphLoading] = useState(false)
  const [minDate, setMinDate] = useState<string | undefined>()
  const [gameCount, setGameCount] = useState(0)

  const playerUsernames = players.map(p => p.username).join(',')

  //
  //  Memoized so GameList/RatingChart's own useMemo/useEffect chains (which depend on
  //  this array by reference) don't refire on every HomeDashboard re-render — an
  //  unmemoized new array here previously caused a runaway fetch loop once RatingChart's
  //  onLoadingChange started triggering parent re-renders on every fetch start/end.
  //
  const playerOptions = useMemo(
    () => players.map(p => ({ username: p.username, displayName: p.display_name })),
    [playerUsernames]
  )

  function handlePlayerProfileClick(username: string) {
    const next = playerFilter === username ? BOTH : username
    setDraftPlayerFilter(next)
    setPlayerFilter(next)
  }

  useEffect(() => {
    async function loadAll() {
      const [playerResults, ratingResults] = await Promise.all([
        Promise.all(players.map(p => getPlayer(p.username))),
        Promise.all(players.map(p => getPlayerRatings(p.username)))
      ])
      setDbPlayers(playerResults)
      const ratingsMap: Record<string, Record<string, number>> = {}
      players.forEach((p, i) => {
        const allowed = getPlayerTimeClasses(p.username)
        const filtered: Record<string, number> = {}
        for (const [timeClass, rating] of Object.entries(ratingResults[i])) {
          if (allowed.includes(timeClass)) filtered[timeClass] = rating
        }
        ratingsMap[p.username] = filtered
      })
      setDbRatings(ratingsMap)
    }
    loadAll()
  }, [playerUsernames])

  useEffect(() => {
    async function fetchMin() {
      const min = await getEarliestGameDate(players.map(p => p.username))
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerUsernames])

  function updateFilter(key: keyof GameFilters, value: string) {
    setDraftFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else if (key === 'opponentRatingMin' || key === 'opponentRatingMax') {
        (next as any)[key] = parseInt(value, 10) || undefined
      } else {
        (next as any)[key] = value
      }
      return next
    })
  }

  function updateTerminationFilter(terms: string[]) {
    setDraftFilters(prev => {
      const next = { ...prev }
      if (terms.length === 0) { delete next.termination } else { next.termination = terms }
      return next
    })
  }

  function handleApplyFilters() {
    setFilters(draftFilters)
    setPlayerFilter(draftPlayerFilter)
    setGraphLimit(draftGraphLimit)
  }

  function handleFilterReset() {
    const resetFilters = { dateFrom: DEFAULT_DATE_FROM }
    setDraftFilters(resetFilters)
    setFilters(resetFilters)
    setDraftGraphLimit(100)
    setGraphLimit(100)
    if (hasMultiple) {
      setDraftPlayerFilter(BOTH)
      setPlayerFilter(BOTH)
    }
  }

  function handleSelectGame(game: ChessComGame, username: string) {
    const gameId = (game as any)._gameId
    if (gameId) {
      const from = encodeURIComponent(`/?highlight=${gameId}`)
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(username)}&from=${from}`)
    }
  }

  if (players.length === 0) {
    return (
      <div className='space-y-4'>
        <MyBox title='No Players'>
          <p className='text-xs text-gray-600'>
            No players in the database yet.{' '}
            <a href='/owner/maintenance' className='text-blue-600 underline'>Go to Maintenance</a>{' '}
            to add players.
          </p>
        </MyBox>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className={players.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}>
        {players.map((p, i) => {
          const db      = dbPlayers[i]
          const ratings = dbRatings[p.username] ?? {}
          return (
            <PlayerProfile
              key={p.username}
              username={db?.pl_player ?? p.username}
              displayName={db?.pl_display_name ?? undefined}
              avatar={db?.pl_avatar}
              ratings={Object.keys(ratings).length > 0 ? ratings : undefined}
              onClick={players.length > 1 ? () => handlePlayerProfileClick(p.username) : undefined}
              selected={players.length > 1 && playerFilter === p.username}
            />
          )
        })}
      </div>

      <TabBar />

      {(tab === 'games' || tab === 'graph') && (
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <GameFilterPanel
            players={playerOptions}
            playerFilter={draftPlayerFilter}
            onPlayerFilterChange={setDraftPlayerFilter}
            filters={draftFilters}
            onFilterChange={updateFilter}
            onTerminationChange={updateTerminationFilter}
            onApply={handleApplyFilters}
            onReset={handleFilterReset}
            minDate={minDate}
            mode={tab === 'graph' ? 'graph' : 'games'}
            graphLimit={draftGraphLimit}
            onGraphLimitChange={setDraftGraphLimit}
            fetching={graphLoading}
          />
          <span className='text-xs text-gray-500 whitespace-nowrap'>{gameCount.toLocaleString()} games</span>
        </div>
      )}

      <div className={tab === 'games' ? '' : 'hidden'}>
        <GameList
          players={playerOptions}
          playerFilter={playerFilter}
          filters={filters}
          onSelectGame={handleSelectGame}
          onCountChange={setGameCount}
          lastAnalyzedGameId={lastAnalyzedGameId}
        />
      </div>

      <div className={tab === 'graph' ? '' : 'hidden'}>
        <RatingChart
          players={playerOptions}
          playerFilter={playerFilter}
          filters={filters}
          limit={graphLimit}
          onLoadingChange={setGraphLoading}
        />
      </div>

      <div className={tab === 'openings' ? '' : 'hidden'}>
        <OpeningScoreChart players={players.map(p => p.username)} onSelectGame={handleSelectGame} lastAnalyzedGameId={lastAnalyzedGameId} />
      </div>

      <div className={tab === 'endings' ? '' : 'hidden'}>
        <TerminationChart players={players.map(p => p.username)} />
      </div>
    </div>
  )
}
