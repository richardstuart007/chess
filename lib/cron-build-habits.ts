import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { buildHabits } from '../src/lib/analysis/buildHabits'

console.log('Running buildHabits() directly ...')

async function main() {
  const result = await buildHabits(1, false)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
