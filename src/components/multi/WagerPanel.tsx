import { useEffect, useMemo, useState } from 'react'
import type { GameQuestionPayload, WagerPercent } from '@/types/multiplayer'
import {
  WAGER_PERCENTS,
  WAGER_LOCK_MS,
  wagerForScore,
} from '@/config/multiplayerConfig'
import { cn } from '@/utils'

interface Props {
  question: GameQuestionPayload
  serverOffset: number
  score: number
  percent: WagerPercent
  amount: number
  busy: boolean
  disabled?: boolean
  error: string | null
  onSelect: (percent: WagerPercent) => void
  onClearError: () => void
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
      <path d="m4 8.5 8 4.5 8-4.5M12 13v7" />
      <path d="m8 6.25 8 4.5" />
    </svg>
  )
}

/**
 * Per-question "carry more packages" control.
 *
 * The server owns the deadline and the package amount; this component only
 * projects the local countdown and sends the selected percentage. Once the
 * last three seconds begin, the whole panel is visibly locked.
 */
export function WagerPanel({
  question,
  serverOffset,
  score,
  percent,
  amount,
  busy,
  disabled = false,
  error,
  onSelect,
  onClearError,
}: Props) {
  const lockAt = question.wagerLockAt - serverOffset
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, lockAt - Date.now()),
  )

  useEffect(() => {
    let timer: number | undefined

    const tick = () => {
      const remaining = Math.max(0, lockAt - Date.now())
      setRemainingMs(remaining)
      if (remaining <= 0) return
      timer = window.setTimeout(tick, Math.min(1_000, remaining))
    }

    tick()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [lockAt])

  const locked = remainingMs <= 0
  const options = useMemo(
    () =>
      WAGER_PERCENTS.map((value) => ({
        value,
        amount: wagerForScore(score, value),
      })),
    [score],
  )
  const hasWager = percent > 0
  const secondsToLock = Math.max(1, Math.ceil(remainingMs / 1_000))
  const allDisabled = locked || busy || disabled

  return (
    <section
      aria-label="Mang thêm gói hàng"
      aria-busy={busy}
      className={cn(
        'relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border transition-colors',
        locked
          ? 'border-white/10 bg-white/[0.025]'
          : 'border-amber-300/35 bg-gradient-to-b from-amber-400/[0.11] via-night-800/70 to-night-900/80 shadow-[0_0_28px_rgba(245,197,66,0.12)]',
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent"
        aria-hidden="true"
      />

      <div className="flex items-center gap-2.5 px-3 pb-2 pt-2.5 sm:px-4">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            locked
              ? 'border-white/10 bg-white/[0.03] text-white/35'
              : 'border-amber-300/40 bg-amber-400/15 text-amber-200',
          )}
        >
          <PackageIcon className={cn('h-5 w-5', !locked && 'wager-icon')} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100 sm:text-xs">
              Mang thêm gói hàng
            </h2>
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]',
                locked
                  ? 'border-white/10 bg-white/[0.03] text-white/40'
                  : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
              )}
            >
              {locked ? 'Đã khóa' : 'Đang mở'}
            </span>
          </div>
          <p className="truncate text-[10px] leading-relaxed text-white/50">
            Đúng: cộng thưởng câu + phần mang thêm · Sai: mất phần mang thêm.
          </p>
        </div>

        {hasWager && !locked && (
          <button
            type="button"
            onClick={() => onSelect(0)}
            disabled={allDisabled}
            className="min-h-[44px] shrink-0 rounded-lg px-2 font-display text-[9px] uppercase tracking-[0.1em] text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60 disabled:opacity-40"
          >
            Bỏ chọn
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 pb-2.5 sm:gap-2 sm:px-4">
        {options.map((option) => {
          const isSelected = percent === option.value
          const unavailable = option.amount <= 0
          const disabled = allDisabled || unavailable
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              aria-label={
                unavailable
                  ? `${option.value}%: chưa đủ gói hàng`
                  : `${option.value}%: mang thêm ${option.amount} gói hàng`
              }
              disabled={disabled}
              onClick={() => onSelect(option.value as WagerPercent)}
              className={cn(
                'relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70',
                isSelected && !locked
                  ? 'border-amber-200/80 bg-amber-400/20 text-amber-100 shadow-[0_0_18px_rgba(245,197,66,0.28)]'
                  : isSelected
                    ? 'border-amber-200/30 bg-white/[0.04] text-white/50'
                    : disabled
                      ? 'border-white/[0.06] bg-white/[0.02] text-white/25'
                      : 'border-white/10 bg-white/[0.035] text-white/75 hover:border-amber-200/45 hover:bg-amber-400/10 hover:text-amber-100',
              )}
            >
              <span className="font-display text-base font-bold leading-none tracking-tight sm:text-lg">
                {option.value}%
              </span>
              <span
                className={cn(
                  'text-[9px] leading-none tabular-nums',
                  isSelected && !locked ? 'text-amber-200' : 'text-white/45',
                )}
              >
                {unavailable
                  ? 'chưa đủ gói'
                  : `+${option.amount.toLocaleString('vi-VN')} gói`}
              </span>
              {isSelected && (
                <span
                  className="absolute right-1 top-1 text-[9px] leading-none text-amber-200"
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-[24px] items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-1.5 sm:px-4">
        <p
          className={cn(
            'text-[9px] uppercase tracking-[0.12em]',
            locked ? 'text-white/35' : 'text-amber-200/75',
          )}
          role="status"
          aria-live={locked ? 'polite' : 'off'}
        >
          {locked
            ? 'Đã khóa ở 3 giây cuối'
            : score <= 0
              ? 'Chưa có gói hàng để mang thêm'
              : `Còn ${secondsToLock}s để đổi mức`}
        </p>
        <p className="text-right text-[9px] tabular-nums text-white/40">
          {hasWager
            ? `Đang mang ${amount.toLocaleString('vi-VN')} gói`
            : `Khóa sau ${Math.round(WAGER_LOCK_MS / 1_000)}s cuối`}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-t border-red-300/20 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-100 sm:px-4"
        >
          <p className="flex-1 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={onClearError}
            aria-label="Đóng thông báo mang thêm"
            className="min-h-[32px] min-w-[32px] rounded text-sm leading-none text-red-200/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"
          >
            ×
          </button>
        </div>
      )}
    </section>
  )
}
