'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyToggle } from 'nextjs-shared/MyToggle'
import { getMasterPlayers, setMasterPlayerPriority, findNextMasterPlayerHandle, MasterPlayerRow } from '@/src/lib/actions/masterPlayers'

//----------------------------------------------------------------------------------
//  MasterPlayersPage — priority-flagging list of every known master name (populated
//  entirely by the FIDE pipeline — see /owner/pipelinemasters), plus a one-at-a-time
//  Chess.com handle lookup, for the Analyze page's "Search known masters" loop.
//----------------------------------------------------------------------------------
export default function MasterPlayersPage() {
  const [players, setPlayers] = useState<MasterPlayerRow[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [filter_name, setFilter_name] = useState('')
  const [sortGradeDesc, setSortGradeDesc] = useState(false)
  const [onlyMissingHandle, setOnlyMissingHandle] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [filter_name, sortGradeDesc, onlyMissingHandle])

  async function loadPlayers() {
    setLoadingPlayers(true)
    const rows = await getMasterPlayers(filter_name, sortGradeDesc, onlyMissingHandle)
    setPlayers(rows)
    setLoadingPlayers(false)
  }

  async function togglePriority(row: MasterPlayerRow) {
    const nextPriority = !row.priority
    setPlayers(prev => prev.map(p => p.mstid === row.mstid ? { ...p, priority: nextPriority } : p))
    await setMasterPlayerPriority(row.mstid, nextPriority)
  }

  const [findingHandle, setFindingHandle] = useState(false)
  const [handleResult, setHandleResult] = useState('')

  //
  //  One player per click, highest grade first — a long sequential batch across all
  //  156 triggered intermittent failures on well-known players (reproducible only at
  //  that scale), most likely chess.com's own anti-bot throttling. User decision:
  //  process one at a time instead, paced by clicking the button.
  //
  async function findNextHandle() {
    setFindingHandle(true)
    setHandleResult('')
    const result = await findNextMasterPlayerHandle()
    if (result === null) {
      setHandleResult('No FIDE-linked players left without a handle')
    } else {
      setHandleResult(result.handle ? `${result.name} → ${result.handle}` : `${result.name} → not found`)
    }
    setFindingHandle(false)
    await loadPlayers()
  }

  return (
    <div className='p-6 md:p-8 space-y-4'>
      <MyBox title={`Known Master Players (${players.length})`} collapsible>
        <div className='flex flex-wrap items-center gap-3 mb-2'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Filter name</span>
            <MyInput value={filter_name} onChange={e => setFilter_name(e.target.value)} placeholder='Filter...' overrideClass='w-48 h-6 md:h-6' />
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Sort by grade (desc)</span>
            <MyToggle inputName='mst-sort-grade-desc' inputValue={sortGradeDesc} onChange={e => setSortGradeDesc(e.target.checked)} />
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Only missing Chess.com handle</span>
            <MyToggle inputName='mst-only-missing-handle' inputValue={onlyMissingHandle} onChange={e => setOnlyMissingHandle(e.target.checked)} />
          </div>
          <MyButton onClick={findNextHandle} disabled={findingHandle} overrideClass='bg-purple-600 hover:bg-purple-700'>
            {findingHandle ? 'Finding…' : 'Find Next Chess.com Handle'}
          </MyButton>
          {handleResult && <span className='text-xxs text-gray-500'>{handleResult}</span>}
        </div>
        {loadingPlayers ? (
          <p className='text-xs text-gray-400'>Loading…</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-gray-500 border-b border-gray-200'>
                  <th className='py-1 pr-2'>Name</th>
                  <th className='py-1 pr-2'>FIDE ID</th>
                  <th className='py-1 pr-2 text-right'>Grade</th>
                  <th className='py-1 pr-2'>Priority</th>
                  <th className='py-1 pr-2'>Chess.com</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {players.map(row => (
                  <tr key={row.mstid}>
                    <td className='py-1 pr-2'>{row.firstName ? `${row.firstName} ${row.lastName}` : row.lastName}</td>
                    <td className='py-1 pr-2'>{row.fideid ?? '—'}</td>
                    <td className='py-1 pr-2 text-right tabular-nums'>{row.grade ?? '—'}</td>
                    <td className='py-1 pr-2'>
                      <MyToggle
                        inputName={`mst-priority-${row.mstid}`}
                        inputValue={row.priority}
                        onChange={() => togglePriority(row)}
                      />
                    </td>
                    <td className='py-1 pr-2'>
                      {row.chesscomHandle ? (
                        <a href={`https://www.chess.com/member/${row.chesscomHandle}`} target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:underline'>
                          {row.chesscomHandle}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MyBox>
    </div>
  )
}
