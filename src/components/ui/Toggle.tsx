import { motion } from 'framer-motion'
import { cn } from '@/utils'

/** Shared sizing for the settings controls (lobby uses `md`, in-game `sm`). */
export type ControlSize = 'md' | 'sm'

const SIZES: Record<
  ControlSize,
  {
    button: string
    label: string
    icon: string
    track: string
    trackWidth: number
    knob: string
    knobOffX: number
    knobOnX: number
  }
> = {
  md: {
    button:       'rounded-2xl px-4 py-3 hover:border-gold-300/50',
    label:        'text-white/90',
    icon:         'text-xl',
    track:        'h-7',
    trackWidth:   52,
    knob:         'h-5 w-5',
    knobOffX:     3,
    knobOnX:      26,
  },
  sm: {
    button:       'rounded-xl px-4 py-3 hover:border-gold-300/40',
    label:        'text-sm text-white/90',
    icon:         'text-lg',
    track:        'h-6',
    trackWidth:   48,
    knob:         'h-4 w-4',
    knobOffX:     4,
    knobOnX:      28,
  },
}

interface Props {
  checked: boolean
  onChange: () => void
  label: string
  icon?: string
  size?: ControlSize
  className?: string
}

/** Labelled on/off switch with an animated knob. */
export function Toggle({ checked, onChange, label, icon, size = 'md', className }: Props) {
  const style = SIZES[size]

  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        'flex w-full items-center justify-between border border-white/10 bg-white/5 transition-colors',
        style.button,
        className,
      )}
    >
      <span className={cn('flex items-center gap-3 font-body', style.label)}>
        {icon && <span className={style.icon}>{icon}</span>}
        {label}
      </span>

      <span
        className={cn(
          'relative rounded-full border transition-colors duration-300',
          style.track,
          checked ? 'border-gold-300 bg-gold-500/40' : 'border-white/20 bg-white/10',
        )}
        style={{ width: style.trackWidth }}
      >
        <motion.span
          layout
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-full shadow-md',
            style.knob,
            checked ? 'bg-gold-300' : 'bg-white/60',
          )}
          animate={{ left: checked ? style.knobOnX : style.knobOffX }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  )
}
