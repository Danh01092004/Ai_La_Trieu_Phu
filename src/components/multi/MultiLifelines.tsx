import type { LifelineState, LifelineType } from '@/types'
import { cn } from '@/utils'
import { useSettingsActions } from '@/state/SettingsContext'

interface Props {
  lifelines: LifelineState
  disabled: boolean
  busy: LifelineType | null
  onUse: (type: LifelineType) => void
}

const ITEMS: {
  type: LifelineType
  label: string
  icon: React.ReactNode
}[] = [
  {
    type: 'fifty',
    label: '50:50',
    icon: <span className="font-display text-[11px] font-bold tracking-tight">50:50</span>,
  },
  {
    type: 'phone',
    label: 'Gọi điện',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path
          d="M6.6 3H4.3C3.6 3 3 3.6 3 4.3 3 13 11 21 19.7 21c.7 0 1.3-.6 1.3-1.3v-2.3c0-.6-.4-1.1-1-1.2l-3-.6c-.5-.1-1 .1-1.3.5l-1 1.2A14 14 0 0 1 8.3 12l1.2-1c.4-.3.6-.8.5-1.3l-.6-3c-.1-.6-.6-1-1.2-1H6.6Z"
          fill="currentColor"
          fillOpacity={0.15}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    type: 'audience',
    label: 'Khán giả',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <circle cx="7" cy="8" r="2.4" />
        <circle cx="17" cy="8" r="2.4" />
        <circle cx="12" cy="6.5" r="2.8" />
        <path d="M12 10.2c-2.6 0-4.2 1.6-4.6 3.8-.1.6.4 1 1 1h7.2c.6 0 1.1-.4 1-1-.4-2.2-2-3.8-4.6-3.8Z" />
      </svg>
    ),
  },
  {
    type: 'mc',
    label: 'Hỏi MC',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" fillOpacity={0.15} />
        <path d="M5 10c0 3.866 3.134 7 7 7s7-3.134 7-7" strokeLinecap="round" />
        <line x1="12" y1="17" x2="12" y2="21" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" strokeLinecap="round" />
      </svg>
    ),
  },
]

/**
 * Four one-use lifelines. The authoritative used flags arrive from the server
 * ack, so a stale tab cannot consume a lifeline twice.
 */
export function MultiLifelines({ lifelines, disabled, busy, onUse }: Props) {
  const { playSfx } = useSettingsActions()

  return (
    <section
      aria-label="Trợ giúp"
      aria-busy={busy !== null}
      className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1.5"
    >
      {ITEMS.map((item) => {
        const used = lifelines[item.type]
        const loading = busy === item.type
        const clickable = !disabled && !used && busy === null

        return (
          <button
            key={item.type}
            type="button"
            disabled={!clickable}
            aria-label={`${item.label}${used ? ' (đã dùng)' : ''}`}
            onClick={() => {
              if (!clickable) return
              playSfx('lifeline')
              onUse(item.type)
            }}
            className={cn(
              'relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60',
              used
                ? 'border-white/10 bg-white/[0.03] text-white/30'
                : clickable
                  ? 'border-gold-300/30 bg-gradient-to-b from-gold-400/10 to-night-800/50 text-gold-200 hover:border-gold-300/70'
                  : 'border-white/10 bg-white/[0.03] text-white/35',
            )}
          >
            <span className="flex h-5 items-center justify-center" aria-hidden="true">
              {loading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold-300/30 border-t-gold-300 motion-reduce:animate-none" />
              ) : (
                item.icon
              )}
            </span>
            <span
              className={cn(
                'font-display text-[9px] uppercase tracking-[0.08em]',
                used && 'line-through',
              )}
            >
              {item.label}
            </span>
            {used && (
              <span className="absolute right-1 top-0.5 text-[10px] leading-none text-red-300/80" aria-hidden="true">
                ✕
              </span>
            )}
          </button>
        )
      })}
    </section>
  )
}
