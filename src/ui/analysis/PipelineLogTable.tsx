'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'
import MyPagination from 'nextjs-shared/MyPagination'
import { MyInput } from 'nextjs-shared/MyInput'
import { PIPELINE_LOG_ROWS_PER_PAGE } from '@/src/lib/constants'

type PipelineLogRow = {
  pip_pipid:        number
  pip_step:         number
  pip_sub_step:     string
  pip_step_name:    string
  pip_input_table:  string
  pip_input_recs:   number
  pip_output_table: string
  pip_output_recs:  number
  pip_duration_ms:  number
  pip_created:      string
  pip_run_id:       number
}

function stepLabel(row: PipelineLogRow): string {
  return `${row.pip_step}${row.pip_sub_step}`
}

//----------------------------------------------------------------------------------------------
//  PipelineLogTable — paginated/filterable viewer for tpip_pipelinelog, adapted from
//  nextjs-shared's OwnerTableLogging (xlg_logging viewer) pattern.
//----------------------------------------------------------------------------------------------
export default function PipelineLogTable() {
  const functionName = 'PipelineLogTable'
  const [step, setStep] = useState('')
  const [stepName, setStepName] = useState('')
  const [run, setRun] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [tabledata, setTabledata] = useState<PipelineLogRow[]>([])
  const [totalPages, setTotalPages] = useState<number>(0)
  const [message, setMessage] = useState('')
  const [popup, setPopup] = useState<PipelineLogRow | null>(null)
  const prevFilters = useRef({ step: '', stepName: '', run: '' })

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const filtersChanged = step !== prevFilters.current.step || stepName !== prevFilters.current.stepName || run !== prevFilters.current.run
    setMessage(filtersChanged ? 'Applying filters...' : '')
    const timeout = filtersChanged ? 2000 : 1
    const handler = setTimeout(() => {
      prevFilters.current = { step, stepName, run }
      fetchdata()
      setMessage('')
    }, timeout)
    return () => clearTimeout(handler)
  }, [step, stepName, run, currentPage])

  async function fetchdata() {
    const filtersToUpdate: Filter[] = [
      { column: 'pip_step', value: step, operator: '=' },
      { column: 'pip_step_name', value: stepName, operator: 'LIKE' },
      { column: 'pip_run_id', value: run, operator: '=' }
    ]
    const filters = filtersToUpdate.filter(filter => filter.value)
    try {
      const table = 'tpip_pipelinelog'
      const offset = (currentPage - 1) * PIPELINE_LOG_ROWS_PER_PAGE
      const data = await fetchFiltered({
        caller: functionName,
        table,
        filters,
        orderBy: 'pip_pipid DESC',
        limit: PIPELINE_LOG_ROWS_PER_PAGE,
        offset,
        skipCache: true
      })
      setTabledata(data)
      const fetchedTotalPages = await fetchTotalPages({
        caller: functionName,
        table,
        filters,
        items_per_page: PIPELINE_LOG_ROWS_PER_PAGE,
        skipCache: true
      })
      setTotalPages(fetchedTotalPages)
    } catch (error) {
      console.error('Error fetching pipeline log:', error)
    }
  }

  return (
    <div className='bg-orange-50'>
      <div className='flex gap-4 bg-yellow-100'>
        <div className='shrink-0 bg-pink-100'>
          <table className='text-gray-900 table-fixed'>
            <thead className='sticky top-0 z-10 bg-teal-100 text-left font-normal text-xxs'>
              <tr>
                <th scope='col' className='font-medium px-2 w-10'>ID</th>
                <th scope='col' className='font-medium px-2 w-14 text-center'>Run</th>
                <th scope='col' className='font-medium px-2 w-14 text-center'>Step</th>
                <th scope='col' className='font-medium px-2 w-40'>Step Name</th>
                <th scope='col' className='font-medium px-2 w-32'>Created</th>
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
              {tabledata && tabledata.length > 0 ? (
                tabledata.map(row => (
                  <tr
                    key={row.pip_pipid}
                    className={`w-full border-b border-gray-100 cursor-pointer ${popup?.pip_pipid === row.pip_pipid ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                    onClick={() => setPopup(row)}
                  >
                    <td className='px-2 text-xxs'>{row.pip_pipid}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_run_id}</td>
                    <td className='px-2 text-center text-xxs'>{stepLabel(row)}</td>
                    <td className='px-2 text-xxs'>{row.pip_step_name}</td>
                    <td className='px-2 text-xxs'>{new Date(row.pip_created).toLocaleString()}</td>
                    <td className='px-2 text-xxs'>{row.pip_input_table}</td>
                    <td className='px-2 text-right text-xxs'>{row.pip_input_recs.toLocaleString()}</td>
                    <td className='px-2 text-xxs'>{row.pip_output_table}</td>
                    <td className='px-2 text-right text-xxs'>{row.pip_output_recs.toLocaleString()}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_duration_ms}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>No data available</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className='text-red-600'>{message}</p>
          <div className='mt-2 flex justify-center'>
            <MyPagination
              totalPages={totalPages}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
            />
          </div>
        </div>

        {popup !== null && (
          <div className='w-[28rem] pl-4 shrink-0'>
            <PipelineLogDetail row={popup} />
          </div>
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  PipelineLogDetail — full-row detail panel for a selected tpip_pipelinelog row
//----------------------------------------------------------------------------------------------
function PipelineLogDetail({ row }: { row: PipelineLogRow }) {
  return (
    <div>
      <h3 className='text-sm font-semibold text-gray-700 mb-3'>Pipeline Run Detail</h3>

      <div className='grid grid-cols-3 gap-2 mb-3 text-xs'>
        <div>
          <span className='font-medium text-gray-500'>ID: </span>
          {row.pip_pipid}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Step: </span>
          {stepLabel(row)}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Run: </span>
          {row.pip_run_id}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Created: </span>
          {new Date(row.pip_created).toLocaleString()}
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
