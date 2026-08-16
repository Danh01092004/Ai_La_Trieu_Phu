import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GameScene } from '@/components/GameScene'
import { Celebration } from '@/components/Celebration'
import { useGameResult } from '@/state/GameResultContext'
import { loadHighScore, saveHighScore } from '@/state/scoreStore'
import { formatCandies } from '@/utils'
import { TOTAL_QUESTIONS } from '@/services/ladder'

export function Result() {
  const navigate = useNavigate()
  const { result, clear } = useGameResult()

  useEffect(() => {
    if (!result) {
      navigate('/', { replace: true })
      return
    }
    saveHighScore(result.candies)
  }, [result, navigate])

  if (!result) return null

  const isWin = result.outcome === 'won'
  const high = loadHighScore()

  const handleRetry = () => {
    clear()
    navigate('/game')
  }

  const handleHome = () => {
    clear()
    navigate('/')
  }

  return (
    <GameScene variant={isWin ? 'win' : 'lose'}>
      {isWin ? (
        <>
          <Celebration mode="confetti" />
          <Celebration mode="fireworks" />
        </>
      ) : (
        <Celebration mode="embers" />
      )}

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="text-8xl"
        >
          {isWin ? '🏆' : '💔'}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={
            isWin
              ? 'mt-4 font-display text-5xl font-black uppercase tracking-wide text-gold-300 text-glow-gold md:text-7xl'
              : 'mt-4 font-display text-5xl font-black uppercase tracking-wide text-red-400 md:text-7xl'
          }
          style={!isWin ? { textShadow: '0 0 24px rgba(239,68,68,0.7)' } : undefined}
        >
          {isWin ? 'Nhà Vô Địch!' : 'Kết thúc'}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass mt-8 flex flex-col items-center gap-3 rounded-3xl px-10 py-6"
        >
          <span className="text-sm uppercase tracking-[0.3em] text-white/50">
            Câu đã vượt qua: {result.reachedLevel} / {TOTAL_QUESTIONS}
          </span>
          <span className="flex items-center gap-3 font-display text-4xl font-bold text-gold-200">
            🍬 {formatCandies(result.candies)}
            <span className="text-lg font-normal text-white/60">kẹo</span>
          </span>
          <span className="text-sm text-white/60">
            Kỷ lục: {formatCandies(high)} kẹo
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex gap-4"
        >
          <motion.button
            onClick={handleRetry}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 font-display text-lg font-bold text-night-900 shadow-gold"
          >
            Chơi lại
          </motion.button>
          <motion.button
            onClick={handleHome}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl border border-white/20 bg-white/5 px-8 py-3 font-display text-lg font-bold text-white/90 backdrop-blur-md hover:border-gold-300/60"
          >
            Trang chủ
          </motion.button>
        </motion.div>
      </div>
    </GameScene>
  )
}
