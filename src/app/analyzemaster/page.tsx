'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import MasterGameView, { MasterGameRow } from '@/src/ui/board/MasterGameView'
import { getMasterGameById } from '@/src/lib/master/masterGamesList'

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

  return <MasterGameView row={row} />
}

export default function AnalyzeMasterPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <AnalyzeMasterContent />
    </Suspense>
  )
}
