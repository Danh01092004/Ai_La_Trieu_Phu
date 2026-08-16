import { memo } from 'react'
import { motion } from 'framer-motion'
import { Celebration } from './Celebration'
import { formatCandies } from '@/utils'
import { useCountUp } from '@/hooks/useCountUp'

interface Props {
  candies: number
  onRetry: () => void
  onHome: () => void
}

export const VictoryPopup = memo(function VictoryPopup({ candies, onRetry, onHome }: Props) {
  const counted = useCountUp(candies, 1600, 500)

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* radiant backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-royal-500/30 via-night-900/90 to-night-900" />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,197,66,0.4),transparent_65%)]"
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* moving spotlights */}
      {[
        { w: '60vw', hue: 'from-gold-300/25', rot: [12, -12, 12], dur: 8 },
        { w: '45vw', hue: 'from-royal-300/20', rot: [-14, 14, -14], dur: 9 },
        { w: '30vw', hue: 'from-purpleglow-300/20', rot: [8, -18, 8], dur: 7 },
      ].map((s, i) => (
        <motion.div
          key={i}
          className={`absolute left-1/2 top-1/2 h-[160vh] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b ${s.hue} to-transparent blur-2xl`}
          style={{ width: s.w, transformOrigin: 'center top' }}
          animate={{ rotate: s.rot }}
          transition={{ duration: s.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <Celebration mode="confetti" />
      <Celebration mode="fireworks" />

      <motion.div
        className="relative z-10 mx-4 flex max-w-xl flex-col items-center gap-6 rounded-[2rem] p-10 text-center"
        initial={{ scale: 0.5, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.3 }}
          style={{ fontSize: 'clamp(3.5rem, 9vw, 5.5rem)' }}
        >
          🎉
        </motion.div>

        <motion.h1
          className="font-display font-black uppercase tracking-wide text-gold-300 text-glow-gold"
          style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          CHÚC MỪNG!
        </motion.h1>
        <p
          className="font-body text-white/85"
          style={{ fontSize: 'clamp(0.95rem, 1.8vw, 1.25rem)' }}
        >
          Bạn đã hoàn thành AI LÀ TRIỆU PHÚ!
        </p>

        <motion.div
          className="glass-gold flex items-center gap-3 rounded-2xl px-8 py-4"
          animate={{ boxShadow: ['0 0 20px rgba(245,197,66,0.3)', '0 0 40px rgba(245,197,66,0.6)', '0 0 20px rgba(245,197,66,0.3)'] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span style={{ fontSize: 'clamp(2rem, 4vw, 2.5rem)' }}>🍬</span>
          <span className="font-display font-bold tabular-nums text-gold-200" style={{ fontSize: 'clamp(2rem, 4vw, 2.5rem)' }}>
            {formatCandies(counted)}
          </span>
          <span className="font-display text-lg text-white/70">kẹo</span>
        </motion.div>

        <div className="mt-2 flex gap-4">
          <ActionButton onClick={onRetry} variant="gold">
            Chơi lại
          </ActionButton>
          <ActionButton onClick={onHome} variant="ghost">
            Trang chủ
          </ActionButton>
        </div>
      </motion.div>
    </motion.div>
  )
})

function ActionButton({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode
  onClick: () => void
  variant: 'gold' | 'ghost'
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className={
        variant === 'gold'
          ? 'rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 font-display text-lg font-bold text-night-900 shadow-gold'
          : 'rounded-xl border border-white/20 bg-white/5 px-8 py-3 font-display text-lg font-bold text-white/90 backdrop-blur-md hover:border-gold-300/60'
      }
    >
      {children}
    </motion.button>
  )
}
