/**
 * Production smoke test. Start the built server first:
 *   npm run build; npm start
 * Then, in another terminal:
 *   npm run test:prod
 *
 * Verifies the static shell, hashed assets, SPA fallback, real 404s, audio
 * range support, JSON API and a real admin + 2-player room on one origin.
 */
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import type {
  GameQuestionPayload,
  RoomCreateAck,
  RoomJoinAck,
  RoomStartAck,
} from '../../src/types/multiplayer'

const SERVER_URL = process.env.PROD_URL ?? 'http://localhost:3001'
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(SERVER_URL)
const SOCKET_PATH =
  process.env.PROD_SOCKET_PATH ??
  (IS_LOCAL ? '/socket.io' : '/api/socket-io/socket.io')
const REQUEST_TIMEOUT_MS = 8_000

async function get(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, SERVER_URL), {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

function contentType(response: Response): string {
  return response.headers.get('content-type') ?? ''
}

function connectSocket(): Promise<Socket> {
  const socket = io(SERVER_URL, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: REQUEST_TIMEOUT_MS,
    ...(IS_LOCAL ? {} : { addTrailingSlash: false }),
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('socket handshake timed out'))
    }, REQUEST_TIMEOUT_MS)
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

function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(REQUEST_TIMEOUT_MS).emit(
      event,
      payload,
      (error: Error | null, result: T) => {
        if (error) reject(error)
        else resolve(result)
      },
    )
  })
}

function waitForQuestion(socket: Socket): Promise<GameQuestionPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:question', onQuestion)
      reject(new Error('first production question timed out'))
    }, REQUEST_TIMEOUT_MS)
    const onQuestion = (question: GameQuestionPayload) => {
      clearTimeout(timer)
      resolve(question)
    }
    socket.once('game:question', onQuestion)
  })
}

async function main(): Promise<void> {
  const root = await get('/')
  assert.equal(root.status, 200)
  assert.match(contentType(root), /text\/html/)
  const html = await root.text()
  assert.match(html, /<div id="root">/)
  assert.doesNotMatch(html, /@vite\/client/, 'production HTML must not load Vite')

  const assetRefs = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map(
    (match) => match[0],
  )
  assert.ok(assetRefs.some((ref) => ref.endsWith('.js')), 'missing JS asset reference')
  assert.ok(assetRefs.some((ref) => ref.endsWith('.css')), 'missing CSS asset reference')

  for (const ref of new Set(assetRefs)) {
    const asset = await get(ref)
    assert.equal(asset.status, 200, `asset ${ref}`)
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/, `asset cache ${ref}`)
    if (ref.endsWith('.js')) assert.match(contentType(asset), /javascript/)
    if (ref.endsWith('.css')) assert.match(contentType(asset), /text\/css/)
  }

  // Missing hashed chunks must be a real 404, never the SPA shell.
  const missingAsset = await get('/assets/does-not-exist.js')
  assert.equal(missingAsset.status, 404)
  assert.match(contentType(missingAsset), /text\/plain/)
  // Express serves its own message locally; Vercel's static layer returns its
  // generic NOT_FOUND body. Both must be a plain 404, never the SPA shell.
  assert.match((await missingAsset.text()).trim(), /Asset not found|NOT_FOUND/i)

  const missingFile = await get('/old-chunk.js')
  assert.equal(missingFile.status, 404)
  assert.match(contentType(missingFile), /text\/plain/)

  // HashRouter keeps the arena at `/#/multiplayer`, so the HTTP SPA entry is `/`.
  const spa = await get('/')
  assert.equal(spa.status, 200)
  assert.match(contentType(spa), /text\/html/)
  assert.match(await spa.text(), /<div id="root">/)

  const index = await get('/index.html')
  assert.equal(index.status, 200)
  assert.match(index.headers.get('cache-control') ?? '', /no-cache|max-age=0/)

  // The Express host owns /healthz and /api/leaderboard. On Vercel those are
  // static/function routing concerns, so only exercise them when testing the
  // local server directly.
  const isLocal = /localhost|127\.0\.0\.1/.test(SERVER_URL)
  if (isLocal) {
    const health = await get('/healthz')
    assert.equal(health.status, 200)
    assert.equal(((await health.json()) as { ok?: boolean }).ok, true)

    const leaderboard = await get('/api/leaderboard?limit=5')
    assert.equal(leaderboard.status, 200)
    const board = (await leaderboard.json()) as {
      ok?: boolean
      entries?: unknown[]
      totalMatches?: number
    }
    assert.equal(board.ok, true)
    assert.ok(Array.isArray(board.entries))
    assert.equal(typeof board.totalMatches, 'number')

    const missingApi = await get('/api/does-not-exist')
    assert.equal(missingApi.status, 404)
    assert.match(contentType(missingApi), /application\/json/)
    assert.equal(((await missingApi.json()) as { ok?: boolean }).ok, false)
  }

  const audio = await get('/xin-vinh-biet-cu.mp3', {
    headers: { Range: 'bytes=0-99' },
  })
  assert.equal(audio.status, 206)
  assert.match(contentType(audio), /audio\/mpeg/)
  assert.match(audio.headers.get('content-range') ?? '', /^bytes 0-99\//)

  const admin = await connectSocket()
  const playerOne = await connectSocket()
  const playerTwo = await connectSocket()
  let adminQuestions = 0
  admin.on('game:question', () => {
    adminQuestions += 1
  })

  try {
    const created = await request<RoomCreateAck>(admin, 'room:create', {
      name: 'Prod Smoke Admin',
    })
    assert.ok(created.ok, 'room:create failed')

    const joins = await Promise.all(
      [playerOne, playerTwo].map((socket, index) =>
        request<RoomJoinAck>(socket, 'room:join', {
          code: created.code,
          name: `Prod Smoke ${index + 1}`,
        }),
      ),
    )
    assert.equal(joins.every((join) => join.ok), true)

    const started = await request<RoomStartAck>(admin, 'room:start', {})
    assert.ok(started.ok, 'room:start failed')

    const question = await waitForQuestion(playerOne)
    assert.equal(question.index, 1)
    assert.equal(question.question.answers.length, 4)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(adminQuestions, 0, 'admin must not receive questions')

    admin.emit('room:leave', {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 50))
  } finally {
    playerOne.close()
    playerTwo.close()
    admin.close()
  }

  console.info(
    `[prod] static shell, ${new Set(assetRefs).size} assets, SPA, 404s, API, audio, websocket and room flow passed`,
  )
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[prod] failed:', error)
    process.exit(1)
  },
)
