/**
 * B4 integration smoke test.
 *
 * Requires the existing server on port 3001 (no extra test port). Start it in
 * fast test mode first (PowerShell):
 *
 *   $env:QUESTION_COUNT='15'; $env:QUESTION_MS='300'; npm run dev:full
 *   $env:QUESTION_COUNT='15'; $env:QUESTION_MS='300'; npm run test:game
 *
 * The test asserts the full question loop, identical deadlines, no answer
 * leakage, and the one-answer/deadline validation rules.
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { ANSWER_GRACE_MS, QUESTION_COUNT, QUESTION_DURATION_MS } from '../config'
import { TOTAL_QUESTIONS } from '../../src/config/multiplayerConfig'
import type {
  AnswerAck,
  GameQuestionPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomStartAck,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const CONNECT_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
const QUESTION_TIMEOUT_MS = 15_000
const TEST_TIMEOUT_MS = 90_000

const expectedCount = questionCount()
const expectedDurationMs = questionDurationMs()

function questionCount(): number {
  const parsed = Number(process.env.QUESTION_COUNT)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= TOTAL_QUESTIONS
    ? parsed
    : QUESTION_COUNT
}

function questionDurationMs(): number {
  const parsed = Number(process.env.QUESTION_MS)
  return Number.isInteger(parsed) && parsed >= 250 && parsed <= 60_000
    ? parsed
    : QUESTION_DURATION_MS
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function connect(): Promise<Socket> {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: CONNECT_TIMEOUT_MS,
  })

  return withTimeout(
    new Promise<Socket>((resolve, reject) => {
      socket.once('connect', () => resolve(socket))
      socket.once('connect_error', reject)
    }),
    CONNECT_TIMEOUT_MS,
    'connect',
  ).catch((error: unknown) => {
    socket.close()
    throw error
  })
}

function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve, reject) => {
      socket.timeout(REQUEST_TIMEOUT_MS).emit(
        event,
        payload,
        (error: Error | null, result: T) => {
          if (error) reject(error)
          else resolve(result)
        },
      )
    }),
    REQUEST_TIMEOUT_MS,
    event,
  )
}

interface QuestionFeed {
  next: () => Promise<GameQuestionPayload>
  close: () => void
}

/**
 * Buffers `game:question` packets before a waiter is installed, so a fast
 * server can never race the assertion code.
 */
function createQuestionFeed(socket: Socket): QuestionFeed {
  const queue: GameQuestionPayload[] = []
  let waiter: ((payload: GameQuestionPayload) => void) | null = null

  const onQuestion = (payload: GameQuestionPayload) => {
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(payload)
      return
    }
    queue.push(payload)
  }

  socket.on('game:question', onQuestion)

  return {
    next: () =>
      withTimeout(
        new Promise<GameQuestionPayload>((resolve, reject) => {
          const queued = queue.shift()
          if (queued) {
            resolve(queued)
            return
          }

          let timer: NodeJS.Timeout
          waiter = (payload) => {
            clearTimeout(timer)
            resolve(payload)
          }
          timer = setTimeout(() => {
            waiter = null
            reject(new Error('game:question timed out'))
          }, QUESTION_TIMEOUT_MS)
        }),
        QUESTION_TIMEOUT_MS,
        'game:question',
      ),
    close: () => socket.off('game:question', onQuestion),
  }
}

function assertPublicQuestion(payload: GameQuestionPayload): void {
  const raw = JSON.stringify(payload.question)

  assert.equal(Object.hasOwn(payload.question, 'correct'), false, 'public question leaked correct')
  assert.equal(
    Object.hasOwn(payload.question, 'explanation'),
    false,
    'public question leaked explanation',
  )
  assert.equal(raw.includes('"correct"'), false, 'public question leaked correct')
  assert.equal(raw.includes('"explanation"'), false, 'public question leaked explanation')
  assert.equal(payload.question.answers.length, 4)
  assert.equal(payload.question.question.trim().length > 0, true)
  assert.equal(payload.total, expectedCount)
  assert.equal(payload.durationMs, expectedDurationMs)
  assert.equal(payload.endsAt, payload.serverNow + expectedDurationMs)
  assert.equal(payload.endsAt > payload.serverNow, true)
}

async function assertAnswerValidation(
  host: Socket,
  guest: Socket,
  outsider: Socket,
  first: GameQuestionPayload,
): Promise<void> {
  const outsiderAnswer = await request<AnswerAck>(outsider, 'answer:submit', {
    questionIndex: first.index,
    answerIndex: 0,
  })
  assert.equal(outsiderAnswer.ok, false)
  if (!outsiderAnswer.ok) assert.equal(outsiderAnswer.code, 'NOT_IN_ROOM')

  const accepted = await request<AnswerAck>(host, 'answer:submit', {
    questionIndex: first.index,
    answerIndex: 0,
  })
  assert.equal(accepted.ok, true)
  if (accepted.ok) {
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.questionIndex, first.index)
    assert.equal(accepted.receivedAt >= first.serverNow, true)
    assert.equal(accepted.receivedAt <= first.endsAt + ANSWER_GRACE_MS, true)
  }

  const duplicate = await request<AnswerAck>(host, 'answer:submit', {
    questionIndex: first.index,
    answerIndex: 1,
  })
  assert.equal(duplicate.ok, false)
  if (!duplicate.ok) assert.equal(duplicate.code, 'ALREADY_ANSWERED')

  const wrongQuestion = await request<AnswerAck>(guest, 'answer:submit', {
    questionIndex: first.index + 1,
    answerIndex: 1,
  })
  assert.equal(wrongQuestion.ok, false)
  if (!wrongQuestion.ok) assert.equal(wrongQuestion.code, 'WRONG_QUESTION')

  const invalidAnswer = await request<AnswerAck>(guest, 'answer:submit', {
    questionIndex: first.index,
    answerIndex: 4,
  })
  assert.equal(invalidAnswer.ok, false)
  if (!invalidAnswer.ok) assert.equal(invalidAnswer.code, 'INVALID_ANSWER')

  // Wait until the server's closed state but before the next question opens.
  const offset = first.serverNow - Date.now()
  const lateAt = first.endsAt - offset + ANSWER_GRACE_MS + 120
  const waitMs = Math.max(0, lateAt - Date.now())
  await new Promise((resolve) => setTimeout(resolve, waitMs))

  const late = await request<AnswerAck>(guest, 'answer:submit', {
    questionIndex: first.index,
    answerIndex: 1,
  })
  assert.equal(late.ok, false)
  if (!late.ok) assert.equal(late.code, 'ANSWER_TOO_LATE')
}

async function run(): Promise<void> {
  const startedAt = Date.now()
  const admin = await connect()
  const host = await connect()
  const guest = await connect()
  const outsider = await connect()
  let adminQuestionCount = 0
  admin.on('game:question', () => {
    adminQuestionCount += 1
  })
  const hostFeed = createQuestionFeed(host)
  const guestFeed = createQuestionFeed(guest)

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', {
      name: 'Quản trò B4',
    })
    if (!created.ok) throw new Error(`create failed: ${created.code}`)
    assert.equal(created.role, 'admin')
    assert.equal(created.room.players.length, 0)

    const joined = await request<RoomJoinAck>(host, 'room:join', {
      code: created.code,
      name: 'Chủ phòng B4',
    })
    if (!joined.ok) throw new Error(`join failed: ${joined.code}`)

    const guestJoined = await request<RoomJoinAck>(guest, 'room:join', {
      code: created.code,
      name: 'Khách B4',
    })
    if (!guestJoined.ok) throw new Error(`guest join failed: ${guestJoined.code}`)

    const notPlaying = await request<AnswerAck>(host, 'answer:submit', {
      questionIndex: 1,
      answerIndex: 0,
    })
    assert.equal(notPlaying.ok, false)
    if (!notPlaying.ok) assert.equal(notPlaying.code, 'ROOM_NOT_PLAYING')

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(started.ok, true)

    const [firstHost, firstGuest] = await Promise.all([hostFeed.next(), guestFeed.next()])
    assertPublicQuestion(firstHost)
    assertPublicQuestion(firstGuest)
    assert.equal(firstHost.index, 1)
    assert.equal(firstHost.endsAt, firstGuest.endsAt)
    assert.deepEqual(firstHost.question.answers, firstGuest.question.answers)

    await assertAnswerValidation(host, guest, outsider, firstHost)

    const hostQuestions = [firstHost]
    const guestQuestions = [firstGuest]

    for (let questionNumber = 2; questionNumber <= expectedCount; questionNumber += 1) {
      const [nextHost, nextGuest] = await Promise.all([hostFeed.next(), guestFeed.next()])

      assert.equal(nextHost.index, questionNumber)
      assert.equal(nextGuest.index, questionNumber)
      assert.equal(nextHost.total, expectedCount)
      assert.equal(nextHost.endsAt, nextGuest.endsAt)
      assertPublicQuestion(nextHost)
      assertPublicQuestion(nextGuest)

      hostQuestions.push(nextHost)
      guestQuestions.push(nextGuest)
    }

    const ids = new Set(hostQuestions.map((payload) => payload.question.id))
    assert.equal(ids.size, expectedCount, 'questions must be unique within a match')

    for (const payload of hostQuestions) {
      const previous = hostQuestions[payload.index - 2]
      if (previous) {
        assert.equal(
          payload.endsAt > previous.endsAt,
          true,
          'each question must have a new deadline',
        )
      }
    }

    assert.deepEqual(
      hostQuestions.map((payload) => payload.question.id),
      guestQuestions.map((payload) => payload.question.id),
      'both clients must receive the same question order',
    )

    assert.equal(adminQuestionCount, 0, 'admin must never receive questions')

    const elapsed = ((Date.now() - startedAt) / 1_000).toFixed(1)
    console.info(
      `[game] ${expectedCount} unique questions, shared deadlines, answer/deadline validation, no answer leakage and no admin questions passed in ${elapsed}s`,
    )
  } finally {
    hostFeed.close()
    guestFeed.close()
    admin.close()
    host.close()
    guest.close()
    outsider.close()
  }
}

async function main(): Promise<void> {
  if (expectedDurationMs > 5_000) {
    throw new Error(
      'Run the server in fast test mode, e.g. $env:QUESTION_COUNT="15"; $env:QUESTION_MS="300" (same env for this script).',
    )
  }

  await withTimeout(run(), TEST_TIMEOUT_MS, 'game smoke test')
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[game] failed:', error)
    process.exit(1)
  },
)
