import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { GameResultPayload } from '@/types'

interface GameResultContextValue {
  result: GameResultPayload | null
  setResult: (r: GameResultPayload) => void
  clear: () => void
}

const GameResultContext = createContext<GameResultContextValue | null>(null)

export function GameResultProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<GameResultPayload | null>(null)

  const setResult = useCallback((r: GameResultPayload) => setResultState(r), [])
  const clear = useCallback(() => setResultState(null), [])

  return (
    <GameResultContext.Provider value={{ result, setResult, clear }}>
      {children}
    </GameResultContext.Provider>
  )
}

export function useGameResult() {
  const ctx = useContext(GameResultContext)
  if (!ctx) throw new Error('useGameResult must be used within GameResultProvider')
  return ctx
}
