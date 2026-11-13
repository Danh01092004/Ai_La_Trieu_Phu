import type { Server, Socket } from 'socket.io'
import type {
  AdminActionAck,
  AdminState,
  AnswerAck,
  LifelineAck,
  RoomClosedPayload,
  RoomCreateAck,
  RoomError,
  RoomJoinAck,
  RoomKickedPayload,
  RoomLeaveAck,
  RoomRematchAck,
  RoomResumeAck,
  RoomStartAck,
  WagerAck,
} from '../src/types/multiplayer'
import { DISCONNECT_GRACE_MS } from './config.js'
import { GameManager } from './game.js'
import {
  RoomManager,
  playerCount,
  playingPlayers,
  type Room,
  type RoomPlayer,
} from './rooms.js'
import type { ResultsStore } from './results.js'

function roomChannel(code: string): string {
  return `room:${code}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

/**
 * Acks are optional in Socket.IO. When a client does not pass one, surface
 * failures on `room:error` instead of letting the request fail silently.
 */
function reply<T>(socket: Socket, ack: ((result: T) => void) | undefined, result: T): void {
  if (typeof ack === 'function') {
    ack(result)
    return
  }

  const maybeError = result as { ok?: unknown }
  if (maybeError.ok === false) {
    socket.emit('room:error', result as RoomError)
  }
}

function broadcastRoom(io: Server, manager: RoomManager, room: Room): void {
  // The admin is intentionally not in this channel: it only receives the safe
  // `admin:state` dashboard and never sees a question packet.
  io.to(roomChannel(room.code)).emit('room:state', manager.toState(room))
}

function closeMessage(reason: RoomClosedPayload['reason']): string {
  return reason === 'admin_left'
    ? 'Quản trò đã rời phòng. Phòng đã đóng.'
    : 'Quản trò mất kết nối quá lâu. Phòng đã đóng.'
}

/** Capture recipients before the room (and its player map) is destroyed. */
function roomRecipients(room: Room): RoomPlayer[] {
  return playingPlayers(room).map((player) => ({ ...player }))
}

function notifyRoomClosed(
  io: Server,
  games: GameManager,
  room: Room,
  recipients: RoomPlayer[],
  reason: RoomClosedPayload['reason'],
): void {
  const payload: RoomClosedPayload = { reason, message: closeMessage(reason) }

  for (const recipient of recipients) {
    io.to(recipient.id).emit('room:closed', payload)
    if (recipient.socketId) {
      io.sockets.sockets.get(recipient.socketId)?.leave(roomChannel(room.code))
    }
  }

  games.stop(room.code)
}

/**
 * Room create/join/leave/disconnect handlers.
 *
 * The creator is an admin/observer: it joins only its personal socket room and
 * receives `admin:state`, never `game:question`. Players join the room channel.
 * All broadcasts stay scoped to one room and one role.
 */
export function registerRoomHandlers(io: Server, results: ResultsStore): void {
  const rooms = new RoomManager()
  const games = new GameManager(io, rooms, results)
  /** Stable member id → pending seat-removal/admin-close timer. */
  const disconnectTimers = new Map<string, NodeJS.Timeout>()

  function playerIdFor(socketId: string): string {
    return rooms.getPlayerBySocket(socketId)?.id ?? socketId
  }

  function cancelSeatRemoval(playerId: string): void {
    const timer = disconnectTimers.get(playerId)
    if (!timer) return
    clearTimeout(timer)
    disconnectTimers.delete(playerId)
  }

  /** No players left mid-game: return the room to a startable lobby. */
  function settleAfterPlayerRemoval(room: Room): void {
    if (room.status !== 'playing' || playerCount(room) > 0) return
    games.stop(room.code)
    room.status = 'lobby'
    room.questionTotal = 0
  }

  function pushState(room: Room): void {
    settleAfterPlayerRemoval(room)
    broadcastRoom(io, rooms, room)
    games.emitAdminState(room)
  }

  function scheduleSeatRemoval(playerId: string): void {
    cancelSeatRemoval(playerId)
    const timer = setTimeout(() => {
      disconnectTimers.delete(playerId)
      const result = rooms.leave(playerId)
      if (!result.ok || !result.room) return
      pushState(result.room)
    }, DISCONNECT_GRACE_MS)
    timer.unref()
    disconnectTimers.set(playerId, timer)
  }

  /**
   * Losing the admin ends the room after the grace window. It is never
   * transferred to a player, because a player suddenly becoming a spectator
   * would silently remove them from the match.
   */
  function scheduleAdminClose(adminId: string, code: string): void {
    cancelSeatRemoval(adminId)
    const timer = setTimeout(() => {
      disconnectTimers.delete(adminId)
      const room = rooms.getRoom(code)
      if (!room || room.hostId !== adminId) return
      const recipients = roomRecipients(room)
      const result = rooms.leave(adminId)
      if (!result.ok) return
      notifyRoomClosed(io, games, room, recipients, 'admin_timeout')
    }, DISCONNECT_GRACE_MS)
    timer.unref()
    disconnectTimers.set(adminId, timer)
  }

  io.on('connection', (socket) => {
    socket.on(
      'room:create',
      (payload: unknown, ack?: (result: RoomCreateAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.create(socket.id, record?.name, record?.clientId)

        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        // Admin joins only its personal room, not the player channel.
        socket.join(result.player.id)

        const response: RoomCreateAck = {
          ok: true,
          role: 'admin',
          code: result.room.code,
          playerId: result.player.id,
          resumeToken: result.player.resumeToken,
          room: rooms.toState(result.room),
          adminState: games.adminSnapshot(result.room),
        }

        reply(socket, ack, response)
      },
    )

    socket.on(
      'room:join',
      (payload: unknown, ack?: (result: RoomJoinAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.join(
          socket.id,
          record?.code,
          record?.name,
          record?.clientId,
        )

        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        socket.join(roomChannel(result.room.code))
        socket.join(result.player.id)

        const response: RoomJoinAck = {
          ok: true,
          role: 'player',
          playerId: result.player.id,
          resumeToken: result.player.resumeToken,
          room: rooms.toState(result.room),
        }

        reply(socket, ack, response)
        broadcastRoom(io, rooms, result.room)
        games.emitAdminState(result.room)
      },
    )

    /**
     * Reattach a new socket (after an F5 or a network drop) to the stable
     * member. Admin and player reconnect to different snapshots; the admin
     * never receives a question payload.
     */
    socket.on(
      'room:resume',
      (payload: unknown, ack?: (result: RoomResumeAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.resume(record?.token, socket.id)
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        const { room, player, role, previousSocketId } = result
        if (previousSocketId && previousSocketId !== socket.id) {
          io.sockets.sockets.get(previousSocketId)?.disconnect(true)
        }

        cancelSeatRemoval(player.id)
        socket.join(player.id)
        if (role === 'player') socket.join(roomChannel(room.code))

        const adminState: AdminState | undefined =
          role === 'admin' ? games.adminSnapshot(room) : undefined
        const response: RoomResumeAck = {
          ok: true,
          role,
          playerId: player.id,
          resumeToken: player.resumeToken,
          room: rooms.toState(room),
          snapshot: games.snapshot(room, player.id) ?? { phase: 'lobby' },
          ...(adminState ? { adminState } : {}),
        }

        reply(socket, ack, response)
        broadcastRoom(io, rooms, room)
        games.emitAdminState(room)
      },
    )

    /**
     * Admin-only lobby start. The ack is intentionally tiny; every player
     * receives the authoritative `room:state` in the same event-loop turn.
     */
    socket.on(
      'room:start',
      (payloadOrAck?: unknown, maybeAck?: (result: RoomStartAck) => void) => {
        const ack =
          typeof payloadOrAck === 'function'
            ? (payloadOrAck as (result: RoomStartAck) => void)
            : maybeAck

        const result = rooms.start(playerIdFor(socket.id))
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        reply(socket, ack, { ok: true })
        broadcastRoom(io, rooms, result.room)

        // The room is authoritatively `playing` before the first question is
        // broadcast. If the match cannot start, log loudly instead of silently
        // leaving clients on the transition screen.
        if (!games.start(result.room)) {
          console.error(`[game] could not start match for room ${result.room.code}`)
        }
      },
    )

    /**
     * One answer per player per question. The admin is rejected by GameManager
     * with `NOT_A_PLAYER`; this layer only forwards the ack.
     */
    socket.on(
      'answer:submit',
      (payload: unknown, ack?: (result: AnswerAck) => void) => {
        const result = games.answer(playerIdFor(socket.id), payload)
        if (typeof ack === 'function') ack(result)
      },
    )

    /** Wager changes are accepted until the server-side lock window. */
    socket.on(
      'wager:submit',
      (payload: unknown, ack?: (result: WagerAck) => void) => {
        const result = games.wager(playerIdFor(socket.id), payload)
        if (typeof ack === 'function') ack(result)
      },
    )

    /** One use of each lifeline per player; GameManager owns validation. */
    socket.on(
      'lifeline:use',
      (payload: unknown, ack?: (result: LifelineAck) => void) => {
        const result = games.lifeline(playerIdFor(socket.id), payload)
        if (typeof ack === 'function') ack(result)
      },
    )

    /**
     * Admin-only final reset. Scores and lifelines are cleared before the
     * lobby snapshot is broadcast, so every client sees the reset together.
     */
    socket.on(
      'room:rematch',
      (payloadOrAck?: unknown, maybeAck?: (result: RoomRematchAck) => void) => {
        const ack =
          typeof payloadOrAck === 'function'
            ? (payloadOrAck as (result: RoomRematchAck) => void)
            : maybeAck

        const previous = rooms.getRoomForSocket(socket.id)
        const result = rooms.rematch(playerIdFor(socket.id))
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        reply(socket, ack, { ok: true })
        if (previous) {
          games.stop(previous.code)
          pushState(previous)
        }
      },
    )

    /** Admin-only kick; the player is removed but may rejoin (unless blocked). */
    socket.on(
      'admin:kick',
      (payload: unknown, ack?: (result: AdminActionAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.kick(playerIdFor(socket.id), record?.playerId)
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        const { room, player } = result
        const kicked: RoomKickedPayload = {
          reason: 'kick',
          message: 'Bạn đã bị quản trò mời ra khỏi phòng.',
        }
        cancelSeatRemoval(player.id)
        io.to(player.id).emit('room:kicked', kicked)
        if (player.socketId) {
          io.sockets.sockets.get(player.socketId)?.leave(roomChannel(room.code))
        }

        games.removePlayer(room, player.id)
        reply(socket, ack, { ok: true })
        pushState(room)
      },
    )

    /** Admin-only block: permanent for this room, then remove immediately. */
    socket.on(
      'admin:block',
      (payload: unknown, ack?: (result: AdminActionAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.block(playerIdFor(socket.id), record?.playerId)
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }

        const { room, player } = result
        const blocked: RoomKickedPayload = {
          reason: 'block',
          message: 'Bạn đã bị quản trò chặn khỏi phòng này.',
        }
        cancelSeatRemoval(player.id)
        io.to(player.id).emit('room:kicked', blocked)
        if (player.socketId) {
          io.sockets.sockets.get(player.socketId)?.leave(roomChannel(room.code))
        }

        games.removePlayer(room, player.id)
        reply(socket, ack, { ok: true })
        pushState(room)
      },
    )

    socket.on(
      'admin:unblock',
      (payload: unknown, ack?: (result: AdminActionAck) => void) => {
        const record = asRecord(payload)
        const result = rooms.unblock(playerIdFor(socket.id), record?.blockId)
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }
        reply(socket, ack, { ok: true })
        games.emitAdminState(result.room)
      },
    )

    // The protocol has no payload for leave, but accept both `emit('room:leave',
    // ack)` and `emit('room:leave', {}, ack)` to keep the client simple.
    socket.on(
      'room:leave',
      (payloadOrAck?: unknown, maybeAck?: (result: RoomLeaveAck) => void) => {
        const ack =
          typeof payloadOrAck === 'function'
            ? (payloadOrAck as (result: RoomLeaveAck) => void)
            : maybeAck

        const previous = rooms.getRoomForSocket(socket.id)
        if (previous) socket.leave(roomChannel(previous.code))

        const leavingId = playerIdFor(socket.id)
        const isAdmin = previous?.hostId === leavingId
        const recipients = previous && isAdmin ? roomRecipients(previous) : []
        const result = rooms.leave(leavingId)
        if (!result.ok) {
          reply(socket, ack, result)
          return
        }
        cancelSeatRemoval(leavingId)
        reply(socket, ack, { ok: true })

        if (result.closed) {
          if (previous) {
            notifyRoomClosed(io, games, previous, recipients, 'admin_left')
          }
          return
        }

        if (result.room) {
          pushState(result.room)
        } else if (previous) {
          games.stop(previous.code)
        }
      },
    )

    socket.on('disconnect', () => {
      const player = rooms.getPlayerBySocket(socket.id)
      if (!player) return

      const room = rooms.markDisconnected(player.id)
      if (!room) return

      // Keep the seat, score, lifelines and admin role during the grace
      // window; a new socket can reclaim them through `room:resume`.
      broadcastRoom(io, rooms, room)
      games.emitAdminState(room)

      if (player.role === 'admin') {
        scheduleAdminClose(player.id, room.code)
      } else {
        scheduleSeatRemoval(player.id)
      }
    })
  })
}
