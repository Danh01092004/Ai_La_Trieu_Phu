/**
 * In-game settings modal.
 *
 * Shown via the ⚙ button in the Game top-bar.
 * ESC closes it.  While open, the parent pauses the timer.
 *
 * Contains:
 *  • Background music toggle + volume slider
 *  • Sound effects toggle + volume slider
 *  • Fullscreen toggle
 *  • Restart Game  (calls onRestart)
 *  • Return Home   (calls onHome)
 *  • Close button  (calls onClose)
 */
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettings } from '@/state/SettingsContext'
import { useFullscreen } from '@/hooks/useFullscreen'
import { cn } from '@/utils'

interface Props {
  open: boolean
  onClose: () => void
  onRestart: () => void
  onHome: () => void
}

/* ── reusable sub-components ──────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-display text-xs tracking-[0.25em] text-white/40 uppercase">
      {children}
    </p>
  )
}

function Toggle({
  on,
  onChange,
  label,
  icon,
}: {
  on: boolean
  onChange: () => void
  label: string
  icon: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-gold-300/40"
    >
      <span className="flex items-center gap-3 font-body text-sm text-white/90">
        <span className="text-lg">{icon}</span>
        {label}
      </span>
      <span
        className={cn(
          'relative h-6 rounded-full border transition-colors duration-300',
          on ? 'border-gold-300 bg-gold-500/40' : 'border-white/20 bg-white/10',
        )}
        style={{ width: 48 }}
      >
        <motion.span
          layout
          className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-md', on ? 'bg-gold-300' : 'bg-white/60')}
          animate={{ left: on ? 28 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  )
}

function VolumeSlider({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="mb-2 flex items-center justify-between font-body text-sm text-white/90">
        <span>{label}</span>
        <span className="tabular-nums text-gold-300">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-gold-400"
      />
    </div>
  )
}

function DangerButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: string
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 font-display text-sm tracking-widest text-white/80 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
    >
      <span>{icon}</span>
      {children}
    </motion.button>
  )
}

/* ── main component ───────────────────────────────────────────────────────── */

export function InGameSettingsModal({ open, onClose, onRestart, onHome }: Props) {
  const { settings, toggleMusic, toggleSfx, setVolume } = useSettings()
  const { isFullscreen, toggle: toggleFs, supported: fsSupported } = useFullscreen()

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-night-900/85 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="glass animated-border relative w-full max-w-sm overflow-hidden rounded-3xl"
            initial={{ scale: 0.88, y: 32, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glow orb */}
            <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-gold-400/15 blur-3xl" />

            <div className="relative p-6">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-display text-xl tracking-widest text-gold-300 text-glow-gold">
                  ⚙ CÀI ĐẶT
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:border-gold-300/40 hover:text-gold-300"
                >
                  ✕
                </button>
              </div>

              {/* ── Music ── */}
              <div className="mb-4">
                <SectionLabel>Nhạc nền</SectionLabel>
                <div className="flex flex-col gap-2">
                  <Toggle on={settings.music} onChange={toggleMusic} label="Bật nhạc nền" icon="🎵" />
                  <VolumeSlider
                    value={settings.volume}
                    onChange={setVolume}
                    label="Âm lượng tổng"
                  />
                </div>
              </div>

              {/* ── SFX ── */}
              <div className="mb-4">
                <SectionLabel>Hiệu ứng âm thanh</SectionLabel>
                <Toggle on={settings.sfx} onChange={toggleSfx} label="Bật hiệu ứng" icon="🔊" />
              </div>

              {/* ── Fullscreen ── */}
              {fsSupported && (
                <div className="mb-4">
                  <SectionLabel>Màn hình</SectionLabel>
                  <Toggle
                    on={isFullscreen}
                    onChange={toggleFs}
                    label="Toàn màn hình"
                    icon="⛶"
                  />
                </div>
              )}

              {/* ── Game actions ── */}
              <div className="mb-5">
                <SectionLabel>Trò chơi</SectionLabel>
                <div className="flex flex-col gap-2">
                  <DangerButton onClick={onRestart} icon="🔄">
                    CHƠI LẠI
                  </DangerButton>
                  <DangerButton onClick={onHome} icon="🏠">
                    VỀ TRANG CHỦ
                  </DangerButton>
                </div>
              </div>

              {/* Close */}
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full rounded-2xl border border-gold-300/60 bg-gradient-to-r from-gold-500/30 to-gold-400/20 py-3 font-display text-sm tracking-widest text-gold-100 shadow-gold transition-opacity hover:opacity-90"
              >
                TIẾP TỤC
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
