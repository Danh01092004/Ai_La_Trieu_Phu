import { motion } from 'framer-motion'

interface LogoProps {
  className?: string
  animated?: boolean
  style?: React.CSSProperties
}

/**
 * Premium 3D gold + neon-blue game-show logo, rendered as inline SVG so it is
 * crisp at any resolution and needs no binary asset.
 */
export function Logo({ className, animated = true, style }: LogoProps) {
  return (
    <motion.svg
      viewBox="0 0 600 260"
      className={className}
      style={style}
      initial={animated ? { opacity: 0, scale: 0.8 } : false}
      animate={animated ? { opacity: 1, scale: 1 } : undefined}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      role="img"
      aria-label="AI LÀ TRIỆU PHÚ"
    >
      <defs>
        <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="35%" stopColor="#ffd966" />
          <stop offset="60%" stopColor="#f5c542" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="blueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ea8ff" />
          <stop offset="100%" stopColor="#3a52d6" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(124,58,237,0.55)" />
          <stop offset="100%" stopColor="rgba(124,58,237,0)" />
        </radialGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>

      <ellipse cx="300" cy="120" rx="290" ry="120" fill="url(#halo)" />

      {/* Decorative ring */}
      <motion.circle
        cx="300"
        cy="120"
        r="112"
        fill="none"
        stroke="url(#blueFill)"
        strokeWidth="2"
        strokeDasharray="6 10"
        opacity="0.5"
        filter="url(#glow)"
        animate={animated ? { rotate: 360 } : undefined}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '300px 120px' }}
      />

      <g filter="url(#softShadow)">
        <text
          x="300"
          y="96"
          textAnchor="middle"
          fontFamily="Oswald, Bebas Neue, sans-serif"
          fontWeight="700"
          fontSize="58"
          fill="url(#blueFill)"
          filter="url(#glow)"
          letterSpacing="4"
        >
          AI LÀ
        </text>
        <text
          x="300"
          y="182"
          textAnchor="middle"
          fontFamily="Oswald, Bebas Neue, sans-serif"
          fontWeight="700"
          fontSize="92"
          fill="url(#goldFill)"
          stroke="#6b4e04"
          strokeWidth="1.5"
          filter="url(#glow)"
          letterSpacing="2"
        >
          TRIỆU PHÚ
        </text>
      </g>

      <motion.g
        animate={animated ? { opacity: [0.3, 1, 0.3] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="118" cy="150" r="4" fill="#ffd966" />
        <circle cx="484" cy="150" r="4" fill="#ffd966" />
        <circle cx="150" cy="60" r="3" fill="#8ea8ff" />
        <circle cx="452" cy="60" r="3" fill="#8ea8ff" />
      </motion.g>
    </motion.svg>
  )
}
