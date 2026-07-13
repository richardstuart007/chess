import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { runGameSync } from '@/src/lib/actions/sync'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await runGameSync()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Cron sync error:', err)
    await write_logging({
      lg_functionname: 'api/cron/sync',
      lg_caller: 'vercelCronSync',
      lg_msg: 'Cron sync error: ' + (err as Error).message,
      lg_severity: 'E'
    })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
