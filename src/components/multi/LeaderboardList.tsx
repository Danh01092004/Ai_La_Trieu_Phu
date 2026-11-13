import type { LeaderboardEntry } from '@/types/multiplayer'
import { cn } from '@/utils'

interface Props {
  entries: LeaderboardEntry[]
  playerId: string | null
  compact?: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']

/** Ranked rows shared by the per-question reveal and the final screen. */
export function LeaderboardList({ entries, playerId, compact = false }: Props) {
  return (
    <ol className={cn('space-y-1.5', compact && 'space-y-1')} aria-label="Bảng xếp hạng">
      {entries.map((entry) => {
        const isYou = entry.playerId === playerId
        return (
          <li
            key={entry.playerId}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-2.5',
              compact ? 'min-h-[32px] py-1' : 'min-h-[42px] py-1.5',
              isYou
                ? 'border-gold-300/35 bg-gold-400/[0.08]'
                : 'border-white/[0.06] bg-white/[0.025]',
            )}
          >
            <span
              className={cn(
                'shrink-0 text-center font-display font-bold tabular-nums',
                compact ? 'w-6 text-[11px]' : 'w-8 text-sm',
                entry.rank <= 3 ? 'text-gold-300' : 'text-white/45',
              )}
              aria-label={`Hạng ${entry.rank}`}
            >
              {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-display',
                compact ? 'text-[11px]' : 'text-xs sm:text-sm',
                isYou ? 'text-gold-100' : 'text-white/80',
              )}
            >
              {entry.name}
              {isYou && (
                <span className="ml-1.5 rounded border border-gold-300/30 bg-gold-400/10 px-1 py-0.5 text-[8px] uppercase tracking-wider text-gold-200">
                  Bạn
                </span>
              )}
            </span>
            <span
              className={cn(
                'hidden shrink-0 text-[10px] text-white/40 sm:inline',
                compact && 'sm:hidden',
              )}
            >
              {entry.correct} đúng
            </span>
            <span
              className={cn(
                'shrink-0 text-right font-display font-bold tabular-nums',
                compact ? 'text-[11px]' : 'text-xs sm:text-sm',
                isYou ? 'text-gold-200' : 'text-white/70',
              )}
            >
              {entry.score.toLocaleString('vi-VN')}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
