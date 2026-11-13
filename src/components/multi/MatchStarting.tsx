import { motion, useReducedMotion } from 'framer-motion'
import type { RoomState } from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { QUESTION_TIME_MS, TOTAL_QUESTIONS } from '@/config/multiplayerConfig'
import { ActionButton } from '@/components/ui/ActionButton'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { ChevronLeftIcon, ExitIcon } from '@/components/icons'

interface Props {
  room: RoomState
  status: RoomConnectionStatus
  busy: boolean
  onLeave: () => void
  onHome: () => void
}

/**
 * B3 transition screen. It confirms that the authoritative room status is
 * `playing`; B4 replaces this placeholder with the first question packet.
 */
export function MatchStarting({ room, status, busy, onLeave, onHome }: Props) {
  const reduceMotion = useReducedMotion()
  const questionSeconds = Math.round(QUESTION_TIME_MS / 1_000)

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-4 sm:px-6 sm:py-7">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <button
            type="button"
            onClick={onHome}
            aria-label="Quay lại trang chủ"
            className="glass flex min-h-[44px] items-center gap-1.5 rounded-2xl px-3 py-2 font-display text-xs uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 sm:px-4"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Trang chủ</span>
          </button>

          <ConnectionBadge status={status} />
        </header>

        <main className="flex flex-1 items-center justify-center py-6 sm:py-10">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
            aria-labelledby="match-starting-title"
            className="glass relative w-full max-w-xl overflow-hidden rounded-3xl p-6 text-center sm:p-10"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />

            <span className="inline-flex items-center gap-2 rounded-full border border-gold-300/25 bg-gold-400/10 px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.22em] text-gold-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300 motion-reduce:animate-none" />
              Ván đấu đã bắt đầu
            </span>

            <h1
              id="match-starting-title"
              className="mt-5 font-display text-2xl font-bold tracking-[0.14em] text-gold-300 text-glow-gold sm:text-3xl"
            >
              CHUẨN BỊ CÂU HỎI
            </h1>

            <p className="mt-3 text-sm text-white/60">
              {TOTAL_QUESTIONS} câu · {questionSeconds} giây/câu · {room.players.length} người chơi
            </p>

            <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full border border-gold-300/20 bg-gold-400/[0.06]">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-gold-300/25 border-t-gold-300 motion-reduce:animate-none" />
            </div>

            <p className="mt-4 text-sm text-white/65" role="status" aria-live="polite">
              Đang đồng bộ câu hỏi đầu tiên...
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Mã phòng {room.code} · {room.players.length}/{room.maxPlayers} người
            </p>

            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <p className="text-[11px] leading-relaxed text-white/50">
                Quản trò đã bắt đầu ván. Câu hỏi sẽ xuất hiện ngay khi máy chủ phát.
              </p>
              <ActionButton
                className="mt-3"
                variant="dangerGhost"
                size="sm"
                fullWidth
                disabled={busy}
                onClick={onLeave}
                icon={<ExitIcon className="h-4 w-4" />}
              >
                {busy ? 'ĐANG RỜI...' : 'RỜI PHÒNG'}
              </ActionButton>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  )
}
