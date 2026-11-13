/**
 * Reconnect/F5 resume smoke test for admin and player roles.
 *
 * Requires a server started with:
 *   QUESTION_COUNT=3 QUESTION_MS=3000 REVEAL_MS=800 LOSE_MS=400
 *   DISCONNECT_GRACE_MS=8000
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import rawQuestions from '../../src/data/questions.json'
import type { Question } from '../../src/types'
import type {
  AdminState,
  AnswerAck,
  GameEndPayload,
  GameQuestionPayload,
  GameRevealPayload,
  GameSnapshot,
  LifelineAck,
  RoomClosedPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomResumeAck,
  RoomStartAck,
  RoomState,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const TIMEOUT_MS = 15_000
const GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS ?? 8_000)

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    )
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

function waitState(
  socket: Socket,
  predicate: (state: RoomState) => boolean,
): Promise<RoomState> {
  return withTimeout(
    new Promise<RoomState>((resolve) => {
      const onState = (state: RoomState) => {
        if (!predicate(state)) return
        socket.off('room:state', onState)
        resolve(state)
      }
      socket.on('room:state', onState)
    }),
    'room:state',
  )
}

function waitAdminState(
  socket: Socket,
  predicate: (state: AdminState) => boolean,
): Promise<AdminState> {
  return withTimeout(
    new Promise<AdminState>((resolve) => {
      const onState = (state: AdminState) => {
        if (!predicate(state)) return
        socket.off('admin:state', onState)
        resolve(state)
      }
      socket.on('admin:state', onState)
    }),
    'admin:state',
  )
}

async function resume(
  socket: Socket,
  token: string,
): Promise<Extract<RoomResumeAck, { ok: true }>> {
  const result = await request<RoomResumeAck>(socket, 'room:resume', { token })
  if (!result.ok) throw new Error(`resume failed: ${result.code} ${result.message}`)
  return result
}

async function main(): Promise<void> {
  assert.equal(process.env.QUESTION_COUNT, '3', 'Start server/test with QUESTION_COUNT=3')
  assert.ok(GRACE_MS >= 5_000, 'Use DISCONNECT_GRACE_MS >= 5000 for the reconnect test')

  let admin = await connect()
  const player = await connect()
  let filler: Socket | null = null
  let resumedPlayer: Socket | null = null
  let adminToken = ''
  let playerToken = ''
  let adminQuestions = 0
  admin.on('game:question', () => {
    adminQuestions += 1
  })

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', {
      name: 'Admin Resume',
    })
    if (!created.ok) throw new Error(`create failed: ${created.code}`)
    adminToken = created.resumeToken
    const code = created.code
    const adminId = created.playerId

    const joined = await request<RoomJoinAck>(player, 'room:join', {
      code,
      name: 'Player Resume',
    })
    if (!joined.ok) throw new Error(`join failed: ${joined.code}`)
    playerToken = joined.resumeToken
    const playerId = joined.playerId

    // ── Lobby: player sees the admin disconnect; admin resume is dashboard-only ──
    const adminDisconnected = waitState(
      player,
      (state) => state.admin.connected === false,
    )
    admin.close()
    await adminDisconnected

    admin = await connect()
    const lobbyResume = await resume(admin, adminToken)
    adminToken = lobbyResume.resumeToken
    assert.equal(lobbyResume.role, 'admin')
    assert.equal(lobbyResume.playerId, adminId)
    assert.equal(lobbyResume.room.hostId, adminId)
    assert.equal(lobbyResume.room.status, 'lobby')
    assert.equal(lobbyResume.snapshot.phase, 'admin')
    const lobbyAdmin = lobbyResume.adminState
    assert.ok(lobbyAdmin)
    if (lobbyAdmin) {
      assert.equal(lobbyAdmin.phase, 'lobby')
      assert.equal(lobbyAdmin.players.length, 1)
      assert.equal(lobbyAdmin.players[0]?.playerId, playerId)
    }
    assert.notEqual(adminToken, created.resumeToken, 'resume token must rotate')

    // The room needs 2 real players to start; this filler leaves right after
    // the start so the rest of the assertions can focus on one player.
    const fillerSocket = await connect()
    filler = fillerSocket
    const fillerJoin = await request<RoomJoinAck>(fillerSocket, 'room:join', {
      code,
      name: 'Filler Resume',
    })
    if (!fillerJoin.ok) throw new Error(`filler join failed: ${fillerJoin.code}`)

    // ── Start: only the player receives the question; admin gets BXH state ──
    const playerPlaying = waitState(player, (state) => state.status === 'playing')
    const playerQuestion = waitEvent<GameQuestionPayload>(player, 'game:question')
    const adminQuestion = waitAdminState(admin, (state) => state.phase === 'question')
    const started = await request<RoomStartAck>(admin, 'room:start', {})
    if (!started.ok) {
      throw new Error(`admin start failed: ${started.code} ${started.message}`)
    }

    const playingState = await playerPlaying
    assert.equal(playingState.players.length, 2)

    const fillerLeave = await request<{ ok: boolean }>(fillerSocket, 'room:leave', {})
    assert.equal(fillerLeave.ok, true)
    fillerSocket.close()
    filler = null

    const [questionForPlayer, questionAdmin] = await Promise.all([
      playerQuestion,
      adminQuestion,
    ])
    assert.equal(questionAdmin.players[0]?.status, 'answering')
    assert.equal(adminQuestions, 0, 'admin must never receive game:question')

    const bankQuestion = (rawQuestions as Question[]).find(
      (question) => question.id === questionForPlayer.question.id,
    )
    assert.ok(bankQuestion, 'question must exist in server bank')

    const lifeline = await request<LifelineAck>(player, 'lifeline:use', {
      type: 'fifty',
      questionIndex: questionForPlayer.index,
    })
    assert.equal(lifeline.ok, true)
    if (lifeline.ok && lifeline.result.type === 'fifty') {
      assert.equal(lifeline.result.removed.length, 2)
      assert.equal(lifeline.result.removed.includes(bankQuestion.correct), false)
    }

    const answerAck = await request<AnswerAck>(player, 'answer:submit', {
      questionIndex: questionForPlayer.index,
      answerIndex: bankQuestion.correct,
    })
    assert.equal(answerAck.ok, true)

    // ── Player F5: answer/lifelines survive; admin sees "answered" ──────────
    const playerGone = waitAdminState(
      admin,
      (state) => state.players[0]?.connected === false,
    )
    player.close()
    await playerGone

    const resumedSocket = await connect()
    resumedPlayer = resumedSocket
    const playingResume = await resume(resumedSocket, playerToken)
    playerToken = playingResume.resumeToken
    assert.equal(playingResume.role, 'player')
    assert.equal(playingResume.snapshot.phase, 'question')
    const questionSnapshot = playingResume.snapshot as Extract<
      GameSnapshot,
      { phase: 'question' }
    >
    assert.equal(questionSnapshot.answered, true)
    assert.equal(questionSnapshot.selectedAnswer, bankQuestion.correct)
    assert.equal(questionSnapshot.lifelines.fifty, true)
    assert.equal(questionSnapshot.removedAnswers.length, 2)
    assert.equal(questionSnapshot.question.index, questionForPlayer.index)

    const answeredAdmin = await waitAdminState(
      admin,
      (state) => state.players[0]?.status === 'answered',
    )
    assert.equal(answeredAdmin.phase, 'question')

    // ── Reveal: admin resume snapshots the safe reveal status ──────────────
    const adminReveal = waitAdminState(admin, (state) => state.phase === 'reveal')
    const reveal = await waitEvent<GameRevealPayload>(resumedSocket, 'game:reveal')
    assert.equal(reveal.yourCorrect, true)
    assert.equal(reveal.yourDelta, 1)
    assert.equal(reveal.loseDurationMs, 400)

    const revealAdmin = await adminReveal
    assert.equal(revealAdmin.players[0]?.status, 'correct')

    const adminGone = waitState(
      resumedSocket,
      (state) => state.admin.connected === false,
    )
    admin.close()
    await adminGone

    admin = await connect()
    const revealResume = await resume(admin, adminToken)
    adminToken = revealResume.resumeToken
    assert.equal(revealResume.role, 'admin')
    assert.equal(revealResume.snapshot.phase, 'admin')
    const revealSnapshot = revealResume.adminState
    assert.ok(revealSnapshot)
    if (revealSnapshot) {
      assert.equal(revealSnapshot.phase, 'reveal')
      assert.equal(revealSnapshot.players[0]?.status, 'correct')
      assert.equal(revealSnapshot.players[0]?.score, 1)
    }

    // ── Final: admin gets a final dashboard and can rematch ───────────────
    const adminFinalPromise = waitAdminState(admin, (state) => state.phase === 'final')
    const final = await waitEvent<GameEndPayload>(resumedSocket, 'game:end')
    assert.equal(final.total, 3)
    assert.equal(final.you.score, 1)

    const adminFinal = await adminFinalPromise
    assert.equal(adminFinal.players[0]?.status, 'finished')
    assert.equal(adminFinal.players[0]?.score, 1)

    const adminGoneAgain = waitState(
      resumedSocket,
      (state) => state.admin.connected === false,
    )
    admin.close()
    await adminGoneAgain

    admin = await connect()
    const finalResume = await resume(admin, adminToken)
    adminToken = finalResume.resumeToken
    assert.equal(finalResume.snapshot.phase, 'admin')
    const finalDashboard = finalResume.adminState
    assert.ok(finalDashboard)
    if (finalDashboard) assert.equal(finalDashboard.phase, 'final')

    const lobbyAfterRematchPromise = waitAdminState(
      admin,
      (state) => state.phase === 'lobby',
    )
    const rematchAck = await request<{ ok: boolean }>(admin, 'room:rematch', {})
    assert.equal(rematchAck.ok, true)
    const lobbyAfterRematch = await lobbyAfterRematchPromise
    assert.equal(lobbyAfterRematch.players[0]?.score, 0)
    assert.equal(lobbyAfterRematch.players[0]?.correct, 0)

    // ── Invalid/expired tokens ─────────────────────────────────────────────
    const invalidSocket = await connect()
    const invalid = await request<RoomResumeAck>(invalidSocket, 'room:resume', {
      token: 'not-a-real-token-value',
    })
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.code, 'INVALID_RESUME_TOKEN')
    invalidSocket.close()

    const leaveAck = await request<{ ok: boolean }>(resumedSocket, 'room:leave', {})
    assert.equal(leaveAck.ok, true)
    const expiredSocket = await connect()
    const expired = await request<RoomResumeAck>(expiredSocket, 'room:resume', {
      token: playerToken,
    })
    assert.equal(expired.ok, false)
    if (!expired.ok) assert.equal(expired.code, 'INVALID_RESUME_TOKEN')
    expiredSocket.close()

    // ── Player grace expiry frees the seat; room survives with its admin ───
    const graceAdmin = await connect()
    const gracePlayer = await connect()
    try {
      const room2 = await request<RoomCreateAck>(graceAdmin, 'room:create', {
        name: 'Admin Grace',
      })
      if (!room2.ok) throw new Error(`second create failed: ${room2.code}`)
      const joined2 = await request<RoomJoinAck>(gracePlayer, 'room:join', {
        code: room2.code,
        name: 'Player Grace',
      })
      if (!joined2.ok) throw new Error(`second join failed: ${joined2.code}`)

      const afterExpiry = waitAdminState(
        graceAdmin,
        (state) => state.players.length === 0,
      )
      gracePlayer.close()
      const state = await afterExpiry
      assert.equal(state.admin.id, room2.playerId)
      assert.equal(state.status, 'lobby')
    } finally {
      graceAdmin.close()
      gracePlayer.close()
    }

    // ── Admin grace expiry closes the room; the role is never transferred ──
    const timeoutAdmin = await connect()
    const timeoutPlayer = await connect()
    try {
      const room3 = await request<RoomCreateAck>(timeoutAdmin, 'room:create', {
        name: 'Admin Timeout',
      })
      if (!room3.ok) throw new Error(`third create failed: ${room3.code}`)
      const joined3 = await request<RoomJoinAck>(timeoutPlayer, 'room:join', {
        code: room3.code,
        name: 'Player Timeout',
      })
      if (!joined3.ok) throw new Error(`third join failed: ${joined3.code}`)

      const closed = waitEvent<RoomClosedPayload>(timeoutPlayer, 'room:closed')
      timeoutAdmin.close()
      const payload = await closed
      assert.equal(payload.reason, 'admin_timeout')
      assert.match(payload.message, /quản trò/i)
    } finally {
      timeoutAdmin.close()
      timeoutPlayer.close()
    }

    console.info(
      '[resume] admin/player lobby-question-reveal-final resume, safe admin snapshot, rotated tokens, invalid tokens, player grace expiry and admin-timeout room close passed',
    )
  } finally {
    admin.close()
    player.close()
    filler?.close()
    resumedPlayer?.close()
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[resume] failed:', error instanceof Error ? error.stack : error)
    process.exit(1)
  },
)
