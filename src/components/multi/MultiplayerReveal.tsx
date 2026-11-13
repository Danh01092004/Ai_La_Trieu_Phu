import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type {
  GameQuestionPayload,
  GameRevealPayload,
  RoomState,
} from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { ANSWER_LETTERS, cn } from '@/utils'
import { AnswerButton } from '@/components/AnswerButton'
import { QuestionCard } from '@/components/QuestionCard'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { LeaderboardList } from '@/components/multi/LeaderboardList'
import { ExitIcon } from '@/components/icons'
import { useSettingsActions } from '@/state/SettingsContext'

interface Props {
  room: RoomState
  question: GameQuestionPayload
  reveal: GameRevealPayload
  playerId: string | null
  status: RoomConnectionStatus
  busy: boolean
  removedAnswers: number[]
  onLeave: () => void
}

/** Post-question reveal: answer, explanation, distribution and live top five. */
export function MultiplayerReveal({
  room,
  question,
  reveal,
  playerId,
  status,
  busy,
  removedAnswers,
  onLeave,
}: Props) {
  const reduceMotion = useReducedMotion()
  const { playSfx } = useSettingsActions()

  const me = useMemo(
    () => room.players.find((player) => player.id === playerId) ?? null,
    [playerId, room.players],
  )

  const correctAnswer = question.question.answers[reveal.correctIndex] ?? ''

  useEffect(() => {
    if (reveal.yourCorrect) playSfx('correct')
  }, [playSfx, reveal.yourCorrect])

  const answerStatus = (index: number) => {
    if (removedAnswers.includes(index)) return 'removed' as const
    if (index === reveal.correctIndex) return 'correct' as const
    if (reveal.yourAnswer === index) return 'wrong' as const
    return 'idle' as const
  }

  const answeredCount = reveal.distribution.counts.reduce(
    (sum, count) => sum + count,
    0,
  )
  const ownInTop = reveal.leaderboard.some((entry) => entry.playerId === playerId)
  const ownEntry = me
    ? {
        playerId: me.id,
        name: me.name,
        score: reveal.yourScore,
        correct: reveal.yourCorrectCount,
        rank: reveal.yourRank,
      }
    : null

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[9px] uppercase tracking-[0.24em] text-gold-300/65 sm:text-[10px]">
              Phòng <span className="tracking-[0.18em] text-gold-200">{room.code}</span>
            </p>
            <h1 className="truncate font-display text-sm font-bold tracking-[0.12em] text-white sm:text-lg">
              CÂU {reveal.index}/{reveal.total}
              <span className="ml-2 font-normal tracking-normal text-white/45">
                · {reveal.totalPlayers} người
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

        <main className="flex flex-1 flex-col gap-3 py-3 sm:gap-4 sm:py-4">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
            aria-live="polite"
            className={cn(
              'glass mx-auto w-full max-w-3xl rounded-2xl border px-4 py-3 text-center',
              reveal.yourCorrect
                ? 'border-emerald-300/30 bg-emerald-500/[0.07]'
                : 'border-red-300/25 bg-red-500/[0.06]',
            )}
          >
            <p
              className={cn(
                'font-display text-[10px] uppercase tracking-[0.3em]',
                reveal.yourCorrect ? 'text-emerald-300/85' : 'text-red-300/85',
              )}
            >
              {reveal.yourCorrect
                ? 'Chính xác'
                : reveal.yourAnswer === null
                  ? 'Hết giờ'
                  : 'Sai đáp án'}
            </p>
            <p
              className={cn(
                'mt-0.5 font-display text-2xl font-black tabular-nums sm:text-3xl',
                reveal.yourCorrect ? 'text-emerald-200' : 'text-red-200',
              )}
            >
              +{reveal.yourDelta.toLocaleString('vi-VN')} điểm
            </p>
            <p className="mt-0.5 text-[11px] text-white/55">
              Tổng {reveal.yourScore.toLocaleString('vi-VN')} điểm · Hạng{' '}
              {reveal.yourRank}/{reveal.totalPlayers} · {reveal.yourCorrectCount} câu đúng
            </p>
          </motion.section>

          <QuestionCard
            index={reveal.index - 1}
            total={reveal.total}
            question={question.question.question}
            difficulty={question.question.difficulty}
          />

          <div
            role="group"
            aria-label="Đáp án đúng và đáp án bạn đã chọn"
            className="mx-auto grid w-full max-w-4xl gap-2 md:grid-cols-2"
          >
            {question.question.answers.map((answer, index) => (
              <AnswerButton
                key={`${reveal.index}-${index}`}
                index={index}
                text={answer}
                status={answerStatus(index)}
                disabled
                onSelect={() => {}}
              />
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="glass rounded-2xl p-3 sm:p-4" aria-labelledby="reveal-answer-title">
              <h2
                id="reveal-answer-title"
                className="font-display text-[10px] uppercase tracking-[0.24em] text-emerald-200/75"
              >
                Đáp án đúng · {ANSWER_LETTERS[reveal.correctIndex]}
              </h2>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-emerald-100">
                {correctAnswer}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/65">
                {reveal.explanation}
              </p>

              <div className="mt-3 border-t border-white/[0.07] pt-2.5">
                <p className="font-display text-[9px] uppercase tracking-[0.2em] text-white/45">
                  Phân bố đáp án · {answeredCount}/{reveal.totalPlayers} người trả lời
                </p>
                <div className="mt-1.5 space-y-1">
                  {reveal.distribution.counts.map((count, index) => {
                    const percentage =
                      answeredCount > 0
                        ? Math.round((count / answeredCount) * 100)
                        : 0
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-3 shrink-0 font-display text-[10px] font-bold',
                            index === reveal.correctIndex
                              ? 'text-emerald-300'
                              : 'text-white/45',
                          )}
                        >
                          {ANSWER_LETTERS[index]}
                        </span>
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              index === reveal.correctIndex
                                ? 'bg-emerald-400/80'
                                : 'bg-royal-400/50',
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </span>
                        <span className="w-12 shrink-0 text-right font-display text-[10px] tabular-nums text-white/50">
                          {count} · {percentage}%
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-1 text-[10px] text-white/35">
                  Không trả lời: {reveal.distribution.noAnswer}
                </p>
              </div>
            </section>

            <section className="glass rounded-2xl p-3 sm:p-4" aria-labelledby="reveal-board-title">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="reveal-board-title"
                  className="font-display text-[10px] uppercase tracking-[0.24em] text-gold-300/75"
                >
                  BXH sau câu {reveal.index}
                </h2>
                <span className="text-[10px] text-white/40">Top 5</span>
              </div>
              <div className="mt-2">
                <LeaderboardList
                  entries={reveal.leaderboard}
                  playerId={playerId}
                  compact
                />
              </div>
              {!ownInTop && ownEntry && (
                <div className="mt-2 border-t border-white/[0.07] pt-2">
                  <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Hạng của bạn
                  </p>
                  <LeaderboardList entries={[ownEntry]} playerId={playerId} compact />
                </div>
              )}
            </section>
          </div>

          <p className="text-center text-[10px] uppercase tracking-[0.16em] text-white/35">
            Câu tiếp theo sau {Math.ceil(reveal.revealDurationMs / 1_000)} giây
          </p>
        </main>
      </div>
    </div>
  )
}
