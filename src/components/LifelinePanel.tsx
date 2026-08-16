import { memo } from 'react'
import { motion } from 'framer-motion'
import type { LifelineState } from '@/types'
import { cn } from '@/utils'
import { useSettingsActions } from '@/state/SettingsContext'

interface Props {
  lifelines: LifelineState
  disabled: boolean
  onPhone: () => void
  onAudience: () => void
  onFifty: () => void
  onMc: () => void
}

/* ── Icons ────────────────────────────────────────────────────────────────── */

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        d="M6.6 3H4.3C3.6 3 3 3.6 3 4.3 3 13 11 21 19.7 21c.7 0 1.3-.6 1.3-1.3v-2.3c0-.6-.4-1.1-1-1.2l-3-.6c-.5-.1-1 .1-1.3.5l-1 1.2A14 14 0 0 1 8.3 12l1.2-1c.4-.3.6-.8.5-1.3l-.6-3c-.1-.6-.6-1-1.2-1H6.6Z"
        fill="currentColor"
        fillOpacity={0.15}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AudienceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="17" cy="8" r="2.4" />
      <circle cx="12" cy="6.5" r="2.8" />
      <path d="M12 10.2c-2.6 0-4.2 1.6-4.6 3.8-.1.6.4 1 1 1h7.2c.6 0 1.1-.4 1-1-.4-2.2-2-3.8-4.6-3.8Z" />
      <path d="M4.5 11c-1.9 0-3 1.2-3.3 2.9-.1.5.3.9.8.9H6v-.8c0-1.1.3-2.1.9-3-.9-.05-1.6.05-2.4 0Z" opacity="0.7" />
      <path d="M19.5 11c1.9 0 3 1.2 3.3 2.9.1.5-.3.9-.8.9H18v-.8c0-1.1-.3-2.1-.9-3 .9-.05 1.6.05 2.4 0Z" opacity="0.7" />
    </svg>
  )
}

function FiftyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} fill="none">
      <text
        x="50%"
        y="52%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="Oswald, sans-serif"
        fontWeight="700"
        fontSize="15"
        fill="currentColor"
      >
        50:50
      </text>
    </svg>
  )
}

function McIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" fillOpacity={0.15} strokeLinejoin="round" />
      <path d="M5 10c0 3.866 3.134 7 7 7s7-3.134 7-7" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12" y2="21" strokeLinecap="round" />
      <line x1="8" y1="21" x2="16" y2="21" strokeLinecap="round" />
    </svg>
  )
}

/* ── LifelineButton ───────────────────────────────────────────────────────── */

function LifelineButton({
  label,
  used,
  disabled,
  onClick,
  children,
  crossOut = true,
}: {
  label: string
  used: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
  crossOut?: boolean
}) {
  const { playSfx } = useSettingsActions()
  const clickable = !disabled && !used

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        disabled={!clickable}
        onClick={onClick}
        onMouseEnter={() => clickable && playSfx('hover')}
        whileHover={clickable ? { scale: 1.1, rotate: -2 } : undefined}
        whileTap={clickable ? { scale: 0.92 } : undefined}
        animate={
          clickable
            ? undefined
            : {}
        }
        transition={clickable ? { duration: 2.4, repeat: Infinity } : undefined}
        style={{
          width: 'clamp(2.8rem, 4.8vw, 4.25rem)',
          height: 'clamp(2.8rem, 4.8vw, 4.25rem)',
        }}
        className={cn(
          'relative flex items-center justify-center rounded-2xl border-2 backdrop-blur-md transition-colors',
          clickable
            ? 'border-gold-300/60 bg-gradient-to-br from-royal-500/40 to-purpleglow-600/30 text-gold-200 hover:border-gold-300 lifeline-pulse'
            : 'border-white/10 bg-white/5 text-white/40',
        )}
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: 'clamp(1.4rem, 2.4vw, 2rem)',
            height: 'clamp(1.4rem, 2.4vw, 2rem)',
          }}
        >
          {children}
        </span>

        {/* Red X cross-out for used lifelines */}
        {crossOut && used && (
          <motion.svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 h-full w-full"
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          >
            <line x1="16" y1="16" x2="84" y2="84" stroke="#ef4444" strokeWidth="11" strokeLinecap="round" />
            <line x1="84" y1="16" x2="16" y2="84" stroke="#ef4444" strokeWidth="11" strokeLinecap="round" />
          </motion.svg>
        )}
        {/* Dim overlay for 50:50 (no X) */}
        {!crossOut && used && (
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-night-900/60" />
        )}
      </motion.button>

      <span
        className="text-center font-display uppercase tracking-widest text-white/70"
        style={{ fontSize: 'clamp(0.5rem, 0.8vw, 0.65rem)' }}
      >
        {label}
      </span>
    </div>
  )
}

/* ── Panel ────────────────────────────────────────────────────────────────── */

export const LifelinePanel = memo(function LifelinePanel({ lifelines, disabled, onPhone, onAudience, onFifty, onMc }: Props) {
  return (
    <div
      className="glass flex h-full flex-col items-center justify-center rounded-3xl"
      style={{
        gap: 'clamp(0.6rem, 1.6vh, 1.25rem)',
        padding: 'clamp(0.5rem, 1.2vh, 1rem) clamp(0.35rem, 0.7vw, 0.65rem)',
      }}
    >
      <h3
        className="font-display tracking-[0.3em] text-gold-300/90"
        style={{ fontSize: 'clamp(0.55rem, 0.85vw, 0.7rem)' }}
      >
        TRỢ GIÚP
      </h3>

      <LifelineButton label="Gọi điện" used={lifelines.phone} disabled={disabled} onClick={onPhone} crossOut>
        <PhoneIcon className="h-full w-full" />
      </LifelineButton>

      <LifelineButton label="Khán giả" used={lifelines.audience} disabled={disabled} onClick={onAudience} crossOut>
        <AudienceIcon className="h-full w-full" />
      </LifelineButton>

      <LifelineButton label="50:50" used={lifelines.fifty} disabled={disabled} onClick={onFifty} crossOut={false}>
        <FiftyIcon className="h-full w-full" />
      </LifelineButton>

      <LifelineButton label="Hỏi MC" used={lifelines.mc} disabled={disabled} onClick={onMc} crossOut>
        <McIcon className="h-full w-full" />
      </LifelineButton>
    </div>
  )
})
