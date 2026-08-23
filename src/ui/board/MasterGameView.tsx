'use client'

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
import MoveTree from './MoveTree'
import DepthInput from './DepthInput'

//----------------------------------------------------------------------------------------------
//  MasterGameView — board/move-list view for one synced master game, plus a live, unsaved
//  Stockfish analysis panel (StockfishEngine.analyzeGame is pure client-side computation — no
//  DB read/write at all, so results exist only in this component's own state and are recomputed
//  on every visit). Deliberately never imports saveGameEvaluations/upgradePositionEvaluation/
//  getMovePlayCounts/fetchGamesForPosition — those write into or read from the tracked player's
//  own primary-database position tree, which a master game has no business touching. This
//  component is structurally incapable of it, not just gated by a flag. See
//  PLAN_table-layer-and-master-games (task 6) for the full reasoning.
//----------------------------------------------------------------------------------------------
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

function formatGameDate(endTime: number): string {
  const date = new Date(endTime * 1000)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

export default function MasterGameView({ row }: MasterGameViewProps) {
  const playerColor = row.mgd_player_color
  const result = row.mgd_player_result

  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)
  const [boardKey, setBoardKey] = useState(0)
  const [mastersData, setMastersData] = useState<LichessExplorerResponse | null>(null)
  const [selectedMastersMove, setSelectedMastersMove] = useState<string | null>(null)
  const displayGame = useRef(new Chess())

  // Live Stockfish analysis — never saved anywhere, recomputed fresh every visit
  const [plyEvals, setPlyEvals] = useState<(PlyEvaluation | undefined)[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.reanalyzeDepth)
  const engineRef = useRef<StockfishEngine | null>(null)

  // -----------------------------------------------------------------------
  // Parse PGN on mount → build a plain main-line tree, no Stockfish evals
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

    setTree(buildTree(history, fens, []))
    setCurrentNode(null)
    setPlyEvals([])
    setAnalysisError('')
    displayGame.current = new Chess()
    setBoardKey(k => k + 1)
  }, [row])

  // -----------------------------------------------------------------------
  // Run full-game Stockfish analysis — StockfishEngine.analyzeGame is pure client-side
  // computation, no DB cache passed in (nothing to check) and no save afterward. Results
  // live only in plyEvals/tree state for this session.
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
      }

      const fens = [tree.root.fen, ...tree.mainLine.map(n => n.fen)]
      const sans = tree.mainLine.map(n => n.san)

      const mergedPlyEvals: (PlyEvaluation | undefined)[] = []
      await engine.analyzeGame(
        fens, sans,
        progress => setAnalysisProgress(progress),
        stockfishDepth,
        undefined,
        (plyEval, i) => {
          mergedPlyEvals[i] = plyEval
          tree.mainLine[i].evaluation = plyEval
          setPlyEvals([...mergedPlyEvals])
          setTree({ ...tree })
        }
      )
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

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

  const onMainLine = !currentNode || isOnMainLine(currentNode)
  const blunders = plyEvals.filter(e => e?.classification === 'blunder').length
  const mistakes = plyEvals.filter(e => e?.classification === 'mistake').length
  const inaccuracies = plyEvals.filter(e => e?.classification === 'inaccuracy').length

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

        {/* Game Analysis — live Stockfish, never saved */}
        <MyBox title='Game Analysis'>
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              {plyEvals.length > 0 ? (
                <div className='flex gap-2 text-xs'>
                  <span className='rounded bg-red-500 px-2 py-0.5 text-white'>{blunders} blunders</span>
                  <span className='rounded bg-orange-500 px-2 py-0.5 text-white'>{mistakes} mistakes</span>
                  <span className='rounded bg-yellow-400 px-2 py-0.5 text-black'>{inaccuracies} inaccuracies</span>
                </div>
              ) : (
                <span className='text-xs text-gray-400'>No analysis yet</span>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <DepthInput value={stockfishDepth} onChange={setStockfishDepth} />
              <MyButton onClick={runAnalysis} disabled={analyzing} overrideClass='text-xs'>
                {analyzing ? `Analyzing ${analysisProgress.current}/${analysisProgress.total}...` : 'Analyze Game'}
              </MyButton>
            </div>
            {analysisError && <p className='text-xs text-red-600'>{analysisError}</p>}
          </div>
        </MyBox>
      </div>

      <div className='space-y-4 w-[360px]'>
        <MyBox title='Moves'>
          <MoveTree tree={tree} currentNode={currentNode} onSelectNode={goToNode} />
        </MyBox>

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
