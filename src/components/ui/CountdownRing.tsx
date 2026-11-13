import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/utils'

interface Props {
  value: number
  total: number
  /** Pixel diameter. */
  size?: number
  /** Value at or below which the ring turns red. */
  urgentAt?: number
  className?: string
}

/** Circular countdown with the remaining seconds in the middle. */
export function CountdownRing({ value, total, size = 90, urgentAt = 3, className }: Props) {
  const reduceMotion = useReducedMotion()
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  const urgent = value <= urgentAt
  const color = urgent ? '#ef4444' : '#f5c542'

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference - circumference * progress }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.85, ease: 'linear' }}
          style={{ filter: `drop-shadow(0 0 5px ${urgent ? '#ef444488' : '#f5c54288'})` }}
        />
      </svg>

      <motion.span
        key={value}
        initial={reduceMotion ? false : { scale: 1.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
        className={cn(
          'relative z-10 font-display font-bold tabular-nums',
          size >= 100 ? 'text-4xl' : 'text-3xl',
          urgent ? 'text-red-300' : 'text-gold-200',
        )}
      >
        {value}
      </motion.span>
    </div>
  )
}
