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
import { getPipelineStatus, refreshStep1, refreshStep3, refreshTposStatus, refreshStep4, refreshCpChangeStatus, refreshPurgeStatus, type PipelineStatus } from '@/src/lib/actions/pipelineStatus'
import { getPipelineRates } from '@/src/lib/actions/pipelineLog'
import EvalProgress from '@/src/ui/analysis/EvalProgress'
import { DEFAULT_BATCH_SIZE, MIN_REACH_TO_KEEP, PURGE_REACH_GRACE_DAYS } from '@/src/lib/constants'

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
  COUNT(*) FROM tgd_gamesdecon
UNION ALL
SELECT 'games remaining',
  COUNT(*) FROM tgd_gamesdecon d
  WHERE NOT EXISTS (
      SELECT 1 FROM tgam_game_positions
      WHERE gam_gdid = d.gd_gdid
    )
UNION ALL SELECT 'game-positions', COUNT(*) FROM tgam_game_positions;
-- games processed = games eligible - games remaining`

const SQL_STATUS_3B =
`SELECT 'positions' AS status, COUNT(*) FROM tpos_positions
UNION ALL
SELECT 'unresolved tgam rows', COUNT(*) FROM tgam_game_positions WHERE gam_pos_id IS NULL;
-- unresolved = rows syncTposFromTgam still needs to link to tpos_positions`

const SQL_STATUS_4 =
`SELECT 'evaluated' AS status, COUNT(*) FROM teva_evaluations
UNION ALL
SELECT 'remaining', COUNT(*) FROM tpos_positions p
LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
WHERE e.eva_evaid IS NULL AND p.pos_reached > ${MIN_REACH_TO_KEEP};`

const SQL_STATUS_CP =
`SELECT COUNT(*) AS pending
FROM tgam_game_positions gp
JOIN tpos_positions pb ON pb.pos_id = gp.gam_pos_id
JOIN tpos_positions pa ON pa.pos_id = gp.gam_resulting_pos_id
WHERE gp.gam_cp_change IS NULL
  AND pb.pos_reached > ${MIN_REACH_TO_KEEP} AND pa.pos_reached > ${MIN_REACH_TO_KEEP};`

const SQL_STATUS_PURGE =
`-- Exact match for purgeStaleReachOnePositions()'s candidate refinement — repeat the
-- exclusion pass below until it excludes 0 rows (a loop, not expressible as one
-- static query); this shows one representative pass.
WITH candidates AS (
  SELECT p.pos_id
  FROM tpos_positions p
  WHERE p.pos_reached <= ${MIN_REACH_TO_KEEP}
    AND NOT EXISTS (
      SELECT 1
      FROM tgam_game_positions g
      JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
      WHERE (g.gam_pos_id = p.pos_id OR g.gam_resulting_pos_id = p.pos_id)
        AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
    )
)
SELECT COUNT(*) AS eligible
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1
  FROM tgam_game_positions g
  WHERE g.gam_resulting_pos_id = c.pos_id
    AND (g.gam_pos_id IS NULL OR NOT EXISTS (SELECT 1 FROM candidates c2 WHERE c2.pos_id = g.gam_pos_id))
);`

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
  const [globalBatchSize, setGlobalBatchSize] = useState(DEFAULT_BATCH_SIZE)

  // ── Per-step status state ──────────────────────────────────────────────────
  const [s1, setS1] = useState<{ pending: number; allDecon: number } | null>(null)
  const [s3, setS3] = useState<{ allProcessed: number; allRemaining: number } | null>(null)
  const [s3b, setS3b] = useState<{ positions: number; unresolved: number } | null>(null)
  const [s4, setS4] = useState<{ evaluated: number; remaining: number } | null>(null)
  const [sCp, setSCp] = useState<{ pending: number } | null>(null)
  const [sPurge, setSPurge] = useState<{ eligible: number } | null>(null)
  const [s1Loading, setS1Loading] = useState(false)
  const [s3Loading, setS3Loading] = useState(false)
  const [s3bLoading, setS3bLoading] = useState(false)
  const [s4Loading, setS4Loading] = useState(false)
  const [sCpLoading, setSCpLoading] = useState(false)
  const [sPurgeLoading, setSPurgeLoading] = useState(false)
  const [rates, setRates] = useState<{ step1: number|null; step2: number|null; step3: number|null; step4: number|null; step5: number|null; step6: number|null } | null>(null)

  async function doRefreshStep1() { setS1Loading(true); setS1(await refreshStep1()); setS1Loading(false) }
  async function doRefreshStep3() { setS3Loading(true); setS3(await refreshStep3()); setS3Loading(false) }
  async function doRefreshStep3b() { setS3bLoading(true); setS3b(await refreshTposStatus()); setS3bLoading(false) }
  async function doRefreshStep4() { setS4Loading(true); setS4(await refreshStep4()); setS4Loading(false) }
  async function doRefreshCp() { setSCpLoading(true); setSCp(await refreshCpChangeStatus()); setSCpLoading(false) }
  async function doRefreshPurge() { setSPurgeLoading(true); setSPurge(await refreshPurgeStatus()); setSPurgeLoading(false) }

  const [refreshAllLoading, setRefreshAllLoading] = useState(false)
  async function doRefreshAll() {
    setRefreshAllLoading(true)
    setS1Loading(true); setS3Loading(true); setS3bLoading(true); setS4Loading(true); setSCpLoading(true); setSPurgeLoading(true)
    const [r1, r3, r3b, r4, rCp, rPurge] = await Promise.all([
      refreshStep1(),
      refreshStep3(),
      refreshTposStatus(),
      refreshStep4(),
      refreshCpChangeStatus(),
      refreshPurgeStatus(),
    ])
    setS1(r1); setS3(r3); setS3b(r3b); setS4(r4); setSCp(rCp); setSPurge(rPurge)
    setS1Loading(false); setS3Loading(false); setS3bLoading(false); setS4Loading(false); setSCpLoading(false); setSPurgeLoading(false)
    setRefreshAllLoading(false)
  }

  useEffect(() => {
    async function load() {
      const ps = await getPlayers()
      setPlayers(ps)
      const [all, r] = await Promise.all([getPipelineStatus(), getPipelineRates()])
      setRates(r)
      setS1({ pending: all.pending, allDecon: all.gamesdecon })
      setS3({ allProcessed: all.treeGamesProcessed, allRemaining: all.treeGamesRemaining })
      setS3b({ positions: all.positions, unresolved: all.positionsUnresolved })
      const s4init = await refreshStep4()
      setS4(s4init)
      const cpInit = await refreshCpChangeStatus()
      setSCp(cpInit)
      const purgeInit = await refreshPurgeStatus()
      setSPurge(purgeInit)
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
      const params = new URLSearchParams({ limit: String(globalBatchSize), skipSync: 'true' })
      const res  = await fetch(`/api/analysis/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) { setTreeResult({ ok: false, error: data.error }); return }
      setTreeResult({ ok: true, gamesProcessed: data.gamesProcessed, positions: data.positions, treeBuilt: data.treeBuilt, remaining: data.remaining, errors: data.errors })
      doRefreshStep3()
      doRefreshStep3b()
      getPipelineRates().then(setRates)
    } catch (err) {
      setTreeResult({ ok: false, error: String(err) })
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Step 2b: Sync Position Tree (tpos_positions) ───────────────────────────
  const [tposRunning, setTposRunning] = useState(false)
  const [tposResult,  setTposResult]  = useState<{ ok: boolean; positionsSynced?: number; error?: string } | null>(null)

  async function handleSyncTpos() {
    setTposRunning(true)
    setTposResult(null)
    try {
      const res  = await fetch('/api/analysis/sync-tpos')
      const data = await res.json()
      if (!data.ok) { setTposResult({ ok: false, error: data.error }); return }
      setTposResult({ ok: true, positionsSynced: data.positionsSynced })
      doRefreshStep3b()
      doRefreshStep4()
      getPipelineRates().then(setRates)
    } catch (err) {
      setTposResult({ ok: false, error: String(err) })
    } finally {
      setTposRunning(false)
    }
  }

  // ── Step 4: Evaluate Positions ────────────────────────────────────────────
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
      doRefreshCp()
      getPipelineRates().then(setRates)
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPosRunning(false)
    }
  }

  // ── Step 4b: Update CP Change ─────────────────────────────────────────────
  const [cpRunning, setCpRunning] = useState(false)
  const [cpResult,  setCpResult]  = useState<{ ok: boolean; updated?: number; error?: string } | null>(null)

  async function handleUpdateCp() {
    setCpRunning(true)
    setCpResult(null)
    try {
      const res  = await fetch('/api/analysis/update-cp-change')
      const data = await res.json()
      if (!data.ok) { setCpResult({ ok: false, error: data.error }); return }
      setCpResult({ ok: true, updated: data.updated })
      doRefreshCp()
    } catch (err) {
      setCpResult({ ok: false, error: String(err) })
    } finally {
      setCpRunning(false)
    }
  }

  // ── Step 3: Purge Stale Positions ─────────────────────────────────────────
  const [purgeRunning, setPurgeRunning] = useState(false)
  const [purgeResult,  setPurgeResult]  = useState<{ ok: boolean; purged?: number; error?: string } | null>(null)

  async function handlePurge() {
    setPurgeRunning(true)
    setPurgeResult(null)
    try {
      const res  = await fetch('/api/analysis/purge')
      const data = await res.json()
      if (!data.ok) { setPurgeResult({ ok: false, error: data.error }); return }
      setPurgeResult({ ok: true, purged: data.purged })
      doRefreshPurge()
      doRefreshStep3()
      doRefreshStep3b()
      doRefreshStep4()
      getPipelineRates().then(setRates)
    } catch (err) {
      setPurgeResult({ ok: false, error: String(err) })
    } finally {
      setPurgeRunning(false)
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
            <span>tgd_gamesdecon: <strong className='text-gray-800'>{n(s1?.allDecon)}</strong></span>
            <span className='text-gray-300'>·</span>
            <span>pending: <strong className='text-gray-800'>{n(s1?.pending)}</strong></span>
            {eta(s1?.pending, rates?.step1 ?? null) && <span className='text-gray-400 text-xs'>{eta(s1?.pending, rates?.step1 ?? null)}</span>}
            <span className='text-gray-300'>·</span>
            <StatusBadge complete={s1 === null ? null : s1.pending === 0} />
            <MyHelp label='SQL' title='Game Sync — Status SQL' text={SQL_STATUS_1} />
          </div>
        </div>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleGameSync} disabled={syncRunning} overrideClass={syncRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
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

      {/* Step 2a */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>2a. Build Game Positions (tgam)</h3>
            <MyHelpStep
              title='2a. Build Game Positions (tgam)'
              input={['tgd_gamesdecon — PGN and game result for each game not yet in tgam_game_positions']}
              processing='Replays each game up to the selected move range using chess.js. Writes one row per tracked-player move directly to tgam_game_positions, FEN text included — self-contained, no dependency on tpos_positions. Processes up to Batch games per run (shared batch-size input above) — skips games already processed. Repeat until games remaining = 0.'
              output={[
                'tgam_game_positions — per-player, per-game record: position FEN, move played (SAN + UCI), resulting FEN, move number',
              ]}
              consumers={[
                'Step 2b Sync Position Tree (syncTposFromTgam) — derives tpos_positions from these rows',
              ]}
            />
            <MyButton onClick={doRefreshStep3} disabled={s3Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span>processed: <strong className='text-gray-800'>{n(s3?.allProcessed)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s3?.allRemaining)}</strong></span>
              {eta(s3?.allRemaining, rates?.step2 ?? null) && <span className='text-gray-400 text-xs'>{eta(s3?.allRemaining, rates?.step2 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s3 === null ? null : s3.allRemaining === 0} />
              <MyHelp label='SQL' title='Build Game Positions — Status SQL' text={SQL_STATUS_3} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleBuildTree} disabled={treeRunning} overrideClass={treeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
              {treeRunning ? 'Building...' : 'Build Game Positions'}
            </MyButton>
          </div>
          {treeResult && (
            <p className={`text-xs ${treeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {treeResult.ok
                ? `Done — ${treeResult.gamesProcessed} games, ${treeResult.positions} game-position records${treeResult.errors ? `, ${treeResult.errors} errors` : ''}${treeResult.remaining != null ? ` · ${treeResult.remaining.toLocaleString()} remaining` : ''}`
                : `Error: ${treeResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* Step 2b */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>2b. Sync Position Tree (tpos)</h3>
            <MyHelpStep
              title='2b. Sync Position Tree (tpos)'
              input={['tgam_game_positions — rows with gam_pos_id / gam_resulting_pos_id still NULL']}
              processing='Idempotent derivation of tpos_positions from tgam_game_positions (syncTposFromTgam): inserts any tpos_positions row still missing for a referenced FEN, backfills gam_pos_id/gam_resulting_pos_id by FEN match, then recomputes pos_reached only for positions just touched. Safe to re-run any time — self-scoping via the NULL markers, never rescans already-resolved rows.'
              output={[
                'tpos_positions — unique FEN positions, with pos_reached',
                'tgam_game_positions.gam_pos_id / gam_resulting_pos_id — backfilled',
              ]}
              consumers={[
                'Step 4 Evaluate Positions (enrichPositionsStockfish) — evaluates each unique FEN',
                'Habits / Quiz pages — aggregate from tgam_game_positions for player-specific analysis',
              ]}
            />
            <MyButton onClick={doRefreshStep3b} disabled={s3bLoading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3bLoading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span>positions: <strong className='text-gray-800'>{n(s3b?.positions)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>unresolved: <strong className='text-gray-800'>{n(s3b?.unresolved)}</strong></span>
              {eta(s3b?.unresolved, rates?.step3 ?? null) && <span className='text-gray-400 text-xs'>{eta(s3b?.unresolved, rates?.step3 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s3b === null ? null : s3b.unresolved === 0} />
              <MyHelp label='SQL' title='Sync Position Tree — Status SQL' text={SQL_STATUS_3B} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleSyncTpos} disabled={tposRunning} overrideClass={tposRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
              {tposRunning ? 'Syncing...' : 'Sync Position Tree'}
            </MyButton>
          </div>
          {tposResult && (
            <p className={`text-xs ${tposResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {tposResult.ok
                ? `Done — ${tposResult.positionsSynced} positions synced`
                : `Error: ${tposResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* Step 3 */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>3. Purge Stale Positions</h3>
            <MyHelpStep
              title='3. Purge Stale Positions'
              input={['tpos_positions — pos_reached <= MIN_REACH_TO_KEEP, all occurrences older than PURGE_REACH_GRACE_DAYS']}
              processing='Deletes low-value positions once they age past the grace period without repeating: teva_evaluations, then tgam_game_positions (dual-reference rule), then tpos_positions itself. Stamps tgd_gamesdecon.gd_positions_purged on any game left with zero tgam rows — resurrection guard so Build Game Positions never reprocesses a purged game. Runs before Evaluate Positions so Stockfish time is never spent on positions about to be deleted. Also runs unattended via /api/analysis/cron. Deliberate exception to the "no destructive SQL in automation" rule — see .claude/CLAUDE.md.'
              output={[
                'teva_evaluations / tgam_game_positions / tpos_positions — rows removed',
                'tgd_gamesdecon.gd_positions_purged — set true on emptied games',
              ]}
              consumers={[
                'Step 2a Build Game Positions — respects gd_positions_purged so purged games are never resurrected',
              ]}
            />
            <MyButton onClick={doRefreshPurge} disabled={sPurgeLoading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sPurgeLoading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span>eligible now: <strong className='text-gray-800'>{n(sPurge?.eligible)}</strong></span>
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={sPurge === null ? null : sPurge.eligible === 0} />
              <MyHelp label='SQL' title='Purge Stale Positions — Status SQL' text={SQL_STATUS_PURGE} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handlePurge} disabled={purgeRunning} overrideClass={purgeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
              {purgeRunning ? 'Purging...' : 'Run Purge'}
            </MyButton>
          </div>
          {purgeResult && (
            <p className={`text-xs ${purgeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {purgeResult.ok ? `Done — ${purgeResult.purged} positions purged` : `Error: ${purgeResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* Step 4 */}
      <MyBox>
        <div className='space-y-3'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>4. Evaluate Positions</h3>
            <MyHelpStep
              title='4. Evaluate Positions'
              input={['tpos_positions — unique FEN positions not yet in teva_evaluations, pos_reached > MIN_REACH_TO_KEEP']}
              processing="Evaluates each unique board position from the tree with Stockfish, skipping positions with pos_reached <= MIN_REACH_TO_KEEP (they're purge candidates, so evaluating them risks wasted work). Normalises the centipawn score to white's perspective and records the best move. Date-independent — always ordered by pos_reached DESC, so the most commonly reached positions across all history get evaluated first regardless of when they occurred. Run in batches; repeat until remaining = 0. Also runs unattended via a local scheduled task hitting /api/analysis/cron."
              output={['teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI notation), search depth']}
              consumers={[
                'Habits / Quiz pages — use CP scores and best moves for drill data',
              ]}
            />
            <MyButton onClick={doRefreshStep4} disabled={s4Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s4Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
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
            <MyButton onClick={handleEvaluatePositions} disabled={posRunning} overrideClass={posRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
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

      {/* Step 4b */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>4b. Update CP Change</h3>
            <MyHelpStep
              title='4b. Update CP Change'
              input={['tgam_game_positions — gam_cp_change still NULL, whose before/after positions both now have a teva_evaluations row']}
              processing="Computes gam_cp_change (centipawn loss from the tracked player's perspective) for each move once both its before and after positions have been evaluated. Scoped to gam_cp_change IS NULL — never re-touches already-computed rows. Decoupled from Evaluate Positions so it has its own trigger and status; also runs unattended via /api/analysis/cron."
              output={['tgam_game_positions.gam_cp_change — per-move centipawn loss, computed']}
              consumers={[
                'Habits / Quiz pages — CP loss per move for drill data',
              ]}
            />
            <MyButton onClick={doRefreshCp} disabled={sCpLoading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sCpLoading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span>to be updated: <strong className='text-gray-800'>{n(sCp?.pending)}</strong></span>
              {eta(sCp?.pending, rates?.step6 ?? null) && <span className='text-gray-400 text-xs'>{eta(sCp?.pending, rates?.step6 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={sCp === null ? null : sCp.pending === 0} />
              <MyHelp label='SQL' title='Update CP Change — Status SQL' text={SQL_STATUS_CP} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleUpdateCp} disabled={cpRunning} overrideClass={cpRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}>
              {cpRunning ? 'Updating...' : 'Update CP Change'}
            </MyButton>
          </div>
          {cpResult && (
            <p className={`text-xs ${cpResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {cpResult.ok ? `Done — ${cpResult.updated} rows updated` : `Error: ${cpResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

    </div>
  )
}
