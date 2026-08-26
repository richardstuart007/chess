'use client'

//==================================================================================================
//  1) DESCRIPTION
//    ChessBoardView_shared — full analysis board for one player game: move tree, Stockfish game
//    analysis and infinite-analysis panels, Lichess Masters Explorer panels, our own
//    synced-master-games panels, and a live Chess.com game search for the current position.
//
//    Parameters:
//      game                        — the chess.com game to display
//      gdid                        — this game's own database id, if saved
//      player                      — the tracked player whose perspective this view is from
//      stockfishDepth              — current Game Analysis depth (controlled by the caller)
//      onStockfishDepthChange      — called with the new depth on change
//      deepAnalysisDepth           — current infinite-analysis depth (controlled by the caller)
//      deepAnalysisMultiPv         — current infinite-analysis MultiPV count
//      onDeepAnalysisDepthChange   — called with the new depth on change
//      onDeepAnalysisMultiPvChange — called with the new MultiPV count on change
//
//  2) NOTES
//    Still contains the Moves Played/Games Played panel and its supporting state
//    (moveCounts/moveSummary/positionGames/etc.), which is genuinely player-only
//    (built on chessdb_player's tgam_game_positions-joined queries) — extracting that
//    into its own _player component is agreed but not yet done (see
//    PLAN_master-games-fen-eval-reuse). Renamed to _shared as part of the same pass
//    that renamed MasterGameView to MasterGameView_master and split chessdb.ts into
//    chessdb_shared.ts/chessdb_player.ts.
//==================================================================================================

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Chess, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import MySelect from 'nextjs-shared/MySelect'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { MyToggle } from 'nextjs-shared/MyToggle'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import BackButton from '@/src/ui/BackButton'
import { ChessComGame, getPlayerResult } from '@/src/lib/chesscom'
import { parsePgnHeaders } from '@/src/lib/parsePgn'
import { StockfishEngine, PlyEvaluation, STOCKFISH_DEFAULTS, InfiniteAnalysisUpdate, classifyMove } from '@/src/lib/stockfish'
import { saveGameEvaluations_player } from '@/src/lib/actions/games'
import { upgradePositionEvaluation_shared, getPositionEvaluationsBulk_shared } from '@/src/lib/analysis/chessdb_shared'
import { getMovePlayCounts_player, fetchGamesForPosition_player, getGamesForPositionCount_player, getMoveSummaryForPosition_player, PositionGameHit, MoveRow } from '@/src/lib/analysis/chessdb_player'
import { getMastersExplorer, LichessExplorerResponse } from '@/src/lib/actions/lichess'
import { searchChessComGames, ChessComSearchGame, ChessComSearchFilters } from '@/src/lib/actions/chesscomSearch'
import { getMasterPlayerNames } from '@/src/lib/actions/masterPlayers'
import { MOVE_COUNT_MIN_MOVE_Player, POSITION_GAMES_ROWS_DEFAULT_Player, POSITION_GAMES_ROWS_OPTIONS_Player } from '@/src/lib/constants'
import { truncateFen } from '@/src/lib/fen'
import { winPct } from '@/src/lib/winPct'
import { formatCp } from '@/src/lib/formatCp'
import {
  MoveNode,
  AnalysisTree,
  MultiPvResult,
  buildTree,
  addBranch,
  addPvBranch,
  getPath,
  replayToNode,
  findMainLineAncestor,
  isOnMainLine,
  getMainLineIndex
} from '@/src/lib/analysisTree'
import AlternativeLines_shared from './AlternativeLines_shared'
import MoveTree_shared from './MoveTree_shared'
import DepthInput_shared from './DepthInput_shared'
import GameAnalysisPanel_shared from './GameAnalysisPanel_shared'
import MasterMovesDbPanel from './MasterMovesDbPanel'
import MasterGamesDbPanel from './MasterGamesDbPanel'

interface ChessBoardViewProps {
  game: ChessComGame
  gdid?: number
  player: string
  stockfishDepth?: number
  onStockfishDepthChange?: (depth: number) => void
  deepAnalysisDepth?: number
  deepAnalysisMultiPv?: number
  onDeepAnalysisDepthChange?: (depth: number) => void
  onDeepAnalysisMultiPvChange?: (multiPv: number) => void
}

const CLASSIFICATION_SQUARE_COLORS: Record<string, string> = {
  blunder: 'rgba(239, 68, 68, 0.6)',
  mistake: 'rgba(249, 115, 22, 0.6)',
  inaccuracy: 'rgba(234, 179, 8, 0.5)'
}

//
//  Chess.com's own /games/search filter values — see ChessComSearchFilters/searchChessComGames
//  in chesscomSearch.ts for where these are consumed and the full provenance comment.
//
const CHESSCOM_YEAR_COMPARISON_OPTIONS = [
  { value: '1', label: '=' },
  { value: '2', label: '≥' },
  { value: '3', label: '≤' }
]
const CHESSCOM_RESULT_OPTIONS = [
  { value: '0', label: 'Any' },
  { value: '1', label: 'White wins' },
  { value: '2', label: 'Black wins' },
  { value: '5', label: 'Draw' },
  { value: '6', label: 'Not a draw' }
]
const CHESSCOM_SORT_OPTIONS = [
  { value: '', label: 'Most recent' },
  { value: '8', label: 'Oldest' },
  { value: '3', label: 'Rating (White)' },
  { value: '4', label: 'Rating (Black)' },
  { value: '9', label: 'Most moves' },
  { value: '10', label: 'Fewest moves' }
]

export default function ChessBoardView_shared({ game, gdid, player, stockfishDepth, onStockfishDepthChange, deepAnalysisDepth, deepAnalysisMultiPv, onDeepAnalysisDepthChange, onDeepAnalysisMultiPvChange }: ChessBoardViewProps) {
  const router = useRouter()
  const playerColor = getPlayerResult(game, player).color
  const result = getPlayerResult(game, player).result
  const { openingName: opening, eco } = game.pgn ? parsePgnHeaders(game.pgn) : { openingName: (game as any)._openingName ?? '', eco: (game as any)._ecoCode ?? '' }

  // Tree state
  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)
  const [moveCounts, setMoveCounts] = useState<Record<string, number>>({})
  const [positionGames, setPositionGames] = useState<PositionGameHit[]>([])
  const [positionGamesTotalRows, setPositionGamesTotalRows] = useState(0)
  const [positionGamesPage, setPositionGamesPage] = useState(1)
  const [positionGamesRowsPerPage, setPositionGamesRowsPerPage] = useState(POSITION_GAMES_ROWS_DEFAULT_Player)
  const [moveSummary, setMoveSummary] = useState<MoveRow[]>([])
  const [selectedPositionMove, setSelectedPositionMove] = useState<string | null>(null)
  const [mastersData, setMastersData] = useState<LichessExplorerResponse | null>(null)
  const [selectedMastersMove, setSelectedMastersMove] = useState<string | null>(null)

  // Display chess instance
  const displayGame = useRef(new Chess())

  // Analysis state
  // Can have gaps (undefined) — tpose_positions_eval deliberately doesn't cache every move
  // (e.g. moves before MIN_ANALYSIS_MOVE_Player), so getGameEvals now resolves per-ply instead
  // of truncating the whole array at the first unknown position
  const [plyEvals, setPlyEvals] = useState<(PlyEvaluation | undefined)[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResultMessage, setAnalysisResultMessage] = useState('')
  const engineRef = useRef<StockfishEngine | null>(null)

  // Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game
  const [fromMove, setFromMove] = useState(1)
  const [toMove, setToMove] = useState(1)

  // Deep analysis state
  const [deepAnalyzing, setDeepAnalyzing] = useState(false)
  const [deepAnalysisData, setDeepAnalysisData] = useState<InfiniteAnalysisUpdate | null>(null)
  const latestAnalysisLinesRef = useRef<{ lines: MultiPvResult[]; depth: number } | null>(null)
  const [saveAnalysisMessage, setSaveAnalysisMessage] = useState('')
  const [fenCopied, setFenCopied] = useState(false)

  // Chess.com Games — live search results for the current position, fetched on demand
  const [chesscomGames, setChesscomGames] = useState<ChessComSearchGame[] | null>(null)
  const [chesscomLoading, setChesscomLoading] = useState(false)
  //
  //  Master player names seen so far across Chess.com Games searches — backs the Player 1/2
  //  MySelect dropdowns. Loaded once on mount, then grown locally (in addition to the DB
  //  upsert) as new names appear in search results, so they're selectable immediately
  //  without a re-fetch.
  //
  const [masterPlayerNames, setMasterPlayerNames] = useState<string[]>([])

  // Chess.com Games search filters — param names match chess.com's own search URL
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [fixedcolors, setFixedcolors] = useState(false)
  const [mr, setMr] = useState<number | ''>('')
  const [year, setYear] = useState('')
  const [lsty, setLsty] = useState(CHESSCOM_YEAR_COMPARISON_OPTIONS[0].value)
  const [lstresult, setLstresult] = useState(CHESSCOM_RESULT_OPTIONS[0].value)
  const [sort, setSort] = useState(CHESSCOM_SORT_OPTIONS[0].value)

  // Force re-render on board changes (displayGame is a ref)
  const [boardKey, setBoardKey] = useState(0)

  // -----------------------------------------------------------------------
  // Parse PGN on mount → build tree
  // -----------------------------------------------------------------------
  useEffect(() => {
    const g = new Chess()
    g.loadPgn(game.pgn)

    const moves = g.history({ verbose: true })
    const history = moves.map(m => ({ san: m.san, from: m.from, to: m.to }))

    const g2 = new Chess()
    const fens = [g2.fen()]
    for (const m of moves) {
      g2.move(m.san)
      fens.push(g2.fen())
    }

    const newTree = buildTree(history, fens, [])

    const totalFullMoves = Math.max(1, Math.ceil(newTree.mainLine.length / 2))
    const storedPlyEvals = (game as any)._plyEvals as PlyEvaluation[] | null
    if (storedPlyEvals && storedPlyEvals.length > 0) {
      for (let i = 0; i < Math.min(storedPlyEvals.length, newTree.mainLine.length); i++) {
        newTree.mainLine[i].evaluation = storedPlyEvals[i]
      }
      setPlyEvals(storedPlyEvals)
    } else {
      setPlyEvals([])
    }

    setTree(newTree)
    setCurrentNode(null)
    setFromMove(storedPlyEvals && storedPlyEvals.length > 0 ? Math.min(5, totalFullMoves) : 1)
    setToMove(totalFullMoves)
    displayGame.current = new Chess()
    setBoardKey(k => k + 1)
  }, [game])

  // -----------------------------------------------------------------------
  // Load master player names (for the Chess.com Games Player 1/2 datalist) once on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    getMasterPlayerNames().then(setMasterPlayerNames).catch(() => setMasterPlayerNames([]))
  }, [])

  // -----------------------------------------------------------------------
  // Move-play-count badges — how many times each move (from MOVE_COUNT_MIN_MOVE_Player
  // onward, main line + every variation) was played from its position, across
  // this player's own synced games. One batched lookup per tree change.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!tree) { setMoveCounts({}); return }
    let cancelled = false

    const nodes = collectNodesFromMove(tree.root, MOVE_COUNT_MIN_MOVE_Player)
    const fens = nodes.map(n => truncateFen(n.fenBefore))

    if (fens.length === 0) { setMoveCounts({}); return }

    getMovePlayCounts_player(fens, player).then(countsByFen => {
      if (cancelled) return
      const byNodeId: Record<string, number> = {}
      for (const n of nodes) {
        const c = countsByFen[truncateFen(n.fenBefore)]?.[n.san]
        if (c) byNodeId[n.id] = c
      }
      setMoveCounts(byNodeId)
    }).catch(() => { if (!cancelled) setMoveCounts({}) })

    return () => { cancelled = true }
  }, [tree, player])

  // -----------------------------------------------------------------------
  // Moves From This Position — one row per move played from whatever position
  // is currently on the board, scoped to this player. Loads automatically on
  // every position change; a click on a row reveals the matching games below
  // (see positionGames + selectedPositionMove).
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen ?? tree?.root.fen
    setSelectedPositionMove(null)
    if (!fen) { setMoveSummary([]); return }
    let cancelled = false

    getMoveSummaryForPosition_player(fen, player).then(rows => {
      if (!cancelled) setMoveSummary(rows)
    }).catch(() => { if (!cancelled) setMoveSummary([]) })

    return () => { cancelled = true }
  }, [currentNode, tree, player])

  // -----------------------------------------------------------------------
  // Masters — master-level game stats for whatever position is currently on the
  // board, from the Lichess Masters Opening Explorer (live fetch, no DB storage).
  // Only fetches once a position has actually been clicked on (currentNode set) —
  // stays empty for the tree root on initial page load.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen
    if (!fen) { setMastersData(null); return }
    let cancelled = false

    getMastersExplorer(fen).then(data => {
      if (!cancelled) setMastersData(data)
    }).catch(() => { if (!cancelled) setMastersData(null) })

    return () => { cancelled = true }
  }, [currentNode, tree])

  // -----------------------------------------------------------------------
  // Games Played — one page of this player's own games that reached whatever position is
  // currently on the board, any move. Narrowed server-side to the selected move when a
  // "Moves Played" row is highlighted (see moveSummary + selectedPositionMove) — the reset
  // effect below returns to page 1 whenever the position/player/move identity changes.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen ?? tree?.root.fen
    if (!fen) { setPositionGames([]); setPositionGamesTotalRows(0); return }
    let cancelled = false

    Promise.all([
      fetchGamesForPosition_player(fen, player, positionGamesPage, positionGamesRowsPerPage, selectedPositionMove ?? undefined),
      getGamesForPositionCount_player(fen, player, selectedPositionMove ?? undefined)
    ]).then(([games, totalRows]) => {
      if (!cancelled) { setPositionGames(games); setPositionGamesTotalRows(totalRows) }
    }).catch(() => { if (!cancelled) { setPositionGames([]); setPositionGamesTotalRows(0) } })

    return () => { cancelled = true }
  }, [currentNode, tree, player, positionGamesPage, positionGamesRowsPerPage, selectedPositionMove])

  // -----------------------------------------------------------------------
  // Reset Games Played back to page 1 whenever the position/player/move being viewed
  // actually changes — same guard pattern as GameList's own filtersResetKeyRef, so
  // paging state from a previous position never carries over as a stale offset.
  // Also zeroes positionGamesTotalRows so the pagination footer never renders off a
  // stale pre-change total during the gap before the new count fetch resolves — left
  // un-reset, the "next page" arrow could briefly show enabled for a page count that
  // no longer applies to the new filtered set.
  // -----------------------------------------------------------------------
  const positionGamesResetKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const fen = currentNode?.fen ?? tree?.root.fen
    const key = JSON.stringify({ fen, player, selectedPositionMove })
    if (positionGamesResetKeyRef.current !== undefined && positionGamesResetKeyRef.current !== key) {
      setPositionGamesPage(1)
      setPositionGamesTotalRows(0)
    }
    positionGamesResetKeyRef.current = key
  }, [currentNode, tree, player, selectedPositionMove])

  // -----------------------------------------------------------------------
  // Navigate to a tree node
  // -----------------------------------------------------------------------
  const goToNode = useCallback((node: MoveNode | null) => {
    setCurrentNode(node)
    if (!node || node.san === '') {
      displayGame.current = new Chess(tree?.root.fen)
    } else {
      displayGame.current = replayToNode(node, tree?.root.fen)
    }
    setBoardKey(k => k + 1)
  }, [tree])

  // Navigate main line by index (for slider)
  const goToMainLineIndex = useCallback((index: number) => {
    if (!tree) return
    if (index <= 0) {
      goToNode(null)
    } else {
      const clamped = Math.min(index, tree.mainLine.length)
      goToNode(tree.mainLine[clamped - 1])
    }
  }, [tree, goToNode])

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentNode) {
          goToNode(currentNode.parent?.san === '' ? null : currentNode.parent)
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!currentNode && tree) {
          goToNode(tree.mainLine[0] ?? null)
        } else if (currentNode?.children.length) {
          goToNode(currentNode.children[0])
        }
      }
      if (e.key === 'Home') {
        e.preventDefault()
        goToNode(null)
      }
      if (e.key === 'End') {
        e.preventDefault()
        if (tree && tree.mainLine.length > 0) {
          goToNode(tree.mainLine[tree.mainLine.length - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentNode, tree, goToNode])

  // -----------------------------------------------------------------------
  // Stop and clear position analysis when navigating to a different position —
  // results belong to the position being left, not the one now on the board
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (deepAnalyzing) {
      engineRef.current?.stopAnalysis()
      setDeepAnalyzing(false)
    }
    setDeepAnalysisData(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode])

  // -----------------------------------------------------------------------
  // Run full-game Stockfish analysis. On re-analysis (plyEvals already
  // exist), only the selected From/To move range is (re-)analyzed — existing
  // plyEvals outside that range are preserved, both in state and in the DB.
  // -----------------------------------------------------------------------
  async function runAnalysis() {
    if (!tree) return
    setAnalyzing(true)
    setAnalysisError('')
    setAnalysisResultMessage('')

    // Temporary diagnostic timing — remove once the "Re-analyse" slowness is found.
    const tStart = performance.now()

    try {
      // Construction only, no init() call here — analyzeGame() initializes lazily,
      // only if it turns out some position in the range actually needs a fresh
      // Stockfish evaluation, so a fully-cached re-analysis never pays engine startup
      // cost at all.
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
      }

      const isReanalyze = plyEvals.length > 0
      const totalFullMoves = Math.max(1, Math.ceil(tree.mainLine.length / 2))
      const rangeFromMove = isReanalyze ? fromMove : 1
      const rangeToMove = isReanalyze ? toMove : totalFullMoves

      const sliceStart = (rangeFromMove - 1) * 2
      const sliceEnd = Math.min(rangeToMove * 2, tree.mainLine.length)
      const sliceNodes = tree.mainLine.slice(sliceStart, sliceEnd)

      const anchorFen = sliceStart === 0 ? tree.root.fen : tree.mainLine[sliceStart - 1].fen
      const fens = [anchorFen, ...sliceNodes.map(n => n.fen)]
      const sans = sliceNodes.map(n => n.san)

      const depth = stockfishDepth ?? STOCKFISH_DEFAULTS.reanalyzeDepth
      const poseEvals = await getPositionEvaluationsBulk_shared(fens)
      console.log(`[runAnalysis] poseEvals fetch: ${(performance.now() - tStart).toFixed(0)}ms`)

      // Skip overwriting any ply whose existing depth is already >= this run's depth —
      // mirrors tpose_positions_eval' own guard, so re-analyzing at a shallower depth never
      // downgrades a ply saved deeper previously. Updated live, ply by ply, as each
      // result comes back from the engine — not just once at the very end — so
      // "Moves Played"/"Games Played" and the move list reflect each position's fresh
      // evaluation as soon as it's computed, not only after the whole range finishes.
      const mergedPlyEvals = [...plyEvals]
      let updatedPlies = 0
      let skippedPlies = 0
      const tAnalyzeStart = performance.now()

      const { finalPosition } = await engine.analyzeGame(
        fens, sans,
        (progress) => setAnalysisProgress(progress),
        depth,
        poseEvals,
        (plyEval, i) => {
          console.log(`[runAnalysis] ply ${i} (${plyEval.san}) evaluated at ${(performance.now() - tAnalyzeStart).toFixed(0)}ms into analyzeGame`)
          const idx = sliceStart + i
          const existing = mergedPlyEvals[idx]
          if (existing && existing.depth >= plyEval.depth) {
            skippedPlies++
            return
          }
          mergedPlyEvals[idx] = plyEval
          tree.mainLine[idx].evaluation = plyEval
          updatedPlies++
          setPlyEvals([...mergedPlyEvals])
          setTree({ ...tree })
          // Fire-and-forget — don't block the engine's own progress on DB round-trips.
          // upgradePositionEvaluation_shared's own cascade (see chessdb_shared.ts) propagates this into
          // every game's tgev_game_evals row for that same position, not just this one.
          const tUpgradeStart = performance.now()
          upgradePositionEvaluation_shared({ fen: plyEval.fenBefore, cp: plyEval.cpBefore, bestMove: plyEval.bestMove, depth: plyEval.depth, createIfMissing: true })
            .then(() => {
              console.log(`[runAnalysis] ply ${i} upgradePositionEvaluation: ${(performance.now() - tUpgradeStart).toFixed(0)}ms`)
              return refreshPositionPanels()
            })
            .catch(() => {
              // Non-critical — a failed merge doesn't block the rest
            })
        }
      )
      console.log(`[runAnalysis] analyzeGame total: ${(performance.now() - tAnalyzeStart).toFixed(0)}ms (${updatedPlies} updated, ${skippedPlies} skipped)`)

      setAnalysisResultMessage(
        skippedPlies > 0
          ? `Updated ${updatedPlies} plies, kept ${skippedPlies} at deeper depth`
          : `Updated ${updatedPlies} plies`
      )

      // First-time full analysis just completed — default the next re-analyze range to
      // start at move 5, since re-checking opening theory is rarely useful
      if (!isReanalyze) {
        setFromMove(Math.min(5, totalFullMoves))
      }

      // Save the full merged plyEvals to DB — saveGameEvaluations deletes
      // and re-inserts by array position, so a partial array would wipe out
      // the plyEvals for every move outside the re-analyzed range
      if (gdid) {
        const tSaveStart = performance.now()
        try {
          await saveGameEvaluations_player(gdid, mergedPlyEvals)
        } catch {
          // Non-critical — DB save failure doesn't block UI
        }
        console.log(`[runAnalysis] saveGameEvaluations_player: ${(performance.now() - tSaveStart).toFixed(0)}ms`)
      }

      // The range's final resulting position is never any ply's "before" position
      // (nothing after it in this run), so it needs its own explicit upgrade call —
      // everything else was already upgraded live, ply by ply, above. Skipped entirely
      // when already cached at/above this run's depth (same check the per-ply loop
      // already does with poseEvals) — avoids a DB round trip that upgradePositionEvaluation's
      // own depth-guard would just reject anyway. Refreshes "Moves Played"/"Games Played"
      // so a freshly-analyzed evaluation shows up immediately, matching what
      // persistAnalysisLines already does for "Analyze Position".
      const finalPoseEval = poseEvals[truncateFen(finalPosition.fen)]
      if (!finalPoseEval || finalPoseEval.depth < depth) {
        const tFinalStart = performance.now()
        try {
          await upgradePositionEvaluation_shared({ fen: finalPosition.fen, cp: finalPosition.cp, bestMove: finalPosition.bestMove, depth, createIfMissing: true })
          await refreshPositionPanels()
        } catch {
          // Non-critical
        }
        console.log(`[runAnalysis] final-position upgrade + refresh: ${(performance.now() - tFinalStart).toFixed(0)}ms`)
      }
      console.log(`[runAnalysis] TOTAL: ${(performance.now() - tStart).toFixed(0)}ms`)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  // Trigger multi-PV when clicking a node in exploration mode
  function handleSelectNode(node: MoveNode) {
    goToNode(node)
  }

  // -----------------------------------------------------------------------
  // The position currently shown on the board (after the selected move) —
  // single source of truth so every analysis entry point agrees on it
  // -----------------------------------------------------------------------
  function getCurrentPositionFen(): string | undefined {
    return currentNode?.fen ?? tree?.root.fen
  }

  // -----------------------------------------------------------------------
  // Copy the current position's FEN to the clipboard (e.g. to paste into
  // chess.com's own analysis board) — brief "Copied" feedback on the button.
  // -----------------------------------------------------------------------
  async function copyFenToClipboard() {
    const fen = getCurrentPositionFen()
    if (!fen) return
    await navigator.clipboard.writeText(fen)
    setFenCopied(true)
    setTimeout(() => setFenCopied(false), 1500)
  }

  // -----------------------------------------------------------------------
  // Search chess.com's own games database for the current position. Phase 1: no filters,
  // just the exact-position match (see buildChessComSearchUrl's equivalent logic inside
  // searchChessComGames — opening/openingId left blank, only fen applied).
  // -----------------------------------------------------------------------
  async function searchChessCom() {
    const fen = getCurrentPositionFen()
    if (!fen) return
    const filters: ChessComSearchFilters = { p1, p2, fixedcolors, mr, year, lsty, lstresult, sort }
    setChesscomLoading(true)
    const { games } = await searchChessComGames(fen, filters)
    setChesscomGames(games)
    setChesscomLoading(false)
  }

  // -----------------------------------------------------------------------
  // Analyze current position (own Depth/Lines controls, always depth-capped).
  // Always guarantees the actually-played move is included and highlighted,
  // even if it's outside the engine's top N lines.
  // -----------------------------------------------------------------------
  async function startDeepAnalysis() {
    const fen = getCurrentPositionFen()
    if (!fen) return
    // Captured now, not read fresh in onComplete — onComplete fires asynchronously
    // after the engine's bestmove arrives, by which point the user may have
    // already navigated to a different position (currentPly would then refer
    // to the wrong ply). currentPly is a 1-indexed count of moves played
    // (getPath(currentNode).length) — plyEvals[]/sanMoves are 0-indexed, so
    // subtract 1 to get the actual ply of the position being analyzed.
    const analyzedPly = currentPly - 1

    const numLines = deepAnalysisMultiPv ?? STOCKFISH_DEFAULTS.deepAnalysisMultiPv
    const maxDepth = deepAnalysisDepth ?? STOCKFISH_DEFAULTS.deepAnalysisDepth
    const playedSan = currentNode?.children[0]?.san ?? ''
    const isWhiteToMove = fen.split(' ')[1] !== 'b'

    // Build set of legal UCI moves for this position so we can filter engine hallucinations
    const legalUcis = new Set<string>()
    try {
      const validator = new Chess(fen)
      for (const m of validator.moves({ verbose: true })) {
        legalUcis.add(m.from + m.to + (m.promotion ?? ''))
      }
    } catch { /* if FEN is invalid, skip validation */ }

    function processUpdate(update: InfiniteAnalysisUpdate) {
      // Filter out any moves that are illegal in this position
      const legal = legalUcis.size > 0
        ? update.lines.filter(r => !r.bestMoveUci || legalUcis.has(r.bestMoveUci))
        : update.lines

      // Deduplicate by best move (engine can repeat when fewer distinct moves exist than requested)
      const seen = new Set<string>()
      const unique = legal.filter(r => {
        const key = r.bestMoveUci || r.bestMoveSan
        if (!key) return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      unique.sort((a, b) => isWhiteToMove ? b.cp - a.cp : a.cp - b.cp)

      // Always the top N objectively-best lines — the played move is already shown in
      // "Moves Played"/the move list, so it's never force-included here, just tagged
      // (_isActualMove) if it naturally happens to land in the top N.
      const display = unique.slice(0, numLines)
      display.forEach((r, i) => {
        r.rank = i + 1
        ;(r as any)._isActualMove = playedSan ? r.bestMoveSan === playedSan : false
      })

      setDeepAnalysisData({ ...update, lines: display })

      // Track the currently displayed lines for the automatic pose/gev push on completion
      latestAnalysisLinesRef.current = { lines: display, depth: update.depth }
    }

    let engine = engineRef.current
    if (!engine) {
      engine = new StockfishEngine()
      engineRef.current = engine
      await engine.init()
    }

    setDeepAnalyzing(true)
    setDeepAnalysisData(null)
    latestAnalysisLinesRef.current = null
    engine.startInfiniteAnalysis(
      fen,
      numLines,
      maxDepth,
      processUpdate,
      async () => {
        setDeepAnalyzing(false)
        const latest = latestAnalysisLinesRef.current
        if (latest) {
          await persistAnalysisLines(fen, analyzedPly, latest.lines, latest.depth)
        }
      }
    )
  }

  function stopDeepAnalysis() {
    engineRef.current?.stopAnalysis()
    setDeepAnalyzing(false)
  }

  // -----------------------------------------------------------------------
  // Re-fetch Moves From This Position / Games panel for whatever's currently
  // displayed — the moveSummary/positionGames effects only re-run when the
  // board position changes, so any button that upgrades tpose_positions_eval
  // without changing currentNode/tree needs to call this explicitly.
  // -----------------------------------------------------------------------
  async function refreshPositionPanels() {
    const fen = getCurrentPositionFen()
    if (!fen) return
    try {
      const rows = await getMoveSummaryForPosition_player(fen, player)
      setMoveSummary(rows)
    } catch {
      // Non-critical — panel just keeps its previous data
    }
    try {
      const [games, totalRows] = await Promise.all([
        fetchGamesForPosition_player(fen, player, positionGamesPage, positionGamesRowsPerPage, selectedPositionMove ?? undefined),
        getGamesForPositionCount_player(fen, player, selectedPositionMove ?? undefined)
      ])
      setPositionGames(games)
      setPositionGamesTotalRows(totalRows)
    } catch {
      // Non-critical
    }
  }

  // -----------------------------------------------------------------------
  // Persist Analysis — runs automatically whenever a Position Analysis run
  // completes (target depth reached, or stopped early — either way the engine
  // has sent its final bestmove). Pushes every displayed Engine Line's evaluation
  // into tpose_positions_eval for its resulting position (one ply deeper than fen) via
  // upgradePositionEvaluation. Crucially, also writes the analyzed position's OWN
  // evaluation: eval(fen) is, by definition, the score of its best line — playing
  // the objectively-best move doesn't change a position's evaluation, it realizes
  // it — so the rank-1 line's score belongs on fen itself too, not just on the
  // position one ply deeper that playing it leads to. Without this, repeatedly
  // re-analyzing a position could never update that position's own move-list value,
  // at any depth (confirmed live). upgradePositionEvaluation_shared's own cascade (see
  // chessdb_shared.ts) already propagates every write into tgev_game_evals for every game
  // that reached that position, so no separate direct tgev write happens here.
  // fen/ply are the position/ply that was actually analyzed, captured at the start
  // of that run — not read fresh here, since the user may have already navigated
  // elsewhere by the time this fires.
  // -----------------------------------------------------------------------
  async function persistAnalysisLines(fen: string, ply: number, lines: MultiPvResult[], depth: number) {
    if (lines.length === 0) return

    setSaveAnalysisMessage('')

    // The one candidate line (if any) that matches what this game actually played next —
    // only this one may durably persist into tgev_game_evals, since tgev is a record of
    // the game's real history, not a place to store hypothetical alternatives. Every other
    // candidate stays tpose-only, same as before.
    const playedNode = gdid && tree ? tree.mainLine[ply + 1] : undefined
    const playedLine = playedNode ? lines.find(l => l.bestMoveSan === playedNode.san) : undefined

    const results = await Promise.all(lines.map(async line => {
      try {
        const g = new Chess(fen)
        const from = line.bestMoveUci.slice(0, 2)
        const to = line.bestMoveUci.slice(2, 4)
        const promotion = line.bestMoveUci.length > 4 ? line.bestMoveUci[4] : undefined
        g.move({ from, to, promotion })
        const resultingFen = g.fen()
        return await upgradePositionEvaluation_shared({
          fen: resultingFen,
          cp: line.cp,
          bestMove: line.lineUci[1] ?? null,
          depth,
          createIfMissing: true,
          gameContext: gdid && playedNode && line === playedLine
            ? { gdid, ply: ply + 1, san: playedNode.san }
            : undefined
        })
      } catch {
        return false
      }
    }))

    const topLine = lines.find(l => l.rank === 1)
    // fen is exactly this game's own position at `ply` (that's what was analyzed), so the
    // own-position write-back always knows its (gdid, ply) unambiguously — no "was this
    // actually played" check needed here, unlike the candidate-line loop above.
    const ownUpdated = topLine
      ? await upgradePositionEvaluation_shared({
          fen,
          cp: topLine.cp,
          bestMove: topLine.bestMoveUci || null,
          depth,
          createIfMissing: true,
          force: true,
          gameContext: gdid && tree?.mainLine[ply]
            ? { gdid, ply, san: tree.mainLine[ply].san }
            : undefined
        }).catch(() => false)
      : false

    const updated = results.filter(Boolean).length + (ownUpdated ? 1 : 0)
    setSaveAnalysisMessage(`Updated ${updated} of ${lines.length + 1} positions`)

    // fen is exactly tree.mainLine[ply]'s own resulting position — mirror the ownUpdated
    // write above into local React state for immediate UI feedback, once we know both
    // that it actually happened and that it was deeper than what this ply already had
    // (upgradePositionEvaluation's own depth-guard is what ownUpdated reflects).
    const existingPlyEval = plyEvals[ply]
    if (topLine && ownUpdated && existingPlyEval && existingPlyEval.depth < depth) {
      const isWhiteMove = ply % 2 === 0
      const cpChange = isWhiteMove
        ? topLine.cp - existingPlyEval.cpBefore
        : existingPlyEval.cpBefore - topLine.cp
      const cpLoss = Math.max(0, -cpChange)
      const updatedPlyEval: PlyEvaluation = {
        ...existingPlyEval,
        cp: topLine.cp,
        cpChange,
        cpLoss,
        classification: classifyMove(cpLoss),
        depth
      }
      const mergedPlyEvals = [...plyEvals]
      mergedPlyEvals[ply] = updatedPlyEval
      setPlyEvals(mergedPlyEvals)
      if (tree) {
        tree.mainLine[ply].evaluation = updatedPlyEval
        setTree({ ...tree })
      }
    }

    await refreshPositionPanels()
  }

  // -----------------------------------------------------------------------
  // Handle selecting an alternative PV line
  // -----------------------------------------------------------------------
  function handleSelectPvLine(line: MultiPvResult) {
    if (!tree) return

    // The multi-PV was computed for the position AFTER the current move (the board position)
    // So the branch attaches to the current node
    const parent = currentNode ?? tree.root

    const firstNode = addPvBranch(parent, line.lineSans)
    if (firstNode) {
      setTree({ ...tree })
      goToNode(firstNode)
    }
  }

  // -----------------------------------------------------------------------
  // Interactive board: handle piece drop
  // -----------------------------------------------------------------------
  function handlePieceDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!tree) return false
    if (sourceSquare === targetSquare) return false

    const g = new Chess(displayGame.current.fen())
    const piece = g.get(sourceSquare as Square)
    const isPromotion = piece?.type === 'p' &&
      ((piece.color === 'w' && targetSquare[1] === '8') ||
       (piece.color === 'b' && targetSquare[1] === '1'))

    let moveResult
    try {
      moveResult = g.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        ...(isPromotion && { promotion: 'q' })
      })
    } catch {
      return false
    }

    if (!moveResult) return false

    // Determine parent: current node or root
    const parent = currentNode ?? tree.root

    const newNode = addBranch(
      parent,
      moveResult.san,
      moveResult.from,
      moveResult.to,
      g.fen()
    )

    setTree({ ...tree })
    goToNode(newNode)
    // Multi-PV auto-triggers via the currentNode effect

    return true
  }

  async function evaluateNodePosition(node: MoveNode) {
    try {
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
        await engine.init()
      }

      const result = await engine.evaluate(node.fen)

      // Determine cp from white's perspective
      const path = getPath(node)
      const ply = path.length - 1
      const isWhiteMove = ply % 2 === 0
      const cp = isWhiteMove ? -result.cp : result.cp

      // Also eval before to compute cpLoss
      const beforeResult = await engine.evaluate(node.fenBefore)
      const cpBefore = isWhiteMove ? beforeResult.cp : -beforeResult.cp
      const cpChange = isWhiteMove ? cp - cpBefore : cpBefore - cp
      const cpLoss = Math.max(0, -cpChange)

      node.evaluation = {
        san: node.san,
        fen: node.fen,
        fenBefore: node.fenBefore,
        cp,
        cpBefore,
        bestMove: beforeResult.bestMove,
        bestMoveSan: '',
        bestLineSans: [],
        cpLoss,
        cpChange,
        classification: cpLoss > 200 ? 'blunder' : cpLoss > 100 ? 'mistake' : cpLoss > 50 ? 'inaccuracy' : 'good',
        depth: 16
      }

      if (tree) setTree({ ...tree })
    } catch {
      // Silently fail for background eval
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup engine on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => { engineRef.current?.destroy() }
  }, [])

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const currentEval = currentNode?.evaluation
  const onMainLine = isOnMainLine(currentNode)
  const mainLineIndex = tree && currentNode ? getMainLineIndex(currentNode, tree) : -1
  const totalMainMoves = tree?.mainLine.length ?? 0
  const sliderValue = onMainLine ? (mainLineIndex >= 0 ? mainLineIndex + 1 : 0) : 0

  // Current ply for move numbering
  const currentPly = currentNode ? getPath(currentNode).length : 0

  // Label for whatever position is currently on the board, shown on the Position Analysis /
  // Moves From This Position box titles
  const currentMoveLabel = getCurrentMoveLabel(currentNode, currentPly)

  // Highlight squares
  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (currentNode) {
    const ev = currentNode.evaluation
    if (ev?.classification && ev.classification !== 'good') {
      customSquareStyles[currentNode.to] = {
        backgroundColor: CLASSIFICATION_SQUARE_COLORS[ev.classification] ?? 'transparent'
      }
    }
    if (!customSquareStyles[currentNode.from]) {
      customSquareStyles[currentNode.from] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' }
    }
    if (!customSquareStyles[currentNode.to]) {
      customSquareStyles[currentNode.to] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' }
    }
  }

  // Eval bar
  const evalCp = currentEval?.cp ?? 0
  const evalPercent = Math.max(2, Math.min(98, 50 + evalCp / 8))

  // Full move numbers for the re-analyze range selectors
  const totalFullMoves = tree ? Math.max(1, Math.ceil(tree.mainLine.length / 2)) : 1

  // Existing saved depth for the currently-selected From/To range — lets the
  // user see, before re-analyzing, whether the selected depth would actually
  // improve on what's already saved
  const existingDepthRange = (() => {
    if (plyEvals.length === 0) return null
    const rangeSliceStart = (Math.min(fromMove, totalFullMoves) - 1) * 2
    const rangeSliceEnd = Math.min(Math.min(toMove, totalFullMoves) * 2, plyEvals.length)
    const depths = plyEvals.slice(rangeSliceStart, rangeSliceEnd)
      .filter((e): e is PlyEvaluation => e != null)
      .map(e => e.depth)
    if (depths.length === 0) return null
    const minDepth = Math.min(...depths)
    const maxDepth = Math.max(...depths)
    return minDepth === maxDepth ? String(minDepth) : `${minDepth}–${maxDepth}`
  })()

  return (
    <div className='space-y-3'>
      {/* Header */}
      <MyBox>
        <div className='flex items-center justify-between'>
          <div className='flex gap-3'>
            <MyBackHomeNav />
            <BackButton fallback='/' />
          </div>
        </div>
      </MyBox>

      {/* Opening name — page-level, above the whole Board/Moves/Analysis grid */}
      <div className='text-xs text-gray-500'>
        {opening || 'Unknown'}
        {eco && <span className='text-gray-400 ml-1'>({eco})</span>}
        <span className='ml-1 text-gray-400'>{game.time_class}</span>
      </div>

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-[480px_480px_600px] xl:items-start'>
        {/* Column 1: Board */}
        <div className='space-y-1 w-[480px]'>
          {/* Top player */}
          <div className='flex items-center justify-between rounded bg-gray-600 px-3 py-1.5 text-xs text-white'>
            <span className='font-bold'>
              {playerColor === 'white' ? game.black.username : game.white.username}
              <span className='ml-1 font-normal text-blue-400'>
                ({playerColor === 'white' ? game.black.rating : game.white.rating})
              </span>
            </span>
            <span className='text-red-400 font-bold'>{result === 'win' ? '0' : result === 'loss' ? '1' : '1/2'}</span>
          </div>

          {/* Board */}
          <div>
            <div>
              <Chessboard
                key={boardKey}
                options={{
                  position: displayGame.current.fen(),
                  boardStyle: { width: '480px', height: '480px' },
                  allowDragging: true,
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
                  boardOrientation: playerColor,
                  squareStyles: customSquareStyles
                }}
              />
            </div>
          </div>

          {/* Bottom player */}
          <div className='flex items-center justify-between rounded bg-green-50 border border-green-200 px-3 py-1.5 text-xs text-gray-900'>
            <span className='font-bold'>
              {playerColor === 'white' ? game.white.username : game.black.username}
              <span className='ml-1 font-normal text-blue-400'>
                ({playerColor === 'white' ? game.white.rating : game.black.rating})
              </span>
            </span>
            <span className='text-red-600 font-bold'>{result === 'win' ? '1' : result === 'loss' ? '0' : '1/2'}</span>
          </div>

          {/* Game info: game number, date, termination, final evaluation */}
          <div className='flex items-center gap-3 text-xxs text-gray-500 px-1'>
            {gdid != null && <span>Game #{gdid}</span>}
            <span>{formatGameDate(game.end_time)}</span>
            {game.termination && <span>{game.termination}</span>}
            <span>
              Final eval: {game.finalEval != null ? formatCp(game.finalEval) : '—'}
            </span>
          </div>

          {/* Branch indicator */}
          {!onMainLine && (
            <div className='flex items-center gap-2'>
              <span className='text-xs text-blue-600 font-bold'>Variation</span>
              <MyButton
                onClick={() => {
                  if (currentNode) goToNode(findMainLineAncestor(currentNode))
                }}
                overrideClass='text-xs bg-blue-500 hover:bg-blue-600'
              >
                Return to main line
              </MyButton>
            </div>
          )}

          {/* Game Analysis: whole-game batch analysis */}
          <GameAnalysisPanel_shared
            variant='player'
            plyEvals={plyEvals}
            analyzing={analyzing}
            analysisProgress={analysisProgress}
            depth={stockfishDepth ?? STOCKFISH_DEFAULTS.reanalyzeDepth}
            onDepthChange={depth => onStockfishDepthChange?.(depth)}
            existingDepthRange={existingDepthRange}
            fromMove={fromMove}
            toMove={toMove}
            totalFullMoves={totalFullMoves}
            onFromMoveChange={setFromMove}
            onToMoveChange={setToMove}
            onRunAnalysis={runAnalysis}
            analysisResultMessage={analysisResultMessage}
            analysisError={analysisError}
          />
        </div>

        {/* Column 2: Moves */}
        <div className='w-[480px] rounded-lg bg-pink-50 p-2'>
          {tree && (
            <div className='h-full'>
              <MoveTree_shared
                tree={tree}
                currentNode={currentNode}
                onSelectNode={handleSelectNode}
                moveCounts={moveCounts}
              />
            </div>
          )}
        </div>

        {/* Column 3: Analysis */}
        <div className='w-[600px] rounded-lg bg-yellow-50 p-2 space-y-2'>
          {/* Shared heading for the 5 position-specific panels below (Stockfish, Moves
              Played, Games Played, Master Moves, Master games) — "Game Analysis" (whole-game,
              not position-specific) now lives in Column 1, below the board. */}
          <p className='text-sm font-bold text-gray-700'>Position Analysis {currentMoveLabel}</p>

          {/* Stockfish: current-position analysis, live/capped depth */}
          <MyBox title='Stockfish' collapsible>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <span className='text-xxs font-mono text-gray-500 truncate'>{getCurrentPositionFen()}</span>
                <MyButton onClick={copyFenToClipboard} overrideClass='h-5 px-2 text-xxs whitespace-nowrap'>
                  {fenCopied ? 'Copied' : 'Copy FEN'}
                </MyButton>
              </div>
              <div className='flex items-center gap-4'>
                <DepthInput_shared
                  value={deepAnalysisDepth ?? STOCKFISH_DEFAULTS.deepAnalysisDepth}
                  onChange={depth => onDeepAnalysisDepthChange?.(depth)}
                />
                <MySelect
                  label='Lines'
                  options={['1', '2', '3', '4', '5']}
                  value={String(deepAnalysisMultiPv ?? STOCKFISH_DEFAULTS.deepAnalysisMultiPv)}
                  onChange={e => onDeepAnalysisMultiPvChange?.(parseInt(e.target.value, 10))}
                  overrideClass='w-20 h-6 md:h-6'
                />
              </div>
              {deepAnalyzing ? (
                <MyButton onClick={stopDeepAnalysis} overrideClass='w-full bg-red-500 hover:bg-red-600'>
                  Stop
                </MyButton>
              ) : (
                <MyButton onClick={startDeepAnalysis} overrideClass='w-full bg-purple-600 hover:bg-purple-700'>
                  Analyze Position
                </MyButton>
              )}
              {deepAnalysisData && (
                <div className='space-y-1'>
                  <div className='text-xxs text-gray-500'>
                    {(deepAnalysisData.nodes / 1000000).toFixed(1)}M nodes
                    {' · '}
                    {(deepAnalysisData.nps / 1000).toFixed(0)}k nps
                    {' · '}
                    {(deepAnalysisData.timeMs / 1000).toFixed(1)}s
                  </div>
                  {saveAnalysisMessage && (
                    <div className='text-xxs text-green-600 font-bold'>{saveAnalysisMessage}</div>
                  )}
                </div>
              )}

              <AlternativeLines_shared
                results={deepAnalysisData?.lines ?? []}
                loading={deepAnalyzing && !deepAnalysisData}
                positionPly={currentPly}
                onSelectLine={handleSelectPvLine}
              />
            </div>
          </MyBox>

          {/* Moves Played: one row per move this player played from the current board
              position — click a row to highlight it and filter Games Played below */}
          <MyBox title='Moves Played' collapsible>
            {moveSummary.length === 0 ? (
              <p className='text-xs text-gray-400'>No games reached this position.</p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='text-left text-gray-500 border-b border-gray-200'>
                      <th className='py-1 pr-2'>Move</th>
                      <th className='py-1 pr-2 text-right'>Times</th>
                      <th className='py-1 pr-2 text-right'>Win%</th>
                      <th className='py-1 text-right'>Eval</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {moveSummary.map(m => {
                      const wp = winPct(m.mov_wins, m.mov_losses, m.mov_times)
                      const isSelected = selectedPositionMove === m.move_played
                      return (
                        <tr
                          key={m.move_played}
                          className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setSelectedPositionMove(isSelected ? null : m.move_played)}
                        >
                          <td className='py-1 pr-2 font-mono font-medium'>{m.move_played}</td>
                          <td className='py-1 pr-2 text-right tabular-nums'>{m.mov_times}</td>
                          <td className='py-1 pr-2 text-right tabular-nums text-green-700'>{wp}%</td>
                          <td className={`py-1 text-right tabular-nums font-mono ${m.pose_cp != null && m.pose_cp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {m.pose_cp != null ? formatCp(m.pose_cp) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </MyBox>

          {/* Games Played: this player's games that reached this position, server-paginated
              and narrowed server-side to the "Moves Played" row's move when one is selected —
              click a row to switch the board to that game. Gated on moveSummary (the
              unfiltered "did any game ever reach this position" signal) rather than
              positionGames itself, since positionGames now reflects the move filter. */}
          {moveSummary.length > 0 && (() => {
            const positionGamesTotalPages = Math.max(1, Math.ceil(positionGamesTotalRows / positionGamesRowsPerPage))
            return (
              <MyBox title='Games Played' collapsible>
                <div className='flex gap-2 text-xxs mb-1'>
                  <span className='rounded bg-pink-100 px-2 py-0.5 text-gray-700'>Winning position, lost/drawn</span>
                  <span className='rounded bg-green-100 px-2 py-0.5 text-gray-700'>Losing position, won</span>
                </div>
                {positionGames.length === 0 ? (
                  <p className='text-xs text-gray-400'>No games match the selected move.</p>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full text-xs'>
                      <thead>
                        <tr className='text-left text-gray-500 border-b border-gray-200'>
                          <th className='py-1 pr-2'>Date</th>
                          <th className='py-1 pr-2 text-right'>Game</th>
                          <th className='py-1 pr-2 text-right'>Opp Rating</th>
                          <th className='py-1 pr-2'>Termination</th>
                          <th className='py-1 pr-2 text-right'>Final Eval</th>
                          <th className='py-1 text-center'>Result</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-gray-100'>
                        {positionGames.map((g, i) => {
                          const rowBg =
                            g.resultMismatch === 'lostWinning' ? 'bg-pink-100 hover:bg-pink-200'
                            : g.resultMismatch === 'wonLosing'  ? 'bg-green-100 hover:bg-green-200'
                            : 'hover:bg-gray-50'
                          const isCurrentGame = g.gdid != null && g.gdid === gdid
                          return (
                            <tr
                              key={i}
                              className={`${rowBg} ${isCurrentGame ? 'border-l-4 border-blue-500' : ''} ${g.gdid != null ? 'cursor-pointer' : ''}`}
                              onClick={() => {
                                if (g.gdid == null) return
                                // Deliberately no pushBackTarget here — switching games while
                                // already on /analyze should keep BackButton pointing at the same
                                // original parent, not nest one level deeper per game clicked
                                router.push(`/analyze?game=${g.gdid}&player=${g.player}`)
                              }}
                            >
                              <td className='py-1 pr-2 text-gray-500'>{g.date ?? '—'}</td>
                              <td className='py-1 pr-2 text-right text-gray-500'>{g.gdid ?? '—'}</td>
                              <td className='py-1 pr-2 text-right tabular-nums'>{g.opponentRating ?? '—'}</td>
                              <td className='py-1 pr-2 text-gray-500'>{g.termination ?? '—'}</td>
                              <td className={`py-1 pr-2 text-right tabular-nums font-mono ${g.finalEval != null && g.finalEval < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                {g.finalEval != null ? formatCp(g.finalEval) : '—'}
                              </td>
                              <td className='py-1 text-center'>
                                {g.playerResult === 'win' ? 'W' : g.playerResult === 'loss' ? 'L' : g.playerResult === 'draw' ? 'D' : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {positionGamesTotalPages > 1 && (
                  <div className='mt-2'>
                    <MyPaginationFooter
                      totalPages={positionGamesTotalPages}
                      statecurrentPage={positionGamesPage}
                      setStateCurrentPage={setPositionGamesPage}
                      rowsPerPage={positionGamesRowsPerPage}
                      setRowsPerPage={v => { setPositionGamesRowsPerPage(v); setPositionGamesPage(1) }}
                      rowsOptions={POSITION_GAMES_ROWS_OPTIONS_Player}
                      totalRows={positionGamesTotalRows}
                    />
                  </div>
                )}
              </MyBox>
            )
          })()}

          {currentNode && (
            <div className='pt-2 border-t border-gray-200 space-y-4'>
              <p className='text-xxs font-semibold text-gray-400 uppercase tracking-wide'>From our own synced master games</p>
              <MasterMovesDbPanel fen={currentNode.fen} />
              <MasterGamesDbPanel fen={currentNode.fen} />
            </div>
          )}

          {/* Master Moves — master-level game stats for whatever position is currently on the
              board, from the Lichess Masters Opening Explorer. Separate panel from
              "Moves Played" (not merged) — showing all fields the API
              returns; whether to merge later is a follow-up decision. Hidden entirely until a
              position has been clicked on (currentNode set). */}
          {currentNode && (
          <MyBox title='Master Moves (Lichess)' collapsible>
            {!mastersData || mastersData.moves.length === 0 ? (
              <p className='text-xs text-gray-400'>No master games recorded from this position.</p>
            ) : (
              (() => {
                const total = mastersData.white + mastersData.draws + mastersData.black
                return (
                  <div className='space-y-2'>
                    <p className='text-xxs text-gray-500'>
                      {total.toLocaleString()} master games
                      {' · '}White {total > 0 ? Math.round((mastersData.white / total) * 100) : 0}%
                      {' / '}Draw {total > 0 ? Math.round((mastersData.draws / total) * 100) : 0}%
                      {' / '}Black {total > 0 ? Math.round((mastersData.black / total) * 100) : 0}%
                    </p>
                    <div className='overflow-x-auto'>
                      <table className='w-full text-xs'>
                        <thead>
                          <tr className='text-left text-gray-500 border-b border-gray-200'>
                            <th className='py-1 pr-2'>Move</th>
                            <th className='py-1 pr-2 text-right'>Games</th>
                            <th className='py-1 pr-2 text-right'>White%</th>
                            <th className='py-1 pr-2 text-right'>Draw%</th>
                            <th className='py-1 pr-2 text-right'>Black%</th>
                            <th className='py-1 text-right'>Avg Rating</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-gray-100'>
                          {mastersData.moves.map(m => {
                            const games = m.white + m.draws + m.black
                            const isSelected = selectedMastersMove === m.uci
                            return (
                              <tr
                                key={m.uci}
                                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setSelectedMastersMove(isSelected ? null : m.uci)}
                              >
                                <td className='py-1 pr-2 font-mono font-medium'>{m.san}</td>
                                <td className='py-1 pr-2 text-right tabular-nums'>{games.toLocaleString()}</td>
                                <td className='py-1 pr-2 text-right tabular-nums text-green-700'>
                                  {games > 0 ? Math.round((m.white / games) * 100) : 0}%
                                </td>
                                <td className='py-1 pr-2 text-right tabular-nums text-gray-500'>
                                  {games > 0 ? Math.round((m.draws / games) * 100) : 0}%
                                </td>
                                <td className='py-1 pr-2 text-right tabular-nums text-red-600'>
                                  {games > 0 ? Math.round((m.black / games) * 100) : 0}%
                                </td>
                                <td className='py-1 text-right tabular-nums'>{m.averageRating}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()
            )}
          </MyBox>
          )}

          {/* Master games — master games list scoped to the current position (and, if a row in
              the Master Moves table above is selected, to that specific move). Separate panel
              from Master Moves (not nested) so it can carry its own title/heading. Hidden entirely
              until a position has been clicked on (currentNode set). */}
          {currentNode && mastersData && mastersData.topGames.length > 0 && (() => {
            const filteredTopGames = mastersData.topGames.filter(
              g => !selectedMastersMove || g.uci === selectedMastersMove
            )
            return (
              <MyBox title='Master Games (Lichess)' collapsible>
                <div className='space-y-1'>
                  <div className='flex justify-end'>
                    <MyHelpField text="Live results from Lichess's Masters Explorer for this position — Lichess selects which games qualify as 'top', not this app; the count and selection aren't configurable here." />
                  </div>
                  {filteredTopGames.length === 0 ? (
                    <p className='text-xs text-gray-400'>No games match the selected move.</p>
                  ) : (
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
                          {filteredTopGames.map((g, i) => {
                            const moveSan = mastersData.moves.find(m => m.uci === g.uci)?.san ?? g.uci
                            return (
                              <tr key={i}>
                                <td className='py-1 pr-2 font-mono font-medium'>{moveSan}</td>
                                <td className='py-1 pr-2'>{g.white.name} <span className='text-gray-400'>({g.white.rating})</span></td>
                                <td className='py-1 pr-2'>{g.black.name} <span className='text-gray-400'>({g.black.rating})</span></td>
                                <td className='py-1 pr-2 text-right tabular-nums'>{g.year}</td>
                                <td className='py-1 pr-2 text-center'>
                                  {g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½'}
                                </td>
                                <td className='py-1 text-right'>
                                  <a
                                    href={`https://lichess.org/${g.id}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='text-blue-600 hover:underline'
                                  >
                                    view
                                  </a>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </MyBox>
            )
          })()}

          {/* Chess.com Games — chess.com's own games database, searched live for the exact
              current position (fen) plus the filters below. Unlike Master Games (Lichess)
              (auto-loaded per position), this is fetched on click — it's a live scrape of an
              external site, not an API call, so it isn't triggered automatically on every move. */}
          {(() => {
            const fen = getCurrentPositionFen()
            return (
              <MyBox title='Chess.com Games' collapsible>
                <div className='space-y-2'>
                  <MyButton
                    onClick={searchChessCom}
                    disabled={!fen || chesscomLoading}
                    overrideClass='w-full bg-green-600 hover:bg-green-700'
                  >
                    {chesscomLoading ? 'Searching…' : 'Search chess.com'}
                  </MyButton>
                  <div className='flex flex-wrap items-center gap-3'>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-xs whitespace-nowrap'>Player 1</span>
                      <MySelect
                        value={p1}
                        onChange={e => setP1(e.target.value)}
                        options={masterPlayerNames}
                        searchEnabled
                        includeBlank
                        overrideClass='w-48 h-6 md:h-6'
                        searchClass='w-48 h-6 md:h-6'
                      />
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-xs whitespace-nowrap'>Player 2</span>
                      <MySelect
                        value={p2}
                        onChange={e => setP2(e.target.value)}
                        options={masterPlayerNames}
                        searchEnabled
                        includeBlank
                        overrideClass='w-48 h-6 md:h-6'
                        searchClass='w-48 h-6 md:h-6'
                      />
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-xs whitespace-nowrap'>Fixed colors (P1 = White)</span>
                      <MyToggle inputName='chesscom-fixedcolors' inputValue={fixedcolors} onChange={e => setFixedcolors(e.target.checked)} />
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-3'>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-xs whitespace-nowrap'>Min rating</span>
                      <MyInput
                        type='number'
                        value={mr}
                        onChange={e => setMr(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        overrideClass='w-20 h-6 md:h-6'
                      />
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-xs whitespace-nowrap'>Year</span>
                      <MySelect value={lsty} onChange={e => setLsty(e.target.value)} overrideClass='w-14 h-6 md:h-6'>
                        {CHESSCOM_YEAR_COMPARISON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </MySelect>
                      <MyInput
                        type='number'
                        value={year}
                        onChange={e => setYear(e.target.value)}
                        placeholder='e.g. 2024'
                        overrideClass='w-20 h-6 md:h-6'
                      />
                    </div>
                    <MySelect label='Result' value={lstresult} onChange={e => setLstresult(e.target.value)} overrideClass='w-28 h-6 md:h-6'>
                      {CHESSCOM_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </MySelect>
                    <MySelect label='Sort' value={sort} onChange={e => setSort(e.target.value)} overrideClass='w-32 h-6 md:h-6'>
                      {CHESSCOM_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </MySelect>
                  </div>
                  {chesscomGames && (
                    chesscomGames.length === 0 ? (
                      <p className='text-xs text-gray-400'>No games found on chess.com for this position.</p>
                    ) : (
                      <div className='overflow-x-auto'>
                        <table className='w-full text-xs'>
                          <thead>
                            <tr className='text-left text-gray-500 border-b border-gray-200'>
                              <th className='py-1 pr-2'>White</th>
                              <th className='py-1 pr-2'>Black</th>
                              <th className='py-1 pr-2 text-center'>Result</th>
                              <th className='py-1 pr-2 text-right'>Moves</th>
                              <th className='py-1 pr-2 text-right'>Year</th>
                              <th className='py-1 text-right'>Game</th>
                            </tr>
                          </thead>
                          <tbody className='divide-y divide-gray-100'>
                            {chesscomGames.map(g => (
                              <tr key={g.gameId}>
                                <td className='py-1 pr-2'>
                                  {g.whiteUsername} {g.whiteRating != null && <span className='text-gray-400'>({g.whiteRating})</span>}
                                </td>
                                <td className='py-1 pr-2'>
                                  {g.blackUsername} {g.blackRating != null && <span className='text-gray-400'>({g.blackRating})</span>}
                                </td>
                                <td className='py-1 pr-2 text-center'>{g.result}</td>
                                <td className='py-1 pr-2 text-right tabular-nums'>{g.moves ?? '—'}</td>
                                <td className='py-1 pr-2 text-right tabular-nums'>{g.year ?? '—'}</td>
                                <td className='py-1 text-right'>
                                  <a
                                    href={g.viewUrl}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='text-blue-600 hover:underline'
                                  >
                                    view
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              </MyBox>
            )
          })()}

        </div>
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  collectNodesFromMove — walks the whole tree (main line + every variation) and
//  returns every node whose full-move number is >= minMove
//----------------------------------------------------------------------------------
function collectNodesFromMove(root: MoveNode, minMove: number): MoveNode[] {
  const result: MoveNode[] = []
  function walk(node: MoveNode, ply: number) {
    if (ply > 0) {
      const moveNum = Math.floor((ply - 1) / 2) + 1
      if (moveNum >= minMove) result.push(node)
    }
    for (const child of node.children) {
      walk(child, ply + 1)
    }
  }
  walk(root, 0)
  return result
}

//----------------------------------------------------------------------------------
//  getCurrentMoveLabel — "16.Ng6" / "16...Ng6" for whatever position is currently on
//  the board (matching MoveTree_shared.tsx's own move-number notation), "Starting position"
//  at the root (no move played yet)
//----------------------------------------------------------------------------------
function getCurrentMoveLabel(currentNode: MoveNode | null, currentPly: number): string {
  if (!currentNode) return 'Starting position'
  const moveNum = Math.floor((currentPly - 1) / 2) + 1
  const isWhite = (currentPly - 1) % 2 === 0
  return `${moveNum}${isWhite ? '.' : '...'}${currentNode.san}`
}

//----------------------------------------------------------------------------------
//  formatGameDate — unix epoch seconds -> dd/mm/yy, matching the same convention
//  already used in GameList.tsx and HabitsTable.tsx
//----------------------------------------------------------------------------------
function formatGameDate(endTime: number): string {
  const date = new Date(endTime * 1000)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}
