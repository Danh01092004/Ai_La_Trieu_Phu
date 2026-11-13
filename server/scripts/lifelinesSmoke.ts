/**
 * Unit checks for the four server-side lifelines. No running server needed.
 * Run with `npm run test:lifelines`.
 */
import assert from 'node:assert/strict'
import type { Question } from '../../src/types'
import {
  generateAudience,
  generateFifty,
  generateMc,
  generatePhone,
} from '../lifelines'

const LETTERS = ['A', 'B', 'C', 'D'] as const
const QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'Câu dễ',
    answers: ['Sai A', 'Đúng B', 'Sai C', 'Sai D'],
    correct: 1,
    difficulty: 'easy',
    explanation: 'Vì B đúng.',
  },
  {
    id: 2,
    question: 'Câu rất khó',
    answers: ['Đúng A', 'Sai B', 'Sai C', 'Sai D'],
    correct: 0,
    difficulty: 'very_hard',
    explanation: 'Vì A đúng.',
  },
]

function assertNoAnswerLeak(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  assert.equal(serialized.includes('correctIndex'), false)
  assert.equal(serialized.includes('isCorrect'), false)
  assert.equal(serialized.includes('"correct"'), false)
}

for (const question of QUESTIONS) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const fifty = generateFifty(question)
    assert.equal(fifty.type, 'fifty')
    assert.equal(fifty.removed.length, 2)
    assert.equal(new Set(fifty.removed).size, 2)
    assert.equal(fifty.removed.includes(question.correct), false)
    fifty.removed.forEach((index) => {
      assert.ok(Number.isInteger(index) && index >= 0 && index < 4)
    })
    assertNoAnswerLeak(fifty)

    const phone = generatePhone(question)
    assert.equal(phone.type, 'phone')
    // Product rule: the friend is always wrong.
    assert.notEqual(phone.suggestedIndex, question.correct)
    assert.equal(phone.suggestedLetter, LETTERS[phone.suggestedIndex])
    assert.equal(phone.suggestedText, question.answers[phone.suggestedIndex])
    assert.ok(phone.phrase.length > 0)
    assertNoAnswerLeak(phone)

    const mc = generateMc(question)
    assert.equal(mc.type, 'mc')
    assert.notEqual(mc.suggestedIndex, question.correct)
    assert.equal(mc.suggestedLetter, LETTERS[mc.suggestedIndex])
    assert.equal(mc.suggestedText, question.answers[mc.suggestedIndex])
    assertNoAnswerLeak(mc)

    const audience = generateAudience(question)
    assert.equal(audience.type, 'audience')
    assert.equal(
      audience.percentages.reduce((sum, value) => sum + value, 0),
      100,
    )
    audience.percentages.forEach((value) => {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 100)
    })
    assert.equal(
      audience.displayWinnerId,
      audience.percentages.indexOf(Math.max(...audience.percentages)),
    )
    assertNoAnswerLeak(audience)
  }
}

console.log(
  '[lifelines] 50:50, phone-always-wrong, audience and MC invariants passed',
)
