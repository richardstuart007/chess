//==================================================================================================
//  1) DESCRIPTION
//    cron-build-habits / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs buildHabits() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { buildHabits } from '../src/lib/analysis/buildHabits'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running buildHabits() directly ...')

async function main() {
  try {
    const result = await buildHabits(1, false)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-build-habits',
      lg_caller: 'cron-build-habits',
      lg_msg: 'cron-build-habits failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
