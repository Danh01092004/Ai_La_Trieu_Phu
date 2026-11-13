/** Runtime configuration for the realtime server. */
import {
  LOSE_PAGE_MS,
  QUESTION_TIME_MS,
  TOTAL_QUESTIONS,
} from '../src/config/multiplayerConfig.js'

/**
 * Vercel Hobby caps a WebSocket function at 300 seconds. A 15-question match
 * with the normal 6s reveal would take 315s before the final board, so the
 * serverless deployment uses a shorter reveal to leave room for the lobby and
 * the chicken page. Standalone/local runs keep the product's 6s.
 */
const IS_VERCEL = process.env.VERCEL === '1'
const DEFAULT_REVEAL_MS = IS_VERCEL ? 2_500 : 6_000

const DEFAULT_PORT = 3001
const MAX_PORT = 65_535
const MIN_QUESTION_MS = 250
const MAX_QUESTION_MS = 5 * 60_000

export const SERVICE_NAME = 'ai-la-trieu-phu-server'

function readPort(value: string | undefined): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT
    ? port
    : DEFAULT_PORT
}

function readBoundedInt(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export const PORT = readPort(process.env.PORT)

/** Bind to all interfaces so phones on the same LAN can connect. */
export const HOST = process.env.HOST?.trim() || '0.0.0.0'

/** Test/demo override; never exposed in the client UI. */
export const QUESTION_COUNT = readBoundedInt(
  process.env.QUESTION_COUNT,
  1,
  TOTAL_QUESTIONS,
  TOTAL_QUESTIONS,
)

/** Test/demo override for a full match; defaults to the product's 15s. */
export const QUESTION_DURATION_MS = readBoundedInt(
  process.env.QUESTION_MS,
  MIN_QUESTION_MS,
  MAX_QUESTION_MS,
  QUESTION_TIME_MS,
)

/** Small network allowance for answers already in flight at the deadline. */
export const ANSWER_GRACE_MS = 250

/**
 * How long the answer reveal (correct answer, distribution, leaderboard) stays
 * on screen before the next question. Overridable for fast integration tests.
 */
export const QUESTION_REVEAL_MS = readBoundedInt(
  process.env.REVEAL_MS,
  250,
  15_000,
  DEFAULT_REVEAL_MS,
)

/**
 * Full-screen chicken page duration. The lose music is ~6.1s, so the default
 * is slightly longer; the reveal timer below is extended to match.
 * Overridable so fast integration tests do not wait 6s per wrong answer.
 */
export const LOSE_DURATION_MS = readBoundedInt(
  process.env.LOSE_MS,
  250,
  15_000,
  LOSE_PAGE_MS,
)

/**
 * Keep a disconnected player in the room — with score, lifeline state and
 * host role intact — long enough for Socket.IO to reconnect or the browser to
 * reload. After this grace period the seat is removed normally.
 */
export const DISCONNECT_GRACE_MS = readBoundedInt(
  process.env.DISCONNECT_GRACE_MS,
  1_000,
  5 * 60_000,
  60_000,
)

/** Bank/preflight invariant: one match must be able to draw unique questions. */
export const REQUIRED_QUESTION_BANK_SIZE = QUESTION_COUNT
