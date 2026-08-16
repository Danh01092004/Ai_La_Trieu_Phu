/**
 * TimerContext — C1 performance patch.
 *
 * PURPOSE
 * ───────
 * The 30-second countdown previously called `setRemaining` inside `useGame`,
 * which lives in the `Game` page component.  Every integer tick caused `Game`
 * to re-render, cascading through all its child components (AnswerButton ×4,
 * QuestionProgress, LifelinePanel, ScoreBoard, QuestionCard, etc.).
 *
 * This context hoists `remaining` into its own React subtree.  Only the
 * `<TimerDisplay>` wrapper (which renders `<Timer>`) subscribes to it, so
 * countdown ticks re-render ONLY the timer widget — the rest of Game is
 * completely unaffected.
 *
 * HOW IT WORKS
 * ────────────
 * • `TimerProvider` owns `remaining` and `timerActive` state.
 * • It exposes a stable `setRemaining` ref-based setter that `useGame` calls
 *   on every tick — same as the old `setRemaining` call, but now it only
 *   triggers a re-render inside `TimerProvider`'s subtree.
 * • `useTimerValue` — consumed only by `<TimerDisplay>` — returns the live
 *   remaining + active values.
 * • `useSetRemaining` — consumed by `useGame` — returns the stable setter.
 *
 * WHAT DID NOT CHANGE
 * ───────────────────
 * • Timer behaviour, sounds, pause/resume, timeout — all identical.
 * • `Timer` component props interface — unchanged.
 * • `useGame` public API — `remaining` is still returned for any external
 *   consumers that may read it (e.g. tests), it just isn't used for rendering.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { QUESTION_TIME } from '@/services/timer'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TimerValueContextType {
  remaining:   number
  timerActive: boolean
}

interface TimerSetterContextType {
  /** Stable setter — call this from useGame on every tick. */
  setRemaining: Dispatch<SetStateAction<number>>
  /** Stable setter for the active flag — driven by Game's phase/overlay state. */
  setTimerActive: Dispatch<SetStateAction<boolean>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexts
// ─────────────────────────────────────────────────────────────────────────────

/** Consumed by TimerDisplay only — re-renders on every tick. */
const TimerValueContext = createContext<TimerValueContextType>({
  remaining:   QUESTION_TIME,
  timerActive: false,
})

/** Consumed by useGame — stable, never re-renders. */
const TimerSetterContext = createContext<TimerSetterContextType>({
  setRemaining:   () => {},
  setTimerActive: () => {},
})

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function TimerProvider({ children }: { children: ReactNode }) {
  const [remaining,   setRemainingState]   = useState<number>(QUESTION_TIME)
  const [timerActive, setTimerActiveState] = useState<boolean>(false)

  // Wrap the raw setState in useCallback with [] deps so the object reference
  // that useGame receives is truly stable across re-renders of TimerProvider.
  const setRemaining = useCallback<Dispatch<SetStateAction<number>>>(
    (v) => setRemainingState(v),
    [],
  )
  const setTimerActive = useCallback<Dispatch<SetStateAction<boolean>>>(
    (v) => setTimerActiveState(v),
    [],
  )

  // The setter context never changes — useMemo is not even needed here since
  // both callbacks are already stable useCallbacks.
  const setterRef = useRef<TimerSetterContextType>({ setRemaining, setTimerActive })

  return (
    <TimerSetterContext.Provider value={setterRef.current}>
      <TimerValueContext.Provider value={{ remaining, timerActive }}>
        {children}
      </TimerValueContext.Provider>
    </TimerSetterContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Use inside TimerDisplay — triggers re-render on each tick. */
export function useTimerValue(): TimerValueContextType {
  return useContext(TimerValueContext)
}

/** Use inside useGame — stable, never causes re-renders. */
export function useTimerSetter(): TimerSetterContextType {
  return useContext(TimerSetterContext)
}
