'use server'

import { getPlayers } from './players'
import { buildPositionTree } from '../analysis/buildPositionTree'

export async function runCronAnalysis(): Promise<{
  players: { username: string; gamesProcessed: number; positions: number; treeBuilt: number; remaining: number; errors: number }[]
}> {
  const players = await getPlayers()
  const summary: { username: string; gamesProcessed: number; positions: number; treeBuilt: number; remaining: number; errors: number }[] = []

  for (const player of players) {
    try {
      const result = await buildPositionTree({ playerUsername: player.username, limit: 0 })
      summary.push({ username: player.username, ...result })
    } catch (err) {
      console.error(`runCronAnalysis: buildPositionTree failed for ${player.username}:`, err)
      summary.push({ username: player.username, gamesProcessed: 0, positions: 0, treeBuilt: 0, remaining: 0, errors: 1 })
    }
  }

  return { players: summary }
}
