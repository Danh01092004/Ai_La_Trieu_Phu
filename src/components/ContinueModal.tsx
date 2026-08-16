import { memo } from 'react'
import { motion } from 'framer-motion'
import { Celebration } from './Celebration'
import { formatCandies } from '@/utils'
import { useSettings } from '@/state/SettingsContext'

interface Props {
  /** candies just banked for the answer that was answered correctly */
  justEarned: number
  /** running total the player would walk away with */
  total: number
  onContinue: () => void
  onStop: () => void
}

/**
 * Shown after every correct answer. The player chooses to press on for a bigger
 * prize or retire and keep what they have.
 */
export const ContinueModal = memo(function ContinueModal({ justEarned, total, onContinue, onStop }: Props) {
  const { playSfx } = useSettings()

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* golden backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-royal-500/25 via-night-900/92 to-night-900" />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(245,197,66,0.35),transparent_65%)]"
        animate={{ opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Celebration mode="confetti" />

      <motion.div
        className="glass relative z-10 mx-4 flex max-w-lg flex-col items-center gap-5 rounded-[2rem] p-10 text-center"
        initial={{ scale: 0.6, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.15 }}
          style={{ fontSize: 'clamp(3rem, 8vw, 4.5rem)' }}
        >
          🎉
        </motion.div>

        <motion.h1
          className="font-display font-black uppercase tracking-wide text-gold-300 text-glow-gold"
          style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)' }}
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          CHÍNH XÁC!
        </motion.h1>

        <p className="font-body text-white/80" style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.1rem)' }}>
          Bạn đã nhận được
        </p>

        <motion.div
          className="glass-gold flex items-center gap-3 rounded-2xl px-8 py-4"
          animate={{
            boxShadow: [
              '0 0 20px rgba(245,197,66,0.3)',
              '0 0 40px rgba(245,197,66,0.6)',
              '0 0 20px rgba(245,197,66,0.3)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)' }}>🍬</span>
          <span
            className="font-display font-bold tabular-nums text-gold-200"
            style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)' }}
          >
            {formatCandies(justEarned)}
          </span>
          <span className="font-display text-base text-white/70">viên kẹo</span>
        </motion.div>

        <p className="font-body text-white/70" style={{ fontSize: 'clamp(0.85rem, 1.4vw, 1rem)' }}>
          Tổng cộng: <span className="font-bold text-gold-200">{formatCandies(total)}</span> 🍬 · Bạn muốn làm gì?
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <motion.button
            onClick={onContinue}
            onMouseEnter={() => playSfx('hover')}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 font-display text-lg font-bold text-night-900 shadow-gold"
          >
            Tiếp tục
          </motion.button>
          <motion.button
            onClick={onStop}
            onMouseEnter={() => playSfx('hover')}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl border border-white/20 bg-white/5 px-8 py-3 font-display text-lg font-bold text-white/90 backdrop-blur-md hover:border-gold-300/60"
          >
            Dừng lại
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
})
