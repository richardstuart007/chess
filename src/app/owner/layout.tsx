//==================================================================================================
//  1) DESCRIPTION
//    Layout — root layout for every /owner route, delegating entirely to nextjs-shared's own
//    OwnerLayout (nav, styling, access gating).
//
//    Parameters:
//      children — the /owner page content for the current route
//==================================================================================================

import OwnerLayout from 'nextjs-shared/OwnerLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OwnerLayout>{children}</OwnerLayout>
}
