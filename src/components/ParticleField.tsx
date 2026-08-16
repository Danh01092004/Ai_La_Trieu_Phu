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
 * Performance improvements vs v1:
 *  - Connective lines use a grid bucket spatial index → O(n) instead of O(n²).
 *  - shadowBlur removed entirely: glow is now a per-particle radial gradient
 *    (two-stop, solid-core → transparent-halo) — no GPU compositing buffer.
 *  - DPR capped at 1.5 on high-density screens to halve fill-rate.
 *  - Line check threshold reduced from 9000 to 7500 px² (shorter connections).
 */
function ParticleFieldImpl({ density = 70, className, interactive = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let particles: Particle[] = []
    let raf = 0

    // ── sizing ──────────────────────────────────────────────────────────────
    const resize = () => {
      // Cap DPR at 1.5 — above this the extra fill-rate cost is not visible.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width  = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width  = width  * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const spawn = (): Particle => ({
      x:     Math.random() * width,
      y:     Math.random() * height,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.25,
      size:  Math.random() * 2.2 + 0.6,
      hue:   Math.random() > 0.5 ? 45 : 230,
      alpha: Math.random() * 0.5 + 0.2,
      life:  Math.random(),
    })

    const init = () => {
      resize()
      const count = Math.round((density * (width * height)) / (1280 * 720))
      particles = Array.from({ length: Math.max(20, Math.min(count, 80)) }, spawn)
    }

    // ── spatial bucketing for connection lines ───────────────────────────────
    // Bucket size = connection threshold (sqrt of 7500 ≈ 87 px).
    // Only check neighbours in the same + adjacent buckets → O(n) total.
    const CONN_DIST2 = 7500
    const BUCKET_SIZE = 90

    const buildBuckets = (ps: Particle[]) => {
      const cols = Math.ceil(width  / BUCKET_SIZE) + 1
      const rows = Math.ceil(height / BUCKET_SIZE) + 1
      const map  = new Map<number, Particle[]>()
      const key  = (c: number, r: number) => r * cols + c
      for (const p of ps) {
        const c = Math.floor(p.x / BUCKET_SIZE)
        const r = Math.floor(p.y / BUCKET_SIZE)
        const k = key(c, r)
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(p)
      }
      return { map, cols, rows, key }
    }

    // ── main loop ───────────────────────────────────────────────────────────
    const step = () => {
      ctx.clearRect(0, 0, width, height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const p of particles) {
        // physics
        p.x   += p.vx
        p.y   += p.vy
        p.life += 0.005
        p.alpha = 0.2 + Math.abs(Math.sin(p.life)) * 0.5

        // wrap
        if (p.x < -10) p.x = width  + 10
        if (p.x > width  + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10

        // mouse repulsion
        if (interactive) {
          const dx = p.x - mx
          const dy = p.y - my
          const d2 = dx * dx + dy * dy
          if (d2 < 12000) {
            const d     = Math.sqrt(d2) || 1
            const force = (110 - d) / 110
            p.x += (dx / d) * force * 1.5
            p.y += (dy / d) * force * 1.5
          }
        }
      }

      // ── Draw particles with radial gradient glow (no shadowBlur) ──────────
      // shadowBlur forces a per-draw GPU compositing buffer allocation and is
      // removed entirely. We approximate the soft halo with a two-stop radial
      // gradient: solid core at the particle radius, transparent at 2.5× radius.
      // This runs entirely on the 2D canvas rasteriser with no extra GPU pass.
      for (const p of particles) {
        const r     = p.size
        const halo  = r * 2.5
        const isGold = p.hue === 45
        const [cr, cg, cb] = isGold ? [245, 197, 66] : [91, 116, 240]

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo)
        grad.addColorStop(0,   `rgba(${cr},${cg},${cb},${p.alpha})`)
        grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${p.alpha * 0.55})`)
        grad.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`)

        ctx.beginPath()
        ctx.arc(p.x, p.y, halo, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      // ── Connection lines (spatially bucketed) ────────────────────────────
      // shadowBlur is already 0 (never set above — no reset needed)
      const { map, cols, key } = buildBuckets(particles)

      for (const p of particles) {
        const pc = Math.floor(p.x / BUCKET_SIZE)
        const pr = Math.floor(p.y / BUCKET_SIZE)

        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const nc = pc + dc
            const nr = pr + dr
            if (nc < 0 || nr < 0 || nc >= cols) continue
            const neighbours = map.get(key(nc, nr))
            if (!neighbours) continue

            for (const q of neighbours) {
              if (q === p) continue  // skip self
              const dx   = p.x - q.x
              const dy   = p.y - q.y
              const dist2 = dx * dx + dy * dy
              if (dist2 < CONN_DIST2) {
                const alpha = (1 - dist2 / CONN_DIST2) * 0.13
                ctx.strokeStyle = `rgba(120,150,255,${alpha})`
                ctx.lineWidth   = 0.6
                ctx.beginPath()
                ctx.moveTo(p.x, p.y)
                ctx.lineTo(q.x, q.y)
                ctx.stroke()
              }
            }
          }
        }
      }

      raf = requestAnimationFrame(step)
    }

    // ── mouse handlers ──────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 } }

    init()
    step()
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
