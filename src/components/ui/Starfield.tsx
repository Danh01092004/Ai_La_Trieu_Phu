import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils'
import { randomBetween } from '@/utils/random'

interface Star {
  width: number
  height: number
  left: number
  top: number
  opacity: number
  duration: number
  delay: number
}

function buildStars(count: number, maxTop: number): Star[] {
  return Array.from({ length: count }, () => ({
    width:    randomBetween(1, 3.5),
    height:   randomBetween(1, 3.5),
    left:     randomBetween(0, 100),
    top:      randomBetween(0, maxTop),
    opacity:  randomBetween(0.1, 0.6),
    duration: randomBetween(2, 5),
    delay:    randomBetween(0, 2),
  }))
}

interface Props {
  count?: number
  /** Vertical spread of the stars, as a percentage of the container height. */
  maxTop?: number
  className?: string
}

/** Twinkling starfield backdrop used by the lifeline overlays. */
export const Starfield = memo(function Starfield({
  count = 36,
  maxTop = 100,
  className,
}: Props) {
  const stars = useMemo(() => buildStars(count, maxTop), [count, maxTop])

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)} aria-hidden="true">
      {stars.map((star, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full bg-white"
          style={{
            width:   star.width,
            height:  star.height,
            left:    `${star.left}%`,
            top:     `${star.top}%`,
            opacity: star.opacity,
          }}
          animate={{ opacity: [0.1, 0.6, 0.1] }}
          transition={{ duration: star.duration, repeat: Infinity, delay: star.delay }}
        />
      ))}
    </div>
  )
})
