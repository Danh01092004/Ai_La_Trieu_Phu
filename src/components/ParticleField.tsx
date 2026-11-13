import { memo, useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hue: number  // 45 = gold, 230 = royal blue
  alpha: number
  life: number
}

interface Props {
  density?: number
  className?: string
  interactive?: boolean
}

/**
 * Ambient canvas particle field: drifting glowing motes, subtle connective
 * lines (spatially bucketed to O(n) from O(n²)), and a gentle mouse repulsion.
 *
 * The field is intentionally rendered at 30 FPS: it is a slow ambient effect,
 * and halving the paint rate leaves more headroom for gameplay animations.
 * Glow sprites are rasterised once instead of creating a radial gradient for
 * every particle on every frame, which was the main allocation cost on phones.
 */
const CONNECTION_DISTANCE_SQ = 7500
const BUCKET_SIZE = 90
const TARGET_FPS = 30
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS
const SPRITE_SIZE = 64
const GOLD_RGB = '245,197,66'
const ROYAL_RGB = '91,116,240'

function createGlowSprite(rgb: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = SPRITE_SIZE
  sprite.height = SPRITE_SIZE

  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite

  const center = SPRITE_SIZE / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, `rgba(${rgb},1)`)
  gradient.addColorStop(0.4, `rgba(${rgb},0.55)`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return sprite
}

function ParticleFieldImpl({ density = 70, className, interactive = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sprites = {
      gold: createGlowSprite(GOLD_RGB),
      royal: createGlowSprite(ROYAL_RGB),
    }

    let width = 0
    let height = 0
    let dpr = 1
    let particles: Particle[] = []
    let raf = 0
    let lastDraw = 0

    // ── sizing ──────────────────────────────────────────────────────────────
    const resize = () => {
      // Cap DPR at 1.5 — above this the extra fill-rate cost is not visible.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const spawn = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 2.2 + 0.6,
      hue: Math.random() > 0.5 ? 45 : 230,
      alpha: Math.random() * 0.5 + 0.2,
      life: Math.random(),
    })

    const init = () => {
      resize()
      const count = Math.round((density * (width * height)) / (1280 * 720))
      particles = Array.from({ length: Math.max(20, Math.min(count, 80)) }, spawn)
    }

    // ── spatial bucketing for connection lines ───────────────────────────────
    const buildBuckets = (ps: Particle[]) => {
      const cols = Math.ceil(width / BUCKET_SIZE) + 1
      const rows = Math.ceil(height / BUCKET_SIZE) + 1
      const map = new Map<number, Particle[]>()
      const key = (c: number, r: number) => r * cols + c

      for (const p of ps) {
        const c = Math.floor(p.x / BUCKET_SIZE)
        const r = Math.floor(p.y / BUCKET_SIZE)
        const k = key(c, r)
        const bucket = map.get(k)
        if (bucket) bucket.push(p)
        else map.set(k, [p])
      }

      return { map, cols, rows, key }
    }

    // ── main loop ───────────────────────────────────────────────────────────
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw)

      // The tab is throttled by the browser anyway; skip work while hidden.
      if (document.hidden || time - lastDraw < FRAME_INTERVAL_MS) return
      lastDraw = time

      ctx.clearRect(0, 0, width, height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const p of particles) {
        // Physics runs at 30 FPS, so the per-frame step is doubled to keep the
        // drift speed identical to the previous 60 FPS implementation.
        p.x += p.vx * 2
        p.y += p.vy * 2
        p.life += 0.01
        p.alpha = 0.2 + Math.abs(Math.sin(p.life)) * 0.5

        // wrap
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10

        // mouse repulsion
        if (interactive) {
          const dx = p.x - mx
          const dy = p.y - my
          const d2 = dx * dx + dy * dy
          if (d2 < 12000) {
            const d = Math.sqrt(d2) || 1
            const force = (110 - d) / 110
            p.x += (dx / d) * force * 1.5
            p.y += (dy / d) * force * 1.5
          }
        }
      }

      // ── Draw particles from pre-rasterised glow sprites ───────────────────
      for (const p of particles) {
        const halo = p.size * 2.5
        ctx.globalAlpha = p.alpha
        ctx.drawImage(
          p.hue === 45 ? sprites.gold : sprites.royal,
          p.x - halo,
          p.y - halo,
          halo * 2,
          halo * 2,
        )
      }
      ctx.globalAlpha = 1

      // ── Connection lines (spatially bucketed) ─────────────────────────────
      const { map, cols, rows, key } = buildBuckets(particles)

      for (const p of particles) {
        const pc = Math.floor(p.x / BUCKET_SIZE)
        const pr = Math.floor(p.y / BUCKET_SIZE)

        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const nc = pc + dc
            const nr = pr + dr
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue

            const neighbours = map.get(key(nc, nr))
            if (!neighbours) continue

            for (const q of neighbours) {
              if (q === p) continue
              const dx = p.x - q.x
              const dy = p.y - q.y
              const dist2 = dx * dx + dy * dy

              if (dist2 < CONNECTION_DISTANCE_SQ) {
                const alpha = (1 - dist2 / CONNECTION_DISTANCE_SQ) * 0.13
                ctx.strokeStyle = `rgba(120,150,255,${alpha})`
                ctx.lineWidth = 0.6
                ctx.beginPath()
                ctx.moveTo(p.x, p.y)
                ctx.lineTo(q.x, q.y)
                ctx.stroke()
              }
            }
          }
        }
      }
    }

    // ── pointer handlers ────────────────────────────────────────────────────
    const onMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }
    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }

    init()
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', init)
    if (interactive) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseleave', onLeave)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', init)
      if (interactive) {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseleave', onLeave)
      }
    }
  }, [density, interactive])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}

export const ParticleField = memo(ParticleFieldImpl)
