/**
 * Full multiplayer flow smoke test with a non-playing admin:
 * scoring, reveal, lifelines, final, rematch and admin visibility.
 *
 * Run against the existing 3001 server (no extra port), in fast mode:
 *   $env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; npm run dev:full
 *   $env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; npm run test:flow
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import rawQuestions from '../../src/data/questions.json'
import { pointsForLevel } from '../../src/config/multiplayerConfig'
import {
  LOSE_DURATION_MS,
  QUESTION_COUNT,
  QUESTION_DURATION_MS,
  QUESTION_REVEAL_MS,
} from '../config'
import type { Question } from '../../src/types'
import type {
  AdminState,
  AnswerAck,
  GameEndPayload,
  GameQuestionPayload,
  GameRevealPayload,
  LifelineAck,
  RoomCreateAck,
  RoomJoinAck,
  RoomRematchAck,
  RoomStartAck,
  RoomState,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const CONNECT_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
const EVENT_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 90_000

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

async function nextAdminState(
  states: Feed<AdminState>,
  predicate: (state: AdminState) => boolean,
): Promise<AdminState> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await states.next()
    if (predicate(state)) return state
  }
  throw new Error('admin state predicate never matched')
}

function assertQuestionPublic(question: GameQuestionPayload): void {
  assert.equal(question.question.answers.length, 4)
  assert.equal('correct' in question.question, false)
  assert.equal('explanation' in question.question, false)
  assert.equal(JSON.stringify(question.question).includes('"correct"'), false)
  assert.equal(JSON.stringify(question.question).includes('"explanation"'), false)
}

function removedContainsCorrect(removed: number[], correct: number): boolean {
  return removed.includes(correct)
}

async function run(): Promise<void> {
  if (QUESTION_COUNT > 3) {
    throw new Error('Run with QUESTION_COUNT=3 for the fast flow test.')
  }
  if (QUESTION_DURATION_MS > 1_000 || QUESTION_REVEAL_MS > 1_000) {
    throw new Error(
      'Run the server with QUESTION_MS=300 and REVEAL_MS=300 (same env for this script).',
    )
  }

  const admin = await connect()
  const playerOne = await connect()
  const playerTwo = await connect()
  let adminQuestionCount = 0
  admin.on('game:question', () => {
    adminQuestionCount += 1
  })

  const oneQuestions = feed<GameQuestionPayload>(playerOne, 'game:question')
  const twoQuestions = feed<GameQuestionPayload>(playerTwo, 'game:question')
  const oneReveals = feed<GameRevealPayload>(playerOne, 'game:reveal')
  const twoReveals = feed<GameRevealPayload>(playerTwo, 'game:reveal')
  const oneEnds = feed<GameEndPayload>(playerOne, 'game:end')
  const twoEnds = feed<GameEndPayload>(playerTwo, 'game:end')
  const oneRooms = feed<RoomState>(playerOne, 'room:state')
  const adminStates = feed<AdminState>(admin, 'admin:state')

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', { name: 'Admin Flow' })
    if (!created.ok) throw new Error(created.message)
    assert.equal(created.role, 'admin')
    assert.equal(created.room.players.length, 0)

    for (const [socket, name] of [
      [playerOne, 'Player One'],
      [playerTwo, 'Player Two'],
    ] as const) {
      const joined: RoomJoinAck = await request<RoomJoinAck>(socket, 'room:join', {
        code: created.code,
        name,
      })
      if (!joined.ok) throw new Error(joined.message)
      assert.equal(joined.role, 'player')
    }

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(started.ok, true)

    let oneScore = 0
    let oneCorrectCount = 0
    let twoScore = 0
    let twoCorrectCount = 0

    for (let index = 1; index <= QUESTION_COUNT; index += 1) {
      const [oneQuestion, twoQuestion] = await Promise.all([
        oneQuestions.next(),
        twoQuestions.next(),
      ])
      assert.equal(oneQuestion.index, index)
      assert.equal(twoQuestion.index, index)
      assert.equal(oneQuestion.endsAt, twoQuestion.endsAt)
      assert.equal(oneQuestion.question.id, twoQuestion.question.id)
      assertQuestionPublic(oneQuestion)

      const correct = correctById.get(oneQuestion.question.id)
      assert.ok(correct !== undefined)

      if (index === 1) {
        const fifty = await request<LifelineAck>(playerOne, 'lifeline:use', {
          type: 'fifty',
          questionIndex: index,
        })
        assert.equal(fifty.ok, true)
        if (!fifty.ok || fifty.result.type !== 'fifty') throw new Error('fifty failed')
        assert.equal(fifty.result.removed.length, 2)
        assert.equal(removedContainsCorrect(fifty.result.removed, correct), false)
        assert.equal(JSON.stringify(fifty).includes('correct'), false)
        assert.equal(new Set(fifty.result.removed).size, 2)

        const reuse = await request<LifelineAck>(playerOne, 'lifeline:use', {
          type: 'fifty',
          questionIndex: index,
        })
        assert.equal(reuse.ok, false)
        if (!reuse.ok) assert.equal(reuse.code, 'LIFELINE_ALREADY_USED')

        const stale = await request<LifelineAck>(playerOne, 'lifeline:use', {
          type: 'phone',
          questionIndex: index + 1,
        })
        assert.equal(stale.ok, false)
        if (!stale.ok) assert.equal(stale.code, 'WRONG_QUESTION')

        const removedAnswer = await request<AnswerAck>(playerOne, 'answer:submit', {
          questionIndex: index,
          answerIndex: fifty.result.removed[0],
        })
        assert.equal(removedAnswer.ok, false)
        if (!removedAnswer.ok) assert.equal(removedAnswer.code, 'ANSWER_REMOVED')

        const audience = await request<LifelineAck>(playerTwo, 'lifeline:use', {
          type: 'audience',
          questionIndex: index,
        })
        assert.equal(audience.ok, true)
        if (!audience.ok || audience.result.type !== 'audience') {
          throw new Error('audience failed')
        }
        assert.equal(
          audience.result.percentages.reduce((sum, value) => sum + value, 0),
          100,
        )
        assert.equal(
          audience.result.displayWinnerId,
          audience.result.percentages.indexOf(Math.max(...audience.result.percentages)),
        )
        assert.equal(JSON.stringify(audience).includes('correctIndex'), false)
        assert.equal(JSON.stringify(audience).includes('isCorrect'), false)
      }

      if (index === 2) {
        const phone = await request<LifelineAck>(playerOne, 'lifeline:use', {
          type: 'phone',
          questionIndex: index,
        })
        assert.equal(phone.ok, true)
        if (!phone.ok || phone.result.type !== 'phone') throw new Error('phone failed')
        assert.ok(phone.result.suggestedIndex >= 0 && phone.result.suggestedIndex <= 3)
        assert.notEqual(phone.result.suggestedIndex, correct)
        assert.equal(
          phone.result.suggestedLetter,
          ['A', 'B', 'C', 'D'][phone.result.suggestedIndex],
        )
        assert.equal(
          phone.result.suggestedText,
          oneQuestion.question.answers[phone.result.suggestedIndex],
        )
        assert.equal(JSON.stringify(phone).includes('isCorrect'), false)

        const phoneReuse = await request<LifelineAck>(playerOne, 'lifeline:use', {
          type: 'phone',
          questionIndex: index,
        })
        assert.equal(phoneReuse.ok, false)
        if (!phoneReuse.ok) assert.equal(phoneReuse.code, 'LIFELINE_ALREADY_USED')

        const mc = await request<LifelineAck>(playerTwo, 'lifeline:use', {
          type: 'mc',
          questionIndex: index,
        })
        assert.equal(mc.ok, true)
        if (!mc.ok || mc.result.type !== 'mc') throw new Error('mc failed')
        assert.notEqual(mc.result.suggestedIndex, correct)
        assert.equal(
          mc.result.suggestedLetter,
          ['A', 'B', 'C', 'D'][mc.result.suggestedIndex],
        )
        assert.equal(JSON.stringify(mc).includes('isCorrect'), false)
      }

      const oneAnswer = await request<AnswerAck>(playerOne, 'answer:submit', {
        questionIndex: index,
        answerIndex: correct,
      })
      assert.equal(oneAnswer.ok, true)

      const duplicate = await request<AnswerAck>(playerOne, 'answer:submit', {
        questionIndex: index,
        answerIndex: correct,
      })
      assert.equal(duplicate.ok, false)
      if (!duplicate.ok) assert.equal(duplicate.code, 'ALREADY_ANSWERED')

      if (index === 1) {
        const tooLateForLifeline = await request<LifelineAck>(
          playerOne,
          'lifeline:use',
          { type: 'phone', questionIndex: index },
        )
        assert.equal(tooLateForLifeline.ok, false)
        if (!tooLateForLifeline.ok) {
          assert.equal(tooLateForLifeline.code, 'ALREADY_ANSWERED')
        }

        const twoAnswer = await request<AnswerAck>(playerTwo, 'answer:submit', {
          questionIndex: index,
          answerIndex: (correct + 1) % 4,
        })
        assert.equal(twoAnswer.ok, true)
      }

      const adminAnswered = await nextAdminState(
        adminStates,
        (state) => state.phase === 'question' && state.players.some((p) => p.status === 'answered'),
      )
      assert.equal(adminAnswered.players.find((p) => p.playerId === playerOne.id)?.status, 'answered')

      const [oneReveal, twoReveal] = await Promise.all([
        oneReveals.next(),
        twoReveals.next(),
      ])
      assert.equal(oneReveal.index, index)
      assert.equal(twoReveal.index, index)
      assert.equal(oneReveal.correctIndex, correct)
      assert.equal(oneReveal.explanation.length > 0, true)
      assert.equal(oneReveal.yourCorrect, true)
      assert.equal(oneReveal.yourDelta, pointsForLevel(index))
      assert.equal(oneReveal.yourAnswer, correct)
      oneScore += pointsForLevel(index)
      oneCorrectCount += 1
      assert.equal(oneReveal.yourScore, oneScore)
      assert.equal(oneReveal.yourCorrectCount, oneCorrectCount)
      assert.equal(oneReveal.yourRank, 1)

      if (index === 1) {
        assert.equal(twoReveal.yourCorrect, false)
        assert.equal(twoReveal.yourDelta, 0)
        assert.equal(twoReveal.yourScore, 0)
      } else {
        assert.equal(twoReveal.yourAnswer, null)
        assert.equal(twoReveal.yourCorrect, false)
        assert.equal(twoReveal.yourScore, twoScore)
      }

      const totalCounts = oneReveal.distribution.counts.reduce(
        (sum, value) => sum + value,
        0,
      )
      assert.equal(totalCounts + oneReveal.distribution.noAnswer, 2)
      assert.equal(oneReveal.leaderboard.length, 2)
      assert.equal(oneReveal.leaderboard[0]?.playerId, playerOne.id)
      assert.equal(oneReveal.leaderboard[0]?.score, oneScore)
      assert.equal(oneReveal.totalPlayers, 2)

      const adminReveal = await nextAdminState(
        adminStates,
        (state) => state.phase === 'reveal' && state.questionIndex === index,
      )
      assert.equal(
        adminReveal.players.find((p) => p.playerId === playerOne.id)?.status,
        'correct',
      )
      assert.equal(
        adminReveal.players.find((p) => p.playerId === playerTwo.id)?.status,
        index === 1 ? 'wrong' : 'timeout',
      )
    }

    assert.equal(adminQuestionCount, 0, 'admin must never receive game:question')

    const [oneEnd, twoEnd] = await Promise.all([oneEnds.next(), twoEnds.next()])
    assert.equal(oneEnd.total, QUESTION_COUNT)
    assert.equal(oneEnd.leaderboard.length, 2)
    assert.equal(oneEnd.you.rank, 1)
    assert.equal(oneEnd.you.score, oneScore)
    assert.equal(oneEnd.you.correct, oneCorrectCount)
    assert.equal(oneEnd.loseDurationMs, LOSE_DURATION_MS)
    assert.equal(twoEnd.you.rank, 2)
    assert.equal(twoEnd.you.score, twoScore)
    assert.equal(twoEnd.you.correct, twoCorrectCount)
    assert.equal(oneEnd.leaderboard[0]?.playerId, playerOne.id)
    assert.equal(oneEnd.leaderboard[0]?.rank, 1)
    assert.equal(oneEnd.leaderboard[1]?.playerId, playerTwo.id)
    assert.equal(oneEnd.leaderboard[1]?.rank, 2)

    const adminFinal = await nextAdminState(adminStates, (state) => state.phase === 'final')
    assert.equal(adminFinal.players.length, 2)
    assert.equal(adminFinal.players[0]?.playerId, playerOne.id)
    assert.equal(adminFinal.players[1]?.playerId, playerTwo.id)
    assert.equal(adminFinal.players.every((p) => p.status === 'finished'), true)

    let finalState: RoomState | null = null
    for (let attempt = 0; attempt < 12 && !finalState; attempt += 1) {
      const state = await oneRooms.next()
      if (state.status === 'final') finalState = state
    }
    assert.ok(finalState)
    assert.equal(finalState.players.length, 2)

    const leaderboardResponse = await fetch(`${SERVER_URL}/api/leaderboard?limit=100`)
    assert.equal(leaderboardResponse.ok, true)
    const leaderboard = (await leaderboardResponse.json()) as {
      ok: boolean
      entries: Array<{ name: string; score: number }>
      totalMatches: number
    }
    assert.equal(leaderboard.ok, true)
    assert.ok(leaderboard.totalMatches >= 1)
    assert.ok(
      leaderboard.entries.some(
        (entry) => entry.name === 'Player One' && entry.score >= oneScore,
      ),
      'final result must be persisted in the all-time board',
    )
    assert.equal(
      leaderboard.entries.some((entry) => entry.name === 'Admin Flow'),
      false,
      'admin must never appear in all-time results',
    )

    const lobbyAfterRematch = nextAdminState(
      adminStates,
      (state) => state.phase === 'lobby',
    )
    const rematch = await request<RoomRematchAck>(admin, 'room:rematch', {})
    assert.equal(rematch.ok, true)
    const lobbyAdmin = await lobbyAfterRematch
    assert.equal(lobbyAdmin.players.length, 2)
    assert.equal(lobbyAdmin.players.every((player) => player.score === 0), true)

    let lobby: RoomState | null = null
    for (let attempt = 0; attempt < 6 && !lobby; attempt += 1) {
      const state = await oneRooms.next()
      if (state.status === 'lobby') lobby = state
    }
    assert.ok(lobby)
    assert.equal(lobby.players.length, 2)
    assert.equal(lobby.players.every((player) => player.score === 0), true)

    const restarted = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(restarted.ok, true)
    const [restartedQuestion] = await Promise.all([
      oneQuestions.next(),
      twoQuestions.next(),
    ])
    assert.equal(restartedQuestion.index, 1)
    assert.equal(restartedQuestion.total, QUESTION_COUNT)

    console.info(
      `[flow] ${QUESTION_COUNT} questions, admin dashboard, scoring, reveal, 4 lifelines, final and rematch passed`,
    )
  } finally {
    oneQuestions.close()
    twoQuestions.close()
    oneReveals.close()
    twoReveals.close()
    oneEnds.close()
    twoEnds.close()
    oneRooms.close()
    adminStates.close()
    admin.close()
    playerOne.close()
    playerTwo.close()
  }
}

withTimeout(run(), TEST_TIMEOUT_MS, 'game flow smoke test').then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[flow] failed:', error)
    process.exit(1)
  },
)
