import { useCallback, useMemo } from 'react'
import { useSettingsActions } from '@/state/SettingsContext'

/**
 * Click / hover sound helpers for interactive elements.
 * Both callbacks are stable for the lifetime of the provider.
 */
export function useSfxActions() {
  const { playSfx } = useSettingsActions()

  const hover = useCallback(() => playSfx('hover'), [playSfx])

  const click = useCallback(
    (action?: () => void) => () => {
      playSfx('click')
      action?.()
    },
    [playSfx],
  )

  return useMemo(() => ({ hover, click }), [hover, click])
}
