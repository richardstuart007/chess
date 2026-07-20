'use client'

import { useState, useEffect, Fragment } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyHelp } from 'nextjs-shared/MyHelp'
import PipelineHelp from '@/src/ui/analysis/PipelineHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import { getPlayers } from '@/src/lib/actions/players'
import { runGameSync } from '@/src/lib/actions/sync'
import { getPipelineStatus, refreshStep1, refreshStep3, refreshTposStatus, refreshStep4, refreshCpChangeStatus, refreshPurgeStatus, refreshHabitsStatus, refreshGameEndingsStatus, refreshDeepenPopularStatus, type PipelineStatus } from '@/src/lib/actions/pipelineStatus'
import { getPipelineRates, getLatestPipelineRuns, getRecentRunIds } from '@/src/lib/actions/pipelineLog'
import { DEFAULT_BATCH_SIZE, MIN_REACH_TO_KEEP, PURGE_REACH_GRACE_DAYS, MIN_ANALYSIS_MOVE, HABITS_MIN_REACH_FLOOR } from '@/src/lib/constants'

type LatestRun = {
  pip_step:         number
  pip_sub_step:     string
  pip_step_name:    string
  pip_created:      string
  pip_run_id:       number
  pip_input_table:  string
  pip_input_recs:   number
  pip_output_table: string
  pip_output_recs:  number
  pip_duration_ms:  number
}

//
//  Job group order matches the scheduled cron order in vercel.json (3:00am-5:00am, 20min apart). Each group
//  is one scheduled/schedulable macro step; its subJobs are the individual table-writes
//  within it, run together and sharing one pip_run_id.
//
const JOB_GROUPS: {
  step: number
  groupLabel: string
  schedule: string
  subJobs: { subStep: string; label: string }[]
}[] = [
  { step: 1, groupLabel: 'Game Sync', schedule: '3:00am', subJobs: [
      { subStep: 'a', label: 'Query chess.com API' },
      { subStep: 'b', label: 'Fetch & Insert Raw Games' },
      { subStep: 'c', label: 'Deconstruct Games' },
      { subStep: 'd', label: 'Update Player Ratings' },
    ] },
  { step: 2, groupLabel: 'Build Position Tree', schedule: '3:20am', subJobs: [
      { subStep: 'a', label: 'Build Position Tree' },
    ] },
  { step: 3, groupLabel: 'Sync Position Tree', schedule: '3:40am', subJobs: [
      { subStep: 'a', label: 'Sync tpos_positions' },
      { subStep: 'b', label: 'Backfill tgam ids' },
    ] },
  { step: 4, groupLabel: 'Purge Stale Positions', schedule: '4:00am', subJobs: [
      { subStep: 'a', label: 'Purge teva_evaluations' },
      { subStep: 'b', label: 'Purge tgam_game_positions' },
      { subStep: 'c', label: 'Purge tpos_positions' },
      { subStep: 'd', label: 'Purge tgd_gamesdecon guard' },
    ] },
  { step: 5, groupLabel: 'Evaluate Positions', schedule: '4:20am', subJobs: [
      { subStep: 'a', label: 'Evaluate Positions' },
    ] },
  { step: 6, groupLabel: 'Update CP Change', schedule: '4:40am', subJobs: [
      { subStep: 'a', label: 'Update CP Change' },
    ] },
  { step: 7, groupLabel: 'Build Habits', schedule: '5:00am', subJobs: [
      { subStep: 'a', label: 'Build Habits' },
    ] },
  { step: 8, groupLabel: 'Evaluate Game Endings', schedule: '5:20am', subJobs: [
      { subStep: 'a', label: 'Evaluate Game Endings' },
    ] },
  { step: 9, groupLabel: 'Deepen Popular Positions', schedule: '5:40am', subJobs: [
      { subStep: 'a', label: 'Deepen Popular Positions' },
    ] },
]

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
`SELECT COUNT(*) AS pending FROM tgr_gamesraw r
WHERE NOT EXISTS (
  SELECT 1 FROM tgd_gamesdecon d
  WHERE d.gd_chesscom_uuid = r.gr_chesscom_uuid AND d.gd_player = r.gr_player
);`

const SQL_STATUS_3 =
`SELECT COUNT(*) AS remaining
FROM tgd_gamesdecon d
WHERE NOT EXISTS (
  SELECT 1 FROM tgam_game_positions
  WHERE gam_gdid = d.gd_gdid
);`

const SQL_STATUS_3B =
`SELECT COUNT(*) AS unresolved FROM tgam_game_positions WHERE gam_pos_id IS NULL;`

const SQL_STATUS_4 =
`SELECT COUNT(*) AS remaining FROM tpos_positions p
LEFT JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
WHERE e.eva_evaid IS NULL AND p.pos_reached > ${MIN_REACH_TO_KEEP};`

const SQL_STATUS_CP =
`SELECT COUNT(*) AS pending
FROM tgam_game_positions gp
JOIN tpos_positions pb ON pb.pos_id = gp.gam_pos_id
JOIN tpos_positions pa ON pa.pos_id = gp.gam_resulting_pos_id
WHERE gp.gam_cp_change IS NULL
  AND pb.pos_reached > ${MIN_REACH_TO_KEEP} AND pa.pos_reached > ${MIN_REACH_TO_KEEP};`

const SQL_STATUS_HABITS =
`WITH candidates AS (
  SELECT d.gd_player AS player, gp.gam_pos_id AS pos_id, gp.gam_move_played AS move_san
  FROM tgam_game_positions gp
  JOIN tgd_gamesdecon d ON d.gd_gdid = gp.gam_gdid
  JOIN tpos_positions p ON p.pos_id = gp.gam_pos_id
  WHERE gp.gam_move_num >= ${MIN_ANALYSIS_MOVE}
    AND p.pos_color = CASE WHEN d.gd_player_color = 'white' THEN 'w' ELSE 'b' END
  GROUP BY d.gd_player, gp.gam_pos_id, gp.gam_move_played
  HAVING COUNT(*) >= ${HABITS_MIN_REACH_FLOOR}
)
SELECT
  (SELECT COUNT(*) FROM thab_habits) AS total,
  (SELECT COUNT(*) FROM thab_habits WHERE hab_dismissed) AS dismissed,
  (SELECT COUNT(*) FROM candidates c
   LEFT JOIN thab_habits h
     ON h.hab_player = c.player AND h.hab_pos_id = c.pos_id AND h.hab_move_san = c.move_san
   WHERE h.hab_habid IS NULL) AS remaining;`

const SQL_STATUS_GAME_ENDINGS =
`SELECT COUNT(*) AS remaining FROM tgd_gamesdecon WHERE gd_final_eval IS NULL;`

const SQL_STATUS_DEEPEN_POPULAR =
`SELECT
  CASE
    WHEN p.pos_reached >= 50 THEN '50+ (depth 30)'
    WHEN p.pos_reached >= 30 THEN '30-49 (depth 24)'
    WHEN p.pos_reached >= 10 THEN '10-29 (depth 22)'
  END AS tier,
  COUNT(*) AS remaining
FROM tpos_positions p
JOIN teva_evaluations e ON e.eva_pos_id = p.pos_id
WHERE p.pos_reached >= 10
  AND e.eva_depth < CASE
    WHEN p.pos_reached >= 50 THEN 30
    WHEN p.pos_reached >= 30 THEN 24
    WHEN p.pos_reached >= 10 THEN 22
  END
GROUP BY tier
ORDER BY MIN(p.pos_reached) DESC;`

const SQL_STATUS_PURGE =
`SELECT COUNT(*) AS eligible
FROM tpos_positions p
WHERE p.pos_reached <= ${MIN_REACH_TO_KEEP}
  AND NOT EXISTS (
    SELECT 1
    FROM tgam_game_positions g
    JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
    WHERE g.gam_pos_id = p.pos_id
      AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
  )
  AND NOT EXISTS (
    SELECT 1
    FROM tgam_game_positions g
    JOIN tgd_gamesdecon d ON d.gd_gdid = g.gam_gdid
    WHERE g.gam_resulting_pos_id = p.pos_id
      AND d.gd_end_time > EXTRACT(EPOCH FROM (NOW() - INTERVAL '${PURGE_REACH_GRACE_DAYS} days'))::integer
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
  const [sHabits, setSHabits] = useState<{ total: number; dismissed: number; remaining: number } | null>(null)
  const [sGameEndings, setSGameEndings] = useState<{ evaluated: number; remaining: number } | null>(null)
  const [sDeepenPopular, setSDeepenPopular] = useState<{ remaining: number } | null>(null)
  const [s1Loading, setS1Loading] = useState(false)
  const [s3Loading, setS3Loading] = useState(false)
  const [s3bLoading, setS3bLoading] = useState(false)
  const [s4Loading, setS4Loading] = useState(false)
  const [sCpLoading, setSCpLoading] = useState(false)
  const [sPurgeLoading, setSPurgeLoading] = useState(false)
  const [sHabitsLoading, setSHabitsLoading] = useState(false)
  const [sGameEndingsLoading, setSGameEndingsLoading] = useState(false)
  const [sDeepenPopularLoading, setSDeepenPopularLoading] = useState(false)
  const [rates, setRates] = useState<{ step1: number|null; step2: number|null; step3: number|null; step4: number|null; step5: number|null; step6: number|null; step8: number|null; step9: number|null } | null>(null)
  const [runs, setRuns] = useState<LatestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runAllRunning, setRunAllRunning] = useState(false)
  const [recentRunIds, setRecentRunIds] = useState<number[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  async function doRefreshRuns() {
    setRunsLoading(true)
    const ids = await getRecentRunIds()
    setRecentRunIds(ids)
    const latestId = ids[0] ?? null
    setSelectedRunId(latestId)
    setRuns(await getLatestPipelineRuns(latestId ?? undefined))
    setRunsLoading(false)
  }

  async function handleSelectRunId(runId: number) {
    setSelectedRunId(runId)
    setRunsLoading(true)
    setRuns(await getLatestPipelineRuns(runId))
    setRunsLoading(false)
  }
  async function doRefreshStep1() { setS1Loading(true); setS1(await refreshStep1()); setS1Loading(false) }
  async function doRefreshStep3() { setS3Loading(true); setS3(await refreshStep3()); setS3Loading(false) }
  async function doRefreshStep3b() { setS3bLoading(true); setS3b(await refreshTposStatus()); setS3bLoading(false) }
  async function doRefreshStep4() { setS4Loading(true); setS4(await refreshStep4()); setS4Loading(false) }
  async function doRefreshCp() { setSCpLoading(true); setSCp(await refreshCpChangeStatus()); setSCpLoading(false) }
  async function doRefreshPurge() { setSPurgeLoading(true); setSPurge(await refreshPurgeStatus()); setSPurgeLoading(false) }
  async function doRefreshHabits() { setSHabitsLoading(true); setSHabits(await refreshHabitsStatus()); setSHabitsLoading(false) }
  async function doRefreshGameEndings() { setSGameEndingsLoading(true); setSGameEndings(await refreshGameEndingsStatus()); setSGameEndingsLoading(false) }
  async function doRefreshDeepenPopular() { setSDeepenPopularLoading(true); setSDeepenPopular(await refreshDeepenPopularStatus()); setSDeepenPopularLoading(false) }

  const [refreshAllLoading, setRefreshAllLoading] = useState(false)
  async function doRefreshAll() {
    setRefreshAllLoading(true)
    setS1Loading(true); setS3Loading(true); setS3bLoading(true); setS4Loading(true); setSCpLoading(true); setSPurgeLoading(true); setSHabitsLoading(true); setSGameEndingsLoading(true); setSDeepenPopularLoading(true)
    const [r1, r3, r3b, r4, rCp, rPurge, rHabits, rGameEndings, rDeepenPopular] = await Promise.all([
      refreshStep1(),
      refreshStep3(),
      refreshTposStatus(),
      refreshStep4(),
      refreshCpChangeStatus(),
      refreshPurgeStatus(),
      refreshHabitsStatus(),
      refreshGameEndingsStatus(),
      refreshDeepenPopularStatus(),
    ])
    setS1(r1); setS3(r3); setS3b(r3b); setS4(r4); setSCp(rCp); setSPurge(rPurge); setSHabits(rHabits); setSGameEndings(rGameEndings); setSDeepenPopular(rDeepenPopular)
    setS1Loading(false); setS3Loading(false); setS3bLoading(false); setS4Loading(false); setSCpLoading(false); setSPurgeLoading(false); setSHabitsLoading(false); setSGameEndingsLoading(false); setSDeepenPopularLoading(false)
    doRefreshRuns()
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
      const habitsInit = await refreshHabitsStatus()
      setSHabits(habitsInit)
      const gameEndingsInit = await refreshGameEndingsStatus()
      setSGameEndings(gameEndingsInit)
      const deepenPopularInit = await refreshDeepenPopularStatus()
      setSDeepenPopular(deepenPopularInit)
      const ids = await getRecentRunIds()
      setRecentRunIds(ids)
      const latestId = ids[0] ?? null
      setSelectedRunId(latestId)
      setRuns(await getLatestPipelineRuns(latestId ?? undefined))
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
      doRefreshRuns()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncRunning(false)
    }
  }

  // ── Step 2: Build Position Tree ────────────────────────────────────────────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ ok: boolean; gamesProcessed?: number; positions?: number; treeBuilt?: number; remaining?: number; errors?: number; error?: string } | null>(null)

  async function handleBuildTree(forceNewRun: boolean = true) {
    setTreeRunning(true)
    setTreeResult(null)
    try {
      const params = new URLSearchParams({ limit: String(globalBatchSize), skipSync: 'true' })
      if (forceNewRun) params.set('newRun', 'true')
      const res  = await fetch(`/api/analysis/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) { setTreeResult({ ok: false, error: data.error }); return }
      setTreeResult({ ok: true, gamesProcessed: data.gamesProcessed, positions: data.positions, treeBuilt: data.treeBuilt, remaining: data.remaining, errors: data.errors })
      doRefreshStep3()
      doRefreshStep3b()
      getPipelineRates().then(setRates)
      doRefreshRuns()
    } catch (err) {
      setTreeResult({ ok: false, error: String(err) })
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Step 2b: Sync Position Tree (tpos_positions) ───────────────────────────
  const [tposRunning, setTposRunning] = useState(false)
  const [tposResult,  setTposResult]  = useState<{ ok: boolean; positionsSynced?: number; error?: string } | null>(null)

  async function handleSyncTpos(forceNewRun: boolean = true) {
    setTposRunning(true)
    setTposResult(null)
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/analysis/sync-tpos?${params}`)
      const data = await res.json()
      if (!data.ok) { setTposResult({ ok: false, error: data.error }); return }
      setTposResult({ ok: true, positionsSynced: data.positionsSynced })
      doRefreshStep3b()
      doRefreshStep4()
      getPipelineRates().then(setRates)
      doRefreshRuns()
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

  async function handleEvaluatePositions(forceNewRun: boolean = true) {
    setPosRunning(true)
    setPosResult(null)
    setPosError('')
    try {
      // No date range — always processes date-independently, ordered by pos_reached DESC
      const params = new URLSearchParams({ depth: String(globalDepth), limit: String(globalBatchSize) })
      if (forceNewRun) params.set('newRun', 'true')
      const res  = await fetch(`/api/analysis/evaluate-positions?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setPosResult(data)
      doRefreshStep4()
      doRefreshCp()
      getPipelineRates().then(setRates)
      doRefreshRuns()
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPosRunning(false)
    }
  }

  // ── Step 4b: Update CP Change ─────────────────────────────────────────────
  const [cpRunning, setCpRunning] = useState(false)
  const [cpResult,  setCpResult]  = useState<{ ok: boolean; updated?: number; error?: string } | null>(null)

  async function handleUpdateCp(forceNewRun: boolean = true) {
    setCpRunning(true)
    setCpResult(null)
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/analysis/update-cp-change?${params}`)
      const data = await res.json()
      if (!data.ok) { setCpResult({ ok: false, error: data.error }); return }
      setCpResult({ ok: true, updated: data.updated })
      doRefreshCp()
      doRefreshRuns()
    } catch (err) {
      setCpResult({ ok: false, error: String(err) })
    } finally {
      setCpRunning(false)
    }
  }

  // ── Step 3: Purge Stale Positions ─────────────────────────────────────────
  const [purgeRunning, setPurgeRunning] = useState(false)
  const [purgeResult,  setPurgeResult]  = useState<{ ok: boolean; purged?: number; error?: string } | null>(null)

  async function handlePurge(forceNewRun: boolean = true) {
    setPurgeRunning(true)
    setPurgeResult(null)
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/analysis/purge?${params}`)
      const data = await res.json()
      if (!data.ok) { setPurgeResult({ ok: false, error: data.error }); return }
      setPurgeResult({ ok: true, purged: data.purged })
      doRefreshPurge()
      doRefreshStep3()
      doRefreshStep3b()
      doRefreshStep4()
      getPipelineRates().then(setRates)
      doRefreshRuns()
    } catch (err) {
      setPurgeResult({ ok: false, error: String(err) })
    } finally {
      setPurgeRunning(false)
    }
  }

  // ── Step 6: Build Habits ───────────────────────────────────────────────────
  const [habitsRunning, setHabitsRunning] = useState(false)
  const [habitsResult,  setHabitsResult]  = useState<{ ok: boolean; built?: number; error?: string } | null>(null)

  async function handleBuildHabits(forceNewRun: boolean = true) {
    setHabitsRunning(true)
    setHabitsResult(null)
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/analysis/build-habits?${params}`)
      const data = await res.json()
      if (!data.ok) { setHabitsResult({ ok: false, error: data.error }); return }
      setHabitsResult({ ok: true, built: data.built })
      doRefreshHabits()
      doRefreshRuns()
    } catch (err) {
      setHabitsResult({ ok: false, error: String(err) })
    } finally {
      setHabitsRunning(false)
    }
  }

  // ── Step 8: Evaluate Game Endings ──────────────────────────────────────────
  const [gameEndingsRunning, setGameEndingsRunning] = useState(false)
  const [gameEndingsResult,  setGameEndingsResult]  = useState<{ processed: number; reused: number; errors: number; remaining: number } | null>(null)
  const [gameEndingsError,   setGameEndingsError]   = useState('')

  async function handleEvaluateGameEndings(forceNewRun: boolean = true) {
    setGameEndingsRunning(true)
    setGameEndingsResult(null)
    setGameEndingsError('')
    try {
      const params = new URLSearchParams({ depth: String(globalDepth), limit: String(globalBatchSize) })
      if (forceNewRun) params.set('newRun', 'true')
      const res  = await fetch(`/api/analysis/evaluate-game-endings?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setGameEndingsResult(data)
      doRefreshGameEndings()
      getPipelineRates().then(setRates)
      doRefreshRuns()
    } catch (err) {
      setGameEndingsError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setGameEndingsRunning(false)
    }
  }

  // ── Step 9: Deepen Popular Positions ────────────────────────────────────────
  const [deepenPopularRunning, setDeepenPopularRunning] = useState(false)
  const [deepenPopularResult,  setDeepenPopularResult]  = useState<{ processed: number; errors: number; remaining: number } | null>(null)
  const [deepenPopularError,   setDeepenPopularError]   = useState('')

  async function handleDeepenPopular(forceNewRun: boolean = true) {
    setDeepenPopularRunning(true)
    setDeepenPopularResult(null)
    setDeepenPopularError('')
    try {
      const params = new URLSearchParams({ limit: String(globalBatchSize) })
      if (forceNewRun) params.set('newRun', 'true')
      const res  = await fetch(`/api/analysis/deepen-popular-positions?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setDeepenPopularResult(data)
      doRefreshDeepenPopular()
      getPipelineRates().then(setRates)
      doRefreshRuns()
    } catch (err) {
      setDeepenPopularError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setDeepenPopularRunning(false)
    }
  }

  // ── Run All: every job in scheduled order, continuing past a failed step ──
  async function handleRunAll() {
    setRunAllRunning(true)
    setRuns([])
    await handleGameSync()
    await doRefreshRuns()
    await handleBuildTree(false)
    await doRefreshRuns()
    await handleSyncTpos(false)
    await doRefreshRuns()
    await handlePurge(false)
    await doRefreshRuns()
    await handleEvaluatePositions(false)
    await doRefreshRuns()
    await handleUpdateCp(false)
    await doRefreshRuns()
    await handleBuildHabits(false)
    await doRefreshRuns()
    await handleEvaluateGameEndings(false)
    await doRefreshRuns()
    await handleDeepenPopular(false)
    await doRefreshRuns()
    setRunAllRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Analysis Pipeline</h2>
        <PipelineHelp />
      </div>

      {/* Jobs summary — one row per scheduled cron, in vercel.json order */}
      <MyBox>
        <div className='flex items-center gap-2 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline Jobs —</h3>
          <MySelect
            options={recentRunIds.map(id => `Run #${id}`)}
            value={selectedRunId != null ? `Run #${selectedRunId}` : ''}
            onChange={e => handleSelectRunId(parseInt(e.target.value.replace('Run #', ''), 10))}
            overrideClass='w-28'
          />
          <MyButton onClick={doRefreshRuns} disabled={runsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{runsLoading ? '…' : '↻'}</MyButton>
        </div>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium px-2 py-1 text-center'>Step</th>
              <th className='font-medium px-2 py-1 text-center'>Sub</th>
              <th className='font-medium px-2 py-1'>Job</th>
              <th className='font-medium px-2 py-1'>Schedule</th>
              <th className='font-medium px-2 py-1'>Last Run</th>
              <th className='font-medium px-2 py-1'>Input Table</th>
              <th className='font-medium px-2 py-1 text-right'>Input Recs</th>
              <th className='font-medium px-2 py-1'>Output Table</th>
              <th className='font-medium px-2 py-1 text-right'>Output Recs</th>
              <th className='font-medium px-2 py-1 text-right'>Duration(s)</th>
              <th className='font-medium px-2 py-1 text-center'>Status</th>
            </tr>
          </thead>
          <tbody>
            {JOB_GROUPS.map(group => {
              if (group.subJobs.length === 1) {
                const subJob = group.subJobs[0]
                const run = runs.find(r => r.pip_step === group.step && r.pip_sub_step === subJob.subStep)
                return (
                  <tr key={group.step} className='border-t border-gray-100 font-bold'>
                    <td className='px-2 py-1 text-center text-gray-800'>{group.step}</td>
                    <td className='px-2 py-1 text-center text-gray-800'></td>
                    <td className='px-2 py-1 text-gray-800'>{group.groupLabel}</td>
                    <td className='px-2 py-1 text-gray-500'>{group.schedule}</td>
                    <td className='px-2 py-1 text-gray-500'>{run ? new Date(run.pip_created).toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-center'><StatusBadge complete={run ? true : null} /></td>
                  </tr>
                )
              }
              return (
                <Fragment key={group.step}>
                  <tr className='border-t border-gray-100 font-bold'>
                    <td className='px-2 py-1 text-center text-gray-800'>{group.step}</td>
                    <td className='px-2 py-1'></td>
                    <td className='px-2 py-1 text-gray-800'>{group.groupLabel}</td>
                    <td className='px-2 py-1 text-gray-500'>{group.schedule}</td>
                    <td className='px-2 py-1' colSpan={7}></td>
                  </tr>
                  {group.subJobs.map(subJob => {
                    const run = runs.find(r => r.pip_step === group.step && r.pip_sub_step === subJob.subStep)
                    return (
                      <tr key={`${group.step}${subJob.subStep}`} className='border-t border-gray-50'>
                        <td className='px-2 py-1 text-center text-gray-800'></td>
                        <td className='px-2 py-1 text-center text-gray-800'>{subJob.subStep}</td>
                        <td className='px-2 py-1 pl-4 text-gray-800'>{subJob.label}</td>
                        <td className='px-2 py-1'></td>
                        <td className='px-2 py-1 text-gray-500'>{run ? new Date(run.pip_created).toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-center'><StatusBadge complete={run ? true : null} /></td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </MyBox>

      {/* Run Pipeline — global params, Run All, and every step, one line each */}
      <MyBox title='Run Pipeline'>
        <div className='space-y-2'>

          <div className='flex flex-wrap items-center gap-3 text-xs text-gray-600 pb-2 border-b border-gray-100'>
            <span className='text-gray-400 font-medium'>Depth</span>
            <MyInput type='number' value={globalDepth} min={8} max={24}
              onChange={e => setGlobalDepth(Math.min(24, parseInt(e.target.value) || 16))}
              overrideClass='w-16' />
            <span className='text-gray-400 font-medium'>Batch</span>
            <MyInput type='number' value={globalBatchSize} min={1} max={1000}
              onChange={e => setGlobalBatchSize(Math.max(1, parseInt(e.target.value) || 50))}
              overrideClass='w-20' />
          </div>

          <table className='w-full text-xs'>
            <thead>
              <tr className='text-left text-gray-400'>
                <th className='font-medium py-1 pr-2'>Step</th>
                <th className='font-medium py-1 pr-2'>Description</th>
                <th className='font-medium py-1 pr-2'>Help</th>
                <th className='font-medium py-1 pr-2'>
                  <MyButton onClick={doRefreshAll} disabled={refreshAllLoading} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>
                    {refreshAllLoading ? 'Refreshing…' : 'Refresh'}
                  </MyButton>
                </th>
                <th className='font-medium py-1 pr-2'>Remaining</th>
                <th className='font-medium py-1 pr-2'>Status</th>
                <th className='font-medium py-1 pr-2'>SQL</th>
                <th className='font-medium py-1 pr-2'>Result</th>
                <th className='font-medium py-1'>
                  <MyButton onClick={handleRunAll} disabled={runAllRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runAllRunning ? 'bg-red-300 hover:bg-red-300' : 'bg-red-500 hover:bg-red-600'}`}>
                    {runAllRunning ? 'Running All...' : 'Run All'}
                  </MyButton>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Step 1 */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>1.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Game Sync — All Players</td>
                <td className='py-1 pr-2'>
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
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshStep1} disabled={s1Loading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s1Loading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(s1?.pending)}</strong> {eta(s1?.pending, rates?.step1 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={s1 === null ? null : s1.pending === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_1} /></td>
                <td className='py-1 pr-2'>
                  {syncError && <p className='text-xs text-red-600'>{syncError}</p>}
                  {syncResult && (
                    <div className='text-xs text-gray-700'>
                      {syncResult.players.map(p => (
                        <div key={p.username}>
                          {p.username}: {p.inserted} inserted, {p.deconstructed} deconstructed
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={handleGameSync} disabled={syncRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${syncRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {syncRunning ? 'Syncing...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 2a */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>2.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Build Game Positions (tgam)</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='2. Build Game Positions (tgam)'
                    input={['tgd_gamesdecon — PGN and game result for each game not yet in tgam_game_positions']}
                    processing='Replays each game up to the selected move range using chess.js. Writes one row per tracked-player move directly to tgam_game_positions, FEN text included — self-contained, no dependency on tpos_positions. Processes up to Batch games per run (shared batch-size input above) — skips games already processed. Repeat until games remaining = 0.'
                    output={[
                      'tgam_game_positions — per-player, per-game record: position FEN, move played (SAN + UCI), resulting FEN, move number',
                    ]}
                    consumers={[
                      'Step 2b Sync Position Tree (syncTposFromTgam) — derives tpos_positions from these rows',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshStep3} disabled={s3Loading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3Loading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(s3?.allRemaining)}</strong> {eta(s3?.allRemaining, rates?.step2 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={s3 === null ? null : s3.allRemaining === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_3} /></td>
                <td className='py-1 pr-2'>
                  {treeResult && (
                    <p className={`text-xs ${treeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {treeResult.ok
                        ? `Done — ${treeResult.gamesProcessed} games, ${treeResult.positions} game-position records${treeResult.errors ? `, ${treeResult.errors} errors` : ''}${treeResult.remaining != null ? ` · ${treeResult.remaining.toLocaleString()} remaining` : ''}`
                        : `Error: ${treeResult.error}`}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleBuildTree()} disabled={treeRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${treeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {treeRunning ? 'Building...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 2b */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>3.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Sync Position Tree (tpos)</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='3. Sync Position Tree (tpos)'
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
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshStep3b} disabled={s3bLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3bLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(s3b?.unresolved)}</strong> {eta(s3b?.unresolved, rates?.step3 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={s3b === null ? null : s3b.unresolved === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_3B} /></td>
                <td className='py-1 pr-2'>
                  {tposResult && (
                    <p className={`text-xs ${tposResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {tposResult.ok
                        ? `Done — ${tposResult.positionsSynced} positions synced`
                        : `Error: ${tposResult.error}`}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleSyncTpos()} disabled={tposRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${tposRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {tposRunning ? 'Syncing...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 3 (Purge) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>4.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Purge Stale Positions</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='4. Purge Stale Positions'
                    input={['tpos_positions — pos_reached <= MIN_REACH_TO_KEEP, all occurrences older than PURGE_REACH_GRACE_DAYS']}
                    processing='Deletes low-value positions once they age past the grace period without repeating: teva_evaluations, then tgam_game_positions rows whose own before-position is a candidate (full delete) or whose resulting-position is a candidate (just nulls that reference, keeps the row), then tpos_positions itself. Stamps tgd_gamesdecon.gd_positions_purged on any game left with zero tgam rows — resurrection guard so Build Game Positions never reprocesses a purged game. Runs before Evaluate Positions so Stockfish time is never spent on positions about to be deleted. Also runs unattended via its own scheduled cron (/api/analysis/purge). Deliberate exception to the "no destructive SQL in automation" rule — see .claude/CLAUDE.md.'
                    output={[
                      'teva_evaluations / tgam_game_positions / tpos_positions — rows removed',
                      'tgd_gamesdecon.gd_positions_purged — set true on emptied games',
                    ]}
                    consumers={[
                      'Step 2a Build Game Positions — respects gd_positions_purged so purged games are never resurrected',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshPurge} disabled={sPurgeLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sPurgeLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(sPurge?.eligible)}</strong></td>
                <td className='py-1 pr-2'><StatusBadge complete={sPurge === null ? null : sPurge.eligible === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_PURGE} /></td>
                <td className='py-1 pr-2'>
                  {purgeResult && (
                    <p className={`text-xs ${purgeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {purgeResult.ok ? `Done — ${purgeResult.purged} positions purged` : `Error: ${purgeResult.error}`}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handlePurge()} disabled={purgeRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${purgeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {purgeRunning ? 'Purging...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 4 (Evaluate Positions) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>5.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Evaluate Positions</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='5. Evaluate Positions'
                    input={['tpos_positions — unique FEN positions not yet in teva_evaluations, pos_reached > MIN_REACH_TO_KEEP']}
                    processing="Evaluates each unique board position from the tree with Stockfish, skipping positions with pos_reached <= MIN_REACH_TO_KEEP (they're purge candidates, so evaluating them risks wasted work). Normalises the centipawn score to white's perspective and records the best move. Date-independent — always ordered by pos_reached DESC, so the most commonly reached positions across all history get evaluated first regardless of when they occurred. Run in batches; repeat until remaining = 0. Also runs unattended via its own scheduled cron (/api/analysis/evaluate-positions). Uses the native Stockfish binary on the server (faster than browser WASM, no tab required)."
                    output={['teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI notation), search depth']}
                    consumers={[
                      'Habits / Quiz pages — use CP scores and best moves for drill data',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshStep4} disabled={s4Loading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s4Loading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(s4?.remaining)}</strong> {eta(s4?.remaining, rates?.step5 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={s4 === null ? null : s4.remaining === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_4} /></td>
                <td className='py-1 pr-2'>
                  {posError && <p className='text-xs text-red-600'>{posError}</p>}
                  {posResult && (
                    <p className={`text-xs ${posResult.remaining === 0 ? 'text-green-600' : 'text-blue-700'}`}>
                      Server done — {posResult.processed} evaluated
                      {posResult.errors > 0 ? `, ${posResult.errors} errors` : ''}
                      {' · '}{posResult.remaining > 0 ? `${posResult.remaining.toLocaleString()} remaining — run again` : 'all done'}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleEvaluatePositions()} disabled={posRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${posRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {posRunning ? 'Running...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 4b (Update CP Change) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>6.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Update CP Change</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='6. Update CP Change'
                    input={['tgam_game_positions — gam_cp_change still NULL, whose before/after positions both now have a teva_evaluations row']}
                    processing="Computes gam_cp_change (centipawn loss from the tracked player's perspective) for each move once both its before and after positions have been evaluated. Scoped to gam_cp_change IS NULL — never re-touches already-computed rows. Decoupled from Evaluate Positions so it has its own trigger and status; also runs unattended via its own scheduled cron (/api/analysis/update-cp-change)."
                    output={['tgam_game_positions.gam_cp_change — per-move centipawn loss, computed']}
                    consumers={[
                      'Habits / Quiz pages — CP loss per move for drill data',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshCp} disabled={sCpLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sCpLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(sCp?.pending)}</strong> {eta(sCp?.pending, rates?.step6 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={sCp === null ? null : sCp.pending === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_CP} /></td>
                <td className='py-1 pr-2'>
                  {cpResult && (
                    <p className={`text-xs ${cpResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {cpResult.ok ? `Done — ${cpResult.updated} rows updated` : `Error: ${cpResult.error}`}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleUpdateCp()} disabled={cpRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${cpRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {cpRunning ? 'Updating...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 7 (Build Habits) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>7.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Build Habits</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='7. Build Habits'
                    input={['tgam_game_positions joined to tgd_gamesdecon — every tracked-player move at move_num >= MIN_ANALYSIS_MOVE']}
                    processing="Full recompute every run, not incremental — a habit's move_cp can change as new games arrive for a move already in the table, so there is no safe 'already processed' cursor the way row-insertion steps have one. Aggregates by (player, position, move played), keeping only moves reached HABITS_MIN_REACH_FLOOR+ times whose largest-magnitude occurrence is a negative CP change, then upserts into thab_habits keyed on (player, position, move). move_cp is that single largest-magnitude occurrence (sign kept), not an average. The upsert never touches hab_dismissed, so a habit dismissed on the Habits page stays dismissed across every future rebuild even as its stats keep refreshing. Also runs unattended via its own scheduled cron (/api/analysis/build-habits)."
                    output={['thab_habits — one row per player/position/move habit: times played, wins, losses, worst-occurrence CP change, dismissed flag']}
                    consumers={[
                      'Habits page (getHabitsData/getHabitsCount) — reads thab_habits directly instead of live-aggregating on every request',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshHabits} disabled={sHabitsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sHabitsLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(sHabits?.remaining)}</strong></td>
                <td className='py-1 pr-2'><StatusBadge complete={sHabits === null ? null : sHabits.remaining === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_HABITS} /></td>
                <td className='py-1 pr-2'>
                  {habitsResult && (
                    <p className={`text-xs ${habitsResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {habitsResult.ok ? `Done — ${habitsResult.built} habit rows built/refreshed` : `Error: ${habitsResult.error}`}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleBuildHabits()} disabled={habitsRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${habitsRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {habitsRunning ? 'Building...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 8 (Evaluate Game Endings) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>8.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Evaluate Game Endings</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='8. Evaluate Game Endings'
                    input={['tgd_gamesdecon — games with a PGN whose gd_final_eval is still NULL']}
                    processing="Replays each game's full PGN with chess.js to its true final position — not capped like the position-tree pipeline, which stops at MAX_ANALYSIS_MOVE — then evaluates it with Stockfish and normalizes to white's perspective. Independent of tpos_positions/tgam_game_positions entirely: reads and writes tgd_gamesdecon directly. Run in batches; repeat until remaining = 0. Also runs unattended via its own scheduled cron (/api/analysis/evaluate-game-endings)."
                    output={['tgd_gamesdecon.gd_final_eval — Stockfish evaluation (white perspective) of each game\'s actual final position']}
                    consumers={[
                      'Analyze page — "Games From This Position" panel\'s Final Eval column',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshGameEndings} disabled={sGameEndingsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sGameEndingsLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(sGameEndings?.remaining)}</strong> {eta(sGameEndings?.remaining, rates?.step8 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={sGameEndings === null ? null : sGameEndings.remaining === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_GAME_ENDINGS} /></td>
                <td className='py-1 pr-2'>
                  {gameEndingsError && <p className='text-xs text-red-600'>{gameEndingsError}</p>}
                  {gameEndingsResult && (
                    <p className={`text-xs ${gameEndingsResult.remaining === 0 ? 'text-green-600' : 'text-blue-700'}`}>
                      Done — {gameEndingsResult.processed} evaluated ({gameEndingsResult.reused} reused from tracked positions)
                      {gameEndingsResult.errors > 0 ? `, ${gameEndingsResult.errors} errors` : ''}
                      {' · '}{gameEndingsResult.remaining > 0 ? `${gameEndingsResult.remaining.toLocaleString()} remaining — run again` : 'all done'}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleEvaluateGameEndings()} disabled={gameEndingsRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${gameEndingsRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {gameEndingsRunning ? 'Running...' : 'Run'}
                  </MyButton>
                </td>
              </tr>

              {/* Step 9 (Deepen Popular Positions) */}
              <tr className='border-t border-gray-100'>
                <td className='py-1 pr-2 text-xs font-bold'>9.</td>
                <td className='py-1 pr-2 text-xs font-bold'>Deepen Popular Positions</td>
                <td className='py-1 pr-2'>
                  <MyHelpStep
                    title='9. Deepen Popular Positions'
                    input={['tpos_positions/teva_evaluations — already-evaluated positions whose pos_reached qualifies for a deeper POPULAR_POSITION_DEPTH_TIERS tier than their current eva_depth']}
                    processing="Popular positions (reached often) get re-evaluated at a greater depth than the default batch depth, in tiers: reach >= 50 -> depth 30, >= 30 -> depth 24, >= 10 -> depth 22. Each qualifying position is re-evaluated at its own tier's depth (not one uniform depth for the whole batch), then merged via upgradePositionEvaluation — the same guarded upgrade (only if deeper) and gam_cp_change cascade used by the Analyze page's Game/Position Analysis. Run in batches; repeat until remaining = 0. Also runs unattended via its own scheduled cron (/api/analysis/deepen-popular-positions)."
                    output={['teva_evaluations — eva_cp/eva_best_move/eva_depth upgraded for qualifying positions; tgam_game_positions.gam_cp_change recomputed for affected rows']}
                    consumers={[
                      'Every teva_evaluations reader benefits — Moves From This Position, Position Detail, Habits eval',
                    ]}
                  />
                </td>
                <td className='py-1 pr-2'>
                  <MyButton onClick={doRefreshDeepenPopular} disabled={sDeepenPopularLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sDeepenPopularLoading ? '…' : '↻'}</MyButton>
                </td>
                <td className='py-1 pr-2 text-gray-600'>remaining: <strong className='text-gray-800'>{n(sDeepenPopular?.remaining)}</strong> {eta(sDeepenPopular?.remaining, rates?.step9 ?? null)}</td>
                <td className='py-1 pr-2'><StatusBadge complete={sDeepenPopular === null ? null : sDeepenPopular.remaining === 0} /></td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_DEEPEN_POPULAR} /></td>
                <td className='py-1 pr-2'>
                  {deepenPopularError && <p className='text-xs text-red-600'>{deepenPopularError}</p>}
                  {deepenPopularResult && (
                    <p className={`text-xs ${deepenPopularResult.remaining === 0 ? 'text-green-600' : 'text-blue-700'}`}>
                      Done — {deepenPopularResult.processed} deepened
                      {deepenPopularResult.errors > 0 ? `, ${deepenPopularResult.errors} errors` : ''}
                      {' · '}{deepenPopularResult.remaining > 0 ? `${deepenPopularResult.remaining.toLocaleString()} remaining — run again` : 'all done'}
                    </p>
                  )}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => handleDeepenPopular()} disabled={deepenPopularRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${deepenPopularRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {deepenPopularRunning ? 'Running...' : 'Run'}
                  </MyButton>
                </td>
              </tr>
            </tbody>
          </table>

        </div>
      </MyBox>

    </div>
  )
}
