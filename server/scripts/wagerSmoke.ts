/**
 * Wager ("mang thêm gói hàng") integration smoke test.
 *
 * Start the server in fast mode first:
 *   $env:QUESTION_COUNT='2'; $env:QUESTION_MS='2000'; $env:REVEAL_MS='300'; $env:WAGER_LOCK_MS='400'; npm run server
 *   $env:QUESTION_COUNT='2'; $env:QUESTION_MS='2000'; $env:REVEAL_MS='300'; $env:WAGER_LOCK_MS='400'; npm run test:wager
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import rawQuestions from '../../src/data/questions.json'
import { pointsForLevel } from '../../src/config/multiplayerConfig'
import {
  QUESTION_COUNT,
  QUESTION_DURATION_MS,
  QUESTION_REVEAL_MS,
  WAGER_LOCK_MS,
} from '../config'
import type { Question } from '../../src/types'
import type {
  AnswerAck,
  GameEndPayload,
  GameQuestionPayload,
  GameRevealPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomStartAck,
  WagerAck,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const CONNECT_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
const EVENT_TIMEOUT_MS = 10_000

const questionBank = rawQuestions as Question[]
const correctById = new Map(questionBank.map((question) => [question.id, question.correct]))

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

interface Feed<T> {
  next: () => Promise<T>
  close: () => void
}

function feed<T>(socket: Socket, event: string): Feed<T> {
  const queue: T[] = []
  let waiter: ((value: T) => void) | null = null

  const handler = (value: T) => {
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(value)
      return
    }
    queue.push(value)
  }

  socket.on(event, handler)
  return {
    next: () =>
      withTimeout(
        new Promise<T>((resolve) => {
          const queued = queue.shift()
          if (queued !== undefined) resolve(queued)
          else waiter = resolve
        }),
        EVENT_TIMEOUT_MS,
        event,
      ),
    close: () => socket.off(event, handler),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run(): Promise<void> {
  if (QUESTION_COUNT !== 2) throw new Error('Run with QUESTION_COUNT=2.')
  if (QUESTION_DURATION_MS > 3_000 || QUESTION_REVEAL_MS > 1_000) {
    throw new Error('Run with QUESTION_MS=2000, REVEAL_MS=300 and WAGER_LOCK_MS=400.')
  }
  if (WAGER_LOCK_MS >= QUESTION_DURATION_MS) {
    throw new Error('WAGER_LOCK_MS must be shorter than QUESTION_MS.')
  }

  const admin = await connect()
  const one = await connect()
  const two = await connect()
  const oneQuestions = feed<GameQuestionPayload>(one, 'game:question')
  const twoQuestions = feed<GameQuestionPayload>(two, 'game:question')
  const oneReveals = feed<GameRevealPayload>(one, 'game:reveal')
  const twoReveals = feed<GameRevealPayload>(two, 'game:reveal')
  const oneEnds = feed<GameEndPayload>(one, 'game:end')
  const twoEnds = feed<GameEndPayload>(two, 'game:end')

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', { name: 'Wager Admin' })
    if (!created.ok) throw new Error(created.message)

    for (const [socket, name] of [
      [one, 'Wager One'],
      [two, 'Wager Two'],
    ] as const) {
      const joined = await request<RoomJoinAck>(socket, 'room:join', {
        code: created.code,
        name,
      })
      if (!joined.ok) throw new Error(joined.message)
    }

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(started.ok, true)

    const first = await oneQuestions.next()
    await twoQuestions.next()
    const firstCorrect = correctById.get(first.question.id)
    assert.ok(firstCorrect !== undefined)
    assert.equal(first.wagerLockAt, first.endsAt - WAGER_LOCK_MS)

    const noStock = await request<WagerAck>(one, 'wager:submit', {
      questionIndex: 1,
      percent: 100,
    })
    assert.equal(noStock.ok, false)
    if (!noStock.ok) assert.equal(noStock.code, 'WAGER_NOT_AVAILABLE')

    const invalid = await request<WagerAck>(one, 'wager:submit', {
      questionIndex: 1,
      percent: 50 as never,
    })
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.code, 'INVALID_WAGER')

    const stale = await request<WagerAck>(one, 'wager:submit', {
      questionIndex: 2,
      percent: 10,
    })
    assert.equal(stale.ok, false)
    if (!stale.ok) assert.equal(stale.code, 'WRONG_QUESTION')

    for (const socket of [one, two]) {
      const answer: AnswerAck = await request<AnswerAck>(socket, 'answer:submit', {
        questionIndex: 1,
        answerIndex: firstCorrect,
      })
      assert.equal(answer.ok, true)
    }

    const [oneFirstReveal, twoFirstReveal] = await Promise.all([
      oneReveals.next(),
      twoReveals.next(),
    ])
    assert.equal(oneFirstReveal.yourBaseReward, pointsForLevel(1))
    assert.equal(oneFirstReveal.yourBaseDelta, pointsForLevel(1))
    assert.equal(oneFirstReveal.yourWagerPercent, 0)
    assert.equal(oneFirstReveal.yourWagerAmount, 0)
    assert.equal(oneFirstReveal.yourWagerDelta, 0)
    assert.equal(oneFirstReveal.yourDelta, pointsForLevel(1))
    assert.equal(oneFirstReveal.yourScore, 1)
    assert.equal(twoFirstReveal.yourScore, 1)

    const second = await oneQuestions.next()
    await twoQuestions.next()
    const secondCorrect = correctById.get(second.question.id)
    assert.ok(secondCorrect !== undefined)

    const oneWager = await request<WagerAck>(one, 'wager:submit', {
      questionIndex: 2,
      percent: 100,
    })
    assert.equal(oneWager.ok, true)
    if (oneWager.ok) {
      assert.equal(oneWager.percent, 100)
      assert.equal(oneWager.amount, 1)
      assert.equal(oneWager.wagerLockAt, second.wagerLockAt)
    }

    const twoWager = await request<WagerAck>(two, 'wager:submit', {
      questionIndex: 2,
      percent: 100,
    })
    assert.equal(twoWager.ok, true)
    if (twoWager.ok) {
      assert.equal(twoWager.percent, 100)
      assert.equal(twoWager.amount, 1)
    }

    // Cross the server-side lock, then verify a late change is rejected while
    // the earlier 100% wager remains active.
    await sleep(Math.max(0, second.wagerLockAt - second.serverNow) + 80)
    const late = await request<WagerAck>(one, 'wager:submit', {
      questionIndex: 2,
      percent: 10,
    })
    assert.equal(late.ok, false)
    if (!late.ok) assert.equal(late.code, 'WAGER_LOCKED')

    const oneAnswer = await request<AnswerAck>(one, 'answer:submit', {
      questionIndex: 2,
      answerIndex: secondCorrect,
    })
    const twoAnswer = await request<AnswerAck>(two, 'answer:submit', {
      questionIndex: 2,
      answerIndex: (secondCorrect + 1) % 4,
    })
    assert.equal(oneAnswer.ok, true)
    assert.equal(twoAnswer.ok, true)

    const [oneSecondReveal, twoSecondReveal] = await Promise.all([
      oneReveals.next(),
      twoReveals.next(),
    ])

    assert.equal(oneSecondReveal.yourCorrect, true)
    assert.equal(oneSecondReveal.yourBaseReward, pointsForLevel(2))
    assert.equal(oneSecondReveal.yourBaseDelta, pointsForLevel(2))
    assert.equal(oneSecondReveal.yourWagerPercent, 100)
    assert.equal(oneSecondReveal.yourWagerAmount, 1)
    assert.equal(oneSecondReveal.yourWagerDelta, 1)
    assert.equal(oneSecondReveal.yourDelta, pointsForLevel(2) + 1)
    assert.equal(oneSecondReveal.yourScore, 4)

    assert.equal(twoSecondReveal.yourCorrect, false)
    assert.equal(twoSecondReveal.yourBaseDelta, 0)
    assert.equal(twoSecondReveal.yourWagerPercent, 100)
    assert.equal(twoSecondReveal.yourWagerAmount, 1)
    assert.equal(twoSecondReveal.yourWagerDelta, -1)
    assert.equal(twoSecondReveal.yourDelta, -1)
    assert.equal(twoSecondReveal.yourScore, 0)

    const [oneFinal, twoFinal] = await Promise.all([oneEnds.next(), twoEnds.next()])
    assert.equal(oneFinal.you.score, 4)
    assert.equal(oneFinal.you.rank, 1)
    assert.equal(twoFinal.you.score, 0)
    assert.equal(twoFinal.you.rank, 2)
    assert.equal(oneFinal.leaderboard.length, 2)
    assert.equal(oneFinal.leaderboard[0].score, 4)
    assert.equal(oneFinal.leaderboard[1].score, 0)

    console.log(
      '[wager] OK: 100% amount, invalid/stale/late rejection, correct bonus, wrong penalty, zero-floor and final scores passed.',
    )
  } finally {
    for (const socket of [admin, one, two]) socket.close()
    oneQuestions.close()
    twoQuestions.close()
    oneReveals.close()
    twoReveals.close()
    oneEnds.close()
    twoEnds.close()
  }
}

run().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
