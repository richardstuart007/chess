'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterChessComPage — /masterchesscom. Thin wrapper delegating entirely to
//    ChessComSearchPanel_shared, behind a Suspense boundary.
//==================================================================================================

import { Suspense } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import ChessComSearchPanel_shared from '@/src/ui/games/ChessComSearchPanel_shared'

export default function MasterChessComPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <div className='space-y-4 max-w-4xl'>
        <ChessComSearchPanel_shared />
      </div>
    </Suspense>
  )
}
