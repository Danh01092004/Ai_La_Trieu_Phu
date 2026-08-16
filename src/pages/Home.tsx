import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GameScene } from '@/components/GameScene'
import { Logo } from '@/assets/logo/Logo'
import { SettingsModal } from '@/components/SettingsModal'
import { useSettings } from '@/state/SettingsContext'
import { useFullscreen } from '@/hooks/useFullscreen'
import { MAX_CANDIES, TOTAL_QUESTIONS } from '@/config/gameConfig'

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { playSfx } = useSettings()
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={() => {
        playSfx('click')
        onClick()
      }}
      onMouseEnter={() => playSfx('hover')}
      whileHover={{ scale: 1.1, y: -2 }}
      whileTap={{ scale: 0.94 }}
      className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-gold-200 transition-colors hover:text-gold-300 hover:shadow-neon"
    >
      {children}
    </motion.button>
  )
}

export function Home() {
  const navigate = useNavigate()
  const {
    settings,
    toggleMusic,
    unlockAudio,
    playSfx,
    startMusic,
    audioUnlocked,
  } = useSettings()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Resume the lobby music when returning to Home after a game.
  // • Only runs when audioUnlocked flips to true (first unlock) or when the
  //   component mounts while audio is already unlocked (back-navigation).
  // • startMusic() is idempotent — safe to call even if already playing.
  // • We intentionally omit `startMusic` from deps: it is a stable wrapper
  //   around the singleton and we do NOT want to re-run this effect every time
  //   settings.music changes (that is handled inside SoundManager.applySettings).
  useEffect(() => {
    if (audioUnlocked) startMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUnlocked])

  const handlePlay = () => {
    // unlockAudio() sets audioUnlocked=true, which triggers the useEffect above
    // to call startMusic() once. We must NOT call startMusic() here as well —
    // that was one of the sources of the double-play bug.
    unlockAudio()
    playSfx('whoosh')
    setTimeout(() => navigate('/game'), 260)
  }

  const handleExit = () => {
    playSfx('click')
    // Best-effort: close window if opened by script, otherwise go blank splash
    window.close()
  }

  return (
    <GameScene variant="home">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="relative flex h-[100dvh] flex-col items-center justify-center px-6 py-10"
      >
        {/* Top-right controls */}
        <div className="absolute right-6 top-6 z-20 flex gap-3">
          <IconButton label="Âm nhạc" onClick={() => { unlockAudio(); toggleMusic() }}>
            {settings.music ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </IconButton>
          <IconButton label="Toàn màn hình" onClick={toggleFullscreen}>
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </IconButton>
          <IconButton label="Cài đặt" onClick={() => { unlockAudio(); setSettingsOpen(true) }}>
            <GearIcon />
          </IconButton>
        </div>

        {/* Floating logo */}
        <motion.div
          className="w-full"
          style={{ maxWidth: 'min(90vw, 42rem)' }}
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Logo className="h-auto w-full drop-shadow-[0_10px_40px_rgba(245,197,66,0.35)]" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-2 max-w-xl text-center font-body text-royal-300/90"
          style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1rem)' }}
        >
          Chương trình trí tuệ — {TOTAL_QUESTIONS} câu hỏi, {MAX_CANDIES} viên kẹo và ngôi vị Nhà Vô Địch đang chờ bạn.
        </motion.p>

        {/* PLAY */}
        <motion.button
          type="button"
          onClick={handlePlay}
          onMouseEnter={() => playSfx('hover')}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 200, damping: 14 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          className="animated-border group relative mt-10 overflow-hidden rounded-full px-16 py-5"
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 opacity-90 transition-opacity group-hover:opacity-100" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 opacity-90 blur-xl" />
          <span className="relative z-10 flex items-center gap-3 font-display font-bold tracking-[0.2em] text-night-900" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
            <PlayIcon />
            CHƠI NGAY
          </span>
        </motion.button>

        {/* Secondary buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <SecondaryButton onClick={() => { unlockAudio(); setSettingsOpen(true) }}>
            <GearIcon /> Cài đặt
          </SecondaryButton>
          <SecondaryButton onClick={handleExit}>
            <ExitIcon /> Thoát
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

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  const { playSfx } = useSettings()
  return (
    <motion.button
      type="button"
      onClick={() => {
        playSfx('click')
        onClick()
      }}
      onMouseEnter={() => playSfx('hover')}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="glass flex items-center gap-2 rounded-2xl px-6 py-3 font-display text-lg tracking-widest text-gold-200 transition-colors hover:text-gold-300 hover:shadow-neon"
    >
      {children}
    </motion.button>
  )
}

/* ---- inline icons ---- */
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
function SpeakerOnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  )
}
function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </svg>
  )
}
function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}
function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
  )
}
