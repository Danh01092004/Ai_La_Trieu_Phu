import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type {
  AdminPlayerState,
  AdminPlayerStatus,
  AdminState,
  RoomState,
} from '@/types/multiplayer'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '@/config/multiplayerConfig'
import { ActionButton } from '@/components/ui/ActionButton'
import { Modal } from '@/components/ui/Modal'
import { ConnectionBadge } from '@/components/multi/ConnectionBadge'
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  ExitIcon,
  KickIcon,
  LinkIcon,
  PlayIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/icons'
import { useSettingsActions } from '@/state/SettingsContext'
import { writeClipboard } from '@/utils/clipboard'
import { cn } from '@/utils'

interface Props {
  room: RoomState
  state: AdminState | null
  status: RoomConnectionStatus
  busy: boolean
  error: string | null
  onStart: () => Promise<boolean>
  onRematch: () => void
  onLeave: () => void
  onKick: (playerId: string) => Promise<boolean>
  onBlock: (playerId: string) => Promise<boolean>
  onUnblock: (blockId: string) => Promise<boolean>
  onClearError: () => void
}

type ConfirmAction = { kind: 'kick' | 'block'; player: AdminPlayerState }
type CopyTarget = 'code' | 'link'

const STATUS_META: Record<
  AdminPlayerStatus,
  { label: string; className: string }
> = {
  waiting: {
    label: 'Sẵn sàng',
    className: 'border-white/10 bg-white/[0.04] text-white/55',
  },
  answering: {
    label: 'Đang trả lời',
    className: 'border-gold-300/25 bg-gold-400/10 text-gold-200',
  },
  answered: {
    label: 'Đã trả lời',
    className: 'border-royal-300/25 bg-royal-400/10 text-royal-300',
  },
  correct: {
    label: 'Đúng',
    className: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200',
  },
  wrong: {
    label: 'Sai',
    className: 'border-red-300/25 bg-red-500/10 text-red-200',
  },
  timeout: {
    label: 'Hết giờ',
    className: 'border-amber-300/25 bg-amber-500/10 text-amber-200',
  },
  finished: {
    label: 'Hoàn tất',
    className: 'border-white/10 bg-white/[0.04] text-white/60',
  },
}

function phaseTitle(state: AdminState | null): string {
  if (!state) return 'ĐANG TẢI...'
  if (state.phase === 'lobby') return 'PHÒNG CHỜ'
  if (state.phase === 'final') return 'ĐÃ KẾT THÚC'
  if (state.phase === 'reveal') return `CÔNG BỐ CÂU ${state.questionIndex}/${state.questionTotal}`
  return `CÂU ${state.questionIndex}/${state.questionTotal}`
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

/**
 * Admin/observer dashboard. It intentionally renders only standings, room
 * controls and player management — never question text, answers or the correct
 * option. The server never sends those packets to this role.
 */
export function AdminRoom({
  room,
  state,
  status,
  busy,
  error,
  onStart,
  onRematch,
  onLeave,
  onKick,
  onBlock,
  onUnblock,
  onClearError,
}: Props) {
  const reduceMotion = useReducedMotion()
  const { playSfx } = useSettingsActions()
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [remainingMs, setRemainingMs] = useState(0)
  const copyTimer = useRef<number | null>(null)

  const connectedPlayers = useMemo(
    () => state?.players.filter((player) => player.connected).length ?? 0,
    [state?.players],
  )
  const answeredPlayers = useMemo(
    () =>
      state?.players.filter(
        (player) =>
          player.status !== 'answering' &&
          player.status !== 'waiting' &&
          player.status !== 'finished',
      ).length ?? 0,
    [state?.players],
  )
  const champion = state?.phase === 'final' ? (state.players[0] ?? null) : null
  const canStart =
    state?.phase === 'lobby' &&
    connectedPlayers >= MIN_PLAYERS_TO_START &&
    status === 'connected'

  const inviteLink = useMemo(
    () =>
      `${window.location.origin}${window.location.pathname}#/multiplayer?code=${room.code}`,
    [room.code],
  )

  useEffect(() => {
    if (!state?.endsAt) {
      setRemainingMs(0)
      return
    }

    const offset = state.serverNow - Date.now()
    const update = () =>
      setRemainingMs(Math.max(0, (state.endsAt ?? 0) - (Date.now() + offset)))
    update()
    // The dashboard only shows whole seconds; 500ms halves React commits
    // compared with the old 250ms tick without a visible difference.
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [state?.endsAt, state?.serverNow])

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const copy = async (text: string, target: CopyTarget) => {
    playSfx('click')
    setCopyError(null)
    try {
      await writeClipboard(text)
      setCopyTarget(target)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopyTarget(null), 2_000)
    } catch {
      setCopyError('Không sao chép được. Hãy chọn và sao chép mã thủ công.')
    }
  }

  const handleStart = () => {
    if (!canStart || busy || starting) return
    playSfx('click')
    setStarting(true)
    void onStart()
      .catch(() => false)
      .finally(() => setStarting(false))
  }

  const handleConfirm = async () => {
    if (!confirmAction || actionBusy) return
    setActionBusy(true)
    try {
      const ok =
        confirmAction.kind === 'kick'
          ? await onKick(confirmAction.player.playerId)
          : await onBlock(confirmAction.player.playerId)
      if (ok) setConfirmAction(null)
    } finally {
      setActionBusy(false)
    }
  }

  const handleUnblock = (blockId: string) => {
    if (actionBusy) return
    setActionBusy(true)
    void onUnblock(blockId).finally(() => setActionBusy(false))
  }

  return (
    <div className="h-[100dvh] w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-300/30 bg-gold-400/10 text-gold-200">
              <ShieldIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[9px] uppercase tracking-[0.28em] text-gold-300/70">
                Quản trò · phòng{' '}
                <span className="tracking-[0.18em] text-gold-200">{room.code}</span>
              </p>
              <h1 className="truncate font-display text-base font-bold tracking-[0.14em] text-white sm:text-xl">
                BẢNG XẾP HẠNG TRỰC TIẾP
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ConnectionBadge status={status} className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              aria-label="Đóng phòng và rời"
              className="glass flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-3 font-display text-[10px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:opacity-50"
            >
              <ExitIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Đóng phòng</span>
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100"
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

        <main className="mt-3 grid flex-1 gap-3 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-4">
          <div className="flex flex-col gap-3">
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
              className="glass relative overflow-hidden rounded-3xl p-4 sm:p-5"
              aria-live="polite"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />
              <p className="font-display text-[9px] uppercase tracking-[0.3em] text-gold-300/70">
                {state?.phase === 'lobby'
                  ? 'Đang chờ người chơi'
                  : state?.phase === 'final'
                    ? 'Ván đấu hoàn tất'
                    : 'Ván đấu đang diễn ra'}
              </p>
              <h2 className="mt-1 font-display text-xl font-black tracking-wide text-gold-200 sm:text-2xl">
                {phaseTitle(state)}
              </h2>

              {state?.phase === 'final' && champion ? (
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  Vô địch:{' '}
                  <span className="font-display font-bold text-gold-100">
                    {champion.name}
                  </span>{' '}
                  · {champion.score.toLocaleString('vi-VN')} điểm
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2">
                    <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">
                      Người chơi
                    </p>
                    <p className="font-display text-lg font-bold tabular-nums text-white/85">
                      {state?.players.length ?? 0}
                      <span className="text-xs text-white/35">/{MAX_PLAYERS}</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2">
                    <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">
                      Kết nối
                    </p>
                    <p className="font-display text-lg font-bold tabular-nums text-emerald-200">
                      {connectedPlayers}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2">
                    <p className="font-display text-[9px] uppercase tracking-[0.16em] text-white/40">
                      {state?.phase === 'question' ? 'Đã trả lời' : 'Còn lại'}
                    </p>
                    <p className="font-display text-lg font-bold tabular-nums text-gold-200">
                      {state?.phase === 'question' ? answeredPlayers : '—'}
                    </p>
                  </div>
                </div>
              )}

              {state?.endsAt && (state.phase === 'question' || state.phase === 'reveal') && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                  <span className="font-display text-[10px] uppercase tracking-[0.18em] text-white/50">
                    {state.phase === 'question' ? 'Còn lại' : 'Reveal'}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums text-gold-200">
                    {Math.ceil(remainingMs / 1_000)}s
                  </span>
                </div>
              )}
            </motion.section>

            <section className="glass rounded-2xl p-4" aria-labelledby="admin-invite-title">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="admin-invite-title"
                  className="font-display text-[10px] uppercase tracking-[0.24em] text-white/55"
                >
                  Mã phòng
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-white/45">
                  <UsersIcon className="h-3.5 w-3.5" />
                  {state?.players.length ?? 0}/{MAX_PLAYERS}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {[...room.code].map((character, index) => (
                  <span
                    key={`${character}-${index}`}
                    className="flex h-11 w-9 items-center justify-center rounded-lg border border-gold-300/25 bg-gradient-to-b from-gold-400/15 to-night-900/40 font-display text-xl font-bold text-gold-200"
                    aria-hidden="true"
                  >
                    {character}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton
                  variant="outlineGold"
                  size="sm"
                  fullWidth
                  onClick={() => void copy(room.code, 'code')}
                  icon={
                    copyTarget === 'code' ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )
                  }
                >
                  {copyTarget === 'code' ? 'ĐÃ COPY' : 'COPY MÃ'}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => void copy(inviteLink, 'link')}
                  icon={
                    copyTarget === 'link' ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )
                  }
                >
                  {copyTarget === 'link' ? 'ĐÃ COPY' : 'COPY LINK'}
                </ActionButton>
              </div>

              {copyError && (
                <p role="alert" className="mt-2 text-center text-[11px] text-red-300">
                  {copyError}
                </p>
              )}
              <p className="mt-2 text-center text-[10px] leading-relaxed text-white/40">
                Quản trò không chơi. Tối đa {MAX_PLAYERS} người chơi + 1 quản trò.
              </p>
            </section>

            <section className="glass rounded-2xl p-4" aria-label="Điều khiển phòng">
              {state?.phase === 'lobby' && (
                <>
                  <p className="text-[11px] leading-relaxed text-white/55">
                    Cần ít nhất {MIN_PLAYERS_TO_START} người chơi đang kết nối. Bạn chỉ theo dõi
                    BXH và có thể mời ra hoặc chặn người chơi.
                  </p>
                  <ActionButton
                    className="mt-3"
                    variant="gold"
                    fullWidth
                    disabled={!canStart || busy || starting}
                    onClick={handleStart}
                    icon={<PlayIcon className="h-5 w-5" />}
                  >
                    {starting
                      ? 'ĐANG BẮT ĐẦU...'
                      : connectedPlayers >= MIN_PLAYERS_TO_START
                        ? `BẮT ĐẦU (${connectedPlayers} NGƯỜI)`
                        : `BẮT ĐẦU (${connectedPlayers}/${MIN_PLAYERS_TO_START})`}
                  </ActionButton>
                  {connectedPlayers < MIN_PLAYERS_TO_START && (
                    <p className="mt-2 text-center text-[10px] text-gold-200/70" role="status">
                      Đang chờ thêm người chơi.
                    </p>
                  )}
                </>
              )}

              {state?.phase === 'final' && (
                <>
                  <p className="text-[11px] leading-relaxed text-white/55">
                    Mở ván mới với cùng phòng và người chơi. Điểm và trợ giúp sẽ được đặt lại.
                  </p>
                  <ActionButton
                    className="mt-3"
                    variant="gold"
                    fullWidth
                    disabled={busy || status !== 'connected'}
                    onClick={() => {
                      playSfx('click')
                      onRematch()
                    }}
                    icon={<PlayIcon className="h-5 w-5" />}
                  >
                    {busy ? 'ĐANG MỞ VÁN MỚI...' : 'CHƠI LẠI'}
                  </ActionButton>
                </>
              )}

              {state?.phase !== 'lobby' && state?.phase !== 'final' && (
                <p className="text-center text-[11px] leading-relaxed text-white/55">
                  Bảng xếp hạng tự cập nhật sau mỗi câu. Quản trò không trả lời câu hỏi.
                </p>
              )}

              <button
                type="button"
                onClick={onLeave}
                disabled={busy}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] font-display text-[10px] uppercase tracking-[0.18em] text-white/50 transition-colors hover:border-red-400/30 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:opacity-50"
              >
                Đóng phòng
              </button>
            </section>

            {state && state.blocked.length > 0 && (
              <section className="glass rounded-2xl p-4" aria-labelledby="admin-blocked-title">
                <div className="flex items-center justify-between gap-2">
                  <h2
                    id="admin-blocked-title"
                    className="font-display text-[10px] uppercase tracking-[0.24em] text-red-200/75"
                  >
                    Đã chặn
                  </h2>
                  <span className="text-[10px] text-white/40">{state.blocked.length}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {state.blocked.map((blocked) => (
                    <li
                      key={blocked.id}
                      className="flex items-center gap-2 rounded-xl border border-red-300/15 bg-red-500/[0.05] px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-xs text-white/80">
                          {blocked.name}
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">
                          {formatClock(blocked.blockedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnblock(blocked.id)}
                        disabled={actionBusy}
                        className="min-h-[44px] rounded-lg border border-white/10 px-2 font-display text-[9px] uppercase tracking-[0.14em] text-white/60 transition-colors hover:border-gold-300/40 hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 disabled:opacity-50"
                      >
                        Bỏ chặn
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.05 }}
            className="glass order-first flex min-h-[24rem] flex-col rounded-3xl p-3 sm:p-5 lg:order-none"
            aria-labelledby="admin-board-title"
          >
            <div className="flex items-start justify-between gap-2 px-1">
              <div>
                <p className="font-display text-[9px] uppercase tracking-[0.28em] text-gold-300/65">
                  {state?.phase === 'question'
                    ? `Câu ${state.questionIndex}/${state.questionTotal} · Đang thi đấu`
                    : state?.phase === 'reveal'
                      ? `Câu ${state.questionIndex}/${state.questionTotal} · Công bố`
                      : state?.phase === 'final'
                        ? 'Chung cuộc'
                        : 'Danh sách người chơi'}
                </p>
                <h2
                  id="admin-board-title"
                  className="mt-0.5 font-display text-lg font-bold tracking-[0.12em] text-white sm:text-xl"
                >
                  BẢNG XẾP HẠNG
                </h2>
              </div>
              <span className="rounded-full border border-gold-300/25 bg-gold-400/10 px-2.5 py-1 font-display text-[9px] uppercase tracking-[0.16em] text-gold-200">
                {state?.players.length ?? 0} người
              </span>
            </div>

            {state && state.players.length > 0 ? (
              <ol
                aria-label="Bảng xếp hạng trực tiếp"
                className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1"
                style={{ maxHeight: 'clamp(20rem, 62vh, 42rem)' }}
              >
                {state.players.map((player) => {
                  const meta = STATUS_META[player.status]
                  const medal = ['🥇', '🥈', '🥉'][player.rank - 1]
                  return (
                    <li
                      key={player.playerId}
                      className={cn(
                        'flex items-center gap-2 rounded-2xl border px-2.5 py-2 sm:gap-3 sm:px-3',
                        player.rank <= 3
                          ? 'border-gold-300/20 bg-gold-400/[0.05]'
                          : 'border-white/[0.06] bg-white/[0.025]',
                        !player.connected && 'opacity-55',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-display text-[11px] font-black tabular-nums',
                          player.rank <= 3
                            ? 'border-gold-300/30 bg-gold-400/10 text-gold-200'
                            : 'border-white/10 bg-white/[0.03] text-white/50',
                        )}
                        aria-label={`Hạng ${player.rank}`}
                      >
                        {medal ?? player.rank}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-display text-xs font-semibold text-white/90 sm:text-sm">
                            {player.name}
                          </p>
                          {!player.connected && (
                            <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-amber-200/70">
                              mất kết nối
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex rounded border px-1.5 py-0.5 font-display text-[8px] uppercase tracking-[0.1em]',
                              meta.className,
                            )}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[9px] text-white/35">
                            {player.correct} đúng
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-display text-sm font-bold tabular-nums text-gold-200 sm:text-base">
                          {player.score.toLocaleString('vi-VN')}
                        </p>
                        <p className="text-[8px] uppercase tracking-[0.12em] text-white/35">
                          điểm
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            playSfx('click')
                            setConfirmAction({ kind: 'kick', player })
                          }}
                          aria-label={`Mời ${player.name} ra khỏi phòng`}
                          title="Mời ra"
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-amber-300/40 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60"
                        >
                          <KickIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSfx('click')
                            setConfirmAction({ kind: 'block', player })
                          }}
                          aria-label={`Chặn ${player.name} khỏi phòng`}
                          title="Chặn"
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-red-300/40 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60"
                        >
                          <BanIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
                <UsersIcon className="h-9 w-9 text-white/20" />
                <p className="mt-3 font-display text-sm text-white/55">Chưa có người chơi.</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-white/35">
                  Gửi mã phòng hoặc link mời để mọi người vào. Tối đa {MAX_PLAYERS} người chơi.
                </p>
              </div>
            )}

            <p className="mt-2 px-1 text-[9px] uppercase tracking-[0.14em] text-white/30">
              BXH cập nhật trực tiếp · quản trò không thấy nội dung câu hỏi
            </p>
          </motion.section>
        </main>
      </div>

      <Modal
        open={Boolean(confirmAction)}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null)
        }}
        ariaLabel={confirmAction?.kind === 'block' ? 'Xác nhận chặn' : 'Xác nhận mời ra'}
        panelClassName="max-w-sm p-5"
      >
        {confirmAction && (
          <>
            <p className="font-display text-[10px] uppercase tracking-[0.26em] text-gold-300/70">
              {confirmAction.kind === 'block' ? 'Chặn người chơi' : 'Mời ra khỏi phòng'}
            </p>
            <h2 className="mt-1 truncate font-display text-xl font-bold text-white">
              {confirmAction.player.name}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              {confirmAction.kind === 'block'
                ? 'Người này bị đưa ra khỏi phòng ngay và không thể vào lại bằng tên hoặc trình duyệt này cho đến khi bạn bỏ chặn.'
                : 'Người này bị đưa ra khỏi phòng ngay. Khi phòng về phòng chờ, họ có thể vào lại bằng mã nếu chưa bị chặn.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionButton
                variant="ghostNeutral"
                fullWidth
                disabled={actionBusy}
                onClick={() => setConfirmAction(null)}
              >
                HỦY
              </ActionButton>
              <ActionButton
                variant={confirmAction.kind === 'block' ? 'danger' : 'gold'}
                fullWidth
                disabled={actionBusy}
                onClick={() => void handleConfirm()}
                icon={
                  confirmAction.kind === 'block' ? (
                    <BanIcon className="h-4 w-4" />
                  ) : (
                    <KickIcon className="h-4 w-4" />
                  )
                }
              >
                {actionBusy
                  ? 'ĐANG XỬ LÝ...'
                  : confirmAction.kind === 'block'
                    ? 'CHẶN'
                    : 'MỜI RA'}
              </ActionButton>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
