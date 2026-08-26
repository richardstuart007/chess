'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PlayerProfile — one tracked player's header card: avatar, name, and rating badges per time
//    class. Clicking the card or a rating badge is optional, caller-driven.
//
//    Parameters:
//      player        — player handle
//      displayName   — optional display name shown above the handle
//      avatar        — optional avatar image URL
//      ratings       — optional rating per time class
//      onClick       — optional; called when the card itself is clicked
//      selected      — highlights the card when true
//      onRatingClick — optional; called with the time class when a rating badge is clicked
//==================================================================================================

import MyBox from 'nextjs-shared/MyBox'

interface PlayerProfileProps {
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
  return (
    <MyBox className={`bg-blue-50 ${selected ? 'outline outline-2 outline-yellow-400' : ''}`}>
      <div
        className={`flex items-start gap-4 rounded ${onClick ? 'cursor-pointer hover:bg-blue-50' : ''}`}
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

          {ratings && Object.keys(ratings).length > 0 && (
            <div className='mt-2 flex flex-wrap gap-2'>
              {Object.entries(ratings).map(([control, rating]) => (
                <span
                  key={control}
                  className={`rounded bg-gray-100 px-2 py-0.5 text-xs ${onRatingClick ? 'cursor-pointer hover:bg-gray-200' : ''}`}
                  onClick={onRatingClick ? (e) => { e.stopPropagation(); onRatingClick(control) } : undefined}
                >
                  {control}: <span className='text-red-600 font-semibold'>{rating}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </MyBox>
  )
}
