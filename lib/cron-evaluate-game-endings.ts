//==================================================================================================
//  1) DESCRIPTION
//    cron-evaluate-game-endings / main — command-line entry point, run outside Next.js (e.g. from cron).
//    Loads .env, runs evaluateGameEndings() directly and prints the result as JSON. On failure it logs
//    the error (console and write_logging) and exits with code 1.
//==================================================================================================

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { evaluateGameEndings } from '../src/lib/analysis/enrichPositionsStockfish'
import { DEFAULT_BATCH_SIZE_Player, STOCKFISH_DEPTH } from '../src/lib/constants'
import { write_logging } from 'nextjs-shared/write_logging'

console.log('Running evaluateGameEndings() directly ...')

async function main() {
  try {
    const result = await evaluateGameEndings({ limit: DEFAULT_BATCH_SIZE_Player, depth: STOCKFISH_DEPTH, forceNewRun: false })
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    await write_logging({
      lg_functionname: 'cron-evaluate-game-endings',
      lg_caller: 'cron-evaluate-game-endings',
      lg_msg: 'cron-evaluate-game-endings failed: ' + (err as Error).message,
      lg_severity: 'E'
    })
    process.exit(1)
  }
}

main()
