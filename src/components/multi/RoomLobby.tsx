import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { RoomState } from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { MAX_PLAYERS } from '@/config/multiplayerConfig'
import { ActionButton } from '@/components/ui/ActionButton'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import { PlayerRoster } from '@/components/multi/PlayerRoster'
import {
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  ExitIcon,
  LinkIcon,
  UsersIcon,
} from '@/components/icons'
import { useSettingsActions } from '@/state/SettingsContext'
import { writeClipboard } from '@/utils/clipboard'

interface Props {
  room: RoomState
  playerId: string | null
  status: RoomConnectionStatus
  busy: boolean
  error: string | null
  onLeave: () => void
  onHome: () => void
  onClearError: () => void
}

type CopyTarget = 'code' | 'link'

/** Player waiting room: invite code, roster and leave action. */
export function RoomLobby({
  room,
  playerId,
  status,
  busy,
  error,
  onLeave,
  onHome,
  onClearError,
}: Props) {
  const { playSfx } = useSettingsActions()
  const reduceMotion = useReducedMotion()
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const resetTimer = useRef<number | null>(null)

  const code = room.code
  const inviteLink = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/multiplayer?code=${code}`,
    [code],
  )
  const adminConnected = room.admin.connected

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    }
  }, [])

  const copy = async (text: string, target: CopyTarget) => {
    playSfx('click')
    setCopyError(null)

    try {
      await writeClipboard(text)
      setCopied(target)

      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(null), 2_000)
    } catch {
      setCopyError('Không sao chép được. Hãy chọn và sao chép mã thủ công.')
    }
  }

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-7">
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

          <div className="flex items-center gap-2">
            <ConnectionBadge status={status} />
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center gap-3 py-4 lg:grid lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch lg:gap-5 lg:py-6">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
            className="glass relative overflow-hidden rounded-3xl p-4 sm:p-7"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[10px] uppercase tracking-[0.34em] text-gold-300/70">
                  Mã phòng
                </p>
                <h1 className="mt-1 font-display text-xl font-bold tracking-widest text-white sm:text-2xl">
                  PHÒNG CHỜ
                </h1>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gold-300/25 bg-gold-400/10 px-3 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-gold-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300 motion-reduce:animate-none" />
                Chờ quản trò
              </span>
            </div>

            <div
              role="group"
              className="mt-4 flex flex-wrap justify-center gap-1.5 sm:mt-6 sm:gap-2"
              aria-label={`Mã phòng: ${[...code].join(' ')}`}
            >
              {[...code].map((character, index) => (
                <span
                  key={`${character}-${index}`}
                  aria-hidden="true"
                  className="flex h-[clamp(2.9rem,10vw,4rem)] w-[clamp(2.3rem,9vw,3.1rem)] items-center justify-center rounded-xl border border-gold-300/25 bg-gradient-to-b from-gold-400/15 to-night-900/40 font-display text-[clamp(1.5rem,5vw,2.25rem)] font-bold text-gold-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                >
                  {character}
                </span>
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-2">
              <ActionButton
                variant="outlineGold"
                size="sm"
                fullWidth
                onClick={() => void copy(code, 'code')}
                icon={copied === 'code' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              >
                {copied === 'code' ? 'ĐÃ COPY MÃ' : 'COPY MÃ'}
              </ActionButton>

              <ActionButton
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => void copy(inviteLink, 'link')}
                icon={copied === 'link' ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
              >
                {copied === 'link' ? 'ĐÃ COPY LINK' : 'COPY LINK MỜI'}
              </ActionButton>
            </div>

            {copyError && (
              <p role="alert" className="mt-2 text-center text-[11px] text-red-300">
                {copyError}
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-100"
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

            <span className="sr-only" role="status" aria-live="polite">
              {copied === 'code'
                ? 'Đã sao chép mã phòng.'
                : copied === 'link'
                  ? 'Đã sao chép link mời.'
                  : ''}
            </span>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/55 sm:mt-4">
              Gửi mã hoặc link này cho bạn bè. Họ mở trang Đấu trường, nhập tên và mã để vào cùng phòng.
            </p>

            <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                <p className="font-display text-[9px] uppercase tracking-[0.18em] text-white/50">
                  Người chơi
                </p>
                <p className="font-display text-lg text-white/85">
                  {room.players.length}
                  <span className="text-sm text-white/40">/{room.maxPlayers}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                <p className="font-display text-[9px] uppercase tracking-[0.18em] text-white/50">
                  Trạng thái
                </p>
                <p className="font-display text-lg text-gold-200">Chờ bắt đầu</p>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.08, ease: 'easeOut' }}
            aria-busy={busy}
            className="glass flex min-h-0 flex-col rounded-3xl p-4 sm:p-7"
          >
            <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
              <div>
                <p className="font-display text-[10px] uppercase tracking-[0.34em] text-royal-300/70">
                  Đấu trường {MAX_PLAYERS} người chơi
                </p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-widest text-white sm:text-2xl">
                  NGƯỜI CHƠI
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-display text-[10px] uppercase tracking-[0.16em] text-white/55">
                <UsersIcon className="h-3.5 w-3.5" />
                {room.players.length}/{room.maxPlayers}
              </span>
            </div>

            <PlayerRoster room={room} playerId={playerId} />

            <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:mt-4">
              <p className="font-display text-xs uppercase tracking-[0.18em] text-gold-200/90">
                Bạn đã vào phòng
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                {adminConnected
                  ? 'Chờ quản trò bắt đầu. Bạn có thể mời thêm bạn bè bằng mã phía trên.'
                  : 'Quản trò đang mất kết nối. Phòng sẽ đóng nếu quản trò không quay lại.'}
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <ActionButton
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
