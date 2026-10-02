'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PlayerProfile — one player's (or master's — see AppNav's Master box) header card: avatar,
//    name, and badges (rating per time class for a tracked player; a single Grade badge for a
//    master, via the same generic `ratings` prop). Clicking the card or a badge is optional,
//    caller-driven.
//
//    Parameters:
//      player        — handle (chess.com username for a player, or master's chess.com handle)
//      displayName   — optional display name shown above the handle
//      avatar        — optional avatar image URL
//      ratings       — optional badges, e.g. one per time class for a player, or a single
//                      { Grade: n } for a master — rendered identically either way
//      onClick       — optional; called when the card itself is clicked
//      selected      — highlights the card when true
//      onRatingClick — optional; called with the badge's key when clicked
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'

type PlayerProfileProps = {
  player: string
  displayName?: string
  avatar?: string
  ratings?: Record<string, number>
  onClick?: () => void
  selected?: boolean
  onRatingClick?: (control: string) => void
}

export default function PlayerProfile({
  player,
  displayName,
  avatar,
  ratings,
  onClick,
  selected,
  onRatingClick
}: PlayerProfileProps) {
  const boxClass = `bg-blue-50 ${selected ? 'outline outline-2 outline-yellow-400' : ''}`
  const cardClass = `flex items-start gap-4 rounded ${onClick ? 'cursor-pointer hover:bg-blue-50' : ''}`
  const showRatings = !!ratings && Object.keys(ratings).length > 0
  const ratingEntries = ratings ? Object.entries(ratings) : []
  const ratingClass = `rounded bg-gray-100 px-2 py-0.5 text-xs ${onRatingClick ? 'cursor-pointer hover:bg-gray-200' : ''}`
  return (
    <MyBox className={boxClass}>
      <div
        className={cardClass}
        onClick={onClick}
      >
        {avatar && (
          <img
            src={avatar}
            alt={player}
            className='h-16 w-16 rounded-full'
          />
        )}
        <div className='flex-1'>
          {displayName && (
            <h2 className='text-sm font-bold'>{displayName}</h2>
          )}
          <p className='text-xs text-gray-500'>{player}</p>

          {showRatings && (
            <div className='mt-2 flex flex-wrap gap-2'>
              {ratingEntries.map(([control, rating]) => {
                const handleRatingClick = onRatingClick
                  ? (e: React.MouseEvent) => { e.stopPropagation(); onRatingClick(control) }
                  : undefined
                return (
                  <span
                    key={control}
                    className={ratingClass}
                    onClick={handleRatingClick}
                  >
                    {control}: <span className='text-red-600 font-semibold'>{rating}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </MyBox>
  )
}
