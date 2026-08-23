'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import MySelect from 'nextjs-shared/MySelect'
import {
  refreshFideZipStatus, refreshFideXmlStatus, refreshFideParsedStatus, refreshFideTaggedCount
} from '@/src/lib/actions/fidePipelineStatus'
import { getLatestPipelineRuns, getRecentRunIds } from '@/src/lib/actions/pipelineLog'
import { FIDE_TOP_RATING_CUTOFF, FIDE_XML_CHUNK_SIZE } from '@/src/lib/constants'

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
  { step: 10, label: 'Download FIDE Zip' },
  { step: 11, label: 'Unzip FIDE File' },
  { step: 12, label: 'Parse FIDE XML' },
  { step: 13, label: 'Populate FIDE Top Players' },
  { step: 14, label: 'Refresh FIDE Ratings' },
]

function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}

const SQL_STATUS_ZIP = `SELECT COALESCE(octet_length(fzp_data), 0) AS bytes FROM tfzp_fide_zip LIMIT 1;`
const SQL_STATUS_XML = `SELECT COUNT(*) AS chunks, COALESCE(SUM(LENGTH(fxm_data)), 0) AS chars FROM tfxm_fide_xml;`
const SQL_STATUS_PARSED = `SELECT COUNT(*) AS players FROM tfpl_fide_players;`
const SQL_STATUS_TAGGED = `SELECT COUNT(*) AS tagged FROM tmst_master_players WHERE mst_fideid IS NOT NULL;`

export default function PipelineMastersPage() {
  // ── Status ──────────────────────────────────────────────────────────────────
  const [sZip, setSZip] = useState<{ bytes: number } | null>(null)
  const [sXml, setSXml] = useState<{ chunks: number; chars: number } | null>(null)
  const [sParsed, setSParsed] = useState<{ players: number } | null>(null)
  const [sTop, setSTop] = useState<{ tagged: number } | null>(null)
  const [sRefresh, setSRefresh] = useState<{ tagged: number } | null>(null)
  const [sZipLoading, setSZipLoading] = useState(false)
  const [sXmlLoading, setSXmlLoading] = useState(false)
  const [sParsedLoading, setSParsedLoading] = useState(false)
  const [sTopLoading, setSTopLoading] = useState(false)
  const [sRefreshLoading, setSRefreshLoading] = useState(false)

  const [runs, setRuns] = useState<LatestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [recentRunIds, setRecentRunIds] = useState<number[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  async function doRefreshZip()     { setSZipLoading(true);     setSZip(await refreshFideZipStatus());       setSZipLoading(false) }
  async function doRefreshXml()     { setSXmlLoading(true);     setSXml(await refreshFideXmlStatus());       setSXmlLoading(false) }
  async function doRefreshParsed()  { setSParsedLoading(true);  setSParsed(await refreshFideParsedStatus()); setSParsedLoading(false) }
  async function doRefreshTop()     { setSTopLoading(true);     setSTop(await refreshFideTaggedCount());     setSTopLoading(false) }
  async function doRefreshRefresh() { setSRefreshLoading(true); setSRefresh(await refreshFideTaggedCount()); setSRefreshLoading(false) }

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

  async function doRefreshAllStatus() {
    await Promise.all([doRefreshZip(), doRefreshXml(), doRefreshParsed(), doRefreshTop(), doRefreshRefresh()])
    doRefreshRuns()
  }

  useEffect(() => {
    doRefreshAllStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 10: Download FIDE Zip ─────────────────────────────────────────────
  const [downloadRunning, setDownloadRunning] = useState(false)
  const [downloadResult,  setDownloadResult]  = useState<{ bytes: number } | null>(null)
  const [downloadError,   setDownloadError]   = useState('')

  async function handleDownload(forceNewRun: boolean = true) {
    setDownloadRunning(true)
    setDownloadResult(null)
    setDownloadError('')
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/fide/download-zip?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setDownloadResult(data)
      doRefreshZip()
      doRefreshRuns()
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setDownloadRunning(false)
    }
  }

  // ── Step 11: Unzip FIDE File ────────────────────────────────────────────────
  const [unzipRunning, setUnzipRunning] = useState(false)
  const [unzipResult,  setUnzipResult]  = useState<{ chunks: number; chars: number } | null>(null)
  const [unzipError,   setUnzipError]   = useState('')

  async function handleUnzip(forceNewRun: boolean = true) {
    setUnzipRunning(true)
    setUnzipResult(null)
    setUnzipError('')
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/fide/unzip?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setUnzipResult(data)
      doRefreshXml()
      doRefreshRuns()
    } catch (err) {
      setUnzipError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setUnzipRunning(false)
    }
  }

  // ── Step 12: Parse FIDE XML ─────────────────────────────────────────────────
  const [parseRunning, setParseRunning] = useState(false)
  const [parseResult,  setParseResult]  = useState<{ parsed: number } | null>(null)
  const [parseError,   setParseError]   = useState('')

  async function handleParse(forceNewRun: boolean = true) {
    setParseRunning(true)
    setParseResult(null)
    setParseError('')
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/fide/parse?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setParseResult(data)
      doRefreshParsed()
      doRefreshRuns()
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setParseRunning(false)
    }
  }

  // ── Step 13: Populate FIDE Top Players ──────────────────────────────────────
  const [topRunning, setTopRunning] = useState(false)
  const [topResult,  setTopResult]  = useState<{ processed: number; inserted: number; updated: number } | null>(null)
  const [topError,   setTopError]   = useState('')

  async function handlePopulateTopPlayers(forceNewRun: boolean = true) {
    setTopRunning(true)
    setTopResult(null)
    setTopError('')
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/fide/populate-top-players?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setTopResult(data)
      doRefreshTop()
      doRefreshRefresh()
      doRefreshRuns()
    } catch (err) {
      setTopError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setTopRunning(false)
    }
  }

  // ── Step 14: Refresh FIDE Ratings ───────────────────────────────────────────
  const [refreshRunning, setRefreshRunning] = useState(false)
  const [refreshResult,  setRefreshResult]  = useState<{ updated: number } | null>(null)
  const [refreshError,   setRefreshError]   = useState('')

  async function handleRefreshRatings(forceNewRun: boolean = true) {
    setRefreshRunning(true)
    setRefreshResult(null)
    setRefreshError('')
    try {
      const params = new URLSearchParams(forceNewRun ? { newRun: 'true' } : {})
      const res  = await fetch(`/api/fide/refresh-ratings?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setRefreshResult(data)
      doRefreshRefresh()
      doRefreshRuns()
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRefreshRunning(false)
    }
  }

  // ── Run All: every stage in order, sharing one run_id ──────────────────────
  const [runAllRunning, setRunAllRunning] = useState(false)
  async function handleRunAll() {
    setRunAllRunning(true)
    setRuns([])
    await handleDownload(true)
    await doRefreshRuns()
    await handleUnzip(false)
    await doRefreshRuns()
    await handleParse(false)
    await doRefreshRuns()
    await handlePopulateTopPlayers(false)
    await doRefreshRuns()
    await handleRefreshRatings(false)
    await doRefreshRuns()
    setRunAllRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>FIDE Master Players Pipeline</h2>
      </div>

      {/* Jobs summary */}
      <MyBox>
        <div className='flex items-center gap-2 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline Jobs —</h3>
          <MySelect
            options={recentRunIds.map(id => `Run #${id}`)}
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
                <MyButton onClick={handleRunAll} disabled={runAllRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runAllRunning ? 'bg-red-300 hover:bg-red-300' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runAllRunning ? 'Running All...' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Step 10 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>10.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Download FIDE Zip</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='10. Download FIDE Zip'
                  input={["FIDE's monthly standard rating list zip (external download)"]}
                  processing='Downloads the zipped standard rating list and stores the raw bytes in tfzp_fide_zip (single row, truncated and refilled every run). A separate, independently re-runnable stage — nothing further down the pipeline needs to re-download if it fails.'
                  output={['tfzp_fide_zip.fzp_data — the raw downloaded zip bytes']}
                  consumers={['Step 11 Unzip FIDE File']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{downloadResult && <span>{n(downloadResult.bytes)} bytes</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_ZIP} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshZip} disabled={sZipLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sZipLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sZip?.bytes)}</strong> bytes staged</td>
              <td className='py-1 pr-2'>{downloadError && <p className='text-xs text-red-600'>{downloadError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleDownload()} disabled={downloadRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${downloadRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {downloadRunning ? 'Downloading...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 11 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>11.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Unzip FIDE File</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='11. Unzip FIDE File'
                  input={['tfzp_fide_zip — the zip staged by step 10']}
                  processing={`Decompresses the single entry and writes the decompressed text into tfxm_fide_xml in ${FIDE_XML_CHUNK_SIZE.toLocaleString()}-character chunks (a StringDecoder is used so a multi-byte UTF-8 character split across two incoming stream chunks is never corrupted). Chunked storage keeps both this stage's writes and step 12's reads bounded to roughly one chunk in memory at a time, rather than the full ~158MB file.`}
                  output={['tfxm_fide_xml — decompressed XML text, one row per chunk (fxm_seq, fxm_data)']}
                  consumers={['Step 12 Parse FIDE XML']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{unzipResult && <span>{n(unzipResult.chunks)} chunks, {n(unzipResult.chars)} chars</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_XML} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshXml} disabled={sXmlLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sXmlLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sXml?.chunks)}</strong> chunks staged</td>
              <td className='py-1 pr-2'>{unzipError && <p className='text-xs text-red-600'>{unzipError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleUnzip()} disabled={unzipRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${unzipRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {unzipRunning ? 'Unzipping...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 12 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>12.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Parse FIDE XML</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='12. Parse FIDE XML'
                  input={['tfxm_fide_xml — chunks staged by step 11']}
                  processing={`Reads the chunks back in ordered batches (never one giant SELECT of every chunk), feeding each into a streaming SAX parser as it arrives, and batch-inserts every qualifying player into tfpl_fide_players (truncated and fully repopulated every run) — filtered at this stage to active players rated >= ${FIDE_TOP_RATING_CUTOFF} (not the full ~562K-player FIDE list), so a player who later drops below the cutoff simply stops being refreshable by step 14.`}
                  output={['tfpl_fide_players — one row per qualifying FIDE player: fideid, first/last name, rating']}
                  consumers={['Step 13 Populate FIDE Top Players', 'Step 14 Refresh FIDE Ratings']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{parseResult && <span>{n(parseResult.parsed)} parsed</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_PARSED} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshParsed} disabled={sParsedLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sParsedLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sParsed?.players)}</strong> players staged</td>
              <td className='py-1 pr-2'>{parseError && <p className='text-xs text-red-600'>{parseError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleParse()} disabled={parseRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${parseRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {parseRunning ? 'Parsing...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 13 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>13.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Populate FIDE Top Players</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='13. Populate FIDE Top Players'
                  input={[`tfpl_fide_players — active players rated >= ${FIDE_TOP_RATING_CUTOFF}`]}
                  processing="Pure DB-to-DB — no download or parsing here, so re-running after fixing a bug is fast. Full recompute every run (no safe incremental cursor — the top-rated set itself shifts month to month). For each qualifying FIDE player: updates mst_grade only if a tmst_master_players row is already linked by mst_fideid; else attaches mst_fideid to an existing unlinked row matched by surname (case-insensitive, disambiguated by first name on a collision); else inserts a brand-new row with names taken from FIDE data. Names are only ever written on insert — never touched on update, so a manual name correction in pgAdmin is permanent."
                  output={['tmst_master_players.mst_fideid / mst_grade / mst_first_name / mst_last_name']}
                  consumers={['Step 14 Refresh FIDE Ratings', '/owner/masterplayers — FIDE ID column']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{topResult && <span>{n(topResult.inserted)} inserted, {n(topResult.updated)} updated</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_TAGGED} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshTop} disabled={sTopLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sTopLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sTop?.tagged)}</strong> tagged</td>
              <td className='py-1 pr-2'>{topError && <p className='text-xs text-red-600'>{topError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handlePopulateTopPlayers()} disabled={topRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${topRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {topRunning ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 14 */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>14.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Refresh FIDE Ratings</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='14. Refresh FIDE Ratings'
                  input={['tmst_master_players — rows with mst_fideid already set', 'tfpl_fide_players']}
                  processing='Pure DB-to-DB. For every tmst_master_players row already linked to a FIDE id, looks up its current rating by fideid (not name) in tfpl_fide_players and updates mst_grade only — names are never touched.'
                  output={['tmst_master_players.mst_grade — refreshed for every FIDE-linked row']}
                  consumers={['/owner/masterplayers — Grade column']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>{refreshResult && <span>{n(refreshResult.updated)} ratings refreshed</span>}</td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_TAGGED} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshRefresh} disabled={sRefreshLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sRefreshLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sRefresh?.tagged)}</strong> tagged</td>
              <td className='py-1 pr-2'>{refreshError && <p className='text-xs text-red-600'>{refreshError}</p>}</td>
              <td className='py-1'>
                <MyButton onClick={() => handleRefreshRatings()} disabled={refreshRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${refreshRunning ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {refreshRunning ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>
          </tbody>
        </table>
      </MyBox>

    </div>
  )
}
