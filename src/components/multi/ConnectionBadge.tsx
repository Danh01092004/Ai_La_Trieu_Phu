import { memo } from 'react'
import { cn } from '@/utils'
import type { RoomConnectionStatus } from '@/multiplayer/useRoom'

interface Props {
  status: RoomConnectionStatus
  className?: string
}

const COPY: Record<RoomConnectionStatus, { label: string; dot: string; text: string }> = {
  connecting: {
    label: 'ĐANG KẾT NỐI',
    dot: 'bg-gold-300 animate-pulse motion-reduce:animate-none',
    text: 'text-gold-200/80',
  },
  connected: {
    label: 'ĐÃ KẾT NỐI',
    dot: 'bg-emerald-400',
    text: 'text-emerald-200/80',
  },
  disconnected: {
    label: 'MẤT KẾT NỐI',
    dot: 'bg-red-400',
    text: 'text-red-200/80',
  },
}

/** Small server-connection indicator shared by the entry, lobby and start views. */
function ConnectionBadgeComponent({ status, className }: Props) {
  const copy = COPY[status]

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5',
        'font-display text-[10px] uppercase tracking-[0.2em]',
        copy.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', copy.dot)} aria-hidden="true" />
      {copy.label}
    </span>
  )
}

export const ConnectionBadge = memo(ConnectionBadgeComponent)
