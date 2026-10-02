//==================================================================================================
//  1) DESCRIPTION
//    cron-deepen-popular / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs deepenPopularPositions() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { deepenPopularPositions } from '../src/lib/analysis/enrichPositionsStockfish'
import { CRON_DEEPEN_POPULAR_BATCH_SIZE_Player } from '../src/lib/constants'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running deepenPopularPositions() directly ...')

async function main() {
  try {
    const result = await deepenPopularPositions({ limit: CRON_DEEPEN_POPULAR_BATCH_SIZE_Player, forceNewRun: false })
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-deepen-popular',
      lg_caller: 'cron-deepen-popular',
      lg_msg: 'cron-deepen-popular failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
