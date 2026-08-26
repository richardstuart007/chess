'use server'

//==================================================================================================
//  1) DESCRIPTION
//    getMastersExplorer — live lookup of master-level game stats for a position, from the
//    Lichess Masters Opening Explorer.
//
//    Parameters:
//      fen — position to look up
//
//    Returns:
//      the raw LichessExplorerResponse (white/draws/black totals, per-move breakdown, top games,
//      opening name), or null on any failure (missing token, network error, non-2xx response) —
//      callers show an empty state.
//
//  2) NOTES
//    Requires a Lichess personal API token (LICHESS_API_TOKEN) — Lichess locked this endpoint
//    behind authentication in March 2026 after a DDoS; unauthenticated requests now return 401.
//==================================================================================================

import { MASTERS_EXPLORER_MOVES_LIMIT } from '../constants'

const LICHESS_EXPLORER_BASE = 'https://explorer.lichess.org'

export interface LichessExplorerMove {
  uci: string
  san: string
  averageRating: number
  white: number
  draws: number
  black: number
  opening: { eco: string; name: string } | null
}

export interface LichessExplorerTopGame {
  uci: string
  id: string
  winner: 'white' | 'black' | null
  white: { name: string; rating: number }
  black: { name: string; rating: number }
  year: number
  month: string
}

export interface LichessExplorerResponse {
  white: number
  draws: number
  black: number
  moves: LichessExplorerMove[]
  topGames: LichessExplorerTopGame[]
  opening: { eco: string; name: string } | null
}

export async function getMastersExplorer(fen: string): Promise<LichessExplorerResponse | null> {
  const token = process.env.LICHESS_API_TOKEN
  if (!token) return null

  const url = `${LICHESS_EXPLORER_BASE}/masters?fen=${encodeURIComponent(fen)}&moves=${MASTERS_EXPLORER_MOVES_LIMIT}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
