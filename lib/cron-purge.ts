//==================================================================================================
//  1) DESCRIPTION
//    cron-purge / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs purgeStaleReachOnePositions() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { purgeStaleReachOnePositions } from '../src/lib/analysis/purgePositions'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running purgeStaleReachOnePositions() directly ...')

async function main() {
  try {
    const result = await purgeStaleReachOnePositions(1, false)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-purge',
      lg_caller: 'cron-purge',
      lg_msg: 'cron-purge failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
