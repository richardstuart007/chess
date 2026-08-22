'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyToggle } from 'nextjs-shared/MyToggle'
import { searchChessComGames, ChessComSearchFilters } from '@/src/lib/actions/chesscomSearch'
import { upsertMasterPlayerNames, getMasterPlayers, setMasterPlayerPriority, MasterPlayerRow } from '@/src/lib/actions/masterPlayers'
import { MASTER_HARVEST_MAX_PAGES, MASTER_HARVEST_DELAY_MS } from '@/src/lib/constants'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

//----------------------------------------------------------------------------------
//  MasterPlayersPage — harvest control (pages through chess.com search results for a
//  Year + optional Player, upserting qualifying names into tmst_master_players) plus
//  a priority-flagging list of every known master name, for the Analyze page's
//  "Search known masters" loop.
//----------------------------------------------------------------------------------
export default function MasterPlayersPage() {
  const [harvestYear, setHarvestYear] = useState('')
  const [harvestPlayer, setHarvestPlayer] = useState('')
  const [harvesting, setHarvesting] = useState(false)
  const [progress, setProgress] = useState('')

  const [players, setPlayers] = useState<MasterPlayerRow[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [filter_name, setFilter_name] = useState('')
  const [sortGradeDesc, setSortGradeDesc] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [filter_name, sortGradeDesc])

  async function loadPlayers() {
    setLoadingPlayers(true)
    const rows = await getMasterPlayers(filter_name, sortGradeDesc)
    setPlayers(rows)
    setLoadingPlayers(false)
  }

  async function harvest() {
    if (!harvestYear) return
    setHarvesting(true)
    let totalAdded = 0

    for (let page = 1; page <= MASTER_HARVEST_MAX_PAGES; page++) {
      setProgress(`Page ${page} of ${MASTER_HARVEST_MAX_PAGES}… ${totalAdded} name(s) added so far`)

      const filters: ChessComSearchFilters = {
        p1: harvestPlayer,
        p2: '',
        fixedcolors: false,
        mr: '',
        year: harvestYear,
        lsty: '1',
        lstresult: '0',
        sort: ''
      }
      const { games } = await searchChessComGames('', filters, page)
      if (games.length === 0) break

      const sightings = games.flatMap(g => [
        { name: g.whiteUsername, grade: g.whiteRating },
        { name: g.blackUsername, grade: g.blackRating }
      ])
      const added = await upsertMasterPlayerNames(sightings)
      totalAdded += added.length

      if (page < MASTER_HARVEST_MAX_PAGES) await sleep(MASTER_HARVEST_DELAY_MS)
    }

    setProgress(`Done — ${totalAdded} name(s) added`)
    setHarvesting(false)
    await loadPlayers()
  }

  async function togglePriority(row: MasterPlayerRow) {
    const nextPriority = !row.priority
    setPlayers(prev => prev.map(p => p.mstid === row.mstid ? { ...p, priority: nextPriority } : p))
    await setMasterPlayerPriority(row.mstid, nextPriority)
  }

  return (
    <div className='p-6 md:p-8 space-y-4'>
      <MyBox title='Harvest Master Players' collapsible>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Year</span>
            <MyInput value={harvestYear} onChange={e => setHarvestYear(e.target.value)} placeholder='e.g. 2020' overrideClass='w-24 h-6 md:h-6' />
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-xs whitespace-nowrap'>Player (optional)</span>
            <MyInput value={harvestPlayer} onChange={e => setHarvestPlayer(e.target.value)} placeholder='Full name' overrideClass='w-48 h-6 md:h-6' />
          </div>
          <MyButton onClick={harvest} disabled={!harvestYear || harvesting} overrideClass='bg-green-600 hover:bg-green-700'>
            {harvesting ? 'Harvesting…' : 'Harvest'}
          </MyButton>
        </div>
        {progress && <p className='mt-2 text-xxs text-gray-500'>{progress}</p>}
      </MyBox>

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
        </div>
        {loadingPlayers ? (
          <p className='text-xs text-gray-400'>Loading…</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-gray-500 border-b border-gray-200'>
                  <th className='py-1 pr-2'>Name</th>
                  <th className='py-1 pr-2 text-right'>Grade</th>
                  <th className='py-1 pr-2'>Priority</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {players.map(row => (
                  <tr key={row.mstid}>
                    <td className='py-1 pr-2'>{row.name}</td>
                    <td className='py-1 pr-2 text-right tabular-nums'>{row.grade ?? '—'}</td>
                    <td className='py-1 pr-2'>
                      <MyToggle
                        inputName={`mst-priority-${row.mstid}`}
                        inputValue={row.priority}
                        onChange={() => togglePriority(row)}
                      />
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
