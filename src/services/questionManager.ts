import type { Question } from '@/types'
import raw from '@/data/questions.json'
import { TOTAL_QUESTIONS } from './ladder'

const bank = raw as Question[]

/** Fisher-Yates shuffle on a copy. */
function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** The full question bank (all 20). */
export function getQuestionBank(): Question[] {
  return bank
}

/**
 * Pick a fresh, shuffled set of unique questions for one playthrough.
 * If the bank has fewer than TOTAL_QUESTIONS entries, returns as many as exist.
 */
export function drawQuestions(count: number = TOTAL_QUESTIONS): Question[] {
  return shuffle(bank).slice(0, Math.min(count, bank.length))
}

/** Kept for backwards compatibility — returns a fresh random draw. */
export function getAllQuestions(): Question[] {
  return drawQuestions()
}

export function getTotalQuestions(): number {
  return TOTAL_QUESTIONS
}
