/**
 * "Hỏi MC" lifeline overlay.
 *
 * Flow:
 *  1. Overlay fades in → mic icon pulses → 10-second countdown runs.
 *  2. When countdown hits 0, the MC's suggestion appears with a dramatic
 *     slide-up animation.
 *  3. After 3 seconds the overlay fades out and onDone() is called so the
 *     parent can resume the timer and re-enable answers.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AskMcResult } from '@/types'

import { HELPER_TIME } from '@/config/gameConfig'

const MC_COUNTDOWN   = HELPER_TIME  // seconds of "thinking" before the suggestion appears
const SHOW_RESULT_MS = 3000         // how long the suggestion is visible before auto-close

interface Props {
  result: AskMcResult
  onDone: () => void
}

function MicIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="none">
      <rect x="16" y="4" width="16" height="26" rx="8" fill="currentColor" opacity="0.9" />
      <path
        d="M8 24c0 8.837 7.163 16 16 16s16-7.163 16-16"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="24" y1="40" x2="24" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="46" x2="32" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Animated sound-wave bars behind the mic. */
function SoundWaves() {
  const bars = [0.4, 0.7, 1, 0.7, 0.4]
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-1.5">
      {bars.map((scale, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full bg-gold-300/40"
          animate={{ scaleY: [scale * 0.4, scale, scale * 0.4] }}
          transition={{
            duration: 0.9,
            delay: i * 0.12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ height: 56 }}
        />
      ))}
    </div>
  )
}

function CountdownRing({ value, total }: { value: number; total: number }) {
  const SIZE = 100
  const STROKE = 6
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R
  const pct = value / total
  const urgent = value <= 3

  return (
    <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={urgent ? '#ef4444' : '#f5c542'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - CIRC * pct }}
          transition={{ duration: 0.85, ease: 'linear' }}
          style={{ filter: `drop-shadow(0 0 6px ${urgent ? '#ef444488' : '#f5c54288'})` }}
        />
      </svg>
      <motion.span
        key={value}
        initial={{ scale: 1.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`relative z-10 font-display text-4xl font-bold tabular-nums ${urgent ? 'text-red-300' : 'text-gold-200'}`}
      >
        {value}
      </motion.span>
    </div>
  )
}

const MC_PHRASES_PREFIX = [
  'Tôi nghĩ đáp án là',
  'Theo tôi, câu trả lời là',
  'Nếu là tôi, tôi sẽ chọn',
  'Tôi khá chắc đó là đáp án',
  'Tôi cho rằng đáp án đúng là',
]

// Pre-computed starfield — stable across renders
const MC_STARS = Array.from({ length: 40 }, () => ({
  width:        Math.random() * 2.5 + 1,
  height:       Math.random() * 2.5 + 1,
  left:         Math.random() * 100,
  top:          Math.random() * 100,
  opacity:      Math.random() * 0.5 + 0.1,
  animDuration: Math.random() * 3 + 2,
  animDelay:    Math.random() * 2,
}))

export function AskMcOverlay({ result, onDone }: Props) {
  const [countdown, setCountdown] = useState(MC_COUNTDOWN)
  const [showResult, setShowResult] = useState(false)
  const doneRef = useRef(false)
  const phrase = useRef(MC_PHRASES_PREFIX[Math.floor(Math.random() * MC_PHRASES_PREFIX.length)])

  // Countdown tick
  useEffect(() => {
    if (showResult) return
    if (countdown <= 0) {
      setShowResult(true)
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [countdown, showResult])

  // Auto-close after showing result
  useEffect(() => {
    if (!showResult || doneRef.current) return
    const id = window.setTimeout(() => {
      doneRef.current = true
      onDone()
    }, SHOW_RESULT_MS)
    return () => window.clearTimeout(id)
  }, [showResult, onDone])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(30,20,80,0.97) 0%, rgba(5,5,25,0.99) 100%)' }}
    >
      {/* Starfield atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        {MC_STARS.map((s, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width:   s.width,
              height:  s.height,
              left:    `${s.left}%`,
              top:     `${s.top}%`,
              opacity: s.opacity,
            }}
            animate={{ opacity: [0.1, 0.7, 0.1] }}
            transition={{ duration: s.animDuration, repeat: Infinity, delay: s.animDelay }}
          />
        ))}
      </div>

      {/* Glow backdrop */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal-500/10 blur-[120px]" />

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-8 text-center"
      >
        <span className="font-display text-sm tracking-[0.5em] text-gold-300/70 uppercase">Trợ Giúp</span>
        <h2
          className="font-display font-bold tracking-widest text-gold-300 text-glow-gold"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}
        >
          HỎI MC
        </h2>
      </motion.div>

      {/* Mic + waves */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.3 }}
        className="relative mb-8 flex items-center justify-center"
        style={{ width: 160, height: 120 }}
      >
        <SoundWaves />
        <motion.div
          className="relative z-10 text-gold-300"
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 72, height: 72 }}
        >
          <MicIcon />
        </motion.div>
      </motion.div>

      {/* Countdown → Result */}
      <AnimatePresence mode="wait">
        {!showResult ? (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="font-body text-white/60" style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1rem)' }}>
              MC đang suy nghĩ...
            </p>
            <CountdownRing value={countdown} total={MC_COUNTDOWN} />
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-4 text-center"
            style={{ maxWidth: 'min(90vw, 520px)' }}
          >
            {/* MC avatar bubble */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-300/60 bg-gradient-to-br from-royal-500/60 to-purpleglow-600/40 text-3xl shadow-gold">
              🎙️
            </div>

            <motion.div
              className="glass rounded-3xl border border-gold-300/30 px-8 py-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <p className="mb-3 font-body text-white/70" style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.1rem)' }}>
                {phrase.current}
              </p>
              <div className="flex items-center justify-center gap-3">
                {/* Letter badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/20 ring-2 ring-gold-300/70"
                >
                  <span className="font-display text-2xl font-bold text-gold-300">
                    {result.suggestedLetter}
                  </span>
                </motion.div>
                <p
                  className="font-body font-medium text-white"
                  style={{ fontSize: 'clamp(1rem, 2vw, 1.3rem)' }}
                >
                  {result.suggestedText}
                </p>
              </div>
            </motion.div>

            <p className="font-body text-white/40" style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)' }}>
              Tự động tiếp tục sau {Math.ceil(SHOW_RESULT_MS / 1000)} giây...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
