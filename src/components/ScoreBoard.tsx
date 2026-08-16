import { memo } from 'react'
import { motion } from 'framer-motion'
import { formatCandies } from '@/utils'

interface Props {
  candies: number
}

function Candy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none">
      <ellipse cx="12" cy="12" rx="6" ry="5.5" fill="currentColor" />
      <path d="M6 12 1.5 8.5v7L6 12Zm12 0 4.5-3.5v7L18 12Z" fill="currentColor" opacity="0.85" />
      <ellipse cx="10.4" cy="10.4" rx="1.4" ry="1.2" fill="#fff" opacity="0.55" />
    </svg>
  )
}

export const ScoreBoard = memo(function ScoreBoard({ candies }: Props) {
  return (
    <div
      className="glass flex items-center gap-2 rounded-2xl"
      style={{ padding: 'clamp(0.35rem, 0.8vh, 0.65rem) clamp(0.75rem, 1.4vw, 1.25rem)' }}
    >
      <Candy
        className="text-pink-300"
        style={{ width: 'clamp(1.1rem, 1.8vw, 1.5rem)', height: 'clamp(1.1rem, 1.8vw, 1.5rem)' }}
      />
      <motion.span
        key={candies}
        initial={{ scale: 1.4, color: '#fff' }}
        animate={{ scale: 1, color: '#ffe89e' }}
        className="font-display font-bold tabular-nums text-gold-200"
        style={{ fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)' }}
      >
        {formatCandies(candies)}
      </motion.span>
    </div>
  )
})
