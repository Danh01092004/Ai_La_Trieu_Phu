/**
 * WebSocket RTT smoke test for the `client:ping` probe.
 *
 * This measures the transport path only (no browser rendering). Run it against
 * the server directly, then through the Vite proxy:
 *
 *   npm run test:latency
 *   $env:SERVER_URL='http://localhost:5173'; npm run test:latency
 */
import { performance } from 'node:perf_hooks'
import { io, type Socket } from 'socket.io-client'
import type { ServerPong } from '../../src/types/multiplayer'

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001'
const SAMPLES = 30
const WARMUP = 3
const TIMEOUT_MS = 3_000

function connect(): Promise<Socket> {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: TIMEOUT_MS,
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('connect timed out'))
    }, TIMEOUT_MS)

    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      socket.close()
      reject(error)
    })
  })
}

function ping(socket: Socket): Promise<number> {
  const sentAt = Date.now()
  const startedAt = performance.now()

  return new Promise((resolve, reject) => {
    socket.timeout(TIMEOUT_MS).emit(
      'client:ping',
      { sentAt },
      (error: Error | null, pong: ServerPong) => {
        if (error) {
          reject(error)
          return
        }
        if (!pong || pong.sentAt !== sentAt) {
          reject(new Error('unexpected pong payload'))
          return
        }
        resolve(performance.now() - startedAt)
      },
    )
  })
}

function percentile(sorted: number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? 0
}

async function main(): Promise<void> {
  const socket = await connect()

  try {
    for (let index = 0; index < WARMUP; index += 1) await ping(socket)

    const samples: number[] = []
    for (let index = 0; index < SAMPLES; index += 1) {
      samples.push(await ping(socket))
    }

    samples.sort((left, right) => left - right)
    const p50 = percentile(samples, 0.5)
    const p95 = percentile(samples, 0.95)
    const min = samples[0] ?? 0
    const max = samples.at(-1) ?? 0

    console.info(
      `[latency] ${SERVER_URL} · n=${SAMPLES} · min=${min.toFixed(1)}ms · p50=${p50.toFixed(1)}ms · p95=${p95.toFixed(1)}ms · max=${max.toFixed(1)}ms`,
    )
  } finally {
    socket.close()
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[latency] failed:', error)
    process.exit(1)
  },
)
