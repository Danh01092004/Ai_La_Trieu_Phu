import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils'

export type ActionVariant =
  | 'gold'          // primary call to action
  | 'ghost'         // secondary, gold hover
  | 'ghostNeutral'  // secondary, neutral hover
  | 'danger'        // destructive primary
  | 'dangerGhost'   // destructive list row (in-game settings)
  | 'outlineGold'   // wide "close / continue" pill

const VARIANTS: Record<ActionVariant, string> = {
  gold:         'rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-night-900 shadow-gold',
  ghost:        'rounded-xl border border-white/20 bg-white/5 text-white/90 backdrop-blur-md hover:border-gold-300/60',
  ghostNeutral: 'rounded-xl border border-white/20 bg-white/5 text-white/90 backdrop-blur-md hover:border-white/40',
  danger:       'rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-[0_0_25px_rgba(239,68,68,0.5)]',
  dangerGhost:  'rounded-xl border border-white/10 bg-white/5 text-white/80 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300',
  outlineGold:  'rounded-2xl border border-gold-300/60 bg-gradient-to-r from-gold-500/30 to-gold-400/20 text-gold-100 shadow-gold',
}

const SIZES = {
  md: 'px-8 py-3 text-lg',
  sm: 'px-5 py-2 text-sm',
} as const

interface Props {
  children: ReactNode
  onClick: () => void
  variant?: ActionVariant
  size?: keyof typeof SIZES
  icon?: ReactNode
  fullWidth?: boolean
  className?: string
  /** Optional hover sound hook-up (`useSfxActions().hover`). */
  onHover?: () => void
  disabled?: boolean
}

/** Primary/secondary action button with the shared hover + press motion. */
export function ActionButton({
  children,
  onClick,
  variant = 'gold',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  onHover,
  disabled = false,
}: Props) {
  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={disabled ? undefined : onHover}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 font-display font-bold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-night-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {icon}
      {children}
    </motion.button>
  )
}
