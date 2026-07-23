import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { evaluateGameEndings } from '../src/lib/analysis/enrichPositionsStockfish'
import { DEFAULT_BATCH_SIZE, STOCKFISH_DEPTH } from '../src/lib/constants'

console.log('Running evaluateGameEndings() directly ...')

async function main() {
  const result = await evaluateGameEndings({ limit: DEFAULT_BATCH_SIZE, depth: STOCKFISH_DEPTH, forceNewRun: false })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
