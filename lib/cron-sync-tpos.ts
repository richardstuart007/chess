//==================================================================================================
//  1) DESCRIPTION
//    cron-sync-tpos / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs syncTposFromTgam_Player() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { syncTposFromTgam_Player } from '../src/lib/analysis/buildPositionTree_Player'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running syncTposFromTgam_Player() directly ...')

async function main() {
  try {
    const result = await syncTposFromTgam_Player(1, false)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-sync-tpos',
      lg_caller: 'cron-sync-tpos',
      lg_msg: 'cron-sync-tpos failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
