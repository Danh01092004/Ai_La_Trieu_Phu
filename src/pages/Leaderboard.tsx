import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { GameScene } from '@/components/GameScene'
import { ActionButton } from '@/components/ui/ActionButton'
import { ChevronLeftIcon, CrownIcon } from '@/components/icons'
import type { AllTimeEntry, AllTimeLeaderboardResponse } from '@/types/leaderboard'
import { cn } from '@/utils'

type LoadState = 'loading' | 'ready' | 'error'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp))
}

/**
 * All-time board persisted by the server (`data/results.json`). Identity is the
 * display name, so each name keeps its single best completed match.
 */
export function Leaderboard() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [entries, setEntries] = useState<AllTimeEntry[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (signal: AbortSignal) => {
    setState('loading')
    setError(null)
    try {
      const response = await fetch(`/api/leaderboard?limit=20&_=${Date.now()}`, {
        signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as AllTimeLeaderboardResponse
      if (!payload.ok || !Array.isArray(payload.entries)) {
        throw new Error('Malformed leaderboard response')
      }
      setEntries(payload.entries)
      setTotalMatches(payload.totalMatches)
      setUpdatedAt(payload.updatedAt)
      setState('ready')
    } catch (loadError: unknown) {
      if (signal.aborted) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Không tải được bảng xếp hạng.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, reloadKey])

  return (
    <GameScene variant="win">
      <div className="h-[100dvh] w-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-7">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Quay lại trang chủ"
              className="glass flex min-h-[44px] items-center gap-1.5 rounded-2xl px-3 py-2 font-display text-xs uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60 sm:px-4"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Trang chủ</span>
            </button>

            <span className="rounded-full border border-gold-300/25 bg-gold-400/10 px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-gold-200">
              All-time
            </span>
          </header>

          <main className="flex flex-1 flex-col justify-center py-5">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.4 }}
              className="text-center"
            >
              <CrownIcon className="mx-auto h-9 w-9 text-gold-300" />
              <p className="mt-2 font-display text-[10px] uppercase tracking-[0.34em] text-gold-300/70">
                Bảng vàng
              </p>
              <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-[0.12em] text-gold-300 text-glow-gold sm:text-4xl">
                BXH MỌI THỜI ĐẠI
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-white/55 sm:text-sm">
                Số gói hàng cao nhất của mỗi tên trong các ván đã hoàn thành. Dữ liệu được lưu trên máy chủ.
              </p>
            </motion.div>

            <section className="glass mx-auto mt-5 w-full rounded-3xl p-3 sm:mt-7 sm:p-5">
              <div className="flex items-center justify-between gap-2 px-1 pb-3">
                <p className="font-display text-[10px] uppercase tracking-[0.2em] text-white/55">
                  {state === 'ready'
                    ? `${entries.length} tên · ${totalMatches} ván`
                    : 'Đang tải...'}
                </p>
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="min-h-[40px] rounded-xl border border-white/10 px-3 font-display text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60"
                >
                  Làm mới
                </button>
              </div>

              {state === 'loading' && (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold-300/25 border-t-gold-300 motion-reduce:animate-none" />
                  <p className="text-xs text-white/50">Đang tải bảng xếp hạng...</p>
                </div>
              )}

              {state === 'error' && (
                <div role="alert" className="px-2 py-8 text-center">
                  <p className="text-sm text-red-200">
                    Không tải được bảng xếp hạng{error ? `: ${error}` : '.'}
                  </p>
                  <ActionButton
                    className="mt-4"
                    variant="outlineGold"
                    onClick={() => setReloadKey((key) => key + 1)}
                  >
                    THỬ LẠI
                  </ActionButton>
                </div>
              )}

              {state === 'ready' && entries.length === 0 && (
                <div className="px-2 py-10 text-center">
                  <p className="text-sm font-semibold text-white/75">Chưa có ván nào hoàn thành.</p>
                  <p className="mt-1 text-xs text-white/45">
                    Hãy là người đầu tiên ghi tên mình vào bảng vàng.
                  </p>
                  <ActionButton
                    className="mt-4"
                    variant="gold"
                    onClick={() => navigate('/multiplayer')}
                    icon={<CrownIcon className="h-4 w-4" />}
                  >
                    VÀO ĐẤU TRƯỜNG
                  </ActionButton>
                </div>
              )}

              {state === 'ready' && entries.length > 0 && (
                <ol aria-label="Bảng xếp hạng mọi thời đại" className="space-y-2">
                  {entries.map((entry, index) => (
                    <motion.li
                      key={`${entry.name}-${index}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 0.2, delay: Math.min(index * 0.025, 0.3) }
                      }
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border px-3 py-3',
                        entry.rank <= 3
                          ? 'border-gold-300/25 bg-gold-400/[0.07]'
                          : 'border-white/[0.06] bg-white/[0.03]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-display text-sm font-black',
                          entry.rank === 1
                            ? 'border-gold-300/45 bg-gold-300/15 text-gold-200'
                            : entry.rank === 2
                              ? 'border-white/20 bg-white/10 text-white/80'
                              : entry.rank === 3
                                ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                                : 'border-white/10 bg-white/5 text-white/50',
                        )}
                      >
                        {entry.rank}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold tracking-wide text-white/90">
                          {entry.name}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                          {entry.correct}/{entry.total} câu · {entry.matches} ván ·{' '}
                          {updatedAt ? formatDate(entry.lastPlayedAt) : ''}
                        </p>
                      </div>

                      <p className="shrink-0 text-right font-display text-base font-bold tabular-nums text-gold-200 sm:text-lg">
                        {entry.score.toLocaleString('vi-VN')}
                      </p>
                    </motion.li>
                  ))}
                </ol>
              )}

              {updatedAt && state === 'ready' && (
                <p className="mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-white/35">
                  Cập nhật {formatDate(updatedAt)}
                </p>
              )}
            </section>

            <div className="mt-5 flex justify-center">
              <ActionButton
                variant="gold"
                onClick={() => navigate('/multiplayer')}
                icon={<CrownIcon className="h-5 w-5" />}
              >
                VÀO ĐẤU TRƯỜNG
              </ActionButton>
            </div>
          </main>
        </div>
      </div>
    </GameScene>
  )
}
