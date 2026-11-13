import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GameScene } from '@/components/GameScene'
import { Logo } from '@/assets/logo/Logo'
import { SettingsModal } from '@/components/SettingsModal'
import {
  ExitFullscreenIcon,
  ExitIcon,
  FullscreenIcon,
  GearIcon,
  CrownIcon,
  SpeakerOffIcon,
  SpeakerOnIcon,
  UsersIcon,
} from '@/components/icons'
import { useSettings } from '@/state/SettingsContext'
import { useSfxActions } from '@/hooks/useSfxActions'
import { useFullscreen } from '@/hooks/useFullscreen'
import { preloadMultiplayer } from '@/multiplayer/preload'
import {
  MAX_PLAYERS,
  QUESTION_TIME_MS,
  TOTAL_QUESTIONS,
} from '@/config/multiplayerConfig'

/** Delay before navigating so the "play" press animation lands. */
const NAVIGATE_DELAY_MS = 260

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { hover, click } = useSfxActions()

  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={click(onClick)}
      onMouseEnter={hover}
      whileHover={{ scale: 1.1, y: -2 }}
      whileTap={{ scale: 0.94 }}
      className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-gold-200 transition-colors hover:text-gold-300 hover:shadow-neon"
    >
      {children}
    </motion.button>
  )
}

function SecondaryButton({
  children,
  onClick,
  onPrefetch,
}: {
  children: React.ReactNode
  onClick: () => void
  onPrefetch?: () => void
}) {
  const { hover, click } = useSfxActions()

  return (
    <motion.button
      type="button"
      onClick={click(onClick)}
      onMouseEnter={() => {
        hover()
        onPrefetch?.()
      }}
      onFocus={onPrefetch}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="glass flex items-center gap-2 rounded-2xl px-6 py-3 font-display text-lg tracking-widest text-gold-200 transition-colors hover:text-gold-300 hover:shadow-neon"
    >
      {children}
    </motion.button>
  )
}

export function Home() {
  const navigate = useNavigate()
  const { settings, toggleMusic, unlockAudio, playSfx, startMusic, audioUnlocked } = useSettings()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const { hover } = useSfxActions()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Resume the lobby music when audio unlocks, or when coming back to Home
  // with audio already unlocked. startMusic() is idempotent — and settings
  // changes are pushed into the SoundManager separately.
  useEffect(() => {
    if (audioUnlocked) startMusic()
  }, [audioUnlocked, startMusic])

  const openSettings = () => {
    unlockAudio()
    setSettingsOpen(true)
  }

  const handleExit = () => {
    playSfx('click')
    // Best-effort: only works for script-opened windows.
    window.close()
  }

  const handleMultiplayer = () => {
    // Start the lazy chunk immediately; the 260 ms press delay is enough to
    // hide most of the route download on a cold cache.
    preloadMultiplayer()
    unlockAudio()
    playSfx('whoosh')
    window.setTimeout(() => navigate('/multiplayer'), NAVIGATE_DELAY_MS)
  }

  const handleLeaderboard = () => {
    unlockAudio()
    playSfx('click')
    navigate('/leaderboard')
  }

  return (
    <GameScene variant="home">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative flex h-[100dvh] flex-col items-center justify-center px-6 py-10"
      >
        {/* Top-right controls */}
        <div className="absolute right-6 top-6 z-20 flex gap-3">
          <IconButton
            label="Âm nhạc"
            onClick={() => {
              unlockAudio()
              toggleMusic()
            }}
          >
            {settings.music ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </IconButton>
          <IconButton label="Toàn màn hình" onClick={toggleFullscreen}>
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </IconButton>
          <IconButton label="Cài đặt" onClick={openSettings}>
            <GearIcon />
          </IconButton>
        </div>

        {/* Floating logo */}
        <motion.div
          className="logo-glow w-full"
          style={{ maxWidth: 'min(90vw, 42rem)' }}
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Logo className="h-auto w-full" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-2 max-w-xl text-center font-body text-royal-300/90"
          style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1rem)' }}
        >
          Đấu trường {MAX_PLAYERS} người chơi — {TOTAL_QUESTIONS} câu hỏi,{' '}
          {Math.round(QUESTION_TIME_MS / 1_000)} giây mỗi câu, 4 trợ giúp và một
          nhà vô địch.
        </motion.p>

        {/* Multiplayer is the only way to play now. */}
        <motion.button
          type="button"
          onClick={handleMultiplayer}
          onMouseEnter={hover}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 200, damping: 14 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          className="animated-border group relative mt-10 overflow-hidden rounded-full px-10 py-5 sm:px-14"
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 opacity-90 transition-opacity group-hover:opacity-100" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 opacity-90 blur-xl" />
          <span className="relative z-10 flex items-center gap-3 font-display font-bold tracking-[0.16em] text-night-900 sm:tracking-[0.2em]" style={{ fontSize: 'clamp(1.25rem, 2.7vw, 1.9rem)' }}>
            <UsersIcon className="h-7 w-7" />
            VÀO ĐẤU TRƯỜNG
          </span>
        </motion.button>

        {/* Secondary buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <SecondaryButton onClick={handleLeaderboard}>
            <CrownIcon className="h-5 w-5" /> BXH
          </SecondaryButton>
          <SecondaryButton onClick={openSettings}>
            <GearIcon className="h-5 w-5" /> Cài đặt
          </SecondaryButton>
          <SecondaryButton onClick={handleExit}>
            <ExitIcon className="h-5 w-5" /> Thoát
          </SecondaryButton>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1.4 }}
          className="absolute bottom-4 text-center text-[11px] tracking-widest text-white/40"
        >
          © AI LÀ TRIỆU PHÚ
        </motion.p>
      </motion.div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </GameScene>
  )
}
