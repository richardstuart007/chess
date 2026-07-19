'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import MyPagination from 'nextjs-shared/MyPagination'
import MyBox from 'nextjs-shared/MyBox'
import HabitsTable from '@/src/ui/analysis/HabitsTable'
import { getHabitsData, getHabitsCount, dismissHabit, undismissHabit } from '@/src/lib/analysis/chessdb'
import { getPlayers } from '@/src/lib/actions/players'
import { MIN_ANALYSIS_MOVE, HABITS_ITEMS_PER_PAGE } from '@/src/lib/constants'

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

const STORAGE_KEY = 'habits_filters'

const HABITS_ITEMS = [
  { heading: 'What is shown',  body: 'Moves you play repeatedly from the same position where you lose centipawns (CP). Only losing moves are shown here — clicking a row opens all moves (good and bad) for that position.' },
  { heading: 'Click a row',    body: 'Opens Position Detail: see every move you\'ve played from that position, win/loss stats, the Stockfish best move, AI coaching advice, and your full game history there.' },
  { heading: 'CP column',      body: 'Average CP change when you play this move. Negative (red) = you lose advantage. Sorted worst first by default.' },
  { heading: 'Prerequisites',  body: 'Build Position Tree then Evaluate Positions must both be run via the Pipeline tab.' },
]

type Color  = 'all' | 'w' | 'b'
type SortBy = 'cpLoss' | 'reached'

function HabitsContent() {
  const searchParams = useSearchParams()
  const [players,     setPlayers]     = useState<{ username: string; display_name: string | null }[]>([])
  const playerFilter = searchParams.get('player') ?? ''
  const usernamesToFetch = useMemo(
    () => playerFilter ? [playerFilter] : players.map(p => p.username),
    [playerFilter, players]
  )
  const [color,       setColor]       = useState<Color>('all')
  const [sortBy,      setSortBy]      = useState<SortBy>('cpLoss')
  const [minMove,     setMinMove]     = useState(MIN_ANALYSIS_MOVE)
  const [minReached,  setMinReached]  = useState(3)
  const [showDismissed, setShowDismissed] = useState(false)
  const [rows,        setRows]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [currentPage, setCurrentPage] = useState(() => ss('chess-habits-page', 1))
  const [totalCount,  setTotalCount]  = useState(0)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.color)      setColor(s.color)
        if (s.sortBy)     setSortBy(s.sortBy)
        if (s.minMove)    setMinMove(s.minMove)
        if (s.minReached) setMinReached(s.minReached)
        if (s.showDismissed) setShowDismissed(s.showDismissed)
      } catch { /* ignore corrupt storage */ }
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ color, sortBy, minMove, minReached, showDismissed }))
  }, [color, sortBy, minMove, minReached, showDismissed])

  useEffect(() => {
    try { sessionStorage.setItem('chess-habits-page', JSON.stringify(currentPage)) } catch {}
  }, [currentPage])

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  //
  //  Reset back to page 1 whenever the filters change, same as when the user
  //  changed them directly.
  //
  useEffect(() => {
    setCurrentPage(1)
  }, [usernamesToFetch, color, sortBy, minMove, minReached, showDismissed])

  useEffect(() => {
    async function loadCount() {
      if (usernamesToFetch.length === 0) { setTotalCount(0); return }
      const count = await getHabitsCount({
        players: usernamesToFetch,
        color: color === 'all' ? undefined : color,
        minReached,
        dismissed: showDismissed
      })
      setTotalCount(count)
    }
    loadCount()
  }, [usernamesToFetch, color, minMove, minReached, showDismissed])

  const totalPages = Math.max(1, Math.ceil(totalCount / HABITS_ITEMS_PER_PAGE))

  const load = useCallback(async () => {
    if (usernamesToFetch.length === 0) return
    setLoading(true)
    try {
      const data = await getHabitsData({
        players:    usernamesToFetch,
        color:      color === 'all' ? undefined : color,
        sortBy,
        limit:      HABITS_ITEMS_PER_PAGE,
        offset:     (currentPage - 1) * HABITS_ITEMS_PER_PAGE,
        minReached,
        dismissed:  showDismissed
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [usernamesToFetch, color, sortBy, minMove, minReached, showDismissed, currentPage])

  useEffect(() => { load() }, [load])

  //
  //  handleToggleDismiss — dismisses or restores depending on which view is showing,
  //  then drops the row from the current page locally instead of refetching (avoids a
  //  page/offset shift for the other rows still on screen) — either direction removes
  //  the row from whichever view is currently active. Uses the row's own player (not the
  //  page-level filter) since "All" can show rows from multiple players at once.
  //
  const handleToggleDismiss = useCallback(async (posId: number, moveSan: string, rowPlayer: string) => {
    if (showDismissed) {
      await undismissHabit(rowPlayer, posId, moveSan)
    } else {
      await dismissHabit(rowPlayer, posId, moveSan)
    }
    setRows(rows => rows.filter(r => !(r.pos_id === posId && r.move_san === moveSan)))
    setTotalCount(c => Math.max(0, c - 1))
  }, [showDismissed])

  return (
    <div className="space-y-4">
      <MyBox>
        <h3 className="text-xs font-bold mb-2 flex items-center gap-2">
          Blunder Habits
          <MyHelp title='Blunder Habits' items={HABITS_ITEMS} />
        </h3>

        {loading ? (
          <MyLoadingMessage message1="Loading habits…" />
        ) : (
          <HabitsTable
            rows={rows}
            dismissedView={showDismissed}
            onToggleDismiss={handleToggleDismiss}
            players={players}
            color={color}
            onColorChange={setColor}
            minMove={minMove}
            onMinMoveChange={setMinMove}
            minReached={minReached}
            onMinReachedChange={setMinReached}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            onShowDismissedToggle={() => setShowDismissed(v => !v)}
          />
        )}

        <div className="flex items-center justify-between mt-3">
          <div />
          {totalPages > 1 && (
            <MyPagination
              totalPages={totalPages}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
            />
          )}
          <span className="text-xs text-gray-400">
            Page {currentPage} of {totalPages} ({totalCount.toLocaleString()} {showDismissed ? 'dismissed' : 'bad'} move{totalCount !== 1 ? 's' : ''})
          </span>
        </div>
      </MyBox>
    </div>
  )
}

export default function HabitsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <HabitsContent />
    </Suspense>
  )
}
