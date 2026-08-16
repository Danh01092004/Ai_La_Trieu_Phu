import { memo } from 'react'
import { motion } from 'framer-motion'
import { LADDER, TOTAL_QUESTIONS } from '@/services/ladder'
import { formatCandies, cn } from '@/utils'

interface Props {
  currentIndex: number
  // level (1-based) -> flash type
  flash?: { level: number; type: 'correct' | 'wrong' } | null
}

/** Candy icon rendered inline. */
function Candy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none">
      <ellipse cx="12" cy="12" rx="6" ry="5.5" fill="currentColor" />
      <path d="M6 12 1.5 8.5v7L6 12Zm12 0 4.5-3.5v7L18 12Z" fill="currentColor" opacity="0.85" />
      <ellipse cx="10.4" cy="10.4" rx="1.4" ry="1.2" fill="#fff" opacity="0.55" />
    </svg>
  )
}

export const QuestionProgress = memo(function QuestionProgress({ currentIndex, flash }: Props) {
  // Render top (level 10) to bottom (level 1)
  const rows = [...LADDER].reverse()

  return (
    <div className="glass flex h-full flex-col gap-1 rounded-3xl" style={{ padding: 'clamp(0.5rem, 0.9vw, 0.85rem)' }}>
      <h3 className="mb-1 text-center font-display tracking-[0.3em] text-gold-300/90" style={{ fontSize: 'clamp(0.7rem, 0.95vw, 0.9rem)' }}>
        THANG ĐIỂM
      </h3>
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {rows.map((lvl) => {
          const isCurrent = lvl.level === currentIndex + 1
          const isDone = lvl.level <= currentIndex
          const isFlash = flash?.level === lvl.level
          const flashCorrect = isFlash && flash?.type === 'correct'
          const flashWrong = isFlash && flash?.type === 'wrong'

          return (
            <motion.div
              key={lvl.level}
              initial={{ opacity: 0, x: 30 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: isCurrent ? 1.04 : 1,
              }}
              transition={{ delay: (TOTAL_QUESTIONS - lvl.level) * 0.03, duration: 0.35 }}
              style={
                flashWrong
                  ? { animation: 'flashRed 0.5s ease-in-out 3', padding: 'clamp(0.3rem, 0.7vh, 0.5rem) clamp(0.5rem, 0.9vw, 0.85rem)' }
                  : flashCorrect
                    ? { animation: 'flashGold 0.5s ease-in-out 3', padding: 'clamp(0.3rem, 0.7vh, 0.5rem) clamp(0.5rem, 0.9vw, 0.85rem)' }
                    : { padding: 'clamp(0.3rem, 0.7vh, 0.5rem) clamp(0.5rem, 0.9vw, 0.85rem)' }
              }
              className={cn(
                'relative flex items-center justify-between rounded-xl border font-display transition-colors duration-300',
                isCurrent &&
                  'border-gold-300 bg-gradient-to-r from-gold-500/40 to-gold-400/10 shadow-gold',
                isDone &&
                  !isCurrent &&
                  'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
                !isDone && !isCurrent && 'border-white/8 bg-white/3 text-white/55',
                lvl.isSafe && !isCurrent && 'border-gold-400/40',
                flashCorrect && 'border-emerald-300 bg-emerald-500/40',
                flashWrong && 'border-red-400 bg-red-600/40',
              )}
            >
              {isCurrent && (
                <motion.span
                  layoutId="ladder-marker"
                  className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gold-300 shadow-gold"
                />
              )}
              <span
                className={cn(
                  'flex items-center gap-2',
                  isCurrent && 'text-night-900 font-bold',
                )}
                style={{ fontSize: 'clamp(0.7rem, 0.95vw, 0.9rem)' }}
              >
                <span className="w-5 text-right tabular-nums opacity-80">{lvl.level}</span>
                {lvl.isSafe && (
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-wider',
                      isCurrent ? 'text-night-900/70' : 'text-gold-300/70',
                    )}
                  >
                    ★
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'flex items-center gap-1.5 tabular-nums',
                  isCurrent ? 'text-night-900 font-bold' : 'text-gold-200',
                )}
                style={{ fontSize: 'clamp(0.7rem, 0.95vw, 0.9rem)' }}
              >
                {formatCandies(lvl.candies)}
                <Candy className="text-pink-300" style={{ width: 'clamp(0.8rem, 1vw, 1rem)', height: 'clamp(0.8rem, 1vw, 1rem)' }} />
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
})
