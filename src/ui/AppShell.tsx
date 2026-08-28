'use client'

//==================================================================================================
//  1) DESCRIPTION
//    AppShell — wraps every page with the shared Home/Back nav (for the routes that have one) +
//    AppNav (which itself renders the PlayerProfile cards inside its own Player tab box — see
//    PlayerHeader below), except /owner/* (which keeps only its own OwnerLayout dev-guard chrome,
//    no header, no nav).
//
//    Parameters:
//      children — page content to render below the nav/header
//
//  2) NOTES
//    Home/Back nav (MyBackHomeNav + this project's own session-storage-backed BackButton) used to
//    be rendered inside each page's own component, below the player cards/AppNav. It now renders
//    here instead, at the top, driven by getBackNavConfig's pathname lookup — the per-route
//    backPath/backLabel/fallback values it returns are unchanged from what each page used to pass
//    directly; only their location moved. The BackButton/backNav.ts session-storage mechanism
//    itself is untouched.
//
//    PlayerHeader used to render the PlayerProfile cards as its own row above AppNav; it now
//    builds that same JSX and passes it into AppNav's playerCards prop instead, so AppNav's
//    Player tab box can render the cards in place of a plain "Player" title. PlayerHeader (and
//    its cards) renders on every non-owner page, including /mastergames/analyzemaster — a
//    previous per-route branch dropped player cards there, but the user asked for them to always
//    show, so that branch was removed.
//==================================================================================================

import { Suspense, useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import MyBox from 'nextjs-shared/MyBox'
import BackButton from '@/src/ui/BackButton'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import AppNav from '@/src/ui/AppNav'
import { getPlayer, getPlayerRatings, getPlayers } from '@/src/lib/actions/players'
import { getPlayerTimeClasses } from '@/src/lib/constants'

const BOTH = ''

interface BackNavConfig {
  backPath?: string
  backLabel?: string
  fallback: string
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOwner = pathname?.startsWith('/owner') ?? false
  const backNavConfig = getBackNavConfig(pathname)

  if (isOwner) return <>{children}</>

  return (
    <div className='space-y-4'>
      <Suspense fallback={null}>
        {backNavConfig && <BackNavRow config={backNavConfig} />}
        <PlayerHeader />
      </Suspense>
      {children}
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  getBackNavConfig — per-route Home/Back nav config, one entry per route that shows a Home/Back
//  row at all; every other pathname gets none (matching what each page rendered on its own before
//  this moved into AppShell)
//----------------------------------------------------------------------------------------------
function getBackNavConfig(pathname: string | null): BackNavConfig | null {
  if (pathname === '/analyze') return { fallback: '/' }
  if (pathname === '/analyzemaster') return { backPath: '/mastergames', backLabel: 'Masters Games', fallback: '/mastergames' }
  if (pathname?.startsWith('/position/')) return { fallback: '/habits' }
  return null
}

//----------------------------------------------------------------------------------------------
//  BackNavRow — Home/Back row, boxed the same way every page used to box it locally
//----------------------------------------------------------------------------------------------
function BackNavRow({ config }: { config: BackNavConfig }) {
  return (
    <MyBox>
      <div className='flex items-center justify-between'>
        <div className='flex gap-3'>
          <MyBackHomeNav backPath={config.backPath} backLabel={config.backLabel} />
          <BackButton fallback={config.fallback} />
        </div>
      </div>
    </MyBox>
  )
}

//----------------------------------------------------------------------------------------------
//  PlayerHeader — PlayerProfile cards + AppNav; card clicks write the selected player to the
//  shared `?player=` query param so every page reads the same selection off the URL
//----------------------------------------------------------------------------------------------
function PlayerHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [players,   setPlayers]   = useState<{ player: string; display_name: string | null }[]>([])
  const [dbPlayers, setDbPlayers] = useState<any[]>([])
  const [dbRatings, setDbRatings] = useState<Record<string, Record<string, number>>>({})

  const playerFilter = searchParams.get('player') ?? BOTH

  useEffect(() => {
    async function loadAll() {
      const ps = await getPlayers()
      setPlayers(ps)
      const [playerResults, ratingResults] = await Promise.all([
        Promise.all(ps.map(p => getPlayer(p.player))),
        Promise.all(ps.map(p => getPlayerRatings(p.player)))
      ])
      setDbPlayers(playerResults)
      const ratingsMap: Record<string, Record<string, number>> = {}
      ps.forEach((p, i) => {
        const allowed = getPlayerTimeClasses(p.player)
        const filtered: Record<string, number> = {}
        for (const [timeClass, rating] of Object.entries(ratingResults[i])) {
          if (allowed.includes(timeClass)) filtered[timeClass] = rating
        }
        ratingsMap[p.player] = filtered
      })
      setDbRatings(ratingsMap)
    }
    loadAll()
  }, [])

  function handleClick(player: string) {
    const next = playerFilter === player ? BOTH : player
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('player', next); else params.delete('player')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  //
  //  Filters on both player and time class at once — not the toggle-off-on-second-click
  //  behavior handleClick has, always sets both values.
  //
  function handleRatingClick(player: string, control: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('player', player)
    params.set('timeClass', control)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  if (players.length === 0) return <AppNav />

  const playerCards = (
    <div className={players.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}>
      {players.map((p, i) => {
        const db      = dbPlayers[i]
        const ratings = dbRatings[p.player] ?? {}
        return (
          <PlayerProfile
            key={p.player}
            player={db?.pl_player ?? p.player}
            displayName={db?.pl_display_name ?? undefined}
            avatar={db?.pl_avatar}
            ratings={Object.keys(ratings).length > 0 ? ratings : undefined}
            onClick={players.length > 1 ? () => handleClick(p.player) : undefined}
            selected={players.length > 1 && (playerFilter === p.player || playerFilter === BOTH)}
            onRatingClick={control => handleRatingClick(p.player, control)}
          />
        )
      })}
    </div>
  )

  return <AppNav playerCards={playerCards} />
}
