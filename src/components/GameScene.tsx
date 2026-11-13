import type { ReactNode } from 'react'
import { ParticleField } from './ParticleField'

interface Props {
  children: ReactNode
  /** Palette of the stage backdrop. */
  variant?: 'home' | 'game' | 'win' | 'lose'
}

const VARIANT_GLOW: Record<NonNullable<Props['variant']>, string> = {
  home: 'from-royal-500/30 via-purpleglow-600/20 to-transparent',
  game: 'from-royal-500/20 via-night-700/10 to-transparent',
  win: 'from-gold-500/30 via-gold-400/10 to-transparent',
  lose: 'from-red-800/30 via-red-900/10 to-transparent',
}

/**
 * Cinematic stage backdrop shared by every screen.
 *
 * Everything here is static or runs at a capped frame-rate: the old rotating
 * 120vmax bloom, blurred moving spotlights and 30 FPS connection grid made
 * mid-range integrated GPUs drop to ~40 FPS on the landing screen.
 */
export function GameScene({ children, variant = 'game' }: Props) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-night-900 text-white">
      {/* base gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night-800 via-night-900 to-black" />

      {/* static bloom: the old 120vmax rotating layer forced a huge repaint */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[110vmax] w-[110vmax] -translate-x-1/2 -translate-y-1/2 opacity-50"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(91,116,240,0.10), transparent 25%, rgba(124,58,237,0.10) 50%, transparent 75%, rgba(245,197,66,0.08))',
        }}
      />

      {/* variant glow */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${VARIANT_GLOW[variant]}`}
      />

      {/* Ambient spotlights are decorative and were the most expensive layer
          on low-end GPUs. Keep them only on the landing screen. */}
      {variant === 'home' && (
        <>
          <div className="spotlight spotlight--left" />
          <div className="spotlight spotlight--right" />
        </>
      )}

      {/* particles: fewer motes during play; connection lines only on home */}
      <div className="pointer-events-none absolute inset-0">
        <ParticleField
          density={variant === 'home' ? 44 : 28}
          connections={variant === 'home'}
          interactive={variant === 'home'}
        />
      </div>

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_60px_rgba(0,0,0,0.75)]" />

      {/* content */}
      <div className="relative z-10 h-[100dvh] w-full">{children}</div>
    </div>
  )
}
