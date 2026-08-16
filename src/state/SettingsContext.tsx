/**
 * SettingsContext — C2 + C3 performance patch.
 *
 * WHAT CHANGED (and why):
 *
 *   C3 — Stable audio callbacks
 *     `playSfx` and `startMusic` previously closed over `settings.sfx` /
 *     `settings.music` so they were recreated every time those booleans
 *     changed.  Every `useGame` useCallback that listed `playSfx` in its
 *     dep array then also recreated, which could even restart the timer.
 *     Fix: a `settingsRef` always mirrors the latest `settings` object.
 *     `playSfx` and `startMusic` read from the ref at call-time instead of
 *     closing over the values, so their `useCallback` deps are now `[]`.
 *
 *   C2 — Split context so stable actions don't force re-renders on state
 *     changes.
 *     Two contexts are exported:
 *       • SettingsActionsContext — contains only stable callbacks (never
 *         re-renders consumers when settings change).
 *       • SettingsStateContext  — contains `settings` + `audioUnlocked`
 *         (only re-renders consumers that actually need the setting values).
 *     The existing `useSettings()` hook still works unchanged for all current
 *     consumers — it reads from both contexts and returns the merged shape.
 *     A new `useSettingsActions()` hook is also exported; hot-path components
 *     (AnswerButton, LifelinePanel) can switch to it to avoid any settings-
 *     change re-renders.
 *
 * WHAT DID NOT CHANGE:
 *   - All exported function/hook names and signatures are identical.
 *   - All audio behaviour is identical.
 *   - SettingsContextValue interface shape is identical.
 *   - localStorage save/load behaviour is identical.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Settings } from '@/types'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settingsStore'
import { sound, type SfxName } from '@/theme/sounds/soundManager'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Stable callbacks — these never change after mount. */
interface SettingsActionsValue {
  setMusic:       (on: boolean) => void
  setSfx:         (on: boolean) => void
  setVolume:      (v: number)   => void
  toggleMusic:    () => void
  toggleSfx:      () => void
  unlockAudio:    () => void
  /** C3: stable ref — never recreated when settings.sfx changes */
  playSfx:        (name: SfxName) => void
  /** C3: stable ref — never recreated when settings.music changes */
  startMusic:     () => void
  stopMusic:      () => void
  playLoseMusic:  () => void
  stopLoseMusic:  () => void
}

/** Volatile state — re-renders consumers when settings change. */
interface SettingsStateValue {
  settings:       Settings
  audioUnlocked:  boolean
}

/** Full merged shape — kept identical to the original SettingsContextValue
 *  so that existing `useSettings()` call-sites don't need any changes. */
interface SettingsContextValue extends SettingsActionsValue, SettingsStateValue {}

// ─────────────────────────────────────────────────────────────────────────────
// Contexts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C2: Actions context — value is stable (set once at mount and never changed).
 * Components that only need `playSfx`, `toggleMusic`, etc. subscribe here and
 * will never re-render because of a volume slider move.
 */
const SettingsActionsContext = createContext<SettingsActionsValue | null>(null)

/**
 * C2: State context — re-renders when `settings` or `audioUnlocked` changes.
 * Only components that render setting values (toggles, sliders, icons) need
 * this.
 */
const SettingsStateContext = createContext<SettingsStateValue | null>(null)

// Keep the original single context alive so `useSettings()` still works.
const SettingsContext = createContext<SettingsContextValue | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const unlockedRef              = useRef(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  /**
   * C3: A ref that always mirrors the current settings object.
   * Stable callbacks read from this instead of closing over state.
   */
  const settingsRef = useRef<Settings>(settings)
  settingsRef.current = settings

  // Persist settings + push to SoundManager whenever they change.
  useEffect(() => {
    saveSettings(settings)
    sound.applySettings(settings)
  }, [settings])

  // ── Stable callbacks (C3: deps = []) ─────────────────────────────────────

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return
    unlockedRef.current = true
    sound.unlock()
    sound.applySettings(loadSettings())
    setAudioUnlocked(true)
  }, [])

  /**
   * C3 fix: reads `settingsRef.current.sfx` at call-time instead of closing
   * over `settings.sfx`.  Dep array is now `[]` — this function reference is
   * stable for the lifetime of the provider.
   */
  const playSfx = useCallback((name: SfxName) => {
    if (!settingsRef.current.sfx) return
    sound.play(name)
  }, [])  // ← was [settings.sfx]

  /**
   * C3 fix: reads `settingsRef.current.music` at call-time.
   * Dep array is now `[]` — stable for the lifetime of the provider.
   */
  const startMusic = useCallback(() => {
    if (!settingsRef.current.music) return
    sound.startMusic()
  }, [])  // ← was [settings.music]

  const stopMusic      = useCallback(() => sound.stopMusic(),      [])
  const playLoseMusic  = useCallback(() => sound.playLoseMusic(),  [])
  const stopLoseMusic  = useCallback(() => sound.stopLoseMusic(),  [])

  const setMusic = useCallback((on: boolean) => {
    setSettings((s) => ({ ...s, music: on }))
    if (on) sound.startMusic()
    else    sound.stopMusic()
  }, [])

  const setSfx = useCallback(
    (on: boolean) => setSettings((s) => ({ ...s, sfx: on })),
    [],
  )

  const setVolume = useCallback(
    (v: number) => setSettings((s) => ({ ...s, volume: Math.min(1, Math.max(0, v)) })),
    [],
  )

  // These two still close over the setter callbacks, but setMusic/setSfx are
  // already stable ([] deps), so they only need to re-read settings once via
  // the setter function form — we can make toggles stable too:
  const toggleMusic = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, music: !s.music }
      if (next.music) sound.startMusic()
      else            sound.stopMusic()
      return next
    })
  }, [])  // ← was [settings.music, setMusic]

  const toggleSfx = useCallback(() => {
    setSettings((s) => ({ ...s, sfx: !s.sfx }))
  }, [])  // ← was [settings.sfx, setSfx]

  // ── C2: stable actions object (useMemo with [] deps so it's created once) ─

  const actionsValue = useMemo<SettingsActionsValue>(() => ({
    setMusic,
    setSfx,
    setVolume,
    toggleMusic,
    toggleSfx,
    unlockAudio,
    playSfx,
    startMusic,
    stopMusic,
    playLoseMusic,
    stopLoseMusic,
  }), [
    setMusic, setSfx, setVolume, toggleMusic, toggleSfx,
    unlockAudio, playSfx, startMusic, stopMusic, playLoseMusic, stopLoseMusic,
  ])

  // ── C2: volatile state object (recreated when settings or audioUnlocked changes) ─

  const stateValue = useMemo<SettingsStateValue>(
    () => ({ settings, audioUnlocked }),
    [settings, audioUnlocked],
  )

  // ── Merged value for the original SettingsContext (backward compat) ────────
  // This still re-renders on settings changes because it includes `settings`.
  // Components that call `useSettings()` behave exactly as before.
  // Components that call `useSettingsActions()` get only the stable object.

  const mergedValue = useMemo<SettingsContextValue>(
    () => ({ ...actionsValue, ...stateValue }),
    [actionsValue, stateValue],
  )

  return (
    <SettingsActionsContext.Provider value={actionsValue}>
      <SettingsStateContext.Provider value={stateValue}>
        <SettingsContext.Provider value={mergedValue}>
          {children}
        </SettingsContext.Provider>
      </SettingsStateContext.Provider>
    </SettingsActionsContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Original hook — returns the full merged object.
 * All existing call-sites work without any changes.
 * When settings change (volume slider, music toggle, etc.) all consumers of
 * this hook will still re-render — that is the correct behaviour for components
 * that render setting values.
 */
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

/**
 * C2: New hook for hot-path components that only need stable callbacks
 * (playSfx, hover sounds, etc.) and must NOT re-render when settings change.
 *
 * Currently used by: AnswerButton, LifelinePanel (they only call playSfx).
 * Can be adopted by any component that doesn't render setting values.
 */
export function useSettingsActions() {
  const ctx = useContext(SettingsActionsContext)
  if (!ctx) throw new Error('useSettingsActions must be used within SettingsProvider')
  return ctx
}

// Fallback for consumers that only want defaults reference
export { DEFAULT_SETTINGS }
