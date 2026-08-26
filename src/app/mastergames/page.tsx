'use client'

//==================================================================================================
//  1) DESCRIPTION
//    MasterGamesPage — /mastergames. Thin wrapper delegating entirely to MasterGameList, behind a
//    Suspense boundary.
//==================================================================================================

import { Suspense } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import MasterGameList from '@/src/ui/games/MasterGameList'

export default function MasterGamesPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <div className='space-y-4'>
        <MasterGameList />
      </div>
    </Suspense>
  )
}
