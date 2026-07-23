import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { purgeStaleReachOnePositions } from '../src/lib/analysis/purgePositions'

console.log('Running purgeStaleReachOnePositions() directly ...')

async function main() {
  const result = await purgeStaleReachOnePositions(1, false)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
