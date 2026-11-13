import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { GameEndPayload, RoomState } from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { LeaderboardList } from '@/components/multi/LeaderboardList'
import { Celebration } from '@/components/Celebration'
import { ExitIcon } from '@/components/icons'
import { FINAL_TOP_COUNT } from '@/config/multiplayerConfig'
import { cn } from '@/utils'
import { useSettingsActions } from '@/state/SettingsContext'

interface Props {
  room: RoomState
  final: GameEndPayload
  playerId: string | null
  status: RoomConnectionStatus
  busy: boolean
  error: string | null
  onLeave: () => void
  onClearError: () => void
}

const PODIUM_STYLES = [
  'border-gold-300/40 bg-gradient-to-b from-gold-400/20 to-night-800/70',
  'border-slate-300/30 bg-gradient-to-b from-slate-300/10 to-night-800/70',
  'border-amber-600/30 bg-gradient-to-b from-amber-700/15 to-night-800/70',
]

/** Final leaderboard and personal result; the admin owns the rematch action. */
export function MultiplayerFinal({
  room,
  final,
  playerId,
  status,
  busy,
  error,
  onLeave,
  onClearError,
}: Props) {
  const reduceMotion = useReducedMotion()
  const { playSfx, stopMusic, stopLoseMusic } = useSettingsActions()
  const me = final.leaderboard.find((entry) => entry.playerId === playerId) ?? null
  const champion = final.leaderboard[0] ?? null
  const podium = useMemo(() => final.leaderboard.slice(0, 3), [final.leaderboard])
  const won = final.you.rank === 1
  const isLoser = final.you.rank < 1 || final.you.rank > FINAL_TOP_COUNT

  useEffect(() => {
    stopLoseMusic()
    stopMusic()
    if (!isLoser) playSfx('victory')
    return () => stopLoseMusic()
  }, [isLoser, playSfx, stopLoseMusic, stopMusic])

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      {!isLoser && (
        <>
          <Celebration mode="confetti" className="opacity-70" />
          <Celebration mode="fireworks" className="opacity-60" />
        </>
      )}

      <div className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="font-display text-[9px] uppercase tracking-[0.24em] text-gold-300/65">
              Phòng <span className="tracking-[0.18em] text-gold-200">{room.code}</span>
            </p>
            <h1 className="font-display text-sm font-bold tracking-[0.12em] text-white sm:text-lg">
              TỔNG KẾT · {final.total} CÂU
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge status={status} className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              aria-label="Rời phòng"
              className="glass flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-3 font-display text-[10px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:opacity-50"
            >
              <ExitIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Rời phòng</span>
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3 py-4 sm:gap-4">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 16 }}
            className="glass relative overflow-hidden rounded-3xl border border-gold-300/25 px-4 py-5 text-center sm:px-8 sm:py-7"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />
            <div className="text-5xl sm:text-6xl" aria-hidden="true">
              {won ? '🏆' : isLoser ? '🐔' : '🎉'}
            </div>
            <p className="mt-2 font-display text-[10px] uppercase tracking-[0.32em] text-gold-300/70">
              {won ? 'Nhà vô địch' : isLoser ? 'Kết thúc hành trình' : 'Ván đấu kết thúc'}
            </p>
            <h2 className="mt-1 truncate font-display text-2xl font-black tracking-wide text-gold-200 text-glow-gold sm:text-4xl">
              {champion?.name ?? 'Chưa có người chơi'}
            </h2>
            <p className="mt-1 text-sm text-white/55">
              {champion
                ? `${champion.score.toLocaleString('vi-VN')} điểm · ${champion.correct}/${final.total} câu đúng`
                : 'Không có dữ liệu xếp hạng'}
            </p>

            {isLoser && (
              <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-red-200/75">
                Bạn dừng ở hạng {final.you.rank} — ngoài top {FINAL_TOP_COUNT}. Xem bảng
                xếp hạng chung cuộc bên dưới.
              </p>
            )}

            <div className="mx-auto mt-4 grid max-w-md grid-cols-3 gap-2 border-t border-white/[0.07] pt-4">
              <div>
                <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">Hạng</p>
                <p className="font-display text-xl font-bold tabular-nums text-gold-200">
                  {final.you.rank}
                </p>
              </div>
              <div>
                <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">Điểm</p>
                <p className="font-display text-xl font-bold tabular-nums text-gold-200">
                  {final.you.score.toLocaleString('vi-VN')}
                </p>
              </div>
              <div>
                <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">Đúng</p>
                <p className="font-display text-xl font-bold tabular-nums text-gold-200">
                  {final.you.correct}/{final.total}
                </p>
              </div>
            </div>
          </motion.section>

          {podium.length > 0 && (
            <section aria-label="Ba người dẫn đầu" className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {podium.map((entry, index) => (
                <div
                  key={entry.playerId}
                  className={cn(
                    'rounded-2xl border p-2 text-center sm:p-3',
                    PODIUM_STYLES[index],
                    entry.playerId === playerId && 'ring-1 ring-gold-300/50',
                  )}
                >
                  <p className="text-lg sm:text-2xl" aria-hidden="true">
                    {['🥇', '🥈', '🥉'][index]}
                  </p>
                  <p className="truncate font-display text-[11px] font-bold text-white/85 sm:text-sm">
                    {entry.name}
                  </p>
                  <p className="font-display text-xs font-bold tabular-nums text-gold-200 sm:text-base">
                    {entry.score.toLocaleString('vi-VN')}
                  </p>
                </div>
              ))}
            </section>
          )}

          <section className="glass rounded-2xl p-3 sm:p-4" aria-labelledby="final-board-title">
            <div className="flex items-center justify-between">
              <h2
                id="final-board-title"
                className="font-display text-[10px] uppercase tracking-[0.24em] text-gold-300/75"
              >
                Bảng xếp hạng chung cuộc
              </h2>
              <span className="text-[10px] text-white/40">{final.leaderboard.length} người</span>
            </div>
            <div
              className="mt-2 overflow-y-auto pr-1"
              style={{ maxHeight: 'clamp(13rem, 38vh, 24rem)' }}
            >
              <LeaderboardList entries={final.leaderboard} playerId={playerId} />
            </div>
            {!me && (
              <p className="mt-2 text-xs text-white/45">
                Bạn không còn trong bảng xếp hạng của phòng.
              </p>
            )}
          </section>

          <section className="glass rounded-2xl p-3 sm:p-4">
            {error && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs text-red-100"
              >
                <p className="flex-1 leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={onClearError}
                  aria-label="Đóng thông báo"
                  className="min-h-[44px] min-w-[44px] rounded-lg text-lg leading-none text-red-200/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"
                >
                  ×
                </button>
              </div>
            )}
            <p className="text-center text-xs text-white/55" role="status" aria-live="polite">
              Chờ quản trò mở ván mới. Bạn có thể rời phòng bất cứ lúc nào.
            </p>

            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] font-display text-[10px] uppercase tracking-[0.18em] text-white/50 transition-colors hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:opacity-50"
            >
              Rời phòng
            </button>
          </section>
        </main>
      </div>
    </div>
  )
}
