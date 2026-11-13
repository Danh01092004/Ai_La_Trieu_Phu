import { useEffect } from 'react'
import type { LifelineResult } from '@/types/multiplayer'
import { ANSWER_LETTERS, cn } from '@/utils'

interface Props {
  result: LifelineResult
  onClose: () => void
}

const RESULT_TITLES: Record<LifelineResult['type'], string> = {
  fifty: '50:50',
  phone: 'Gọi điện cho bạn',
  audience: 'Khán giả bình chọn',
  mc: 'MC gợi ý',
}

/** Short, non-blocking lifeline feedback; the 15s question clock keeps running. */
export function LifelineResultCard({ result, onClose }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6_000)
    return () => window.clearTimeout(timer)
  }, [onClose, result])

  return (
    <section
      role="status"
      aria-live="polite"
      className="glass mx-auto w-full max-w-2xl rounded-2xl border border-gold-300/20 px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[9px] uppercase tracking-[0.22em] text-gold-300/75">
          Trợ giúp · {RESULT_TITLES[result.type]}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng kết quả trợ giúp"
          className="-mr-1 -mt-2 min-h-[44px] min-w-[44px] rounded-lg text-lg text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60"
        >
          ×
        </button>
      </div>

      {result.type === 'fifty' && (
        <p className="mt-1 text-xs text-white/70">
          Đã loại 2 đáp án sai:{' '}
          <span className="font-display font-bold text-gold-200">
            {result.removed.map((index) => ANSWER_LETTERS[index]).join(' và ')}
          </span>
        </p>
      )}

      {result.type === 'mc' && (
        <p className="mt-1 text-xs leading-relaxed text-white/75">
          <span className="mr-1" aria-hidden="true">🎙️</span>
          MC chọn <strong className="text-gold-200">{result.suggestedLetter}</strong> —{' '}
          {result.suggestedText}
        </p>
      )}

      {result.type === 'phone' && (
        <p className="mt-1 text-xs leading-relaxed text-white/75">
          <span className="mr-1" aria-hidden="true">📞</span>
          “{result.phrase}{' '}
          <strong className="text-gold-200">{result.suggestedLetter}</strong> —{' '}
          {result.suggestedText}.”
        </p>
      )}

      {result.type === 'audience' && (
        <div className="mt-1.5 space-y-1">
          {result.percentages.map((percentage, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-4 shrink-0 font-display text-[11px] font-bold',
                  index === result.displayWinnerId ? 'text-gold-300' : 'text-white/50',
                )}
              >
                {ANSWER_LETTERS[index]}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    index === result.displayWinnerId
                      ? 'bg-gradient-to-r from-gold-400 to-amber-300'
                      : 'bg-royal-400/60',
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </span>
              <span
                className={cn(
                  'w-8 shrink-0 text-right font-display text-[10px] tabular-nums',
                  index === result.displayWinnerId ? 'text-gold-200' : 'text-white/50',
                )}
              >
                {percentage}%
              </span>
            </div>
          ))}
          <p className="text-[9px] text-white/35">
            Khán giả có thể chọn sai. Hãy tự quyết định.
          </p>
        </div>
      )}

      {result.type === 'fifty' && (
        <p className="mt-1 text-[9px] text-white/35">
          Hai đáp án còn lại vẫn có thể sai.
        </p>
      )}
    </section>
  )
}
