import { memo, useEffect, useState } from 'react'
import { CountdownRing } from '@/components/ui/CountdownRing'

interface Props {
  endsAt: number
  durationMs: number
  /** `serverNow - Date.now()` captured when the question packet arrived. */
  serverOffset: number
}

function secondsLeft(endsAt: number, serverOffset: number): number {
  const localDeadline = endsAt - serverOffset
  return Math.max(0, Math.ceil((localDeadline - Date.now()) / 1_000))
}

/**
 * Server-deadline countdown.
 *
 * The ticker is isolated in this component: only the ring re-renders each
 * second, never the question/answer screen. Scheduling to the next whole
 * second keeps it at ~1 render/s with no drift from interval accumulation.
 */
function MultiQuestionTimerComponent({ endsAt, durationMs, serverOffset }: Props) {
  const total = Math.max(1, Math.round(durationMs / 1_000))
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt, serverOffset))

  useEffect(() => {
    const localDeadline = endsAt - serverOffset
    let timer: number | undefined

    const tick = () => {
      const msLeft = localDeadline - Date.now()
      const next = Math.max(0, Math.ceil(msLeft / 1_000))
      setRemaining((current) => (current === next ? current : next))

      if (msLeft <= 0) return

      // Land just after the next second boundary; the 20ms cushion avoids
      // waking up a hair too early and repeating the previous number.
      const toBoundary = msLeft > 1_000 ? (msLeft - 1) % 1_000 : msLeft
      timer = window.setTimeout(tick, Math.max(20, toBoundary + 20))
    }

    tick()

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [endsAt, serverOffset])

  return (
    <div
      role="timer"
      aria-label={`Còn ${remaining} giây`}
      className="flex flex-col items-center"
    >
      <CountdownRing value={remaining} total={total} size={96} urgentAt={5} />
      <span className="mt-1 font-display text-[9px] uppercase tracking-[0.24em] text-white/45">
        Giây còn lại
      </span>
    </div>
  )
}

export const MultiQuestionTimer = memo(MultiQuestionTimerComponent)
