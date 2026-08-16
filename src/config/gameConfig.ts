/**
 * Central gameplay configuration.
 *
 * All tunable gameplay values live here so no component or service ever
 * hard-codes a gameplay constant directly.
 */

/** Questions answered per playthrough. */
export const TOTAL_QUESTIONS = 10

/**
 * Candies awarded per correctly-answered question (linear progression).
 * Question n → n * CANDY_PER_QUESTION candies accumulated.
 *
 *   Q1 → 2   Q2 → 4   Q3 → 6  ...  Q10 → 20
 */
export const CANDY_PER_QUESTION = 2

/** Maximum possible candy total (all questions correct). */
export const MAX_CANDIES = TOTAL_QUESTIONS * CANDY_PER_QUESTION   // 20

/**
 * Safe-haven levels.  Players who lose after reaching a safe haven keep
 * that level's candy total instead of falling to zero.
 */
export const SAFE_LEVELS: readonly number[] = [5, TOTAL_QUESTIONS]

// ─────────────────────────────────────────────────────────────────────────────
// Timer configuration (seconds)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seconds given to answer each question.
 * Every question always starts fresh with this value.
 */
export const QUESTION_TIME = 30

/**
 * Seconds shown in the audience-vote countdown.
 * The question timer is PAUSED for this duration; it does NOT reset.
 */
export const HELPER_TIME = 10

/**
 * Seconds shown in the Phone-a-Friend call overlay.
 * The question timer is PAUSED for this duration; it does NOT reset.
 */
export const PHONE_TIME = 30

// ─────────────────────────────────────────────────────────────────────────────
// Lifeline behaviour flags
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When true the MC ("Hỏi MC") lifeline ALWAYS suggests a wrong answer —
 * the whole point is comedic misdirection.
 */
export const MC_ALWAYS_WRONG = true

/**
 * When true the audience vote has a difficulty-dependent chance of pointing
 * to a wrong answer instead of the correct one.
 * Set to false to make the audience always reliable (e.g. for a fairer mode).
 */
export const ENABLE_TROLL_AUDIENCE = true
