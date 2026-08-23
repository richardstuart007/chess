'use client'

import { useState } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { getMasterMovesForPosition, MasterMoveRow } from '@/src/lib/master/masterChessdb'

//----------------------------------------------------------------------------------------------
//  MasterGamesPage — FEN lookup against the master-games position database. Building the data
//  (sync/deconstruct/build-tree) now happens on the Pipeline (Master Games POC) page instead.
//----------------------------------------------------------------------------------------------
export default function MasterGamesPage() {
  const [fen, setFen] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [moves, setMoves] = useState<MasterMoveRow[] | null>(null)

  async function lookupFen() {
    if (!fen.trim()) return
    setLookupLoading(true)
    const rows = await getMasterMovesForPosition(fen.trim())
    setMoves(rows)
    setLookupLoading(false)
  }

  return (
    <div className='p-6 md:p-8 space-y-4'>
      <MyBox title='Master Games — FEN Lookup' collapsible>
        <p className='text-xs text-gray-500 mb-3'>
          Queries the master-games position database (tmps_masterpositions /
          tmgp_mastergamepositions) built by the Pipeline (Master Games POC) page — run that
          pipeline first if this returns nothing.
        </p>
        <div className='flex items-center gap-2 mb-3'>
          <MyInput value={fen} onChange={e => setFen(e.target.value)} placeholder='Paste a FEN...' overrideClass='w-full max-w-xl h-6 md:h-6' />
          <MyButton onClick={lookupFen} disabled={lookupLoading || !fen.trim()}>
            {lookupLoading ? 'Looking up…' : 'Look up'}
          </MyButton>
        </div>
        {moves !== null && (
          moves.length === 0 ? (
            <p className='text-xs text-gray-400'>No master games reached this position.</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='text-xs'>
                <thead>
                  <tr className='text-left text-gray-500 border-b border-gray-200'>
                    <th className='py-1 pr-4'>Move</th>
                    <th className='py-1 pr-4 text-right'>Times</th>
                    <th className='py-1 pr-4 text-right'>Wins</th>
                    <th className='py-1 pr-4 text-right'>Losses</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {moves.map(m => (
                    <tr key={m.move_played + (m.move_uci ?? '')}>
                      <td className='py-1 pr-4'>{m.move_played}</td>
                      <td className='py-1 pr-4 text-right tabular-nums'>{m.mov_times}</td>
                      <td className='py-1 pr-4 text-right tabular-nums'>{m.mov_wins}</td>
                      <td className='py-1 pr-4 text-right tabular-nums'>{m.mov_losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </MyBox>
    </div>
  )
}
