/**
 * Game page — C1 patch applied.
 *
 * WHAT CHANGED
 * ────────────
 * • Wrapped with <TimerProvider> so countdown ticks only re-render
 *   <TimerDisplay> (the tiny wrapper that renders <Timer>), not this component.
 * • `remaining` is no longer destructured from `game` for rendering.
 * • `setTimerActive` (from useGame) is called in a useEffect to push the
 *   `active` boolean into TimerContext whenever phase/overlay state changes.
 * • `<Timer>` is wrapped in `<TimerDisplay>` which is a local memo component
 *   — it has no props from Game, reads everything from context.
 * • `<Timer remaining={...} active={...} />` call-site is simplified to
 *   `<TimerDisplay />` — the old remaining/active props are now in context.
 *
 * WHAT DID NOT CHANGE
 * ───────────────────
 * All game logic, routing, audio, lifelines, overlays, modals, animations —
 * completely unchanged.  The player experience is identical.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { GameScene } from '@/components/GameScene'
import { QuestionCard } from '@/components/QuestionCard'
import { AnswerButton } from '@/components/AnswerButton'
import { Timer } from '@/components/Timer'
import { QuestionProgress } from '@/components/QuestionProgress'
import { LifelinePanel } from '@/components/LifelinePanel'
import { ScoreBoard } from '@/components/ScoreBoard'
import { VictoryPopup } from '@/components/VictoryPopup'
import { LosePopup } from '@/components/LosePopup'
import { ContinueModal } from '@/components/ContinueModal'
import { AskMcOverlay } from '@/components/AskMcOverlay'
import { AskAudienceOverlay } from '@/components/AskAudienceOverlay'
import { PhoneOverlay } from '@/components/PhoneOverlay'
import { InGameSettingsModal } from '@/components/InGameSettingsModal'
import { Logo } from '@/assets/logo/Logo'
import { useGame } from '@/hooks/useGame'
import { useSettings } from '@/state/SettingsContext'
import { useGameResult } from '@/state/GameResultContext'
import { TimerProvider } from '@/state/TimerContext'
import { getMcSuggestion, computeAudienceVote } from '@/services/lifeline'
import { candiesForLevel } from '@/services/ladder'
import type { AskAudienceResult, AskMcResult } from '@/types'
import { ANSWER_LETTERS } from '@/utils'

// ─────────────────────────────────────────────────────────────────────────────
// C1: TimerDisplay — isolated subscriber to TimerContext.
// This is the ONLY component that re-renders on countdown ticks.
// It has no props coming from Game, so memo() is 100% effective.
// ─────────────────────────────────────────────────────────────────────────────
const TimerDisplay = memo(function TimerDisplay() {
  return <Timer />
})

// ─────────────────────────────────────────────────────────────────────────────
// Game — public export.
// Wraps GameInner with TimerProvider so that useGame() (called inside
// GameInner) can read from TimerContext as a proper descendant.
// ─────────────────────────────────────────────────────────────────────────────
export function Game() {
  return (
    <TimerProvider>
      <GameInner />
    </TimerProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GameInner — the actual game logic and UI.
// Lives inside TimerProvider so useGame()'s useTimerSetter() call resolves
// to the real context value, not the no-op default.
// ─────────────────────────────────────────────────────────────────────────────

function GameInner() {
  const navigate   = useNavigate()
  const game       = useGame()
  const { unlockAudio, stopMusic, stopLoseMusic, playSfx } = useSettings()
  const { setResult, clear } = useGameResult()

  // Stable ref to game actions so callbacks don't recreate on every render
  const gameRef = useRef(game)
  gameRef.current = game

  // ── UI state ──────────────────────────────────────────────────────────────
  const [intro, setIntro]               = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mcResult, setMcResult]         = useState<AskMcResult | null>(null)
  const [audienceResult, setAudienceResult] = useState<AskAudienceResult | null>(null)
  const [phoneOpen, setPhoneOpen]       = useState(false)

  // Prevent double-begin in StrictMode
  const startedRef   = useRef(false)
  // CommittedRef: true after genuine first mount
  const committedRef = useRef(false)

  // ── C1: push `timerActive` into TimerContext ──────────────────────────────
  // `setTimerActive` is stable (from TimerContext via useGame), so this effect
  // runs only when the relevant flags actually change — and crucially it does
  // NOT re-render Game itself.
  const { state, currentQuestion, setTimerActive } = game

  const timerShouldBeActive =
    state.phase === 'question' &&
    !settingsOpen &&
    mcResult === null &&
    audienceResult === null &&
    !phoneOpen &&
    !intro

  useEffect(() => {
    setTimerActive(timerShouldBeActive)
  }, [timerShouldBeActive, setTimerActive])

  // ── mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    unlockAudio()
    const t = window.setTimeout(() => {
      setIntro(false)
      if (!startedRef.current) {
        startedRef.current = true
        gameRef.current.begin()
      }
    }, 2200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On unmount (route change, HMR), stop audio and destroy the session.
  useEffect(() => {
    committedRef.current = true
    return () => {
      if (!committedRef.current) return
      stopMusic()
      stopLoseMusic()
      gameRef.current.destroySession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── settings modal: pause / resume timer ─────────────────────────────────

  useEffect(() => {
    if (settingsOpen) {
      gameRef.current.pauseTimer()
    } else {
      if (gameRef.current.state.phase === 'question') gameRef.current.resumeTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen])

  // ── result sync ───────────────────────────────────────────────────────────

  const showLose     = state.phase === 'wrong' || state.phase === 'lost'
  const showWin      = state.phase === 'won'
  const showDecision = state.phase === 'decision'

  useEffect(() => {
    if (showLose || showWin) setResult(game.result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLose, showWin])

  // ── derived ───────────────────────────────────────────────────────────────

  const total        = state.questions.length
  const answersDisabled =
    state.phase !== 'question' || intro || mcResult !== null || audienceResult !== null || phoneOpen
  const lastReward   = state.candies - candiesForLevel(state.currentIndex)

  const flash =
    state.phase === 'correct' || state.phase === 'decision'
      ? { level: state.currentIndex + 1, type: 'correct' as const }
      : state.phase === 'wrong'
        ? { level: state.currentIndex + 1, type: 'wrong' as const }
        : null

  // ── Phone lifeline ────────────────────────────────────────────────────────

  const handlePhone = useCallback(() => {
    const g = gameRef.current
    if (g.state.lifelines.phone || g.state.phase !== 'question' || !g.currentQuestion) return
    g.pauseTimer()
    g.usePhone()
    setPhoneOpen(true)
  }, [])

  const handlePhoneDone = useCallback(() => {
    setPhoneOpen(false)
    if (gameRef.current.state.phase === 'question') gameRef.current.resumeTimer()
  }, [])

  // ── Audience lifeline ─────────────────────────────────────────────────────

  const handleAudience = useCallback(() => {
    const g = gameRef.current
    if (g.state.lifelines.audience || g.state.phase !== 'question' || !g.currentQuestion) return
    g.pauseTimer()
    const result = computeAudienceVote(g.currentQuestion)
    g.useAudience()
    setAudienceResult(result)
  }, [])

  const handleAudienceDone = useCallback(() => {
    setAudienceResult(null)
    if (gameRef.current.state.phase === 'question') gameRef.current.resumeTimer()
  }, [])

  // ── MC lifeline ───────────────────────────────────────────────────────────

  const handleMc = useCallback(() => {
    const g = gameRef.current
    if (g.state.lifelines.mc || g.state.phase !== 'question' || !g.currentQuestion) return
    g.pauseTimer()
    const result = getMcSuggestion(g.currentQuestion)
    g.useMc()
    setMcResult(result)
  }, [])

  const handleMcDone = useCallback(() => {
    setMcResult(null)
    if (gameRef.current.state.phase === 'question') gameRef.current.resumeTimer()
  }, [])

  // ── SINGLE EXIT PIPELINE ──────────────────────────────────────────────────

  const exitGame = useCallback((reason: 'home' | 'retry') => {
    // 1. Kill timer + silence all phase effects immediately.
    gameRef.current.destroySession()

    // 2. Stop all audio.
    stopMusic()
    stopLoseMusic()

    // 3. Dismiss every overlay synchronously.
    setSettingsOpen(false)
    setMcResult(null)
    setAudienceResult(null)
    setPhoneOpen(false)

    // 4. Reset shared result context.
    clear()

    if (reason === 'retry') {
      // Restart: stay on /game, start a new session immediately.
      setIntro(false)
      startedRef.current = true
      playSfx('transition')
      gameRef.current.begin()
    } else {
      // Home: reset startedRef and navigate away.
      startedRef.current = false
      navigate('/')
    }
  }, [stopMusic, stopLoseMusic, clear, playSfx, navigate])

  const handleHome  = useCallback(() => exitGame('home'),  [exitGame])
  const handleRetry = useCallback(() => exitGame('retry'), [exitGame])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <GameScene variant="game">

        {/* ── Intro overlay ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {intro && (
            <motion.div
              className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-night-900/80 backdrop-blur-sm"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 15 }}
                className="w-[min(90vw,540px)]"
              >
                <Logo className="w-full drop-shadow-[0_0_40px_rgba(245,197,66,0.4)]" />
              </motion.div>
              <motion.p
                className="mt-4 font-display tracking-[0.4em] text-gold-300/90"
                style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.4rem)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1] }}
                transition={{ duration: 1.6, times: [0, 0.4, 1] }}
              >
                SẴN SÀNG...
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Full-viewport shell ─────────────────────────────────────────── */}
        <div
          className="flex h-[100dvh] w-full flex-col"
          style={{ padding: 'clamp(0.5rem, 1.4vw, 1.5rem)', gap: 'clamp(0.5rem, 1.2vh, 1rem)' }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-4">
            {/* Left: Exit */}
            <button
              onClick={handleHome}
              className="glass flex items-center gap-2 rounded-xl px-4 py-2 font-display tracking-wider text-white/80 transition-colors hover:text-gold-300"
              style={{ fontSize: 'clamp(0.75rem, 1vw, 0.95rem)' }}
            >
              ← Thoát
            </button>

            {/* Center: Logo */}
            <div className="hidden md:block">
              <Logo
                style={{ height: 'clamp(2.5rem, 4.5vh, 4rem)' }}
                className="w-auto"
                animated={false}
              />
            </div>

            {/* Right: Score + Settings */}
            <div className="flex items-center gap-3">
              <ScoreBoard candies={state.candies} />
              <motion.button
                type="button"
                onClick={() => setSettingsOpen(true)}
                whileHover={{ scale: 1.1, rotate: 20 }}
                whileTap={{ scale: 0.92 }}
                className="glass flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition-colors hover:border-gold-300/50 hover:text-gold-300"
                aria-label="Cài đặt"
                style={{ fontSize: '1.1rem' }}
              >
                ⚙
              </motion.button>
            </div>
          </div>

          {/* Main grid */}
          <div
            className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[clamp(120px,11vw,190px)_1fr_clamp(220px,20vw,340px)]"
            style={{ gap: 'clamp(0.6rem, 1.4vw, 1.5rem)' }}
          >
            {/* Left: lifelines */}
            <div className="order-2 min-h-0 lg:order-1">
              <LifelinePanel
                lifelines={state.lifelines}
                disabled={answersDisabled}
                onPhone={handlePhone}
                onAudience={handleAudience}
                onFifty={game.useFifty}
                onMc={handleMc}
              />
            </div>

            {/* Center: timer + question + answers */}
            <div
              className="order-1 flex min-h-0 flex-col items-center lg:order-2"
              style={{ gap: 'clamp(0.75rem, 2vh, 1.75rem)' }}
            >
              {/* C1: TimerDisplay reads from context — no props from Game */}
              <div className="flex justify-center">
                <TimerDisplay />
              </div>

              {currentQuestion && (
                <QuestionCard
                  index={state.currentIndex}
                  total={total}
                  question={currentQuestion.question}
                  difficulty={currentQuestion.difficulty}
                />
              )}

              {currentQuestion && (
                <div
                  className="grid w-full grid-cols-1 md:grid-cols-2"
                  style={{ maxWidth: 'min(60rem, 92%)', gap: 'clamp(0.5rem, 1.2vw, 1rem)' }}
                >
                  {currentQuestion.answers.map((ans, i) => (
                    <AnswerButton
                      key={`${state.currentIndex}-${i}`}
                      index={i}
                      text={ans}
                      status={state.answerStatus[i]}
                      disabled={answersDisabled}
                      onSelect={game.select}
                    />
                  ))}
                </div>
              )}

              {/* Explanation on reveal */}
              <AnimatePresence>
                {(state.phase === 'correct' || showLose) && currentQuestion && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="glass mx-auto rounded-2xl border-l-4 border-gold-400/70 text-center text-white/80"
                    style={{
                      maxWidth: 'min(48rem, 92%)',
                      padding: 'clamp(0.5rem, 1.2vh, 0.9rem) clamp(0.9rem, 1.6vw, 1.4rem)',
                      fontSize: 'clamp(0.75rem, 1.1vw, 0.95rem)',
                    }}
                  >
                    <span className="font-display text-gold-300">
                      Đáp án đúng: {ANSWER_LETTERS[currentQuestion.correct]}.
                    </span>{' '}
                    {currentQuestion.explanation}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: ladder */}
            <div className="order-3 min-h-0">
              <QuestionProgress currentIndex={state.currentIndex} flash={flash} />
            </div>
          </div>
        </div>

        {/* ── MC overlay ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {mcResult && (
            <AskMcOverlay key="mc-overlay" result={mcResult} onDone={handleMcDone} />
          )}
        </AnimatePresence>

        {/* ── Audience overlay ────────────────────────────────────────────── */}
        <AnimatePresence>
          {audienceResult && currentQuestion && (
            <AskAudienceOverlay
              key="audience-overlay"
              result={audienceResult}
              answers={currentQuestion.answers}
              onDone={handleAudienceDone}
            />
          )}
        </AnimatePresence>

        {/* ── Phone overlay ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {phoneOpen && currentQuestion && (
            <PhoneOverlay
              key="phone-overlay"
              question={currentQuestion}
              onDone={handlePhoneDone}
            />
          )}
        </AnimatePresence>

        {/* ── Decision modal ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {showDecision && (
            <ContinueModal
              key="decision"
              justEarned={lastReward}
              total={state.candies}
              onContinue={game.continueGame}
              onStop={game.stopGame}
            />
          )}
        </AnimatePresence>

        {/* ── End overlays ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showWin && (
            <VictoryPopup
              key="win"
              candies={game.result.candies}
              onRetry={handleRetry}
              onHome={handleHome}
            />
          )}
          {showLose && (
            <LoseGate key="lose" delay={state.phase === 'lost' ? 400 : 2400}>
              <LosePopup
                candies={game.result.candies}
                reason={game.result.reason === 'complete' ? null : game.result.reason}
                reachedLevel={game.result.reachedLevel}
                total={total}
                onRetry={handleRetry}
                onHome={handleHome}
              />
            </LoseGate>
          )}
        </AnimatePresence>

        {/* ── In-game settings modal ──────────────────────────────────────── */}
        <InGameSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onRestart={handleRetry}
          onHome={handleHome}
        />

      </GameScene>
  )
}

/**
 * Small delay gate so the correct-answer flash is visible for a beat
 * before the cinematic lose overlay slides in.
 */
function LoseGate({ children, delay = 2400 }: { children: React.ReactNode; delay?: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delay)
    return () => window.clearTimeout(t)
  }, [delay])
  if (!show) return null
  return <>{children}</>
}
