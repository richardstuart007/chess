'use client'

import { Suspense, useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import AppNav from '@/src/ui/AppNav'
import { getPlayer, getPlayerRatings, getPlayers } from '@/src/lib/actions/players'
import { getPlayerTimeClasses } from '@/src/lib/constants'

const BOTH = ''

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

  return (
    <>
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
      <AppNav />
    </>
  )
}

//----------------------------------------------------------------------------------------------
//  AppShell — wraps every page with the shared PlayerProfile header + AppNav, except /owner/*
//  (which keeps only its own OwnerLayout dev-guard chrome, no header, no nav) and the
//  master-games pages (which keep AppNav for tab navigation but drop the tracked-player cards —
//  player selection doesn't apply to master-games data)
//----------------------------------------------------------------------------------------------
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOwner = pathname?.startsWith('/owner') ?? false
  const isMasterGames = pathname === '/mastergames' || pathname === '/analyzemaster'

  if (isOwner) return <>{children}</>

  if (isMasterGames) {
    return (
      <div className='space-y-4'>
        <Suspense fallback={null}>
          <AppNav />
        </Suspense>
        {children}
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <Suspense fallback={null}>
        <PlayerHeader />
      </Suspense>
      {children}
    </div>
  )
}
