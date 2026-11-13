import { randomInt } from 'node:crypto'
import type { Server } from 'socket.io'
import rawQuestions from '../src/data/questions.json' with { type: 'json' }
import {
  MIN_QUESTION_BANK,
  pointsForLevel,
  WAGER_PERCENTS,
  wagerForScore,
} from '../src/config/multiplayerConfig.js'
import type { LifelineType, Question } from '../src/types'
import type {
  AdminPlayerStatus,
  AdminState,
  AnswerAck,
  AnswerDistribution,
  GameEndPayload,
  GameError,
  GameErrorCode,
  GameQuestion,
  GameQuestionPayload,
  GameRevealPayload,
  GameSnapshot,
  LeaderboardEntry,
  LifelineAck,
  LifelineResult,
  WagerAck,
  WagerPercent,
  WagerState,
} from '../src/types/multiplayer'
import {
  ANSWER_GRACE_MS,
  LOSE_DURATION_MS,
  QUESTION_COUNT,
  QUESTION_DURATION_MS,
  QUESTION_REVEAL_MS,
  WAGER_LOCK_MS,
} from './config.js'
import { ResultsStore } from './results.js'
import {
  generateAudience,
  generateFifty,
  generateMc,
  generatePhone,
} from './lifelines.js'
import { buildLeaderboard } from './ranking.js'
import { playingPlayers, type Room, type RoomManager } from './rooms.js'

const questionBank = rawQuestions as Question[]
const QUESTION_DIFFICULTIES = new Set<Question['difficulty']>([
  'easy',
  'medium',
  'hard',
  'very_hard',
])
const LIFELINE_TYPES = new Set<LifelineType>(['fifty', 'phone', 'audience', 'mc'])
const WAGER_PERCENT_SET = new Set<number>([0, ...WAGER_PERCENTS])

/**
 * Fail fast at boot rather than leaving a room stuck in `playing` when a
 * deployment accidentally removes questions from the bank.
 */
function assertQuestionBank(): void {
  if (questionBank.length < MIN_QUESTION_BANK) {
    throw new Error(
      `Question bank has ${questionBank.length} entries but at least ${MIN_QUESTION_BANK} are required.`,
    )
  }

  const ids = new Set<number>()
  for (const question of questionBank) {
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question id ${question.id} in src/data/questions.json.`)
    }
    ids.add(question.id)

    if (
      !Number.isInteger(question.id) ||
      !Array.isArray(question.answers) ||
      question.answers.length !== 4 ||
      !question.answers.every(
        (answer) => typeof answer === 'string' && answer.trim().length > 0,
      ) ||
      !Number.isInteger(question.correct) ||
      question.correct < 0 ||
      question.correct > 3 ||
      typeof question.question !== 'string' ||
      question.question.trim().length === 0 ||
      typeof question.explanation !== 'string' ||
      question.explanation.trim().length === 0 ||
      !QUESTION_DIFFICULTIES.has(question.difficulty)
    ) {
      throw new Error(`Question ${question.id} has an invalid public shape.`)
    }
  }
}

assertQuestionBank()

interface AnswerRecord {
  answerIndex: number
  receivedAt: number
}

interface WagerRecord {
  percent: WagerPercent
  amount: number
  receivedAt: number
}

interface RevealSnapshot {
  question: GameQuestion
  questionIndex: number
  questionTotal: number
  correctIndex: number
  explanation: string
  distribution: AnswerDistribution
  leaderboard: LeaderboardEntry[]
  totalPlayers: number
  revealDurationMs: number
  /** Wall-clock deadline for this reveal; lets a resumed client show only the remainder. */
  revealEndsAt: number
  loseDurationMs: number
  /** Wagers captured before scores changed, used to rebuild reveal deltas. */
  wagers: Map<string, WagerRecord>
  /** Score at the moment the question closed; used for the actual delta. */
  scoresBefore: Map<string, number>
}

interface MatchState {
  code: string
  questions: Question[]
  /** Pre-built public packets: no `correct` or `explanation` can leak. */
  publicQuestions: GameQuestion[]
  index: number
  total: number
  deadline: number
  questionOpenedAt: number
  open: boolean
  questionTimer: NodeJS.Timeout | null
  revealTimer: NodeJS.Timeout | null
  answers: Map<string, Map<number, AnswerRecord>>
  /** Per-player wager for the currently open question. */
  wagers: Map<string, WagerRecord>
  /** Per-player 50:50 removals for the currently open question. */
  fiftyRemoved: Map<string, number[]>
  /** Base reveal data kept so a reconnect can rebuild the personal payload. */
  lastReveal: RevealSnapshot | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function fail(code: GameErrorCode, message: string): GameError {
  return { ok: false, code, message }
}

function roomChannel(code: string): string {
  return `room:${code}`
}

/** Fisher-Yates with crypto randomness so question order is not predictable. */
function drawQuestions(count: number): Question[] {
  const pool = [...questionBank]

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]]
  }

  return pool.slice(0, count)
}

function toPublicQuestion(question: Question): GameQuestion {
  return {
    id: question.id,
    question: question.question,
    answers: [...question.answers],
    difficulty: question.difficulty,
  }
}

function findEntry(
  leaderboard: LeaderboardEntry[],
  playerId: string,
): LeaderboardEntry | undefined {
  return leaderboard.find((entry) => entry.playerId === playerId)
}

/**
 * Server-authoritative fixed-length match (default 15 questions).
 *
 * Per question:
 *   open 15s → grace 250ms → score + reveal (6s) → next question.
 * After the last reveal, every player gets a full final leaderboard.
 */
export class GameManager {
  private readonly matches = new Map<string, MatchState>()

  constructor(
    private readonly io: Server,
    private readonly rooms: RoomManager,
    private readonly results: ResultsStore,
  ) {}

  start(room: Room): boolean {
    if (this.matches.has(room.code)) return false

    // `assertQuestionBank` guarantees at least 25 unique entries at boot; this
    // guard keeps a future runtime configuration mistake from throwing inside
    // start.
    if (questionBank.length < MIN_QUESTION_BANK) return false

    const questions = drawQuestions(QUESTION_COUNT)
    const match: MatchState = {
      code: room.code,
      questions,
      publicQuestions: questions.map(toPublicQuestion),
      index: -1,
      total: questions.length,
      deadline: 0,
      questionOpenedAt: 0,
      open: false,
      questionTimer: null,
      revealTimer: null,
      answers: new Map(),
      wagers: new Map(),
      fiftyRemoved: new Map(),
      lastReveal: null,
    }

    room.questionTotal = questions.length
    this.matches.set(room.code, match)
    this.openQuestion(match, 0, Date.now())
    return true
  }

  answer(playerId: string, payload: unknown): AnswerAck {
    const room = this.rooms.getRoomForPlayer(playerId)
    if (!room) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    const member = room.players.get(playerId)
    if (!member || member.role !== 'player') {
      return fail('NOT_A_PLAYER', 'Quản trò chỉ theo dõi bảng xếp hạng, không trả lời câu hỏi.')
    }
    if (room.status !== 'playing') {
      return fail('ROOM_NOT_PLAYING', 'Ván đấu chưa bắt đầu.')
    }

    const match = this.matches.get(room.code)
    if (!match || match.index < 0) {
      return fail('NO_ACTIVE_QUESTION', 'Chưa có câu hỏi nào đang mở.')
    }

    const record = asRecord(payload)
    const questionIndex = record?.questionIndex
    const answerIndex = record?.answerIndex

    if (
      typeof questionIndex !== 'number' ||
      !Number.isInteger(questionIndex) ||
      questionIndex !== match.index + 1
    ) {
      return fail('WRONG_QUESTION', 'Câu hỏi đã thay đổi. Hãy trả lời ở câu hiện tại.')
    }

    // The protocol index is 1-based; keep the map keyed by that public index.
    const currentQuestionIndex = match.index + 1
    const playerAnswers = match.answers.get(playerId)
    if (playerAnswers?.has(currentQuestionIndex)) {
      return fail('ALREADY_ANSWERED', 'Bạn đã trả lời câu này rồi.')
    }

    const now = Date.now()
    if (!match.open || now > match.deadline + ANSWER_GRACE_MS) {
      return fail('ANSWER_TOO_LATE', 'Đã hết giờ cho câu này.')
    }

    const question = match.questions[match.index]
    if (
      typeof answerIndex !== 'number' ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= question.answers.length
    ) {
      return fail('INVALID_ANSWER', 'Đáp án không hợp lệ.')
    }

    if (match.fiftyRemoved.get(playerId)?.includes(answerIndex)) {
      return fail('ANSWER_REMOVED', 'Đáp án này đã bị loại bởi trợ giúp 50:50.')
    }

    const playerMap = playerAnswers ?? new Map<number, AnswerRecord>()
    playerMap.set(currentQuestionIndex, { answerIndex, receivedAt: now })
    match.answers.set(playerId, playerMap)

    // Keep the admin's "who has answered" view live without exposing the
    // chosen option or the correct answer.
    this.emitAdminState(room)

    return {
      ok: true,
      accepted: true,
      questionIndex: currentQuestionIndex,
      receivedAt: now,
    }
  }

  /**
   * Set the current question's wager. Repeated calls replace the previous
   * choice until the lock window; the amount is computed from the player's
   * current score and never from a client-supplied number.
   */
  wager(playerId: string, payload: unknown): WagerAck {
    const room = this.rooms.getRoomForPlayer(playerId)
    if (!room) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    const member = room.players.get(playerId)
    if (!member || member.role !== 'player') {
      return fail('NOT_A_PLAYER', 'Quản trò không thể mang thêm gói hàng.')
    }
    if (room.status !== 'playing') {
      return fail('ROOM_NOT_PLAYING', 'Ván đấu chưa bắt đầu.')
    }

    const match = this.matches.get(room.code)
    if (!match || match.index < 0) {
      return fail('NO_ACTIVE_QUESTION', 'Chưa có câu hỏi nào đang mở.')
    }

    const record = asRecord(payload)
    const questionIndex = record?.questionIndex
    const percent = record?.percent
    if (
      typeof questionIndex !== 'number' ||
      !Number.isInteger(questionIndex) ||
      questionIndex !== match.index + 1
    ) {
      return fail('WRONG_QUESTION', 'Câu hỏi đã thay đổi. Hãy chọn lại ở câu hiện tại.')
    }
    if (
      typeof percent !== 'number' ||
      !Number.isInteger(percent) ||
      !WAGER_PERCENT_SET.has(percent)
    ) {
      return fail('INVALID_WAGER', 'Mức mang thêm không hợp lệ.')
    }

    const now = Date.now()
    const wagerLockAt = match.deadline - WAGER_LOCK_MS
    if (!match.open || now >= wagerLockAt) {
      return fail('WAGER_LOCKED', 'Đã khóa mang thêm ở 3 giây cuối.')
    }

    const amount = wagerForScore(member.score, percent)
    if (percent > 0 && amount <= 0) {
      return fail(
        'WAGER_NOT_AVAILABLE',
        'Bạn chưa có đủ gói hàng để mang thêm ở mức này.',
      )
    }

    if (percent === 0) {
      match.wagers.delete(playerId)
    } else {
      match.wagers.set(playerId, {
        percent: percent as WagerPercent,
        amount,
        receivedAt: now,
      })
    }

    return {
      ok: true,
      percent: percent as WagerPercent,
      amount,
      wagerLockAt,
    }
  }

  /**
   * One use of each lifeline per player per match. The response contains only
   * what the player is allowed to see — never an `isCorrect` flag or the
   * correct answer index.
   */
  lifeline(playerId: string, payload: unknown): LifelineAck {
    const room = this.rooms.getRoomForPlayer(playerId)
    if (!room) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    const member = room.players.get(playerId)
    if (!member || member.role !== 'player') {
      return fail('NOT_A_PLAYER', 'Quản trò không thể dùng trợ giúp.')
    }
    if (room.status !== 'playing') {
      return fail('ROOM_NOT_PLAYING', 'Ván đấu chưa bắt đầu.')
    }

    const match = this.matches.get(room.code)
    if (!match || match.index < 0) {
      return fail('NO_ACTIVE_QUESTION', 'Chưa có câu hỏi nào đang mở.')
    }

    const record = asRecord(payload)
    const rawType = record?.type
    if (typeof rawType !== 'string' || !LIFELINE_TYPES.has(rawType as LifelineType)) {
      return fail('INVALID_LIFELINE', 'Trợ giúp không hợp lệ.')
    }
    const type = rawType as LifelineType

    const questionIndex = record?.questionIndex
    if (
      typeof questionIndex !== 'number' ||
      !Number.isInteger(questionIndex) ||
      questionIndex !== match.index + 1
    ) {
      return fail('WRONG_QUESTION', 'Câu hỏi đã thay đổi. Hãy dùng trợ giúp ở câu hiện tại.')
    }

    const player = room.players.get(playerId)
    if (!player) {
      return fail('NOT_IN_ROOM', 'Bạn không ở trong phòng nào.')
    }

    if (player.lifelines[type]) {
      return fail('LIFELINE_ALREADY_USED', 'Bạn đã dùng trợ giúp này rồi.')
    }

    const currentQuestionIndex = match.index + 1
    if (match.answers.get(playerId)?.has(currentQuestionIndex)) {
      return fail('ALREADY_ANSWERED', 'Bạn đã trả lời câu này rồi.')
    }

    const now = Date.now()
    if (!match.open || now > match.deadline + ANSWER_GRACE_MS) {
      return fail('LIFELINE_NOT_ALLOWED', 'Đã hết giờ cho câu này.')
    }

    const question = match.questions[match.index]
    let result: LifelineResult
    switch (type) {
      case 'fifty':
        result = generateFifty(question)
        match.fiftyRemoved.set(playerId, result.removed)
        break
      case 'phone':
        result = generatePhone(question)
        break
      case 'audience':
        result = generateAudience(question)
        break
      case 'mc':
        result = generateMc(question)
        break
    }

    player.lifelines[type] = true
    return { ok: true, type, result }
  }

  /**
   * Rebuild the minimal state for a reconnecting player. Returns null only if
   * the room is playing without a live match (which should not happen).
   */
  snapshot(room: Room, playerId: string): GameSnapshot | null {
    const player = room.players.get(playerId)
    if (!player) return null

    // The admin never receives question/reveal packets. Its reconnect snapshot
    // is always the safe leaderboard-only dashboard payload.
    if (player.role === 'admin') {
      return { phase: 'admin', admin: this.adminSnapshot(room) }
    }

    if (room.status === 'lobby') return { phase: 'lobby' }

    if (room.status === 'final') {
      const final = this.buildFinalPayload(room, room.questionTotal, playerId)
      return final ? { phase: 'final', final } : null
    }

    const match = this.matches.get(room.code)
    if (!match || match.index < 0) return null

    if (match.open) {
      const currentQuestionIndex = match.index + 1
      const answer = match.answers.get(playerId)?.get(currentQuestionIndex)
      return {
        phase: 'question',
        question: this.buildQuestionPayload(match),
        answered: Boolean(answer),
        selectedAnswer: answer?.answerIndex ?? null,
        wager: this.wagerState(match, playerId),
        lifelines: { ...player.lifelines },
        removedAnswers: [...(match.fiftyRemoved.get(playerId) ?? [])],
      }
    }

    if (match.lastReveal) {
      const reveal = this.buildRevealPayload(match, match.lastReveal, playerId)
      if (!reveal) return null
      return {
        phase: 'reveal',
        question: {
          index: match.lastReveal.questionIndex,
          total: match.lastReveal.questionTotal,
          question: match.lastReveal.question,
          endsAt: match.deadline,
          durationMs: QUESTION_DURATION_MS,
          wagerLockAt: match.deadline - WAGER_LOCK_MS,
          serverNow: Date.now(),
        },
        reveal,
        answered: true,
        wager: this.wagerState(match, playerId),
        lifelines: { ...player.lifelines },
        removedAnswers: [...(match.fiftyRemoved.get(playerId) ?? [])],
      }
    }

    return null
  }

  /**
   * Leaderboard-only dashboard for the admin. It deliberately contains no
   * question text, answers or correct index so a spectator screen cannot leak
   * the game to someone watching over the admin's shoulder.
   */
  adminSnapshot(room: Room): AdminState {
    if (room.status === 'lobby') {
      return this.rooms.toAdminState(room, 'lobby')
    }

    if (room.status === 'final') {
      return this.rooms.toAdminState(room, 'final')
    }

    const match = this.matches.get(room.code)
    if (!match || match.index < 0) {
      return this.rooms.toAdminState(room, 'question', {
        questionIndex: 0,
        questionTotal: room.questionTotal,
      })
    }

    const statuses = new Map<string, AdminPlayerStatus>()
    const phase = match.open ? 'question' : 'reveal'
    let questionIndex = match.index + 1
    let endsAt: number | null = match.open ? match.deadline : null

    if (match.open) {
      for (const player of playingPlayers(room)) {
        const answer = match.answers.get(player.id)?.get(questionIndex)
        statuses.set(player.id, answer ? 'answered' : 'answering')
      }
    } else if (match.lastReveal) {
      const base = match.lastReveal
      questionIndex = base.questionIndex
      endsAt = base.revealEndsAt
      for (const player of playingPlayers(room)) {
        const answer = match.answers.get(player.id)?.get(base.questionIndex)
        statuses.set(
          player.id,
          !answer
            ? 'timeout'
            : answer.answerIndex === base.correctIndex
              ? 'correct'
              : 'wrong',
        )
      }
    }

    return this.rooms.toAdminState(room, phase, {
      questionIndex,
      questionTotal: match.total,
      endsAt,
      statuses,
    })
  }

  /** Push the safe dashboard to the admin only. Players never receive it. */
  emitAdminState(room: Room): void {
    const admin = this.rooms.getAdmin(room)
    if (!admin || !admin.connected) return
    this.io.to(admin.id).emit('admin:state', this.adminSnapshot(room))
  }

  /** Drop a kicked player's transient answer state for the current match. */
  removePlayer(room: Room, playerId: string): void {
    const match = this.matches.get(room.code)
    if (!match) return
    match.answers.delete(playerId)
    match.fiftyRemoved.delete(playerId)
  }

  /** Stops all timers for a room whose last player left. */
  stop(code: string): void {
    const match = this.matches.get(code)
    if (!match) return

    if (match.questionTimer) clearTimeout(match.questionTimer)
    if (match.revealTimer) clearTimeout(match.revealTimer)
    this.matches.delete(code)
  }

  stopAll(): void {
    for (const code of this.matches.keys()) this.stop(code)
  }

  private buildQuestionPayload(
    match: MatchState,
    serverNow = Date.now(),
  ): GameQuestionPayload {
    return {
      index: match.index + 1,
      total: match.total,
      question: match.publicQuestions[match.index],
      endsAt: match.deadline,
      durationMs: QUESTION_DURATION_MS,
      wagerLockAt: match.deadline - WAGER_LOCK_MS,
      serverNow,
    }
  }

  private wagerState(match: MatchState, playerId: string): WagerState {
    const wager = match.wagers.get(playerId)
    return {
      percent: wager?.percent ?? 0,
      amount: wager?.amount ?? 0,
      wagerLockAt: match.deadline - WAGER_LOCK_MS,
    }
  }

  private buildRevealPayload(
    match: MatchState,
    base: RevealSnapshot,
    playerId: string,
  ): GameRevealPayload | null {
    const room = this.rooms.getRoom(match.code)
    const player = room?.players.get(playerId)
    if (!room || !player) return null

    const answer = match.answers.get(playerId)?.get(base.questionIndex) ?? null
    const entry = findEntry(base.leaderboard, playerId)
    if (!entry) return null

    const correct = answer?.answerIndex === base.correctIndex
    const baseReward = pointsForLevel(base.questionIndex)
    const wager = base.wagers.get(playerId)
    const wagerPercent = (wager?.percent ?? 0) as WagerPercent
    const wagerAmount = wager?.amount ?? 0
    const scoreBefore = base.scoresBefore.get(playerId) ?? player.score
    const wagerPenalty = correct ? 0 : Math.min(wagerAmount, scoreBefore)

    return {
      index: base.questionIndex,
      total: base.questionTotal,
      correctIndex: base.correctIndex,
      explanation: base.explanation,
      distribution: base.distribution,
      yourAnswer: answer?.answerIndex ?? null,
      yourCorrect: correct,
      yourBaseReward: baseReward,
      yourBaseDelta: correct ? baseReward : 0,
      yourWagerPercent: wagerPercent,
      yourWagerAmount: wagerAmount,
      yourWagerDelta: correct ? wagerAmount : -wagerPenalty,
      yourDelta: player.score - scoreBefore,
      yourScore: player.score,
      yourCorrectCount: player.correct,
      yourRank: entry.rank,
      totalPlayers: base.totalPlayers,
      leaderboard: base.leaderboard.slice(0, 5),
      revealDurationMs: base.revealDurationMs,
      revealEndsAt: base.revealEndsAt,
      loseDurationMs: base.loseDurationMs,
      serverNow: Date.now(),
    }
  }

  private buildFinalPayload(
    room: Room,
    total: number,
    playerId: string,
  ): GameEndPayload | null {
    const leaderboard = buildLeaderboard(playingPlayers(room))
    const entry = findEntry(leaderboard, playerId)
    if (!entry) return null

    return {
      total,
      leaderboard,
      you: {
        rank: entry.rank,
        score: entry.score,
        correct: entry.correct,
      },
      loseDurationMs: LOSE_DURATION_MS,
      serverNow: Date.now(),
    }
  }

  private openQuestion(match: MatchState, index: number, now: number): void {
    match.index = index
    match.deadline = now + QUESTION_DURATION_MS
    match.questionOpenedAt = now
    match.open = true
    match.fiftyRemoved.clear()
    match.wagers.clear()
    match.lastReveal = null

    const room = this.rooms.getRoom(match.code)
    if (room) {
      const payload = this.buildQuestionPayload(match, now)
      // Personal emits keep the admin (who is not a player) and any socket
      // that already left the room from receiving the question.
      for (const player of playingPlayers(room)) {
        this.io.to(player.id).emit('game:question', payload)
      }
      this.emitAdminState(room)
    }

    match.questionTimer = setTimeout(
      () => this.closeQuestion(match.code, index),
      QUESTION_DURATION_MS + ANSWER_GRACE_MS,
    )
    match.questionTimer.unref()
  }

  private closeQuestion(code: string, expectedIndex: number): void {
    const match = this.matches.get(code)
    if (!match || !match.open || match.index !== expectedIndex) return

    match.open = false
    if (match.questionTimer) {
      clearTimeout(match.questionTimer)
      match.questionTimer = null
    }

    const room = this.rooms.getRoom(code)
    if (!room) {
      this.matches.delete(code)
      return
    }

    const question = match.questions[match.index]
    const currentQuestionIndex = match.index + 1
    const players = playingPlayers(room)
    const distribution: AnswerDistribution = {
      counts: [0, 0, 0, 0],
      noAnswer: 0,
    }

    for (const player of players) {
      const answer = match.answers.get(player.id)?.get(currentQuestionIndex)
      if (!answer) {
        distribution.noAnswer += 1
        continue
      }
      distribution.counts[answer.answerIndex] += 1
    }

    // Capture the pre-score state so the reveal can show the exact base and
    // wager deltas, including the zero-floor on a wrong answer.
    const wagers = new Map(match.wagers)
    const scoresBefore = new Map(
      players.map((player) => [player.id, player.score] as const),
    )
    const baseReward = pointsForLevel(currentQuestionIndex)

    // Score every player first so the leaderboard and each player's rank use
    // exactly the same snapshot.
    for (const player of players) {
      const answer = match.answers.get(player.id)?.get(currentQuestionIndex)
      const wager = wagers.get(player.id)
      const wagerAmount = wager?.amount ?? 0

      if (answer && answer.answerIndex === question.correct) {
        player.score += baseReward + wagerAmount
        player.correct += 1
        player.totalMs += Math.max(0, answer.receivedAt - match.questionOpenedAt)
      } else if (wagerAmount > 0) {
        // Wrong/timeout forfeits the base reward (it is simply not added) and
        // loses the packages carried into the question, never below zero.
        player.score = Math.max(0, player.score - wagerAmount)
      }
    }

    const leaderboard = buildLeaderboard(players)
    const hasLose = players.some((player) => {
      const answer = match.answers.get(player.id)?.get(currentQuestionIndex)
      return !answer || answer.answerIndex !== question.correct
    })
    // The full-screen chicken page owns the lose music; keep the reveal open
    // long enough for the track to finish, then a short cushion.
    const revealDurationMs = hasLose
      ? Math.max(QUESTION_REVEAL_MS, LOSE_DURATION_MS + 300)
      : QUESTION_REVEAL_MS
    const revealEndsAt = Date.now() + revealDurationMs
    const base: RevealSnapshot = {
      question: match.publicQuestions[match.index],
      questionIndex: currentQuestionIndex,
      questionTotal: match.total,
      correctIndex: question.correct,
      explanation: question.explanation,
      distribution,
      leaderboard,
      totalPlayers: players.length,
      revealDurationMs,
      revealEndsAt,
      loseDurationMs: LOSE_DURATION_MS,
      wagers,
      scoresBefore,
    }
    match.lastReveal = base

    for (const player of players) {
      const payload = this.buildRevealPayload(match, base, player.id)
      if (payload) this.io.to(player.id).emit('game:reveal', payload)
    }

    // Keep the lobby/final snapshot's score column in sync with the reveal.
    this.io.to(roomChannel(room.code)).emit('room:state', this.rooms.toState(room))
    this.emitAdminState(room)

    match.revealTimer = setTimeout(() => {
      match.revealTimer = null
      if (match.index + 1 >= match.total) {
        this.finish(match)
      } else {
        this.openQuestion(match, match.index + 1, Date.now())
      }
    }, Math.max(0, revealEndsAt - Date.now()))
    match.revealTimer.unref()
  }

  private finish(match: MatchState): void {
    const room = this.rooms.getRoom(match.code)
    if (!room) {
      this.matches.delete(match.code)
      return
    }

    room.status = 'final'
    room.questionTotal = match.total
    room.lastActivity = Date.now()
    const players = playingPlayers(room)

    for (const player of players) {
      const payload = this.buildFinalPayload(room, match.total, player.id)
      if (payload) this.io.to(player.id).emit('game:end', payload)
    }

    const leaderboard = buildLeaderboard(players)
    try {
      this.results.recordMatch({
        roomCode: room.code,
        total: match.total,
        players: leaderboard.map((entry) => ({
          name: entry.name,
          score: entry.score,
          correct: entry.correct,
          rank: entry.rank,
        })),
      })
    } catch (error) {
      // A storage failure must not stop the final screen or rematch path.
      console.error('[results] could not record finished match', error)
    }

    this.io.to(roomChannel(room.code)).emit('room:state', this.rooms.toState(room))
    this.emitAdminState(room)
    this.matches.delete(match.code)
  }
}
