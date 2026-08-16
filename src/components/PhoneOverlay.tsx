/**
 * "Gọi Điện Cho Bạn" (Phone a Friend) lifeline overlay.
 *
 * Flow
 * ────
 * 1. Overlay fades in. Animated ringing phone, crackling sound-wave bars and
 *    a 30-second countdown run simultaneously (friend "picks up" after ~3 s).
 * 2. After 8 s the friend's suggestion appears with a typing-style reveal.
 * 3. After 4 more seconds the overlay auto-closes and onDone() fires so the
 *    parent can resume the timer and re-enable answers.
 *
 * Like the MC lifeline the friend is fallible:
 *   Easy      → 85 % correct
 *   Medium    → 70 % correct
 *   Hard      → 55 % correct
 *   Very Hard → 40 % correct
 */
import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Difficulty, Question } from '@/types'
import { ANSWER_LETTERS } from '@/utils'
import { PHONE_TIME } from '@/config/gameConfig'

const CALL_COUNTDOWN  = PHONE_TIME  // total call duration shown to player (seconds)
const THINKING_SECS   = 8           // how long before the friend gives an answer
const SHOW_ANSWER_MS  = 4000        // how long the answer is shown before auto-close

// Friend accuracy by difficulty
const FRIEND_ACCURACY: Record<Difficulty, number> = {
  easy:      0.85,
  medium:    0.70,
  hard:      0.55,
  very_hard: 0.40,
}

const FRIEND_PHRASES_CORRECT = [
  'Mình chắc chắn đó là đáp án',
  'Tớ tin chắc câu trả lời là',
  'Không còn nghi ngờ gì nữa, đó là',
  'Câu này mình học rồi, đáp án là',
]

const FRIEND_PHRASES_UNSURE = [
  'Mình không chắc lắm, nhưng có lẽ là',
  'Tớ nghĩ... có thể là',
  'Đây là câu khó, nhưng tớ đoán là',
  'Mình không chắc, nhưng cứ thử đáp án',
]

// Pre-computed stable starfield
const PH_STARS = Array.from({ length: 38 }, () => ({
  width:        Math.random() * 2.5 + 1,
  height:       Math.random() * 2.5 + 1,
  left:         Math.random() * 100,
  top:          Math.random() * 100,
  opacity:      Math.random() * 0.5 + 0.1,
  animDuration: Math.random() * 3 + 2,
  animDelay:    Math.random() * 2,
}))

function PhoneRingIcon({ ringing }: { ringing: boolean }) {
  return (
    <motion.div
      animate={ringing ? { rotate: [-12, 12, -12, 12, 0], scale: [1, 1.08, 1] } : {}}
      transition={ringing ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' } : {}}
      className="text-gold-300"
      style={{ fontSize: 'clamp(3rem, 7vw, 4.5rem)' }}
    >
      📞
    </motion.div>
  )
}

function VoiceBars({ active }: { active: boolean }) {
  const heights = [0.4, 0.7, 1, 1.2, 1, 0.7, 0.4]
  return (
    <div className="flex items-center justify-center gap-1" style={{ height: 48 }}>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full bg-gold-400/50"
          animate={active ? { scaleY: [h * 0.3, h, h * 0.3] } : { scaleY: 0.15 }}
          transition={active
            ? { duration: 0.6 + i * 0.05, delay: i * 0.08, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.3 }}
          style={{ height: 40 }}
        />
      ))}
    </div>
  )
}

function CountdownRing({ value, total }: { value: number; total: number }) {
  const SIZE   = 90
  const STROKE = 6
  const R      = (SIZE - STROKE) / 2
  const CIRC   = 2 * Math.PI * R
  const pct    = value / total
  const urgent = value <= 5

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE/2} cy={SIZE/2} r={R}
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
        initial={{ scale: 1.3, opacity: 0.5 }}
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

interface Props {
  question: Question
  onDone:   () => void
}

export const PhoneOverlay = memo(function PhoneOverlay({ question, onDone }: Props) {
  const [countdown, setCountdown] = useState(CALL_COUNTDOWN)
  const [pickUp, setPickUp]       = useState(false)   // friend "picks up" after ~3 s
  const [showAnswer, setShowAnswer] = useState(false)
  const doneRef = useRef(false)

  // Compute the friend's suggestion once on mount
  const suggestionRef = useRef<{ index: number; isCorrect: boolean; phrase: string } | null>(null)
  if (!suggestionRef.current) {
    const isCorrect    = Math.random() < FRIEND_ACCURACY[question.difficulty]
    const wrongIndices = question.answers.map((_, i) => i).filter((i) => i !== question.correct)
    const index        = isCorrect
      ? question.correct
      : wrongIndices[Math.floor(Math.random() * wrongIndices.length)]
    const phrases      = isCorrect ? FRIEND_PHRASES_CORRECT : FRIEND_PHRASES_UNSURE
    const phrase       = phrases[Math.floor(Math.random() * phrases.length)]
    suggestionRef.current = { index, isCorrect, phrase }
  }

  const { index: sugIdx, phrase } = suggestionRef.current

  // ── Pick up after 3 s ────────────────────────────────────────────────────
  useEffect(() => {
    const t = window.setTimeout(() => setPickUp(true), 3000)
    return () => window.clearTimeout(t)
  }, [])

  // ── Show answer after THINKING_SECS ──────────────────────────────────────
  useEffect(() => {
    const t = window.setTimeout(() => setShowAnswer(true), THINKING_SECS * 1000)
    return () => window.clearTimeout(t)
  }, [])

  // ── Countdown tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [countdown])

  // ── Auto-close after showing answer ──────────────────────────────────────
  useEffect(() => {
    if (!showAnswer || doneRef.current) return
    const id = window.setTimeout(() => {
      doneRef.current = true
      onDone()
    }, SHOW_ANSWER_MS)
    return () => window.clearTimeout(id)
  }, [showAnswer, onDone])

  const handleClose = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(10,25,60,0.98) 0%, rgba(5,5,25,0.99) 100%)' }}
    >
      {/* Starfield */}
      <div className="pointer-events-none absolute inset-0">
        {PH_STARS.map((s, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white"
            style={{ width: s.width, height: s.height, left: `${s.left}%`, top: `${s.top}%`, opacity: s.opacity }}
            animate={{ opacity: [0.1, 0.6, 0.1] }}
            transition={{ duration: s.animDuration, repeat: Infinity, delay: s.animDelay }}
          />
        ))}
      </div>

      {/* Glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700/10 blur-[100px]" />

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-6 text-center"
      >
        <span className="font-display text-sm tracking-[0.5em] text-gold-300/70 uppercase">Trợ Giúp</span>
        <h2
          className="font-display font-bold tracking-widest text-gold-300 text-glow-gold"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}
        >
          GỌI ĐIỆN CHO BẠN
        </h2>
      </motion.div>

      {/* Phone icon + voice bars */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.3 }}
        className="relative mb-4 flex flex-col items-center gap-3"
      >
        <PhoneRingIcon ringing={!pickUp} />
        <AnimatePresence mode="wait">
          {!pickUp ? (
            <motion.p
              key="ringing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="font-body text-white/60 tracking-widest"
              style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1rem)' }}
            >
              Đang đổ chuông...
            </motion.p>
          ) : (
            <motion.p
              key="connected"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="font-body text-emerald-300 tracking-wide"
              style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1rem)' }}
            >
              ✓ Đã kết nối
            </motion.p>
          )}
        </AnimatePresence>
        <VoiceBars active={pickUp && !showAnswer} />
      </motion.div>

      {/* Countdown ring (shown while no answer yet) */}
      <AnimatePresence mode="wait">
        {!showAnswer ? (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-2"
          >
            {pickUp && (
              <p className="font-body text-white/50" style={{ fontSize: 'clamp(0.75rem, 1.2vw, 0.9rem)' }}>
                Alo Vũ à Vũ....
              </p>
            )}
            <CountdownRing value={countdown} total={CALL_COUNTDOWN} />
          </motion.div>
        ) : (
          /* Friend's answer bubble */
          <motion.div
            key="answer"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-4 text-center"
            style={{ maxWidth: 'min(90vw, 520px)' }}
          >
            {/* Avatar */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-blue-400/60 bg-gradient-to-br from-blue-600/50 to-indigo-700/40 text-2xl shadow-[0_0_20px_rgba(96,165,250,0.4)]">
              👤
            </div>

            <motion.div
              className="glass rounded-3xl border border-blue-400/20 px-8 py-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <p className="mb-3 font-body text-white/70" style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.1rem)' }}>
                {phrase}
              </p>
              <div className="flex items-center justify-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 ring-2 ring-blue-300/70"
                >
                  <span className="font-display text-2xl font-bold text-blue-200">
                    {ANSWER_LETTERS[sugIdx]}
                  </span>
                </motion.div>
                <p
                  className="font-body font-medium text-white"
                  style={{ fontSize: 'clamp(1rem, 2vw, 1.3rem)' }}
                >
                  {question.answers[sugIdx]}
                </p>
              </div>
            </motion.div>

            <p className="font-body text-white/40" style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)' }}>
              Tự động tiếp tục sau {Math.ceil(SHOW_ANSWER_MS / 1000)} giây...
            </p>

            {/* Manual close */}
            <motion.button
              type="button"
              onClick={handleClose}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-2 font-display text-sm font-bold text-white/70 hover:text-white/90 backdrop-blur-md transition-colors"
            >
              Cúp máy
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
