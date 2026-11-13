import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { LifelineType } from '@/types'
import { GameScene } from '@/components/GameScene'
import { ActionButton } from '@/components/ui/ActionButton'
import { TextField } from '@/components/ui/TextField'
import { AdminRoom } from '@/components/multi/AdminRoom'
import { ChickenLossPage } from '@/components/multi/ChickenLossPage'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { MatchStarting } from '@/components/multi/MatchStarting'
import { MultiplayerFinal } from '@/components/multi/MultiplayerFinal'
import { MultiplayerGame } from '@/components/multi/MultiplayerGame'
import { MultiplayerReveal } from '@/components/multi/MultiplayerReveal'
import { RoomLobby } from '@/components/multi/RoomLobby'
import {
  ChevronLeftIcon,
  PlayIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/icons'
import { useRoom } from '@/multiplayer/useRoom'
import {
  MAX_PLAYERS,
  FINAL_TOP_COUNT,
  LOSE_PAGE_MS,
  QUICK_LOSE_PAGE_MS,
  QUESTION_TIME_MS,
  TOTAL_QUESTIONS,
} from '@/config/multiplayerConfig'
import { useSettingsActions } from '@/state/SettingsContext'
import { useSfxActions } from '@/hooks/useSfxActions'
import { ANSWER_LETTERS, cn } from '@/utils'

const NAME_STORAGE_KEY = 'altp:multiplayer-name'
const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 16
const CODE_LENGTH = 6

function readStoredName(): string {
  try {
    return [...(window.localStorage.getItem(NAME_STORAGE_KEY) ?? '')]
      .slice(0, NAME_MAX_LENGTH)
      .join('')
  } catch {
    return ''
  }
}

function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_STORAGE_KEY, name)
  } catch {
    // Private mode / quota errors must not block joining a room.
  }
}

/** Keep only the room-code alphabet so invalid characters never reach the server. */
function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, '')
    .slice(0, CODE_LENGTH)
}

function validateName(name: string): string | null {
  const length = [...name.trim()].length

  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) {
    return `Tên phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự.`
  }

  return null
}

/**
 * Multiplayer entry, lobby, live question, reveal and final screen.
 *
 * Flow: Home → /multiplayer → create (admin) / join (player) → lobby → admin start → 15 questions
 * → reveal after each → final + rematch. The server owns rooms, question
 * order, scoring and deadlines; this page renders snapshots and forwards taps.
 */
export function Multiplayer() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()
  const onChickenRoute = location.pathname.replace(/\/+$/, '').endsWith('/chicken')
  const [dismissedReveal, setDismissedReveal] = useState<string | null>(null)
  const [dismissedFinalChicken, setDismissedFinalChicken] = useState<string | null>(null)
  const {
    playSfx,
    unlockAudio,
    startMusic,
    stopMusic,
    stopLoseMusic,
  } = useSettingsActions()
  const { hover } = useSfxActions()

  const {
    room,
    playerId,
    role,
    adminState,
    status,
    resuming,
    busy,
    error,
    question,
    reveal,
    final,
    serverOffset,
    selectedAnswer,
    answered,
    submitting,
    answerError,
    answerErrorCode,
    lifelines,
    removedAnswers,
    lifelineResult,
    lifelineBusy,
    lifelineError,
    createRoom,
    joinRoom,
    startRoom,
    submitAnswer,
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
  } = useRoom()

  const finalKey =
    room && final ? `${room.code}-${final.total}-${final.you.rank}` : null
  const finalLoser =
    final !== null && (final.you.rank < 1 || final.you.rank > FINAL_TOP_COUNT)

  const inviteCode = normalizeCode(searchParams.get('code') ?? '')
  const [name, setName] = useState(readStoredName)
  const [code, setCode] = useState(inviteCode)
  const [nameError, setNameError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'join' | null>(null)

  useEffect(() => {
    if (inviteCode) {
      setCode(inviteCode)
      setCodeError(null)
    }
  }, [inviteCode])

  const connected = status === 'connected'
  const formDisabled = !connected || busy
  const creating = pending === 'create'
  const joining = pending === 'join'

  const handleNameChange = (value: string) => {
    setName([...value].slice(0, NAME_MAX_LENGTH).join(''))
    if (nameError) setNameError(null)
    if (error) clearError()
  }

  const handleCodeChange = (value: string) => {
    setCode(normalizeCode(value))
    if (codeError) setCodeError(null)
    if (error) clearError()
  }

  const handleCreate = async (event?: FormEvent) => {
    event?.preventDefault()
    if (pending || busy) return
    unlockAudio()

    const validation = validateName(name)
    if (validation) {
      setNameError(validation)
      return
    }

    const trimmedName = name.trim()
    setNameError(null)
    setCodeError(null)
    rememberName(trimmedName)
    setPending('create')

    try {
      await createRoom(trimmedName)
    } finally {
      setPending(null)
    }
  }

  const handleJoin = async (event?: FormEvent) => {
    event?.preventDefault()
    if (pending || busy) return
    unlockAudio()

    const validation = validateName(name)
    if (validation) {
      setNameError(validation)
      return
    }

    if (code.length !== CODE_LENGTH) {
      setCodeError(`Mã phòng phải có đủ ${CODE_LENGTH} ký tự.`)
      return
    }

    const trimmedName = name.trim()
    setNameError(null)
    setCodeError(null)
    rememberName(trimmedName)
    setPending('join')

    try {
      await joinRoom(code, trimmedName)
    } finally {
      setPending(null)
    }
  }

  const handleBack = () => {
    playSfx('click')
    navigate('/')
  }

  const handleRoomHome = () => {
    playSfx('click')
    navigate('/')
  }

  const handleLeave = () => {
    playSfx('click')
    void leaveRoom()
  }

  const handleAnswer = useCallback(
    (index: number) => {
      unlockAudio()
      void submitAnswer(index)
    },
    [submitAnswer, unlockAudio],
  )

  const handleLifeline = useCallback(
    (type: LifelineType) => {
      unlockAudio()
      void useLifeline(type)
    },
    [unlockAudio, useLifeline],
  )

  const handleStart = useCallback(async () => {
    unlockAudio()
    return startRoom()
  }, [startRoom, unlockAudio])

  const handleRematch = useCallback(() => {
    unlockAudio()
    void rematchRoom()
  }, [rematchRoom, unlockAudio])

  // A quick chicken page deliberately leaves the lose track running under the
  // reveal. If the whole page is left, make sure it cannot outlive the match.
  useEffect(() => () => stopLoseMusic(), [stopLoseMusic])

  // Keep the lobby music alive between matches, but never fight the lose sting
  // during a reveal. `startMusic` is idempotent. The quick chicken page lets
  // the lose track finish under the reveal; the next question stops it.
  useEffect(() => {
    if (!room) {
      stopLoseMusic()
      return
    }
    if (
      room.status === 'lobby' ||
      (room.status === 'playing' && question && !reveal)
    ) {
      stopLoseMusic()
      startMusic()
    } else if (room.status === 'playing' && !reveal) {
      // The reveal ended without another question (for example a dropped
      // packet); do not let a quick-page track outlive it.
      stopLoseMusic()
    }
    if (room.status === 'final') {
      stopMusic()
      // A final loser is about to start the full chicken page, which owns the
      // lose track. The final board (top 5) stops it instead.
      if (!finalLoser) stopLoseMusic()
    }
  }, [finalLoser, question, reveal, room, startMusic, stopLoseMusic, stopMusic])

  const revealKey =
    room && question && reveal ? `${room.code}-${question.index}` : null
  const isLastQuestion = question !== null && question.index >= question.total

  // A new question (or a rematch back to question 1) must be allowed to show
  // the chicken page again even though the room/code did not change.
  useEffect(() => {
    setDismissedReveal(null)
  }, [revealKey])

  // Rematch clears `final`; the next final must show the loser page again.
  useEffect(() => {
    if (!final) setDismissedFinalChicken(null)
  }, [final])

  // Wrong/timeout gets its own route. Keeping this page mounted across the
  // route change is what preserves the live socket and question state.
  useEffect(() => {
    if (!revealKey || !reveal || isLastQuestion) {
      if (onChickenRoute) navigate('/multiplayer', { replace: true })
      return
    }

    if (reveal.yourCorrect) {
      if (onChickenRoute) navigate('/multiplayer', { replace: true })
      return
    }

    if (dismissedReveal === revealKey) {
      if (onChickenRoute) navigate('/multiplayer', { replace: true })
      return
    }

    if (!onChickenRoute) navigate('/multiplayer/chicken', { replace: true })
  }, [dismissedReveal, isLastQuestion, navigate, onChickenRoute, reveal, revealKey])

  if (
    room &&
    question &&
    reveal &&
    !reveal.yourCorrect &&
    // The last question has no "next question"; its loser gets the full final page.
    !isLastQuestion &&
    dismissedReveal !== revealKey
  ) {
    return (
      <GameScene variant="lose">
        <ChickenLossPage
          key={revealKey}
          mode="answer"
          reason={reveal.yourAnswer === null ? 'timeout' : 'wrong'}
          correctLetter={ANSWER_LETTERS[reveal.correctIndex] ?? '?'}
          correctText={question.question.answers[reveal.correctIndex] ?? ''}
          explanation={reveal.explanation}
          durationMs={Math.min(
            QUICK_LOSE_PAGE_MS,
            reveal.loseDurationMs ?? QUICK_LOSE_PAGE_MS,
            Math.max(250, reveal.revealEndsAt - reveal.serverNow),
          )}
          keepLoseMusic
          onDone={() => {
            setDismissedReveal(revealKey)
            navigate('/multiplayer', { replace: true })
          }}
        />
      </GameScene>
    )
  }

  if (resuming && !room) {
    return (
      <GameScene variant="home">
        <div className="flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <span className="block h-10 w-10 animate-spin rounded-full border-2 border-gold-300/25 border-t-gold-300 motion-reduce:animate-none" />
          <p className="mt-4 font-display text-sm uppercase tracking-[0.2em] text-gold-200">
            Đang khôi phục phiên phòng...
          </p>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/50">
            Điểm số, câu hỏi và trợ giúp của bạn sẽ được giữ nguyên.
          </p>
        </div>
      </GameScene>
    )
  }

  if (room && role === 'admin') {
    return (
      <GameScene variant={adminState?.phase === 'final' ? 'win' : 'home'}>
        <AdminRoom
          room={room}
          state={adminState}
          status={status}
          busy={busy}
          error={error}
          onStart={handleStart}
          onRematch={handleRematch}
          onLeave={handleLeave}
          onKick={kickPlayer}
          onBlock={blockPlayer}
          onUnblock={unblockPlayer}
          onClearError={clearError}
        />
      </GameScene>
    )
  }

  if (room && final && finalLoser && finalKey && dismissedFinalChicken !== finalKey) {
    return (
      <GameScene variant="lose">
        <ChickenLossPage
          key={finalKey}
          mode="final"
          rank={final.you.rank}
          score={final.you.score}
          totalPlayers={final.leaderboard.length}
          totalQuestions={final.total}
          durationMs={final.loseDurationMs ?? LOSE_PAGE_MS}
          onDone={() => setDismissedFinalChicken(finalKey)}
        />
      </GameScene>
    )
  }

  if (room) {
    if (final) {
      return (
        <GameScene variant={finalLoser ? 'lose' : 'win'}>
          <MultiplayerFinal
            room={room}
            final={final}
            playerId={playerId}
            status={status}
            busy={busy}
            error={error}
            onLeave={handleLeave}
            onClearError={clearError}
          />
        </GameScene>
      )
    }

    if (question) {
      if (reveal) {
        return (
          <GameScene variant="game">
            <MultiplayerReveal
              key={`${room.code}-${question.index}-reveal`}
              room={room}
              question={question}
              reveal={reveal}
              playerId={playerId}
              status={status}
              busy={busy}
              removedAnswers={removedAnswers}
              onLeave={handleLeave}
            />
          </GameScene>
        )
      }

      return (
        <GameScene variant="game">
          <MultiplayerGame
            key={`${room.code}-${question.index}`}
            room={room}
            question={question}
            playerId={playerId}
            status={status}
            serverOffset={serverOffset}
            selectedAnswer={selectedAnswer}
            answered={answered}
            submitting={submitting}
            answerError={answerError}
            answerErrorCode={answerErrorCode}
            lifelines={lifelines}
            removedAnswers={removedAnswers}
            lifelineResult={lifelineResult}
            lifelineBusy={lifelineBusy}
            lifelineError={lifelineError}
            busy={busy}
            onAnswer={handleAnswer}
            onLifeline={handleLifeline}
            onDismissLifelineResult={dismissLifelineResult}
            onClearLifelineError={clearLifelineError}
            onLeave={handleLeave}
            onClearAnswerError={clearAnswerError}
          />
        </GameScene>
      )
    }

    if (room.status === 'playing') {
      return (
        <GameScene variant="home">
          <MatchStarting
            room={room}
            status={status}
            busy={busy}
            onLeave={handleLeave}
            onHome={handleRoomHome}
          />
        </GameScene>
      )
    }

    if (room.status === 'final') {
      return (
        <GameScene variant="win">
          <div className="flex h-[100dvh] items-center justify-center px-6 text-center">
            <div>
              <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-2 border-gold-300/25 border-t-gold-300 motion-reduce:animate-none" />
              <p className="mt-4 font-display text-sm uppercase tracking-[0.2em] text-gold-200">
                Đang tổng kết ván đấu...
              </p>
            </div>
          </div>
        </GameScene>
      )
    }

    return (
      <GameScene variant="home">
        <RoomLobby
          room={room}
          playerId={playerId}
          status={status}
          busy={busy}
          error={error}
          onLeave={handleLeave}
          onHome={handleRoomHome}
          onClearError={clearError}
        />
      </GameScene>
    )
  }

  return (
    <GameScene variant="home">
      <div className="h-[100dvh] w-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-7">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Quay lại trang chủ"
              className="glass flex min-h-[44px] items-center gap-1.5 rounded-2xl px-3 py-2 font-display text-xs uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 sm:px-4"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Trang chủ</span>
            </button>

            <ConnectionBadge status={status} />
          </header>

          <main className="flex flex-1 flex-col justify-center py-4 sm:py-5">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
              className="text-center"
            >
              <p className="font-display text-[10px] uppercase tracking-[0.4em] text-gold-300/70 sm:text-xs">
                Đấu trường {MAX_PLAYERS} người chơi
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-[0.16em] text-gold-300 text-glow-gold sm:text-4xl">
                CHƠI CÙNG BẠN BÈ
              </h1>
              <p className="mx-auto mt-3 hidden max-w-lg text-sm leading-relaxed text-white/55 sm:block">
                Tạo phòng với vai trò quản trò hoặc nhập mã 6 ký tự để chơi. Một phòng tối đa{' '}
                {MAX_PLAYERS} người chơi + 1 quản trò, {TOTAL_QUESTIONS} câu hỏi và{' '}
                {Math.round(QUESTION_TIME_MS / 1_000)} giây cho mỗi câu.
              </p>
            </motion.div>

            {error && (
              <div
                role="alert"
                className="mx-auto mt-5 flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                <p className="flex-1 leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={clearError}
                  aria-label="Đóng thông báo"
                  className="min-h-[44px] min-w-[44px] rounded-lg text-lg leading-none text-red-200/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"
                >
                  ×
                </button>
              </div>
            )}

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.08, ease: 'easeOut' }}
              className="glass mx-auto mt-4 w-full max-w-2xl rounded-3xl p-4 sm:mt-6 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-300/25 bg-gold-400/10 text-gold-200">
                  <UsersIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[10px] uppercase tracking-[0.28em] text-white/60">
                    Hồ sơ của bạn
                  </p>
                  <p className="mt-0.5 hidden text-sm text-white/55 sm:block">
                    Tên này sẽ hiện với những người trong phòng.
                  </p>
                </div>
              </div>

              <TextField
                className="mt-3 sm:mt-4"
                label="Tên hiển thị"
                value={name}
                onChange={handleNameChange}
                placeholder="VD: Minh Anh"
                hint={`${NAME_MIN_LENGTH}–${NAME_MAX_LENGTH} ký tự.`}
                error={nameError}
                maxLength={NAME_MAX_LENGTH}
                autoComplete="nickname"
                disabled={busy}
              />
            </motion.section>

            <div className="mx-auto mt-4 grid w-full max-w-4xl gap-4 md:grid-cols-2">
              <motion.form
                onSubmit={handleCreate}
                aria-busy={busy}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.14, ease: 'easeOut' }}
                className="glass relative flex flex-col overflow-hidden rounded-3xl p-4 sm:p-6"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-[10px] uppercase tracking-[0.28em] text-gold-300/70">
                      01 · Tạo phòng
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold tracking-widest text-white">
                      MỞ PHÒNG MỚI
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold-300/25 bg-gold-400/10 px-2.5 py-1 font-display text-[9px] uppercase tracking-[0.18em] text-gold-200">
                    <ShieldIcon className="h-3 w-3" />
                    Quản trò
                  </span>
                </div>

                <p className="mt-3 hidden flex-1 text-sm leading-relaxed text-white/60 sm:block">
                  Bạn là quản trò: không trả lời câu hỏi, chỉ theo dõi BXH trực tiếp và có
                  quyền mời ra hoặc chặn người chơi.
                </p>

                <div className="mt-4 hidden items-center gap-2 text-[11px] text-white/55 sm:flex">
                  <UsersIcon className="h-3.5 w-3.5" />
                  <span>Tối đa {MAX_PLAYERS} người chơi</span>
                  <span aria-hidden="true">·</span>
                  <span>Bạn không chiếm ghế</span>
                </div>

                <ActionButton
                  className="mt-4 sm:mt-5"
                  variant="gold"
                  fullWidth
                  disabled={formDisabled}
                  onClick={() => {
                    playSfx('click')
                    void handleCreate()
                  }}
                  onHover={hover}
                  icon={<PlayIcon className="h-5 w-5" />}
                >
                  {creating ? 'ĐANG TẠO...' : 'TẠO PHÒNG'}
                </ActionButton>
              </motion.form>

              <motion.form
                onSubmit={handleJoin}
                aria-busy={busy}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.2, ease: 'easeOut' }}
                className="glass relative flex flex-col overflow-hidden rounded-3xl p-4 sm:p-6"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-royal-300/60 to-transparent" />

                <div>
                  <p className="font-display text-[10px] uppercase tracking-[0.28em] text-royal-300/70">
                    02 · Vào phòng
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold tracking-widest text-white">
                    NHẬP MÃ PHÒNG
                  </h2>
                </div>

                <p className="mt-3 hidden text-sm leading-relaxed text-white/60 sm:block">
                  Nhập mã 6 ký tự mà quản trò đã chia sẻ để tham gia.
                </p>

                <TextField
                  className="mt-3 sm:mt-4"
                  label="Mã phòng"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="7K9M2Q"
                  hint="6 ký tự, không dùng O/0/I/1."
                  error={codeError}
                  maxLength={CODE_LENGTH}
                  autoComplete="off"
                  inputMode="text"
                  uppercase
                  center
                  disabled={formDisabled}
                />

                <ActionButton
                  className="mt-4 sm:mt-5"
                  variant="outlineGold"
                  fullWidth
                  disabled={formDisabled}
                  onClick={() => {
                    playSfx('click')
                    void handleJoin()
                  }}
                  onHover={hover}
                  icon={<UsersIcon className="h-5 w-5" />}
                >
                  {joining ? 'ĐANG VÀO...' : 'VÀO PHÒNG'}
                </ActionButton>
              </motion.form>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.28 }}
              className={cn(
                'mx-auto mt-6 hidden flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:flex',
                'text-[11px] uppercase tracking-[0.14em] text-white/55',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" />
                {MAX_PLAYERS} người chơi / phòng
              </span>
              <span aria-hidden="true">·</span>
              <span>{TOTAL_QUESTIONS} câu hỏi</span>
              <span aria-hidden="true">·</span>
              <span>{Math.round(QUESTION_TIME_MS / 1_000)} giây / câu</span>
            </motion.div>

            {!connected && (
              <p className="mt-5 text-center text-xs text-white/55">
                {status === 'connecting'
                  ? 'Đang kết nối tới máy chủ...'
                  : 'Chưa kết nối được máy chủ. Đang thử lại...'}
              </p>
            )}
          </main>
        </div>
      </div>
    </GameScene>
  )
}
