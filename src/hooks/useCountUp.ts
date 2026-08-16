import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from 0 to `target` over `duration` ms with an ease-out
 * curve. Restarts whenever `target` changes. rAF-driven, cleaned up on unmount.
 */
export function useCountUp(target: number, duration = 1400, delay = 0): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let start: number | null = null
    let delayTimer: number | null = null
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

    const tick = (now: number) => {
      if (start === null) start = now
      const elapsed = now - start
      const p = Math.min(1, elapsed / duration)
      setValue(Math.round(easeOut(p) * target))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }

    delayTimer = window.setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick)
    }, delay)

    return () => {
      if (delayTimer !== null) clearTimeout(delayTimer)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  return value
}
