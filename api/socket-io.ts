import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { registerRoomHandlers } from '../server/roomSocket'
import { ResultsStore } from '../server/results'
import { registerSocketHandlers } from '../server/socket'

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
const httpServer = createServer()

const io = new Server(httpServer, {
  path: '/api/socket-io/socket.io',
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
