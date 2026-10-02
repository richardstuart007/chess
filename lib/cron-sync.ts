//==================================================================================================
//  1) DESCRIPTION
//    cron-sync / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs runGameSync() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { runGameSync } from '../src/lib/actions/sync'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running runGameSync() directly ...')

async function main() {
  try {
    const result = await runGameSync()
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-sync',
      lg_caller: 'cron-sync',
      lg_msg: 'cron-sync failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
