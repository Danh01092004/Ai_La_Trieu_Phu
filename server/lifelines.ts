/**
 * Server-side lifeline generators.
 *
 * These deliberately never send `isCorrect`: the client receives only the
 * suggestion the player is allowed to see. The correct answer stays in
 * GameManager until the post-question reveal.
 */
import { randomInt } from 'node:crypto'
import type { Difficulty, Question } from '../src/types'
import type {
  AudienceLifelineResult,
  FiftyLifelineResult,
  McLifelineResult,
  PhoneLifelineResult,
} from '../src/types/multiplayer'

const LETTERS = ['A', 'B', 'C', 'D'] as const

const PHONE_PHRASES = [
  'Mình không chắc lắm, nhưng có lẽ là',
  'Tớ nghĩ... có thể là',
  'Đây là câu khó, nhưng tớ đoán là',
  'Mình không chắc, nhưng cứ thử đáp án',
]

const AUDIENCE_CORRECT_PROB: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 0.6,
  hard: 0.5,
  very_hard: 0.3,
}

const AUDIENCE_WINNER_RANGE: Record<Difficulty, [number, number]> = {
  easy: [0.65, 0.85],
  medium: [0.55, 0.75],
  hard: [0.5, 0.7],
  very_hard: [0.5, 0.8],
}

function wrongIndices(question: Question): number[] {
  return question.answers
    .map((_, index) => index)
    .filter((index) => index !== question.correct)
}

function pick<T>(values: readonly T[]): T {
  return values[randomInt(values.length)]
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

export function generateFifty(question: Question): FiftyLifelineResult {
  const removed = shuffle(wrongIndices(question)).slice(0, 2).sort((a, b) => a - b)
  return { type: 'fifty', removed }
}

export function generateMc(question: Question): McLifelineResult {
  // The MC is intentionally a comedic troll: always a wrong answer.
  const suggestedIndex = pick(wrongIndices(question))
  return {
    type: 'mc',
    suggestedIndex,
    suggestedLetter: LETTERS[suggestedIndex],
    suggestedText: question.answers[suggestedIndex],
  }
}

export function generatePhone(question: Question): PhoneLifelineResult {
  // Product rule: the phone friend is always wrong. Keep the suggestion
  // uncertain instead of claiming certainty, and never expose the real answer.
  const suggestedIndex = pick(wrongIndices(question))
  return {
    type: 'phone',
    suggestedIndex,
    suggestedLetter: LETTERS[suggestedIndex],
    suggestedText: question.answers[suggestedIndex],
    phrase: pick(PHONE_PHRASES),
  }
}

function distributeRemaining(remaining: number, count: number): number[] {
  if (count === 1) return [remaining]

  if (remaining <= count) {
    const buckets = Array<number>(count).fill(1)
    let extra = remaining - count
    while (extra > 0) {
      buckets[randomInt(count)] += 1
      extra -= 1
    }
    return buckets
  }

  const breakpoints = new Set<number>()
  while (breakpoints.size < count - 1) {
    breakpoints.add(randomInt(remaining - 1) + 1)
  }
  const sorted = [0, ...Array.from(breakpoints).sort((a, b) => a - b), remaining]
  return sorted.slice(1).map((value, index) => value - sorted[index])
}

export function generateAudience(question: Question): AudienceLifelineResult {
  const audienceIsCorrect = Math.random() < AUDIENCE_CORRECT_PROB[question.difficulty]
  const winnerId = audienceIsCorrect ? question.correct : pick(wrongIndices(question))
  const [minShare, maxShare] = AUDIENCE_WINNER_RANGE[question.difficulty]
  const winnerPercentage = Math.min(
    97,
    Math.max(4, Math.round((minShare + Math.random() * (maxShare - minShare)) * 100)),
  )

  const otherIndices = question.answers
    .map((_, index) => index)
    .filter((index) => index !== winnerId)
  const otherShares = distributeRemaining(100 - winnerPercentage, otherIndices.length)
  const percentages: [number, number, number, number] = [0, 0, 0, 0]
  percentages[winnerId] = winnerPercentage
  otherIndices.forEach((index, position) => {
    percentages[index] = otherShares[position]
  })

  return {
    type: 'audience',
    percentages,
    displayWinnerId: winnerId,
  }
}
