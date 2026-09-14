//==================================================================================================
//  1) DESCRIPTION
//    historicalPlayerSlug — normalized full-name identifier used as mgd_player/mgd_white_username/
//    mgd_black_username (importHistoricalGames.ts) and as the getMasterHandleNameMap fallback key
//    (masterPlayers.ts) for a master with no real chess.com handle (mst_chesscom_handle IS NULL).
//    A plain sync helper — kept out of importHistoricalGames.ts/masterPlayers.ts because both have
//    'use server', which requires every export to be an async server action (matches the existing
//    winPct.ts/formatCp.ts/objectiveGameResult.ts pattern of small standalone utility files).
//
//    Parameters:
//      firstName — the master's first name (may be empty)
//      lastName  — the master's last name
//
//    Returns:
//      a lowercased, hyphen-separated slug of "firstName lastName"
//==================================================================================================

export function historicalPlayerSlug(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, '-')
}
