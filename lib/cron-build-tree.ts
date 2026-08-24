import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { buildPositionTree_Player } from '../src/lib/analysis/buildPositionTree_Player'
import { POSITION_TREE_LIMIT_Player } from '../src/lib/constants'

console.log('Running buildPositionTree_Player() directly ...')

async function main() {
  const result = await buildPositionTree_Player({ limit: POSITION_TREE_LIMIT_Player, player: undefined, skipSync: true, forceNewRun: false })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
