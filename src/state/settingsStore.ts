import type { Settings } from '@/types'

const STORAGE_KEY = 'altp.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  music:  true,
  sfx:    true,
  volume: 0.8,
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' ? Math.min(1, Math.max(0, value)) : fallback
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }

    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      music:  parsed.music ?? DEFAULT_SETTINGS.music,
      sfx:    parsed.sfx   ?? DEFAULT_SETTINGS.sfx,
      volume: clampVolume(parsed.volume, DEFAULT_SETTINGS.volume),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
