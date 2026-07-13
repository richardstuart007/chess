'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { getPlayers } from './players'
import { buildPositionTree } from '../analysis/buildPositionTree'

export async function runCronAnalysis(): Promise<{
  players: { username: string; gamesProcessed: number; positions: number; treeBuilt: number; remaining: number; errors: number }[]
}> {
  const players = await getPlayers(true, 1, 'D')
  await logStart('runCronAnalysis', 'ownerCronPage', `analysis pipeline for ${players.length} players`, 1)
  const summary: { username: string; gamesProcessed: number; positions: number; treeBuilt: number; remaining: number; errors: number }[] = []

  for (const player of players) {
    await logStart('runCronAnalysis', 'runCronAnalysis', `building position tree for ${player.username}`, 2)
    try {
      const result = await buildPositionTree({ playerUsername: player.username, limit: 0, level: 2 })
      summary.push({ username: player.username, ...result })
      await logEnd('runCronAnalysis', 'runCronAnalysis', `${player.username}: ${result.positions} positions, ${result.errors} errors`, 2)
    } catch (err) {
      console.error(`runCronAnalysis: buildPositionTree failed for ${player.username}:`, err)
      await write_logging({
        lg_functionname: 'runCronAnalysis',
        lg_caller: 'runCronAnalysis',
        lg_msg: `buildPositionTree failed for ${player.username}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      summary.push({ username: player.username, gamesProcessed: 0, positions: 0, treeBuilt: 0, remaining: 0, errors: 1 })
      await logEnd('runCronAnalysis', 'runCronAnalysis', `${player.username}: failed — ` + (err as Error).message, 2)
    }
  }

  const totalPositions = summary.reduce((s, p) => s + p.positions, 0)
  const totalErrors = summary.reduce((s, p) => s + p.errors, 0)
  await logEnd('runCronAnalysis', 'ownerCronPage', `${summary.length} players processed, ${totalPositions} positions, ${totalErrors} errors`, 1)

  return { players: summary }
}
