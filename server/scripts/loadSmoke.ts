/**
 * 40-player load smoke test: one non-playing admin + 40 players, full match.
 *
 * Requires the existing server on 3001 with fast timings. Use 3 questions for a
 * quick smoke run, or 15 for a full-length load run:
 *   $env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'
 *   $env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; npm run test:load
 *   $env:QUESTION_COUNT='15'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; npm run test:load
 */
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { io, type Socket } from 'socket.io-client'
import { MAX_PLAYERS } from '../../src/config/multiplayerConfig'
import { QUESTION_COUNT, QUESTION_DURATION_MS, QUESTION_REVEAL_MS } from '../config'
import type {
  AdminState,
  AnswerAck,
  GameEndPayload,
  GameQuestionPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomStartAck,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const CONNECT_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 10_000
const EVENT_TIMEOUT_MS = 20_000
const TEST_TIMEOUT_MS = 120_000

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

interface Received<T> {
  value: T
  receivedAt: number
}

interface Feed<T> {
  next: () => Promise<Received<T>>
  close: () => void
}

function feed<T>(socket: Socket, event: string): Feed<T> {
  const queue: Received<T>[] = []
  let waiter: ((value: Received<T>) => void) | null = null
  const handler = (value: T) => {
    const received: Received<T> = { value, receivedAt: Date.now() }
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(received)
      return
    }
    queue.push(received)
  }
  socket.on(event, handler)
  return {
    next: () =>
      withTimeout(
        new Promise<Received<T>>((resolve) => {
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

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  )
  return sorted[index] ?? 0
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`
}

async function run(): Promise<void> {
  if (QUESTION_COUNT > 15) throw new Error('Run with QUESTION_COUNT=3 or 15.')
  if (QUESTION_DURATION_MS > 1_000 || QUESTION_REVEAL_MS > 1_000) {
    throw new Error('Run server with QUESTION_MS=300 and REVEAL_MS=300.')
  }

  const admin = await connect()
  let adminQuestionCount = 0
  let adminRevealCount = 0
  let adminEndCount = 0
  admin.on('game:question', () => {
    adminQuestionCount += 1
  })
  admin.on('game:reveal', () => {
    adminRevealCount += 1
  })
  admin.on('game:end', () => {
    adminEndCount += 1
  })
  const adminStateFeed = feed<AdminState>(admin, 'admin:state')
  const players: Socket[] = []
  const questionFeeds: Feed<GameQuestionPayload>[] = []
  const endFeeds: Feed<GameEndPayload>[] = []
  const broadcastLatencies: number[] = []
  const answerAckLatencies: number[] = []

  try {
    for (let index = 0; index < MAX_PLAYERS; index += 1) {
      const socket = await connect()
      players.push(socket)
      questionFeeds.push(feed<GameQuestionPayload>(socket, 'game:question'))
      endFeeds.push(feed<GameEndPayload>(socket, 'game:end'))
    }

    const created = await request<RoomCreateAck>(admin, 'room:create', { name: 'Admin 40' })
    if (!created.ok) throw new Error(created.message)
    assert.equal(created.role, 'admin')
    assert.equal(created.room.players.length, 0)

    const joins = await Promise.all(
      players.map((socket, index) =>
        request<RoomJoinAck>(socket, 'room:join', {
          code: created.code,
          name: `Bot ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    )
    assert.equal(joins.every((join) => join.ok), true)

    // A 41st player must be rejected without disturbing the full room.
    const overflow = await connect()
    try {
      const overflowJoin = await request<RoomJoinAck>(overflow, 'room:join', {
        code: created.code,
        name: 'Bot 41',
      })
      assert.equal(overflowJoin.ok, false)
      if (!overflowJoin.ok) assert.equal(overflowJoin.code, 'ROOM_FULL')
    } finally {
      overflow.close()
    }

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(started.ok, true)

    for (let questionIndex = 1; questionIndex <= QUESTION_COUNT; questionIndex += 1) {
      const received = await Promise.all(questionFeeds.map((question) => question.next()))
      const packets = received.map((packet) => packet.value)
      assert.equal(packets.every((packet) => packet.index === questionIndex), true)
      assert.equal(new Set(packets.map((packet) => packet.endsAt)).size, 1)

      // `serverNow` is stamped immediately before fan-out. The difference is
      // therefore the actual broadcast latency for this question packet.
      for (let index = 0; index < received.length; index += 1) {
        const packet = packets[index]
        const arrival = received[index]
        if (packet && arrival) {
          broadcastLatencies.push(arrival.receivedAt - packet.serverNow)
        }
      }

      // Every bot answers every question. Index 0 is intentional: the test is
      // about broadcast/ack load and the final board, not answer correctness.
      const acks = await Promise.all(
        players.map(async (socket) => {
          const startedAt = performance.now()
          const ack = await request<AnswerAck>(socket, 'answer:submit', {
            questionIndex,
            answerIndex: 0,
          })
          answerAckLatencies.push(performance.now() - startedAt)
          return ack
        }),
      )
      assert.equal(acks.filter((ack) => ack.ok).length, MAX_PLAYERS)
    }

    assert.equal(adminQuestionCount, 0, 'admin must never receive questions')
    assert.equal(adminRevealCount, 0, 'admin must never receive reveals')
    assert.equal(adminEndCount, 0, 'admin must never receive final player payloads')

    const receivedFinals = await Promise.all(endFeeds.map((end) => end.next()))
    assert.equal(receivedFinals.length, MAX_PLAYERS)

    let adminFinalState: AdminState | null = null
    for (;;) {
      const { value: state } = await adminStateFeed.next()
      if (state.phase !== 'final') continue
      adminFinalState = state
      break
    }
    assert.ok(adminFinalState)
    assert.equal(adminFinalState.players.length, MAX_PLAYERS)
    assert.equal(adminFinalState.questionTotal, QUESTION_COUNT)
    assert.equal(
      adminFinalState.players.some((player) => player.playerId === admin.id),
      false,
      'admin must not appear on its own dashboard',
    )

    for (const { value: result } of receivedFinals) {
      assert.equal(result.leaderboard.length, MAX_PLAYERS)
      assert.equal(new Set(result.leaderboard.map((entry) => entry.playerId)).size, MAX_PLAYERS)
      assert.equal(result.total, QUESTION_COUNT)
      assert.equal(
        result.leaderboard.some((entry) => entry.playerId === admin.id),
        false,
        'admin must not appear on the player final board',
      )
    }

    const broadcastP50 = percentile(broadcastLatencies, 0.5)
    const broadcastP95 = percentile(broadcastLatencies, 0.95)
    const broadcastMax = Math.max(...broadcastLatencies)
    const ackP95 = percentile(answerAckLatencies, 0.95)
    assert.ok(
      broadcastP95 < 300,
      `broadcast p95 must be <300ms, got ${formatMs(broadcastP95)}`,
    )

    console.info(
      `[load] 1 admin + ${MAX_PLAYERS} players, ${QUESTION_COUNT} questions, final board and 41st-player rejection passed`,
    )
    console.info(
      `[load] question broadcast n=${broadcastLatencies.length} p50=${formatMs(broadcastP50)} p95=${formatMs(broadcastP95)} max=${formatMs(broadcastMax)}; answer ack p95=${formatMs(ackP95)}`,
    )
  } finally {
    questionFeeds.forEach((question) => question.close())
    endFeeds.forEach((end) => end.close())
    adminStateFeed.close()
    players.forEach((socket) => socket.close())
    admin.close()
  }
}

withTimeout(run(), TEST_TIMEOUT_MS, '40-player load smoke test').then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[load] failed:', error)
    process.exit(1)
  },
)
