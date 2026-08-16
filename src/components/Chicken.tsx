import { memo } from 'react'
import { motion } from 'framer-motion'

interface Props {
  /** vertical position as a viewport-height fraction (0 = top, 1 = bottom) */
  top: number
  /** running direction */
  dir: 'ltr' | 'rtl'
  /** seconds to cross the screen */
  duration: number
  /** start delay in seconds */
  delay: number
  /** overall scale */
  scale: number
  /** 'run' = flap + bob, 'jump' = big hops, 'spin' = tumbling across */
  style: 'run' | 'jump' | 'spin'
  /** hop height in px (jump/run bob) */
  hop?: number
  hue?: string
}

/**
 * A cartoon chicken that runs, hops or tumbles across the screen with flapping
 * wings and jiggling legs. Pure inline SVG + Framer Motion, no assets, GPU-only
 * transforms (x/y/rotate/scale) so a big flock stays at 60 FPS.
 */
function ChickenImpl({ top, dir, duration, delay, scale, style, hop = 60, hue = '#f8fafc' }: Props) {
  const fromX = dir === 'ltr' ? '-20vw' : '120vw'
  const toX = dir === 'ltr' ? '120vw' : '-20vw'
  const facing = dir === 'ltr' ? 1 : -1

  // Per-style vertical motion + body wobble.
  const y =
    style === 'jump'
      ? [0, -hop, 0, -hop * 0.7, 0, -hop, 0]
      : style === 'spin'
        ? [0, -hop * 0.5, 0, -hop * 0.5, 0]
        : [0, -8, 0, -8, 0]

  const bodyRotate =
    style === 'spin'
      ? [0, facing * 360] // full tumble
      : style === 'jump'
        ? [0, -8, 8, 0]
        : [-3, 3, -3]

  return (
    <motion.div
      className="pointer-events-none absolute z-20 will-change-transform"
      style={{ top: `${top * 100}vh` }}
      initial={{ x: fromX }}
      animate={{ x: toX, y }}
      transition={{
        x: { duration, delay, ease: 'linear' },
        y: {
          duration: style === 'jump' ? 1.0 : style === 'spin' ? 0.9 : 0.4,
          delay,
          repeat: Infinity,
          ease: style === 'jump' ? 'easeOut' : 'easeInOut',
        },
      }}
    >
      <motion.div
        style={{ scaleX: facing, transformOrigin: 'center' }}
        animate={{ rotate: bodyRotate }}
        transition={{
          duration: style === 'spin' ? duration : 0.35,
          repeat: Infinity,
          ease: style === 'spin' ? 'linear' : 'easeInOut',
          delay,
        }}
      >
        <svg
          width={90 * scale}
          height={90 * scale}
          viewBox="0 0 100 100"
          style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))' }}
        >
          {/* legs */}
          <motion.g
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{ rotate: [8, -8, 8] }}
            transition={{ duration: 0.28, repeat: Infinity, ease: 'linear', delay }}
            style={{ transformOrigin: '50px 78px' }}
          >
            <line x1="45" y1="72" x2="42" y2="90" />
            <line x1="42" y1="90" x2="36" y2="92" />
            <line x1="42" y1="90" x2="46" y2="93" />
            <line x1="57" y1="72" x2="60" y2="90" />
            <line x1="60" y1="90" x2="54" y2="93" />
            <line x1="60" y1="90" x2="66" y2="92" />
          </motion.g>

          {/* tail */}
          <path d="M20 46 Q6 34 14 24 Q20 34 30 40 Z" fill={hue} stroke="#cbd5e1" strokeWidth="1.5" />

          {/* body */}
          <ellipse cx="52" cy="56" rx="26" ry="22" fill={hue} stroke="#e2e8f0" strokeWidth="1.5" />

          {/* wing (flapping) */}
          <motion.path
            d="M48 52 Q34 50 30 62 Q42 66 54 60 Z"
            fill="#e2e8f0"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            animate={{ rotate: [0, -40, 0] }}
            transition={{ duration: 0.2, repeat: Infinity, ease: 'easeInOut', delay }}
            style={{ transformOrigin: '48px 56px' }}
          />

          {/* head */}
          <circle cx="70" cy="38" r="15" fill={hue} stroke="#e2e8f0" strokeWidth="1.5" />
          {/* comb */}
          <path d="M64 24 q4 -6 8 0 q4 -6 8 0 q -2 6 -8 6 q -6 0 -8 -6Z" fill="#ef4444" />
          {/* wattle */}
          <path d="M70 50 q-3 6 2 8 q5 -2 3 -8Z" fill="#ef4444" />
          {/* beak */}
          <path d="M84 38 l12 -3 l-12 7Z" fill="#f59e0b" />
          {/* eye */}
          <circle cx="74" cy="35" r="2.6" fill="#0f172a" />
          <circle cx="75" cy="34" r="0.9" fill="#fff" />
        </svg>
      </motion.div>
    </motion.div>
  )
}

export const Chicken = memo(ChickenImpl)
