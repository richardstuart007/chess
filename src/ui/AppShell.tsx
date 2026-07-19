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

  const [players,   setPlayers]   = useState<{ username: string; display_name: string | null }[]>([])
  const [dbPlayers, setDbPlayers] = useState<any[]>([])
  const [dbRatings, setDbRatings] = useState<Record<string, Record<string, number>>>({})

  const playerFilter = searchParams.get('player') ?? BOTH

  useEffect(() => {
    async function loadAll() {
      const ps = await getPlayers()
      setPlayers(ps)
      const [playerResults, ratingResults] = await Promise.all([
        Promise.all(ps.map(p => getPlayer(p.username))),
        Promise.all(ps.map(p => getPlayerRatings(p.username)))
      ])
      setDbPlayers(playerResults)
      const ratingsMap: Record<string, Record<string, number>> = {}
      ps.forEach((p, i) => {
        const allowed = getPlayerTimeClasses(p.username)
        const filtered: Record<string, number> = {}
        for (const [timeClass, rating] of Object.entries(ratingResults[i])) {
          if (allowed.includes(timeClass)) filtered[timeClass] = rating
        }
        ratingsMap[p.username] = filtered
      })
      setDbRatings(ratingsMap)
    }
    loadAll()
  }, [])

  function handleClick(username: string) {
    const next = playerFilter === username ? BOTH : username
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('player', next); else params.delete('player')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  if (players.length === 0) return <AppNav />

  return (
    <>
      <div className={players.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}>
        {players.map((p, i) => {
          const db      = dbPlayers[i]
          const ratings = dbRatings[p.username] ?? {}
          return (
            <PlayerProfile
              key={p.username}
              username={db?.pl_player ?? p.username}
              displayName={db?.pl_display_name ?? undefined}
              avatar={db?.pl_avatar}
              ratings={Object.keys(ratings).length > 0 ? ratings : undefined}
              onClick={players.length > 1 ? () => handleClick(p.username) : undefined}
              selected={players.length > 1 && playerFilter === p.username}
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
//  which keeps only its own OwnerLayout dev-guard chrome
//----------------------------------------------------------------------------------------------
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOwner = pathname?.startsWith('/owner') ?? false

  if (isOwner) return <>{children}</>

  return (
    <div className='space-y-4'>
      <Suspense fallback={null}>
        <PlayerHeader />
      </Suspense>
      {children}
    </div>
  )
}
