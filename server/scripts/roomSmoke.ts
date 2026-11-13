/**
 * End-to-end smoke test for room lifecycle with a non-playing admin.
 *
 * Requires the server to be running. Set SERVER_URL to exercise the Vite proxy
 * (`http://localhost:5173`) instead of the server directly.
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { MAX_PLAYERS } from '../../src/config/multiplayerConfig'
import { RoomManager } from '../rooms'
import type {
  AdminState,
  RoomClosedPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomLeaveAck,
  RoomStartAck,
  RoomState,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const TIMEOUT_MS = 10_000
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

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
  ).catch((error: unknown) => {
    socket.close()
    throw error
  })
}

function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve, reject) => {
      socket.timeout(TIMEOUT_MS).emit(
        event,
        payload,
        (error: Error | null, result: T) => {
          if (error) reject(error)
          else resolve(result)
        },
      )
    }),
    event,
  )
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve) => socket.once(event, resolve)),
    event,
  )
}

function waitForState(
  socket: Socket,
  predicate: (state: RoomState) => boolean,
): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('room:state', onState)
      reject(new Error('room:state timed out'))
    }, TIMEOUT_MS)

    function onState(state: RoomState): void {
      if (!predicate(state)) return
      clearTimeout(timer)
      socket.off('room:state', onState)
      resolve(state)
    }

    socket.on('room:state', onState)
  })
}

function waitForAdminState(
  socket: Socket,
  predicate: (state: AdminState) => boolean,
): Promise<AdminState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('admin:state', onState)
      reject(new Error('admin:state timed out'))
    }, TIMEOUT_MS)

    function onState(state: AdminState): void {
      if (!predicate(state)) return
      clearTimeout(timer)
      socket.off('admin:state', onState)
      resolve(state)
    }

    socket.on('admin:state', onState)
  })
}

type Created = Extract<RoomCreateAck, { ok: true }>

async function createRoom(socket: Socket, name: string): Promise<Created> {
  const result = await request<RoomCreateAck>(socket, 'room:create', { name })
  if (!result.ok) throw new Error(`create failed: ${result.code} ${result.message}`)

  assert.match(result.code, ROOM_CODE_PATTERN)
  assert.equal(result.playerId, socket.id)
  assert.equal(result.role, 'admin')
  assert.equal(result.room.code, result.code)
  // The admin is not a player and does not occupy one of the 40 seats.
  assert.equal(result.room.players.length, 0)
  assert.equal(result.room.hostId, socket.id)
  assert.equal(result.room.admin.id, socket.id)
  assert.equal(result.room.admin.name, name.trim().replace(/\s+/g, ' '))
  assert.equal(result.room.maxPlayers, MAX_PLAYERS)
  assert.equal(result.adminState.phase, 'lobby')
  assert.equal(result.adminState.players.length, 0)

  return result
}

async function assertStartLifecycle(): Promise<void> {
  const admin = await connect()
  const guest = await connect()
  const guestTwo = await connect()
  const outsider = await connect()

  try {
    const created = await createRoom(admin, 'Quản trò')

    const notInRoom = await request<RoomStartAck>(outsider, 'room:start', {})
    assert.equal(notInRoom.ok, false)
    if (!notInRoom.ok) assert.equal(notInRoom.code, 'NOT_IN_ROOM')

    const tooFew = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(tooFew.ok, false)
    if (!tooFew.ok) assert.equal(tooFew.code, 'NOT_ENOUGH_PLAYERS')

    const joined = await request<RoomJoinAck>(guest, 'room:join', {
      code: created.code,
      name: 'Khách',
    })
    if (!joined.ok) throw new Error(`guest join failed: ${joined.code} ${joined.message}`)
    assert.equal(joined.role, 'player')
    assert.equal(joined.room.players.length, 1)
    assert.equal(joined.room.players[0]?.id, guest.id)
    assert.equal(joined.room.players.some((player) => player.id === admin.id), false)

    const joinedTwo = await request<RoomJoinAck>(guestTwo, 'room:join', {
      code: created.code,
      name: 'Khách 2',
    })
    if (!joinedTwo.ok) {
      throw new Error(`second guest join failed: ${joinedTwo.code} ${joinedTwo.message}`)
    }
    assert.equal(joinedTwo.room.players.length, 2)

    const guestStart = await request<RoomStartAck>(guest, 'room:start', {})
    assert.equal(guestStart.ok, false)
    if (!guestStart.ok) assert.equal(guestStart.code, 'NOT_ADMIN')

    const guestPlaying = waitForState(guest, (state) => state.status === 'playing')
    const adminQuestionState = waitForAdminState(
      admin,
      (state) => state.phase === 'question',
    )

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    if (!started.ok) {
      throw new Error(`admin start failed: ${started.code} ${started.message}`)
    }

    const [guestState, adminState] = await Promise.all([
      guestPlaying,
      adminQuestionState,
    ])
    assert.equal(guestState.status, 'playing')
    assert.equal(guestState.players.length, 2)
    assert.equal(guestState.hostId, admin.id)
    assert.equal(guestState.admin.id, admin.id)
    assert.equal(adminState.questionIndex, 1)
    assert.equal(adminState.players.length, 2)
    assert.equal(adminState.players[0]?.status, 'answering')

    const startedAgain = await request<RoomStartAck>(admin, 'room:start', {})
    assert.equal(startedAgain.ok, false)
    if (!startedAgain.ok) assert.equal(startedAgain.code, 'ROOM_STARTED')

    const guestStartAfter = await request<RoomStartAck>(guest, 'room:start', {})
    assert.equal(guestStartAfter.ok, false)
    if (!guestStartAfter.ok) assert.equal(guestStartAfter.code, 'NOT_ADMIN')

    const lateJoin = await request<RoomJoinAck>(outsider, 'room:join', {
      code: created.code,
      name: 'Người đến muộn',
    })
    assert.equal(lateJoin.ok, false)
    if (!lateJoin.ok) assert.equal(lateJoin.code, 'ROOM_IN_PROGRESS')
  } finally {
    admin.close()
    guest.close()
    guestTwo.close()
    outsider.close()
  }
}

async function assertRoomLifecycle(): Promise<void> {
  const admin = await connect()
  const joiners: Socket[] = []

  try {
    const created = await createRoom(admin, '  Quản  Trò  ')
    assert.equal(created.room.admin.name, 'Quản Trò')

    // Validation errors are tested on a socket that is not already in a room.
    const probe = await connect()
    try {
      const invalidCode = await request<RoomJoinAck>(probe, 'room:join', {
        code: 'ABC',
        name: 'Khách',
      })
      assert.equal(invalidCode.ok, false)
      if (!invalidCode.ok) assert.equal(invalidCode.code, 'INVALID_CODE')

      const unusedCode = created.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA'
      const missingRoom = await request<RoomJoinAck>(probe, 'room:join', {
        code: unusedCode,
        name: 'Khách',
      })
      assert.equal(missingRoom.ok, false)
      if (!missingRoom.ok) assert.equal(missingRoom.code, 'ROOM_NOT_FOUND')

      const invalidName = await request<RoomJoinAck>(probe, 'room:join', {
        code: created.code,
        name: 'A',
      })
      assert.equal(invalidName.ok, false)
      if (!invalidName.ok) assert.equal(invalidName.code, 'INVALID_NAME')

      const notInRoom = await request<RoomLeaveAck>(probe, 'room:leave', {})
      assert.equal(notInRoom.ok, false)
      if (!notInRoom.ok) assert.equal(notInRoom.code, 'NOT_IN_ROOM')
    } finally {
      probe.close()
    }

    // The admin is extra: MAX_PLAYERS real players can still join.
    for (let index = 0; index < MAX_PLAYERS; index += 1) {
      const socket = await connect()
      joiners.push(socket)

      const result = await request<RoomJoinAck>(socket, 'room:join', {
        code: created.code,
        name: `Khách ${index + 1}`,
      })
      if (!result.ok) {
        throw new Error(`join failed at ${index + 1}: ${result.code} ${result.message}`)
      }

      assert.equal(result.room.players.length, index + 1)
      assert.equal(result.room.hostId, admin.id)
    }

    const extra = await connect()
    try {
      const full = await request<RoomJoinAck>(extra, 'room:join', {
        code: created.code,
        name: 'Người thứ 41',
      })
      assert.equal(full.ok, false)
      if (!full.ok) assert.equal(full.code, 'ROOM_FULL')
    } finally {
      extra.close()
    }

    // A player leaving never removes the room; the admin can invite someone.
    const leavingGuest = joiners.pop()
    assert.ok(leavingGuest)
    const leaveAck = await request<RoomLeaveAck>(leavingGuest, 'room:leave', {})
    assert.equal(leaveAck.ok, true)

    const afterLeave = await waitForAdminState(
      admin,
      (state) => state.players.length === MAX_PLAYERS - 1,
    )
    assert.equal(afterLeave.phase, 'lobby')

    // The admin leaving closes the room and frees every player immediately.
    const closed = waitForEvent<RoomClosedPayload>(joiners[0] as Socket, 'room:closed')
    const adminLeaveAck = await request<RoomLeaveAck>(admin, 'room:leave', {})
    assert.equal(adminLeaveAck.ok, true)

    const closedPayload = await closed
    assert.equal(closedPayload.reason, 'admin_left')

    const rejoin = await request<RoomJoinAck>(joiners[0] as Socket, 'room:join', {
      code: created.code,
      name: 'Khách 2',
    })
    assert.equal(rejoin.ok, false)
    if (!rejoin.ok) assert.equal(rejoin.code, 'ROOM_NOT_FOUND')
  } finally {
    admin.close()
    for (const socket of joiners) socket.close()
  }
}

/** Direct manager invariant: an admin leave closes the room, never transfers. */
function assertAdminLeaveClosesRoom(): void {
  const rooms = new RoomManager()
  const created = rooms.create('admin-1', 'Quản trò')
  if (!created.ok) throw new Error(`direct create failed: ${created.code}`)
  const older = rooms.join('guest-older', created.room.code, 'Older')
  const connected = rooms.join('guest-connected', created.room.code, 'Connected')
  if (!older.ok || !connected.ok) throw new Error('direct joins failed')

  rooms.markDisconnected(older.player.id)
  const left = rooms.leave(created.player.id)
  if (!left.ok) throw new Error(`direct admin leave failed: ${left.code}`)
  assert.equal(left.room, null)
  assert.equal(left.closed, true)
  assert.equal(rooms.getRoom(created.room.code), null)

  const invalidResume = rooms.resume(connected.player.resumeToken, 'new-socket')
  assert.equal(invalidResume.ok, false)
  if (!invalidResume.ok) assert.equal(invalidResume.code, 'INVALID_RESUME_TOKEN')
}

async function assertUniqueCodes(): Promise<void> {
  const socket = await connect()

  try {
    const codes = new Set<string>()

    for (let index = 0; index < 20; index += 1) {
      const room = await createRoom(socket, `Quản trò ${index + 1}`)
      codes.add(room.code)

      const leaveAck = await request<RoomLeaveAck>(socket, 'room:leave', {})
      assert.equal(leaveAck.ok, true)
    }

    assert.equal(codes.size, 20)
  } finally {
    socket.close()
  }
}

async function main(): Promise<void> {
  assertAdminLeaveClosesRoom()
  await assertRoomLifecycle()
  await assertStartLifecycle()
  await assertUniqueCodes()

  console.info(
    `[rooms] ${MAX_PLAYERS}-player cap + admin, admin-only start, non-playing admin, close-on-admin-leave and 20 unique codes passed`,
  )
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[rooms] failed:', error)
    process.exit(1)
  },
)
