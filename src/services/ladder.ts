import type { LadderLevel } from '@/types'
import {
  CANDY_PER_QUESTION,
  SAFE_LEVELS,
  TOTAL_QUESTIONS,
} from '@/config/gameConfig'

export { TOTAL_QUESTIONS }

/**
 * Linear reward ladder.
 * Level n earns n × CANDY_PER_QUESTION candies (total accumulated).
 *
 *   Q1 → 2   Q2 → 4   Q3 → 6   Q4 → 8   Q5 → 10
 *   Q6 → 12  Q7 → 14  Q8 → 16  Q9 → 18  Q10 → 20
 */
export const LADDER: LadderLevel[] = Array.from(
  { length: TOTAL_QUESTIONS },
  (_, i) => {
    const level = i + 1
    return {
      level,
      candies: level * CANDY_PER_QUESTION,
      isSafe: (SAFE_LEVELS as readonly number[]).includes(level),
    }
  },
)

/** Candy total for completing `level` questions (1-based). */
export function candiesForLevel(level: number): number {
  const entry = LADDER.find((l) => l.level === level)
  return entry ? entry.candies : 0
}

/**
 * Candies a player keeps when losing at a given question index.
 * Falls back to the highest safe-haven level they have already passed,
 * or 0 if they have not yet reached any safe haven.
 *
 * @param reachedLevelIndex — number of questions answered correctly (0-based count)
 */
export function guaranteedCandies(reachedLevelIndex: number): number {
  const safe = LADDER.filter(
    (l) => l.isSafe && l.level <= reachedLevelIndex,
  )
  if (safe.length === 0) return 0
  return safe[safe.length - 1].candies
}
