import { memo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Difficulty } from '@/types'

interface Props {
  index: number
  total: number
  question: string
  difficulty: Difficulty
}

const DIFF_LABEL: Record<Difficulty, { text: string; className: string }> = {
  easy:      { text: 'DỄ',         className: 'text-emerald-300 border-emerald-300/50 bg-emerald-500/10' },
  medium:    { text: 'TRUNG BÌNH', className: 'text-gold-300 border-gold-300/50 bg-gold-500/10' },
  hard:      { text: 'KHÓ',        className: 'text-rose-300 border-rose-300/50 bg-rose-500/10' },
  very_hard: { text: 'RẤT KHÓ',   className: 'text-red-400 border-red-400/50 bg-red-500/15' },
}

export const QuestionCard = memo(function QuestionCard({ index, total, question, difficulty }: Props) {
  const diff = DIFF_LABEL[difficulty]
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative w-full">
      {/* connecting hex nodes above the card (TV style) */}
      <div className="mb-3 flex items-center justify-center gap-2">
        <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold-400/60" />
        <span
          className="font-display tracking-[0.3em] text-gold-300/80"
          style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.95rem)' }}
        >
          CÂU HỎI {index + 1}/{total}
        </span>
        <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold-400/60" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={reduceMotion ? false : { opacity: 0, rotateX: -25, y: 30 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, rotateX: 20, y: -30 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformPerspective: 1000 }}
          className="animated-border relative mx-auto rounded-3xl"
        >
          <div
            className="glass relative overflow-hidden rounded-3xl"
            style={{ padding: 'clamp(1rem, 2.4vw, 2.25rem) clamp(1.25rem, 3vw, 2.75rem)' }}
          >
            {/* difficulty tag */}
            <div className="absolute right-4 top-4">
              <span
                className={`rounded-full border px-3 py-1 font-display tracking-widest ${diff.className}`}
                style={{ fontSize: 'clamp(0.55rem, 0.9vw, 0.7rem)' }}
              >
                {diff.text}
              </span>
            </div>

            {/* glow orb */}
            <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-royal-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-purpleglow-400/20 blur-3xl" />

            <motion.h2
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduceMotion ? { duration: 0 } : { delay: 0.2, duration: 0.5 }}
              className="relative z-10 text-center font-body font-medium leading-relaxed text-white"
              style={{ fontSize: 'clamp(1rem, 1.9vw, 1.65rem)' }}
            >
              {question}
            </motion.h2>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
})
