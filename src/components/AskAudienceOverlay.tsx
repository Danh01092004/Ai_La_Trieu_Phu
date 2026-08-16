/**
 * "Khán Giả" (Ask Audience) lifeline overlay.
 *
 * TROLL MODE: the audience is not always right. The overlay highlights
 * `result.displayWinnerId` — which is the answer shown as "winning" the vote.
 * This may or may not be the correct answer, depending on difficulty.
 *
 * Flow
 * ────
 * 1. Overlay fades in. Animated crowd, moving spotlights, wave-progress and
 *    a 10-second countdown ring run simultaneously.
 * 2. When countdown hits 0, vote bars and percentage counters animate in.
 *    The highest bar is highlighted in gold (it's the "display winner", which
 *    may be a wrong answer on harder difficulties).
 * 3. After 4 seconds the overlay auto-closes; onDone() is called so the parent
 *    can re-enable answers and resume the timer.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AskAudienceResult } from '@/types'
import { ANSWER_LETTERS } from '@/utils'
import { HELPER_TIME } from '@/config/gameConfig'

const AUDIENCE_COUNTDOWN = HELPER_TIME  // seconds
const SHOW_RESULT_MS     = 4000         // ms result stays before auto-close

interface Props {
  result:  AskAudienceResult
  answers: string[]
  onDone:  () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience person SVG silhouette
// ─────────────────────────────────────────────────────────────────────────────

const AudiencePerson = memo(function AudiencePerson({
  x, delay, duration, scale, hue,
}: {
  x: number; delay: number; duration: number; scale: number; hue: string
}) {
  return (
    <motion.g
      transform={`translate(${x},0) scale(${scale})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: delay * 0.08, duration: 0.4 }}
    >
      <motion.g
        animate={{ y: [0, -4, 0] }}
        transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* body */}
        <ellipse cx="0" cy="-10" rx="7" ry="8" fill={hue} />
        {/* head */}
        <ellipse cx="0" cy="-22" rx="5" ry="5" fill={hue} />
        {/* left arm */}
        <motion.line
          x1="-7" y1="-16" x2="-14" y2="-28"
          stroke={hue} strokeWidth="3" strokeLinecap="round"
          animate={{ rotate: [-15, 15, -15] }}
          style={{ transformOrigin: '-7px -16px' }}
          transition={{ duration: duration * 0.6, delay, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* right arm */}
        <motion.line
          x1="7" y1="-16" x2="14" y2="-28"
          stroke={hue} strokeWidth="3" strokeLinecap="round"
          animate={{ rotate: [15, -15, 15] }}
          style={{ transformOrigin: '7px -16px' }}
          transition={{ duration: duration * 0.6, delay: delay + 0.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.g>
    </motion.g>
  )
})

// Pre-computed stable data (module-level = never re-created on re-render)

const CROWD_HUES = [
  '#f5c542', '#60a5fa', '#f87171', '#a78bfa', '#34d399',
  '#fb923c', '#e879f9', '#94a3b8', '#fde68a', '#6ee7b7',
]

const STARS = Array.from({ length: 35 }, () => ({
  width:        Math.random() * 2 + 1,
  height:       Math.random() * 2 + 1,
  left:         Math.random() * 100,
  top:          Math.random() * 65,
  opacity:      Math.random() * 0.4 + 0.05,
  animDuration: Math.random() * 3 + 2,
  animDelay:    Math.random() * 2,
}))

const WAVE_BARS = Array.from({ length: 20 }, (_, i) => ({
  peak:     0.5 + Math.random() * 0.5,
  duration: 0.6 + Math.random() * 0.4,
  delay:    i * 0.04,
}))

interface PersonConfig {
  x: number; delay: number; duration: number; scale: number; hue: string
}

function buildCrowd(count: number): PersonConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    x:        (i / (count - 1)) * 700 - 20,
    delay:    Math.random() * 0.8,
    duration: 0.55 + Math.random() * 0.45,
    scale:    0.7 + Math.random() * 0.6,
    hue:      CROWD_HUES[i % CROWD_HUES.length],
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CountdownRing({ value, total }: { value: number; total: number }) {
  const SIZE   = 90
  const STROKE = 6
  const R      = (SIZE - STROKE) / 2
  const CIRC   = 2 * Math.PI * R
  const pct    = value / total
  const urgent = value <= 3

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={urgent ? '#ef4444' : '#f5c542'}
          strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - CIRC * pct }}
          transition={{ duration: 0.85, ease: 'linear' }}
          style={{ filter: `drop-shadow(0 0 5px ${urgent ? '#ef444488' : '#f5c54288'})` }}
        />
      </svg>
      <motion.span
        key={value}
        initial={{ scale: 1.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`relative z-10 font-display text-3xl font-bold tabular-nums
          ${urgent ? 'text-red-300' : 'text-gold-200'}`}
      >
        {value}
      </motion.span>
    </div>
  )
}

function SpotlightBeams() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[
        { left: '15%', color: 'rgba(245,197,66,0.18)', delay: 0,   dur: 6 },
        { left: '50%', color: 'rgba(91,116,240,0.15)', delay: 1.5, dur: 8 },
        { left: '80%', color: 'rgba(168,85,247,0.14)', delay: 0.8, dur: 7 },
      ].map((s, i) => (
        <motion.div
          key={i}
          className="absolute top-0 h-[110vh] w-[22vw] origin-top blur-2xl"
          style={{
            left:       s.left,
            transform:  'translateX(-50%)',
            background: `linear-gradient(to bottom, ${s.color}, transparent)`,
          }}
          animate={{ rotate: [-14, 14, -14] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function VotingProgress() {
  return (
    <div className="flex items-end justify-center gap-1" style={{ height: 40 }}>
      {WAVE_BARS.map((bar, i) => (
        <motion.div
          key={i}
          className="w-2.5 rounded-sm bg-gold-400/60"
          animate={{ scaleY: [0.15, bar.peak, 0.15] }}
          transition={{ duration: bar.duration, delay: bar.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: 'bottom', height: 36 }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer row with animated bar + counter
// ─────────────────────────────────────────────────────────────────────────────

const AnswerRow = memo(function AnswerRow({
  index, text, percentage, isDisplayWinner, delay,
}: {
  index:          number
  text:           string
  percentage:     number
  /** True when this answer is the one the audience "voted" as highest. */
  isDisplayWinner: boolean
  delay:          number
}) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const DURATION = 1200
    let start: number | null = null
    const easeOut = (t: number) => 1 - (1 - t) ** 2

    const delayTimer = window.setTimeout(() => {
      rafRef.current = requestAnimationFrame(function tick(now) {
        if (start === null) start = now
        const p = Math.min(1, (now - start) / DURATION)
        setDisplayed(Math.round(easeOut(p) * percentage))
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      })
    }, delay)

    return () => {
      clearTimeout(delayTimer)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [percentage, delay])

  // Winner bar: gold. Others: muted blue/purple.
  const barGradient = isDisplayWinner
    ? 'from-gold-400 to-amber-400'
    : 'from-royal-500/70 to-purpleglow-600/60'

  const barGlow = isDisplayWinner
    ? '0 0 12px rgba(245,197,66,0.7)'
    : '0 0 6px rgba(91,116,240,0.35)'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay / 1000 + 0.1, duration: 0.35 }}
      className="flex items-center gap-3"
    >
      {/* Letter badge */}
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl font-display text-base font-bold
          ${isDisplayWinner
            ? 'bg-gold-500/25 ring-2 ring-gold-300/80 text-gold-200'
            : 'bg-white/8 ring-1 ring-white/15 text-white/60'}`}
      >
        {ANSWER_LETTERS[index]}
      </div>

      {/* Text + bar */}
      <div className="min-w-0 flex-1">
        <p className={`mb-1 truncate font-body text-sm
          ${isDisplayWinner ? 'text-white/95' : 'text-white/70'}`}>
          {text}
        </p>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${barGradient}`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1.2, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: barGlow }}
          />
        </div>
      </div>

      {/* Percentage number */}
      <div
        className={`w-12 text-right font-display text-lg font-bold tabular-nums
          ${isDisplayWinner ? 'text-gold-300' : 'text-white/60'}`}
      >
        {displayed}%
      </div>
    </motion.div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Main overlay
// ─────────────────────────────────────────────────────────────────────────────

export const AskAudienceOverlay = memo(function AskAudienceOverlay({
  result, answers, onDone,
}: Props) {
  const [countdown, setCountdown] = useState(AUDIENCE_COUNTDOWN)
  const [showResult, setShowResult] = useState(false)
  const doneRef = useRef(false)

  // Stable crowd layout — one per mount
  const crowd = useMemo(() => buildCrowd(28), [])

  // ── Countdown tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (showResult) return
    if (countdown <= 0) {
      setShowResult(true)
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [countdown, showResult])

  // ── Auto-close after showing result ──────────────────────────────────────
  useEffect(() => {
    if (!showResult || doneRef.current) return
    const id = window.setTimeout(() => {
      doneRef.current = true
      onDone()
    }, SHOW_RESULT_MS)
    return () => window.clearTimeout(id)
  }, [showResult, onDone])

  const handleClose = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }, [onDone])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, rgba(20,15,70,0.98) 0%, rgba(5,5,25,0.99) 100%)',
      }}
    >
      <SpotlightBeams />

      {/* Starfield */}
      <div className="pointer-events-none absolute inset-0">
        {STARS.map((s, i) => (
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
            animate={{ opacity: [0.05, 0.5, 0.05] }}
            transition={{ duration: s.animDuration, repeat: Infinity, delay: s.animDelay }}
          />
        ))}
      </div>

      {/* Audience rows */}
      <div className="relative w-full overflow-hidden" style={{ height: 130 }}>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-300/40 to-transparent" />
        {[1, 0.82, 0.64].map((opacity, row) => (
          <div
            key={row}
            className="absolute inset-x-0"
            style={{ bottom: row * 38 + 10, opacity }}
          >
            <svg viewBox="0 0 740 60" className="w-full" style={{ height: 60 }} preserveAspectRatio="xMidYMax slice">
              {crowd
                .filter((_, i) => i % 3 === row % 3)
                .map((p, i) => <AudiencePerson key={i} {...p} />)}
            </svg>
          </div>
        ))}
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mt-2 text-center"
      >
        <span className="font-display text-xs tracking-[0.5em] text-gold-300/70 uppercase">
          Trợ Giúp
        </span>
        <h2
          className="font-display font-bold tracking-widest text-gold-300 text-glow-gold"
          style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)' }}
        >
          KHÁN GIẢ ĐANG BÌNH CHỌN
        </h2>
      </motion.div>

      {/* Countdown / Result */}
      <div className="relative z-10 mt-4 w-full flex-1" style={{ maxWidth: 'min(90vw, 560px)' }}>
        <AnimatePresence mode="wait">
          {!showResult ? (
            <motion.div
              key="counting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-4 px-4"
            >
              <VotingProgress />
              <CountdownRing value={countdown} total={AUDIENCE_COUNTDOWN} />
              <p
                className="font-body text-white/55 tracking-wide"
                style={{ fontSize: 'clamp(0.8rem, 1.4vw, 0.95rem)' }}
              >
                Khán giả đang bỏ phiếu...
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-3 rounded-3xl border border-gold-300/20 bg-night-800/60 px-6 py-5 backdrop-blur-md mx-4"
            >
              {/* Header */}
              <div className="mb-1 flex items-center justify-between">
                <span className="font-display text-xs tracking-[0.3em] text-gold-300/70 uppercase">
                  Kết quả bình chọn
                </span>
                <motion.button
                  type="button"
                  onClick={handleClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10
                             bg-white/5 text-white/50 text-xs hover:text-white/80 transition-colors"
                  aria-label="Đóng"
                >
                  ✕
                </motion.button>
              </div>

              {/* Answer rows — highlight the DISPLAY WINNER, not necessarily correct */}
              {answers.map((ans, i) => (
                <AnswerRow
                  key={i}
                  index={i}
                  text={ans}
                  percentage={result.percentages[i]}
                  isDisplayWinner={i === result.displayWinnerId}
                  delay={i * 150}
                />
              ))}

              <p
                className="mt-1 text-center font-body text-white/35"
                style={{ fontSize: 'clamp(0.65rem, 1vw, 0.8rem)' }}
              >
                Tự động tiếp tục sau {Math.ceil(SHOW_RESULT_MS / 1000)} giây...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
})
