import type { Server } from 'socket.io'
import type { ClientPing, ServerHello, ServerPong } from '../src/types/multiplayer'

/** Socket.IO payloads are untrusted until validated. */
function isClientPing(value: unknown): value is ClientPing {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as { sentAt?: unknown }
  return typeof candidate.sentAt === 'number' && Number.isFinite(candidate.sentAt)
}

/**
 * Registers transport-level handlers.
 *
 * Room and game events are registered by their own modules; this function only
 * owns the handshake so the server can be smoke-tested before the lobby exists.
 */
export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    const hello: ServerHello = {
      ok: true,
      socketId: socket.id,
      serverTime: Date.now(),
    }

    socket.emit('server:hello', hello)

    socket.on(
      'client:ping',
      (payload: unknown, ack?: (pong: ServerPong) => void) => {
        if (!isClientPing(payload)) return

        const pong: ServerPong = {
          sentAt: payload.sentAt,
          serverTime: Date.now(),
        }

        if (ack) {
          ack(pong)
        } else {
          socket.emit('server:pong', pong)
        }
      },
    )
  })
}
