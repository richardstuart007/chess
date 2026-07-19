'use client'

import { MyButton } from 'nextjs-shared/MyButton'

interface FilterActionButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
  variant?: 'primary' | 'pending' | 'secondary'
  disabled?: boolean
}

const VARIANT_CLASS: Record<string, string> = {
  primary: '',
  pending: 'bg-red-500 hover:bg-red-600',
  secondary: 'bg-gray-400 hover:bg-gray-500'
}

//----------------------------------------------------------------------------------------------
//  FilterActionButton — small filter-bar action button (Filter/Refresh/Clear), consistent
//  sizing/styling across every filter site in the app
//----------------------------------------------------------------------------------------------
export default function FilterActionButton({ onClick, children, variant = 'primary', disabled }: FilterActionButtonProps) {
  return (
    <MyButton
      onClick={onClick}
      disabled={disabled}
      overrideClass={`text-xxs px-2 h-6 md:h-6 ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </MyButton>
  )
}
