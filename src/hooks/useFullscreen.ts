import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
  const supported =
    typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  )

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      /* fullscreen may be blocked; ignore */
    }
  }, [])

  return { isFullscreen, toggle, supported }
}
