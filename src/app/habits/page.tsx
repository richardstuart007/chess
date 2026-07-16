'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import MyPagination from 'nextjs-shared/MyPagination'
import AppNav from '@/src/ui/AppNav'
import HabitsTable from '@/src/ui/analysis/HabitsTable'
import { getHabitsData, getHabitsCount } from '@/src/lib/analysis/chessdb'
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
  const [players,     setPlayers]     = useState<{ username: string; display_name: string | null }[]>([])
  const [player,      setPlayer]      = useState('')
  const [color,       setColor]       = useState<Color>('all')
  const [sortBy,      setSortBy]      = useState<SortBy>('cpLoss')
  const [minMove,     setMinMove]     = useState(MIN_ANALYSIS_MOVE)
  const [minReached,  setMinReached]  = useState(3)
  const [rows,        setRows]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [currentPage, setCurrentPage] = useState(() => ss('chess-habits-page', 1))
  const [totalCount,  setTotalCount]  = useState(0)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.player)     setPlayer(s.player)
        if (s.color)      setColor(s.color)
        if (s.sortBy)     setSortBy(s.sortBy)
        if (s.minMove)    setMinMove(s.minMove)
        if (s.minReached) setMinReached(s.minReached)
      } catch { /* ignore corrupt storage */ }
    }
  }, [])

  useEffect(() => {
    if (!player) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ player, color, sortBy, minMove, minReached }))
  }, [player, color, sortBy, minMove, minReached])

  useEffect(() => {
    try { sessionStorage.setItem('chess-habits-page', JSON.stringify(currentPage)) } catch {}
  }, [currentPage])

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
      if (ps.length > 0 && !player) setPlayer(ps[0].username)
    }
    loadPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //
  //  Reset back to page 1 whenever the filters change, same as when the user
  //  changed them directly.
  //
  useEffect(() => {
    setCurrentPage(1)
  }, [player, color, sortBy, minMove, minReached])

  useEffect(() => {
    async function loadCount() {
      if (!player) { setTotalCount(0); return }
      const count = await getHabitsCount({
        player,
        color: color === 'all' ? undefined : color,
        minMove,
        minReached
      })
      setTotalCount(count)
    }
    loadCount()
  }, [player, color, minMove, minReached])

  const totalPages = Math.max(1, Math.ceil(totalCount / HABITS_ITEMS_PER_PAGE))

  const load = useCallback(async () => {
    if (!player) return
    setLoading(true)
    try {
      const data = await getHabitsData({
        player,
        color:      color === 'all' ? undefined : color,
        sortBy,
        limit:      HABITS_ITEMS_PER_PAGE,
        offset:     (currentPage - 1) * HABITS_ITEMS_PER_PAGE,
        minMove,
        minReached
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [player, color, sortBy, minMove, minReached, currentPage])

  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <AppNav />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Blunder Habits</h1>
          <MyHelp title='Blunder Habits' items={HABITS_ITEMS} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Player */}
          <select
            value={player}
            onChange={e => setPlayer(e.target.value)}
            className="border rounded px-2 py-1 text-sm font-medium"
          >
            {players.map(p => (
              <option key={p.username} value={p.username}>
                {p.display_name ?? p.username}
              </option>
            ))}
          </select>

          {/* Color filter */}
          <div className="flex rounded border overflow-hidden text-sm">
            {(['all', 'w', 'b'] as Color[]).map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`px-3 py-1 ${color === c ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {c === 'all' ? 'All' : c === 'w' ? 'As White' : 'As Black'}
              </button>
            ))}
          </div>

          {/* Min reached */}
          <select
            value={minReached}
            onChange={e => setMinReached(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={2}>Min 2×</option>
            <option value={3}>Min 3×</option>
            <option value={5}>Min 5×</option>
            <option value={10}>Min 10×</option>
          </select>

          {/* Min move */}
          <select
            value={minMove}
            onChange={e => setMinMove(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={MIN_ANALYSIS_MOVE}>{`From move ${MIN_ANALYSIS_MOVE}`}</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="cpLoss">Sort: Worst CP first</option>
            <option value="reached">Sort: Most played first</option>
          </select>
        </div>
      </div>

      {loading ? (
        <MyLoadingMessage message1="Loading habits…" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <HabitsTable rows={rows} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div />
        {totalPages > 1 && (
          <MyPagination
            totalPages={totalPages}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
          />
        )}
        <span className="text-xs text-gray-400">
          Page {currentPage} of {totalPages} ({totalCount.toLocaleString()} bad move{totalCount !== 1 ? 's' : ''})
        </span>
      </div>
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
