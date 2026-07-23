import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { syncTposFromTgam } from '../src/lib/analysis/buildPositionTree'

console.log('Running syncTposFromTgam() directly ...')

async function main() {
  const result = await syncTposFromTgam(1, false)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
