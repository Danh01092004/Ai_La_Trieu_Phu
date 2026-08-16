import { HashRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { SettingsProvider } from '@/state/SettingsContext'
import { GameResultProvider } from '@/state/GameResultContext'
import { Home } from '@/pages/Home'

// Lazy-load heavy pages → separate JS chunks for better initial load
const Game   = lazy(() => import('@/pages/Game').then(m => ({ default: m.Game })))
const Result = lazy(() => import('@/pages/Result').then(m => ({ default: m.Result })))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/game"   element={<Suspense fallback={null}><Game /></Suspense>} />
        <Route path="/result" element={<Suspense fallback={null}><Result /></Suspense>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <GameResultProvider>
        <HashRouter>
          <AnimatedRoutes />
        </HashRouter>
      </GameResultProvider>
    </SettingsProvider>
  )
}
