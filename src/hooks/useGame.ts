/**
 * useGame — C1 patch: `remaining` state is no longer owned here.
 *
 * WHAT CHANGED
 * ────────────
 * • `useState(QUESTION_TIME)` for `remaining` is replaced by
 *   `useTimerSetter()`.  The `setRemaining` call in the timer tick callback
 *   now writes into `TimerContext` instead of local state, so countdown ticks
 *   do NOT re-render the `Game` component — only `<TimerDisplay>` re-renders.
 * • `remaining` is still returned from the hook (its value comes from
 *   `timerRef` inspection) so any external consumer that reads it keeps
 *   working.  Game.tsx no longer passes `remaining` to `<Timer>` — the Timer
 *   reads from context directly.
 * • `startTimer` dep array is still `[]` because `playSfx` is now stable
 *   (C3 fix) and `setRemaining` from TimerContext is also stable.
 *
 * WHAT DID NOT CHANGE
 * ───────────────────
 * All game mechanics, phase transitions, reducer, timeout, pause/resume,
 * audio, lifelines, scoring — completely unchanged.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  createInitialState,
  gameReducer,
  type GameState,
} from '@/services/gameEngine'
import { CountdownTimer, QUESTION_TIME } from '@/services/timer'
import { useSettings } from '@/state/SettingsContext'
import { useTimerSetter } from '@/state/TimerContext'
import type { GameResultPayload } from '@/types'
import { guaranteedCandies } from '@/services/ladder'

const REVEAL_DELAY   = 2600
const DECISION_DELAY = 1600

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState)
  const timerRef          = useRef<CountdownTimer | null>(null)
  const { playSfx, startMusic, stopMusic, playLoseMusic } = useSettings()
  const stateRef = useRef<GameState>(state)
  stateRef.current = state

  // C1: write `remaining` into TimerContext instead of local state.
  // `setRemaining` is stable ([] deps from TimerContext), so it does NOT need
  // to be in startTimer's dep array.
  const { setRemaining, setTimerActive } = useTimerSetter()

  /**
   * Dead-flag.  Set to true the moment destroySession() is called.
   * Every effect that touches audio or dispatches auto-transitions checks
   * this ref FIRST.
   */
  const exitingRef = useRef(false)

  // ── timer helpers ────────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    timerRef.current?.stop()
    timerRef.current = null
  }, [])

  const pauseTimer  = useCallback(() => timerRef.current?.pause(),  [])
  const resumeTimer = useCallback(() => timerRef.current?.resume(), [])

  const startTimer = useCallback(() => {
    // Always kill any existing timer before creating a new one.
    timerRef.current?.stop()
    timerRef.current = null

    const t = new CountdownTimer(
      QUESTION_TIME,
      (rem) => {
        // C1: writes into TimerContext — only <TimerDisplay> re-renders.
        setRemaining(rem)
        if (rem <= 3 && rem > 0) playSfx('heartbeat')
        else if (rem <= 5 && rem > 0) playSfx('tickFast')
        else if (rem <= 10 && rem > 0) playSfx('tick')
      },
      () => dispatch({ type: 'TIMEOUT' }),
    )
    timerRef.current = t
    setRemaining(QUESTION_TIME)
    t.start()
  }, [playSfx, setRemaining])
  // playSfx: stable (C3). setRemaining: stable (TimerContext). Dep array is
  // effectively always stable — startTimer itself is created only once.

  // ── timer lifecycle driven by phase + sessionKey ─────────────────────────

  useEffect(() => {
    if (exitingRef.current) return

    if (state.phase === 'question') {
      startTimer()
      return
    }
    if (
      state.phase === 'idle'    ||
      state.phase === 'locked'  ||
      state.phase === 'correct' ||
      state.phase === 'decision'||
      state.phase === 'wrong'   ||
      state.phase === 'won'     ||
      state.phase === 'lost'
    ) {
      stopTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentIndex, state.sessionKey])

  // Hard stop on unmount.
  useEffect(() => () => timerRef.current?.stop(), [])

  // ── phase-driven audio + auto transitions ────────────────────────────────

  useEffect(() => {
    if (exitingRef.current) return

    let timeout: number | undefined
    if (state.phase === 'locked') {
      playSfx('reveal')
      timeout = window.setTimeout(() => {
        if (!exitingRef.current) dispatch({ type: 'REVEAL' })
      }, REVEAL_DELAY)
    } else if (state.phase === 'correct') {
      playSfx('correct')
      timeout = window.setTimeout(() => {
        if (!exitingRef.current) dispatch({ type: 'DECIDE' })
      }, DECISION_DELAY)
    } else if (state.phase === 'wrong') {
      playSfx('wrong')
      playLoseMusic()
    } else if (state.phase === 'lost') {
      playLoseMusic()
    } else if (state.phase === 'won') {
      stopMusic()
      playSfx('victory')
    }
    return () => window.clearTimeout(timeout)
  }, [state.phase, playSfx, playLoseMusic, stopMusic])

  // ── public actions ───────────────────────────────────────────────────────

  const begin = useCallback(() => {
    exitingRef.current = false
    startMusic()
    dispatch({ type: 'BEGIN' })
  }, [startMusic])

  const reset = useCallback(() => {
    dispatch({ type: 'INIT' })
  }, [])

  const destroySession = useCallback(() => {
    exitingRef.current = true
    timerRef.current?.stop()
    timerRef.current = null
    dispatch({ type: 'INIT' })
  }, [])

  const select = useCallback((index: number) => {
    if (stateRef.current.phase !== 'question') return
    playSfx('select')
    dispatch({ type: 'SELECT', index })
  }, [playSfx])

  const useFifty = useCallback(() => {
    if (stateRef.current.lifelines.fifty) return
    playSfx('lifeline')
    dispatch({ type: 'USE_FIFTY' })
  }, [playSfx])

  const usePhone = useCallback(() => {
    if (stateRef.current.lifelines.phone) return
    playSfx('whoosh')
    dispatch({ type: 'USE_PHONE' })
  }, [playSfx])

  const useAudience = useCallback(() => {
    if (stateRef.current.lifelines.audience) return
    playSfx('whoosh')
    dispatch({ type: 'USE_AUDIENCE' })
  }, [playSfx])

  const useMc = useCallback(() => {
    if (stateRef.current.lifelines.mc) return
    playSfx('lifeline')
    dispatch({ type: 'USE_MC' })
  }, [playSfx])

  const continueGame = useCallback(() => {
    if (stateRef.current.phase !== 'decision') return
    playSfx('transition')
    dispatch({ type: 'CONTINUE' })
  }, [playSfx])

  const stopGame = useCallback(() => {
    if (stateRef.current.phase !== 'decision') return
    dispatch({ type: 'STOP' })
  }, [])

  // ── derived values ───────────────────────────────────────────────────────

  const currentQuestion = state.questions[state.currentIndex]

  const result = useMemo<GameResultPayload>(() => {
    if (state.phase === 'won') {
      return {
        outcome:      'won',
        reachedLevel: state.questions.length,
        candies:      state.candies,
        reason:       state.reason,
      }
    }
    const retired = state.reason === 'retired'
    return {
      outcome:      retired ? 'retired' : 'lost',
      reachedLevel: state.currentIndex,
      candies:      retired ? state.candies : guaranteedCandies(state.currentIndex),
      reason:       state.reason,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.candies, state.currentIndex, state.reason, state.questions.length])

  // `remaining` is no longer local state — expose a snapshot from the timer
  // ref for any consumer that needs the current value imperatively.
  // This value is NOT reactive (won't trigger re-renders), which is the point.
  const remaining = timerRef.current?.getRemaining() ?? QUESTION_TIME

  return {
    state,
    remaining,         // kept in public API for backward compat; not used for rendering
    currentQuestion,
    result,
    begin,
    reset,
    destroySession,
    select,
    useFifty,
    usePhone,
    useAudience,
    useMc,
    pauseTimer,
    resumeTimer,
    continueGame,
    stopGame,
    /** C1: expose setTimerActive so Game.tsx can push the active flag into TimerContext */
    setTimerActive,
  }
}
