/**
 * Route-level prefetch for the multiplayer chunk.
 *
 * `App.tsx` lazy-loads the same module; Vite/Rollup deduplicates the dynamic
 * import, so a hover/focus/tap on Home can start the download while the button
 * press animation runs. The module-level promise prevents duplicate requests.
 */
let preloadPromise: Promise<unknown> | null = null

export function preloadMultiplayer(): void {
  if (preloadPromise) return

  preloadPromise = import('@/pages/multi/Multiplayer').catch(() => {
    // A failed prefetch must not break the actual navigation; clear it so a
    // later hover or click can retry.
    preloadPromise = null
  })
}
