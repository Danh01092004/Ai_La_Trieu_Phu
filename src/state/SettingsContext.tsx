/**
 * SettingsContext — audio + user preferences.
 *
 * The context is split in two so that hot-path components can subscribe to the
 * stable action callbacks without re-rendering whenever the values change:
 *
 *   • SettingsActionsContext — stable callbacks only (deps are `[]`).
 *   • SettingsStateContext   — `settings` + `audioUnlocked` (volatile).
 *
 * `useSettings()` merges both for components that need the full surface;
 * `useSettingsActions()` / `useSettingsState()` narrow the subscription.
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
import { loadSettings, saveSettings } from './settingsStore'
import { sound, type SfxName } from '@/theme/sounds/soundManager'

// ─────────────────────────────────────────────────────────────────────────────
// Context value shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Stable callbacks — these never change for the lifetime of the provider. */
interface SettingsActionsValue {
  setMusic:      (on: boolean) => void
  setSfx:        (on: boolean) => void
  setVolume:     (volume: number) => void
  toggleMusic:   () => void
  toggleSfx:     () => void
  unlockAudio:   () => void
  playSfx:       (name: SfxName) => void
  startMusic:    () => void
  stopMusic:     () => void
  playLoseMusic: () => void
  stopLoseMusic: () => void
}

/** Volatile state — re-renders consumers when settings change. */
interface SettingsStateValue {
  settings:      Settings
  audioUnlocked: boolean
}

export type SettingsContextValue = SettingsActionsValue & SettingsStateValue

// ─────────────────────────────────────────────────────────────────────────────
// Contexts
// ─────────────────────────────────────────────────────────────────────────────

const SettingsActionsContext = createContext<SettingsActionsValue | null>(null)
const SettingsStateContext = createContext<SettingsStateValue | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const unlockedRef = useRef(false)

  /** Always mirrors the latest settings so stable callbacks can read them. */
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Persist + push the settings into the SoundManager whenever they change.
  useEffect(() => {
    saveSettings(settings)
    sound.applySettings(settings)
  }, [settings])

  // ── Stable callbacks ──────────────────────────────────────────────────────

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return
    unlockedRef.current = true
    sound.unlock()
    sound.applySettings(settingsRef.current)
    setAudioUnlocked(true)
  }, [])

  const playSfx = useCallback((name: SfxName) => {
    if (!settingsRef.current.sfx) return
    sound.play(name)
  }, [])

  const startMusic = useCallback(() => {
    if (!settingsRef.current.music) return
    sound.startMusic()
  }, [])

  const stopMusic     = useCallback(() => sound.stopMusic(),     [])
  const playLoseMusic = useCallback(() => {
    // The lose sting belongs to the music channel: respecting the user's music
    // preference is more important than forcing a sting after a wrong answer.
    if (!settingsRef.current.music) return
    sound.playLoseMusic()
  }, [])
  const stopLoseMusic = useCallback(() => sound.stopLoseMusic(), [])

  const setMusic = useCallback((on: boolean) => {
    const next = { ...settingsRef.current, music: on }
    setSettings(next)
    // Push the new value into the SoundManager *before* toggling playback:
    // `sound.startMusic()` bails while its own settings still say music is off.
    sound.applySettings(next)
    if (on) sound.startMusic()
    else    sound.stopMusic()
  }, [])

  const setSfx = useCallback(
    (on: boolean) => setSettings((current) => ({ ...current, sfx: on })),
    [],
  )

  const setVolume = useCallback(
    (volume: number) =>
      setSettings((current) => ({
        ...current,
        volume: Math.min(1, Math.max(0, volume)),
      })),
    [],
  )

  const toggleMusic = useCallback(() => {
    setMusic(!settingsRef.current.music)
  }, [setMusic])

  const toggleSfx = useCallback(() => {
    setSettings((current) => ({ ...current, sfx: !current.sfx }))
  }, [])

  // ── Memoised context values ───────────────────────────────────────────────

  const actionsValue = useMemo<SettingsActionsValue>(
    () => ({
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
    }),
    [
      setMusic, setSfx, setVolume, toggleMusic, toggleSfx,
      unlockAudio, playSfx, startMusic, stopMusic, playLoseMusic, stopLoseMusic,
    ],
  )

  const stateValue = useMemo<SettingsStateValue>(
    () => ({ settings, audioUnlocked }),
    [settings, audioUnlocked],
  )

  return (
    <SettingsActionsContext.Provider value={actionsValue}>
      <SettingsStateContext.Provider value={stateValue}>
        {children}
      </SettingsStateContext.Provider>
    </SettingsActionsContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Stable callbacks only — consumers never re-render on settings changes. */
export function useSettingsActions(): SettingsActionsValue {
  const context = useContext(SettingsActionsContext)
  if (!context) throw new Error('useSettingsActions must be used within SettingsProvider')
  return context
}

/** Settings values + audio unlock flag. */
export function useSettingsState(): SettingsStateValue {
  const context = useContext(SettingsStateContext)
  if (!context) throw new Error('useSettingsState must be used within SettingsProvider')
  return context
}

/** Full surface: values merged with stable actions. */
export function useSettings(): SettingsContextValue {
  const actions = useSettingsActions()
  const state = useSettingsState()
  return { ...actions, ...state }
}
