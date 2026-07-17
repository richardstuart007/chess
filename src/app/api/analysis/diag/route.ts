import { NextRequest, NextResponse } from 'next/server'
import { table_count } from 'nextjs-shared/table_count'
import { table_fetch } from 'nextjs-shared/table_fetch'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? 'stricade'

  const [total, forPlayer, sample] = await Promise.all([
    table_count({ caller: 'diag', table: 'tgr_gamesraw' }),
    table_count({ caller: 'diag', table: 'tgr_gamesraw', whereColumnValuePairs: [{ column: 'gr_player', value: player }] }),
    table_fetch({ caller: 'diag', table: 'tgr_gamesraw', distinct: true, columns: ['gr_player'], limit: 10 }),
  ])

  return NextResponse.json({
    total_rows:       total,
    rows_for_player:  forPlayer,
    player_searched:  player,
    distinct_players: sample.map((r: any) => r.gr_player),
  })
}
