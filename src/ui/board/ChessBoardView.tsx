'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Chess, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import MySelect from 'nextjs-shared/MySelect'
import { ChessComGame, getPlayerResult } from '@/src/lib/chesscom'
import { parsePgnHeaders } from '@/src/lib/parsePgn'
import { StockfishEngine, MoveEvaluation, STOCKFISH_DEFAULTS, InfiniteAnalysisUpdate } from '@/src/lib/stockfish'
import { saveGameEvaluations, saveAnalysisLine, saveAnalysisTree } from '@/src/lib/actions/games'
import { upgradePositionEvaluation, getMovePlayCounts, getGamesForPosition, getMoveSummaryForPosition, PositionGameHit, MoveRow } from '@/src/lib/analysis/chessdb'
import { MOVE_COUNT_MIN_MOVE } from '@/src/lib/constants'
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
import AlternativeLines from './AlternativeLines'
import MoveTree from './MoveTree'

interface ChessBoardViewProps {
  game: ChessComGame
  gdid?: number
  username: string
  stockfishDepth?: number
  onStockfishDepthChange?: (depth: number) => void
  deepAnalysisDepth?: number | 'infinite'
  deepAnalysisMultiPv?: number
  onDeepAnalysisDepthChange?: (depth: number | 'infinite') => void
  onDeepAnalysisMultiPvChange?: (multiPv: number) => void
  backPath: string
}

const CLASSIFICATION_SQUARE_COLORS: Record<string, string> = {
  blunder: 'rgba(239, 68, 68, 0.6)',
  mistake: 'rgba(249, 115, 22, 0.6)',
  inaccuracy: 'rgba(234, 179, 8, 0.5)'
}

//----------------------------------------------------------------------------------
//  getCurrentMoveLabel — "16. Ng6" / "16...Ng6" for whatever position is currently on
//  the board (matching MoveTree.tsx's own move-number notation), "Starting position"
//  at the root (no move played yet)
//----------------------------------------------------------------------------------
function getCurrentMoveLabel(currentNode: MoveNode | null, currentPly: number): string {
  if (!currentNode) return 'Starting position'
  const moveNum = Math.floor((currentPly - 1) / 2) + 1
  const isWhite = (currentPly - 1) % 2 === 0
  return `${moveNum}${isWhite ? '.' : '...'} ${currentNode.san}`
}

//----------------------------------------------------------------------------------
//  getNextMoveLabel — "8. Nbd2" / "8...Nbd2" for a move about to be played FROM the
//  position currently on the board (the opposite direction from getCurrentMoveLabel,
//  which labels the move that led here)
//----------------------------------------------------------------------------------
function getNextMoveLabel(currentPly: number, san: string): string {
  const moveNum = Math.floor(currentPly / 2) + 1
  const isWhite = currentPly % 2 === 0
  return `${moveNum}${isWhite ? '.' : '...'} ${san}`
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

export default function ChessBoardView({ game, gdid, username, stockfishDepth, onStockfishDepthChange, deepAnalysisDepth, deepAnalysisMultiPv, onDeepAnalysisDepthChange, onDeepAnalysisMultiPvChange, backPath }: ChessBoardViewProps) {
  const router = useRouter()
  const playerColor = getPlayerResult(game, username).color
  const result = getPlayerResult(game, username).result
  const { openingName: opening, eco } = game.pgn ? parsePgnHeaders(game.pgn) : { openingName: (game as any)._openingName ?? '', eco: (game as any)._ecoCode ?? '' }

  // Tree state
  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)
  const [moveCounts, setMoveCounts] = useState<Record<string, number>>({})
  const [positionGames, setPositionGames] = useState<PositionGameHit[]>([])
  const [moveSummary, setMoveSummary] = useState<MoveRow[]>([])
  const [selectedPositionMove, setSelectedPositionMove] = useState<string | null>(null)

  // Display chess instance
  const displayGame = useRef(new Chess())

  // Analysis state
  const [evaluations, setEvaluations] = useState<MoveEvaluation[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const engineRef = useRef<StockfishEngine | null>(null)

  // Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game
  const [fromMove, setFromMove] = useState(1)
  const [toMove, setToMove] = useState(1)

  // Deep analysis state
  const [deepAnalyzing, setDeepAnalyzing] = useState(false)
  const [deepAnalysisData, setDeepAnalysisData] = useState<InfiniteAnalysisUpdate | null>(null)
  const latestDeepResultRef = useRef<{ cp: number; bestMoveUci: string; depth: number } | null>(null)

  // Save state
  const [saveMessage, setSaveMessage] = useState('')

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
    const storedEvals = (game as any)._evaluations as MoveEvaluation[] | null
    if (storedEvals && storedEvals.length > 0) {
      for (let i = 0; i < Math.min(storedEvals.length, newTree.mainLine.length); i++) {
        newTree.mainLine[i].evaluation = storedEvals[i]
      }
      setEvaluations(storedEvals)
    } else {
      setEvaluations([])
    }

    setTree(newTree)
    setCurrentNode(null)
    setFromMove(storedEvals && storedEvals.length > 0 ? Math.min(5, totalFullMoves) : 1)
    setToMove(totalFullMoves)
    displayGame.current = new Chess()
    setBoardKey(k => k + 1)
  }, [game])

  // -----------------------------------------------------------------------
  // Move-play-count badges — how many times each move (from MOVE_COUNT_MIN_MOVE
  // onward, main line + every variation) was played from its position, across
  // this player's own synced games. One batched lookup per tree change.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!tree) { setMoveCounts({}); return }
    let cancelled = false

    const nodes = collectNodesFromMove(tree.root, MOVE_COUNT_MIN_MOVE)
    const fens = nodes.map(n => truncateFen(n.fenBefore))

    if (fens.length === 0) { setMoveCounts({}); return }

    getMovePlayCounts(fens, username).then(countsByFen => {
      if (cancelled) return
      const byNodeId: Record<string, number> = {}
      for (const n of nodes) {
        const c = countsByFen[truncateFen(n.fenBefore)]?.[n.san]
        if (c) byNodeId[n.id] = c
      }
      setMoveCounts(byNodeId)
    }).catch(() => { if (!cancelled) setMoveCounts({}) })

    return () => { cancelled = true }
  }, [tree, username])

  // -----------------------------------------------------------------------
  // Moves From This Position — one row per move played from whatever position
  // is currently on the board, aggregated across all tracked players. Loads
  // automatically on every position change; a click on a row reveals the
  // matching games below (see positionGames + selectedPositionMove).
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen ?? tree?.root.fen
    setSelectedPositionMove(null)
    if (!fen) { setMoveSummary([]); return }
    let cancelled = false

    getMoveSummaryForPosition(fen).then(rows => {
      if (!cancelled) setMoveSummary(rows)
    }).catch(() => { if (!cancelled) setMoveSummary([]) })

    return () => { cancelled = true }
  }, [currentNode, tree])

  // -----------------------------------------------------------------------
  // Games From This Position — this player's own games that reached whatever
  // position is currently on the board. Loads automatically on every position
  // change; filtered client-side by selectedPositionMove for display.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen ?? tree?.root.fen
    if (!fen) { setPositionGames([]); return }
    let cancelled = false

    getGamesForPosition(fen, username, gdid).then(games => {
      if (!cancelled) setPositionGames(games)
    }).catch(() => { if (!cancelled) setPositionGames([]) })

    return () => { cancelled = true }
  }, [currentNode, tree, gdid, username])

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
  // Run full-game Stockfish analysis. On re-analysis (evaluations already
  // exist), only the selected From/To move range is (re-)analyzed — existing
  // evaluations outside that range are preserved, both in state and in the DB.
  // -----------------------------------------------------------------------
  async function runAnalysis() {
    if (!tree) return
    setAnalyzing(true)
    setAnalysisError('')

    try {
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
        await engine.init()
      }

      const isReanalyze = evaluations.length > 0
      const totalFullMoves = Math.max(1, Math.ceil(tree.mainLine.length / 2))
      const rangeFromMove = isReanalyze ? fromMove : 1
      const rangeToMove = isReanalyze ? toMove : totalFullMoves

      const sliceStart = (rangeFromMove - 1) * 2
      const sliceEnd = Math.min(rangeToMove * 2, tree.mainLine.length)
      const sliceNodes = tree.mainLine.slice(sliceStart, sliceEnd)

      const anchorFen = sliceStart === 0 ? tree.root.fen : tree.mainLine[sliceStart - 1].fen
      const fens = [anchorFen, ...sliceNodes.map(n => n.fen)]
      const sans = sliceNodes.map(n => n.san)

      const depth = stockfishDepth ?? STOCKFISH_DEFAULTS.depth
      const results = await engine.analyzeGame(fens, sans, (progress) => {
        setAnalysisProgress(progress)
      }, depth)

      const merged = [...evaluations]
      for (let i = 0; i < results.length; i++) {
        merged[sliceStart + i] = results[i]
      }
      setEvaluations(merged)

      // Attach evaluations to main-line nodes
      for (let i = 0; i < results.length; i++) {
        tree.mainLine[sliceStart + i].evaluation = results[i]
      }
      setTree({ ...tree })

      // First-time full analysis just completed — default the next re-analyze range to
      // start at move 5, since re-checking opening theory is rarely useful
      if (!isReanalyze) {
        setFromMove(Math.min(5, totalFullMoves))
      }

      // Save the full merged evaluations to DB — saveGameEvaluations deletes
      // and re-inserts by array position, so a partial array would wipe out
      // the evaluations for every move outside the re-analyzed range
      if (gdid) {
        try {
          await saveGameEvaluations(gdid, merged)
        } catch {
          // Non-critical — DB save failure doesn't block UI
        }
      }

      // Merge each move's "before" position into teva_evaluations if this depth is
      // deeper than what's already stored there — non-critical, silently caught per move
      for (const r of results) {
        try {
          await upgradePositionEvaluation({ fen: r.fenBefore, cp: r.cpBefore, bestMove: r.bestMove, depth })
        } catch {
          // Non-critical — a failed merge doesn't block the rest
        }
      }
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
  // Analyze current position (own Depth/Lines controls, capped or infinite).
  // Always guarantees the actually-played move is included and highlighted,
  // even if it's outside the engine's top N lines.
  // -----------------------------------------------------------------------
  async function startDeepAnalysis() {
    const fen = getCurrentPositionFen()
    if (!fen) return

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

      let display: typeof unique
      if (playedSan) {
        const playedIdx = unique.findIndex(r => r.bestMoveSan === playedSan)
        if (playedIdx >= 0) {
          // Played move found — keep top (N-1) others + played move = N total
          const played = unique[playedIdx]
          const others = unique.filter((_, i) => i !== playedIdx).slice(0, numLines - 1)
          display = isWhiteToMove
            ? [...others, played].sort((a, b) => b.cp - a.cp)
            : [...others, played].sort((a, b) => a.cp - b.cp)
        } else {
          // Played move not in top N+1 — show top N engine lines only
          display = unique.slice(0, numLines)
        }
        display.forEach((r, i) => {
          r.rank = i + 1
          ;(r as any)._isActualMove = r.bestMoveSan === playedSan
        })
      } else {
        display = unique.slice(0, numLines)
        display.forEach((r, i) => { r.rank = i + 1 })
      }

      setDeepAnalysisData({ ...update, lines: display })

      // Track the true best line (pre-display-reorder) for the teva merge-back on completion
      const top = unique[0]
      if (top) {
        latestDeepResultRef.current = { cp: top.cp, bestMoveUci: top.bestMoveUci, depth: update.depth }
      }
    }

    let engine = engineRef.current
    if (!engine) {
      engine = new StockfishEngine()
      engineRef.current = engine
      await engine.init()
    }

    setDeepAnalyzing(true)
    setDeepAnalysisData(null)
    latestDeepResultRef.current = null
    // Request one extra line so the played move has a chance of being included
    engine.startInfiniteAnalysis(
      fen,
      numLines + 1,
      maxDepth,
      processUpdate,
      () => {
        setDeepAnalyzing(false)
        const top = latestDeepResultRef.current
        if (top) {
          upgradePositionEvaluation({ fen, cp: top.cp, bestMove: top.bestMoveUci, depth: top.depth }).catch(() => {})
        }
      }
    )
  }

  function stopDeepAnalysis() {
    engineRef.current?.stopAnalysis()
    setDeepAnalyzing(false)
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
  // Save analysis
  // -----------------------------------------------------------------------
  async function handleSaveLine() {
    if (!currentNode || !tree) return
    setSaveMessage('')

    const path = getPath(currentNode)
    const pgn = path.map((n, i) => {
      const moveNum = Math.floor(i / 2) + 1
      return i % 2 === 0 ? `${moveNum}. ${n.san}` : n.san
    }).join(' ')

    try {
      await saveAnalysisLine({
        title: `Variation at move ${path.length}`,
        line_pgn: pgn,
        line_moves: path.map(n => ({ san: n.san, from: n.from, to: n.to, fen: n.fen })),
        starting_fen: tree.root.fen,
        starting_ply: 0
      })
      setSaveMessage('Line saved!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('Save failed')
    }
  }

  async function handleSaveTree() {
    if (!tree) return
    setSaveMessage('')

    // Serialize tree (strip circular parent refs)
    function serializeNode(node: MoveNode): any {
      return {
        id: node.id,
        san: node.san,
        from: node.from,
        to: node.to,
        fen: node.fen,
        fenBefore: node.fenBefore,
        evaluation: node.evaluation,
        isMainLine: node.isMainLine,
        children: node.children.map(serializeNode)
      }
    }

    const treeData = {
      root: serializeNode(tree.root),
      mainLineLength: tree.mainLine.length
    }

    try {
      await saveAnalysisTree({
        title: `Full analysis — ${new Date().toLocaleDateString()}`,
        tree_data: treeData
      })
      setSaveMessage('Full analysis saved!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('Save failed')
    }
  }

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

  // Summary counts
  const blunders = evaluations.filter(e => e.classification === 'blunder').length
  const mistakes = evaluations.filter(e => e.classification === 'mistake').length
  const inaccuracies = evaluations.filter(e => e.classification === 'inaccuracy').length

  // Full move numbers for the re-analyze range selectors
  const totalFullMoves = tree ? Math.max(1, Math.ceil(tree.mainLine.length / 2)) : 1
  const fullMoveOptions = Array.from({ length: totalFullMoves }, (_, i) => String(i + 1))

  return (
    <div className='space-y-3'>
      {/* Header */}
      <MyBox>
        <div className='flex items-center justify-between'>
          <MyBackHomeNav backPath={backPath} />
        </div>
      </MyBox>

      <div className='grid grid-cols-1 gap-3 xl:grid-cols-[auto_1fr_1fr] xl:items-start'>
        {/* Column 1: Board */}
        <div className='space-y-1'>
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
                  boardStyle: { width: '440px', height: '440px' },
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

          {/* Branch indicator + save */}
          <div className='flex items-center gap-2'>
            {!onMainLine && (
              <>
                <span className='text-xs text-blue-600 font-bold'>Variation</span>
                <MyButton
                  onClick={() => {
                    if (currentNode) goToNode(findMainLineAncestor(currentNode))
                  }}
                  overrideClass='text-xs bg-blue-500 hover:bg-blue-600'
                >
                  Return to main line
                </MyButton>
              </>
            )}
            <div className='ml-auto flex items-center gap-2'>
              {currentNode && (
                <MyButton onClick={handleSaveLine} overrideClass='text-xxs bg-purple-500 hover:bg-purple-600'>
                  Save Line
                </MyButton>
              )}
              {saveMessage && (
                <span className='text-xxs text-green-600 font-bold'>{saveMessage}</span>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Moves */}
        <div className='xl:h-[520px] overflow-y-auto'>
          {tree && (
            <div className='h-full'>
              <div className='flex items-center justify-between border-b border-gray-200 pb-1 mb-2'>
                <h3 className='text-xs font-bold'>Moves</h3>
                <span className='text-xs text-gray-500'>
                  {opening || 'Unknown'}
                  {eco && <span className='text-gray-400 ml-1'>({eco})</span>}
                  <span className='ml-1 text-gray-400'>{game.time_class}</span>
                </span>
              </div>
              <MoveTree
                tree={tree}
                currentNode={currentNode}
                onSelectNode={handleSelectNode}
                moveCounts={moveCounts}
              />
            </div>
          )}
        </div>

        {/* Column 3: Analysis */}
        <div className='space-y-2'>
          {/* Game Analysis: whole-game batch analysis */}
          <MyBox title='Game Analysis'>
            <div className='space-y-2'>
              {/* Summary */}
              <div className='flex items-center justify-between'>
                {evaluations.length > 0 ? (
                  <div className='flex gap-2 text-xs'>
                    <span className='rounded bg-red-500 px-2 py-0.5 text-white'>{blunders} blunders</span>
                    <span className='rounded bg-orange-500 px-2 py-0.5 text-white'>{mistakes} mistakes</span>
                    <span className='rounded bg-yellow-400 px-2 py-0.5 text-black'>{inaccuracies} inaccuracies</span>
                  </div>
                ) : (
                  <span className='text-xs text-gray-400'>No analysis yet</span>
                )}
              </div>

              {/* Settings */}
              <div className='flex items-center gap-4 border-t border-gray-200 pt-2'>
                <MySelect
                  label='Depth'
                  options={['16', '20', '25', '30']}
                  value={String(stockfishDepth ?? STOCKFISH_DEFAULTS.depth)}
                  onChange={e => onStockfishDepthChange?.(parseInt(e.target.value, 10))}
                />
              </div>
              {evaluations.length > 0 && (
                <div className='flex items-center gap-4'>
                  <MySelect
                    label='From move'
                    options={fullMoveOptions}
                    value={String(Math.min(fromMove, totalFullMoves))}
                    onChange={e => setFromMove(parseInt(e.target.value, 10))}
                  />
                  <MySelect
                    label='To move'
                    options={fullMoveOptions}
                    value={String(Math.min(toMove, totalFullMoves))}
                    onChange={e => setToMove(parseInt(e.target.value, 10))}
                  />
                </div>
              )}
              {!analyzing && (
                <MyButton onClick={runAnalysis} overrideClass='w-full'>
                  {evaluations.length > 0
                    ? (fromMove === 1 && toMove === totalFullMoves
                        ? `Re-analyze all (depth ${stockfishDepth ?? STOCKFISH_DEFAULTS.depth})`
                        : `Re-analyze moves ${fromMove}–${toMove} (depth ${stockfishDepth ?? STOCKFISH_DEFAULTS.depth})`)
                    : 'Analyze all moves'}
                </MyButton>
              )}

              {/* Progress */}
              {analyzing && (
                <MyBox title='Analyzing...'>
                  <div className='space-y-2'>
                    <div className='h-2 w-full overflow-hidden rounded bg-gray-200'>
                      <div
                        className='h-full bg-blue-500 transition-all duration-200'
                        style={{
                          width: `${analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0}%`
                        }}
                      />
                    </div>
                    <p className='text-xs text-gray-600'>
                      Move {analysisProgress.current} / {analysisProgress.total}
                      {analysisProgress.move && ` — ${analysisProgress.move}`}
                    </p>
                  </div>
                </MyBox>
              )}

              {analysisError && (
                <div>
                  <p className='text-xs text-red-600'>{analysisError}</p>
                  <MyButton onClick={runAnalysis} overrideClass='mt-2'>Retry</MyButton>
                </div>
              )}
            </div>
          </MyBox>

          {/* Position Analysis: current-position analysis, live/capped depth */}
          <MyBox title={`Position Analysis — ${currentMoveLabel}`}>
            <div className='space-y-2'>
              <div className='flex items-center gap-4'>
                <MySelect
                  label='Depth'
                  options={['20', '22', '24', '26', '28', '30', '40']}
                  value={deepAnalysisDepth === 'infinite' ? 'Infinite' : String(deepAnalysisDepth ?? STOCKFISH_DEFAULTS.deepAnalysisDepth)}
                  onChange={e => onDeepAnalysisDepthChange?.(e.target.value === 'Infinite' ? 'infinite' : parseInt(e.target.value, 10))}
                />
                <MySelect
                  label='Lines'
                  options={['3', '4', '5']}
                  value={String(deepAnalysisMultiPv ?? STOCKFISH_DEFAULTS.deepAnalysisMultiPv)}
                  onChange={e => onDeepAnalysisMultiPvChange?.(parseInt(e.target.value, 10))}
                />
              </div>
              {!deepAnalyzing && !deepAnalysisData ? (
                <MyButton onClick={startDeepAnalysis} overrideClass='w-full bg-purple-600 hover:bg-purple-700'>
                  Analyze Position
                </MyButton>
              ) : (
                <div className='space-y-1'>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-bold text-purple-700'>
                      Depth: {deepAnalysisData?.depth ?? 0}
                    </span>
                    {deepAnalyzing ? (
                      <MyButton onClick={stopDeepAnalysis} overrideClass='text-xxs bg-red-500 hover:bg-red-600'>
                        Stop
                      </MyButton>
                    ) : (
                      <MyButton onClick={startDeepAnalysis} overrideClass='text-xxs bg-purple-600 hover:bg-purple-700'>
                        Resume
                      </MyButton>
                    )}
                  </div>
                  {deepAnalysisData && (
                    <div className='text-xxs text-gray-500'>
                      {(deepAnalysisData.nodes / 1000000).toFixed(1)}M nodes
                      {' · '}
                      {(deepAnalysisData.nps / 1000).toFixed(0)}k nps
                      {' · '}
                      {(deepAnalysisData.timeMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              )}

              <AlternativeLines
                results={deepAnalysisData?.lines ?? []}
                loading={deepAnalyzing && !deepAnalysisData}
                positionPly={currentPly}
                onSelectLine={handleSelectPvLine}
                positionFen={getCurrentPositionFen()}
                username={username}
              />
            </div>
          </MyBox>

          {/* Moves From This Position: one row per move played from the current board
              position, across all tracked players — click a row to reveal its games below */}
          <MyBox title={`Moves From This Position — ${currentMoveLabel}`}>
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
                      const isSelected = selectedPositionMove === m.mov_san
                      return (
                        <tr
                          key={m.mov_san}
                          className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setSelectedPositionMove(isSelected ? null : m.mov_san)}
                        >
                          <td className='py-1 pr-2 font-mono font-medium'>{m.mov_san}</td>
                          <td className='py-1 pr-2 text-right tabular-nums'>{m.mov_times}</td>
                          <td className='py-1 pr-2 text-right tabular-nums text-green-700'>{wp}%</td>
                          <td className={`py-1 text-right tabular-nums font-mono ${m.mov_result_cp != null && m.mov_result_cp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {m.mov_result_cp != null ? formatCp(m.mov_result_cp) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </MyBox>

          {/* Games — <move>: individual games that played the clicked move, filtered
              client-side from positionGames — click a row to switch the board to that game */}
          {selectedPositionMove && (
            <MyBox title={`Games — ${getNextMoveLabel(currentPly, selectedPositionMove)}`}>
              {(() => {
                const filteredGames = positionGames.filter(g => g.move_played === selectedPositionMove)
                if (filteredGames.length === 0) {
                  return <p className='text-xs text-gray-400'>No other games reached this position.</p>
                }
                return (
                  <div className='overflow-x-auto'>
                    <table className='w-full text-xs'>
                      <thead>
                        <tr className='text-left text-gray-500 border-b border-gray-200'>
                          <th className='py-1 pr-2 text-center'>Result</th>
                          <th className='py-1 pr-2'>Date</th>
                          <th className='py-1 pr-2 text-right'>Opp Rating</th>
                          <th className='py-1 pr-2'>Termination</th>
                          <th className='py-1 pr-2 text-right'>Final Eval</th>
                          <th className='py-1 text-right'>Game</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-gray-100'>
                        {filteredGames.map((g, i) => (
                          <tr
                            key={i}
                            className={g.gameId != null ? 'cursor-pointer hover:bg-gray-50' : ''}
                            onClick={() => {
                              if (g.gameId == null) return
                              router.push(`/analyze?game=${g.gameId}&user=${g.player}&from=${encodeURIComponent(backPath)}`)
                            }}
                          >
                            <td className='py-1 pr-2 text-center'>
                              {g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : g.result === 'draw' ? 'D' : '—'}
                            </td>
                            <td className='py-1 pr-2 text-gray-500'>{g.date ?? '—'}</td>
                            <td className='py-1 pr-2 text-right tabular-nums'>{g.opponentRating ?? '—'}</td>
                            <td className='py-1 pr-2 text-gray-500'>{g.termination ?? '—'}</td>
                            <td className={`py-1 pr-2 text-right tabular-nums font-mono ${g.finalEval != null && g.finalEval < 0 ? 'text-red-600' : 'text-green-700'}`}>
                              {g.finalEval != null ? formatCp(g.finalEval) : '—'}
                            </td>
                            <td className='py-1 text-right text-gray-500'>{g.gameId ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </MyBox>
          )}
        </div>
      </div>
    </div>
  )
}
