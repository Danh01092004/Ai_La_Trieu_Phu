import { motion, useReducedMotion } from 'framer-motion'
import { memo, useRef, useState } from 'react'
import type { AnswerStatus } from '@/types'
import { ANSWER_LETTERS, cn } from '@/utils'
import { useSettingsActions } from '@/state/SettingsContext'

interface Props {
  index: number
  text: string
  status: AnswerStatus
  disabled: boolean
  onSelect: (index: number) => void
}

interface Ripple {
  id: number
  x: number
  y: number
}

const STATUS_STYLE: Record<AnswerStatus, string> = {
  idle: 'border-royal-300/40 bg-white/5 hover:border-gold-300/70',
  selected:
    'border-gold-300 bg-gradient-to-r from-gold-500/30 to-gold-400/20 shadow-gold',
  correct:
    'border-emerald-300 bg-gradient-to-r from-emerald-500/40 to-green-400/30 shadow-[0_0_35px_rgba(16,185,129,0.7)]',
  wrong:
    'border-red-400 bg-gradient-to-r from-red-600/50 to-rose-500/30 shadow-[0_0_35px_rgba(239,68,68,0.7)]',
  removed: 'border-white/5 bg-white/0 opacity-0 pointer-events-none',
}

const LETTER_STATUS: Record<AnswerStatus, string> = {
  idle: 'text-gold-300 bg-night-800/80 border-gold-300/40',
  selected: 'text-night-900 bg-gold-300 border-gold-200',
  correct: 'text-white bg-emerald-500 border-emerald-200',
  wrong: 'text-white bg-red-500 border-red-200',
  removed: 'text-transparent bg-transparent border-transparent',
}

export const AnswerButton = memo(function AnswerButton({ index, text, status, disabled, onSelect }: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleId = useRef(0)
  const reduceMotion = useReducedMotion()
  const { playSfx } = useSettingsActions()

  const isInteractive = !disabled && status !== 'removed'

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isInteractive) return

    if (!reduceMotion) {
      const rect = e.currentTarget.getBoundingClientRect()
      const r = { id: rippleId.current++, x: e.clientX - rect.left, y: e.clientY - rect.top }
      setRipples((prev) => [...prev, r])
      setTimeout(() => setRipples((prev) => prev.filter((p) => p.id !== r.id)), 650)
    }

    onSelect(index)
  }

  return (
    <motion.button
      type="button"
      disabled={!isInteractive}
      onClick={handleClick}
      onMouseEnter={() => isInteractive && playSfx('hover')}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{
        opacity: status === 'removed' ? 0 : 1,
        y: 0,
        scale: status === 'removed' ? 0.9 : 1,
      }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      whileHover={isInteractive && !reduceMotion ? { scale: 1.03 } : undefined}
      whileTap={isInteractive && !reduceMotion ? { scale: 0.97 } : undefined}
      className={cn(
        'group relative flex w-full items-center overflow-hidden rounded-2xl border-2 text-left backdrop-blur-md transition-colors duration-300',
        'font-body',
        STATUS_STYLE[status],
      )}
      style={{
        gap: 'clamp(0.6rem, 1.2vw, 1rem)',
        padding: 'clamp(0.7rem, 1.5vh, 1.15rem) clamp(0.9rem, 1.6vw, 1.4rem)',
        fontSize: 'clamp(0.85rem, 1.25vw, 1.15rem)',
      }}
    >
      {/* shimmer sweep on hover */}
      {isInteractive && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}

      {/* letter badge */}
      <span
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-xl border-2 font-display font-bold transition-colors duration-300',
          LETTER_STATUS[status],
        )}
        style={{
          height: 'clamp(2rem, 2.6vw, 2.5rem)',
          width: 'clamp(2rem, 2.6vw, 2.5rem)',
          fontSize: 'clamp(1rem, 1.5vw, 1.35rem)',
        }}
      >
        {ANSWER_LETTERS[index]}
      </span>

      <span className="relative z-10 leading-snug">{text}</span>

      {/* ripples */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40"
          style={{
            left: r.x,
            top: r.y,
            animation: 'ripple 0.65s ease-out forwards',
          }}
        />
      ))}
    </motion.button>
  )
})
