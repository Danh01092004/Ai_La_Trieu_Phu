import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import { Server } from 'socket.io'
import { HOST, PORT, SERVICE_NAME } from './config'
import { registerRoomHandlers } from './roomSocket'
import { ResultsStore } from './results'
import { registerSocketHandlers } from './socket'
import type { AllTimeLeaderboardResponse } from '../src/types/leaderboard'

const SHUTDOWN_TIMEOUT_MS = 5_000
const DIST_DIR = join(process.cwd(), 'dist')
const DIST_INDEX = join(DIST_DIR, 'index.html')

const app = express()
app.disable('x-powered-by')
const results = new ResultsStore()

app.get('/healthz', (_request, response) => {
  response.json({
    ok: true,
    service: SERVICE_NAME,
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: Date.now(),
  })
})

app.get('/api/leaderboard', (request, response) => {
  const rawLimit = Number(request.query.limit ?? 20)
  const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20
  const payload: AllTimeLeaderboardResponse = {
    ok: true,
    entries: results.allTime(limit),
    totalMatches: results.totalMatches,
    updatedAt: results.updatedAtValue,
  }
  response.setHeader('Cache-Control', 'no-store')
  response.json(payload)
})

// Unknown API routes must not fall through to the SPA HTML.
app.use('/api', (_request, response) => {
  response.status(404).json({ ok: false, error: 'not_found' })
})

// Production: one origin for the SPA and Socket.IO. In development Vite on
// 5173 proxies `/socket.io` and `/api` to this process, so static serving is
// simply skipped until `npm run build` has produced `dist/`.
if (existsSync(DIST_INDEX)) {
  app.use(
    '/assets',
    express.static(join(DIST_DIR, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }),
  )

  // Vite copies files from public/ to the dist root (music, logo, favicon).
  // Serve those before the SPA fallback or Howler would receive index.html
  // instead of the lose track in production.
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: '1h',
      setHeaders: (response, filePath) => {
        // HTML points at hashed assets, so it must revalidate after a deploy.
        if (filePath.endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )

  // A stale index.html can reference a hashed chunk removed by a newer deploy.
  // Return a real 404 for missing assets instead of HTML: browsers otherwise
  // report a confusing MIME/parse error for the SPA shell.
  app.use('/assets', (_request, response) => {
    response.status(404).type('text/plain').send('Asset not found')
  })

  app.get(/^(?!\/socket\.io(?:\/|$)).*/, (request, response, next) => {
    if (request.path === '/healthz') return
    // File-looking paths must not silently become the SPA HTML.
    if (request.path.includes('.')) {
      next()
      return
    }
    response.sendFile(DIST_INDEX)
  })

  app.use((_request, response) => {
    response.status(404).type('text/plain').send('Not found')
  })
}

// Keep API failures JSON-shaped and avoid leaking a stack trace/HTML in
// production. Static/SPA errors fall through to Express's normal handling.
app.use(
  (
    error: unknown,
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    console.error('[api] unhandled request error:', error)
    if (response.headersSent) {
      next(error)
      return
    }
    if (request.path.startsWith('/api/')) {
      response.status(500).json({ ok: false, error: 'internal_error' })
      return
    }
    response.status(500).send('Internal Server Error')
  },
)

const httpServer = createServer(app)
const io = new Server(httpServer, {
  // The browser client is served by Vite in development and by this process
  // later; Socket.IO does not need to ship its own client bundle.
  serveClient: false,
  // Room/game payloads are small JSON objects. Compression would add CPU work
  // and an extra encode/decode step on every state broadcast for little gain.
  perMessageDeflate: false,
  httpCompression: false,
  // Every public payload is a few KB; cap the buffer to keep a hostile client
  // from allocating arbitrarily large packets.
  maxHttpBufferSize: 64 * 1024,
})

registerSocketHandlers(io)
registerRoomHandlers(io, results)

httpServer.on('error', (error) => {
  console.error(`[${SERVICE_NAME}] HTTP server error:`, error)
  process.exit(1)
})

httpServer.listen(PORT, HOST, () => {
  console.info(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`)
})

let shuttingDown = false

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true

  console.info(`[${SERVICE_NAME}] ${signal} received; shutting down`)
  io.close()
  httpServer.close(() => process.exit(0))

  // Never hang forever if a socket refuses to close.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
