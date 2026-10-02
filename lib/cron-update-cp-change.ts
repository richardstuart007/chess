//==================================================================================================
//  1) DESCRIPTION
//    cron-update-cp-change / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs bulkUpdateCpLoss() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { bulkUpdateCpLoss } from '../src/lib/analysis/enrichPositionsStockfish'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running bulkUpdateCpLoss() directly ...')

async function main() {
  try {
    const updated = await bulkUpdateCpLoss(1, false)
    console.log(JSON.stringify({ updated }, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-update-cp-change',
      lg_caller: 'cron-update-cp-change',
      lg_msg: 'cron-update-cp-change failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
