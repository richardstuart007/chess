import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { deepenPopularPositions } from '../src/lib/analysis/enrichPositionsStockfish'
import { CRON_DEEPEN_POPULAR_BATCH_SIZE } from '../src/lib/constants'

console.log('Running deepenPopularPositions() directly ...')

async function main() {
  const result = await deepenPopularPositions({ limit: CRON_DEEPEN_POPULAR_BATCH_SIZE, forceNewRun: false })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
