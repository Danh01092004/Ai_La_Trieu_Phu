import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { registerRoomHandlers } from '../../server/roomSocket.js'
import { ResultsStore } from '../../server/results.js'
import { registerSocketHandlers } from '../../server/socket.js'

/**
 * Vercel WebSocket entry point.
 *
 * Vercel Functions can keep a WebSocket connection pinned to one function
 * instance. Socket.IO must therefore use the WebSocket transport only and a
 * path that is routed back to this function. The browser client uses the same
 * path when it detects a `*.vercel.app` host.
 *
 * The durable all-time leaderboard is local-file based in the standalone
 * server. Vercel's runtime filesystem is read-only outside `/tmp`, so the
 * serverless variant keeps its archive in `/tmp`; that archive is intentionally
 * ephemeral. Room/game state is in memory and lives for the lifetime of the
 * function instance, exactly like the standalone process.
 */
const httpServer = createServer((_request, response) => {
  response.statusCode = 200
  response.end('altp-vercel')
})

const io = new Server(httpServer, {
  path: '/api/socket-io/socket.io',
  // Vercel's function route matches `/api/socket-io/socket.io` without a
  // trailing slash. Engine.IO normally appends one, which would miss the
  // function route and return Vercel's 404 before our server sees the upgrade.
  addTrailingSlash: false,
  serveClient: false,
  perMessageDeflate: false,
  httpCompression: false,
  maxHttpBufferSize: 64 * 1024,
  transports: ['websocket'],
})

const results = new ResultsStore(
  process.env.RESULTS_FILE ?? '/tmp/altp-results.json',
)

registerSocketHandlers(io)
registerRoomHandlers(io, results)

export default httpServer
