'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'
import MyPagination from 'nextjs-shared/MyPagination'
import { MyInput } from 'nextjs-shared/MyInput'
import { PIPELINE_LOG_ROWS_PER_PAGE } from '@/src/lib/constants'

type PipelineLogRow = {
  pip_pipid:       number
  pip_step:        number
  pip_step_name:   string
  pip_date_from:   string | null
  pip_date_to:     string | null
  pip_start:       number
  pip_remaining:   number
  pip_finish:      number
  pip_attempted:   number
  pip_processed:   number
  pip_errors:      number
  pip_skipped:     number
  pip_duration_ms: number
}

//----------------------------------------------------------------------------------------------
//  PipelineLogTable — paginated/filterable viewer for tpip_pipelinelog, adapted from
//  nextjs-shared's OwnerTableLogging (xlg_logging viewer) pattern.
//----------------------------------------------------------------------------------------------
export default function PipelineLogTable() {
  const functionName = 'PipelineLogTable'
  const [step, setStep] = useState('')
  const [stepName, setStepName] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [tabledata, setTabledata] = useState<PipelineLogRow[]>([])
  const [totalPages, setTotalPages] = useState<number>(0)
  const [message, setMessage] = useState('')
  const [popup, setPopup] = useState<PipelineLogRow | null>(null)
  const prevFilters = useRef({ step: '', stepName: '' })

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const filtersChanged = step !== prevFilters.current.step || stepName !== prevFilters.current.stepName
    setMessage(filtersChanged ? 'Applying filters...' : '')
    const timeout = filtersChanged ? 2000 : 1
    const handler = setTimeout(() => {
      prevFilters.current = { step, stepName }
      fetchdata()
      setMessage('')
    }, timeout)
    return () => clearTimeout(handler)
  }, [step, stepName, currentPage])

  async function fetchdata() {
    const filtersToUpdate: Filter[] = [
      { column: 'pip_step', value: step, operator: '=' },
      { column: 'pip_step_name', value: stepName, operator: 'LIKE' }
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
                <th scope='col' className='font-medium px-2 w-14 text-center'>Step</th>
                <th scope='col' className='font-medium px-2 w-44'>Step Name</th>
                <th scope='col' className='font-medium px-2 w-20 text-center'>Attempted</th>
                <th scope='col' className='font-medium px-2 w-20 text-center'>Processed</th>
                <th scope='col' className='font-medium px-2 w-16 text-center'>Errors</th>
                <th scope='col' className='font-medium px-2 w-16 text-center'>Skipped</th>
                <th scope='col' className='font-medium px-2 w-24 text-center'>Duration (ms)</th>
              </tr>
              <tr className='text-xxs align-bottom'>
                <th scope='col' className='px-2'></th>
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
                    <td className='px-2 text-center text-xxs'>{row.pip_step}</td>
                    <td className='px-2 text-xxs'>{row.pip_step_name}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_attempted}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_processed}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_errors}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_skipped}</td>
                    <td className='px-2 text-center text-xxs'>{row.pip_duration_ms}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No data available</td>
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
          {row.pip_step}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Duration: </span>
          {row.pip_duration_ms}ms
        </div>
        <div>
          <span className='font-medium text-gray-500'>Attempted: </span>
          {row.pip_attempted}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Processed: </span>
          {row.pip_processed}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Errors: </span>
          {row.pip_errors}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Skipped: </span>
          {row.pip_skipped}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Start: </span>
          {row.pip_start}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Remaining: </span>
          {row.pip_remaining}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Finish: </span>
          {row.pip_finish}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Date From: </span>
          {row.pip_date_from ?? '—'}
        </div>
        <div>
          <span className='font-medium text-gray-500'>Date To: </span>
          {row.pip_date_to ?? '—'}
        </div>
      </div>

      <div>
        <p className='text-xs font-medium text-gray-500 mb-1'>Step Name:</p>
        <p className='text-xs'>{row.pip_step_name}</p>
      </div>
    </div>
  )
}
