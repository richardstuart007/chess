'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyHelp } from 'nextjs-shared/MyHelp'
import PipelineHelp from '@/src/ui/analysis/PipelineHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import { getPlayers } from '@/src/lib/actions/players'
import { runGameSync } from '@/src/lib/actions/sync'
import { getPipelineStatus, refreshStep1, refreshStep3, refreshStep4, type PipelineStatus } from '@/src/lib/actions/pipelineStatus'
import { getPipelineRates } from '@/src/lib/actions/pipelineLog'
import EvalProgress from '@/src/ui/analysis/EvalProgress'

function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}

function eta(remaining: number | undefined, msPerItem: number | null): string {
  if (!remaining || !msPerItem) return ''
  const ms = remaining * msPerItem
  if (ms < 60_000)    return `~${Math.round(ms / 1_000)}s`
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)}m`
  return `~${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`
}

const SQL_STATUS_1 =
`SELECT 'tgd_gamesdecon' AS tbl, COUNT(*) FROM tgd_gamesdecon
UNION ALL
SELECT 'pending (tgr_gamesraw not yet in tgd_gamesdecon)',
  COUNT(*) FROM tgr_gamesraw r
  WHERE NOT EXISTS (
    SELECT 1 FROM tgd_gamesdecon d
    WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player
  );`

const SQL_STATUS_3 =
`SELECT 'games eligible' AS status,
  COUNT(*) FROM tgd_gamesdecon WHERE gd_pgn IS NOT NULL
UNION ALL
SELECT 'games remaining',
  COUNT(*) FROM tgd_gamesdecon d
  WHERE d.gd_pgn IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tgam_game_positions
      WHERE gam_gdid = d.gd_gdid
    )
UNION ALL SELECT 'positions',      COUNT(*) FROM tpos_positions
UNION ALL SELECT 'game-positions', COUNT(*) FROM tgam_game_positions;
-- games processed = games eligible - games remaining`

const SQL_STATUS_4 =
`SELECT 'evaluated' AS status, COUNT(*) FROM teva_evaluations
UNION ALL
SELECT 'remaining', COUNT(*) FROM tpos_positions p
LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
WHERE e.eva_evaid IS NULL;`

function StatusBadge({ complete }: { complete: boolean | null }) {
  if (complete === null) return null
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
      complete ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      {complete ? 'Completed' : 'Incomplete'}
    </span>
  )
}

export default function PipelinePage() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])

  // ── Global parameters (shared by all steps) ────────────────────────────────
  const [globalDepth,     setGlobalDepth]     = useState(16)
  const [globalBatchSize, setGlobalBatchSize] = useState(50)

  // ── Per-step status state ──────────────────────────────────────────────────
  const [s1, setS1] = useState<{ pending: number; allDecon: number } | null>(null)
  const [s3, setS3] = useState<{ allProcessed: number; allRemaining: number; allPositions: number } | null>(null)
  const [s4, setS4] = useState<{ evaluated: number; remaining: number } | null>(null)
  const [s1Loading, setS1Loading] = useState(false)
  const [s3Loading, setS3Loading] = useState(false)
  const [s4Loading, setS4Loading] = useState(false)
  const [rates, setRates] = useState<{ step2: number|null; step3: number|null; step4: number|null } | null>(null)

  async function doRefreshStep1() { setS1Loading(true); setS1(await refreshStep1()); setS1Loading(false) }
  async function doRefreshStep3() { setS3Loading(true); setS3(await refreshStep3()); setS3Loading(false) }
  async function doRefreshStep4() { setS4Loading(true); setS4(await refreshStep4()); setS4Loading(false) }

  const [refreshAllLoading, setRefreshAllLoading] = useState(false)
  async function doRefreshAll() {
    setRefreshAllLoading(true)
    setS1Loading(true); setS3Loading(true); setS4Loading(true)
    const [r1, r3, r4] = await Promise.all([
      refreshStep1(),
      refreshStep3(),
      refreshStep4(),
    ])
    setS1(r1); setS3(r3); setS4(r4)
    setS1Loading(false); setS3Loading(false); setS4Loading(false)
    setRefreshAllLoading(false)
  }

  useEffect(() => {
    async function load() {
      const ps = await getPlayers()
      setPlayers(ps)
      const [all, r] = await Promise.all([getPipelineStatus(), getPipelineRates()])
      setRates(r)
      setS1({ pending: all.pending, allDecon: all.gamesdecon })
      setS3({ allProcessed: all.treeGamesProcessed, allRemaining: all.treeGamesRemaining, allPositions: all.positions })
      const s4init = await refreshStep4()
      setS4(s4init)
    }
    load()
  }, [])

  // ── Step 1: Game Sync ──────────────────────────────────────────────────────
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ players: { username: string; inserted: number; deconstructed: number }[] } | null>(null)
  const [syncError,   setSyncError]   = useState('')

  async function handleGameSync() {
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const data = await runGameSync()
      setSyncResult(data)
      doRefreshStep1()
      getPipelineRates().then(setRates)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncRunning(false)
    }
  }

  // ── Step 2: Build Position Tree ────────────────────────────────────────────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ ok: boolean; gamesProcessed?: number; positions?: number; treeBuilt?: number; remaining?: number; errors?: number; error?: string } | null>(null)

  async function handleBuildTree() {
    setTreeRunning(true)
    setTreeResult(null)
    try {
      const params = new URLSearchParams({ limit: '0' })
      const res  = await fetch(`/api/analysis/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) { setTreeResult({ ok: false, error: data.error }); return }
      setTreeResult({ ok: true, gamesProcessed: data.gamesProcessed, positions: data.positions, treeBuilt: data.treeBuilt, remaining: data.remaining, errors: data.errors })
      doRefreshStep3()
      doRefreshStep4()
      getPipelineRates().then(setRates)
    } catch (err) {
      setTreeResult({ ok: false, error: String(err) })
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Step 3: Evaluate Positions ────────────────────────────────────────────
  const [posRunning,     setPosRunning]     = useState(false)
  const [posResult,      setPosResult]      = useState<{ processed: number; errors: number; remaining: number } | null>(null)
  const [posError,       setPosError]       = useState('')
  const [posBrowserDone, setPosBrowserDone] = useState(false)

  async function handleEvaluatePositions() {
    setPosRunning(true)
    setPosResult(null)
    setPosError('')
    try {
      // No date range — always processes date-independently, ordered by pos_reached DESC
      const params = new URLSearchParams({ depth: String(globalDepth), limit: String(globalBatchSize) })
      const res  = await fetch(`/api/analysis/evaluate-positions?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setPosResult(data)
      doRefreshStep4()
      getPipelineRates().then(setRates)
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPosRunning(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Analysis Pipeline</h2>
        <PipelineHelp />
      </div>

      {/* Global parameters — shared by all steps */}
      <MyBox>
        <div className='flex flex-wrap items-center gap-3 text-xs text-gray-600'>
          <span className='text-gray-400 font-medium'>Depth</span>
          <MyInput type='number' value={globalDepth} min={8} max={24}
            onChange={e => setGlobalDepth(Math.min(24, parseInt(e.target.value) || 16))}
            overrideClass='w-16' />
          <span className='text-gray-400 font-medium'>Batch</span>
          <MyInput type='number' value={globalBatchSize} min={1} max={1000}
            onChange={e => setGlobalBatchSize(Math.max(1, parseInt(e.target.value) || 50))}
            overrideClass='w-20' />
          <MyButton onClick={doRefreshAll} disabled={refreshAllLoading}>
            {refreshAllLoading ? 'Refreshing…' : 'Refresh All Stats'}
          </MyButton>
        </div>
      </MyBox>

      {/* Step 1 */}
      <MyBox>
        <div className='flex items-center gap-2 mb-2'>
          <h3 className='text-xs font-bold'>1. Game Sync — All Players</h3>
          <MyHelpStep
            title='1. Game Sync — All Players'
            input={['chess.com REST API — https://api.chess.com/pub/player/{username}/games/{year}/{month}']}
            processing="Downloads all new games from chess.com for every registered player. For each new game, inserts a raw record into tgr_gamesraw (full PGN + complete JSON response), then deconstructs it into tgd_gamesdecon, extracting opening name, ECO code, result, player and opponent ratings, time class and termination type. Updates each player's latest rating per time class in tplr_player_ratings. Skips games already in the database."
            output={[
              'tgr_gamesraw — one row per game per player: raw PGN and complete JSON response from chess.com',
              'tgd_gamesdecon — parsed game fields: opening name, ECO code, result, player / opponent ratings, time class, termination',
              'tplr_player_ratings — latest rating per player per time class',
            ]}
            consumers={[
              'tgd_gamesdecon → Step 2 Build Position Tree (buildPositionTree), and analysis filters (opening, ECO, time class)',
              'tplr_player_ratings → player rating lookups',
            ]}
          />
          <MyButton onClick={doRefreshStep1} disabled={s1Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s1Loading ? '…' : '↻'}</MyButton>
        </div>
        <div className='space-y-1 mb-3'>
          <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
            <span className='font-medium text-gray-400 w-8'>All</span>
            <span>tgd_gamesdecon: <strong className='text-gray-800'>{n(s1?.allDecon)}</strong></span>
            <span className='text-gray-300'>·</span>
            <span>pending: <strong className='text-gray-800'>{n(s1?.pending)}</strong></span>
            <span className='text-gray-300'>·</span>
            <StatusBadge complete={s1 === null ? null : s1.pending === 0} />
            <MyHelp label='SQL' title='Game Sync — Status SQL' text={SQL_STATUS_1} />
          </div>
        </div>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleGameSync} disabled={syncRunning}>
            {syncRunning ? 'Syncing...' : 'Run Game Sync'}
          </MyButton>
        </div>
        {syncError && <p className='text-xs text-red-600'>{syncError}</p>}
        {syncResult && (
          <div className='mt-2 text-xs text-gray-700 space-y-1'>
            {syncResult.players.map(p => (
              <div key={p.username}>
                {p.username}: {p.inserted} inserted, {p.deconstructed} deconstructed
              </div>
            ))}
          </div>
        )}
      </MyBox>

      {/* Step 2 */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>2. Build Position Tree</h3>
            <MyHelpStep
              title='2. Build Position Tree'
              input={['tgd_gamesdecon — PGN and game result for each game not yet in the position tree']}
              processing='Replays each game up to the selected move range using chess.js. Records every unique board position (FEN) reached and the move played from it. Builds a frequency model showing which positions you reach repeatedly and what you play from them. Always processes all outstanding games — skips games already processed. Repeat until games processed = 0.'
              output={[
                'tpos_positions — unique FEN positions reached across all games',
                'tgam_game_positions — per-player, per-game record: position FEN, move played (SAN + UCI), resulting FEN, move number',
              ]}
              consumers={[
                'Step 3 Evaluate Positions (enrichPositionsStockfish) — evaluates each unique FEN then bulk-updates gam_cp_change',
                'Habits / Quiz pages — aggregate from tgam_game_positions for player-specific analysis',
              ]}
            />
            <MyButton onClick={doRefreshStep3} disabled={s3Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>processed: <strong className='text-gray-800'>{n(s3?.allProcessed)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s3?.allRemaining)}</strong></span>
              {eta(s3?.allRemaining, rates?.step3 ?? null) && <span className='text-gray-400 text-xs'>{eta(s3?.allRemaining, rates?.step3 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <span>positions: <strong className='text-gray-800'>{n(s3?.allPositions)}</strong></span>
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s3 === null ? null : s3.allRemaining === 0} />
              <MyHelp label='SQL' title='Position Tree — Status SQL' text={SQL_STATUS_3} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleBuildTree} disabled={treeRunning}>
              {treeRunning ? 'Building...' : 'Build Position Tree'}
            </MyButton>
          </div>
          {treeResult && (
            <p className={`text-xs ${treeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {treeResult.ok
                ? `Done — ${treeResult.gamesProcessed} games, ${treeResult.positions} positions${treeResult.errors ? `, ${treeResult.errors} errors` : ''}${treeResult.remaining != null ? ` · ${treeResult.remaining.toLocaleString()} remaining` : ''}`
                : `Error: ${treeResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* Step 3 */}
      <MyBox>
        <div className='space-y-3'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>3. Evaluate Positions</h3>
            <MyHelpStep
              title='3. Evaluate Positions'
              input={['tpos_positions — unique FEN positions not yet in teva_evaluations']}
              processing="Evaluates each unique board position from the tree with Stockfish. Normalises the centipawn score to white's perspective and records the best move. Date-independent — always ordered by pos_reached DESC, so the most commonly reached positions across all history get evaluated first regardless of when they occurred. Run in batches; repeat until remaining = 0. Also runs unattended via a local scheduled task hitting /api/analysis/cron."
              output={['teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI notation), search depth']}
              consumers={[
                'Habits / Quiz pages — use CP scores and best moves for drill data',
              ]}
            />
            <MyButton onClick={doRefreshStep4} disabled={s4Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s4Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>evaluated: <strong className='text-gray-800'>{n(s4?.evaluated)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s4?.remaining)}</strong></span>
              {eta(s4?.remaining, rates?.step4 ?? null) && <span className='text-gray-400 text-xs'>{eta(s4?.remaining, rates?.step4 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s4 === null ? null : s4.remaining === 0} />
              <MyHelp label='SQL' title='Evaluate Positions — Status SQL' text={SQL_STATUS_4} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleEvaluatePositions} disabled={posRunning}>
              {posRunning ? 'Running...' : 'Run Server Evaluate'}
            </MyButton>
            <MyHelp label='Help' title='Server-side Evaluate' text='Evaluates positions using the native Stockfish binary on the server. Faster than browser WASM, no tab required. Processes in batches of the specified size; click again to continue until remaining = 0.' />
            <EvalProgress
              positionLimit={globalBatchSize}
              depth={globalDepth}
              onComplete={() => setPosBrowserDone(true)}
            />
          </div>
          {posError && <p className='text-xs text-red-600'>{posError}</p>}
          {posResult && (
            <p className={`text-xs ${posResult.remaining === 0 ? 'text-green-600' : 'text-blue-700'}`}>
              Server done — {posResult.processed} evaluated
              {posResult.errors > 0 ? `, ${posResult.errors} errors` : ''}
              {' · '}{posResult.remaining > 0 ? `${posResult.remaining.toLocaleString()} remaining — run again` : 'all done'}
            </p>
          )}
          {posBrowserDone && <p className='text-xs text-green-600'>Browser evaluation complete.</p>}
        </div>
      </MyBox>

    </div>
  )
}
