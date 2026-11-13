import { useId } from 'react'
import { cn } from '@/utils'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  error?: string | null
  maxLength?: number
  autoComplete?: string
  autoFocus?: boolean
  inputMode?: 'text' | 'numeric'
  uppercase?: boolean
  center?: boolean
  disabled?: boolean
  className?: string
}

/** Shared labelled input used by the room create/join forms. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  maxLength,
  autoComplete = 'off',
  autoFocus = false,
  inputMode = 'text',
  uppercase = false,
  center = false,
  disabled = false,
  className,
}: Props) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={id}
        className="block font-display text-[11px] uppercase tracking-[0.28em] text-white/60"
      >
        {label}
      </label>

      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        spellCheck={false}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          'w-full rounded-2xl border bg-night-900/65 px-4 py-3 font-body text-base text-white outline-none transition',
          'placeholder:text-white/40 focus:ring-2',
          center && 'text-center',
          uppercase && 'font-display uppercase tracking-[0.28em]',
          error
            ? 'border-red-400/60 focus:border-red-300 focus:ring-red-400/20'
            : 'border-white/10 focus:border-gold-300/60 focus:ring-gold-300/15',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11px] leading-relaxed text-white/55">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
