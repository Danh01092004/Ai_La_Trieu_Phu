import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LifelineState, LifelineType } from '@/types'
import type {
  AdminActionAck,
  AdminState,
  AnswerAck,
  GameEndPayload,
  GameErrorCode,
  GameQuestionPayload,
  GameRevealPayload,
  GameSnapshot,
  LifelineAck,
  LifelineResult,
  RoomClosedPayload,
  RoomCreateAck,
  RoomError,
  RoomJoinAck,
  RoomKickedPayload,
  RoomLeaveAck,
  RoomRematchAck,
  RoomResumeAck,
  RoomStartAck,
  RoomState,
  WagerAck,
  WagerPercent,
} from '@/types/multiplayer'
import { getMultiplayerSocket, type MultiplayerSocket } from './socket'
import { gameErrorMessage, roomErrorMessage } from './messages'

export type RoomConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const REQUEST_TIMEOUT_MS = 7_000
const LEAVE_TIMEOUT_MS = 3_000
const SESSION_KEY = 'altp:multiplayer:session:v2'
const CLIENT_ID_KEY = 'altp:multiplayer:client:v1'
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

let memoryClientId: string | null = null

/**
 * Opaque browser identity for the admin's block list. It is not an account:
 * clearing site storage or using a private window gives a new identity. The
 * server also blocks by display name, so a rename alone cannot bypass a block.
 */
function getClientId(): string {
  try {
    const stored = window.localStorage.getItem(CLIENT_ID_KEY)
    if (stored && CLIENT_ID_PATTERN.test(stored)) return stored
  } catch {
    // localStorage may be unavailable in private mode; fall back to memory.
  }

  if (memoryClientId) return memoryClientId

  let generated = ''
  try {
    if (typeof crypto.randomUUID === 'function') {
      generated = crypto.randomUUID()
    } else {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      generated = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    generated = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }

  memoryClientId = generated
  try {
    window.localStorage.setItem(CLIENT_ID_KEY, generated)
  } catch {
    // Keep the in-memory value for this tab.
  }
  return generated
}

// sessionStorage is deliberate: it survives F5 and network drops but is
// scoped to one tab, so opening an invite in a second tab joins as a new
// player instead of stealing the first tab's resume token.
function sessionArea(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

interface StoredSession {
  token: string
  code: string
  playerId: string
  name: string
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionArea()?.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.code !== 'string' ||
      typeof parsed.playerId !== 'string' ||
      typeof parsed.name !== 'string'
    ) {
      return null
    }
    return parsed as StoredSession
  } catch {
    return null
  }
}

function writeSession(session: StoredSession): void {
  try {
    sessionArea()?.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Private mode/quota failures must not block the game itself.
  }
}

function clearSession(): void {
  try {
    sessionArea()?.removeItem(SESSION_KEY)
  } catch {
    // Ignore storage failures.
  }
}

const EMPTY_LIFELINES: LifelineState = {
  fifty: false,
  phone: false,
  audience: false,
  mc: false,
}


function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Không kết nối được máy chủ.'
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** The admin dashboard is the source of truth for the admin's room view. */
function roomFromAdmin(state: AdminState): RoomState {
  return {
    code: state.code,
    status: state.status,
    hostId: state.admin.id,
    admin: state.admin,
    players: state.players.map((player) => ({
      id: player.playerId,
      name: player.name,
      score: player.score,
      connected: player.connected,
    })),
    maxPlayers: state.maxPlayers,
  }
}

function emitCreate(socket: MultiplayerSocket, name: string): Promise<RoomCreateAck> {
  return new Promise((resolve) => {
    socket.emit('room:create', { name, clientId: getClientId() }, resolve)
  })
}

function emitJoin(
  socket: MultiplayerSocket,
  code: string,
  name: string,
): Promise<RoomJoinAck> {
  return new Promise((resolve) => {
    socket.emit('room:join', { code, name, clientId: getClientId() }, resolve)
  })
}

function emitStart(socket: MultiplayerSocket): Promise<RoomStartAck> {
  return new Promise((resolve) => {
    socket.emit('room:start', {}, resolve)
  })
}

function emitAnswer(
  socket: MultiplayerSocket,
  questionIndex: number,
  answerIndex: number,
): Promise<AnswerAck> {
  return new Promise((resolve) => {
    socket.emit('answer:submit', { questionIndex, answerIndex }, resolve)
  })
}

function emitWager(
  socket: MultiplayerSocket,
  questionIndex: number,
  percent: WagerPercent,
): Promise<WagerAck> {
  return new Promise((resolve) => {
    socket.emit('wager:submit', { questionIndex, percent }, resolve)
  })
}

function emitLifeline(
  socket: MultiplayerSocket,
  type: LifelineType,
  questionIndex: number,
): Promise<LifelineAck> {
  return new Promise((resolve) => {
    socket.emit('lifeline:use', { type, questionIndex }, resolve)
  })
}

function emitRematch(socket: MultiplayerSocket): Promise<RoomRematchAck> {
  return new Promise((resolve) => {
    socket.emit('room:rematch', {}, resolve)
  })
}

function emitKick(socket: MultiplayerSocket, playerId: string): Promise<AdminActionAck> {
  return new Promise((resolve) => {
    socket.emit('admin:kick', { playerId }, resolve)
  })
}

function emitBlock(socket: MultiplayerSocket, playerId: string): Promise<AdminActionAck> {
  return new Promise((resolve) => {
    socket.emit('admin:block', { playerId }, resolve)
  })
}

function emitUnblock(socket: MultiplayerSocket, blockId: string): Promise<AdminActionAck> {
  return new Promise((resolve) => {
    socket.emit('admin:unblock', { blockId }, resolve)
  })
}

function emitResume(socket: MultiplayerSocket, token: string): Promise<RoomResumeAck> {
  return new Promise((resolve) => {
    socket.emit('room:resume', { token }, resolve)
  })
}

/**
 * Owns the multiplayer socket for the `/multiplayer` page.
 *
 * Create/join/leave are request/ack operations; the authoritative room snapshot
 * always comes from `room:state`, so another player joining or leaving updates
 * this tab without polling.
 */
export function useRoom() {
  const socket = useMemo(() => getMultiplayerSocket(), [])
  const [room, setRoom] = useState<RoomState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [adminState, setAdminState] = useState<AdminState | null>(null)
  const [status, setStatus] = useState<RoomConnectionStatus>(() =>
    socket.connected ? 'connected' : 'connecting',
  )
  const [resuming, setResuming] = useState(() => Boolean(readSession()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState<GameQuestionPayload | null>(null)
  const [serverOffset, setServerOffset] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [answerErrorCode, setAnswerErrorCode] = useState<GameErrorCode | null>(null)
  const [wagerPercent, setWagerPercent] = useState<WagerPercent>(0)
  const [wagerAmount, setWagerAmount] = useState(0)
  const [wagerBusy, setWagerBusy] = useState(false)
  const [wagerError, setWagerError] = useState<string | null>(null)
  const [reveal, setReveal] = useState<GameRevealPayload | null>(null)
  const [final, setFinal] = useState<GameEndPayload | null>(null)
  const [lifelines, setLifelines] = useState<LifelineState>(EMPTY_LIFELINES)
  const [removedAnswers, setRemovedAnswers] = useState<number[]>([])
  const [lifelineResult, setLifelineResult] = useState<LifelineResult | null>(null)
  const [lifelineBusy, setLifelineBusy] = useState<LifelineType | null>(null)
  const [lifelineError, setLifelineError] = useState<string | null>(null)

  const roomRef = useRef<RoomState | null>(null)
  const playerIdRef = useRef<string | null>(null)
  const sessionRef = useRef<StoredSession | null>(readSession())
  const resumeInFlightRef = useRef(false)
  const resumeRetryRef = useRef<number | null>(null)
  const questionRef = useRef<GameQuestionPayload | null>(null)
  const answeredRef = useRef(false)
  const submittingRef = useRef(false)
  const wagerBusyRef = useRef(false)
  const busyRef = useRef(false)
  const lifelineBusyRef = useRef(false)
  const lifelinesRef = useRef<LifelineState>(EMPTY_LIFELINES)
  const mountedRef = useRef(true)

  const commitRoom = useCallback((next: RoomState | null) => {
    roomRef.current = next
    setRoom(next)
  }, [])

  const commitPlayer = useCallback((next: string | null) => {
    playerIdRef.current = next
    setPlayerId(next)
  }, [])

  const commitAdminState = useCallback((next: AdminState | null) => {
    setAdminState(next)
    if (next) commitRoom(roomFromAdmin(next))
  }, [commitRoom])

  const clearAnswer = useCallback(() => {
    answeredRef.current = false
    submittingRef.current = false
    setSelectedAnswer(null)
    setAnswered(false)
    setSubmitting(false)
    setAnswerError(null)
    setAnswerErrorCode(null)
  }, [])

  const resetWager = useCallback(() => {
    wagerBusyRef.current = false
    setWagerBusy(false)
    setWagerPercent(0)
    setWagerAmount(0)
    setWagerError(null)
  }, [])

  const commitQuestion = useCallback(
    (next: GameQuestionPayload | null) => {
      questionRef.current = next
      setQuestion(next)
      clearAnswer()
      resetWager()
      setReveal(null)
      setRemovedAnswers([])
      setLifelineResult(null)
      setLifelineError(null)
    },
    [clearAnswer, resetWager],
  )

  const commitLifelines = useCallback((next: LifelineState) => {
    lifelinesRef.current = next
    setLifelines(next)
  }, [])

  const resetMatchState = useCallback(() => {
    commitQuestion(null)
    commitLifelines(EMPTY_LIFELINES)
    setFinal(null)
    setLifelineBusy(null)
    lifelineBusyRef.current = false
  }, [commitLifelines, commitQuestion])

  const clearError = useCallback(() => setError(null), [])
  const clearAnswerError = useCallback(() => {
    setAnswerError(null)
    // Dismissing the late-answer alert must not unlock the question: the
    // server has already closed it. Other errors are safe to retry.
    setAnswerErrorCode((current) =>
      current === 'ANSWER_TOO_LATE' ? current : null,
    )
  }, [])

  const clearWagerError = useCallback(() => setWagerError(null), [])

  /** Restore the exact screen from a `room:resume` ack. */
  const applySnapshot = useCallback(
    (snapshot: GameSnapshot) => {
      if (snapshot.phase === 'admin') {
        resetMatchState()
        setFinal(null)
        commitAdminState(snapshot.admin)
        return
      }

      if (snapshot.phase === 'lobby') {
        resetMatchState()
        return
      }

      if (snapshot.phase === 'question') {
        setFinal(null)
        commitQuestion(snapshot.question)
        setServerOffset(snapshot.question.serverNow - Date.now())
        commitLifelines(snapshot.lifelines)
        setRemovedAnswers(snapshot.removedAnswers)
        setReveal(null)
        setWagerPercent(snapshot.wager.percent)
        setWagerAmount(snapshot.wager.amount)
        answeredRef.current = snapshot.answered
        setAnswered(snapshot.answered)
        setSelectedAnswer(snapshot.selectedAnswer)
        return
      }

      if (snapshot.phase === 'reveal') {
        setFinal(null)
        commitQuestion(snapshot.question)
        commitLifelines(snapshot.lifelines)
        setRemovedAnswers(snapshot.removedAnswers)
        setWagerPercent(snapshot.wager.percent)
        setWagerAmount(snapshot.wager.amount)
        answeredRef.current = true
        setAnswered(true)
        setSelectedAnswer(snapshot.reveal.yourAnswer)
        setServerOffset(snapshot.reveal.serverNow - Date.now())
        setReveal(snapshot.reveal)
        return
      }

      setReveal(null)
      commitQuestion(null)
      commitLifelines(EMPTY_LIFELINES)
      setFinal(snapshot.final)
      const current = roomRef.current
      if (current && current.status !== 'final') {
        commitRoom({ ...current, status: 'final' })
      }
    },
    [commitAdminState, commitLifelines, commitQuestion, commitRoom, resetMatchState],
  )

  useEffect(() => {
    mountedRef.current = true

    const clearResumeRetry = () => {
      if (resumeRetryRef.current === null) return
      window.clearTimeout(resumeRetryRef.current)
      resumeRetryRef.current = null
    }

    const attemptResume = async (attempt = 0) => {
      const session = sessionRef.current
      if (!session || resumeInFlightRef.current) return

      clearResumeRetry()
      resumeInFlightRef.current = true
      if (!roomRef.current) setResuming(true)

      try {
        const result = await timeout(
          emitResume(socket, session.token),
          REQUEST_TIMEOUT_MS,
          'Khôi phục phòng mất quá lâu.',
        )
        // A user can press "Rời phòng" while the resume request is in flight.
        // Do not let that stale response resurrect the room locally.
        if (!mountedRef.current || sessionRef.current?.token !== session.token) return

        if (!result.ok) {
          // A consumed/expired token is terminal. A network timeout is not;
          // keep it for the next automatic reconnect attempt.
          clearResumeRetry()
          clearSession()
          sessionRef.current = null
          commitPlayer(null)
          commitRoom(null)
          setAdminState(null)
          resetMatchState()
          setError(roomErrorMessage(result))
          return
        }

        const nextSession: StoredSession = {
          token: result.resumeToken,
          code: result.room.code,
          playerId: result.playerId,
          name: session.name,
        }
        sessionRef.current = nextSession
        writeSession(nextSession)
        commitPlayer(result.playerId)
        commitRoom(result.room)
        setAdminState(result.adminState ?? null)
        applySnapshot(result.snapshot)
        setError(null)
        clearResumeRetry()
      } catch (requestError: unknown) {
        if (
          mountedRef.current &&
          sessionRef.current?.token === session.token
        ) {
          setError(errorMessage(requestError))
          // A dropped resume ack is common on a flaky phone connection. Retry
          // twice while the socket is still alive, guarded by the token so a
          // manually created/joined session can never be overwritten.
          if (socket.connected && attempt < 2) {
            const expectedToken = session.token
            resumeRetryRef.current = window.setTimeout(() => {
              resumeRetryRef.current = null
              if (sessionRef.current?.token !== expectedToken) return
              void attemptResume(attempt + 1)
            }, 1_200)
          }
        }
      } finally {
        resumeInFlightRef.current = false
        if (mountedRef.current) setResuming(false)
      }
    }

    const onConnect = () => {
      if (!mountedRef.current) return
      clearResumeRetry()
      setStatus('connected')
      setError(null)
      if (sessionRef.current) void attemptResume()
    }

    const onDisconnect = () => {
      if (!mountedRef.current) return
      clearResumeRetry()
      setStatus('disconnected')
      // Keep the local room/question/reveal/final on screen while Socket.IO
      // retries. The server holds the seat during DISCONNECT_GRACE_MS.
      setSubmitting(false)
      submittingRef.current = false
      setLifelineBusy(null)
      lifelineBusyRef.current = false
      setError(
        sessionRef.current
          ? 'Mất kết nối máy chủ. Đang khôi phục phiên phòng...'
          : 'Mất kết nối máy chủ. Đang thử kết nối lại...',
      )
    }

    const onConnectError = (reason: Error) => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      if (!roomRef.current) setResuming(false)
      setError(`Không kết nối được máy chủ: ${reason.message}`)
    }

    const onRoomState = (next: RoomState) => {
      if (!mountedRef.current) return
      commitRoom(next)

      // A lobby snapshot is a fresh match (create, join or rematch): clear the
      // previous match, scores shown in reveal and used lifelines.
      if (next.status === 'lobby') {
        resetMatchState()
      } else if (next.status !== 'playing') {
        // final: keep `final` so the results screen survives the state packet.
        commitQuestion(null)
      }

      // Recover the stable id when `room:state` arrives before the ack, or on
      // a reconnect where the current socket id differs from the player id.
      const knownId = playerIdRef.current ?? sessionRef.current?.playerId
      if (knownId && next.players.some((player) => player.id === knownId)) {
        commitPlayer(knownId)
      }
    }

    const endSession = (message: string) => {
      if (!mountedRef.current) return
      clearResumeRetry()
      clearSession()
      sessionRef.current = null
      commitPlayer(null)
      commitRoom(null)
      setAdminState(null)
      resetMatchState()
      setServerOffset(0)
      setResuming(false)
      setError(message)
    }

    const onRoomError = (nextError: RoomError) => {
      if (!mountedRef.current) return
      setError(roomErrorMessage(nextError))
    }

    /** Admin-only dashboard; replaces both lobby and game screens for admin. */
    const onAdminState = (next: AdminState) => {
      if (!mountedRef.current) return
      commitAdminState(next)
      setResuming(false)
    }

    /**
     * The admin left or its 60s grace expired. The server has already removed
     * every player, so this tab returns to the entry screen with a clear
     * message instead of silently keeping a dead room.
     */
    const onRoomClosed = (payload: RoomClosedPayload) => {
      endSession(payload.message)
    }

    /** This player was kicked or blocked by the admin. */
    const onRoomKicked = (payload: RoomKickedPayload) => {
      endSession(payload.message)
    }

    const onGameQuestion = (next: GameQuestionPayload) => {
      if (!mountedRef.current) return
      setFinal(null)
      commitQuestion(next)
      // One-way latency means this offset is a few ms pessimistic. It is
      // stable for the round and far more accurate than trusting the client
      // clock; the server still owns the deadline.
      setServerOffset(next.serverNow - Date.now())
    }

    const onGameReveal = (next: GameRevealPayload) => {
      if (!mountedRef.current) return
      // The question is locked for good once the reveal is authoritative.
      answeredRef.current = true
      submittingRef.current = false
      setAnswered(true)
      setSubmitting(false)
      setAnswerError(null)
      setAnswerErrorCode(null)
      setReveal(next)
    }

    const onGameEnd = (next: GameEndPayload) => {
      if (!mountedRef.current) return
      const current = roomRef.current
      // Do not wait for the following `room:state` just to enable rematch:
      // a dropped state packet must not strand the admin on the final screen.
      if (current && current.status !== 'final') {
        commitRoom({ ...current, status: 'final' })
      }
      setReveal(null)
      commitQuestion(null)
      setFinal(next)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room:state', onRoomState)
    socket.on('room:error', onRoomError)
    socket.on('admin:state', onAdminState)
    socket.on('room:closed', onRoomClosed)
    socket.on('room:kicked', onRoomKicked)
    socket.on('game:question', onGameQuestion)
    socket.on('game:reveal', onGameReveal)
    socket.on('game:end', onGameEnd)

    if (socket.connected) {
      setStatus('connected')
      if (sessionRef.current) void attemptResume()
    } else {
      setStatus('connecting')
      socket.connect()
    }

    return () => {
      mountedRef.current = false
      clearResumeRetry()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room:state', onRoomState)
      socket.off('room:error', onRoomError)
      socket.off('admin:state', onAdminState)
      socket.off('room:closed', onRoomClosed)
      socket.off('room:kicked', onRoomKicked)
      socket.off('game:question', onGameQuestion)
      socket.off('game:reveal', onGameReveal)
      socket.off('game:end', onGameEnd)

      // An explicit unmount (leaving /multiplayer) ends the session. Defer
      // by one task so React StrictMode's dev-only fake unmount does not wipe
      // the real session: the second setup sets `mountedRef` back to true
      // before this timer runs.
      window.setTimeout(() => {
        if (mountedRef.current) return
        clearSession()
        if (socket.connected) {
          socket.emit('room:leave', {}, () => {})
        }
      }, 0)
    }
  }, [
    applySnapshot,
    commitAdminState,
    commitLifelines,
    commitPlayer,
    commitQuestion,
    commitRoom,
    resetMatchState,
    socket,
  ])

  const createRoom = useCallback(
    async (name: string): Promise<boolean> => {
      if (busyRef.current) return false
      if (!socket.connected) {
        setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
        return false
      }

      busyRef.current = true
      setBusy(true)
      setError(null)

      try {
        const result = await timeout(
          emitCreate(socket, name),
          REQUEST_TIMEOUT_MS,
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        )

        if (!mountedRef.current) return false
        if (!result.ok) {
          setError(roomErrorMessage(result))
          return false
        }

        commitPlayer(result.playerId)
        commitRoom(result.room)
        commitAdminState(result.adminState)
        const nextSession: StoredSession = {
          token: result.resumeToken,
          code: result.room.code,
          playerId: result.playerId,
          name,
        }
        sessionRef.current = nextSession
        writeSession(nextSession)
        setResuming(false)
        return true
      } catch (requestError: unknown) {
        // If `room:state` already arrived, the operation did succeed even when
        // the ack was lost; keep the room instead of reporting a false error.
        if (roomRef.current) return true

        if (mountedRef.current) setError(errorMessage(requestError))
        if (socket.connected) socket.emit('room:leave', {}, () => {})
        return false
      } finally {
        busyRef.current = false
        if (mountedRef.current) setBusy(false)
      }
    },
    [commitAdminState, commitPlayer, commitRoom, socket],
  )

  const joinRoom = useCallback(
    async (code: string, name: string): Promise<boolean> => {
      if (busyRef.current) return false
      if (!socket.connected) {
        setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
        return false
      }

      busyRef.current = true
      setBusy(true)
      setError(null)

      try {
        const result = await timeout(
          emitJoin(socket, code, name),
          REQUEST_TIMEOUT_MS,
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        )

        if (!mountedRef.current) return false
        if (!result.ok) {
          setError(roomErrorMessage(result))
          return false
        }

        setAdminState(null)
        commitPlayer(result.playerId)
        commitRoom(result.room)
        const nextSession: StoredSession = {
          token: result.resumeToken,
          code: result.room.code,
          playerId: result.playerId,
          name,
        }
        sessionRef.current = nextSession
        writeSession(nextSession)
        setResuming(false)
        return true
      } catch (requestError: unknown) {
        // Same as create: a late `room:state` means the join did succeed.
        if (roomRef.current) return true

        if (mountedRef.current) setError(errorMessage(requestError))
        if (socket.connected) socket.emit('room:leave', {}, () => {})
        return false
      } finally {
        busyRef.current = false
        if (mountedRef.current) setBusy(false)
      }
    },
    [commitPlayer, commitRoom, socket],
  )

  const startRoom = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false
    if (!socket.connected) {
      setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
      return false
    }

    const current = roomRef.current
    if (!current) {
      setError('Bạn chưa ở trong phòng nào.')
      return false
    }
    if (current.status === 'playing') return true

    busyRef.current = true
    setBusy(true)
    setError(null)

    try {
      const result = await timeout(
        emitStart(socket),
        REQUEST_TIMEOUT_MS,
        'Máy chủ không phản hồi. Vui lòng thử lại.',
      )

      if (!mountedRef.current) return false
      if (!result.ok) {
        setError(roomErrorMessage(result))
        return false
      }

      // The ack is authoritative. Switch the admin immediately instead of
      // waiting for the subsequent broadcast; guests still use `room:state`.
      if (roomRef.current?.status === 'lobby') {
        commitRoom({ ...roomRef.current, status: 'playing' })
      }
      return true
    } catch (requestError: unknown) {
      // A lost ack still becomes success when the broadcast already arrived.
      if (roomRef.current?.status === 'playing') return true

      if (mountedRef.current) setError(errorMessage(requestError))
      return false
    } finally {
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }, [commitRoom, socket])

  /**
   * Locks the local UI immediately, then relies on the server ack for
   * acceptance. A duplicate/tardy ack is surfaced as a clear state instead of
   * silently discarding the tap.
   */
  const submitAnswer = useCallback(
    async (answerIndex: number): Promise<boolean> => {
      const current = questionRef.current
      if (!current || answeredRef.current || submittingRef.current) return false

      if (!socket.connected) {
        setAnswerError('Chưa kết nối được máy chủ. Đáp án chưa được gửi.')
        setAnswerErrorCode(null)
        return false
      }

      if (
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= current.question.answers.length
      ) {
        return false
      }

      const questionIndex = current.index
      submittingRef.current = true
      setSubmitting(true)
      setSelectedAnswer(answerIndex)
      setAnswerError(null)
      setAnswerErrorCode(null)

      try {
        const result = await timeout(
          emitAnswer(socket, questionIndex, answerIndex),
          REQUEST_TIMEOUT_MS,
          'Máy chủ chưa xác nhận đáp án. Bạn có thể thử lại.',
        )

        if (!mountedRef.current || questionRef.current?.index !== questionIndex) {
          return false
        }

        if (result.ok) {
          answeredRef.current = true
          setAnswered(true)
          return true
        }

        setAnswerErrorCode(result.code)
        setAnswerError(gameErrorMessage(result))

        if (result.code === 'ALREADY_ANSWERED') {
          answeredRef.current = true
          setAnswered(true)
        } else if (result.code !== 'ANSWER_TOO_LATE') {
          setSelectedAnswer(null)
        }

        return false
      } catch (requestError: unknown) {
        if (mountedRef.current && questionRef.current?.index === questionIndex) {
          setAnswerError(errorMessage(requestError))
          setAnswerErrorCode(null)
        }
        return false
      } finally {
        submittingRef.current = false
        if (mountedRef.current) setSubmitting(false)
      }
    },
    [socket],
  )

  /**
   * Wagers can be changed several times before the server lock. The ack is
   * authoritative because it contains the package amount computed server-side.
   */
  const submitWager = useCallback(
    async (percent: WagerPercent): Promise<boolean> => {
      const current = questionRef.current
      if (!current || wagerBusyRef.current) return false

      if (!socket.connected) {
        setWagerError('Chưa kết nối được máy chủ. Chưa đổi được mức mang thêm.')
        return false
      }

      const questionIndex = current.index
      wagerBusyRef.current = true
      setWagerBusy(true)
      setWagerError(null)

      try {
        const result = await timeout(
          emitWager(socket, questionIndex, percent),
          REQUEST_TIMEOUT_MS,
          'Máy chủ chưa xác nhận mức mang thêm. Bạn có thể thử lại.',
        )

        if (!mountedRef.current || questionRef.current?.index !== questionIndex) {
          return false
        }

        if (!result.ok) {
          setWagerError(gameErrorMessage(result))
          return false
        }

        setWagerPercent(result.percent)
        setWagerAmount(result.amount)
        return true
      } catch (requestError: unknown) {
        if (mountedRef.current && questionRef.current?.index === questionIndex) {
          setWagerError(errorMessage(requestError))
        }
        return false
      } finally {
        wagerBusyRef.current = false
        if (mountedRef.current) setWagerBusy(false)
      }
    },
    [socket],
  )

  /**
   * Lifelines are server-authoritative: the client only disables a button
   * after the ack, and the server rejects a second use even if the UI is stale.
   */
  const useLifeline = useCallback(
    async (type: LifelineType): Promise<boolean> => {
      const current = questionRef.current
      if (!current || answeredRef.current || submittingRef.current || lifelineBusyRef.current) {
        return false
      }
      if (lifelinesRef.current[type]) return false
      if (!socket.connected) {
        setLifelineError('Chưa kết nối được máy chủ. Chưa dùng được trợ giúp.')
        return false
      }

      const questionIndex = current.index
      lifelineBusyRef.current = true
      setLifelineBusy(type)
      setLifelineError(null)

      try {
        const result = await timeout(
          emitLifeline(socket, type, questionIndex),
          REQUEST_TIMEOUT_MS,
          'Máy chủ chưa phản hồi trợ giúp. Bạn có thể thử lại.',
        )

        if (!mountedRef.current || questionRef.current?.index !== questionIndex) {
          return false
        }

        if (!result.ok) {
          setLifelineError(gameErrorMessage(result))
          if (result.code === 'LIFELINE_ALREADY_USED') {
            commitLifelines({ ...lifelinesRef.current, [type]: true })
          } else if (result.code === 'ALREADY_ANSWERED') {
            answeredRef.current = true
            setAnswered(true)
          }
          return false
        }

        const next = { ...lifelinesRef.current, [type]: true }
        commitLifelines(next)
        setLifelineResult(result.result)
        if (result.result.type === 'fifty') {
          setRemovedAnswers(result.result.removed)
        }
        return true
      } catch (requestError: unknown) {
        if (mountedRef.current && questionRef.current?.index === questionIndex) {
          setLifelineError(errorMessage(requestError))
        }
        return false
      } finally {
        lifelineBusyRef.current = false
        if (mountedRef.current) setLifelineBusy(null)
      }
    },
    [commitLifelines, socket],
  )

  const dismissLifelineResult = useCallback(() => setLifelineResult(null), [])
  const clearLifelineError = useCallback(() => setLifelineError(null), [])

  /** Admin-only return to the lobby after `game:end`; scores reset server-side. */
  const rematchRoom = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false
    if (!socket.connected) {
      setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
      return false
    }
    if (roomRef.current?.status !== 'final') return false

    busyRef.current = true
    setBusy(true)
    setError(null)

    try {
      const result = await timeout(
        emitRematch(socket),
        REQUEST_TIMEOUT_MS,
        'Máy chủ không phản hồi. Vui lòng thử lại.',
      )

      if (!mountedRef.current) return false
      if (!result.ok) {
        setError(roomErrorMessage(result))
        return false
      }

      const current = roomRef.current
      if (current) {
        commitRoom({
          ...current,
          status: 'lobby',
          players: current.players.map((player) => ({ ...player, score: 0 })),
        })
      }
      resetMatchState()
      return true
    } catch (requestError: unknown) {
      if (mountedRef.current) setError(errorMessage(requestError))
      return false
    } finally {
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }, [commitRoom, resetMatchState, socket])

  const kickPlayer = useCallback(
    async (playerId: string): Promise<boolean> => {
      if (!socket.connected) {
        setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
        return false
      }
      try {
        const result = await timeout(
          emitKick(socket, playerId),
          REQUEST_TIMEOUT_MS,
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        )
        if (!result.ok) {
          setError(roomErrorMessage(result))
          return false
        }
        return true
      } catch (requestError: unknown) {
        setError(errorMessage(requestError))
        return false
      }
    },
    [socket],
  )

  const blockPlayer = useCallback(
    async (playerId: string): Promise<boolean> => {
      if (!socket.connected) {
        setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
        return false
      }
      try {
        const result = await timeout(
          emitBlock(socket, playerId),
          REQUEST_TIMEOUT_MS,
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        )
        if (!result.ok) {
          setError(roomErrorMessage(result))
          return false
        }
        return true
      } catch (requestError: unknown) {
        setError(errorMessage(requestError))
        return false
      }
    },
    [socket],
  )

  const unblockPlayer = useCallback(
    async (blockId: string): Promise<boolean> => {
      if (!socket.connected) {
        setError('Chưa kết nối được máy chủ. Vui lòng thử lại.')
        return false
      }
      try {
        const result = await timeout(
          emitUnblock(socket, blockId),
          REQUEST_TIMEOUT_MS,
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        )
        if (!result.ok) {
          setError(roomErrorMessage(result))
          return false
        }
        return true
      } catch (requestError: unknown) {
        setError(errorMessage(requestError))
        return false
      }
    },
    [socket],
  )

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!roomRef.current) {
      clearSession()
      sessionRef.current = null
      commitRoom(null)
      commitPlayer(null)
      setAdminState(null)
      resetMatchState()
      setServerOffset(0)
      setError(null)
      setResuming(false)
      return
    }

    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)

    try {
      if (socket.connected) {
        await timeout(
          new Promise<RoomLeaveAck>((resolve) => {
            socket.emit('room:leave', {}, resolve)
          }),
          LEAVE_TIMEOUT_MS,
          'Rời phòng mất quá lâu.',
        )
      }
    } catch {
      // The local view still leaves; the server removes the socket on
      // disconnect or when the leave packet arrives.
    } finally {
      clearSession()
      sessionRef.current = null
      commitRoom(null)
      commitPlayer(null)
      setAdminState(null)
      resetMatchState()
      setServerOffset(0)
      setError(null)
      setResuming(false)
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }, [commitPlayer, commitRoom, resetMatchState, socket])

  const role: 'admin' | 'player' | null = room
    ? room.hostId === playerId
      ? 'admin'
      : 'player'
    : null

  return {
    room,
    playerId,
    role,
    adminState,
    status,
    resuming,
    busy,
    error,
    question,
    serverOffset,
    selectedAnswer,
    answered,
    submitting,
    answerError,
    answerErrorCode,
    wagerPercent,
    wagerAmount,
    wagerBusy,
    wagerError,
    reveal,
    final,
    lifelines,
    removedAnswers,
    lifelineResult,
    lifelineBusy,
    lifelineError,
    createRoom,
    joinRoom,
    startRoom,
    submitAnswer,
    submitWager,
    clearWagerError,
    useLifeline,
    dismissLifelineResult,
    clearLifelineError,
    rematchRoom,
    kickPlayer,
    blockPlayer,
    unblockPlayer,
    leaveRoom,
    clearError,
    clearAnswerError,
  }
}

export type RoomController = ReturnType<typeof useRoom>
