'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import MyBox from 'nextjs-shared/MyBox'
import HabitsTable from '@/src/ui/analysis/HabitsTable'
import { getHabitsData, getHabitsCount, dismissHabit, undismissHabit } from '@/src/lib/analysis/chessdb'
import { getPlayers } from '@/src/lib/actions/players'
import { MIN_ANALYSIS_MOVE, HABITS_ITEMS_PER_PAGE, SESSION_STORAGE_PREFIX } from '@/src/lib/constants'

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

const STORAGE_KEY = `${SESSION_STORAGE_PREFIX}habits_filters`

const HABITS_ITEMS = [
  { heading: 'What is shown',  body: 'Moves you play repeatedly from the same position — good or bad. Use the Quality filter to switch between habits that cost you centipawns and ones that gained them. Clicking a row opens all moves (good and bad) for that position.' },
  { heading: 'Click a row',    body: 'Opens Position Detail: see every move you\'ve played from that position, win/loss stats, the Stockfish best move, AI coaching advice, and your full game history there.' },
  { heading: 'Eval column',    body: 'Stockfish\'s evaluation of the position after you play this move (white\'s perspective). Sorted by biggest impact first by default.' },
  { heading: 'Prerequisites',  body: 'Build Position Tree then Evaluate Positions must both be run via the Pipeline tab.' },
]

type Color   = 'all' | 'w' | 'b'
type SortBy  = 'cpLoss' | 'reached'
type Quality = 'bad' | 'good'

function HabitsContent() {
  const searchParams = useSearchParams()
  const [players,     setPlayers]     = useState<{ player: string; display_name: string | null }[]>([])
  const playerFilter = searchParams.get('player') ?? ''
  const playersToFetch = useMemo(
    () => playerFilter ? [playerFilter] : players.map(p => p.player),
    [playerFilter, players]
  )
  const [color,       setColor]       = useState<Color>('all')
  const [quality,     setQuality]     = useState<Quality>('bad')
  const [sortBy,      setSortBy]      = useState<SortBy>('cpLoss')
  const [minMove,     setMinMove]     = useState(MIN_ANALYSIS_MOVE)
  const [minReached,  setMinReached]  = useState(3)
  const [showDismissed, setShowDismissed] = useState(false)
  const [rows,        setRows]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(HABITS_ITEMS_PER_PAGE)
  const [totalCount,  setTotalCount]  = useState(0)
  const [hydrated,    setHydrated]    = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.color)      setColor(s.color)
        if (s.quality)    setQuality(s.quality)
        if (s.sortBy)     setSortBy(s.sortBy)
        if (s.minMove)    setMinMove(s.minMove)
        if (s.minReached) setMinReached(s.minReached)
        if (s.showDismissed) setShowDismissed(s.showDismissed)
      } catch { /* ignore corrupt storage */ }
    }
    setCurrentPage(ss(`${SESSION_STORAGE_PREFIX}habits-page`, 1))
    setRowsPerPage(ss(`${SESSION_STORAGE_PREFIX}habits-rows`, HABITS_ITEMS_PER_PAGE))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ color, quality, sortBy, minMove, minReached, showDismissed }))
  }, [color, quality, sortBy, minMove, minReached, showDismissed, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}habits-page`, JSON.stringify(currentPage)) } catch {}
  }, [currentPage, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}habits-rows`, JSON.stringify(rowsPerPage)) } catch {}
  }, [rowsPerPage, hydrated])

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
    }
    loadPlayers()
  }, [])

  //
  //  Reset back to page 1 whenever the filters genuinely change, same as when the user
  //  changed them directly — guarded via filtersResetKeyRef so the one-time hydration
  //  restore above (which also changes color/quality/etc.) isn't mistaken for a real
  //  change and doesn't clobber the just-restored page number.
  //
  const filtersResetKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!hydrated) return
    const key = JSON.stringify({ playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed })
    if (filtersResetKeyRef.current !== undefined && filtersResetKeyRef.current !== key) {
      setCurrentPage(1)
    }
    filtersResetKeyRef.current = key
  }, [playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed, hydrated])

  useEffect(() => {
    if (!hydrated) return
    async function loadCount() {
      if (playersToFetch.length === 0) { setTotalCount(0); return }
      const count = await getHabitsCount({
        players: playersToFetch,
        color: color === 'all' ? undefined : color,
        quality,
        minReached,
        dismissed: showDismissed
      })
      setTotalCount(count)
    }
    loadCount()
  }, [playersToFetch, color, quality, minMove, minReached, showDismissed, hydrated])

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage))

  const load = useCallback(async () => {
    if (!hydrated || playersToFetch.length === 0) return
    setLoading(true)
    try {
      const data = await getHabitsData({
        players:    playersToFetch,
        color:      color === 'all' ? undefined : color,
        quality,
        sortBy,
        limit:      rowsPerPage,
        offset:     (currentPage - 1) * rowsPerPage,
        minReached,
        dismissed:  showDismissed
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed, currentPage, rowsPerPage, hydrated])

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
          Habits
          <MyHelp title='Habits' items={HABITS_ITEMS} />
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
            quality={quality}
            onQualityChange={setQuality}
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
            <MyPaginationFooter
              totalPages={totalPages}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={v => { setRowsPerPage(v); setCurrentPage(1) }}
            />
          )}
          <span className="text-xs text-gray-400">
            Page {currentPage} of {totalPages} ({totalCount.toLocaleString()} {showDismissed ? 'dismissed' : quality} move{totalCount !== 1 ? 's' : ''})
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
