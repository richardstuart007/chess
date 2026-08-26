'use client'

//==================================================================================================
//  1) DESCRIPTION
//    AnalyzeMasterPage — /analyzemaster. Loads a single master game (by ?game= mgdid) via
//    getMasterGameById and renders MasterGameView_master, behind a Suspense boundary.
//
//    Parameters (from the URL):
//      game — mgdid of the master game to load
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import MasterGameView_master, { MasterGameRow } from '@/src/ui/board/MasterGameView_master'
import { getMasterGameById } from '@/src/lib/master/masterGamesList'

export default function AnalyzeMasterPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <AnalyzeMasterContent />
    </Suspense>
  )
}

//----------------------------------------------------------------------------------
//  AnalyzeMasterContent — loads the master game by ?game= mgdid, then renders MasterGameView_master
//----------------------------------------------------------------------------------
function AnalyzeMasterContent() {
  const searchParams = useSearchParams()
  const mgdidParam = searchParams.get('game')

  const [row, setRow] = useState<MasterGameRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mgdidParam) {
      setError('No game specified')
      return
    }

    async function loadGame() {
      setLoading(true)
      try {
        const data = await getMasterGameById(parseInt(mgdidParam!, 10))
        if (!data) {
          setError('Game not found')
          return
        }
        setRow(data as MasterGameRow)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game')
      } finally {
        setLoading(false)
      }
    }

    loadGame()
  }, [mgdidParam])

  if (loading) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-red-600 text-sm'>{error}</p>
        <MyBackHomeNav backPath='/mastergames' backLabel='Masters Games' />
      </div>
    )
  }

  if (!row) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  return <MasterGameView_master row={row} />
}
