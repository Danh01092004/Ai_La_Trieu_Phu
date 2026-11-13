import { useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Chicken } from '@/components/Chicken'
import { Celebration } from '@/components/Celebration'
import {
  FINAL_TOP_COUNT,
  LOSE_PAGE_MS,
  QUICK_LOSE_PAGE_MS,
} from '@/config/multiplayerConfig'
import { useSettingsActions } from '@/state/SettingsContext'
import { pick, randomBetween } from '@/utils/random'

const CHICKEN_HUES = ['#f8fafc', '#fef3c7', '#fde68a', '#fef9c3', '#ffffff', '#fed7aa']
const CHICKEN_STYLES = ['run', 'jump', 'spin'] as const

interface BaseProps {
  durationMs?: number
  /**
   * Keep the lose track alive after a quick between-question page. The reveal
   * is already underneath, so the track can finish while the player reads it.
   */
  keepLoseMusic?: boolean
  onDone: () => void
}

interface AnswerProps extends BaseProps {
  mode: 'answer'
  reason: 'wrong' | 'timeout'
  correctLetter: string
  correctText: string
  explanation: string
}

interface FinalProps extends BaseProps {
  mode: 'final'
  rank: number
  score: number
  totalPlayers: number
  totalQuestions: number
}

type Props = AnswerProps | FinalProps

function buildFlock() {
  return Array.from({ length: 9 }, () => ({
    top: randomBetween(0.08, 0.88),
    dir: Math.random() > 0.5 ? ('ltr' as const) : ('rtl' as const),
    duration: randomBetween(1.7, 3.6),
    delay: randomBetween(0, 2.4),
    scale: randomBetween(0.5, 1.35),
    style: pick(CHICKEN_STYLES),
    hop: randomBetween(40, 85),
    hue: pick(CHICKEN_HUES),
  }))
}

/**
 * Full-screen chicken page (route `/multiplayer/chicken` for wrong answers,
 * and the final result for players outside the top 5).
 *
 * Wrong/timeout uses a short page while the reveal waits underneath; the lose
 * track keeps playing until the next question opens. The final loser variant
 * stays for the whole track, then reveals the final leaderboard.
 */
export function ChickenLossPage(props: Props) {
  const reduceMotion = useReducedMotion()
  const { playSfx, playLoseMusic, stopLoseMusic } = useSettingsActions()
  const flock = useMemo(buildFlock, [])
  const doneRef = useRef(props.onDone)
  doneRef.current = props.onDone
  const isFinal = props.mode === 'final'
  const keepLoseMusic = props.keepLoseMusic ?? false
  const duration = Math.max(
    250,
    props.durationMs ?? (isFinal ? LOSE_PAGE_MS : QUICK_LOSE_PAGE_MS),
  )

  useEffect(() => {
    playSfx('wrong')
    playLoseMusic()

    const squawks = [
      window.setTimeout(() => playSfx('bawk'), 420),
      window.setTimeout(() => playSfx('cluck'), 1_050),
      window.setTimeout(() => playSfx('bawk'), 2_050),
    ]
    const timer = window.setTimeout(() => doneRef.current(), duration)

    return () => {
      window.clearTimeout(timer)
      squawks.forEach(window.clearTimeout)
      if (!keepLoseMusic) stopLoseMusic()
    }
  }, [duration, keepLoseMusic, playLoseMusic, playSfx, stopLoseMusic])

  const ariaLabel =
    props.mode === 'final'
      ? `Không vào top ${FINAL_TOP_COUNT}, bé gà xuất hiện`
      : props.reason === 'timeout'
        ? 'Hết giờ, bé gà xuất hiện'
        : 'Sai đáp án, bé gà xuất hiện'

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label={ariaLabel}
      className="relative h-[100dvh] w-full overflow-y-auto"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/80 via-night-900/95 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(220,38,38,0.35),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_70px_rgba(0,0,0,0.9)]" />

      {!reduceMotion && (
        <>
          <Celebration mode="feathers" className="opacity-80" />
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {flock.map((chicken, index) => (
              <Chicken key={index} {...chicken} />
            ))}
          </div>
        </>
      )}

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-6">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.7, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 210, damping: 16 }}
          className="w-full max-w-md rounded-3xl border border-red-300/25 bg-night-900/85 p-5 text-center shadow-[0_0_60px_rgba(220,38,38,0.25)] backdrop-blur-md sm:p-7"
        >
          <motion.div
            className="text-5xl sm:text-6xl"
            animate={reduceMotion ? undefined : { rotate: [0, -8, 8, -6, 6, 0] }}
            transition={{ duration: 0.6, delay: 0.15 }}
            aria-hidden="true"
          >
            🐔
          </motion.div>

          <p className="mt-2 font-display text-[10px] uppercase tracking-[0.32em] text-red-300/80">
            {props.mode === 'final'
              ? `Hết ${props.totalQuestions} câu`
              : props.reason === 'timeout'
                ? 'Hết giờ'
                : 'Sai đáp án'}
          </p>
          <h2 className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-red-300 sm:text-3xl">
            {props.mode === 'final'
              ? `CHƯA VÀO TOP ${FINAL_TOP_COUNT}!`
              : props.reason === 'timeout'
                ? 'BAY MẤT RỒI!'
                : 'GÀ CON XUẤT HIỆN!'}
          </h2>

          {props.mode === 'final' ? (
            <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 px-3 py-3">
              <p className="font-display text-[9px] uppercase tracking-[0.2em] text-red-200/70">
                Hạng của bạn
              </p>
              <p className="mt-1 font-display text-3xl font-black tabular-nums text-red-100">
                {props.rank}
                <span className="text-base font-semibold text-white/45">
                  /{props.totalPlayers}
                </span>
              </p>
              <p className="mt-1 text-sm font-semibold text-white/75">
                {props.score.toLocaleString('vi-VN')} điểm
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2.5">
                <p className="font-display text-[9px] uppercase tracking-[0.2em] text-emerald-200/70">
                  Đáp án đúng
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-emerald-100">
                  {props.correctLetter}. {props.correctText}
                </p>
              </div>

              <p className="mt-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-white/65">
                {props.explanation}
              </p>
            </>
          )}

          <p className="mt-3 font-display text-xs uppercase tracking-[0.16em] text-white/45">
            {isFinal ? 'Đang phát hết nhạc lose...' : '0 điểm · xem đáp án và tiếp tục'}
          </p>

          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <motion.div
              className="h-full rounded-full bg-red-400/80"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: duration / 1_000, ease: 'linear' }}
            />
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
            {isFinal
              ? 'Bảng xếp hạng chung cuộc hiện sau khi nhạc kết thúc.'
              : 'Nhạc lose tiếp tục khi xem đáp án.'}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
