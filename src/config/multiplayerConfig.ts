/**
 * Shared multiplayer constants.
 *
 * This module is imported by both the Vite client (`@/config/...`) and the Node
 * server (relative path). Keep it dependency-free so both runtimes can load it.
 */

/** Maximum number of real players in one room. The admin is extra. */
export const MAX_PLAYERS = 40

/** Minimum connected players required before the admin can start a match. */
export const MIN_PLAYERS_TO_START = 2

/** Number of questions in one multiplayer match. */
export const TOTAL_QUESTIONS = 15

/** How long each question stays open. */
export const QUESTION_TIME_MS = 15_000

/** Full-screen final-loser chicken page; the lose track is ~6.1s. */
export const LOSE_PAGE_MS = 6_500

/**
 * Wrong/timeout page between questions: a quick visual transition, not a
 * second reveal. The lose track keeps playing underneath the reveal and is
 * stopped when the next question opens.
 */
export const QUICK_LOSE_PAGE_MS = 3_000

/** Players ranked outside this top-N cut-off get the final chicken page. */
export const FINAL_TOP_COUNT = 5

/** Room codes are short enough to type on a phone. */
export const ROOM_CODE_LENGTH = 6

/** Ambiguous characters (O/0, I/1) are intentionally excluded. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Maximum score when every question is answered correctly. */
export const MAX_POINTS = (2 ** TOTAL_QUESTIONS) - 1

/**
 * Points awarded for a correct answer at a 1-based question level.
 * Level 1 = 1 point; every following level doubles the previous one.
 */
export function pointsForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_QUESTIONS) {
    throw new RangeError(
      `Question level must be an integer between 1 and ${TOTAL_QUESTIONS}`,
    )
  }

  return 2 ** (level - 1)
}
