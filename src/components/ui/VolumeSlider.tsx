import { cn } from '@/utils'
import type { ControlSize } from './Toggle'

const SIZES: Record<ControlSize, { container: string; heading: string }> = {
  md: { container: 'rounded-2xl px-4 py-3', heading: 'font-body text-white/90' },
  sm: { container: 'rounded-xl px-4 py-3',  heading: 'font-body text-sm text-white/90' },
}

interface Props {
  label: string
  value: number
  onChange: (value: number) => void
  icon?: string
  size?: ControlSize
  className?: string
}

/** Labelled 0–100 % volume slider. */
export function VolumeSlider({ label, value, onChange, icon, size = 'md', className }: Props) {
  const style = SIZES[size]

  return (
    <div
      className={cn('border border-white/10 bg-white/5', style.container, className)}
    >
      <div className={cn('mb-2 flex items-center justify-between', style.heading)}>
        <span className="flex items-center gap-3">
          {icon && <span className="text-xl">{icon}</span>}
          {label}
        </span>
        <span className="tabular-nums text-gold-300">{Math.round(value * 100)}%</span>
      </div>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-gold-400"
      />
    </div>
  )
}
