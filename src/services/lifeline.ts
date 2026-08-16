import type { AskAudienceResult, AskMcResult, Difficulty, Question } from '@/types'
import { ANSWER_LETTERS } from '@/utils'
import { ENABLE_TROLL_AUDIENCE, MC_ALWAYS_WRONG } from '@/config/gameConfig'

// ─────────────────────────────────────────────────────────────────────────────
// 50 : 50
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 50:50 lifeline. Returns the two answer indices to REMOVE.
 * Always keeps the correct answer; removes two of the three incorrect ones.
 */
export function computeFiftyFifty(question: Question): number[] {
  const wrongIndices = question.answers
    .map((_, i) => i)
    .filter((i) => i !== question.correct)

  // Fisher-Yates shuffle on the wrong indices, then take first two.
  for (let i = wrongIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]]
  }

  return wrongIndices.slice(0, 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience vote simulation  (TROLL MODE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Probability that the audience gives the CORRECT answer as the winner,
 * by difficulty tier.
 *
 *   Easy      → 80 % chance audience is right
 *   Medium    → 60 % chance audience is right
 *   Hard      → 50 % chance audience is right
 *   Very Hard → 30 % chance audience is right
 *
 * When the audience is WRONG, a random wrong answer gets the top share.
 */
const AUDIENCE_CORRECT_PROB: Record<Difficulty, number> = {
  easy:      0.80,
  medium:    0.60,
  hard:      0.50,
  very_hard: 0.30,
}

/**
 * Vote share range [min, max] for the "winning" answer (whichever that is).
 * Used for both correct-winner and wrong-winner scenarios.
 */
const WINNER_SHARE_RANGE: Record<Difficulty, [number, number]> = {
  easy:      [0.65, 0.85],
  medium:    [0.55, 0.75],
  hard:      [0.50, 0.70],
  very_hard: [0.50, 0.80],
}

/**
 * Distribute `remaining` whole-number points across `count` buckets so that
 * every bucket gets at least 1 point and all points sum to `remaining`.
 *
 * Handles the degenerate case (remaining ≤ count) by assigning 1 to each
 * bucket and spreading any leftover randomly.
 */
function distributeRemaining(remaining: number, count: number): number[] {
  if (count === 1) return [remaining]

  // Degenerate: barely enough for each slot to get 1.
  if (remaining <= count) {
    const buckets = Array<number>(count).fill(1)
    let extra = remaining - count
    while (extra > 0) {
      buckets[Math.floor(Math.random() * count)]++
      extra--
    }
    return buckets
  }

  // Stars-and-bars: pick (count-1) unique breakpoints in (0, remaining).
  const breakpoints = new Set<number>()
  let attempts = 0
  while (breakpoints.size < count - 1 && attempts < 10_000) {
    breakpoints.add(Math.floor(Math.random() * (remaining - 1)) + 1)
    attempts++
  }
  const sorted = [0, ...Array.from(breakpoints).sort((a, b) => a - b), remaining]
  return sorted.slice(1).map((v, i) => v - sorted[i])
}

/**
 * Compute the audience vote result for a question.
 *
 * Contract
 * ────────
 * • Percentages always sum to exactly 100.
 * • Every answer gets at least 1 %.
 * • One answer has the highest share (the "display winner").
 * • The display winner may or may not be the correct answer, based on the
 *   troll-probability for the question's difficulty.
 * • `displayWinnerId` is what the UI highlights — the player sees this as
 *   the audience's recommendation.
 * • `correctIndex` is the ground-truth answer, never shown during the overlay.
 */
export function computeAudienceVote(question: Question): AskAudienceResult {
  const difficulty = question.difficulty

  // When troll mode is off, audience is always correct.
  const audienceIsCorrect = ENABLE_TROLL_AUDIENCE
    ? Math.random() < AUDIENCE_CORRECT_PROB[difficulty]
    : true

  // Decide which answer index will receive the highest share.
  const wrongIndices = question.answers
    .map((_, i) => i)
    .filter((i) => i !== question.correct)

  const winnerId = audienceIsCorrect
    ? question.correct
    : wrongIndices[Math.floor(Math.random() * wrongIndices.length)]

  // Winner gets a large random share.
  const [minFrac, maxFrac] = WINNER_SHARE_RANGE[difficulty]
  const winnerFrac = minFrac + Math.random() * (maxFrac - minFrac)
  // Round to integer; keep in [4, 97] so other 3 slots can each get ≥ 1 %.
  const winnerPct = Math.min(97, Math.max(4, Math.round(winnerFrac * 100)))
  const leftover  = 100 - winnerPct

  // The three non-winner indices.
  const otherIndices = question.answers.map((_, i) => i).filter((i) => i !== winnerId)
  const otherShares  = distributeRemaining(leftover, otherIndices.length)

  // Build the 4-element percentages array.
  const percentages: [number, number, number, number] = [0, 0, 0, 0]
  percentages[winnerId] = winnerPct
  otherIndices.forEach((idx, i) => {
    percentages[idx] = otherShares[i]
  })

  // Sanity-check: total must equal 100 exactly.
  // If floating-point drift caused an off-by-one, correct it on the winner.
  const sum = percentages.reduce((a, b) => a + b, 0)
  if (sum !== 100) percentages[winnerId] += 100 - sum

  return {
    percentages,
    displayWinnerId:     winnerId,
    correctIndex:        question.correct,
    audienceWasCorrect:  audienceIsCorrect,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ask MC  (TROLL MODE — always wrong)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Probability that the MC gives the correct answer, by difficulty.
 * Only used when MC_ALWAYS_WRONG = false.
 *   Easy      → 90 %
 *   Medium    → 75 %
 *   Hard      → 60 %
 *   Very Hard → 45 %
 */
const MC_ACCURACY: Record<Difficulty, number> = {
  easy:      0.90,
  medium:    0.75,
  hard:      0.60,
  very_hard: 0.45,
}

/**
 * Generate the MC's suggestion for a question.
 *
 * When MC_ALWAYS_WRONG is true (the default), the MC ALWAYS picks a random
 * wrong answer — pure comedic troll mode.
 *
 * When MC_ALWAYS_WRONG is false, the MC picks the correct answer with
 * difficulty-scaled probability and a wrong answer otherwise.
 */
export function getMcSuggestion(question: Question): AskMcResult {
  const wrongIndices = question.answers
    .map((_, i) => i)
    .filter((i) => i !== question.correct)

  let suggestedIndex: number
  let isCorrect: boolean

  if (MC_ALWAYS_WRONG) {
    // Always troll — pick a random wrong answer.
    suggestedIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)]
    isCorrect = false
  } else {
    isCorrect = Math.random() < MC_ACCURACY[question.difficulty]
    suggestedIndex = isCorrect
      ? question.correct
      : wrongIndices[Math.floor(Math.random() * wrongIndices.length)]
  }

  return {
    suggestedIndex,
    suggestedLetter: ANSWER_LETTERS[suggestedIndex],
    suggestedText:   question.answers[suggestedIndex],
    isCorrect,
  }
}
