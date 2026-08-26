//==================================================================================================
//  1) DESCRIPTION
//    LoggingPage — /owner/logging. Thin wrapper delegating entirely to nextjs-shared's own
//    OwnerTableLogging viewer.
//==================================================================================================

import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'

export default function LoggingPage() {
  return <OwnerTableLogging />
}
