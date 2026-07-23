import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { buildPositionTree } from '../src/lib/analysis/buildPositionTree'
import { DEFAULT_BATCH_SIZE } from '../src/lib/constants'

console.log('Running buildPositionTree() directly ...')

async function main() {
  const result = await buildPositionTree({ limit: DEFAULT_BATCH_SIZE, playerUsername: undefined, skipSync: true, forceNewRun: false })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
