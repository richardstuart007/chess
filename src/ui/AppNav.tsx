'use client'

//==================================================================================================
//  1) DESCRIPTION
//    AppNav — top-level section tab bar, split into two boxed groups: Player
//    (Games/Habits/Graph/Openings/Endings) and Master (Masters Games). Both groups always render,
//    on every page. Carries every global filter (player/timeClass/dateFrom/opening/eco) across
//    tab navigation, and highlights the active tab based on the current pathname.
//
//    Parameters:
//      playerCards — optional; rendered inside the Player box in place of a title (AppShell's
//                    PlayerHeader builds this from the tracked-player cards). Always provided in
//                    practice — AppShell now renders PlayerHeader on every non-owner page.
//
//  2) NOTES
//    The two boxes are stretched to equal height (see the outer flex container's items-stretch)
//    so the Master box visually matches whatever height the Player box ends up at once its cards
//    are rendered — no hardcoded height value. The Master box carries a single real master's card
//    (currently Magnus Carlsen, fetched via getMasterPlayers) so it has comparable visual weight
//    to the Player box's real cards — stand-in for a future "top masters" panel (see this
//    project's Outstanding Items). No onClick/selected — static display only, since no
//    "select a master" mechanism exists anywhere in the app yet.
//==================================================================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import { getMasterPlayers, MasterPlayerRow } from '@/src/lib/actions/masterPlayers'

interface AppNavProps {
  playerCards?: React.ReactNode
}

//
//  Generic placeholder-silhouette avatar (not a real hosted photo) — tmst_master_players has no
//  stored avatar URL, unlike tracked players.
//
const MASTER_CARD_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#d1d5db"/><circle cx="32" cy="24" r="12" fill="#9ca3af"/><path d="M12 58c0-13 9-22 20-22s20 9 20 22" fill="#9ca3af"/></svg>'
)

const PLAYER_SECTIONS = [
  { key: 'games',    label: 'Games',    href: '/' },
  { key: 'habits',   label: 'Habits',   href: '/habits' },
  { key: 'graph',    label: 'Graph',    href: '/graph' },
  { key: 'openings', label: 'Openings', href: '/openings' },
  { key: 'endings',  label: 'Endings',  href: '/endings' }
] as const

const MASTER_SECTIONS = [
  { key: 'mastergames', label: 'Games', href: '/mastergames' }
] as const

//
//  Explicitly enumerated (not "forward the whole query string") — a page-specific param that
//  isn't meant to be shared globally would otherwise leak into unrelated tabs.
//
const GLOBAL_FILTER_KEYS = ['player', 'timeClass', 'dateFrom', 'opening', 'eco']

export default function AppNav({ playerCards }: AppNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [masterCard, setMasterCard] = useState<MasterPlayerRow | null>(null)

  //
  //  Stand-in for a future "top masters" panel — fetches Magnus Carlsen's own row (name/grade)
  //  once on mount, via the existing getMasterPlayers, so the Master box shows real data instead
  //  of a hardcoded card.
  //
  useEffect(() => {
    getMasterPlayers('Carlsen').then(rows => {
      const carlsen = rows.find(r => r.chesscomHandle?.toLowerCase() === 'magnuscarlsen') ?? rows[0] ?? null
      setMasterCard(carlsen)
    }).catch(() => setMasterCard(null))
  }, [])

  //
  //  Carries every global filter across tab navigation — without this, each SECTIONS href is
  //  a bare path with no query string, so clicking a tab drops them entirely and silently
  //  resets the selection.
  //
  function buildHref(base: string): string {
    const params = new URLSearchParams()
    for (const key of GLOBAL_FILTER_KEYS) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }
  //
  //  /analyze and /position/[id] are cross-cutting detail views reached from more than
  //  one section (Games/Habits/Openings) — no single tab owns them, so none is highlighted.
  //
  const activeKey = pathname === '/habits' ? 'habits'
    : pathname === '/graph' ? 'graph'
    : pathname === '/openings' ? 'openings'
    : pathname === '/endings' ? 'endings'
    : pathname === '/mastergames' ? 'mastergames'
    : pathname === '/' ? 'games'
    : null

  const masterCardContent = masterCard && (
    <div className='flex justify-center'>
      <PlayerProfile
        player={masterCard.chesscomHandle ?? ''}
        displayName={masterCard.firstName ? `${masterCard.firstName} ${masterCard.lastName}` : masterCard.lastName}
        avatar={MASTER_CARD_AVATAR}
        ratings={masterCard.grade != null ? { Grade: masterCard.grade } : undefined}
      />
    </div>
  )

  return (
    <div className='flex items-stretch gap-6'>
      <TabGroup topContent={playerCards} sections={PLAYER_SECTIONS} activeKey={activeKey} buildHref={buildHref} boxClassName='bg-blue-50' />
      <TabGroup topContent={masterCardContent} sections={MASTER_SECTIONS} activeKey={activeKey} buildHref={buildHref} boxClassName='bg-amber-50' />
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TabGroup — one boxed row of tab links, shared by AppNav's Player/Master groups. label (a plain
//  MyBox title) and topContent (arbitrary content above the tabs, e.g. a PlayerProfile card) are
//  both optional and independent — currently both groups use topContent only, no label.
//----------------------------------------------------------------------------------------------
function TabGroup({
  label,
  topContent,
  sections,
  activeKey,
  buildHref,
  boxClassName
}: {
  label?: string
  topContent?: React.ReactNode
  sections: readonly { key: string; label: string; href: string }[]
  activeKey: string | null
  buildHref: (base: string) => string
  boxClassName: string
}) {
  const isGroupActive = sections.some(s => s.key === activeKey)

  return (
    <MyBox title={label} className={`${boxClassName} ${isGroupActive ? 'outline outline-2 outline-yellow-400' : ''}`}>
      {topContent}
      <div className='flex items-end border-b border-gray-200'>
        {sections.map(s => (
          <Link
            key={s.key}
            href={buildHref(s.href)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeKey === s.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </MyBox>
  )
}
