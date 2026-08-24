import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { syncTposFromTgam_Player } from '../src/lib/analysis/buildPositionTree_Player'

console.log('Running syncTposFromTgam_Player() directly ...')

async function main() {
  const result = await syncTposFromTgam_Player(1, false)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
