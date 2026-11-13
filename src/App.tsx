import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { SettingsProvider } from '@/state/SettingsContext'
import { Home } from '@/pages/Home'
import { Leaderboard } from '@/pages/Leaderboard'
import { hasRoomSession } from '@/multiplayer/session'

// Lazy-load the multiplayer battlefield so the landing page stays tiny.
const Multiplayer = lazy(() =>
  import('@/pages/multi/Multiplayer').then((m) => ({ default: m.Multiplayer })),
)

/**
 * The host tab can be restored at "/" after a browser freeze/crash. If this tab
 * still owns a room session, send it back to the arena instead of showing the
 * landing page while the server room keeps playing in the background.
 */
function HomeRoute() {
  const navigate = useNavigate()

  useEffect(() => {
    if (hasRoomSession()) navigate('/multiplayer', { replace: true })
  }, [navigate])

  return <Home />
}

/**
 * Route table. Pages animate their own entrance; navigation unmounts the old
 * page immediately on purpose. Single-player has been retired — every play
 * action now lands in the 40-player arena.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
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
