interface ColorSwatchProps {
  color: string | null
}

//----------------------------------------------------------------------------------------------
//  ColorSwatch — small filled circle indicating white/black, consistent between the Games
//  table (gd_player_color: 'white'/'black') and Habits table (pos_color: 'w'/'b')
//----------------------------------------------------------------------------------------------
export default function ColorSwatch({ color }: ColorSwatchProps) {
  const isBlack = color === 'black' || color === 'b'
  return (
    <div className='flex justify-center'>
      <span className={`inline-block h-3 w-3 rounded-full border border-gray-300 ${isBlack ? 'bg-gray-800' : 'bg-white'}`} />
    </div>
  )
}
