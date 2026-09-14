'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PipelineHistoricalGamesPage — /owner/pipelinehistoricalgames. Bulk PGN-file import pipeline
//    for a historical games collection (e.g. World Chess Championship 1886-2018, or a future
//    collection such as Morphy games). 4 steps: Upload PGN Collection → Deconstruct Historical
//    Games (both new, direct-PGN — no chess.com JSON involved) → Build Master Position Tree →
//    Sync Master Position Tree (the latter two reuse the existing master-games pipeline's own
//    global, unfiltered steps unchanged — see /owner/pipelinemastergames).
//==================================================================================================

import { useState, useEffect, Fragment } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import MySelect from 'nextjs-shared/MySelect'
import { MyInput } from 'nextjs-shared/MyInput'
import { refreshHistoricalStatus } from '@/src/lib/master/importHistoricalGames'
import { refreshMasterTreeStatus, refreshMasterTposStatus } from '@/src/lib/master/masterGamesPipelineStatus'
import { getLatestPipelineRuns, getRecentRunIds } from '@/src/lib/actions/pipelineLog'
import { PIPELINE_TYPE_HISTORICALGAMES } from '@/src/lib/constants'

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
  { step: 1, groupLabel: 'Upload PGN Collection', subJobs: [{ subStep: 'a', label: 'Stage Raw Games' }] },
  { step: 2, groupLabel: 'Deconstruct Historical Games', subJobs: [{ subStep: 'a', label: 'Deconstruct Historical Games' }] },
  { step: 3, groupLabel: 'Build Master Position Tree', subJobs: [{ subStep: 'a', label: 'Build Master Position Tree' }] },
  { step: 4, groupLabel: 'Sync Master Position Tree', subJobs: [
      { subStep: 'a', label: 'Sync tmpos_positions' },
      { subStep: 'b', label: 'Backfill tmgam ids' },
    ] },
]

const SQL_STATUS_UPLOAD = `SELECT COUNT(*) FROM wk_hpg_historicalpgnraw;`
const SQL_STATUS_DECON = `SELECT COUNT(*) FROM tmgd_gamesdecon WHERE mgd_round IS NOT NULL;`
const SQL_STATUS_TREE = `SELECT
  (SELECT COUNT(*) FROM tmgd_gamesdecon) AS all_eligible,
  (SELECT COUNT(*) FROM tmgd_gamesdecon d WHERE NOT EXISTS (SELECT 1 FROM tmgam_game_positions WHERE mgam_mgdid = d.mgd_mgdid)) AS all_remaining;`
const SQL_STATUS_TPOS = `SELECT
  (SELECT COUNT(*) FROM tmpos_positions) AS positions,
  (SELECT COUNT(*) FROM tmgam_game_positions WHERE mgam_pos_id IS NULL) AS unresolved;`

export default function PipelineHistoricalGamesPage() {
  // ── Upload target ───────────────────────────────────────────────────────────
  const [collection, setCollection] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)

  // ── Status ──────────────────────────────────────────────────────────────────
  const [sUpload, setSUpload] = useState<{ staged: number; decon: number } | null>(null)
  const [sTree, setSTree] = useState<{ allProcessed: number; allRemaining: number } | null>(null)
  const [sTpos, setSTpos] = useState<{ positions: number; unresolved: number } | null>(null)
  const [sUploadLoading, setSUploadLoading] = useState(false)
  const [sTreeLoading, setSTreeLoading] = useState(false)
  const [sTposLoading, setSTposLoading] = useState(false)

  const [runs, setRuns] = useState<LatestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [recentRunIds, setRecentRunIds] = useState<{ runId: number; created: string }[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  async function doRefreshUpload() { setSUploadLoading(true); setSUpload(await refreshHistoricalStatus()); setSUploadLoading(false) }
  async function doRefreshTree() { setSTreeLoading(true); setSTree(await refreshMasterTreeStatus()); setSTreeLoading(false) }
  async function doRefreshTpos() { setSTposLoading(true); setSTpos(await refreshMasterTposStatus()); setSTposLoading(false) }

  async function doRefreshRuns() {
    setRunsLoading(true)
    const ids = await getRecentRunIds(PIPELINE_TYPE_HISTORICALGAMES)
    setRecentRunIds(ids)
    const latestId = ids[0]?.runId ?? null
    setSelectedRunId(latestId)
    setRuns(await getLatestPipelineRuns(PIPELINE_TYPE_HISTORICALGAMES, latestId ?? undefined))
    setRunsLoading(false)
  }

  async function handleSelectRunId(runId: number) {
    setSelectedRunId(runId)
    setRunsLoading(true)
    setRuns(await getLatestPipelineRuns(PIPELINE_TYPE_HISTORICALGAMES, runId))
    setRunsLoading(false)
  }

  async function doRefreshAllStatus() {
    await Promise.all([doRefreshUpload(), doRefreshTree(), doRefreshTpos()])
    doRefreshRuns()
  }

  useEffect(() => {
    doRefreshRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1: Upload PGN Collection ──────────────────────────────────────────
  const [uploadRunning, setUploadRunning] = useState(false)
  const [uploadResult,  setUploadResult]  = useState<{ staged: number } | null>(null)
  const [uploadError,   setUploadError]   = useState('')

  async function handleUpload(forceNewRun: boolean = true) {
    if (!collection.trim() || !files || files.length === 0) return
    setUploadRunning(true)
    setUploadResult(null)
    setUploadError('')
    try {
      const texts = await Promise.all(Array.from(files).map(f => f.text()))
      const pgnText = texts.join('\n\n')
      const res = await fetch('/api/historicalgames/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collection.trim(), pgnText, newRun: forceNewRun })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setUploadResult({ staged: data.staged })
      doRefreshUpload()
      doRefreshRuns()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setUploadRunning(false)
    }
  }

  // ── Step 2: Deconstruct Historical Games ───────────────────────────────────
  const [deconRunning, setDeconRunning] = useState(false)
  const [deconResult,  setDeconResult]  = useState<{ processed: number; skipped: number; errors: number } | null>(null)
  const [deconError,   setDeconError]   = useState('')

  async function handleDeconstruct(forceNewRun: boolean = false) {
    setDeconRunning(true)
    setDeconResult(null)
    setDeconError('')
    try {
      const params = new URLSearchParams({ ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res = await fetch(`/api/historicalgames/deconstruct?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setDeconResult(data)
      doRefreshUpload()
      doRefreshRuns()
    } catch (err) {
      setDeconError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setDeconRunning(false)
    }
  }

  // ── Step 3: Build Master Position Tree (reuses the existing, global master- ──
  // games endpoint unchanged — no player filter, so it just picks up whatever's
  // outstanding, historical games included) ─────────────────────────────────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ gamesProcessed: number; positions: number; gamePositions: number } | null>(null)
  const [treeError,   setTreeError]   = useState('')

  async function handleBuildTree(forceNewRun: boolean = false) {
    setTreeRunning(true)
    setTreeResult(null)
    setTreeError('')
    try {
      const params = new URLSearchParams({ skipSync: 'true', ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res = await fetch(`/api/mastergames/build-tree?${params}`)
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

  // ── Step 4: Sync Master Position Tree (reuses the existing, global endpoint) ─
  const [tposRunning, setTposRunning] = useState(false)
  const [tposResult,  setTposResult]  = useState<{ positionsSynced: number } | null>(null)
  const [tposError,   setTposError]   = useState('')

  async function handleSyncTpos(forceNewRun: boolean = false) {
    setTposRunning(true)
    setTposResult(null)
    setTposError('')
    try {
      const params = new URLSearchParams({ ...(forceNewRun ? { newRun: 'true' } : {}) })
      const res = await fetch(`/api/mastergames/sync-tpos?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setTposResult(data)
      doRefreshTpos()
      doRefreshRuns()
    } catch (err) {
      setTposError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setTposRunning(false)
    }
  }

  // ── Run All ─────────────────────────────────────────────────────────────────
  const [runAllRunning, setRunAllRunning] = useState(false)
  async function handleRunAll() {
    if (!collection.trim() || !files || files.length === 0) return
    setRunAllRunning(true)
    setRuns([])
    await handleUpload(true)
    await doRefreshRuns()
    await handleDeconstruct(false)
    await doRefreshRuns()
    await handleBuildTree(false)
    await doRefreshRuns()
    await handleSyncTpos(false)
    await doRefreshRuns()
    setRunAllRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Historical Games Pipeline</h2>
      </div>
      <div className='flex items-center gap-3'>
        <label htmlFor='historical-collection' className='font-bold text-xs whitespace-nowrap'>Collection</label>
        <MyInput
          id='historical-collection'
          type='text'
          value={collection}
          onChange={e => setCollection(e.target.value)}
          placeholder='World Chess Championship 1886-2018'
          overrideClass='w-72 h-6 md:h-6'
        />
        <label htmlFor='historical-files' className='font-bold text-xs whitespace-nowrap'>PGN File(s)</label>
        <input
          id='historical-files'
          type='file'
          accept='.pgn'
          multiple
          onChange={e => setFiles(e.target.files)}
          className='text-xs'
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
                <MyButton onClick={handleRunAll} disabled={runAllRunning || !collection.trim() || !files || files.length === 0} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runAllRunning ? 'bg-red-300 hover:bg-red-300' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runAllRunning ? 'Running All...' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Step 1 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>1.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Upload PGN Collection</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='1. Upload PGN Collection'
                  input={['One or more uploaded .pgn files (browser file picker) + a collection label']}
                  processing='Splits the uploaded PGN text into individual games and stages them in wk_hpg_historicalpgnraw under the given collection label. Truncates the staging table first — a new upload always replaces whatever was staged from a previous, already-deconstructed collection.'
                  output={['wk_hpg_historicalpgnraw — one row per staged game (workfile)']}
                  consumers={['Step 2 Deconstruct Historical Games']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{uploadResult && <span>{n(uploadResult.staged)} staged</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_UPLOAD} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshUpload} disabled={sUploadLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sUploadLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sUpload?.staged)}</strong> staged</td>
              <td className='py-1 pr-2'>{uploadError && <p className='text-xs text-red-600'>{uploadError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleUpload()} disabled={uploadRunning || !collection.trim() || !files || files.length === 0} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${uploadRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {uploadRunning ? 'Uploading...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 2 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Deconstruct Historical Games</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2. Deconstruct Historical Games'
                  input={['wk_hpg_historicalpgnraw — games staged by step 1']}
                  processing="Parses each staged game's PGN headers directly (White/Black/Date/Result/Event/Round/ECO — no chess.com JSON involved). Auto-creates any missing tmst_master_players row for a White/Black name not already matched to an existing master (matched by surname, disambiguated by first name on a collision) — with mst_chesscom_handle left NULL for a genuinely new historical player. Inserts into tmgd_gamesdecon (White is always mgd_player). Idempotent: skips a game already present by natural key (White + Black + end_time + Round), since there's no chess.com UUID to dedup on."
                  output={['tmst_master_players — new rows for any previously-untracked historical player', 'tmgd_gamesdecon — one row per deconstructed game']}
                  consumers={['Step 3 Build Master Position Tree']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{deconResult && <span>{n(deconResult.processed)} processed, {n(deconResult.skipped)} skipped, {n(deconResult.errors)} errors</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_DECON} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshUpload} disabled={sUploadLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sUploadLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sUpload?.decon)}</strong> historical games deconstructed</td>
              <td className='py-1 pr-2'>{deconError && <p className='text-xs text-red-600'>{deconError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleDeconstruct()} disabled={deconRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${deconRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
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
                  input={['tmgd_gamesdecon — deconstructed games from step 2 (and any chess.com-synced games)']}
                  processing='Reuses the existing /owner/pipelinemastergames Step 2 unchanged (buildPositionTree_Master) — global, no player filter, so it picks up whatever is outstanding, historical games included.'
                  output={['tmgam_game_positions — per-game (position, move-played) rows']}
                  consumers={['Step 4 Sync Master Position Tree']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{treeResult && <span>{n(treeResult.gamesProcessed)} games, {n(treeResult.gamePositions)} game-positions</span>}</td>
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

            {/* Step 4 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>4.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Sync Master Position Tree</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='4. Sync Master Position Tree'
                  input={['tmgam_game_positions — rows with mgam_pos_id / mgam_resulting_pos_id still NULL']}
                  processing='Reuses the existing /owner/pipelinemastergames Step 3 unchanged (syncTposFromTgam_Master) — idempotent, self-scoping via the NULL markers.'
                  output={['tmpos_positions — unique FEN positions, with mpos_reached', 'tmgam_game_positions.mgam_pos_id / mgam_resulting_pos_id — backfilled']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{tposResult && <span>{n(tposResult.positionsSynced)} positions synced</span>}</td>
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
