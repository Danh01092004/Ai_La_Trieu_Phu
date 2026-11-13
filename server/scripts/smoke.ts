/**
 * End-to-end smoke test for the realtime server.
 *
 * Requires the server to be running (see package.json `server` script). Set
 * SERVER_URL to test through the Vite proxy instead of the server directly.
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { SERVICE_NAME } from '../config'
import {
  MAX_POINTS,
  QUESTION_TIME_MS,
  TOTAL_QUESTIONS,
  pointsForLevel,
} from '../../src/config/multiplayerConfig'
import type { ServerHello, ServerPong } from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const TIMEOUT_MS = 10_000

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
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

function assertScoring(): void {
  assert.equal(TOTAL_QUESTIONS, 15)
  assert.equal(QUESTION_TIME_MS, 15_000)
  assert.equal(pointsForLevel(1), 1)
  assert.equal(pointsForLevel(2), 2)
  assert.equal(pointsForLevel(3), 4)
  assert.equal(pointsForLevel(15), 16_384)
  assert.equal(MAX_POINTS, 32_767)
  assert.throws(() => pointsForLevel(0), RangeError)
  assert.throws(() => pointsForLevel(16), RangeError)
  assert.throws(() => pointsForLevel(1.5), RangeError)
}

async function assertHealth(): Promise<void> {
  const response = await fetch(`${SERVER_URL}/healthz`)
  assert.equal(response.status, 200)

  const body = (await response.json()) as {
    ok?: unknown
    service?: unknown
    uptimeSeconds?: unknown
    serverTime?: unknown
  }

  assert.equal(body.ok, true)
  assert.equal(body.service, SERVICE_NAME)
  assert.equal(typeof body.uptimeSeconds, 'number')
  assert.equal(typeof body.serverTime, 'number')
}

async function connect(
  transport: 'websocket' | 'polling',
): Promise<{ socket: Socket; hello: ServerHello }> {
  const socket = io(SERVER_URL, {
    transports: [transport],
    reconnection: false,
    timeout: TIMEOUT_MS,
  })

  try {
    const hello = await withTimeout(
      new Promise<ServerHello>((resolve, reject) => {
        socket.once('server:hello', resolve)
        socket.once('connect_error', reject)
      }),
      'server:hello',
    )

    return { socket, hello }
  } catch (error) {
    socket.close()
    throw error
  }
}

async function assertSocketHandshake(
  transport: 'websocket' | 'polling',
): Promise<void> {
  const { socket, hello } = await connect(transport)

  try {
    assert.equal(hello.ok, true)
    assert.ok(hello.socketId.length > 0)
    assert.equal(typeof hello.serverTime, 'number')

    // Malformed probes must be ignored without killing the connection.
    socket.emit('client:ping', { sentAt: 'not-a-number' })

    const sentAt = Date.now()
    const pong = await withTimeout(
      new Promise<ServerPong>((resolve, reject) => {
        socket.timeout(TIMEOUT_MS).emit(
          'client:ping',
          { sentAt },
          (error: Error | null, response: ServerPong) => {
            if (error) reject(error)
            else resolve(response)
          },
        )
      }),
      'client:ping',
    )

    assert.equal(pong.sentAt, sentAt)
    assert.equal(typeof pong.serverTime, 'number')
  } finally {
    socket.close()
  }
}

async function main(): Promise<void> {
  assertScoring()
  await assertHealth()
  await assertSocketHandshake('websocket')
  await assertSocketHandshake('polling')

  console.info(
    '[smoke] health, websocket/polling handshake and scoring checks passed',
  )
}

main().catch((error: unknown) => {
  console.error('[smoke] failed:', error)
  process.exitCode = 1
})
