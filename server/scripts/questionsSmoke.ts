/**
 * Question-bank validator.
 *
 * Run with `npm run test:questions` (or `MIN_QUESTIONS=25 npm run
 * test:questions`). It checks the JSON shape consumed by both the Vite client
 * and the server, so a malformed hand-edited bank fails before a match starts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MIN_QUESTION_BANK,
  TOTAL_QUESTIONS,
} from '../../src/config/multiplayerConfig'
import type { Question } from '../../src/types'

const MIN_QUESTIONS = Number(process.env.MIN_QUESTIONS ?? MIN_QUESTION_BANK)
const QUESTION_FILE = resolve(process.cwd(), 'src/data/questions.json')
const DIFFICULTIES = new Set<Question['difficulty']>([
  'easy',
  'medium',
  'hard',
  'very_hard',
])

function fail(message: string): never {
  throw new Error(`[questions] ${message}`)
}

function main(): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(QUESTION_FILE, 'utf8'))
  } catch (error) {
    fail(`JSON không hợp lệ: ${error instanceof Error ? error.message : String(error)}`)
  }

  assert.ok(Array.isArray(parsed), '[questions] JSON gốc phải là một mảng')
  assert.ok(
    parsed.length >= MIN_QUESTIONS,
    `[questions] cần ít nhất ${MIN_QUESTIONS} câu, hiện có ${parsed.length}`,
  )

  const ids = new Set<number>()
  const questions = new Set<string>()
  const answers = new Set<string>()
  const difficulties: Record<string, number> = {}

  parsed.forEach((value, index) => {
    const where = `câu #${index + 1}`
    assert.ok(
      typeof value === 'object' && value !== null && !Array.isArray(value),
      `[questions] ${where} phải là object`,
    )
    const question = value as Record<string, unknown>

    assert.ok(Number.isInteger(question.id) && (question.id as number) > 0, `[questions] ${where}: id phải là số nguyên dương`)
    const id = question.id as number
    assert.ok(!ids.has(id), `[questions] ${where}: id ${id} bị trùng`)
    ids.add(id)

    assert.ok(typeof question.question === 'string' && question.question.trim().length > 0, `[questions] ${where}: thiếu nội dung câu hỏi`)
    const text = (question.question as string).trim()
    assert.ok(!questions.has(text), `[questions] ${where}: nội dung câu hỏi bị trùng`)
    questions.add(text)

    assert.ok(Array.isArray(question.answers) && question.answers.length === 4, `[questions] ${where}: phải có đúng 4 đáp án`)
    const optionSet = new Set<string>()
    for (const option of question.answers as unknown[]) {
      assert.ok(typeof option === 'string' && option.trim().length > 0, `[questions] ${where}: đáp án rỗng`)
      const normalized = (option as string).trim()
      assert.ok(!optionSet.has(normalized), `[questions] ${where}: đáp án bị trùng`)
      optionSet.add(normalized)
      answers.add(normalized)
    }

    assert.ok(Number.isInteger(question.correct) && (question.correct as number) >= 0 && (question.correct as number) <= 3, `[questions] ${where}: correct phải là 0..3`)
    assert.ok(typeof question.difficulty === 'string' && DIFFICULTIES.has(question.difficulty as Question['difficulty']), `[questions] ${where}: difficulty không hợp lệ`)
    assert.ok(typeof question.explanation === 'string' && question.explanation.trim().length > 0, `[questions] ${where}: thiếu giải thích`)

    const difficulty = question.difficulty as string
    difficulties[difficulty] = (difficulties[difficulty] ?? 0) + 1
  })

  assert.ok(
    parsed.length >= TOTAL_QUESTIONS,
    `[questions] cần ít nhất ${TOTAL_QUESTIONS} câu để rút một ván`,
  )

  // Exercise the random draw contract: each run must be unique and complete.
  for (let run = 0; run < 10; run += 1) {
    const shuffled: Question[] = [...(parsed as Question[])]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const draw: Question[] = shuffled.slice(0, TOTAL_QUESTIONS)
    assert.equal(new Set(draw.map((question: Question) => question.id)).size, TOTAL_QUESTIONS)
  }

  console.log(
    `[questions] OK: ${parsed.length} câu, ${ids.size} id duy nhất, ` +
      `${answers.size} đáp án duy nhất, phân bố ${JSON.stringify(difficulties)}, ` +
      `rút ${TOTAL_QUESTIONS} câu ngẫu nhiên không trùng.`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
