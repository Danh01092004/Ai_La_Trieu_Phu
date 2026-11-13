/**
 * Wire types shared by the multiplayer client and server.
 *
 * Only events that are actually implemented live here, so the client and
 * server cannot drift apart while the game loop is built incrementally.
 */
import type { Difficulty, LifelineState, LifelineType } from './index'

/** Sent by the server immediately after a socket connects. */
export interface ServerHello {
  ok: boolean
  socketId: string
  serverTime: number
}

/** Clock probe sent by the client. */
export interface ClientPing {
  sentAt: number
}

/** Reply to a clock probe. */
export interface ServerPong {
  sentAt: number
  serverTime: number
}

// ── Room lifecycle ───────────────────────────────────────────────────────────

export type RoomStatus = 'lobby' | 'playing' | 'final'

/** The creator is an admin/observer; only joined members play. */
export type MemberRole = 'admin' | 'player'

/** Public player shape; never includes answers or private lifeline state. */
export interface PlayerSummary {
  id: string
  name: string
  score: number
  connected: boolean
}

/** The non-playing room owner. */
export interface AdminSummary {
  id: string
  name: string
  connected: boolean
}

/** Full public snapshot of a room, sent on every membership change. */
export interface RoomState {
  code: string
  status: RoomStatus
  /** Stable id of the admin; kept as `hostId` for protocol compatibility. */
  hostId: string
  admin: AdminSummary
  /** Only real players. The admin is never included. */
  players: PlayerSummary[]
  maxPlayers: number
}

export interface RoomCreatePayload {
  name: string
  /** Opaque browser identity used by the admin's block list. */
  clientId?: string
}

export interface RoomJoinPayload {
  code: string
  name: string
  clientId?: string
}

export type RoomErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'ROOM_STARTED'
  | 'ROOM_IN_PROGRESS'
  | 'ROOM_NOT_FINISHED'
  | 'NOT_ADMIN'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_RESUME_TOKEN'
  | 'PLAYER_BLOCKED'
  | 'PLAYER_NOT_FOUND'
  | 'BLOCK_NOT_FOUND'
  | 'CANNOT_TARGET_ADMIN'

export interface RoomError {
  ok: false
  code: RoomErrorCode
  message: string
}

export interface RoomCreateResult {
  ok: true
  role: 'admin'
  code: string
  playerId: string
  /** Secret for resuming after a dropped socket or a full page refresh. */
  resumeToken: string
  room: RoomState
  adminState: AdminState
}

export interface RoomJoinResult {
  ok: true
  role: 'player'
  playerId: string
  resumeToken: string
  room: RoomState
}

export interface RoomResumePayload {
  token: string
}

export type AdminPhase = 'lobby' | 'question' | 'reveal' | 'final'

export type AdminPlayerStatus =
  | 'waiting'
  | 'answering'
  | 'answered'
  | 'correct'
  | 'wrong'
  | 'timeout'
  | 'finished'

/** One row of the admin's live standings. */
export interface AdminPlayerState {
  playerId: string
  name: string
  score: number
  correct: number
  rank: number
  connected: boolean
  status: AdminPlayerStatus
}

export interface BlockedPlayerState {
  /** Opaque block id used by `admin:unblock`. */
  id: string
  name: string
  blockedAt: number
}

/** Live spectator dashboard pushed only to the room admin. */
export interface AdminState {
  code: string
  status: RoomStatus
  phase: AdminPhase
  questionIndex: number
  questionTotal: number
  /** Server deadline for the current question or reveal; null in lobby/final. */
  endsAt: number | null
  serverNow: number
  admin: AdminSummary
  players: AdminPlayerState[]
  blocked: BlockedPlayerState[]
  maxPlayers: number
}

/** Enough state to put a reconnecting member straight back where they were. */
export type GameSnapshot =
  | { phase: 'lobby' }
  | { phase: 'admin'; admin: AdminState }
  | {
      phase: 'question'
      question: GameQuestionPayload
      answered: boolean
      selectedAnswer: number | null
      lifelines: LifelineState
      removedAnswers: number[]
    }
  | {
      phase: 'reveal'
      question: GameQuestionPayload
      reveal: GameRevealPayload
      answered: boolean
      lifelines: LifelineState
      removedAnswers: number[]
    }
  | { phase: 'final'; final: GameEndPayload }

export interface RoomResumeResult {
  ok: true
  role: MemberRole
  playerId: string
  /** Rotated on every successful resume; store the latest value. */
  resumeToken: string
  room: RoomState
  snapshot: GameSnapshot
  /** Present for admins, also embedded in the snapshot for convenience. */
  adminState?: AdminState
}

export interface RoomLeaveResult {
  ok: true
}

export interface RoomStartResult {
  ok: true
}

export interface RoomRematchResult {
  ok: true
}

export interface AdminActionPayload {
  playerId: string
}

export interface AdminUnblockPayload {
  blockId: string
}

export interface AdminActionResult {
  ok: true
}

export type AdminActionAck = AdminActionResult | RoomError
export type RoomCreateAck = RoomCreateResult | RoomError
export type RoomJoinAck = RoomJoinResult | RoomError
export type RoomResumeAck = RoomResumeResult | RoomError
export type RoomLeaveAck = RoomLeaveResult | RoomError
export type RoomStartAck = RoomStartResult | RoomError
export type RoomRematchAck = RoomRematchResult | RoomError

/** Sent to players when the admin intentionally leaves or its grace expires. */
export interface RoomClosedPayload {
  reason: 'admin_left' | 'admin_timeout'
  message: string
}

/** Sent only to a player the admin removed or blocked. */
export interface RoomKickedPayload {
  reason: 'kick' | 'block'
  message: string
}

// ── Question lifecycle ───────────────────────────────────────────────────────

/**
 * Public question shape. The authoritative `correct` index and explanation
 * stay on the server until the reveal event.
 */
export interface GameQuestion {
  id: number
  question: string
  answers: string[]
  difficulty: Difficulty
}

/** Broadcast when the server opens a question. */
export interface GameQuestionPayload {
  /** 1-based question number (1..total). */
  index: number
  total: number
  question: GameQuestion
  /** Server epoch ms; clients derive their local deadline from `serverNow`. */
  endsAt: number
  durationMs: number
  /** Server clock at emission, used to correct client clock skew. */
  serverNow: number
}

export interface AnswerSubmitPayload {
  /** Must match the currently open 1-based question index. */
  questionIndex: number
  /** 0-based answer index. */
  answerIndex: number
}

export type GameErrorCode =
  | 'NOT_IN_ROOM'
  | 'NOT_A_PLAYER'
  | 'ROOM_NOT_PLAYING'
  | 'NO_ACTIVE_QUESTION'
  | 'WRONG_QUESTION'
  | 'ALREADY_ANSWERED'
  | 'ANSWER_TOO_LATE'
  | 'INVALID_ANSWER'
  | 'ANSWER_REMOVED'
  | 'INVALID_LIFELINE'
  | 'LIFELINE_ALREADY_USED'
  | 'LIFELINE_NOT_ALLOWED'

export interface GameError {
  ok: false
  code: GameErrorCode
  message: string
}

export interface AnswerAccepted {
  ok: true
  accepted: true
  questionIndex: number
  receivedAt: number
}

export type AnswerAck = AnswerAccepted | GameError

// ── Lifelines ────────────────────────────────────────────────────────────────

export interface FiftyLifelineResult {
  type: 'fifty'
  /** Two incorrect answer indices to hide. Never contains the correct index. */
  removed: number[]
}

export interface PhoneLifelineResult {
  type: 'phone'
  suggestedIndex: number
  suggestedLetter: string
  suggestedText: string
  phrase: string
}

export interface AudienceLifelineResult {
  type: 'audience'
  /** Integer percentages for [A, B, C, D], always summing to 100. */
  percentages: [number, number, number, number]
  /** Highest-voted answer; it may be wrong. */
  displayWinnerId: number
}

export interface McLifelineResult {
  type: 'mc'
  suggestedIndex: number
  suggestedLetter: string
  suggestedText: string
}

export type LifelineResult =
  | FiftyLifelineResult
  | PhoneLifelineResult
  | AudienceLifelineResult
  | McLifelineResult

export interface LifelineUsePayload {
  type: LifelineType
  /** 1-based public question index; prevents a stale request from using a lifeline on the next question. */
  questionIndex: number
}

export interface LifelineAccepted {
  ok: true
  type: LifelineType
  result: LifelineResult
}

export type LifelineAck = LifelineAccepted | GameError

// ── Reveal and final ─────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  playerId: string
  name: string
  score: number
  correct: number
  rank: number
}

export interface AnswerDistribution {
  /** Counts for [A, B, C, D]. */
  counts: [number, number, number, number]
  noAnswer: number
}

/**
 * Per-player reveal. Correctness is only present here, after the server has
 * closed the question, never in `game:question`.
 */
export interface GameRevealPayload {
  index: number
  total: number
  correctIndex: number
  explanation: string
  distribution: AnswerDistribution
  yourAnswer: number | null
  yourCorrect: boolean
  /** Points earned this question (0 for a wrong answer or timeout). */
  yourDelta: number
  yourScore: number
  yourCorrectCount: number
  yourRank: number
  totalPlayers: number
  /** Top five after this question. */
  leaderboard: LeaderboardEntry[]
  revealDurationMs: number
  /** Server wall-clock deadline for this reveal (resume may show only remainder). */
  revealEndsAt: number
  /** Full lose-track duration; the between-question page may be shorter. */
  loseDurationMs: number
  serverNow: number
}

export interface FinalPlayerResult {
  rank: number
  score: number
  correct: number
}

/** Sent once to every player after the final reveal. */
export interface GameEndPayload {
  total: number
  /** Full final leaderboard, up to 40 entries. */
  leaderboard: LeaderboardEntry[]
  you: FinalPlayerResult
  /** Full lose-track duration for players outside the final top cut. */
  loseDurationMs: number
  serverNow: number
}

/**
 * Socket.IO event maps.
 *
 * Keeping the map here means the browser client and the server handlers share
 * one contract as the game loop grows.
 */
export interface ServerToClientEvents {
  'server:hello': (hello: ServerHello) => void
  'server:pong': (pong: ServerPong) => void
  'room:state': (state: RoomState) => void
  'room:error': (error: RoomError) => void
  'room:closed': (payload: RoomClosedPayload) => void
  'room:kicked': (payload: RoomKickedPayload) => void
  'admin:state': (state: AdminState) => void
  'game:question': (payload: GameQuestionPayload) => void
  'game:reveal': (payload: GameRevealPayload) => void
  'game:end': (payload: GameEndPayload) => void
}

export interface ClientToServerEvents {
  'client:ping': (payload: ClientPing, ack?: (pong: ServerPong) => void) => void
  'room:create': (payload: RoomCreatePayload, ack: (result: RoomCreateAck) => void) => void
  'room:join': (payload: RoomJoinPayload, ack: (result: RoomJoinAck) => void) => void
  'room:resume': (
    payload: RoomResumePayload,
    ack: (result: RoomResumeAck) => void,
  ) => void
  'room:leave': (
    payload: Record<string, never>,
    ack: (result: RoomLeaveAck) => void,
  ) => void
  'room:start': (
    payload: Record<string, never>,
    ack: (result: RoomStartAck) => void,
  ) => void
  'room:rematch': (
    payload: Record<string, never>,
    ack: (result: RoomRematchAck) => void,
  ) => void
  'admin:kick': (
    payload: AdminActionPayload,
    ack: (result: AdminActionAck) => void,
  ) => void
  'admin:block': (
    payload: AdminActionPayload,
    ack: (result: AdminActionAck) => void,
  ) => void
  'admin:unblock': (
    payload: AdminUnblockPayload,
    ack: (result: AdminActionAck) => void,
  ) => void
  'answer:submit': (
    payload: AnswerSubmitPayload,
    ack: (result: AnswerAck) => void,
  ) => void
  'lifeline:use': (
    payload: LifelineUsePayload,
    ack: (result: LifelineAck) => void,
  ) => void
}
