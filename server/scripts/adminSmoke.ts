/**
 * Admin controls smoke test: kick, block/unblock, non-playing enforcement and
 * a live dashboard that never receives question packets.
 *
 * Requires the existing server on 3001 with:
 *   QUESTION_COUNT=3 QUESTION_MS=1500 REVEAL_MS=300 LOSE_MS=300
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { QUESTION_COUNT, QUESTION_DURATION_MS, QUESTION_REVEAL_MS } from '../config'
import type {
  AdminActionAck,
  AdminState,
  AnswerAck,
  GameEndPayload,
  GameQuestionPayload,
  GameRevealPayload,
  LifelineAck,
  RoomCreateAck,
  RoomJoinAck,
  RoomKickedPayload,
  RoomStartAck,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const TIMEOUT_MS = 15_000

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
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
    timeout: TIMEOUT_MS,
  })
  return withTimeout(
    new Promise<Socket>((resolve, reject) => {
      socket.once('connect', () => resolve(socket))
      socket.once('connect_error', reject)
    }),
    'connect',
  )
}

function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve) => socket.emit(event, payload, resolve)),
    event,
  )
}

function waitEvent<T>(socket: Socket, event: string): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve) => socket.once(event, resolve)),
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
        event,
      ),
    close: () => socket.off(event, handler),
  }
}

async function nextAdminState(
  states: Feed<AdminState>,
  predicate: (state: AdminState) => boolean,
): Promise<AdminState> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await states.next()
    if (predicate(state)) return state
  }
  throw new Error('admin state predicate never matched')
}

async function run(): Promise<void> {
  if (QUESTION_COUNT > 3) throw new Error('Run with QUESTION_COUNT=3.')
  if (QUESTION_DURATION_MS < 1_000) {
    throw new Error('Run the admin test with QUESTION_MS >= 1000 (mid-question kick).')
  }
  if (QUESTION_REVEAL_MS > 1_000) throw new Error('Run with REVEAL_MS <= 1000.')

  const admin = await connect()
  const alice = await connect()
  const bob = await connect()
  let adminQuestionCount = 0
  admin.on('game:question', () => {
    adminQuestionCount += 1
  })

  const adminStates = feed<AdminState>(admin, 'admin:state')
  const bobQuestions = feed<GameQuestionPayload>(bob, 'game:question')
  const bobReveals = feed<GameRevealPayload>(bob, 'game:reveal')
  const bobEnds = feed<GameEndPayload>(bob, 'game:end')

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', {
      name: 'Admin Controls',
    })
    if (!created.ok) throw new Error(`create failed: ${created.code}`)
    assert.equal(created.role, 'admin')
    const code = created.code

    const aliceJoin = await request<RoomJoinAck>(alice, 'room:join', {
      code,
      name: 'Alice',
      clientId: 'client-alice-01',
    })
    if (!aliceJoin.ok) throw new Error(`Alice join failed: ${aliceJoin.code}`)

    const bobJoin = await request<RoomJoinAck>(bob, 'room:join', {
      code,
      name: 'Bob',
      clientId: 'client-bob-0001',
    })
    if (!bobJoin.ok) throw new Error(`Bob join failed: ${bobJoin.code}`)

    const afterJoins = await nextAdminState(adminStates, (state) => state.players.length === 2)
    assert.equal(afterJoins.phase, 'lobby')
    assert.equal(afterJoins.players.some((player) => player.playerId === admin.id), false)

    // ── Kick: removed, can rejoin (not blocked) ───────────────────────────
    const aliceKickedPromise = waitEvent<RoomKickedPayload>(alice, 'room:kicked')
    const afterKickPromise = nextAdminState(
      adminStates,
      (state) => state.players.length === 1,
    )
    const kicked = await request<AdminActionAck>(admin, 'admin:kick', {
      playerId: alice.id,
    })
    assert.equal(kicked.ok, true)
    const aliceKicked = await aliceKickedPromise
    assert.equal(aliceKicked.reason, 'kick')
    const afterKick = await afterKickPromise
    assert.equal(afterKick.players[0]?.playerId, bob.id)

    const aliceRejoin = await request<RoomJoinAck>(alice, 'room:join', {
      code,
      name: 'Alice',
      clientId: 'client-alice-01',
    })
    if (!aliceRejoin.ok) throw new Error(`Alice rejoin after kick failed: ${aliceRejoin.code}`)
    assert.equal(aliceRejoin.ok, true)
    await nextAdminState(adminStates, (state) => state.players.length === 2)

    // Only the admin may remove players.
    const notAdminKick = await request<AdminActionAck>(alice, 'admin:kick', {
      playerId: bob.id,
    })
    assert.equal(notAdminKick.ok, false)
    if (!notAdminKick.ok) assert.equal(notAdminKick.code, 'NOT_ADMIN')

    const selfKick = await request<AdminActionAck>(admin, 'admin:kick', {
      playerId: admin.id,
    })
    assert.equal(selfKick.ok, false)
    if (!selfKick.ok) assert.equal(selfKick.code, 'CANNOT_TARGET_ADMIN')

    // ── Block: name and browser identity both rejected until unblocked ─────
    const bobKickedPromise = waitEvent<RoomKickedPayload>(bob, 'room:kicked')
    const afterBlockPromise = nextAdminState(
      adminStates,
      (state) => state.players.length === 1 && state.blocked.length === 1,
    )
    const blocked = await request<AdminActionAck>(admin, 'admin:block', {
      playerId: bob.id,
    })
    assert.equal(blocked.ok, true)
    const bobKicked = await bobKickedPromise
    assert.equal(bobKicked.reason, 'block')
    const afterBlock = await afterBlockPromise
    const blockId = afterBlock.blocked[0]?.id
    assert.ok(blockId)
    assert.equal(afterBlock.blocked[0]?.name, 'Bob')

    const bobRejoinName = await request<RoomJoinAck>(bob, 'room:join', {
      code,
      name: 'Bob',
      clientId: 'client-bob-0001',
    })
    assert.equal(bobRejoinName.ok, false)
    if (!bobRejoinName.ok) assert.equal(bobRejoinName.code, 'PLAYER_BLOCKED')

    const bobAltSocket = await connect()
    try {
      const bobAlt = await request<RoomJoinAck>(bobAltSocket, 'room:join', {
        code,
        name: 'Bobby',
        clientId: 'client-bob-0001',
      })
      assert.equal(bobAlt.ok, false)
      if (!bobAlt.ok) assert.equal(bobAlt.code, 'PLAYER_BLOCKED')
    } finally {
      bobAltSocket.close()
    }

    const bobNewIdentity = await connect()
    try {
      const bobNew = await request<RoomJoinAck>(bobNewIdentity, 'room:join', {
        code,
        name: 'Bob',
        clientId: 'client-bob-other',
      })
      assert.equal(bobNew.ok, false)
      if (!bobNew.ok) assert.equal(bobNew.code, 'PLAYER_BLOCKED')
    } finally {
      bobNewIdentity.close()
    }

    const missingBlock = await request<AdminActionAck>(admin, 'admin:unblock', {
      blockId: 'does-not-exist',
    })
    assert.equal(missingBlock.ok, false)
    if (!missingBlock.ok) assert.equal(missingBlock.code, 'BLOCK_NOT_FOUND')

    const afterUnblockPromise = nextAdminState(
      adminStates,
      (state) => state.blocked.length === 0,
    )
    const unblocked = await request<AdminActionAck>(admin, 'admin:unblock', {
      blockId: blockId as string,
    })
    assert.equal(unblocked.ok, true)
    await afterUnblockPromise

    const bobRejoin = await request<RoomJoinAck>(bob, 'room:join', {
      code,
      name: 'Bob',
      clientId: 'client-bob-0001',
    })
    if (!bobRejoin.ok) throw new Error(`Bob rejoin after unblock failed: ${bobRejoin.code}`)
    await nextAdminState(adminStates, (state) => state.players.length === 2)

    // ── Start: admin is rejected by gameplay, players get the question ─────
    const adminStartState = nextAdminState(
      adminStates,
      (state) => state.phase === 'question',
    )
    const bobQuestionOne = bobQuestions.next()
    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(started.ok, true)
    const adminQuestion = await adminStartState
    assert.equal(adminQuestion.players.length, 2)
    assert.equal(adminQuestion.players.every((player) => player.status === 'answering'), true)

    const adminAnswer = await request<AnswerAck>(admin, 'answer:submit', {
      questionIndex: 1,
      answerIndex: 0,
    })
    assert.equal(adminAnswer.ok, false)
    if (!adminAnswer.ok) assert.equal(adminAnswer.code, 'NOT_A_PLAYER')

    const adminLifeline = await request<LifelineAck>(admin, 'lifeline:use', {
      type: 'fifty',
      questionIndex: 1,
    })
    assert.equal(adminLifeline.ok, false)
    if (!adminLifeline.ok) assert.equal(adminLifeline.code, 'NOT_A_PLAYER')

    // ── Mid-question kick: removed player cannot answer, admin board updates ─
    const aliceMidKickedPromise = waitEvent<RoomKickedPayload>(alice, 'room:kicked')
    const afterMidKickPromise = nextAdminState(
      adminStates,
      (state) => state.players.length === 1 && state.phase === 'question',
    )
    const midKick = await request<AdminActionAck>(admin, 'admin:kick', {
      playerId: alice.id,
    })
    assert.equal(midKick.ok, true)
    await aliceMidKickedPromise
    const afterMidKick = await afterMidKickPromise
    assert.equal(afterMidKick.players[0]?.playerId, bob.id)

    const aliceAnswer = await request<AnswerAck>(alice, 'answer:submit', {
      questionIndex: 1,
      answerIndex: 0,
    })
    assert.equal(aliceAnswer.ok, false)
    if (!aliceAnswer.ok) assert.equal(aliceAnswer.code, 'NOT_IN_ROOM')

    const firstQuestion = await bobQuestionOne
    for (let index = 1; index <= QUESTION_COUNT; index += 1) {
      const question = index === 1 ? firstQuestion : await bobQuestions.next()
      assert.equal(question.index, index)
      const answer = await request<AnswerAck>(bob, 'answer:submit', {
        questionIndex: index,
        answerIndex: 0,
      })
      assert.equal(answer.ok, true)
      const reveal = await bobReveals.next()
      assert.equal(reveal.index, index)
    }

    const final = await bobEnds.next()
    assert.equal(final.leaderboard.length, 1)
    assert.equal(final.leaderboard[0]?.playerId, bob.id)

    const adminFinal = await nextAdminState(
      adminStates,
      (state) => state.phase === 'final',
    )
    assert.equal(adminFinal.players.length, 1)
    assert.equal(adminFinal.players[0]?.playerId, bob.id)
    assert.equal(adminFinal.players[0]?.status, 'finished')
    assert.equal(adminQuestionCount, 0, 'admin must never receive game:question')

    console.info(
      '[admin] kick, block/unblock, non-admin rejection, non-playing guard, mid-question removal and safe dashboard passed',
    )
  } finally {
    adminStates.close()
    bobQuestions.close()
    bobReveals.close()
    bobEnds.close()
    admin.close()
    alice.close()
    bob.close()
  }
}

withTimeout(run(), 'admin smoke test', 90_000).then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[admin] failed:', error)
    process.exit(1)
  },
)
