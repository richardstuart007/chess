'use server'

import { write_logging } from 'nextjs-shared/write_logging'
import { logStart, logEnd } from '../logStep'
import { getPlayers, updatePlayerRating } from './players'
import { initSync, syncArchive } from './sync'
import { deconstructGames } from './deconstruct'

export async function runCronSync(): Promise<{ players: { username: string; inserted: number; deconstructed: number }[]; totalInserted: number; totalDeconstructed: number }> {
  const players = await getPlayers(true, 1, 'D')
  await logStart('runCronSync', 'ownerCronPage', `game sync for ${players.length} players`, 1)
  const summary: { username: string; inserted: number; deconstructed: number }[] = []

  for (const player of players) {
    const username = player.username
    let totalInserted = 0
    await logStart('runCronSync', 'runCronSync', `syncing ${username}`, 2)

    try {
      const { archives, latestEndTime } = await initSync(username, 'refresh')

      for (const archiveUrl of archives) {
        const result = await syncArchive({ username, archiveUrl, syncType: 'refresh', latestEndTime })
        totalInserted += result.inserted
      }

      const { processed } = await deconstructGames(username, 0)
      await updatePlayerRating(username)
      summary.push({ username, inserted: totalInserted, deconstructed: processed })
      await logEnd('runCronSync', 'runCronSync', `${username}: ${totalInserted} inserted, ${processed} deconstructed`, 2)
    } catch (err) {
      console.error(`Cron sync failed for ${username}:`, err)
      await write_logging({
        lg_functionname: 'runCronSync',
        lg_caller: 'runCronSync',
        lg_msg: `Cron sync failed for ${username}: ` + (err as Error).message,
        lg_severity: 'E'
      })
      summary.push({ username, inserted: totalInserted, deconstructed: 0 })
      await logEnd('runCronSync', 'runCronSync', `${username}: failed — ` + (err as Error).message, 2)
    }
  }

  const totalInserted = summary.reduce((s, p) => s + p.inserted, 0)
  const totalDeconstructed = summary.reduce((s, p) => s + p.deconstructed, 0)

  await logEnd('runCronSync', 'ownerCronPage', `${summary.length} players processed, ${totalInserted} inserted, ${totalDeconstructed} deconstructed`, 1)

  return { players: summary, totalInserted, totalDeconstructed }
}
