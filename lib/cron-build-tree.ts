//==================================================================================================
//  1) DESCRIPTION
//    cron-build-tree / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs buildPositionTree_Player() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { buildPositionTree_Player } from '../src/lib/analysis/buildPositionTree_Player'
import { POSITION_TREE_LIMIT_Player } from '../src/lib/constants'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running buildPositionTree_Player() directly ...')

async function main() {
  try {
    const result = await buildPositionTree_Player({ limit: POSITION_TREE_LIMIT_Player, player: undefined, skipSync: true, forceNewRun: false })
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-build-tree',
      lg_caller: 'cron-build-tree',
      lg_msg: 'cron-build-tree failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
