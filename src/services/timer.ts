import { QUESTION_TIME as QUESTION_TIME_CFG } from '@/config/gameConfig'

/**
 * Re-export so consumers that import QUESTION_TIME from '@/services/timer'
 * continue to work — but the authoritative value now lives in gameConfig.ts.
 */
export const QUESTION_TIME = QUESTION_TIME_CFG

export type TimerTick = (remaining: number) => void
export type TimerDone = () => void

/**
 * A precise countdown timer driven by requestAnimationFrame.
 * Reports remaining whole seconds and fires onDone at zero.
 */
export class CountdownTimer {
  private duration: number
  private remaining: number
  private rafId: number | null = null
  private startStamp = 0
  private paused = false
  private pausedAt = 0
  private onTick: TimerTick
  private onDone: TimerDone

  constructor(duration: number, onTick: TimerTick, onDone: TimerDone) {
    this.duration = duration
    this.remaining = duration
    this.onTick = onTick
    this.onDone = onDone
  }

  start() {
    this.stop()
    this.remaining = this.duration
    this.startStamp = performance.now()
    this.paused = false
    this.loop()
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop)
    if (this.paused) return
    const elapsed = (performance.now() - this.startStamp) / 1000
    const left = Math.max(0, this.duration - elapsed)
    const whole = Math.ceil(left)
    if (whole !== this.remaining) {
      this.remaining = whole
      this.onTick(whole)
    }
    if (left <= 0) {
      this.stop()
      this.onDone()
    }
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.pausedAt = performance.now()
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    // shift start stamp forward by paused duration
    this.startStamp += performance.now() - this.pausedAt
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  getRemaining() {
    return this.remaining
  }
}
