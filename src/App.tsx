import { HashRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { SettingsProvider } from '@/state/SettingsContext'
import { Home } from '@/pages/Home'
import { Leaderboard } from '@/pages/Leaderboard'

// Lazy-load the multiplayer battlefield so the landing page stays tiny.
const Multiplayer = lazy(() =>
  import('@/pages/multi/Multiplayer').then((m) => ({ default: m.Multiplayer })),
)

/**
 * Route table. Pages animate their own entrance; navigation unmounts the old
 * page immediately on purpose. Single-player has been retired — every play
 * action now lands in the 40-player arena.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route
        path="/multiplayer/*"
        element={<Suspense fallback={null}><Multiplayer /></Suspense>}
      />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <HashRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </HashRouter>
    </SettingsProvider>
  )
}
