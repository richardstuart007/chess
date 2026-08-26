'use client'

//==================================================================================================
//  1) DESCRIPTION
//    HabitsPage — /habits. Renders HabitsTable (recurring good/bad moves) with paging, behind a
//    Suspense boundary. Color/Quality/Sort/Min Move/Min Reached apply instantly; Date From/
//    Opening/ECO are global filters staged as drafts and only applied on Filter click.
//==================================================================================================

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import MyBox from 'nextjs-shared/MyBox'
import HabitsTable from '@/src/ui/analysis/HabitsTable'
import { getHabitsData_player, getHabitsCount_player, dismissHabit_player, undismissHabit_player } from '@/src/lib/analysis/chessdb_player'
import { getPlayers } from '@/src/lib/actions/players'
import { useGlobalFilter, useGlobalFilters } from '@/src/lib/hooks/useGlobalFilter'
import { MIN_ANALYSIS_MOVE_Player, HABITS_ITEMS_PER_PAGE_Player, HABITS_ROWS_OPTIONS_Player, SESSION_STORAGE_PREFIX, DEFAULT_DATE_FROM_Player } from '@/src/lib/constants'

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

export default function HabitsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <HabitsContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  HabitsContent — holds all filter/paging state (color/quality/sort/minMove/minReached
//  instant; dateFrom/opening/eco global, staged as drafts) and renders HabitsTable
//----------------------------------------------------------------------------------
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
  const [minMove,     setMinMove]     = useState(MIN_ANALYSIS_MOVE_Player)
  const [minReached,  setMinReached]  = useState(3)
  const [showDismissed, setShowDismissed] = useState(false)
  //
  //  Date From/Opening/ECO are also global (shared via URL with GameList/Graph/OpeningScoreChart/
  //  TerminationChart's own Date From/Opening/ECO filters) and applied on an explicit Filter
  //  click, not instantly like the filters above — draftDateFrom/draftOpening/draftEco track the
  //  inputs as typed/picked, dateFromFilter/openingFilter/ecoFilter (the applied, global values)
  //  drive the actual query and only change when the Filter button is clicked. Absent dateFrom
  //  still defaults to DEFAULT_DATE_FROM_Player, matching every other consumer of this global filter.
  //
  const [rawDateFromFilter] = useGlobalFilter('dateFrom')
  const dateFromFilter = rawDateFromFilter || DEFAULT_DATE_FROM_Player
  const [openingFilter] = useGlobalFilter('opening')
  const [ecoFilter]     = useGlobalFilter('eco')
  //
  //  handleApplyFilters below sets all three together in one push — each useGlobalFilter's
  //  own setValue is unsafe for that (see useGlobalFilters' own comment).
  //
  const setGlobalFilters = useGlobalFilters()
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromFilter)
  const [draftOpening, setDraftOpening] = useState(openingFilter)
  const [draftEco,     setDraftEco]     = useState(ecoFilter)
  const [rows,        setRows]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  //
  //  Initialized to plain defaults (matching the server render) rather than reading
  //  sessionStorage synchronously — sessionStorage is only available client-side, so
  //  restoring persisted state happens in the effect below, after mount, to avoid a
  //  hydration mismatch between the server-rendered HTML and the first client render.
  //
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(HABITS_ITEMS_PER_PAGE_Player)
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
    setRowsPerPage(ss(`${SESSION_STORAGE_PREFIX}habits-rows`, HABITS_ITEMS_PER_PAGE_Player))
    setHydrated(true)
  }, [])

  //
  //  Keeps the draft Date From/Opening/ECO boxes in sync whenever the global values change from
  //  elsewhere (initial mount, tab navigation carrying them in from GameList, or this page's
  //  own Filter click writing them back) — never from local typing.
  //
  useEffect(() => {
    setDraftDateFrom(dateFromFilter)
    setDraftOpening(openingFilter)
    setDraftEco(ecoFilter)
  }, [dateFromFilter, openingFilter, ecoFilter])

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
    const key = JSON.stringify({ playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed, dateFromFilter, openingFilter, ecoFilter })
    if (filtersResetKeyRef.current !== undefined && filtersResetKeyRef.current !== key) {
      setCurrentPage(1)
    }
    filtersResetKeyRef.current = key
  }, [playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed, dateFromFilter, openingFilter, ecoFilter, hydrated])

  useEffect(() => {
    if (!hydrated) return
    async function loadCount() {
      if (playersToFetch.length === 0) { setTotalCount(0); return }
      const count = await getHabitsCount_player({
        players: playerFilter ? [playerFilter] : undefined,
        color: color === 'all' ? undefined : color,
        quality,
        minReached,
        dismissed: showDismissed,
        opening: openingFilter || undefined,
        eco: ecoFilter || undefined,
        sinceDate: dateFromFilter || undefined
      })
      setTotalCount(count)
    }
    loadCount()
  }, [playersToFetch, color, quality, minMove, minReached, showDismissed, dateFromFilter, openingFilter, ecoFilter, hydrated])

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage))

  const load = useCallback(async () => {
    if (!hydrated || playersToFetch.length === 0) return
    setLoading(true)
    try {
      const data = await getHabitsData_player({
        players:    playerFilter ? [playerFilter] : undefined,
        color:      color === 'all' ? undefined : color,
        quality,
        sortBy,
        limit:      rowsPerPage,
        offset:     (currentPage - 1) * rowsPerPage,
        minReached,
        dismissed:  showDismissed,
        opening:    openingFilter || undefined,
        eco:        ecoFilter || undefined,
        sinceDate:  dateFromFilter || undefined
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [playersToFetch, color, quality, sortBy, minMove, minReached, showDismissed, dateFromFilter, openingFilter, ecoFilter, currentPage, rowsPerPage, hydrated])

  useEffect(() => { load() }, [load])

  //
  //  handleToggleDismiss — dismisses or restores depending on which view is showing, then
  //  re-fetches the current page so it backfills to rowsPerPage from the next row in sort
  //  order, rather than just dropping the row locally and leaving the page short — either
  //  direction removes the row from whichever view is currently active. Uses the row's own
  //  player (not the page-level filter) since "All" can show rows from multiple players at once.
  //
  const handleToggleDismiss = useCallback(async (posId: number, moveSan: string, rowPlayer: string) => {
    if (showDismissed) {
      await undismissHabit_player(rowPlayer, posId, moveSan)
    } else {
      await dismissHabit_player(rowPlayer, posId, moveSan)
    }
    setTotalCount(c => Math.max(0, c - 1))
    load()
  }, [showDismissed, load])

  const handleApplyFilters = useCallback(() => {
    setGlobalFilters({ dateFrom: draftDateFrom, opening: draftOpening, eco: draftEco })
  }, [draftDateFrom, draftOpening, draftEco, setGlobalFilters])

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
            dateFrom={draftDateFrom}
            onDateFromChange={setDraftDateFrom}
            opening={draftOpening}
            onOpeningChange={setDraftOpening}
            eco={draftEco}
            onEcoChange={(v: string) => setDraftEco(v.toUpperCase())}
            onApplyFilters={handleApplyFilters}
            filtersPending={draftDateFrom !== dateFromFilter || draftOpening !== openingFilter || draftEco !== ecoFilter}
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
              rowsOptions={HABITS_ROWS_OPTIONS_Player}
              overrideClass='flex-1'
              totalRows={totalCount}
            />
          )}
        </div>
      </MyBox>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  ss — read+parse a sessionStorage value, falling back if unset/corrupt/unavailable (SSR)
//----------------------------------------------------------------------------------
function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
