import type { Settings } from '@/types'

const KEY = 'altp.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  music:     true,
  sfx:       true,
  volume:    0.8,
  sfxVolume: 0.8,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      music:     parsed.music     ?? DEFAULT_SETTINGS.music,
      sfx:       parsed.sfx       ?? DEFAULT_SETTINGS.sfx,
      volume:    typeof parsed.volume    === 'number' ? Math.min(1, Math.max(0, parsed.volume))    : DEFAULT_SETTINGS.volume,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? Math.min(1, Math.max(0, parsed.sfxVolume)) : DEFAULT_SETTINGS.sfxVolume,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota errors */
  }
}
