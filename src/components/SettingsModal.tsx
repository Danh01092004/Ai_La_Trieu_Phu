import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '@/state/SettingsContext'
import { useFullscreen } from '@/hooks/useFullscreen'
import { cn } from '@/utils'

interface Props {
  open: boolean
  onClose: () => void
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
      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-gold-300/50"
    >
      <span className="flex items-center gap-3 font-body text-white/90">
        <span className="text-xl">{icon}</span>
        {label}
      </span>
      <span
        className={cn(
          'relative h-7 w-13 rounded-full border transition-colors duration-300',
          on ? 'border-gold-300 bg-gold-500/40' : 'border-white/20 bg-white/10',
        )}
        style={{ width: 52 }}
      >
        <motion.span
          layout
          className={cn(
            'absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-md',
            on ? 'bg-gold-300' : 'bg-white/60',
          )}
          animate={{ left: on ? 26 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  )
}

export function SettingsModal({ open, onClose }: Props) {
  const { settings, toggleMusic, toggleSfx, setVolume } = useSettings()
  const { isFullscreen, toggle: toggleFs, supported } = useFullscreen()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-night-900/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="glass animated-border relative w-full max-w-md rounded-3xl p-7"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <h2 className="mb-6 text-center font-display text-3xl tracking-wider text-gold-300 text-glow-gold">
              CÀI ĐẶT
            </h2>

            <div className="flex flex-col gap-3">
              <Toggle on={settings.music} onChange={toggleMusic} label="Nhạc nền" icon="🎵" />
              <Toggle on={settings.sfx} onChange={toggleSfx} label="Hiệu ứng âm thanh" icon="🔊" />

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="mb-2 flex items-center justify-between font-body text-white/90">
                  <span className="flex items-center gap-3">
                    <span className="text-xl">🎚️</span>Âm lượng
                  </span>
                  <span className="tabular-nums text-gold-300">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-gold-400"
                />
              </div>

              {supported && (
                <Toggle
                  on={isFullscreen}
                  onChange={toggleFs}
                  label="Toàn màn hình"
                  icon="⛶"
                />
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-2xl border border-gold-300/60 bg-gradient-to-r from-gold-500/30 to-gold-400/20 py-3 font-display text-lg tracking-widest text-gold-100 shadow-gold transition-transform hover:scale-[1.02]"
            >
              ĐÓNG
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
