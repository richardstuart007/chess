'use server'

import { StringDecoder } from 'node:string_decoder'
import yauzl from 'yauzl'
import sax from 'sax'
import { write_logging } from 'nextjs-shared/write_logging'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { table_query } from 'nextjs-shared/table_query'
import { logStart, logEnd } from '../logStep'
import { logPipelineStep } from '../actions/pipelineLog'
import { FIDE_STANDARD_RATING_LIST_URL, FIDE_XML_CHUNK_SIZE, FIDE_XML_READ_BATCH_CHUNKS, FIDE_TOP_RATING_CUTOFF, POSITION_INSERT_CHUNK_SIZE_Player, PIPELINE_TYPE_MASTERS } from '../constants'

const FIDE_SOURCE_LABEL = 'FIDE standard rating list'

//----------------------------------------------------------------------------------
//  splitFideName — FIDE's standard format is "Last, First"; a handful of entries
//  (mostly Indian federation registrations, e.g. "Gukesh D") have no comma at all, in
//  which case the whole string becomes lastName and firstName is left blank — the
//  user corrects these by hand in pgAdmin as they're identified.
//----------------------------------------------------------------------------------
function splitFideName(name: string): { firstName: string; lastName: string } {
  const commaIndex = name.indexOf(',')
  if (commaIndex === -1) return { firstName: '', lastName: name.trim() }
  return { firstName: name.slice(commaIndex + 1).trim(), lastName: name.slice(0, commaIndex).trim() }
}

//----------------------------------------------------------------------------------
//  downloadFideZip — pipeline stage 1 (step 1). Downloads FIDE's monthly zipped
//  standard rating list into wk_fzp_fide_zip (single row, truncated and refilled every
//  run) — a separate, independently re-runnable stage so a failure further down the
//  pipeline (unzip/parse/match) never requires re-downloading. Stored as base64 text
//  rather than bytea — nextjs-shared's table_write/table_query typed helpers don't
//  support Buffer values (worth amending there later); base64 text sidesteps the gap
//  with the existing typed API.
//----------------------------------------------------------------------------------
export async function downloadFideZip(level: number = 1, forceNewRun?: boolean): Promise<{ bytes: number }> {
  await logStart('downloadFideZip', 'fideStagingRoute', 'downloading FIDE standard rating list zip', level)
  const t0 = Date.now()

  const res = await fetch(FIDE_STANDARD_RATING_LIST_URL)
  if (!res.ok) throw new Error(`FIDE zip download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())

  await table_truncate('wk_fzp_fide_zip', 'downloadFideZip', false, level, 'I')
  await table_write({
    caller: 'downloadFideZip',
    table: 'wk_fzp_fide_zip',
    columnValuePairs: [{ column: 'fzp_data', value: buffer.toString('base64') }]
  })

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 1, subStep: 'a', stepName: 'Download FIDE Zip', pipelineType: PIPELINE_TYPE_MASTERS,
    inputTable: FIDE_SOURCE_LABEL, inputRecs: 1,
    outputTable: 'wk_fzp_fide_zip', outputRecs: buffer.length,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'downloadFideZip', lg_caller: 'fideStagingRoute',
    lg_msg: `Downloaded ${buffer.length} bytes`, lg_severity: 'I'
  })
  await logEnd('downloadFideZip', 'fideStagingRoute', `${buffer.length} bytes`, level)
  return { bytes: buffer.length }
}

//----------------------------------------------------------------------------------
//  unzipFideZip — pipeline stage 2 (step 2). Reads the zip bytes staged by
//  downloadFideZip, decompresses the single entry, and writes the decompressed text
//  into wk_fxm_fide_xml in fixed-size chunks (FIDE_XML_CHUNK_SIZE characters each) — a
//  StringDecoder is used (not naive Buffer->string per chunk) so a multi-byte UTF-8
//  character split across two incoming data events never gets corrupted. Chunked
//  storage (rather than one ~158MB row) keeps both this stage's writes and
//  parseFideXml's reads bounded to roughly one chunk in memory at a time.
//----------------------------------------------------------------------------------
export async function unzipFideZip(level: number = 1, forceNewRun?: boolean): Promise<{ chunks: number; chars: number }> {
  await logStart('unzipFideZip', 'fideStagingRoute', 'decompressing FIDE zip', level)
  const t0 = Date.now()

  const zipResult = await table_fetch({
    caller: 'unzipFideZip',
    table: 'wk_fzp_fide_zip',
    columns: ['fzp_data']
  })
  if (!zipResult.ok) throw new Error('Failed to fetch wk_fzp_fide_zip: ' + zipResult.error)
  if (zipResult.data.length === 0) throw new Error('wk_fzp_fide_zip is empty — run Download FIDE Zip first')
  const zipBuffer = Buffer.from(zipResult.data[0].fzp_data as string, 'base64')

  await table_truncate('wk_fxm_fide_xml', 'unzipFideZip', false, level, 'I')

  let seq = 0
  let totalChars = 0
  let pending = ''

  async function writeChunk(piece: string): Promise<void> {
    await table_write({
      caller: 'unzipFideZip',
      table: 'wk_fxm_fide_xml',
      columnValuePairs: [
        { column: 'fxm_seq', value: seq },
        { column: 'fxm_data', value: piece }
      ]
    })
    seq++
    totalChars += piece.length
  }

  async function flushFullChunks(): Promise<void> {
    while (pending.length >= FIDE_XML_CHUNK_SIZE) {
      const piece = pending.slice(0, FIDE_XML_CHUNK_SIZE)
      pending = pending.slice(FIDE_XML_CHUNK_SIZE)
      await writeChunk(piece)
    }
  }

  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zf) => {
      if (err || !zf) reject(err ?? new Error('Failed to open FIDE zip')); else resolve(zf)
    })
  })

  const decoder = new StringDecoder('utf8')

  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject)
    zipfile.on('entry', entry => {
      zipfile.openReadStream(entry, (err, readStream) => {
        if (err || !readStream) { reject(err ?? new Error('Failed to open FIDE zip entry')); return }
        readStream.on('error', reject)
        readStream.on('data', (chunk: Buffer) => {
          readStream.pause()
          pending += decoder.write(chunk)
          flushFullChunks().then(() => readStream.resume()).catch(reject)
        })
        readStream.on('end', () => {
          pending += decoder.end()
          flushFullChunks()
            .then(() => (pending.length > 0 ? writeChunk(pending) : Promise.resolve()))
            .then(resolve)
            .catch(reject)
        })
      })
    })
    zipfile.readEntry()
  })

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 2, subStep: 'a', stepName: 'Unzip FIDE File', pipelineType: PIPELINE_TYPE_MASTERS,
    inputTable: 'wk_fzp_fide_zip', inputRecs: zipBuffer.length,
    outputTable: 'wk_fxm_fide_xml', outputRecs: totalChars,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'unzipFideZip', lg_caller: 'fideStagingRoute',
    lg_msg: `Decompressed ${totalChars} characters across ${seq} chunks`, lg_severity: 'I'
  })
  await logEnd('unzipFideZip', 'fideStagingRoute', `${seq} chunks`, level)
  return { chunks: seq, chars: totalChars }
}

//----------------------------------------------------------------------------------
//  parseFideXml — pipeline stage 3 (step 3). Reads wk_fxm_fide_xml back in ordered
//  batches of FIDE_XML_READ_BATCH_CHUNKS chunks at a time (never one giant SELECT of
//  every chunk), feeding each into a SAX parser as it arrives, and batch-inserts
//  parsed player rows into tfpl_fide_players (truncated and fully repopulated every
//  run) as they accumulate — bounding memory on both the read and parse side.
//  Filtered at this stage (active only, rating >= FIDE_TOP_RATING_CUTOFF) — user
//  decision: tfpl_fide_players only ever holds the players actually wanted, not a
//  full ~562K-player snapshot, accepting that a player who later drops below the
//  cutoff simply stops being refreshable by step 14.
//----------------------------------------------------------------------------------
export async function parseFideXml(level: number = 1, forceNewRun?: boolean): Promise<{ parsed: number }> {
  await logStart('parseFideXml', 'fideStagingRoute', 'parsing FIDE XML into structured rows', level)
  const t0 = Date.now()

  const countResult = await table_query({
    caller: 'parseFideXml_count', table: 'wk_fxm_fide_xml', params: [], skipCache: true,
    query: `SELECT COUNT(*) AS cnt FROM wk_fxm_fide_xml`
  })
  if (!countResult.ok) throw new Error('Failed to count wk_fxm_fide_xml: ' + countResult.error)
  const totalChunks = parseInt(countResult.data[0]?.cnt ?? '0')
  if (totalChunks === 0) throw new Error('wk_fxm_fide_xml is empty — run Unzip FIDE File first')

  await table_truncate('tfpl_fide_players', 'parseFideXml', false, level, 'I')

  type ParsedPlayer = { fideid: number; firstName: string; lastName: string; rating: number }
  let pendingRows: ParsedPlayer[] = []
  let parsedCount = 0

  async function flushPendingRows(): Promise<void> {
    if (pendingRows.length === 0) return
    for (let i = 0; i < pendingRows.length; i += POSITION_INSERT_CHUNK_SIZE_Player) {
      const batch = pendingRows.slice(i, i + POSITION_INSERT_CHUNK_SIZE_Player)
      const values = batch.map((_, j) => {
        const b = j * 4
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`
      }).join(',')
      const params = batch.flatMap(r => [r.fideid, r.firstName, r.lastName, r.rating])
      await table_query({
        caller: 'parseFideXml_insert',
        query: `INSERT INTO tfpl_fide_players (fpl_fideid, fpl_first_name, fpl_last_name, fpl_rating) VALUES ${values}`,
        params,
        table: 'tfpl_fide_players',
        level, isupdate: true, severity: 'I'
      })
    }
    parsedCount += pendingRows.length
    pendingRows = []
  }

  const parser = sax.createStream(false, { trim: true })
  let currentTag = ''
  let fideid = 0, name = '', rating = 0, flag = ''

  //
  //  This version of sax uppercases tag names in non-strict mode ("PLAYER", "FIDEID", ...) rather
  //  than lowercasing them — normalize with toLowerCase() here instead of depending on sax's exact
  //  casing convention.
  //
  parser.on('opentag', (node: { name: string }) => { currentTag = node.name.toLowerCase() })
  parser.on('text', (text: string) => {
    if (currentTag === 'fideid')      fideid = parseInt(text, 10) || 0
    else if (currentTag === 'name')   name = text
    else if (currentTag === 'rating') rating = parseInt(text, 10) || 0
    else if (currentTag === 'flag')   flag = text
  })
  parser.on('closetag', (tagName: string) => {
    if (tagName.toLowerCase() === 'player') {
      if (flag === '' && rating >= FIDE_TOP_RATING_CUTOFF) {
        const { firstName, lastName } = splitFideName(name)
        pendingRows.push({ fideid, firstName, lastName, rating })
      }
      fideid = 0; name = ''; rating = 0; flag = ''
    }
  })

  await new Promise<void>((resolve, reject) => {
    parser.on('error', reject)
    parser.on('end', resolve)
    ;(async () => {
      for (let offset = 0; offset < totalChunks; offset += FIDE_XML_READ_BATCH_CHUNKS) {
        const batchResult = await table_query({
          caller: 'parseFideXml_readBatch',
          query: `SELECT fxm_data FROM wk_fxm_fide_xml WHERE fxm_seq >= $1 AND fxm_seq < $2 ORDER BY fxm_seq`,
          params: [offset, offset + FIDE_XML_READ_BATCH_CHUNKS],
          table: 'wk_fxm_fide_xml',
          level, isupdate: false, severity: 'I', skipCache: true
        })
        if (!batchResult.ok) throw new Error('Failed to read FIDE xml batch: ' + batchResult.error)
        for (const row of batchResult.data) {
          parser.write(row.fxm_data as string)
          await flushPendingRows()
        }
      }
      parser.end()
    })().catch(reject)
  })
  await flushPendingRows()

  const durationMs = Date.now() - t0
  await logPipelineStep({
    step: 3, subStep: 'a', stepName: 'Parse FIDE XML', pipelineType: PIPELINE_TYPE_MASTERS,
    inputTable: 'wk_fxm_fide_xml', inputRecs: totalChunks,
    outputTable: 'tfpl_fide_players', outputRecs: parsedCount,
    durationMs, forceNewRun
  })
  await write_logging({
    lg_functionname: 'parseFideXml', lg_caller: 'fideStagingRoute',
    lg_msg: `Parsed ${parsedCount} FIDE players`, lg_severity: 'I'
  })
  await logEnd('parseFideXml', 'fideStagingRoute', `${parsedCount} players`, level)
  return { parsed: parsedCount }
}
