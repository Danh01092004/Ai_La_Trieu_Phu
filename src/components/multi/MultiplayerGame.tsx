import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { LifelineState, LifelineType } from '@/types'
import type {
  GameErrorCode,
  GameQuestionPayload,
  LifelineResult,
  RoomState,
  WagerPercent,
} from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { pointsForLevel } from '@/config/multiplayerConfig'
import { AnswerButton } from '@/components/AnswerButton'
import { QuestionCard } from '@/components/QuestionCard'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { LifelineResultCard } from '@/components/multi/LifelineResultCard'
import { MultiLifelines } from '@/components/multi/MultiLifelines'
import { MultiQuestionTimer } from '@/components/multi/MultiQuestionTimer'
import { WagerPanel } from '@/components/multi/WagerPanel'
import { ExitIcon } from '@/components/icons'
import { useSettingsActions } from '@/state/SettingsContext'
import { cn } from '@/utils'

interface Props {
  room: RoomState
  question: GameQuestionPayload
  playerId: string | null
  status: RoomConnectionStatus
  serverOffset: number
  selectedAnswer: number | null
  answered: boolean
  submitting: boolean
  answerError: string | null
  answerErrorCode: GameErrorCode | null
  lifelines: LifelineState
  removedAnswers: number[]
  lifelineResult: LifelineResult | null
  lifelineBusy: LifelineType | null
  lifelineError: string | null
  wagerPercent: WagerPercent
  wagerAmount: number
  wagerBusy: boolean
  wagerError: string | null
  busy: boolean
  onAnswer: (index: number) => void
  onWager: (percent: WagerPercent) => void
  onClearWagerError: () => void
  onLifeline: (type: LifelineType) => void
  onDismissLifelineResult: () => void
  onClearLifelineError: () => void
  onLeave: () => void
  onClearAnswerError: () => void
}

/**
 * Live question screen: public question packet, server deadline, one answer,
 * four lifelines and the score at stake. Correctness is intentionally absent
 * until the reveal screen; the server never sends `correct` early.
 */
export function MultiplayerGame({
  room,
  question,
  playerId,
  status,
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
  wagerPercent,
  wagerAmount,
  wagerBusy,
  wagerError,
  busy,
  onAnswer,
  onWager,
  onClearWagerError,
  onLifeline,
  onDismissLifelineResult,
  onClearLifelineError,
  onLeave,
  onClearAnswerError,
}: Props) {
  const reduceMotion = useReducedMotion()
  const { playSfx } = useSettingsActions()
  const localDeadline = question.endsAt - serverOffset
  const [expired, setExpired] = useState(() => Date.now() >= localDeadline)

  useEffect(() => {
    const msLeft = localDeadline - Date.now()
    if (msLeft <= 0) {
      setExpired(true)
      return
    }

    setExpired(false)
    const timer = window.setTimeout(() => setExpired(true), msLeft)
    return () => window.clearTimeout(timer)
  }, [localDeadline])

  const me = useMemo(
    () => room.players.find((player) => player.id === playerId) ?? null,
    [playerId, room.players],
  )

  const tooLate = answerErrorCode === 'ANSWER_TOO_LATE'
  const answersDisabled =
    answered ||
    submitting ||
    expired ||
    tooLate ||
    lifelineBusy !== null ||
    status !== 'connected'
  const points = pointsForLevel(question.index)
  const isLast = question.index >= question.total

  const handleSelect = useCallback(
    (index: number) => {
      if (answersDisabled) return
      playSfx('select')
      onAnswer(index)
    },
    [answersDisabled, onAnswer, playSfx],
  )

  let statusText = 'Chọn một đáp án. Bạn chỉ có một lượt cho câu này.'
  if (status !== 'connected') {
    statusText = 'Mất kết nối. Đáp án tạm thời bị khóa.'
  } else if (submitting) {
    statusText = 'Đang gửi đáp án...'
  } else if (answered) {
    statusText = isLast
      ? 'Đã khóa đáp án câu cuối · chờ công bố đáp án.'
      : 'Đã khóa đáp án · chờ công bố đáp án.'
  } else if (expired || tooLate) {
    statusText = isLast
      ? 'Hết giờ câu cuối · chờ công bố đáp án.'
      : 'Hết giờ · chờ công bố đáp án...'
  }

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[9px] uppercase tracking-[0.24em] text-gold-300/65 sm:text-[10px]">
              Phòng <span className="tracking-[0.18em] text-gold-200">{room.code}</span>
            </p>
            <h1 className="truncate font-display text-sm font-bold tracking-[0.12em] text-white sm:text-lg">
              CÂU {question.index}/{question.total}
              <span className="ml-2 font-normal tracking-normal text-white/45">
                · {room.players.length} người · {(me?.score ?? 0).toLocaleString('vi-VN')} gói
              </span>
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ConnectionBadge status={status} className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              aria-label="Rời phòng"
              className="glass flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-3 font-display text-[10px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ExitIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Rời phòng</span>
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-start gap-3 py-3 sm:gap-4 sm:py-4">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
            className="flex flex-wrap items-center justify-center gap-3 sm:gap-5"
          >
            <MultiQuestionTimer
              endsAt={question.endsAt}
              durationMs={question.durationMs}
              serverOffset={serverOffset}
            />

            <div className="glass min-w-[9rem] rounded-2xl px-4 py-2.5 text-center sm:px-5 sm:py-3">
              <p className="font-display text-[9px] uppercase tracking-[0.22em] text-white/45">
                Gói nếu đúng
              </p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums text-gold-200">
                {points.toLocaleString('vi-VN')} gói
              </p>
              <p
                className="max-w-[9rem] truncate text-[10px] uppercase tracking-[0.16em] text-white/45"
                title={me ? `Bạn: ${me.name}` : undefined}
              >
                {me ? `Bạn: ${me.name}` : 'Người chơi'}
              </p>
            </div>
          </motion.div>

          <WagerPanel
            question={question}
            serverOffset={serverOffset}
            score={me?.score ?? 0}
            percent={wagerPercent}
            amount={wagerAmount}
            busy={wagerBusy}
            disabled={status !== 'connected' || expired || tooLate}
            error={wagerError}
            onSelect={onWager}
            onClearError={onClearWagerError}
          />

          <MultiLifelines
            lifelines={lifelines}
            disabled={answersDisabled || status !== 'connected'}
            busy={lifelineBusy}
            onUse={onLifeline}
          />

          {lifelineResult && (
            <LifelineResultCard
              result={lifelineResult}
              onClose={onDismissLifelineResult}
            />
          )}

          <QuestionCard
            index={question.index - 1}
            total={question.total}
            question={question.question.question}
            difficulty={question.question.difficulty}
          />

          <div
            role="group"
            aria-label="Chọn một đáp án"
            aria-busy={submitting}
            className="mx-auto grid w-full max-w-4xl gap-2 md:grid-cols-2"
          >
            {question.question.answers.map((answer, index) => (
              <AnswerButton
                key={`${question.index}-${index}`}
                index={index}
                text={answer}
                status={
                  removedAnswers.includes(index)
                    ? 'removed'
                    : selectedAnswer === index
                      ? 'selected'
                      : 'idle'
                }
                disabled={answersDisabled}
                onSelect={handleSelect}
              />
            ))}
          </div>

          <div
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'mx-auto flex min-h-[1.5rem] items-center justify-center text-center text-xs',
              answered || expired || tooLate ? 'text-gold-200/80' : 'text-white/55',
            )}
          >
            {statusText}
          </div>

          {answerError && (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-2xl items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100"
            >
              <p className="flex-1 leading-relaxed">{answerError}</p>
              <button
                type="button"
                onClick={onClearAnswerError}
                aria-label="Đóng thông báo"
                className="min-h-[44px] min-w-[44px] rounded-lg text-lg leading-none text-red-200/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"
              >
                ×
              </button>
            </div>
          )}

          {lifelineError && (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-2xl items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            >
              <p className="flex-1 leading-relaxed">{lifelineError}</p>
              <button
                type="button"
                onClick={onClearLifelineError}
                aria-label="Đóng thông báo trợ giúp"
                className="min-h-[44px] min-w-[44px] rounded-lg text-lg leading-none text-amber-200/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"
              >
                ×
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
