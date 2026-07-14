'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyButton } from 'nextjs-shared/MyButton'
import ChessBoardView from '@/src/ui/board/ChessBoardView'
import { ChessComGame } from '@/src/lib/chesscom'
import { getGameById, getGameEvals } from '@/src/lib/actions/games'
import { STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'

function AnalyzeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const gdidParam = searchParams.get('game')
  const username = searchParams.get('user') ?? ''
  const isFree = searchParams.get('mode') === 'free'
  const startFen = searchParams.get('fen') ?? undefined

  const [game, setGame] = useState<ChessComGame | null>(null)
  const [gdid, setGdid] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.depth)
  const [deepAnalysisDepth, setDeepAnalysisDepth] = useState<number | 'infinite'>(STOCKFISH_DEFAULTS.deepAnalysisDepth)
  const [deepAnalysisMultiPv, setDeepAnalysisMultiPv] = useState(STOCKFISH_DEFAULTS.deepAnalysisMultiPv)

  useEffect(() => {
    if (isFree) return

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
          }
        }

        const storedEvals = await getGameEvals(row.gd_gdid)
        setGame({
          ...raw,
          _evaluations: storedEvals.length > 0 ? storedEvals : null
        } as ChessComGame)
        setGdid(row.gd_gdid)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game')
      } finally {
        setLoading(false)
      }
    }

    loadGame()
  }, [gdidParam, isFree])

  function handleBack() {
    const from = searchParams.get('from')
    router.push(from ? decodeURIComponent(from) : (gdidParam ? `/?highlight=${gdidParam}` : '/'))
  }

  if (loading) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-red-600 text-sm'>{error}</p>
        <MyButton onClick={handleBack} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-500 underline mt-2'>
          Back to games
        </MyButton>
      </div>
    )
  }

  return (
    <ChessBoardView
      game={isFree ? undefined : (game ?? undefined)}
      gdid={gdid}
      username={username}
      startFen={isFree ? startFen : undefined}
      stockfishDepth={stockfishDepth}
      onStockfishDepthChange={setStockfishDepth}
      deepAnalysisDepth={deepAnalysisDepth}
      deepAnalysisMultiPv={deepAnalysisMultiPv}
      onDeepAnalysisDepthChange={setDeepAnalysisDepth}
      onDeepAnalysisMultiPvChange={setDeepAnalysisMultiPv}
      onBack={handleBack}
    />
  )
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <AnalyzeContent />
    </Suspense>
  )
}
