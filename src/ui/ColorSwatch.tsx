interface ColorSwatchProps {
  color: string | null
}

//----------------------------------------------------------------------------------------------
//  ColorSwatch — white/black text label, consistent between the Games table
//  (gd_player_color: 'white'/'black') and Habits table (pos_color: 'w'/'b')
//----------------------------------------------------------------------------------------------
export default function ColorSwatch({ color }: ColorSwatchProps) {
  const isBlack = color === 'black' || color === 'b'
  return (
    <div className='flex justify-center'>
      <span>{isBlack ? 'black' : 'white'}</span>
    </div>
  )
}
