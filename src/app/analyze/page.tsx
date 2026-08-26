'use client'

//==================================================================================================
//  1) DESCRIPTION
//    AnalyzePage — /analyze. Loads a single tracked-player game (by ?game= gdid) via getGameById,
//    reconstructs it into a ChessComGame-shaped object, attaches any already-stored Stockfish ply
//    evaluations, and renders ChessBoardView_shared, behind a Suspense boundary.
//
//    Parameters (from the URL):
//      game   — gdid of the game to load
//      player — tracked player viewing the game (also drives the shared AppShell player selection)
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import BackButton from '@/src/ui/BackButton'
import ChessBoardView_shared from '@/src/ui/board/ChessBoardView_shared'
import { ChessComGame } from '@/src/lib/chesscom'
import { getGameById, getGameEvals_player } from '@/src/lib/actions/games'
import { STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'

export default function AnalyzePage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <AnalyzeContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  AnalyzeContent — loads the game by ?game= gdid, reconstructs it into a ChessComGame-shaped
//  object with any stored ply evaluations attached, then renders ChessBoardView_shared
//----------------------------------------------------------------------------------
function AnalyzeContent() {
  const searchParams = useSearchParams()

  const gdidParam = searchParams.get('game')
  const player = searchParams.get('player') ?? ''

  const [game, setGame] = useState<ChessComGame | null>(null)
  const [gdid, setGdid] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.reanalyzeDepth)
  const [deepAnalysisDepth, setDeepAnalysisDepth] = useState<number>(STOCKFISH_DEFAULTS.deepAnalysisDepth)
  const [deepAnalysisMultiPv, setDeepAnalysisMultiPv] = useState(STOCKFISH_DEFAULTS.deepAnalysisMultiPv)

  useEffect(() => {
    if (!gdidParam) {
      setError('No game specified')
      return
    }

    async function loadGame() {
      setLoading(true)
      try {
        const row = await getGameById(parseInt(gdidParam!, 10))
        if (!row) {
          setError('Game not found')
          return
        }

        // Build a ChessComGame-shaped object from tgd_gamesdecon's flat columns —
        // gd_player_result only carries the tracked player's own result, so the
        // opposite side is derived (getPlayerResult only ever checks for 'win').
        const oppositeResult = (result: string) =>
          result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw'
        const isPlayerWhite = row.gd_player_color === 'white'

        const raw: ChessComGame = {
          url:          row.gd_game_url ?? '',
          pgn:          row.gd_pgn ?? '',
          time_control: row.gd_time_control ?? '',
          time_class:   row.gd_time_class ?? '',
          end_time:     row.gd_end_time,
          rated:        row.gd_is_rated,
          rules:        'chess',
          white: {
            username: row.gd_white_username,
            rating:   row.gd_white_rating,
            result:   isPlayerWhite ? row.gd_player_result : oppositeResult(row.gd_player_result)
          },
          black: {
            username: row.gd_black_username,
            rating:   row.gd_black_rating,
            result:   isPlayerWhite ? oppositeResult(row.gd_player_result) : row.gd_player_result
          },
          termination: row.gd_termination,
          finalEval:   row.gd_final_eval
        }

        const storedPlyEvals = await getGameEvals_player(row.gd_gdid)
        setGame({
          ...raw,
          _plyEvals: storedPlyEvals.length > 0 ? storedPlyEvals : null
        } as ChessComGame)
        setGdid(row.gd_gdid)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game')
      } finally {
        setLoading(false)
      }
    }

    loadGame()
  }, [gdidParam])

  if (loading) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-red-600 text-sm'>{error}</p>
        <div className='flex items-center justify-center gap-3'>
          <MyBackHomeNav />
          <BackButton fallback='/' />
        </div>
      </div>
    )
  }

  if (!game) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  return (
    <ChessBoardView_shared
      game={game}
      gdid={gdid}
      player={player}
      stockfishDepth={stockfishDepth}
      onStockfishDepthChange={setStockfishDepth}
      deepAnalysisDepth={deepAnalysisDepth}
      deepAnalysisMultiPv={deepAnalysisMultiPv}
      onDeepAnalysisDepthChange={setDeepAnalysisDepth}
      onDeepAnalysisMultiPvChange={setDeepAnalysisMultiPv}
    />
  )
}
