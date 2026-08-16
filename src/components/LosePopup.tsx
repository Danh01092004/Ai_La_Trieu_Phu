import { memo } from 'react'
import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Celebration } from './Celebration'
import { Chicken } from './Chicken'
import { formatCandies } from '@/utils'
import { useSettings } from '@/state/SettingsContext'

interface Props {
  candies: number
  reason: 'wrong' | 'timeout' | 'complete' | 'retired' | null
  reachedLevel: number
  total: number
  onRetry: () => void
  onHome: () => void
}

const REASON_TEXT: Record<string, string> = {
  wrong: 'Đáp án chưa chính xác',
  timeout: 'Hết giờ mất rồi!',
  retired: 'Bạn đã quyết định dừng cuộc chơi',
}

const CHICKEN_HUES = ['#f8fafc', '#fef3c7', '#fde68a', '#fef9c3', '#ffffff', '#fed7aa']
const CHICKEN_STYLES: ('run' | 'jump' | 'spin')[] = ['run', 'jump', 'spin']

/** Deterministic-per-mount flock of 13 chickens with fully randomised motion.
 *  Halved from 26 to reduce simultaneous Framer Motion animation count
 *  (was 104 FM loops; now 52) while keeping the scene visually chaotic. */
function buildFlock(count: number) {
  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
  return Array.from({ length: count }, () => ({
    top: rand(0.12, 0.9),
    dir: Math.random() > 0.5 ? ('ltr' as const) : ('rtl' as const),
    duration: rand(1.8, 4.2),
    delay: rand(0, 3.2),
    scale: rand(0.55, 1.5),
    style: pick(CHICKEN_STYLES),
    hop: rand(40, 90),
    hue: pick(CHICKEN_HUES),
  }))
}

export const LosePopup = memo(function LosePopup({ candies, reason, reachedLevel, total, onRetry, onHome }: Props) {
  const { playSfx } = useSettings()
  const isRetire = reason === 'retired'
  const flock = useMemo(() => buildFlock(13), [])

  // A staggered barrage of chicken squawks with comic timing. Suppressed for
  // graceful retirement — retire is a player choice, not a disaster.
  useEffect(() => {
    if (isRetire) return
    const timers: number[] = []
    const squawks: [number, 'bawk' | 'cluck'][] = [
      [500, 'bawk'], [900, 'cluck'], [1300, 'cluck'], [1700, 'bawk'],
      [2100, 'cluck'], [2500, 'bawk'], [3000, 'cluck'], [3500, 'bawk'],
    ]
    squawks.forEach(([at, name]) => {
      timers.push(window.setTimeout(() => playSfx(name), at))
    })
    return () => timers.forEach(clearTimeout)
  }, [isRetire, playSfx])

  const accent = isRetire ? 'gold' : 'red'

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dramatic blackout then settle */}
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.9] }}
        transition={{ duration: 0.55, times: [0, 0.35, 1] }}
      />
      <div
        className={
          isRetire
            ? 'absolute inset-0 bg-gradient-to-b from-amber-900/50 via-night-900/95 to-black'
            : 'absolute inset-0 bg-gradient-to-b from-red-950/70 via-night-900/95 to-black'
        }
      />

      {/* Pulsing coloured glow */}
      <motion.div
        className={
          isRetire
            ? 'absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(245,197,66,0.3),transparent_65%)]'
            : 'absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(220,38,38,0.35),transparent_65%)]'
        }
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Red flashing strobe (loss only) */}
      {!isRetire && (
        <motion.div
          className="absolute inset-0 bg-red-600 mix-blend-screen"
          animate={{ opacity: [0, 0.35, 0, 0.22, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Dark vignette */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_260px_90px_rgba(0,0,0,0.9)]" />

      {/* Feathers + embers */}
      <Celebration mode="feathers" />
      <Celebration mode="embers" />

      {/* Explosion flash on entry */}
      <motion.div
        className={
          isRetire
            ? 'absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400/40 blur-3xl'
            : 'absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/40 blur-3xl'
        }
        initial={{ scale: 0, opacity: 0.9 }}
        animate={{ scale: 6, opacity: 0 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />

      {/* The chaotic flock — camera-shake wrapper for the whole troupe */}
      <motion.div
        className="absolute inset-0"
        animate={{ x: [0, -6, 6, -4, 4, -2, 2, 0], y: [0, 4, -4, 3, -3, 0] }}
        transition={{ duration: 0.7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      >
        {flock.map((c, i) => (
          <Chicken key={i} {...c} />
        ))}
      </motion.div>

      {/* Result card (shakes on entry) */}
      <motion.div
        className="relative z-30 mx-4 flex max-w-lg flex-col items-center gap-5 rounded-[2rem] p-10 text-center"
        initial={{ scale: 0.6, y: 50, opacity: 0 }}
        animate={{
          scale: 1,
          y: 0,
          opacity: 1,
          x: [0, -8, 8, -6, 6, -3, 3, 0],
        }}
        transition={{
          scale: { type: 'spring', stiffness: 170, damping: 17, delay: 0.1 },
          x: { duration: 0.6, delay: 0.1 },
        }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
          transition={{ delay: 0.3, duration: 0.6 }}
          style={{ fontSize: 'clamp(3rem, 8vw, 4.5rem)' }}
        >
          {isRetire ? '🙏' : '🐔'}
        </motion.div>

        <motion.h1
          className={
            isRetire
              ? 'font-display font-black uppercase tracking-wide text-gold-300 text-glow-gold'
              : 'font-display font-black uppercase tracking-wide text-red-400'
          }
          style={{
            textShadow: isRetire ? undefined : '0 0 24px rgba(239,68,68,0.7)',
            fontSize: 'clamp(1.75rem, 4.5vw, 3.25rem)',
          }}
          animate={{ x: [0, -4, 4, -3, 3, 0] }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          {isRetire ? 'Cảm ơn bạn đã tham gia!' : 'Bạn đã bị loại!'}
        </motion.h1>

        <p className="font-body text-white/80" style={{ fontSize: 'clamp(0.95rem, 1.6vw, 1.15rem)' }}>
          {reason && REASON_TEXT[reason] ? REASON_TEXT[reason] : 'Trò chơi kết thúc'} 🐣
        </p>

        <div className="glass flex flex-col items-center gap-1 rounded-2xl px-8 py-4">
          <span className="text-sm uppercase tracking-widest text-white/50">
            {isRetire ? '🍬 Bạn mang về' : `Bạn đã đến câu ${reachedLevel} / ${total}`}
          </span>
          <span className="flex items-center gap-2 font-display text-3xl font-bold text-gold-200">
            🍬 {formatCandies(candies)}
            <span className="text-base font-normal text-white/60">viên kẹo</span>
          </span>
        </div>

        <div className="mt-2 flex gap-4">
          <motion.button
            onClick={onRetry}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className={
              accent === 'gold'
                ? 'rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 font-display text-lg font-bold text-night-900 shadow-gold'
                : 'rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-8 py-3 font-display text-lg font-bold text-white shadow-[0_0_25px_rgba(239,68,68,0.5)]'
            }
          >
            Chơi lại
          </motion.button>
          <motion.button
            onClick={onHome}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl border border-white/20 bg-white/5 px-8 py-3 font-display text-lg font-bold text-white/90 backdrop-blur-md hover:border-white/40"
          >
            Trang chủ
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
})
