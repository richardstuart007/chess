import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { bulkUpdateCpLoss } from '../src/lib/analysis/enrichPositionsStockfish'

console.log('Running bulkUpdateCpLoss() directly ...')

async function main() {
  const updated = await bulkUpdateCpLoss(1, false)
  console.log(JSON.stringify({ updated }, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
