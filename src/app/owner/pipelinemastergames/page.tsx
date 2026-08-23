'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import MySelect from 'nextjs-shared/MySelect'
import MasterPlayerSelect from '@/src/ui/filters/MasterPlayerSelect'
import FilterSelect from '@/src/ui/filters/FilterSelect'
import {
  refreshMasterSyncStatus, refreshMasterDeconStatus, refreshMasterTreeStatus
} from '@/src/lib/master/masterGamesPipelineStatus'
import { getLatestPipelineRuns, getRecentRunIds } from '@/src/lib/actions/pipelineLog'
import { MASTER_INCLUDED_TIME_CLASSES, MASTER_MIN_ANALYSIS_MOVE, MASTER_MAX_ANALYSIS_MOVE, MASTER_GAMES_SYNC_YEARS, PIPELINE_TYPE_MASTERGAMES } from '@/src/lib/constants'

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

const STEPS = [
  { step: 1, label: 'Sync Master Games' },
  { step: 2, label: 'Deconstruct Master Games' },
  { step: 3, label: 'Build Master Position Tree' },
]

function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}

const SQL_STATUS_SYNC = `SELECT COUNT(*) AS rows FROM tmgr_mastergamesraw;`
const SQL_STATUS_DECON = `SELECT COUNT(*) AS rows FROM tmgd_mastergamesdecon;`
const SQL_STATUS_TREE = `SELECT (SELECT COUNT(*) FROM tmps_masterpositions) AS positions, (SELECT COUNT(*) FROM tmgp_mastergamepositions) AS game_positions;`

export default function PipelineMasterGamesPage() {
  // ── Sync target ─────────────────────────────────────────────────────────────
  const [selectedHandle, setSelectedHandle] = useState('')
  const [selectedYear, setSelectedYear] = useState<number>(MASTER_GAMES_SYNC_YEARS[0])

  // ── Status ──────────────────────────────────────────────────────────────────
  const [sSync, setSSync]   = useState<{ rows: number } | null>(null)
  const [sDecon, setSDecon] = useState<{ rows: number } | null>(null)
  const [sTree, setSTree]   = useState<{ positions: number; gamePositions: number } | null>(null)
  const [sSyncLoading, setSSyncLoading]   = useState(false)
  const [sDeconLoading, setSDeconLoading] = useState(false)
  const [sTreeLoading, setSTreeLoading]   = useState(false)

  const [runs, setRuns] = useState<LatestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [recentRunIds, setRecentRunIds] = useState<{ runId: number; created: string }[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  async function doRefreshSync()  { setSSyncLoading(true);  setSSync(await refreshMasterSyncStatus());   setSSyncLoading(false) }
  async function doRefreshDecon() { setSDeconLoading(true); setSDecon(await refreshMasterDeconStatus()); setSDeconLoading(false) }
  async function doRefreshTree()  { setSTreeLoading(true);  setSTree(await refreshMasterTreeStatus());   setSTreeLoading(false) }

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
    await Promise.all([doRefreshSync(), doRefreshDecon(), doRefreshTree()])
    doRefreshRuns()
  }

  useEffect(() => {
    doRefreshAllStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1: Sync Master Games ──────────────────────────────────────────────
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ inserted: number; skipped: number; total: number } | null>(null)
  const [syncError,   setSyncError]   = useState('')

  async function handleSync(forceNewRun: boolean = true) {
    if (!selectedHandle) return
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const params = new URLSearchParams({ player: selectedHandle, year: String(selectedYear), ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res  = await fetch(`/api/mastergames/sync?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setSyncResult(data)
      doRefreshSync()
      doRefreshRuns()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSyncRunning(false)
    }
  }

  // ── Step 2: Deconstruct Master Games ───────────────────────────────────────
  const [deconRunning, setDeconRunning] = useState(false)
  const [deconResult,  setDeconResult]  = useState<{ processed: number; skipped: number; errors: number } | null>(null)
  const [deconError,   setDeconError]   = useState('')

  async function handleDeconstruct(forceNewRun: boolean = true) {
    if (!selectedHandle) return
    setDeconRunning(true)
    setDeconResult(null)
    setDeconError('')
    try {
      const params = new URLSearchParams({ player: selectedHandle, ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res  = await fetch(`/api/mastergames/deconstruct?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setDeconResult(data)
      doRefreshDecon()
      doRefreshRuns()
    } catch (err) {
      setDeconError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setDeconRunning(false)
    }
  }

  // ── Step 3: Build Master Position Tree ─────────────────────────────────────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ gamesProcessed: number; positions: number; gamePositions: number } | null>(null)
  const [treeError,   setTreeError]   = useState('')

  async function handleBuildTree(forceNewRun: boolean = true) {
    if (!selectedHandle) return
    setTreeRunning(true)
    setTreeResult(null)
    setTreeError('')
    try {
      const params = new URLSearchParams({ player: selectedHandle, ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res  = await fetch(`/api/mastergames/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setTreeResult(data)
      doRefreshTree()
      doRefreshRuns()
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Run All: every stage in order, sharing one run_id ──────────────────────
  const [runAllRunning, setRunAllRunning] = useState(false)
  async function handleRunAll() {
    if (!selectedHandle) return
    setRunAllRunning(true)
    setRuns([])
    await handleSync(true)
    await doRefreshRuns()
    await handleDeconstruct(false)
    await doRefreshRuns()
    await handleBuildTree(false)
    await doRefreshRuns()
    setRunAllRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Master Games Pipeline (Proof of Concept)</h2>
      </div>
      <p className='text-xs text-gray-500'>
        A pre-computed position index for master players' own chess.com games, so "what did master
        players play from this position" is an indexed local query instead of a live per-request
        scan. Pick a master and a year below, then run the pipeline.
      </p>
      <div className='flex items-center gap-3'>
        <MasterPlayerSelect value={selectedHandle} onChange={setSelectedHandle} />
        <FilterSelect
          label='Year'
          options={MASTER_GAMES_SYNC_YEARS.map(y => String(y))}
          value={String(selectedYear)}
          onChange={v => setSelectedYear(parseInt(v, 10))}
          width='w-20'
        />
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
            {STEPS.map(({ step, label }) => {
              const run = runs.find(r => r.pip_step === step)
              return (
                <tr key={step} className='border-t border-gray-100'>
                  <td className='px-2 py-1 text-center text-gray-800 font-bold'>{step}</td>
                  <td className='px-2 py-1 text-gray-800'>{label}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? new Date(run.pip_created).toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                </tr>
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
                <MyButton onClick={handleRunAll} disabled={runAllRunning || !selectedHandle} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runAllRunning ? 'bg-red-300 hover:bg-red-300' : 'bg-red-500 hover:bg-red-600'}`}>
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
                  input={[`chess.com API — the selected master's ${selectedYear} archives`]}
                  processing={`Downloads every chess.com monthly archive for the selected year, keeps only standard chess (excludes chess960/variants) games in ${MASTER_INCLUDED_TIME_CLASSES.join('/')}, and inserts them into tmgr_mastergamesraw. No resume cursor — always a fresh pull for the year, safe to re-run (ON CONFLICT DO NOTHING on the chess.com uuid).`}
                  output={['tmgr_mastergamesraw — one row per synced game']}
                  consumers={['Step 2 Deconstruct Master Games']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{syncResult && <span>{n(syncResult.inserted)} inserted, {n(syncResult.skipped)} skipped, {n(syncResult.total)} total found</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_SYNC} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshSync} disabled={sSyncLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sSyncLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sSync?.rows)}</strong> rows staged</td>
              <td className='py-1 pr-2'>{syncError && <p className='text-xs text-red-600'>{syncError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleSync()} disabled={syncRunning || !selectedHandle} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${syncRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {syncRunning ? 'Syncing...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 2 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Deconstruct Master Games</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2. Deconstruct Master Games'
                  input={['tmgr_mastergamesraw — raw games staged by step 1']}
                  processing='Parses each raw game not yet deconstructed into a structured row in tmgd_mastergamesdecon (opening, ECO, termination, ratings, PGN), skipping games below the trackable half-move floor. Upserts the shared tec_ecoreference table in the primary database — reused unchanged from the player-games pipeline, not a join.'
                  output={['tmgd_mastergamesdecon — one row per deconstructed game']}
                  consumers={['Step 3 Build Master Position Tree']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{deconResult && <span>{n(deconResult.processed)} processed, {n(deconResult.skipped)} skipped, {n(deconResult.errors)} errors</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_DECON} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshDecon} disabled={sDeconLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sDeconLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sDecon?.rows)}</strong> rows staged</td>
              <td className='py-1 pr-2'>{deconError && <p className='text-xs text-red-600'>{deconError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleDeconstruct()} disabled={deconRunning || !selectedHandle} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${deconRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {deconRunning ? 'Deconstructing...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 3 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>3.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Master Position Tree</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='3. Build Master Position Tree'
                  input={['tmgd_mastergamesdecon — deconstructed games from step 2']}
                  processing={`Full truncate-and-rebuild of tmgp_mastergamepositions/tmps_masterpositions from every deconstructed game, replaying each PGN and recording positions for plies ${MASTER_MIN_ANALYSIS_MOVE}..${MASTER_MAX_ANALYSIS_MOVE}. Admin-triggered rebuild, not an incremental batch step — always reflects exactly what's currently deconstructed for this player.`}
                  output={['tmps_masterpositions — FEN → reach count', 'tmgp_mastergamepositions — per-game (position, move-played) rows']}
                  consumers={['/owner/mastergames — FEN Lookup panel']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{treeResult && <span>{n(treeResult.gamesProcessed)} games, {n(treeResult.positions)} positions, {n(treeResult.gamePositions)} game-positions</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_TREE} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshTree} disabled={sTreeLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sTreeLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sTree?.positions)}</strong> positions, <strong className='text-gray-800'>{n(sTree?.gamePositions)}</strong> game-positions</td>
              <td className='py-1 pr-2'>{treeError && <p className='text-xs text-red-600'>{treeError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleBuildTree()} disabled={treeRunning || !selectedHandle} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${treeRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {treeRunning ? 'Building...' : 'Run'}
                </MyButton>
              </td>
            </tr>
          </tbody>
        </table>
      </MyBox>

    </div>
  )
}
