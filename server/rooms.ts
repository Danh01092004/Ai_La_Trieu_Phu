import { randomBytes, randomInt } from 'node:crypto'
import {
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '../src/config/multiplayerConfig'
import type { LifelineState } from '../src/types'
import type {
  AdminPhase,
  AdminPlayerStatus,
  AdminState,
  BlockedPlayerState,
  MemberRole,
  PlayerSummary,
  RoomError,
  RoomErrorCode,
  RoomRematchResult,
  RoomState,
  RoomStatus,
} from '../src/types/multiplayer'
import { buildLeaderboard } from './ranking'

const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 16
const CONTROL_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2060\u2066-\u2069\ufeff]/
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** Server-only player state. The admin is stored here too, with `role='admin'`. */
export interface RoomPlayer {
  /** Stable identity: the socket id that first created/joined the room. */
  id: string
  name: string
  /** Opaque browser identity; used only to enforce block lists. */
  clientId: string
  /** The creator is an admin and can never answer or use lifelines. */
  role: MemberRole
  score: number
  correct: number
  /** Sum of response times for correct answers; tie-breaker. */
  totalMs: number
  joinedAt: number
  connected: boolean
  /** Current transport id; null while disconnected. */
  socketId: string | null
  /** Rotated on every successful resume. */
  resumeToken: string
  lifelines: LifelineState
}

interface BlockedEntry extends BlockedPlayerState {
  clientId: string
}

/** Server-only room state. Matches and deadlines live in GameManager. */
export interface Room {
  code: string
  status: RoomStatus
  /** Stable id of the admin. The admin is also stored in `players`. */
  hostId: string
  players: Map<string, RoomPlayer>
  blocked: Map<string, BlockedEntry>
  createdAt: number
  lastActivity: number
  /** Number of questions in the current/last match, for final snapshots. */
  questionTotal: number
}

export type CreateRoomResult =
  | { ok: true; room: Room; player: RoomPlayer }
  | RoomError
export type JoinRoomResult =
  | { ok: true; room: Room; player: RoomPlayer }
  | RoomError
export type ResumeRoomResult =
  | {
      ok: true
      room: Room
      player: RoomPlayer
      role: MemberRole
      previousSocketId: string | null
    }
  | RoomError
export type LeaveRoomResult =
  | { ok: true; room: Room | null; closed?: boolean }
  | RoomError
export type StartRoomResult = { ok: true; room: Room } | RoomError
export type RematchRoomResult = RoomRematchResult | RoomError
export type KickPlayerResult =
  | { ok: true; room: Room; player: RoomPlayer }
  | RoomError
export type BlockPlayerResult =
  | { ok: true; room: Room; player: RoomPlayer; blocked: BlockedPlayerState }
  | RoomError
export type UnblockPlayerResult = { ok: true; room: Room } | RoomError

function freshLifelines(): LifelineState {
  return { fifty: false, phone: false, audience: false, mc: false }
}

function resetPlayerForMatch(player: RoomPlayer): void {
  player.score = 0
  player.correct = 0
  player.totalMs = 0
  player.lifelines = freshLifelines()
}

function fail(code: RoomErrorCode, message: string): RoomError {
  return { ok: false, code, message }
}

/** Real players only; the admin is excluded from gameplay and standings. */
export function playingPlayers(room: Room): RoomPlayer[] {
  return [...room.players.values()].filter((player) => player.role === 'player')
}

export function playerCount(room: Room): number {
  let count = 0
  for (const player of room.players.values()) {
    if (player.role === 'player') count += 1
  }
  return count
}

/**
 * Names are displayed verbatim to every player, so normalise whitespace and
 * reject control characters before validating the 2–16 code-point length.
 */
export function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null

  const name = value.trim().replace(/\s+/g, ' ').normalize('NFC')
  const length = [...name].length

  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) return null
  return name
}

/** Accepts only the unambiguous alphabet; never silently "fixes" a code. */
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const code = value.trim().toUpperCase()
  if ([...code].length !== ROOM_CODE_LENGTH) return null

  for (const character of code) {
    if (!ROOM_CODE_ALPHABET.includes(character)) return null
  }

  return code
}

function normalizeClientId(value: unknown, socketId: string): string {
  if (typeof value === 'string') {
    const clientId = value.trim()
    if (CLIENT_ID_PATTERN.test(clientId)) return clientId
  }
  // Tests and non-browser clients may omit it; the name block still works.
  return `socket:${socketId}`
}

/**
 * In-memory room registry for the MVP. One manager instance owns every room
 * and the player → room index, which keeps leave/disconnect O(1).
 *
 * The creator is an admin/observer and is invisible to gameplay: it has a
 * reserved seat outside `MAX_PLAYERS`, receives no questions, and owns the
 * kick/block controls.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  /** Stable member id (admin or player) → room code. */
  private readonly playerRooms = new Map<string, string>()
  /** Current transport socket id → stable member id. */
  private readonly socketPlayers = new Map<string, string>()
  private readonly resumeTokens = new Map<string, { code: string; playerId: string }>()

  create(socketId: string, rawName: unknown, rawClientId?: unknown): CreateRoomResult {
    const name = normalizePlayerName(rawName)
    if (!name) {
      return fail('INVALID_NAME', `Tên phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự.`)
    }
    if (this.playerRooms.has(socketId) || this.socketPlayers.has(socketId)) {
      return fail('ALREADY_IN_ROOM', 'Bạn đã ở trong một phòng.')
    }

    const now = Date.now()
    const code = this.generateCode()
    const resumeToken = this.generateResumeToken()
    const admin: RoomPlayer = {
      id: socketId,
      name,
      clientId: normalizeClientId(rawClientId, socketId),
      role: 'admin',
      score: 0,
      correct: 0,
      totalMs: 0,
      joinedAt: now,
      connected: true,
      socketId,
      resumeToken,
      lifelines: freshLifelines(),
    }

    const room: Room = {
      code,
      status: 'lobby',
      hostId: socketId,
      players: new Map([[socketId, admin]]),
      blocked: new Map(),
      createdAt: now,
      lastActivity: now,
      questionTotal: 0,
    }

    this.rooms.set(code, room)
    this.playerRooms.set(socketId, code)
    this.socketPlayers.set(socketId, socketId)
    this.resumeTokens.set(resumeToken, { code, playerId: socketId })
    return { ok: true, room, player: admin }
  }

  join(
    socketId: string,
    rawCode: unknown,
    rawName: unknown,
    rawClientId?: unknown,
  ): JoinRoomResult {
    const name = normalizePlayerName(rawName)
    if (!name) {
      return fail('INVALID_NAME', `Tên phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự.`)
    }

    const code = normalizeRoomCode(rawCode)
    if (!code) {
      return fail('INVALID_CODE', `Mã phòng phải gồm ${ROOM_CODE_LENGTH} ký tự hợp lệ.`)
    }
    if (this.playerRooms.has(socketId) || this.socketPlayers.has(socketId)) {
      return fail('ALREADY_IN_ROOM', 'Bạn đã ở trong một phòng.')
    }

    const room = this.rooms.get(code)
    if (!room) {
      return fail('ROOM_NOT_FOUND', 'Không tìm thấy phòng với mã này.')
    }

    const clientId = normalizeClientId(rawClientId, socketId)
    if (this.isBlocked(room, clientId, name)) {
      return fail('PLAYER_BLOCKED', 'Bạn đã bị quản trò chặn khỏi phòng này.')
    }
    if (room.status !== 'lobby') {
      return fail('ROOM_IN_PROGRESS', 'Ván đấu đang diễn ra, không thể vào lúc này.')
    }
    if (playerCount(room) >= MAX_PLAYERS) {
      return fail('ROOM_FULL', `Phòng đã đủ ${MAX_PLAYERS} người chơi.`)
    }

    const now = Date.now()
    const resumeToken = this.generateResumeToken()
    const player: RoomPlayer = {
      id: socketId,
      name,
      clientId,
      role: 'player',
      score: 0,
      correct: 0,
      totalMs: 0,
      joinedAt: now,
      connected: true,
      socketId,
      resumeToken,
      lifelines: freshLifelines(),
    }

    room.players.set(socketId, player)
    room.lastActivity = now
    this.playerRooms.set(socketId, code)
    this.socketPlayers.set(socketId, socketId)
    this.resumeTokens.set(resumeToken, { code, playerId: socketId })

    return { ok: true, room, player }
  }

  /**
   * Reattach a new socket to an existing stable member. The old transport is
   * returned so the socket layer can disconnect it; the resume token is
   * rotated so a captured token cannot be replayed after the owner resumes.
   */
  resume(rawToken: unknown, socketId: string): ResumeRoomResult {
    if (typeof rawToken !== 'string' || rawToken.length < 16) {
      return fail('INVALID_RESUME_TOKEN', 'Phiên phòng không hợp lệ.')
    }

    const entry = this.resumeTokens.get(rawToken)
    if (!entry) {
      return fail('INVALID_RESUME_TOKEN', 'Phiên phòng đã hết hạn.')
    }

    const room = this.rooms.get(entry.code)
    const player = room?.players.get(entry.playerId)
    if (!room || !player || player.resumeToken !== rawToken) {
      this.resumeTokens.delete(rawToken)
      return fail('INVALID_RESUME_TOKEN', 'Phiên phòng đã hết hạn.')
    }
    if (this.isBlocked(room, player.clientId, player.name)) {
      this.resumeTokens.delete(rawToken)
      return fail('PLAYER_BLOCKED', 'Bạn đã bị quản trò chặn khỏi phòng này.')
    }

    const previousSocketId = player.connected ? player.socketId : null
    if (previousSocketId) this.socketPlayers.delete(previousSocketId)
    this.resumeTokens.delete(rawToken)

    const nextToken = this.generateResumeToken()
    player.connected = true
    player.socketId = socketId
    player.resumeToken = nextToken
    this.socketPlayers.set(socketId, player.id)
    this.resumeTokens.set(nextToken, { code: room.code, playerId: player.id })
    room.lastActivity = Date.now()

    return {
      ok: true,
      room,
      player,
      role: player.role,
      previousSocketId,
    }
  }

  /** Mark a socket loss without freeing the seat yet. */
  markDisconnected(playerId: string): Room | null {
    const room = this.getRoomForPlayer(playerId)
    const player = room?.players.get(playerId)
    if (!room || !player) return null

    if (player.socketId) this.socketPlayers.delete(player.socketId)
    player.socketId = null
    player.connected = false
    room.lastActivity = Date.now()
    return room
  }

  getPlayerBySocket(socketId: string): RoomPlayer | null {
    const playerId = this.socketPlayers.get(socketId)
    if (!playerId) return null
    return this.getRoomForPlayer(playerId)?.players.get(playerId) ?? null
  }

  getRoomForSocket(socketId: string): Room | null {
    const player = this.getPlayerBySocket(socketId)
    return player ? this.getRoomForPlayer(player.id) : null
  }

  /** The admin member; null only if the room is in an impossible state. */
  getAdmin(room: Room): RoomPlayer | null {
    return room.players.get(room.hostId) ?? null
  }

  isAdmin(playerId: string): boolean {
    return this.getRoomForPlayer(playerId)?.hostId === playerId
  }

  /**
   * Starts a lobby exactly once. Only the admin can start, and a match needs
   * at least two connected players (the admin is not counted).
   */
  start(playerId: string): StartRoomResult {
    const room = this.getRoomForPlayer(playerId)
    if (!room) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }
    if (room.hostId !== playerId) {
      return fail('NOT_ADMIN', 'Chỉ quản trò mới có thể bắt đầu ván đấu.')
    }
    if (room.status !== 'lobby') {
      return fail('ROOM_STARTED', 'Ván đấu đã bắt đầu.')
    }

    const players = playingPlayers(room)
    if (players.length < MIN_PLAYERS_TO_START) {
      return fail(
        'NOT_ENOUGH_PLAYERS',
        `Cần ít nhất ${MIN_PLAYERS_TO_START} người chơi để bắt đầu.`,
      )
    }
    const connected = players.filter((player) => player.connected).length
    if (connected < MIN_PLAYERS_TO_START) {
      return fail(
        'NOT_ENOUGH_PLAYERS',
        `Cần ít nhất ${MIN_PLAYERS_TO_START} người đang kết nối để bắt đầu.`,
      )
    }

    for (const player of players) resetPlayerForMatch(player)

    room.status = 'playing'
    room.lastActivity = Date.now()
    return { ok: true, room }
  }

  /**
   * Admin-only reset after the final screen. The room keeps its code and
   * members, clears every score/lifeline, and returns to the lobby.
   */
  rematch(playerId: string): RematchRoomResult {
    const room = this.getRoomForPlayer(playerId)
    if (!room) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }
    if (room.hostId !== playerId) {
      return fail('NOT_ADMIN', 'Chỉ quản trò mới có thể mở ván mới.')
    }
    if (room.status !== 'final') {
      return fail('ROOM_NOT_FINISHED', 'Ván đấu chưa kết thúc.')
    }

    for (const player of playingPlayers(room)) resetPlayerForMatch(player)

    room.status = 'lobby'
    room.lastActivity = Date.now()
    return { ok: true }
  }

  /**
   * Removes a member by stable id. A player leaving never closes the room; the
   * admin may still invite a replacement. The admin leaving closes the room.
   */
  leave(playerId: string): LeaveRoomResult {
    const code = this.playerRooms.get(playerId)
    if (!code) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    const room = this.rooms.get(code)
    const removed = room?.players.get(playerId)
    if (!room || !removed) {
      this.playerRooms.delete(playerId)
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    if (removed.role === 'admin') {
      this.destroy(room)
      return { ok: true, room: null, closed: true }
    }

    this.removeMember(room, removed)
    room.lastActivity = Date.now()
    return { ok: true, room }
  }

  /** Admin-only kick. The removed player may rejoin unless also blocked. */
  kick(adminId: string, targetId: unknown): KickPlayerResult {
    if (typeof targetId !== 'string' || !targetId) {
      return fail('PLAYER_NOT_FOUND', 'Người chơi không còn trong phòng.')
    }

    const room = this.getRoomForPlayer(adminId)
    if (!room) return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    if (room.hostId !== adminId) {
      return fail('NOT_ADMIN', 'Chỉ quản trò mới có thể mời người chơi ra.')
    }

    const target = room.players.get(targetId)
    if (!target) return fail('PLAYER_NOT_FOUND', 'Người chơi không còn trong phòng.')
    if (target.role === 'admin') {
      return fail('CANNOT_TARGET_ADMIN', 'Không thể mời quản trò ra khỏi phòng.')
    }

    this.removeMember(room, target)
    room.lastActivity = Date.now()
    return { ok: true, room, player: target }
  }

  /** Admin-only permanent (room-scoped) block plus immediate removal. */
  block(adminId: string, targetId: unknown): BlockPlayerResult {
    if (typeof targetId !== 'string' || !targetId) {
      return fail('PLAYER_NOT_FOUND', 'Người chơi không còn trong phòng.')
    }

    const room = this.getRoomForPlayer(adminId)
    if (!room) return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    if (room.hostId !== adminId) {
      return fail('NOT_ADMIN', 'Chỉ quản trò mới có thể chặn người chơi.')
    }

    const target = room.players.get(targetId)
    if (!target) return fail('PLAYER_NOT_FOUND', 'Người chơi không còn trong phòng.')
    if (target.role === 'admin') {
      return fail('CANNOT_TARGET_ADMIN', 'Không thể chặn quản trò.')
    }

    const blocked: BlockedEntry = {
      id: randomBytes(8).toString('hex'),
      name: target.name,
      clientId: target.clientId,
      blockedAt: Date.now(),
    }
    room.blocked.set(blocked.id, blocked)
    this.removeMember(room, target)
    room.lastActivity = Date.now()
    return { ok: true, room, player: target, blocked }
  }

  /** Admin-only unblock; the name/client id may join again from the lobby. */
  unblock(adminId: string, blockId: unknown): UnblockPlayerResult {
    if (typeof blockId !== 'string' || !blockId) {
      return fail('BLOCK_NOT_FOUND', 'Không tìm thấy mục chặn này.')
    }

    const room = this.getRoomForPlayer(adminId)
    if (!room) return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    if (room.hostId !== adminId) {
      return fail('NOT_ADMIN', 'Chỉ quản trò mới có thể bỏ chặn.')
    }
    if (!room.blocked.delete(blockId)) {
      return fail('BLOCK_NOT_FOUND', 'Không tìm thấy mục chặn này.')
    }

    room.lastActivity = Date.now()
    return { ok: true, room }
  }

  getRoom(code: string): Room | null {
    return this.rooms.get(code) ?? null
  }

  getRoomForPlayer(playerId: string): Room | null {
    const code = this.playerRooms.get(playerId)
    return code ? (this.rooms.get(code) ?? null) : null
  }

  get roomCount(): number {
    return this.rooms.size
  }

  toState(room: Room): RoomState {
    const admin = this.getAdmin(room)
    const players: PlayerSummary[] = playingPlayers(room)
      .sort((left, right) => left.joinedAt - right.joinedAt)
      .map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        connected: player.connected,
      }))

    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      admin: {
        id: admin?.id ?? room.hostId,
        name: admin?.name ?? 'Quản trò',
        connected: admin?.connected ?? false,
      },
      players,
      maxPlayers: MAX_PLAYERS,
    }
  }

  /**
   * Live dashboard payload. The admin sees ranks, scores and per-question
   * status, but never the question text or the correct answer.
   */
  toAdminState(
    room: Room,
    phase: AdminPhase,
    options: {
      questionIndex?: number
      questionTotal?: number
      endsAt?: number | null
      statuses?: Map<string, AdminPlayerStatus>
    } = {},
  ): AdminState {
    const admin = this.getAdmin(room)
    const board = buildLeaderboard(playingPlayers(room))
    const statuses = options.statuses ?? new Map<string, AdminPlayerStatus>()
    const defaultStatus: AdminPlayerStatus =
      phase === 'lobby' ? 'waiting' : phase === 'final' ? 'finished' : 'answering'

    return {
      code: room.code,
      status: room.status,
      phase,
      questionIndex: options.questionIndex ?? 0,
      questionTotal: options.questionTotal ?? room.questionTotal,
      endsAt: options.endsAt ?? null,
      serverNow: Date.now(),
      admin: {
        id: admin?.id ?? room.hostId,
        name: admin?.name ?? 'Quản trò',
        connected: admin?.connected ?? false,
      },
      players: board.map((entry) => {
        const member = room.players.get(entry.playerId)
        return {
          playerId: entry.playerId,
          name: entry.name,
          score: entry.score,
          correct: entry.correct,
          rank: entry.rank,
          connected: member?.connected ?? false,
          status: statuses.get(entry.playerId) ?? defaultStatus,
        }
      }),
      blocked: [...room.blocked.values()]
        .sort((left, right) => left.blockedAt - right.blockedAt)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          blockedAt: entry.blockedAt,
        })),
      maxPlayers: MAX_PLAYERS,
    }
  }

  private isBlocked(room: Room, clientId: string, name: string): boolean {
    for (const entry of room.blocked.values()) {
      if (entry.clientId === clientId || entry.name === name) return true
    }
    return false
  }

  private removeMember(room: Room, member: RoomPlayer): void {
    if (member.socketId) this.socketPlayers.delete(member.socketId)
    this.resumeTokens.delete(member.resumeToken)
    room.players.delete(member.id)
    this.playerRooms.delete(member.id)
  }

  /** Remove every member and invalidate every token; the room code is freed. */
  private destroy(room: Room): void {
    for (const member of room.players.values()) {
      if (member.socketId) this.socketPlayers.delete(member.socketId)
      this.resumeTokens.delete(member.resumeToken)
      this.playerRooms.delete(member.id)
    }
    room.players.clear()
    room.blocked.clear()
    this.rooms.delete(room.code)
  }

  private generateResumeToken(): string {
    let token = ''
    do {
      token = randomBytes(24).toString('base64url')
    } while (this.resumeTokens.has(token))
    return token
  }

  private generateCode(): string {
    let code = ''

    do {
      code = ''
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
      }
    } while (this.rooms.has(code))

    return code
  }
}
