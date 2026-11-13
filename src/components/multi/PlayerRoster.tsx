import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { RoomState } from '@/types/multiplayer'
import { cn } from '@/utils'

interface Props {
  room: RoomState
  playerId: string | null
}

const AVATAR_STYLES = [
  'border-gold-300/35 bg-gold-400/15 text-gold-200',
  'border-royal-300/35 bg-royal-400/15 text-royal-300',
  'border-purpleglow-400/35 bg-purpleglow-500/15 text-purpleglow-400',
]

/** Scrollable room roster; the server orders players by join time. */
function PlayerRosterComponent({ room, playerId }: Props) {
  const reduceMotion = useReducedMotion()
  const remaining = Math.max(0, room.maxPlayers - room.players.length)
  const full = remaining === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-[11px] uppercase tracking-[0.28em] text-white/55">
          Danh sách người chơi
        </p>
        <p
          className={cn(
            'font-display text-xs tabular-nums',
            full ? 'text-gold-300' : 'text-white/55',
          )}
          aria-live="polite"
        >
          {room.players.length}/{room.maxPlayers}
        </p>
      </div>

      <ul
        aria-label="Người chơi trong phòng"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: 'clamp(15rem, 42vh, 26rem)' }}
      >
        {room.players.map((player, index) => {
          const isYou = player.id === playerId
          const initial = [...player.name][0]?.toUpperCase() ?? '?'
          const avatar = AVATAR_STYLES[index % AVATAR_STYLES.length]

          return (
            <motion.li
              key={player.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, delay: Math.min(index * 0.02, 0.25) }}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-opacity',
                !player.connected && 'opacity-50',
                isYou
                  ? 'border-gold-300/30 bg-gold-400/[0.07]'
                  : 'border-white/[0.06] bg-white/[0.03]',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-display text-sm font-bold',
                  avatar,
                )}
                aria-hidden="true"
              >
                {initial}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-display text-sm font-semibold tracking-wide text-white/90">
                    {player.name}
                  </p>
                  {isYou && (
                    <span className="shrink-0 rounded-md border border-gold-300/30 bg-gold-400/10 px-1.5 py-0.5 font-display text-[8px] uppercase tracking-[0.15em] text-gold-200">
                      Bạn
                    </span>
                  )}
                </div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                  {!player.connected ? 'Mất kết nối · đang giữ chỗ' : 'Người chơi'}
                </p>
              </div>
            </motion.li>
          )
        })}
      </ul>

      <p className="mt-2 text-right text-[11px] text-white/50">
        {full ? 'Phòng đã đầy' : `Còn ${remaining} chỗ trống`}
      </p>
    </div>
  )
}

/**
 * Copy/start local state in RoomLobby must not rerender the whole roster; the
 * `room` object only changes when authoritative state changes.
 */
export const PlayerRoster = memo(PlayerRosterComponent)
