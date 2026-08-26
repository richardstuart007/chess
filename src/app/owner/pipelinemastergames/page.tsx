'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PipelineMasterGamesPage — /owner/pipelinemastergames. The master-games position-database
//    pipeline UI: 3 steps (Sync Master Games → Build Master Position Tree → Sync Master Position
//    Tree), each independently re-runnable for one or more selected master players, plus a
//    "Run All" that chains all 3 across every selected player sharing one pipeline run id, and a
//    Jobs summary table reading back the latest logged run per step/sub-step.
//==================================================================================================

import { useState, useEffect, Fragment } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import MySelect from 'nextjs-shared/MySelect'
import MasterPlayerMultiSelect from '@/src/ui/filters/MasterPlayerMultiSelect'
import {
  refreshMasterSyncStatus, refreshMasterTreeStatus, refreshMasterTposStatus
} from '@/src/lib/master/masterGamesPipelineStatus'
import { getLatestPipelineRuns, getRecentRunIds } from '@/src/lib/actions/pipelineLog'
import { INCLUDED_TIME_CLASSES_Master, MIN_ANALYSIS_MOVE_Master, MAX_ANALYSIS_MOVE_Master, GAMES_SYNC_YEARS_Master, PIPELINE_TYPE_MASTERGAMES } from '@/src/lib/constants'

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

const JOB_GROUPS: {
  step: number
  groupLabel: string
  subJobs: { subStep: string; label: string }[]
}[] = [
  { step: 1, groupLabel: 'Sync Master Games', subJobs: [
      { subStep: 'a', label: 'Query chess.com API' },
      { subStep: 'b', label: 'Fetch & Insert Raw Games' },
      { subStep: 'c', label: 'Deconstruct Master Games' },
    ] },
  { step: 2, groupLabel: 'Build Master Position Tree', subJobs: [
      { subStep: 'a', label: 'Build Master Position Tree' },
    ] },
  { step: 3, groupLabel: 'Sync Master Position Tree', subJobs: [
      { subStep: 'a', label: 'Sync tmpos_positions' },
      { subStep: 'b', label: 'Backfill tmgam ids' },
    ] },
]

const SQL_STATUS_SYNC = `SELECT
  (SELECT COUNT(*) FROM wk_mgr_gamesraw r WHERE NOT EXISTS (SELECT 1 FROM tmgd_gamesdecon d WHERE d.mgd_chesscom_uuid = r.mgr_chesscom_uuid)) AS pending,
  (SELECT COUNT(*) FROM tmgd_gamesdecon) AS all_decon;`
const SQL_STATUS_TREE = `SELECT
  (SELECT COUNT(*) FROM tmgd_gamesdecon) AS all_eligible,
  (SELECT COUNT(*) FROM tmgd_gamesdecon d WHERE NOT EXISTS (SELECT 1 FROM tmgam_game_positions WHERE mgam_mgdid = d.mgd_mgdid)) AS all_remaining;`
const SQL_STATUS_TPOS = `SELECT
  (SELECT COUNT(*) FROM tmpos_positions) AS positions,
  (SELECT COUNT(*) FROM tmgam_game_positions WHERE mgam_pos_id IS NULL) AS unresolved;`

export default function PipelineMasterGamesPage() {
  // ── Sync target ─────────────────────────────────────────────────────────────
  const [selectedHandles, setSelectedHandles] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<number>(GAMES_SYNC_YEARS_Master[0])

  // ── Status ──────────────────────────────────────────────────────────────────
  const [sSync, setSSync] = useState<{ pending: number; allDecon: number } | null>(null)
  const [sTree, setSTree] = useState<{ allProcessed: number; allRemaining: number } | null>(null)
  const [sTpos, setSTpos] = useState<{ positions: number; unresolved: number } | null>(null)
  const [sSyncLoading, setSSyncLoading] = useState(false)
  const [sTreeLoading, setSTreeLoading] = useState(false)
  const [sTposLoading, setSTposLoading] = useState(false)

  const [runs, setRuns] = useState<LatestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [recentRunIds, setRecentRunIds] = useState<{ runId: number; created: string }[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  async function doRefreshSync() { setSSyncLoading(true); setSSync(await refreshMasterSyncStatus()); setSSyncLoading(false) }
  async function doRefreshTree() { setSTreeLoading(true); setSTree(await refreshMasterTreeStatus()); setSTreeLoading(false) }
  async function doRefreshTpos() { setSTposLoading(true); setSTpos(await refreshMasterTposStatus()); setSTposLoading(false) }

  async function doRefreshRuns() {
    setRunsLoading(true)
    const ids = await getRecentRunIds(PIPELINE_TYPE_MASTERGAMES)
    setRecentRunIds(ids)
    const latestId = ids[0]?.runId ?? null
    setSelectedRunId(latestId)
    setRuns(await getLatestPipelineRuns(PIPELINE_TYPE_MASTERGAMES, latestId ?? undefined))
    setRunsLoading(false)
  }

  async function handleSelectRunId(runId: number) {
    setSelectedRunId(runId)
    setRunsLoading(true)
    setRuns(await getLatestPipelineRuns(PIPELINE_TYPE_MASTERGAMES, runId))
    setRunsLoading(false)
  }

  async function doRefreshAllStatus() {
    await Promise.all([doRefreshSync(), doRefreshTree(), doRefreshTpos()])
    doRefreshRuns()
  }

  useEffect(() => {
    doRefreshRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1: Sync Master Games (bundles download + deconstruct — wk_mgr_gamesraw
  // is a workfile with no independent value between the two) ────────────────────
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ inserted: number; skipped: number; total: number; deconstructed: number; player?: string } | null>(null)
  const [syncError,   setSyncError]   = useState('')

  async function handleSync(forceNewRun: boolean = true, handles: string[] = selectedHandles, truncateFirst: boolean = true) {
    if (handles.length === 0) return
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    const totals = { inserted: 0, skipped: 0, total: 0, deconstructed: 0 }
    const errors: string[] = []
    try {
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i]
        try {
          const params = new URLSearchParams({
            player: handle, year: String(selectedYear),
            ...(forceNewRun ? { newRun: 'true' } : {}),
            ...(truncateFirst && i === 0 ? { truncateFirst: 'true' } : {})
          })
          const res  = await fetch(`/api/mastergames/sync?${params}`)
          const data = await res.json()
          if (!data.ok) throw new Error(data.error ?? 'Failed')
          totals.inserted     += data.inserted
          totals.skipped      += data.skipped
          totals.total        += data.total
          totals.deconstructed += data.deconstructed
        } catch (err) {
          errors.push(`${handle}: ${err instanceof Error ? err.message : 'Failed'}`)
        }
      }
      setSyncResult({ ...totals, player: handles.length === 1 ? handles[0] : undefined })
      if (errors.length > 0) setSyncError(errors.join('; '))
      doRefreshSync()
      doRefreshRuns()
    } finally {
      setSyncRunning(false)
    }
  }

  // ── Step 2: Build Master Position Tree (Phase A only — always skipSync) ───────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ gamesProcessed: number; positions: number; gamePositions: number; player?: string } | null>(null)
  const [treeError,   setTreeError]   = useState('')

  async function handleBuildTree(forceNewRun: boolean = true, player?: string) {
    setTreeRunning(true)
    setTreeResult(null)
    setTreeError('')
    try {
      const params = new URLSearchParams({ skipSync: 'true', ...(forceNewRun ? { newRun: 'true' } : {}), ...(player ? { player } : {}) })
      const res  = await fetch(`/api/mastergames/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setTreeResult({ ...data, player })
      doRefreshTree()
      doRefreshRuns()
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Step 3: Sync Master Position Tree (Phase B — independent, real backlog) ───
  const [tposRunning, setTposRunning] = useState(false)
  const [tposResult,  setTposResult]  = useState<{ positionsSynced: number; player?: string } | null>(null)
  const [tposError,   setTposError]   = useState('')

  async function handleSyncTpos(forceNewRun: boolean = true, player?: string) {
    setTposRunning(true)
    setTposResult(null)
    setTposError('')
    try {
      const params = new URLSearchParams({ ...(forceNewRun ? { newRun: 'true' } : {}), ...(player ? { player } : {}) })
      const res  = await fetch(`/api/mastergames/sync-tpos?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setTposResult({ ...data, player })
      doRefreshTpos()
      doRefreshRuns()
    } catch (err) {
      setTposError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setTposRunning(false)
    }
  }

  // ── Run All: each selected player processed fully, start to finish, before the ──
  // next player begins — Sync (bundles Deconstruct), then Build Tree, then Sync
  // Position Tree, all under that player's own run id (Sync allocates it via
  // forceNewRun=true; Build Tree/Sync Position Tree join it via forceNewRun=false).
  // Build Tree/Sync Position Tree stay global (no player filter — they process
  // whatever's outstanding), but calling them right after each player's own sync
  // means each call only picks up that player's newly-available rows, since every
  // earlier player's rows are already processed.
  const [runAllRunning, setRunAllRunning] = useState(false)
  async function handleRunAll() {
    if (selectedHandles.length === 0) return
    setRunAllRunning(true)
    setRuns([])
    for (let i = 0; i < selectedHandles.length; i++) {
      const handle = selectedHandles[i]
      await handleSync(true, [handle], i === 0)
      await doRefreshRuns()
      await handleBuildTree(false, handle)
      await doRefreshRuns()
      await handleSyncTpos(false, handle)
      await doRefreshRuns()
    }
    setRunAllRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Master Games Pipeline</h2>
      </div>
      <div className='flex items-center gap-3'>
        <label htmlFor='master-sync-year' className='font-bold text-xs whitespace-nowrap'>Year</label>
        <MySelect
          id='master-sync-year'
          value={String(selectedYear)}
          onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
          overrideClass='w-20 h-6 md:h-6 bg-white'
        >
          {GAMES_SYNC_YEARS_Master.map(y => <option key={y} value={y}>{y}</option>)}
        </MySelect>
        <MasterPlayerMultiSelect selected={selectedHandles} onChange={setSelectedHandles} year={selectedYear} />
      </div>

      {/* Jobs summary */}
      <MyBox>
        <div className='flex items-center gap-2 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline Jobs —</h3>
          <MySelect
            options={recentRunIds.map(r => `Run #${r.runId}`)}
            value={selectedRunId != null ? `Run #${selectedRunId}` : ''}
            onChange={e => handleSelectRunId(parseInt(e.target.value.replace('Run #', ''), 10))}
            overrideClass='w-28 h-6 md:h-6'
          />
          <MyButton onClick={doRefreshRuns} disabled={runsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{runsLoading ? '…' : '↻'}</MyButton>
        </div>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium px-2 py-1 text-center'>Step</th>
              <th className='font-medium px-2 py-1 text-center'>Sub</th>
              <th className='font-medium px-2 py-1'>Job</th>
              <th className='font-medium px-2 py-1'>Last Run</th>
              <th className='font-medium px-2 py-1'>Input Table</th>
              <th className='font-medium px-2 py-1 text-right'>Input Recs</th>
              <th className='font-medium px-2 py-1'>Output Table</th>
              <th className='font-medium px-2 py-1 text-right'>Output Recs</th>
              <th className='font-medium px-2 py-1 text-right'>Duration(s)</th>
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
                    <td className='px-2 py-1 text-gray-500'>{run ? new Date(run.pip_created).toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                    <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                  </tr>
                )
              }
              return (
                <Fragment key={group.step}>
                  <tr className='border-t border-gray-100 font-bold'>
                    <td className='px-2 py-1 text-center text-gray-800'>{group.step}</td>
                    <td className='px-2 py-1'></td>
                    <td className='px-2 py-1 text-gray-800'>{group.groupLabel}</td>
                    <td className='px-2 py-1' colSpan={6}></td>
                  </tr>
                  {group.subJobs.map(subJob => {
                    const run = runs.find(r => r.pip_step === group.step && r.pip_sub_step === subJob.subStep)
                    return (
                      <tr key={`${group.step}${subJob.subStep}`} className='border-t border-gray-100'>
                        <td className='px-2 py-1 text-center text-gray-500'></td>
                        <td className='px-2 py-1 text-center text-gray-500'>{subJob.subStep}</td>
                        <td className='px-2 py-1 text-gray-600 pl-4'>{subJob.label}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? new Date(run.pip_created).toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </MyBox>

      {/* Run Pipeline */}
      <MyBox title='Run Pipeline'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium py-1 pr-2'>Step</th>
              <th className='font-medium py-1 pr-2'>Description</th>
              <th className='font-medium py-1 pr-2'>Help</th>
              <th className='font-medium py-1 pr-2'>Result</th>
              <th className='font-medium py-1 pr-2'>SQL</th>
              <th className='font-medium py-1 pr-2'>
                <MyButton onClick={doRefreshAllStatus} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>Refresh</MyButton>
              </th>
              <th className='font-medium py-1 pr-2'>Status</th>
              <th className='font-medium py-1 pr-2'>Error</th>
              <th className='font-medium py-1'>
                <MyButton onClick={handleRunAll} disabled={runAllRunning || selectedHandles.length === 0} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runAllRunning ? 'bg-red-300 hover:bg-red-300' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runAllRunning ? 'Running All...' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Step 1 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>1.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Sync Master Games</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='1. Sync Master Games'
                  input={[`chess.com API — each selected master's ${selectedYear} archives`]}
                  processing={`Downloads every chess.com monthly archive for the selected year, keeps only standard chess (excludes chess960/variants) games in ${INCLUDED_TIME_CLASSES_Master.join('/')}, and inserts them into wk_mgr_gamesraw, one selected player at a time. Immediately deconstructs every outstanding raw game into tmgd_gamesdecon in the same call — wk_mgr_gamesraw is a workfile with no independent value between a download and its deconstruction. No resume cursor — always a fresh pull for the year, safe to re-run (ON CONFLICT DO NOTHING on the chess.com uuid).`}
                  output={['wk_mgr_gamesraw — one row per synced game (workfile)', 'tmgd_gamesdecon — one row per deconstructed game']}
                  consumers={['Step 2 Build Master Position Tree']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{syncResult && <span>{syncResult.player && <strong>{syncResult.player}: </strong>}{n(syncResult.inserted)} inserted, {n(syncResult.skipped)} skipped, {n(syncResult.total)} total found, {n(syncResult.deconstructed)} deconstructed</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_SYNC} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshSync} disabled={sSyncLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sSyncLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sSync?.pending)}</strong> pending, <strong className='text-gray-800'>{n(sSync?.allDecon)}</strong> deconstructed</td>
              <td className='py-1 pr-2'>{syncError && <p className='text-xs text-red-600'>{syncError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleSync()} disabled={syncRunning || selectedHandles.length === 0} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${syncRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {syncRunning ? 'Syncing...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 2 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Master Position Tree</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2. Build Master Position Tree'
                  input={['tmgd_gamesdecon — deconstructed games from step 1']}
                  processing={`Incremental, non-destructive: replays only deconstructed games not yet represented in tmgam_game_positions, recording positions for plies ${MIN_ANALYSIS_MOVE_Master}..${MAX_ANALYSIS_MOVE_Master}. Never truncates. Processes every outstanding game across every player, up to the batch limit per run — click "Run" again (or Run All) to work through a larger backlog. Does not derive tmpos_positions itself — that's step 3's job, run independently.`}
                  output={['tmgam_game_positions — per-game (position, move-played) rows']}
                  consumers={['Step 3 Sync Master Position Tree']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{treeResult && <span>{treeResult.player && <strong>{treeResult.player}: </strong>}{n(treeResult.gamesProcessed)} games, {n(treeResult.gamePositions)} game-positions</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_TREE} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshTree} disabled={sTreeLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sTreeLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sTree?.allRemaining)}</strong> remaining</td>
              <td className='py-1 pr-2'>{treeError && <p className='text-xs text-red-600'>{treeError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleBuildTree()} disabled={treeRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${treeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {treeRunning ? 'Building...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 3 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>3.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Sync Master Position Tree</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='3. Sync Master Position Tree'
                  input={['tmgam_game_positions — rows with mgam_pos_id / mgam_resulting_pos_id still NULL']}
                  processing='Idempotent derivation of tmpos_positions from tmgam_game_positions (syncTposFromTgam_Master): inserts any tmpos_positions row still missing for a referenced FEN, backfills mgam_pos_id/mgam_resulting_pos_id by FEN match, then recomputes mpos_reached only for positions just touched. Safe to re-run any time — self-scoping via the NULL markers, never rescans already-resolved rows.'
                  output={['tmpos_positions — unique FEN positions, with mpos_reached', 'tmgam_game_positions.mgam_pos_id / mgam_resulting_pos_id — backfilled']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{tposResult && <span>{tposResult.player && <strong>{tposResult.player}: </strong>}{n(tposResult.positionsSynced)} positions synced</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_TPOS} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshTpos} disabled={sTposLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sTposLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sTpos?.positions)}</strong> positions, <strong className='text-gray-800'>{n(sTpos?.unresolved)}</strong> unresolved</td>
              <td className='py-1 pr-2'>{tposError && <p className='text-xs text-red-600'>{tposError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleSyncTpos()} disabled={tposRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${tposRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {tposRunning ? 'Syncing...' : 'Run'}
                </MyButton>
              </td>
            </tr>
          </tbody>
        </table>
      </MyBox>

    </div>
  )
}

//----------------------------------------------------------------------------------
//  n — formats a count for display, or an em dash if not yet loaded
//----------------------------------------------------------------------------------
function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}
