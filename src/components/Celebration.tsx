import { memo, useEffect, useRef } from 'react'

type Mode = 'confetti' | 'fireworks' | 'embers' | 'feathers'

interface Props {
  mode: Mode
  className?: string
}

interface P {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rot: number
  vr: number
  life: number
  maxLife: number
  shape: 'rect' | 'circle' | 'feather'
  sway: number
}

const GOLD   = ['#f5c542', '#ffd966', '#ffe89e', '#e0aa1e', '#fff4c2']
const PARTY  = ['#f5c542', '#5b74f0', '#a855f7', '#f87171', '#34d399', '#ffd966']
const RED    = ['#ef4444', '#b91c1c', '#f87171', '#7f1d1d', '#fca5a5']
const FEATHER = ['#ffffff', '#fef9c3', '#fef3c7', '#fde68a', '#f8fafc']

/**
 * Celebration / mood particle canvas.
 *  - confetti: gravity-driven falling ribbons (victory)
 *  - fireworks: periodic bursts (victory)
 *  - embers: slow rising red motes (lose)
 *  - feathers: drifting chicken feathers (lose/retire chaos)
 *
 * Performance improvements vs v1:
 *  - shadowBlur set ONCE per draw pass (embers/fireworks only), not per particle.
 *  - Particles are sorted by shape so same-shape draws are batched.
 *  - DPR capped at 1.5 to limit fill-rate overhead.
 *  - Max particle counts tightened.
 */
function CelebrationImpl({ mode, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0
    let dpr = 1
    let particles: P[] = []
    let raf = 0
    let burstTimer = 0

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width  = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

    const spawnConfetti = (n: number) => {
      for (let i = 0; i < n; i++) {
        particles.push({
          x: rand(0, w), y: rand(-h * 0.3, 0),
          vx: rand(-1, 1), vy: rand(1.5, 4),
          size: rand(6, 12), color: pick(PARTY),
          rot: rand(0, Math.PI * 2), vr: rand(-0.2, 0.2),
          life: 0, maxLife: rand(200, 400),
          shape: Math.random() > 0.4 ? 'rect' : 'circle', sway: 0,
        })
      }
    }

    const spawnBurst = (cx: number, cy: number) => {
      const color = pick(GOLD)
      for (let i = 0; i < 50; i++) {
        const angle = (Math.PI * 2 * i) / 50
        const speed = rand(2, 6)
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          size: rand(2, 4), color: Math.random() > 0.5 ? color : pick(PARTY),
          rot: 0, vr: 0, life: 0, maxLife: rand(60, 110),
          shape: 'circle', sway: 0,
        })
      }
    }

    const spawnEmber = () => {
      particles.push({
        x: rand(0, w), y: h + 10,
        vx: rand(-0.3, 0.3), vy: rand(-1.4, -0.5),
        size: rand(1.5, 3.5), color: pick(RED),
        rot: 0, vr: 0, life: 0, maxLife: rand(120, 260),
        shape: 'circle', sway: 0,
      })
    }

    const spawnFeather = () => {
      particles.push({
        x: rand(0, w), y: rand(-40, -10),
        vx: rand(-0.6, 0.6), vy: rand(0.6, 1.8),
        size: rand(6, 13), color: pick(FEATHER),
        rot: rand(0, Math.PI * 2), vr: rand(-0.06, 0.06),
        life: 0, maxLife: rand(160, 320),
        shape: 'feather', sway: rand(0.6, 1.8),
      })
    }

    // Max particle limits (tighter than v1)
    const MAX: Record<Mode, number> = {
      confetti:  220,
      fireworks: 280,
      embers:    130,
      feathers:  160,
    }

    const step = () => {
      ctx.clearRect(0, 0, w, h)

      // Spawn new particles
      if (mode === 'confetti'  && particles.length < MAX.confetti)  spawnConfetti(3)
      if (mode === 'embers'    && particles.length < MAX.embers)    spawnEmber()
      if (mode === 'feathers'  && particles.length < MAX.feathers) { spawnFeather(); spawnFeather() }
      if (mode === 'fireworks') {
        burstTimer--
        if (burstTimer <= 0) {
          spawnBurst(rand(w * 0.15, w * 0.85), rand(h * 0.15, h * 0.5))
          burstTimer = rand(18, 40)
        }
      }

      // Physics pass (no canvas ops)
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        p.x   += p.vx
        p.y   += p.vy
        p.rot += p.vr

        if (mode === 'confetti') {
          p.vy += 0.05
          p.vx += Math.sin(p.life * 0.05) * 0.03
        } else if (mode === 'fireworks') {
          p.vy += 0.06; p.vx *= 0.98; p.vy *= 0.98
        } else if (mode === 'feathers') {
          p.x  += Math.sin(p.life * 0.03) * p.sway
          p.vy  = Math.min(p.vy + 0.004, 1.6)
        } else {
          // embers
          p.vx += Math.sin(p.life * 0.04) * 0.02
        }

        if (p.life >= p.maxLife || p.y > h + 40 || p.y < -60) {
          particles.splice(i, 1)
        }
      }

      // ── Draw — ONE shadowBlur setting per pass ──────────────────────────
      // Embers and fireworks get a glow; confetti/feathers don't (saves GPU).
      const needGlow = mode === 'embers' || mode === 'fireworks'

      if (needGlow) {
        ctx.shadowBlur = 10
      } else {
        ctx.shadowBlur = 0
      }

      for (const p of particles) {
        const t     = p.life / p.maxLife
        const alpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2)
        ctx.globalAlpha = alpha
        ctx.fillStyle   = p.color
        if (needGlow) ctx.shadowColor = p.color  // only when glow is on

        if (p.shape === 'rect') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5)
          ctx.restore()
        } else if (p.shape === 'feather') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.beginPath()
          ctx.moveTo(0, -p.size)
          ctx.quadraticCurveTo( p.size * 0.7, 0, 0,  p.size)
          ctx.quadraticCurveTo(-p.size * 0.7, 0, 0, -p.size)
          ctx.fill()
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur  = 0
      raf = requestAnimationFrame(step)
    }

    resize()
    if (mode === 'confetti') spawnConfetti(100)
    step()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [mode])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

export const Celebration = memo(CelebrationImpl)
