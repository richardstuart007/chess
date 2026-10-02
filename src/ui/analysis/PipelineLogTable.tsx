'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PipelineLogTable — paginated/filterable viewer for tpip_pipelinelog, adapted from
//    nextjs-shared's OwnerTableLogging (xlg_logging viewer) pattern.
//==================================================================================================

import { useState, useEffect, useRef } from 'react'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import { fetchTotalRows } from 'nextjs-shared/fetchTotalRows'
import type { Filter } from 'nextjs-shared/structures'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { MyInput } from 'nextjs-shared/MyInput'
import PipelineTypeSelect from '@/src/ui/filters/PipelineTypeSelect'
import { PIPELINE_LOG_ROWS_PER_PAGE, PIPELINE_LOG_ROWS_OPTIONS } from '@/src/lib/constants'

type PipelineLogRow = {
  pip_pipid:          number
  pip_pipeline_type:  string
  pip_step:           number
  pip_sub_step:       string
  pip_step_name:      string
  pip_input_table:    string
  pip_input_recs:     number
  pip_output_table:   string
  pip_output_recs:    number
  pip_duration_ms:    number
  pip_created:        string
  pip_run_id:         number
}

export default function PipelineLogTable() {
  const [pipelineType, setPipelineType] = useState('')
  const [step, setStep] = useState('')
  const [stepName, setStepName] = useState('')
  const [run, setRun] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(PIPELINE_LOG_ROWS_PER_PAGE)
  const [pipelinelog, setPipelinelog] = useState<PipelineLogRow[]>([])
  const [totalPages, setTotalPages] = useState<number>(0)
  const [totalRows, setTotalRows] = useState<number>(0)
  const [message, setMessage] = useState('')
  const [popup, setPopup] = useState<PipelineLogRow | null>(null)

  const functionName = 'PipelineLogTable'
  const prevFilters = useRef({ pipelineType: '', step: '', stepName: '', run: '' })

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const filtersChanged = pipelineType !== prevFilters.current.pipelineType || step !== prevFilters.current.step || stepName !== prevFilters.current.stepName || run !== prevFilters.current.run
    setMessage(filtersChanged ? 'Applying filters...' : '')
    const timeout = filtersChanged ? 2000 : 1
    const handler = setTimeout(() => {
      prevFilters.current = { pipelineType, step, stepName, run }
      fetchdata()
      setMessage('')
    }, timeout)
    return () => clearTimeout(handler)
  }, [pipelineType, step, stepName, run, currentPage, rowsPerPage])

  //----------------------------------------------------------------------------------------------
  //  fetchdata — fetches the pipeline-log rows for the selected pipeline type, step, step name and run
  //----------------------------------------------------------------------------------------------
  async function fetchdata() {
    const filtersToUpdate: Filter[] = [
      { column: 'pip_pipeline_type', value: pipelineType, operator: '=' },
      { column: 'pip_step', value: step, operator: '=' },
      { column: 'pip_step_name', value: stepName, operator: 'LIKE' },
      { column: 'pip_run_id', value: run, operator: '=' }
    ]
    const filters = filtersToUpdate.filter(filter => filter.value)
    try {
      const table = 'tpip_pipelinelog'
      const offset = (currentPage - 1) * rowsPerPage
      const dataResult = await fetchFiltered({
        caller: functionName,
        table,
        filters,
        orderBy: 'pip_pipid DESC',
        limit: rowsPerPage,
        offset,
        skipCache: true
      })
      if (!dataResult.ok) throw new Error(dataResult.error ?? 'fetchFiltered failed')
      setPipelinelog(dataResult.data)
      const totalPagesResult = await fetchTotalPages({
        caller: functionName,
        table,
        filters,
        items_per_page: rowsPerPage,
        skipCache: true
      })
      if (!totalPagesResult.ok) throw new Error(totalPagesResult.error ?? 'fetchTotalPages failed')
      setTotalPages(totalPagesResult.data)
      const totalRowsResult = await fetchTotalRows({
        caller: functionName,
        table,
        filters,
        skipCache: true
      })
      if (!totalRowsResult.ok) throw new Error(totalRowsResult.error ?? 'fetchTotalRows failed')
      setTotalRows(totalRowsResult.data)
    } catch (error) {
      console.error('Error fetching pipeline log:', error)
    }
  }

  const pipelineLogRows = pipelinelog ?? []
  const showNoData = pipelineLogRows.length === 0

  return (
    <div className='bg-orange-50'>
      <div className='flex gap-4 bg-yellow-100'>
        <div className='shrink-0 bg-pink-100'>
          <table className='text-gray-900 table-fixed'>
            <thead className='sticky top-0 z-10 bg-teal-100 text-left font-normal text-xxs'>
              <tr>
                <th scope='col' className='font-medium px-2 w-10'>ID</th>
                <th scope='col' className='font-medium px-2 w-14 text-center'>Run</th>
                <th scope='col' className='font-medium px-2 w-32'>Type</th>
                <th scope='col' className='font-medium px-2 w-14 text-center'>Step</th>
                <th scope='col' className='font-medium px-2 w-96'>Step Name</th>
                <th scope='col' className='font-medium px-2 w-44'>Created</th>
                <th scope='col' className='font-medium px-2 w-32'>Input Table</th>
                <th scope='col' className='font-medium px-2 w-20 text-right'>Input Recs</th>
                <th scope='col' className='font-medium px-2 w-32'>Output Table</th>
                <th scope='col' className='font-medium px-2 w-20 text-right'>Output Recs</th>
                <th scope='col' className='font-medium px-2 w-24 text-center'>Duration (ms)</th>
              </tr>
              <tr className='text-xxs align-bottom'>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'>
                  <div className='text-center'>
                    <MyInput
                      id='run'
                      name='run'
                      overrideClass='w-full rounded-md border border-blue-500 font-normal text-xxs text-center'
                      type='text'
                      value={run}
                      onChange={e => setRun(e.target.value)}
                    />
                  </div>
                </th>
                <th scope='col' className='px-2'>
                  <PipelineTypeSelect value={pipelineType} onChange={setPipelineType} width='w-full' />
                </th>
                <th scope='col' className='px-2'>
                  <div className='text-center'>
                    <MyInput
                      id='step'
                      name='step'
                      overrideClass='w-full rounded-md border border-blue-500 font-normal text-xxs text-center'
                      type='text'
                      value={step}
                      onChange={e => setStep(e.target.value)}
                    />
                  </div>
                </th>
                <th scope='col' className='px-2'>
                  <MyInput
                    id='stepName'
                    name='stepName'
                    overrideClass='w-full rounded-md border border-blue-500 font-normal text-xxs'
                    type='text'
                    value={stepName}
                    onChange={e => setStepName(e.target.value)}
                  />
                </th>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'></th>
                <th scope='col' className='px-2'></th>
              </tr>
            </thead>
            <tbody className='bg-sky-50 text-xxs'>
              {pipelineLogRows.map(row => {
                const rowClass = `w-full border-b border-gray-100 cursor-pointer ${popup?.pip_pipid === row.pip_pipid ? 'bg-blue-100' : 'hover:bg-blue-50'}`
                const rowStepLabel = stepLabel(row)
                const createdLabel = formatCreated(row.pip_created)
                const inputRecsLabel = row.pip_input_recs.toLocaleString()
                const outputRecsLabel = row.pip_output_recs.toLocaleString()
                return (
                  <tr
                    key={row.pip_pipid}
                    className={rowClass}
                    onClick={() => setPopup(row)}
                  >
                    <td className='px-2 text-xxs'>{row.pip_pipid}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_run_id}</td>
                    <td className='px-2 text-xxs'>{row.pip_pipeline_type}</td>
                    <td className='px-2 text-center text-xxs'>{rowStepLabel}</td>
                    <td className='px-2 text-xxs'>{row.pip_step_name}</td>
                    <td className='px-2 text-xxs'>{createdLabel}</td>
                    <td className='px-2 text-xxs'>{row.pip_input_table}</td>
                    <td className='px-2 text-right text-xxs'>{inputRecsLabel}</td>
                    <td className='px-2 text-xxs'>{row.pip_output_table}</td>
                    <td className='px-2 text-right text-xxs'>{outputRecsLabel}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_duration_ms}</td>
                  </tr>
                )
              })}
              {showNoData && (
                <tr>
                  <td colSpan={11}>No data available</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className='text-red-600'>{message}</p>
          <div className='mt-2'>
            <MyPaginationFooter
              totalPages={totalPages}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={v => { setRowsPerPage(v); setCurrentPage(1) }}
              rowsOptions={PIPELINE_LOG_ROWS_OPTIONS}
              totalRows={totalRows}
            />
          </div>
        </div>

        {popup && (
          <div className='w-[28rem] pl-4 shrink-0'>
            <PipelineLogDetail row={popup} />
          </div>
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  stepLabel — "3a"-style combined step + sub-step label
//
//  Params:
//    row — a pipeline-log row
//
//  Returns:
//    the step number followed by its sub-step, e.g. '3a'
//----------------------------------------------------------------------------------------------
function stepLabel(row: PipelineLogRow): string {
  return `${row.pip_step}${row.pip_sub_step}`
}

//----------------------------------------------------------------------------------------------
//  formatCreated — local-time timestamp, 24-hour clock
//
//  Params:
//    pipCreated — the row's pip_created timestamp
//
//  Returns:
//    the timestamp in local time, 24-hour clock
//----------------------------------------------------------------------------------------------
function formatCreated(pipCreated: string): string {
  const result = new Date(pipCreated).toLocaleString(undefined, { hour12: false })
  return result
}

//----------------------------------------------------------------------------------------------
//  PipelineLogDetail — full-row detail panel for a selected tpip_pipelinelog row
//
//  Params:
//    row — the pipeline-log row to show
//
//  Returns:
//    the row's detail view
//----------------------------------------------------------------------------------------------
function PipelineLogDetail({ row }: { row: PipelineLogRow }) {
  const rowStepLabel = stepLabel(row)
  const createdLabel = formatCreated(row.pip_created)
  return (
    <div>
      <h3 className='text-sm font-semibold text-gray-700 mb-3'>Pipeline Run Detail</h3>

      <div className='grid grid-cols-3 gap-2 mb-3 text-xs'>
        <div>
          <span className='font-medium text-gray-500'>ID: </span>
          {row.pip_pipid}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Type: </span>
          {row.pip_pipeline_type}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Step: </span>
          {rowStepLabel}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Run: </span>
          {row.pip_run_id}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Created: </span>
          {createdLabel}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Duration: </span>
          {row.pip_duration_ms}ms
        </div>
        <div>
          <span className='font-medium text-gray-500'>Input Table: </span>
          {row.pip_input_table}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Input Recs: </span>
          {row.pip_input_recs}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Output Table: </span>
          {row.pip_output_table}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Output Recs: </span>
          {row.pip_output_recs}
        </div>
      </div>

      <div>
        <p className='text-xs font-medium text-gray-500 mb-1'>Step Name:</p>
        <p className='text-xs'>{row.pip_step_name}</p>
      </div>
    </div>
  )
}
