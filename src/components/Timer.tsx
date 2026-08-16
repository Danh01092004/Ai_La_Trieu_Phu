/**
 * Timer — C1 patch: reads `remaining` and `timerActive` from TimerContext
 * instead of props, so countdown ticks only re-render this component.
 *
 * WHAT CHANGED
 * ────────────
 * • `remaining` and `active` are no longer received as props; they come from
 *   `useTimerValue()` (TimerContext).
 * • The Props interface is kept for backward compatibility but both fields are
 *   now optional/ignored — Game.tsx will be updated to stop passing them.
 *   (TypeScript will still compile if old call-sites pass them; they're just
 *   unused.)
 * • All visual rendering logic is 100% identical.
 *
 * WHAT DID NOT CHANGE
 * ───────────────────
 * All animations, color logic, danger/warn modes — unchanged.
 */
import { memo } from 'react'
import { motion } from 'framer-motion'
import { QUESTION_TIME } from '@/services/timer'
import { useTimerValue } from '@/state/TimerContext'

function phaseColor(remaining: number) {
  if (remaining <= 5)  return { ring: '#ef4444', glow: 'rgba(239,68,68,0.85)',   text: 'text-red-300'    }
  if (remaining <= 10) return { ring: '#f97316', glow: 'rgba(249,115,22,0.8)',   text: 'text-orange-300' }
  if (remaining <= 20) return { ring: '#f5c542', glow: 'rgba(245,197,66,0.8)',   text: 'text-gold-300'   }
  return               { ring: '#5b74f0', glow: 'rgba(91,116,240,0.75)',  text: 'text-royal-300'  }
}

// Internal SVG coordinate space; the element itself scales via CSS clamp().
const SIZE   = 120
const STROKE = 9
const R      = (SIZE - STROKE) / 2
const CIRC   = 2 * Math.PI * R
const BOX    = 'clamp(4.5rem, 8.5vw, 8rem)'

/**
 * C1: Timer now subscribes to TimerContext.
 * Props are kept for TypeScript compatibility with any existing call-site,
 * but the values come from context — not from props.
 */
export const Timer = memo(function Timer(_props: { remaining?: number; active?: boolean }) {
  // Read live values from TimerContext — only this component re-renders on ticks.
  const { remaining, timerActive: active } = useTimerValue()

  const pct    = remaining / QUESTION_TIME
  const dash   = CIRC * pct
  const color  = phaseColor(remaining)
  const danger = remaining <= 5  && active
  const warn   = remaining <= 10 && active

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: BOX, height: BOX }}
      animate={
        danger
          ? { x: [0, -3, 3, -3, 3, 0], rotate: [0, -1, 1, -1, 0] }
          : { x: 0, rotate: 0 }
      }
      transition={danger ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
    >
      {/* pulsing halo */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 30px ${color.glow}, 0 0 60px ${color.glow}` }}
        animate={{ opacity: active ? [0.5, 1, 0.5] : 0.3, scale: warn ? [1, 1.08, 1] : 1 }}
        transition={{ duration: warn ? 0.5 : 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute h-full w-full -rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color.ring}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - dash }}
          transition={{ duration: 0.9, ease: 'linear' }}
          style={{ filter: `drop-shadow(0 0 6px ${color.glow})` }}
        />
      </svg>

      <div className="relative z-10 flex flex-col items-center">
        <motion.span
          key={remaining}
          initial={{ scale: warn ? 1.4 : 1.15, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className={`font-display font-bold tabular-nums ${color.text}`}
          style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.6rem)' }}
        >
          {remaining}
        </motion.span>
        <span
          className="font-display tracking-[0.25em] text-white/50"
          style={{ fontSize: 'clamp(0.5rem, 0.8vw, 0.7rem)' }}
        >
          GIÂY
        </span>
      </div>
    </motion.div>
  )
})
