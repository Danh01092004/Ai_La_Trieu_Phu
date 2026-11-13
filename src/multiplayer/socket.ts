import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/multiplayer'

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: MultiplayerSocket | null = null

/**
 * One socket per browser tab. In development it connects to the Vite origin
 * and the `/socket.io` proxy forwards to the game server; in production the
 * same code works when Express serves the built client.
 *
 * `autoConnect` is off so the `/multiplayer` page owns the connection
 * lifecycle: the singleton connects on first use, leaves its room when the
 * page unmounts, and stays open for the tab to avoid reconnect churn.
 */
export function getMultiplayerSocket(): MultiplayerSocket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // Once a websocket upgrade succeeds, reconnect straight to websocket
      // instead of repeating the polling handshake.
      rememberUpgrade: true,
      reconnection: true,
      // Keep retrying while the server holds the disconnected seat. The
      // server removes the seat after DISCONNECT_GRACE_MS, at which point a
      // resume attempt returns INVALID_RESUME_TOKEN and the UI starts over.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 250,
      reconnectionDelayMax: 5_000,
      timeout: 8_000,
    }) as MultiplayerSocket
  }

  return socket
}
