'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterGameView_master — full analysis board for one synced master game: move tree,
//    interactive/draggable board, Stockfish game analysis and infinite-analysis panels, Lichess
//    Masters Explorer panels, and our own All-Masters synced-games panels. Full-parity duplicate
//    of ChessBoardView_shared — see PLAN_master-game-view-parity for the diff (secondary vs.
//    primary database, createIfMissing stays false throughout, no gameContext/tgev_game_evals
//    writes, no "Final eval" since master has no equivalent of gd_final_eval).
//
//    Parameters:
//      row — the master game row to display
//
//  2) NOTES
//    Read-only lookups against tpos_positions/tpose_positions_eval
//    (getFenEvalsForSkipCheck_shared) and top-up-only writes via
//    upgradePositionEvaluation_shared (createIfMissing:false) are allowed — a master game may
//    benefit from, and deepen, a position the tracked player has already reached, but never
//    creates a new tpos_positions row of its own. Never imports chessdb_player.ts (player-scoped
//    joins into tgam_game_positions/tgd_gamesdecon — no player context there).
//
//  3) CHANGE HISTORY
//    2026-08-26 — added tmgev_game_evals read/write (getMasterGameEvals/
//                 saveMasterGameEvaluations) and primary-DB cache top-up
//                 (getPositionEvaluationsBulk/upgradePositionEvaluation); analysis results
//                 are no longer discarded on navigation away.
//    2026-08-26 — Game Analysis panel extracted to the shared GameAnalysisPanel component
//                 (variant='master'); runAnalysis now supports a From/To re-analyze move
//                 range and reports existingDepthRange/analysisResultMessage, mirroring
//                 ChessBoardView's player-side runAnalysis exactly, except
//                 createIfMissing stays false throughout (never creates a new
//                 tpos_positions row) where the player side uses true.
//    2026-08-26 — renamed MasterGameView -> MasterGameView_master;
//                 GameAnalysisPanel/DepthInput/MoveTree/AlternativeLines -> _shared;
//                 getMasterGameEvals/saveMasterGameEvaluations -> _master; chessdb.ts split
//                 into chessdb_shared.ts/chessdb_player.ts, imports updated accordingly.
//    2026-08-26 — full parity pass: restructured layout to match ChessBoardView_shared's
//                 header/opening-line/3-column-grid exactly; added the draggable board,
//                 move-classification square highlighting, Copy FEN, the deep/infinite
//                 Stockfish analysis panel, the Chess.com Games search panel, and
//                 move-play-count badges; added Moves Played/Games Played panels backed by
//                 the new chessdb_master.ts (mirrors chessdb_player.ts, scoped to
//                 row.mgd_player). "Final eval" deliberately not added — no pipeline exists
//                 or is planned to populate a master equivalent of gd_final_eval.
//    2026-09-15 — removed the Chess.com Games search panel (moved to its own tab, see
//                 src/app/masterchesscom/page.tsx) and the per-master Moves/Games panel
//                 (row.mgd_player_name — redundant with the All Masters panel, which already
//                 includes this master's own games); panel groups relabeled: All Masters
//                 (was "From our own synced master games"), Lichess panel titles shortened to
//                 Moves/Games.
//==================================================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Chess, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { getMastersExplorer, LichessExplorerResponse } from '@/src/lib/actions/lichess'
import { StockfishEngine, PlyEvaluation, STOCKFISH_DEFAULTS, InfiniteAnalysisUpdate, CLASSIFICATION_SQUARE_COLORS } from '@/src/lib/stockfish'
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
  collectNodesFromMove,
  getCurrentMoveLabel,
  getMoveNumberAndColor
} from '@/src/lib/analysisTree'
import { upgradePositionEvaluation_shared, getFenEvalsWithFallback_shared, getFenEvalsForSkipCheck_shared } from '@/src/lib/analysis/chessdb_shared'
import { getMovePlayCounts_master } from '@/src/lib/analysis/chessdb_master'
import { getMasterGameEvals_master, upsertGameEval_master } from '@/src/lib/master/masterGamesList'
import { MOVE_COUNT_MIN_MOVE } from '@/src/lib/constants'
import { truncateFen, applyUciMove } from '@/src/lib/fen'
import { formatCp } from '@/src/lib/formatCp'
import MoveTree_shared from './MoveTree_shared'
import GameAnalysisPanel_shared from './GameAnalysisPanel_shared'
import AlternativeLines_shared from './AlternativeLines_shared'
import DepthInput_shared from './DepthInput_shared'
import MasterMovesDbPanel from './MasterMovesDbPanel'
import MasterGamesDbPanel from './MasterGamesDbPanel'
import MovesListTable from './MovesListTable'
import GamesListTable from './GamesListTable'
import { useMissingEvalAnalysis, MissingEvalRow } from './useMissingEvalAnalysis'

export interface MasterGameRow {
  mgd_mgdid:            number
  mgd_white_username:   string
  mgd_black_username:   string
  mgd_white_rating:     number
  mgd_black_rating:     number
  mgd_player:           string
  mgd_player_name:      string
  mgd_player_color:     string
  mgd_player_result:    string
  mgd_time_class:       string
  mgd_termination:      string | null
  mgd_end_time:          number
  mgd_eco_code:          string | null
  mgd_opening_name:      string | null
  mgd_pgn:                string
}

interface MasterGameViewProps {
  row: MasterGameRow
}

//
export default function MasterGameView_master({ row }: MasterGameViewProps) {
  const router = useRouter()
  const playerColor = row.mgd_player_color
  const result = row.mgd_player_result

  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)
  const [moveCounts, setMoveCounts] = useState<Record<string, number>>({})
  const [boardKey, setBoardKey] = useState(0)
  const [mastersData, setMastersData] = useState<LichessExplorerResponse | null>(null)
  const [mastersFenEvals, setMastersFenEvals] = useState<Record<string, { cp: number; depth: number }>>({})
  const [selectedMastersMove, setSelectedMastersMove] = useState<string | null>(null)
  const displayGame = useRef(new Chess())

  // Stockfish analysis — hydrated from tmgev_game_evals/tpose_positions_eval on mount,
  // persisted back to tmgev_game_evals after each run
  const [plyEvals, setPlyEvals] = useState<(PlyEvaluation | undefined)[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string; moveNumber?: number; isWhite?: boolean }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResultMessage, setAnalysisResultMessage] = useState('')
  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.reanalyzeDepth)
  const engineRef = useRef<StockfishEngine | null>(null)
  const stopRequestedRef = useRef(false)

  // Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game
  const [fromMove, setFromMove] = useState(1)
  const [toMove, setToMove] = useState(1)

  // Deep analysis state
  const [deepAnalysisDepth, setDeepAnalysisDepth] = useState(STOCKFISH_DEFAULTS.deepAnalysisDepth)
  const [deepAnalysisMultiPv, setDeepAnalysisMultiPv] = useState(STOCKFISH_DEFAULTS.deepAnalysisMultiPv)
  const [deepAnalyzing, setDeepAnalyzing] = useState(false)
  const [deepAnalysisData, setDeepAnalysisData] = useState<InfiniteAnalysisUpdate | null>(null)
  const latestAnalysisLinesRef = useRef<{ lines: MultiPvResult[]; depth: number } | null>(null)
  const [saveAnalysisMessage, setSaveAnalysisMessage] = useState('')
  const [fenCopied, setFenCopied] = useState(false)

  // -----------------------------------------------------------------------
  // Parse PGN on mount → build a plain main-line tree, then hydrate any already-
  // computed evaluations (tmgev_game_evals + the shared tpos_positions_eval cache) —
  // no Stockfish run here, just a cache read
  // -----------------------------------------------------------------------
  useEffect(() => {
    const g = new Chess()
    g.loadPgn(row.mgd_pgn)

    const moves = g.history({ verbose: true })
    const history = moves.map(m => ({ san: m.san, from: m.from, to: m.to }))

    const g2 = new Chess()
    const fens = [g2.fen()]
    for (const m of moves) {
      g2.move(m.san)
      fens.push(g2.fen())
    }

    const newTree = buildTree(history, fens, [])
    const totalFullMovesForRow = Math.max(1, Math.ceil(newTree.mainLine.length / 2))
    setTree(newTree)
    setCurrentNode(null)
    setPlyEvals([])
    setAnalysisError('')
    setAnalysisResultMessage('')
    setFromMove(1)
    setToMove(totalFullMovesForRow)
    displayGame.current = new Chess()
    setBoardKey(k => k + 1)

    let cancelled = false
    async function hydrateCachedEvals() {
      const cached = await getMasterGameEvals_master(row.mgd_mgdid)
      if (cancelled) return
      const hydrated: (PlyEvaluation | undefined)[] = []
      cached.forEach((e, i) => {
        if (!e) return
        hydrated[i] = e as PlyEvaluation
        if (newTree.mainLine[i]) newTree.mainLine[i].evaluation = e as PlyEvaluation
      })
      if (hydrated.some(e => e !== undefined)) {
        setPlyEvals(hydrated)
        setTree({ ...newTree })
        setFromMove(Math.min(5, totalFullMovesForRow))
      }
    }
    hydrateCachedEvals()
    return () => { cancelled = true }
  }, [row])

  // -----------------------------------------------------------------------
  // Move-play-count badges — how many times each move (from MOVE_COUNT_MIN_MOVE
  // onward, main line + every variation) was played from its position, across
  // this master's own synced games. One batched lookup per tree change.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!tree) { setMoveCounts({}); return }
    let cancelled = false

    const nodes = collectNodesFromMove(tree.root, MOVE_COUNT_MIN_MOVE)
    const fens = nodes.map(n => truncateFen(n.fenBefore))

    if (fens.length === 0) { setMoveCounts({}); return }

    getMovePlayCounts_master(fens, row.mgd_player).then(countsByFen => {
      if (cancelled) return
      const byNodeId: Record<string, number> = {}
      for (const n of nodes) {
        const c = countsByFen[truncateFen(n.fenBefore)]?.[n.san]
        if (c) byNodeId[n.id] = c
      }
      setMoveCounts(byNodeId)
    }).catch(() => { if (!cancelled) setMoveCounts({}) })

    return () => { cancelled = true }
  }, [tree, row.mgd_player])

  // -----------------------------------------------------------------------
  // Master-level game stats for whatever position is currently on the board, from the
  // Lichess Masters Opening Explorer — external API, no dependency on this project's own DB.
  // Once loaded, each move's resulting FEN (Lichess only returns uci, not a FEN) is resolved
  // via applyUciMove and its eval looked up via getFenEvalsWithFallback_shared (tmgev_game_evals
  // first, tpose_positions_eval fallback) into mastersFenEvals.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen
    if (!fen) { setMastersData(null); setMastersFenEvals({}); return }
    let cancelled = false

    async function load() {
      try {
        const data = await getMastersExplorer(fen!)
        if (cancelled) return
        setMastersData(data)
        setMastersFenEvals({})
        if (!data || data.moves.length === 0) return

        const resultingFens = data.moves
          .map(m => applyUciMove(fen!, m.uci))
          .filter((f): f is string => f != null)
        if (resultingFens.length === 0) return

        const evals = await getFenEvalsWithFallback_shared(resultingFens, 'master')
        if (!cancelled) setMastersFenEvals(evals)
      } catch {
        if (!cancelled) { setMastersData(null); setMastersFenEvals({}) }
      }
    }
    load()

    return () => { cancelled = true }
  }, [currentNode])

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

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentNode) goToNode(currentNode.parent?.san === '' ? null : currentNode.parent)
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
        if (tree && tree.mainLine.length > 0) goToNode(tree.mainLine[tree.mainLine.length - 1])
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
  // Cleanup engine on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => { engineRef.current?.destroy() }
  }, [])

  // -----------------------------------------------------------------------
  // Run full-game Stockfish analysis. On re-analysis (plyEvals already exist), only
  // the selected From/To move range is (re-)analyzed — existing plyEvals outside that
  // range are preserved, both in state and in tmgev_game_evals. Mirrors
  // ChessBoardView's player-side runAnalysis exactly, except every
  // upgradePositionEvaluation call here keeps createIfMissing:false (never creates a
  // new tpos_positions row) where the player side uses true.
  // -----------------------------------------------------------------------
  async function runAnalysis() {
    if (!tree) return
    setAnalyzing(true)
    setAnalysisError('')
    setAnalysisResultMessage('')
    stopRequestedRef.current = false

    try {
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

      // Deepest-of-tpose-or-tmgev per FEN — see getFenEvalsForSkipCheck_shared's header for why
      // this differs from the display-oriented getFenEvalsWithFallback_shared.
      const skipCheckEvals = await getFenEvalsForSkipCheck_shared(fens, 'master')

      // Skip overwriting any ply whose existing depth is already >= this run's depth —
      // mirrors tpose_positions_eval's own guard, so re-analyzing at a shallower depth
      // never downgrades a ply saved deeper previously.
      const mergedPlyEvals = [...plyEvals]
      let updatedPlies = 0
      let skippedPlies = 0

      const { finalPosition, stopped } = await engine.analyzeGame(
        fens, sans,
        // progress.current is 1-indexed within this slice once a move has been played
        // (0 = still evaluating the anchor/starting position) — sliceStart + current gives
        // the absolute 1-indexed ply, matching getMoveNumberAndColor's convention.
        progress => setAnalysisProgress(
          progress.current > 0
            ? { ...progress, ...getMoveNumberAndColor(sliceStart + progress.current) }
            : progress
        ),
        stockfishDepth,
        skipCheckEvals,
        (plyEval, i) => {
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
          // Fire-and-forget (not blocking the engine's own progress) — wrapped in an async
          // IIFE with try/catch rather than .then()/.catch(), per this project's async
          // convention.
          void (async () => {
            try {
              await upgradePositionEvaluation_shared({ fen: plyEval.fenBefore, cp: plyEval.cpBefore, bestMove: plyEval.bestMove, depth: plyEval.depth, createIfMissing: false })
            } catch {
              // Non-critical — a failed top-up doesn't block the rest
            }
          })()
          // Incrementally persists this exact ply into tmgev_game_evals as soon as it's
          // computed, so a refresh/interruption partway through a long run only ever
          // loses the one ply that was still in flight — not the whole run's progress
          // (see upsertGameEval_master's header for why this replaced the old
          // whole-array save at the end of this function).
          void (async () => {
            try {
              await upsertGameEval_master(row.mgd_mgdid, idx, plyEval)
            } catch {
              // Non-critical — a failed persist doesn't block the rest
            }
          })()
        },
        () => stopRequestedRef.current
      )

      setAnalysisResultMessage(
        stopped
          ? `Stopped — updated ${updatedPlies} plies`
          : skippedPlies > 0
            ? `Updated ${updatedPlies} plies, kept ${skippedPlies} at deeper depth`
            : `Updated ${updatedPlies} plies`
      )

      // First-time full analysis just completed — default the next re-analyze range to
      // start at move 5, since re-checking opening theory is rarely useful
      if (!isReanalyze && !stopped) {
        setFromMove(Math.min(5, totalFullMoves))
      }

      // The range's final resulting position (or, if stopped early, the last ply that
      // actually completed — analyzeGame's own finalPosition derivation already accounts
      // for this) is never any ply's "before" position (nothing after it in this run),
      // so it needs its own explicit upgrade call — everything else was already
      // upgraded live, ply by ply, above.
      const finalSkipCheckEval = skipCheckEvals[truncateFen(finalPosition.fen)]
      if (!finalSkipCheckEval || finalSkipCheckEval.depth < stockfishDepth) {
        try {
          await upgradePositionEvaluation_shared({ fen: finalPosition.fen, cp: finalPosition.cp, bestMove: finalPosition.bestMove, depth: stockfishDepth, createIfMissing: false })
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  //----------------------------------------------------------------------------------
  //  stopRunAnalysis — requests that runAnalysis's in-progress engine.analyzeGame() loop
  //  stop after whatever ply is currently in flight (that ply's own result is discarded,
  //  per the "not interested in the current ply" decision — every ply reported via
  //  onPlyEvaluated before this point has already been incrementally persisted).
  //----------------------------------------------------------------------------------
  function stopRunAnalysis() {
    stopRequestedRef.current = true
    engineRef.current?.requestStop()
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
  // Analyze current position (own Depth/Lines controls, always depth-capped).
  // Always guarantees the actually-played move is included and highlighted,
  // even if it's outside the engine's top N lines. Mirrors ChessBoardView_shared's
  // startDeepAnalysis exactly.
  // -----------------------------------------------------------------------
  async function startDeepAnalysis() {
    const fen = getCurrentPositionFen()
    if (!fen) return
    const analyzedPly = currentPly - 1

    const numLines = deepAnalysisMultiPv
    const maxDepth = deepAnalysisDepth
    const playedSan = currentNode?.children[0]?.san ?? ''
    const isWhiteToMove = fen.split(' ')[1] !== 'b'

    const legalUcis = new Set<string>()
    try {
      const validator = new Chess(fen)
      for (const m of validator.moves({ verbose: true })) {
        legalUcis.add(m.from + m.to + (m.promotion ?? ''))
      }
    } catch { /* if FEN is invalid, skip validation */ }

    function processUpdate(update: InfiniteAnalysisUpdate) {
      const legal = legalUcis.size > 0
        ? update.lines.filter(r => !r.bestMoveUci || legalUcis.has(r.bestMoveUci))
        : update.lines

      const seen = new Set<string>()
      const unique = legal.filter(r => {
        const key = r.bestMoveUci || r.bestMoveSan
        if (!key) return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      unique.sort((a, b) => isWhiteToMove ? b.cp - a.cp : a.cp - b.cp)

      const display = unique.slice(0, numLines)
      display.forEach((r, i) => {
        r.rank = i + 1
        ;(r as any)._isActualMove = playedSan ? r.bestMoveSan === playedSan : false
      })

      setDeepAnalysisData({ ...update, lines: display })
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
          await persistAnalysisLines_master(fen, analyzedPly, latest.lines, latest.depth)
        }
      }
    )
  }

  function stopDeepAnalysis() {
    engineRef.current?.stopAnalysis()
    setDeepAnalyzing(false)
  }

  // -----------------------------------------------------------------------
  // Persist Analysis — runs automatically whenever a Position Analysis run completes.
  // Pushes every displayed Engine Line's evaluation into tpose_positions_eval for its
  // resulting position, plus the analyzed position's own evaluation (the rank-1 line's
  // score). Mirrors ChessBoardView_shared's persistAnalysisLines, with one deliberate
  // divergence: never passes gameContext to upgradePositionEvaluation_shared — that
  // param is hardcoded to upsert tgev_game_evals (a player-only table); passing it here
  // would write into the wrong game's table. Instead, for the "own position" write-back,
  // this updates local plyEvals[ply] and persists just that one row via
  // upsertGameEval_master.
  // -----------------------------------------------------------------------
  async function persistAnalysisLines_master(fen: string, ply: number, lines: MultiPvResult[], depth: number) {
    if (lines.length === 0) return

    setSaveAnalysisMessage('')

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
          createIfMissing: false
        })
      } catch {
        return false
      }
    }))

    const topLine = lines.find(l => l.rank === 1)
    let ownUpdated = false
    if (topLine) {
      try {
        ownUpdated = await upgradePositionEvaluation_shared({
          fen,
          cp: topLine.cp,
          bestMove: topLine.bestMoveUci || null,
          depth,
          createIfMissing: false,
          force: true
        })
      } catch {
        ownUpdated = false
      }
    }

    const updated = results.filter(Boolean).length + (ownUpdated ? 1 : 0)
    setSaveAnalysisMessage(`Updated ${updated} of ${lines.length + 1} positions`)

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
        classification: cpLoss > 200 ? 'blunder' : cpLoss > 100 ? 'mistake' : cpLoss > 50 ? 'inaccuracy' : 'good',
        depth
      }
      const mergedPlyEvals = [...plyEvals]
      mergedPlyEvals[ply] = updatedPlyEval
      setPlyEvals(mergedPlyEvals)
      if (tree) {
        tree.mainLine[ply].evaluation = updatedPlyEval
        setTree({ ...tree })
      }
      try {
        await upsertGameEval_master(row.mgd_mgdid, ply, updatedPlyEval)
      } catch {
        // Non-critical — DB save failure doesn't block UI
      }
    }
  }

  // -----------------------------------------------------------------------
  // Handle selecting an alternative PV line
  // -----------------------------------------------------------------------
  function handleSelectPvLine(line: MultiPvResult) {
    if (!tree) return
    const parent = currentNode ?? tree.root
    const firstNode = addPvBranch(parent, line.lineSans)
    if (firstNode) {
      setTree({ ...tree })
      goToNode(firstNode)
    }
  }

  // -----------------------------------------------------------------------
  // Interactive board: handle piece drop — build-your-own-variation support
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

    const parent = currentNode ?? tree.root
    const newNode = addBranch(parent, moveResult.san, moveResult.from, moveResult.to, g.fen())

    setTree({ ...tree })
    goToNode(newNode)

    return true
  }

  const onMainLine = !currentNode || isOnMainLine(currentNode)

  // Full move numbers for the re-analyze range selector
  const totalFullMoves = tree ? Math.max(1, Math.ceil(tree.mainLine.length / 2)) : 1

  // Current ply for move numbering
  const currentPly = currentNode ? getPath(currentNode).length : 0

  // Label for whatever position is currently on the board, shown on the Position
  // Analysis box title
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

  // Existing saved depth for the currently-selected From/To range — mirrors
  // ChessBoardView's identical computation
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

  //
  //  Master Moves (Lichess) rows still lacking a DB-sourced eval (mastersFenEvals, computed
  //  above), for the "Analyze missing" button — useMissingEvalAnalysis re-checks
  //  evalSessionCache internally too, so a position already analyzed elsewhere in this
  //  session shows up here with no engine run needed.
  //
  const lichessMissingRows: MissingEvalRow[] = currentNode && mastersData
    ? mastersData.moves
        .map(m => {
          const resultingFen = applyUciMove(currentNode.fen, m.uci)
          if (!resultingFen || mastersFenEvals[truncateFen(resultingFen)]) return null
          return { key: m.uci, fen: resultingFen }
        })
        .filter((r): r is MissingEvalRow => r != null)
    : []
  const lichessMissingEval = useMissingEvalAnalysis(lichessMissingRows)

  if (!tree) return null

  return (
    <div className='space-y-3'>
      {/* Opening name — page-level, above the whole Board/Moves/Analysis grid */}
      <div className='text-xs text-gray-500'>
        {row.mgd_opening_name || 'Unknown'}
        {row.mgd_eco_code && <span className='text-gray-400 ml-1'>({row.mgd_eco_code})</span>}
        <span className='ml-1 text-gray-400'>{row.mgd_time_class}</span>
      </div>

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-[480px_480px_900px] xl:items-start'>
        {/* Column 1: Board */}
        <div className='space-y-1 w-[480px]'>
          {/* Top player */}
          <div className='flex items-center justify-between rounded bg-gray-600 px-3 py-1.5 text-xs text-white'>
            <span className='font-bold'>
              {playerColor === 'white' ? row.mgd_black_username : row.mgd_white_username}
              <span className='ml-1 font-normal text-blue-400'>
                ({playerColor === 'white' ? row.mgd_black_rating : row.mgd_white_rating})
              </span>
            </span>
            <span className='text-red-400 font-bold'>{result === 'win' ? '0' : result === 'loss' ? '1' : '1/2'}</span>
          </div>

          {/* Board */}
          <Chessboard
            key={boardKey}
            options={{
              position: displayGame.current.fen(),
              boardStyle: { width: '480px', height: '480px' },
              allowDragging: true,
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
              boardOrientation: playerColor === 'black' ? 'black' : 'white',
              squareStyles: customSquareStyles
            }}
          />

          {/* Bottom player (always the tracked master — shown by real name, not handle) */}
          <div className='flex items-center justify-between rounded bg-green-50 border border-green-200 px-3 py-1.5 text-xs text-gray-900'>
            <span className='font-bold'>
              {row.mgd_player_name} ({row.mgd_player})
              <span className='ml-1 font-normal text-blue-400'>
                ({playerColor === 'white' ? row.mgd_white_rating : row.mgd_black_rating})
              </span>
            </span>
            <span className='text-red-600 font-bold'>{result === 'win' ? '1' : result === 'loss' ? '0' : '1/2'}</span>
          </div>

          {/* Game info: game number, date, termination */}
          <div className='flex items-center gap-3 text-xxs text-gray-500 px-1'>
            <span>Game #{row.mgd_mgdid}</span>
            <span>{formatGameDate(row.mgd_end_time)}</span>
            {row.mgd_termination && <span>{row.mgd_termination}</span>}
          </div>

          {!onMainLine && (
            <div className='flex items-center gap-2'>
              <span className='text-xs text-blue-600 font-bold'>Variation</span>
              <MyButton
                onClick={() => { if (currentNode) goToNode(findMainLineAncestor(currentNode)) }}
                overrideClass='text-xs bg-blue-500 hover:bg-blue-600'
              >
                Return to main line
              </MyButton>
            </div>
          )}

          {/* Prev/Next navigation */}
          <div className='flex items-center gap-2'>
            <MyButton
              onClick={() => currentNode && goToNode(currentNode.parent?.san === '' ? null : currentNode.parent)}
              disabled={!currentNode}
              overrideClass='text-xs'
            >
              ← Prev
            </MyButton>
            <MyButton
              onClick={() => {
                if (!currentNode && tree) goToNode(tree.mainLine[0] ?? null)
                else if (currentNode?.children.length) goToNode(currentNode.children[0])
              }}
              disabled={currentNode != null && currentNode.children.length === 0}
              overrideClass='text-xs'
            >
              Next →
            </MyButton>
          </div>

          {/* Game Analysis */}
          <GameAnalysisPanel_shared
            variant='master'
            plyEvals={plyEvals}
            analyzing={analyzing}
            analysisProgress={analysisProgress}
            depth={stockfishDepth}
            onDepthChange={setStockfishDepth}
            existingDepthRange={existingDepthRange}
            fromMove={fromMove}
            toMove={toMove}
            totalFullMoves={totalFullMoves}
            onFromMoveChange={setFromMove}
            onToMoveChange={setToMove}
            onRunAnalysis={runAnalysis}
            onStopAnalysis={stopRunAnalysis}
            analysisResultMessage={analysisResultMessage}
            analysisError={analysisError}
            disableRun={deepAnalyzing}
          />
        </div>

        {/* Column 2: Moves */}
        <div className='w-[480px] rounded-lg bg-pink-50 p-2'>
          {tree && (
            <div className='h-full'>
              <MoveTree_shared tree={tree} currentNode={currentNode} onSelectNode={goToNode} moveCounts={moveCounts} />
            </div>
          )}
        </div>

        {/* Column 3: Analysis — each logical group below (Stockfish, Player-equivalent, Master
            (Our DB), Lichess, Chess.com) gets its own tinted wrapper so the grouping is visually
            obvious; individual MyBox panels keep their own look inside. */}
        <div className='w-[900px] rounded-lg space-y-2'>
          {/* Badge disambiguates this route (Master, purple) from ChessBoardView_shared's
              identical-looking layout (Player, blue) — see the "Games Played showing master
              data" confusion this was added to prevent. FEN/Copy FEN moved here from inside the
              Stockfish box, so they're visible regardless of whether that box is collapsed. */}
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='rounded px-2 py-0.5 text-xs font-bold text-white bg-purple-600'>Master</span>
              <p className='text-sm font-bold text-gray-700'>Position Analysis {currentMoveLabel}</p>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-xxs font-mono text-gray-500 truncate'>{getCurrentPositionFen()}</span>
              <MyButton onClick={copyFenToClipboard} overrideClass='h-5 px-2 text-xxs whitespace-nowrap'>
                {fenCopied ? 'Copied' : 'Copy FEN'}
              </MyButton>
            </div>
          </div>

          {/* Stockfish: current-position analysis, live/capped depth */}
          <div className='rounded-lg bg-gray-100 p-2'>
          <MyBox title='Stockfish' collapsible>
            <div className='space-y-2'>
              <div className='flex items-center gap-4'>
                <DepthInput_shared value={deepAnalysisDepth} onChange={setDeepAnalysisDepth} />
                <MySelect
                  label='Lines'
                  options={['1', '2', '3', '4', '5']}
                  value={String(deepAnalysisMultiPv)}
                  onChange={e => setDeepAnalysisMultiPv(parseInt(e.target.value, 10))}
                  overrideClass='w-20 h-6 md:h-6'
                />
              </div>
              {deepAnalyzing ? (
                <MyButton onClick={stopDeepAnalysis} overrideClass='w-full bg-red-500 hover:bg-red-600'>
                  Stop
                </MyButton>
              ) : (
                <MyButton onClick={startDeepAnalysis} disabled={analyzing} overrideClass='w-full bg-purple-600 hover:bg-purple-700'>
                  {analyzing ? 'Game analysis running...' : 'Analyze Position'}
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
          </div>

          {/* All Masters: from this project's own synced master games, pooled across every
              synced master (not just row.mgd_player). */}
          {currentNode && (
            <div className='rounded-lg bg-purple-50 p-2 space-y-4'>
              <p className='text-xxs font-semibold text-gray-400 uppercase tracking-wide'>All Masters</p>
              <MasterMovesDbPanel fen={currentNode.fen} />
              <MasterGamesDbPanel fen={currentNode.fen} />
            </div>
          )}

          {/* Lichess: Moves + Games, grouped in one wrapper. Moves — master-level game stats
              for whatever position is currently on the board, from the Lichess Masters Opening
              Explorer. Hidden entirely until a position has been clicked on (currentNode set). */}
          {currentNode && (
          <div className='rounded-lg bg-green-50 p-2 space-y-2'>
          <p className='text-xxs font-semibold text-gray-400 uppercase tracking-wide'>Lichess</p>
          <MyBox title='Moves' collapsible>
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
                    <MovesListTable
                      rows={mastersData.moves.map(m => {
                        const resultingFen = applyUciMove(currentNode.fen, m.uci)
                        const fenEval = (resultingFen ? mastersFenEvals[truncateFen(resultingFen)] : undefined)
                          ?? lichessMissingEval.overrides[m.uci]
                        return {
                          key:       m.uci,
                          move:      m.san,
                          times:     m.white + m.draws + m.black,
                          white:     m.white,
                          draws:     m.draws,
                          black:     m.black,
                          eval:      fenEval?.cp ?? null
                        }
                      })}
                      selectedMove={selectedMastersMove}
                      onSelectMove={setSelectedMastersMove}
                    />
                    {lichessMissingEval.missingCount > 0 && (
                      <MyButton
                        onClick={lichessMissingEval.analyzeMissing}
                        disabled={lichessMissingEval.analyzing || analyzing || deepAnalyzing}
                        overrideClass='text-xxs'
                      >
                        {lichessMissingEval.analyzing
                          ? `Analyzing ${lichessMissingEval.progress?.done ?? 0}/${lichessMissingEval.progress?.total ?? 0}...`
                          : `Analyze missing (${lichessMissingEval.missingCount})`}
                      </MyButton>
                    )}
                  </div>
                )
              })()
            )}
          </MyBox>

          {/* Lichess games — games list scoped to the current position (and, if a row in
              the Moves table above is selected, to that specific move). Hidden entirely
              until a position has been clicked on (currentNode set). */}
          {mastersData && mastersData.topGames.length > 0 && (() => {
            const filteredTopGames = mastersData.topGames.filter(
              g => !selectedMastersMove || g.uci === selectedMastersMove
            )
            return (
              <MyBox title='Games' collapsible>
                <div className='space-y-1'>
                  <div className='flex justify-end'>
                    <MyHelpField text="Live results from Lichess's Masters Explorer for this position — Lichess selects which games qualify as 'top', not this app; the count and selection aren't configurable here." />
                  </div>
                  {filteredTopGames.length === 0 ? (
                    <p className='text-xs text-gray-400'>No games match the selected move.</p>
                  ) : (
                    <GamesListTable
                      rows={filteredTopGames.map((g, i) => ({
                        key:            String(i),
                        move:           mastersData.moves.find(m => m.uci === g.uci)?.san ?? g.uci,
                        white:          g.white.name,
                        whiteRating:    g.white.rating,
                        whiteIsTracked: false,
                        black:          g.black.name,
                        blackRating:    g.black.rating,
                        blackIsTracked: false,
                        date:           String(g.year),
                        result:         g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
                        termination:    null,
                        finalEval:      null,
                        externalHref:   `https://lichess.org/${g.id}`
                      }))}
                    />
                  )}
                </div>
              </MyBox>
            )
          })()}
          </div>
          )}

        </div>
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  formatGameDate — epoch seconds to dd/mm/yy
//----------------------------------------------------------------------------------------------
function formatGameDate(endTime: number): string {
  const date = new Date(endTime * 1000)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}
