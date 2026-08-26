'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterGameView_master — board/move-list view for one synced master game, plus a Stockfish
//    analysis panel. On mount, hydrates any already-computed evaluations from
//    tmgev_game_evals (this game's own durable cache, secondary database) and the primary
//    database's shared tpos_positions/tpose_positions_eval cache — no Stockfish is run
//    automatically. "Analyze Game" runs Stockfish only for whatever isn't already cached, then
//    persists the full result back to tmgev_game_evals.
//
//    Parameters:
//      row — the master game row to display
//
//  2) NOTES
//    Read-only lookups against tpos_positions/tpose_positions_eval
//    (getPositionEvaluationsBulk_shared) and top-up-only writes via
//    upgradePositionEvaluation_shared (createIfMissing:false, inside
//    saveMasterGameEvaluations_master) are allowed — a master game may benefit from, and deepen,
//    a position the tracked player has already reached, but never creates a new tpos_positions
//    row of its own. Still never imports the chessdb_player functions (player-scoped joins into
//    tgam_game_positions/tgd_gamesdecon — no player context here) or anything that would create a
//    new tpos_positions row. See PLAN_master-games-fen-eval-reuse for the full design discussion.
//    Still missing, relative to ChessBoardView_shared, the draggable board, deep/infinite
//    analysis panel, and Chess.com Games search panel — a deliberately deferred follow-up, not a
//    silent cut (see the project's .claude/CLAUDE.md Outstanding items).
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
//==================================================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { getMastersExplorer, LichessExplorerResponse } from '@/src/lib/actions/lichess'
import { StockfishEngine, PlyEvaluation, STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'
import { MoveNode, AnalysisTree, buildTree, replayToNode, findMainLineAncestor, isOnMainLine } from '@/src/lib/analysisTree'
import { getPositionEvaluationsBulk_shared, upgradePositionEvaluation_shared } from '@/src/lib/analysis/chessdb_shared'
import { getMasterGameEvals_master, saveMasterGameEvaluations_master } from '@/src/lib/master/masterGamesList'
import { truncateFen } from '@/src/lib/fen'
import MoveTree_shared from './MoveTree_shared'
import GameAnalysisPanel_shared from './GameAnalysisPanel_shared'
import MasterMovesDbPanel from './MasterMovesDbPanel'
import MasterGamesDbPanel from './MasterGamesDbPanel'

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

export default function MasterGameView_master({ row }: MasterGameViewProps) {
  const playerColor = row.mgd_player_color
  const result = row.mgd_player_result

  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)
  const [boardKey, setBoardKey] = useState(0)
  const [mastersData, setMastersData] = useState<LichessExplorerResponse | null>(null)
  const [selectedMastersMove, setSelectedMastersMove] = useState<string | null>(null)
  const displayGame = useRef(new Chess())

  // Stockfish analysis — hydrated from tmgev_game_evals/tpose_positions_eval on mount,
  // persisted back to tmgev_game_evals after each run
  const [plyEvals, setPlyEvals] = useState<(PlyEvaluation | undefined)[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResultMessage, setAnalysisResultMessage] = useState('')
  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.reanalyzeDepth)
  const engineRef = useRef<StockfishEngine | null>(null)

  // Re-analyze move range (full move numbers, White-anchored) — defaults to the whole game
  const [fromMove, setFromMove] = useState(1)
  const [toMove, setToMove] = useState(1)

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
  // Master-level game stats for whatever position is currently on the board, from the
  // Lichess Masters Opening Explorer — external API, no dependency on this project's own DB.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const fen = currentNode?.fen
    if (!fen) { setMastersData(null); return }
    let cancelled = false
    getMastersExplorer(fen).then(data => {
      if (!cancelled) setMastersData(data)
    }).catch(() => { if (!cancelled) setMastersData(null) })
    return () => { cancelled = true }
  }, [currentNode])

  // -----------------------------------------------------------------------
  // Run full-game Stockfish analysis. On re-analysis (plyEvals already exist), only
  // the selected From/To move range is (re-)analyzed — existing plyEvals outside that
  // range are preserved, both in state and in tmgev_game_evals. Mirrors
  // ChessBoardView's player-side runAnalysis exactly, except every
  // upgradePositionEvaluation call here keeps createIfMissing:false (never creates a
  // new tpos_positions row) where the player side uses true, and there's no
  // refreshPositionPanels equivalent — MasterMovesDbPanel/MasterGamesDbPanel read from
  // tmpos_positions/tmgam_game_positions, unrelated to Stockfish eval data.
  // -----------------------------------------------------------------------
  async function runAnalysis() {
    if (!tree) return
    setAnalyzing(true)
    setAnalysisError('')
    setAnalysisResultMessage('')

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

      const poseEvals = await getPositionEvaluationsBulk_shared(fens)

      // Skip overwriting any ply whose existing depth is already >= this run's depth —
      // mirrors tpose_positions_eval's own guard, so re-analyzing at a shallower depth
      // never downgrades a ply saved deeper previously.
      const mergedPlyEvals = [...plyEvals]
      let updatedPlies = 0
      let skippedPlies = 0

      const { finalPosition } = await engine.analyzeGame(
        fens, sans,
        progress => setAnalysisProgress(progress),
        stockfishDepth,
        poseEvals,
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
          upgradePositionEvaluation_shared({ fen: plyEval.fenBefore, cp: plyEval.cpBefore, bestMove: plyEval.bestMove, depth: plyEval.depth, createIfMissing: false })
            .catch(() => {
              // Non-critical — a failed top-up doesn't block the rest
            })
        }
      )

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

      // Save the full merged plyEvals to DB — saveMasterGameEvaluations_master deletes and
      // re-inserts by array position, so a partial array would wipe out the plyEvals
      // for every move outside the re-analyzed range
      try {
        await saveMasterGameEvaluations_master(row.mgd_mgdid, mergedPlyEvals)
      } catch {
        // Non-critical — DB save failure doesn't block UI
      }

      // The range's final resulting position is never any ply's "before" position
      // (nothing after it in this run), so it needs its own explicit upgrade call —
      // everything else was already upgraded live, ply by ply, above.
      const finalPoseEval = poseEvals[truncateFen(finalPosition.fen)]
      if (!finalPoseEval || finalPoseEval.depth < stockfishDepth) {
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

  const onMainLine = !currentNode || isOnMainLine(currentNode)

  // Full move numbers for the re-analyze range selector
  const totalFullMoves = tree ? Math.max(1, Math.ceil(tree.mainLine.length / 2)) : 1

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

  if (!tree) return null

  return (
    <div className='flex flex-wrap gap-4 items-start'>
      <MyBackHomeNav backPath='/mastergames' backLabel='Masters Games' />

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

        {/* Board (read-only — no dragging) */}
        <Chessboard
          key={boardKey}
          options={{
            position: displayGame.current.fen(),
            boardStyle: { width: '480px', height: '480px' },
            allowDragging: false,
            boardOrientation: playerColor === 'black' ? 'black' : 'white'
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

        {/* Game info */}
        <div className='flex items-center gap-3 text-xxs text-gray-500 px-1'>
          <span>Game #{row.mgd_mgdid}</span>
          <span>{formatGameDate(row.mgd_end_time)}</span>
          {row.mgd_termination && <span>{row.mgd_termination}</span>}
          {row.mgd_opening_name && <span>{row.mgd_opening_name} {row.mgd_eco_code ? `(${row.mgd_eco_code})` : ''}</span>}
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
          analysisResultMessage={analysisResultMessage}
          analysisError={analysisError}
        />
      </div>

      <div className='space-y-4 w-[600px]'>
        <MyBox title='Moves'>
          <MoveTree_shared tree={tree} currentNode={currentNode} onSelectNode={goToNode} />
        </MyBox>

        {currentNode && (
          <div className='pt-2 border-t border-gray-200 space-y-4'>
            <p className='text-xxs font-semibold text-gray-400 uppercase tracking-wide'>From our own synced master games</p>
            <MasterMovesDbPanel fen={currentNode.fen} />
            <MasterGamesDbPanel fen={currentNode.fen} />
          </div>
        )}

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
                                <a href={`https://lichess.org/${g.id}`} target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:underline'>
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
