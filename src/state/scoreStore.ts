const KEY = 'altp.best.v1'

export interface BestRecord {
  candies: number
  date: string
}

function read(): BestRecord | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as BestRecord
  } catch {
    return null
  }
}

export function loadHighScore(): number {
  return read()?.candies ?? 0
}

export function saveHighScore(candies: number): number {
  const prev = read()
  if (prev && prev.candies >= candies) return prev.candies
  const next: BestRecord = { candies, date: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore quota errors */
  }
  return candies
}
