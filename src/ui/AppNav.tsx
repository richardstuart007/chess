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
//    are rendered — no hardcoded height value. The Master box carries the top 4 master cards by
//    grade (getMasterPlayers('', true) sliced to 4 — currently Carlsen/Caruana/Nakamura/Sindarov),
//    laid out in a single horizontal row. Clicking a card navigates to /mastergames?master=<handle>
//    (pushing a back target first) and pre-filters the Master Games list to that master; the card
//    shows the selected outline while its master is the active ?master= filter on /mastergames.
//
//  3) CHANGE HISTORY
//    2026-08-28 — Master box now shows the top 4 masters by grade (was a single Carlsen card) in
//                 one horizontal row, each with its downloaded avatar resolved via the
//                 MASTER_AVATARS constants map
//    2026-08-29 — master cards are now clickable: navigate to /mastergames pre-filtered to that
//                 master (?master=<handle>), with a selected-outline highlight while active
//==================================================================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import MyBox from 'nextjs-shared/MyBox'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import { getMasterPlayers, MasterPlayerRow } from '@/src/lib/actions/masterPlayers'
import { AVATAR_DIR, MASTER_AVATARS } from '@/src/lib/constants'

interface AppNavProps {
  playerCards?: React.ReactNode
}

//
//  Generic placeholder-silhouette avatar (not a real hosted photo) — fallback for any master
//  handle not present in the MASTER_AVATARS map (only the curated top 4 have a file).
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

//
//  Filters copied from the current URL onto a Master-card click, so the master's games open in
//  the same opening/colour/time/date context you were looking at. Not `player` — that's the
//  tracked player; the clicked master goes in `?master=` instead.
//
const MASTER_CARRY_KEYS = ['color', 'timeClass', 'dateFrom', 'opening', 'eco']

export default function AppNav({ playerCards }: AppNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [masterCards, setMasterCards] = useState<MasterPlayerRow[]>([])

  //
  //  Fetches the top 4 masters by grade once on mount, via the existing getMasterPlayers
  //  (sorted grade-descending), so the Master box shows real data instead of a hardcoded card.
  //
  useEffect(() => {
    getMasterPlayers('', true)
      .then(rows => setMasterCards(rows.slice(0, 4)))
      .catch(() => setMasterCards([]))
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

  //
  //  Navigate to the Master Games list pre-filtered to this master. Carries the MASTER_CARRY_KEYS
  //  filters from the current URL (colour/time/date/opening/eco — e.g. after an Openings bar click
  //  on the Games tab) so the master's games arrive in the same context. No backNav push — this is
  //  a list tab with no "← Back" button; browser Back handles it via history. No-ops when the
  //  master has no chess.com handle (can't filter mgd_player without one).
  //
  function handleMasterClick(handle: string) {
    if (!handle) return
    const params = new URLSearchParams()
    //
    //  Lowercase — mgd_player is stored lowercase, so ?master= must match it (and the
    //  FilterMasterPlayerSelect option values, and openMasterGame's row.mgd_player).
    //
    params.set('master', handle.toLowerCase())
    for (const key of MASTER_CARRY_KEYS) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    router.push(`/mastergames?${params.toString()}`)
  }

  const activeMaster = (pathname === '/mastergames' || pathname === '/analyzemaster')
    ? searchParams.get('master')
    : null

  const masterCardContent = masterCards.length > 0 && (
    <div className='flex gap-3'>
      {masterCards.map(m => {
        const handle = m.chesscomHandle ?? ''
        const avatarFile = handle ? MASTER_AVATARS[handle] : undefined
        return (
          <PlayerProfile
            key={m.mstid}
            player={handle}
            displayName={m.firstName ? `${m.firstName} ${m.lastName}` : m.lastName}
            avatar={avatarFile ? AVATAR_DIR + avatarFile : MASTER_CARD_AVATAR}
            ratings={m.grade != null ? { Grade: m.grade } : undefined}
            onClick={handle ? () => handleMasterClick(handle) : undefined}
            selected={!!handle && activeMaster === handle.toLowerCase()}
          />
        )
      })}
    </div>
  )

  return (
    <div className='flex items-stretch gap-6'>
      <TabGroup topContent={playerCards} sections={PLAYER_SECTIONS} activeKey={activeKey} buildHref={buildHref} />
      <TabGroup topContent={masterCardContent} sections={MASTER_SECTIONS} activeKey={activeKey} buildHref={buildHref} />
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TabGroup — one boxed row of tab links, shared by AppNav's Player/Master groups. label (a plain
//  MyBox title) and topContent (arbitrary content above the tabs, e.g. a PlayerProfile card) are
//  both optional and independent — currently both groups use topContent only, no label. Both
//  groups render identically: bg-amber-50 normally, bg-pink-100 when this group owns the current
//  route (isGroupActive) — the pink background is the sole active-group indicator.
//----------------------------------------------------------------------------------------------
function TabGroup({
  label,
  topContent,
  sections,
  activeKey,
  buildHref
}: {
  label?: string
  topContent?: React.ReactNode
  sections: readonly { key: string; label: string; href: string }[]
  activeKey: string | null
  buildHref: (base: string) => string
}) {
  const isGroupActive = sections.some(s => s.key === activeKey)

  return (
    <MyBox title={label} className={isGroupActive ? 'bg-pink-100' : 'bg-amber-50'}>
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
