//==================================================================================================
//  1) DESCRIPTION
//    Page — /owner/cache. Thin wrapper delegating entirely to nextjs-shared's own OwnerTableCache
//    viewer.
//==================================================================================================

import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cache' }

export default function Page() {
  return (
    <div className='w-full md:p-6'>
      <OwnerTableCache />
    </div>
  )
}
