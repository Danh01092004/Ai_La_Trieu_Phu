/** Random integer in the inclusive range [min, max]. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Random float in the range [min, max). */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Uniformly pick one element of a non-empty array. */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Fisher-Yates shuffle on a copy — the input array is never mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
