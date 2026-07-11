import { NextRequest, NextResponse } from 'next/server'
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
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
