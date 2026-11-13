/**
 * Sound engine.
 *
 * Short game-show cues (correct/wrong/tick/chicken squawks, etc.) are
 * synthesized on the fly with the Web Audio API — no binary assets.
 *
 * The two long-form tracks (looping lobby music and the dramatic lose sting)
 * are real MP3 files played through Howler for gapless looping, smooth fades
 * and correct disposal.
 *
 * AUDIO MANAGER RULES
 * ───────────────────
 * • ONE Howl instance per track — ever. The bgMusic Howl is created once and
 *   lives for the lifetime of the page. It is NEVER recreated.
 * • ONE active sound node per track. We store the numeric sound-ID returned by
 *   Howl.play() and pass it to every subsequent fade/pause/stop call so Howler
 *   never spawns a parallel node.
 * • startMusic() is idempotent. Calling it while the music is already playing
 *   is a no-op. React StrictMode double-mount, route changes, repeated calls —
 *   none of them can produce a second audio stream.
 * • Playback rate is locked to 1 at creation and never mutated.
 */
import { Howl, Howler } from 'howler'

// ---------------------------------------------------------------------------
// Asset URLs
// ---------------------------------------------------------------------------
const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const BG_MUSIC_URL  = asset('nhac-xo-so.mp3')
const LOSE_MUSIC_URL = asset('xin-vinh-biet-cu.mp3')

// ---------------------------------------------------------------------------
// Volume constants
// ---------------------------------------------------------------------------
/** Looping background music sits at ~35% so SFX read clearly over it. */
const BG_VOLUME   = 0.35
/** Lose/retire sting volume (before master scaling). */
const LOSE_VOLUME = 0.9
/** Fade durations in ms. */
const FADE_IN  = 1200
const FADE_OUT = 800   // spec says 800 ms

// ---------------------------------------------------------------------------
// Module-level singleton guards
// ---------------------------------------------------------------------------
// These live OUTSIDE the class so they survive React StrictMode's
// unmount→remount cycle, which destroys instance state but leaves module
// scope intact.  The Howl object itself is also stored here so it is truly
// created only once per page load.
let _bgHowl:   Howl | null = null    // the one background Howl, ever
let _bgSoundId: number | null = null // sound-node ID returned by play()
/** Pending "pause after fade-out" timer — cancelled when music restarts. */
let _bgStopTimer: number | null = null

// ---------------------------------------------------------------------------

export type SfxName =
  | 'hover' | 'click' | 'select'
  | 'correct' | 'wrong' | 'tick' | 'tickFast' | 'heartbeat'
  | 'victory' | 'lifeline' | 'whoosh' | 'reveal' | 'transition'
  | 'bawk' | 'cluck'

interface Envelope {
  attack:  number
  decay:   number
  sustain: number
  release: number
}

class SoundManager {
  private ctx:        AudioContext | null = null
  private masterGain: GainNode    | null = null
  private sfxGain:    GainNode    | null = null
  private settings = { music: true, sfx: true, volume: 0.8 }

  // Lose sting — recreated on each loss because it plays once then we throw it away.
  private loseMusic: Howl | null = null

  // -------------------------------------------------------------------------
  // Unlock / init
  // -------------------------------------------------------------------------

  /** Must be called from a user gesture to satisfy browser autoplay policies. */
  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = this.settings.volume
      this.masterGain.connect(this.ctx.destination)

      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = this.settings.sfx ? 1 : 0
      this.sfxGain.connect(this.masterGain)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    // Howler autoplay unlock (runs inside the same user gesture).
    if (Howler.ctx && Howler.ctx.state === 'suspended') void Howler.ctx.resume()
  }

  applySettings(s: { music: boolean; sfx: boolean; volume: number }) {
    this.settings = s
    if (this.ctx) {
      if (this.masterGain)
        this.masterGain.gain.setTargetAtTime(s.volume, this.ctx.currentTime, 0.05)
      if (this.sfxGain)
        this.sfxGain.gain.setTargetAtTime(s.sfx ? 1 : 0, this.ctx.currentTime, 0.05)
    }
    // MP3 tracks route through Howler's own graph — scale by master setting.
    if (_bgHowl && _bgSoundId !== null && _bgHowl.playing(_bgSoundId))
      _bgHowl.volume(s.music ? BG_VOLUME * s.volume : 0, _bgSoundId)
    if (this.loseMusic && this.loseMusic.playing())
      this.loseMusic.volume(LOSE_VOLUME * s.volume)
  }

  // -------------------------------------------------------------------------
  // Background music
  // -------------------------------------------------------------------------

  private get _bgTargetVolume() {
    return BG_VOLUME * this.settings.volume
  }

  /**
   * Ensure the background music Howl exists (created at most once per page
   * load — module-level _bgHowl guards this).
   */
  private _ensureBgHowl() {
    if (_bgHowl) return
    console.log('[Audio] Background created')
    _bgHowl = new Howl({
      src:     [BG_MUSIC_URL],
      loop:    true,
      volume:  0,
      rate:    1,       // locked — never mutated
      html5:   false,
      preload: true,
      onplay:  () => console.log('[Audio] Background play'),
      onpause: () => console.log('[Audio] Background pause'),
      onstop:  () => console.log('[Audio] Background stop'),
    })
  }

  /**
   * Start (or resume) the looping background track.
   *
   * Idempotency contract:
   *   • If the Howl node identified by _bgSoundId is already playing →
   *     log "already playing", do nothing.
   *   • If the Howl exists but is paused → resume it and fade in.
   *   • If no sound node exists yet → play() to create one, store the ID,
   *     then fade in.
   *
   * This method is safe to call from multiple React effects, route changes,
   * and StrictMode double-mounts.
   */
  startMusic() {
    if (!this.settings.music) return
    this._ensureBgHowl()
    const howl = _bgHowl!

    // Any scheduled fade-out→pause from a previous stopMusic() must be
    // cancelled, otherwise it would silence a track that just restarted.
    if (_bgStopTimer !== null) {
      window.clearTimeout(_bgStopTimer)
      _bgStopTimer = null
    }
    // Cancel a fade that is still in flight (Howler only auto-cancels group
    // fades, not per-sound ones, so we do it explicitly by re-setting volume).
    if (_bgSoundId !== null) {
      const inFlight = howl.volume(_bgSoundId) as number
      howl.volume(inFlight, _bgSoundId)
    }

    // ── Case 1: sound node exists and is actively playing ──────────────────
    if (_bgSoundId !== null && howl.playing(_bgSoundId)) {
      console.log('[Audio] Background already playing — skipping startMusic()')
      // Ensure volume is at the right target (e.g. after a settings change).
      const target  = this._bgTargetVolume
      const current = howl.volume(_bgSoundId) as number
      if (Math.abs(current - target) > 0.01)
        howl.fade(current, target, FADE_IN, _bgSoundId)
      return
    }

    // ── Case 2: sound node exists but is paused ─────────────────────────────
    if (_bgSoundId !== null) {
      console.log('[Audio] Background resumed')
      howl.volume(0, _bgSoundId)
      howl.play(_bgSoundId)                          // resume same node
      howl.fade(0, this._bgTargetVolume, FADE_IN, _bgSoundId)
      return
    }

    // ── Case 3: first play — create the sound node ─────────────────────────
    console.log('[Audio] Background play (first time)')
    const id = howl.play()                           // returns numeric sound ID
    _bgSoundId = id
    howl.volume(0, id)
    howl.rate(1, id)                                 // paranoia: lock rate
    howl.fade(0, this._bgTargetVolume, FADE_IN, id)
  }

  /**
   * Smoothly fade the background track out and pause it.
   * The sound node (ID) is retained so startMusic() can resume it cleanly.
   */
  stopMusic(fadeDuration = FADE_OUT) {
    if (!_bgHowl || _bgSoundId === null) return
    const howl  = _bgHowl
    const id    = _bgSoundId
    if (!howl.playing(id)) return

    console.log('[Audio] Background fade')
    if (_bgStopTimer !== null) {
      window.clearTimeout(_bgStopTimer)
      _bgStopTimer = null
    }
    const fromVol = howl.volume(id) as number
    // Re-setting the volume cancels any fade still running for this sound
    // (Howler does not cancel per-id fades automatically).
    howl.volume(fromVol, id)
    howl.fade(fromVol, 0, fadeDuration, id)
    // Pause only after the fade has finished — and only if the music has not
    // been restarted in the meantime (startMusic clears this timer).
    _bgStopTimer = window.setTimeout(() => {
      _bgStopTimer = null
      if (_bgSoundId === id && howl.playing(id)) {
        howl.pause(id)
        console.log('[Audio] Background pause (after fade)')
      }
    }, fadeDuration + 80)
  }

  // -------------------------------------------------------------------------
  // Lose music
  // -------------------------------------------------------------------------

  /**
   * The dramatic "xin vinh biet cu" sting for the lose / retire endings.
   * Fades out the background over 800 ms, then plays the sting once.
   * Disposing any prior sting instance ensures we never overlap.
   */
  playLoseMusic() {
    // Fade out background (800 ms per spec).
    if (_bgHowl && _bgSoundId !== null && _bgHowl.playing(_bgSoundId)) {
      this.stopMusic(800)
    }

    // Dispose any lingering previous sting.
    if (this.loseMusic) {
      this.loseMusic.stop()
      this.loseMusic.unload()
      this.loseMusic = null
    }

    this.loseMusic = new Howl({
      src:    [LOSE_MUSIC_URL],
      loop:   false,
      volume: LOSE_VOLUME * this.settings.volume,
      html5:  false,
    })
    this.loseMusic.play()
  }

  /** Stop + dispose the lose sting (called when leaving the end screen). */
  stopLoseMusic() {
    if (!this.loseMusic) return
    this.loseMusic.stop()
    this.loseMusic.unload()
    this.loseMusic = null
  }

  // -------------------------------------------------------------------------
  // Web Audio SFX (synthesized — no binary assets)
  // -------------------------------------------------------------------------

  private tone(
    freq:      number,
    duration:  number,
    type:      OscillatorType,
    env:       Envelope,
    gainScale = 1,
    when      = 0,
    dest?:     AudioNode,
  ) {
    if (!this.ctx || !this.sfxGain) return
    const t0 = this.ctx.currentTime + when
    const osc  = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    const peak       = 0.4 * gainScale
    const sustainLvl = peak * env.sustain
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(peak,       t0 + env.attack)
    gain.gain.linearRampToValueAtTime(sustainLvl, t0 + env.attack + env.decay)
    gain.gain.setValueAtTime(sustainLvl, t0 + duration - env.release)
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(dest ?? this.sfxGain)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private sweep(
    from:      number,
    to:        number,
    duration:  number,
    type:      OscillatorType,
    gainScale = 1,
    when      = 0,
    curve:     'exp' | 'lin' = 'exp',
  ) {
    if (!this.ctx || !this.sfxGain) return
    const t0  = this.ctx.currentTime + when
    const osc  = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t0)
    if (curve === 'exp')
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration)
    else
      osc.frequency.linearRampToValueAtTime(Math.max(1, to), t0 + duration)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.linearRampToValueAtTime(0.35 * gainScale, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(this.sfxGain)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private noise(
    duration:   number,
    gainScale  = 1,
    when       = 0,
    filterType: BiquadFilterType = 'highpass',
    filterFreq = 900,
  ) {
    if (!this.ctx || !this.sfxGain) return
    const t0         = this.ctx.currentTime + when
    const bufferSize = Math.floor(this.ctx.sampleRate * duration)
    const buffer     = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data       = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const src    = this.ctx.createBufferSource()
    src.buffer   = buffer
    const gain   = this.ctx.createGain()
    gain.gain.value = 0.3 * gainScale
    const filter = this.ctx.createBiquadFilter()
    filter.type           = filterType
    filter.frequency.value = filterFreq
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)
    src.start(t0)
    src.stop(t0 + duration)
  }

  /**
   * A vibrato "cluck/bawk" formant — a pitch that warbles up then down through
   * a bandpass filter, which reads as a comedic chicken squawk.
   */
  private chicken(base: number, when = 0, long = false) {
    if (!this.ctx || !this.sfxGain) return
    const t0  = this.ctx.currentTime + when
    const dur = long ? 0.5 : 0.22
    const osc  = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const band = this.ctx.createBiquadFilter()
    band.type          = 'bandpass'
    band.frequency.value = base * 2
    band.Q.value       = 6
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(base, t0)
    osc.frequency.linearRampToValueAtTime(base * 1.9, t0 + dur * 0.18)
    osc.frequency.linearRampToValueAtTime(base * 1.2, t0 + dur * 0.4)
    if (long) {
      osc.frequency.linearRampToValueAtTime(base * 1.7, t0 + dur * 0.6)
      osc.frequency.linearRampToValueAtTime(base * 0.8, t0 + dur)
    } else {
      osc.frequency.linearRampToValueAtTime(base * 0.7, t0 + dur)
    }
    const lfo     = this.ctx.createOscillator()
    const lfoGain = this.ctx.createGain()
    lfo.type          = 'square'
    lfo.frequency.value = long ? 22 : 34
    lfoGain.gain.value  = 0.14
    lfo.connect(lfoGain)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.linearRampToValueAtTime(0.3,    t0 + 0.02)
    gain.gain.setValueAtTime(0.28,             t0 + dur - 0.06)
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur)
    lfoGain.connect(gain.gain)
    osc.connect(band)
    band.connect(gain)
    gain.connect(this.sfxGain)
    osc.start(t0)
    lfo.start(t0)
    osc.stop(t0 + dur + 0.02)
    lfo.stop(t0 + dur + 0.02)
  }

  play(name: SfxName) {
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const shortEnv: Envelope = { attack: 0.005, decay: 0.05, sustain: 0.4, release: 0.05 }

    switch (name) {
      case 'hover':
        this.tone(880, 0.08, 'sine', shortEnv, 0.28)
        break
      case 'click':
        this.tone(560, 0.07, 'square', shortEnv, 0.35)
        this.tone(280, 0.09, 'sine',   shortEnv, 0.25, 0.005)
        break
      case 'select':
        this.tone(440, 0.12, 'triangle', shortEnv, 0.5)
        this.tone(660, 0.14, 'sine',     shortEnv, 0.3, 0.02)
        break
      case 'lifeline':
        this.sweep(300,  900, 0.3, 'sawtooth', 0.5)
        this.sweep(600, 1500, 0.3, 'sine',     0.25, 0.02)
        break
      case 'whoosh':
        this.sweep(700, 120, 0.35, 'sine', 0.5)
        this.noise(0.3, 0.4)
        break
      case 'transition':
        this.sweep(200, 1200, 0.3, 'sine', 0.35, 0, 'exp')
        this.noise(0.35, 0.25, 0, 'bandpass', 1800)
        break
      case 'reveal':
        this.sweep(200, 700, 0.25, 'triangle', 0.5)
        break
      case 'tick':
        this.tone(1000, 0.05, 'square', shortEnv, 0.22)
        break
      case 'tickFast':
        this.tone(1500, 0.045, 'square', shortEnv, 0.32)
        this.tone(750,  0.05,  'sine',   shortEnv, 0.2)
        break
      case 'heartbeat': {
        this.tone(70, 0.12, 'sine', { attack: 0.005, decay: 0.06, sustain: 0.3, release: 0.05 }, 0.9)
        this.tone(60, 0.14, 'sine', { attack: 0.005, decay: 0.07, sustain: 0.3, release: 0.06 }, 0.75, 0.16)
        break
      }
      case 'correct': {
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((f, i) =>
          this.tone(f, 0.5, 'triangle', { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 }, 0.6, i * 0.08),
        )
        this.tone(2093, 0.6, 'sine', { attack: 0.005, decay: 0.2,  sustain: 0.3,  release: 0.35 }, 0.3,  0.34)
        this.tone(1568, 0.7, 'sine', { attack: 0.005, decay: 0.25, sustain: 0.35, release: 0.4  }, 0.28, 0.34)
        break
      }
      case 'wrong': {
        this.sweep(340,  70, 0.7, 'sawtooth', 0.8)
        this.sweep(220,  55, 0.7, 'square',   0.4,  0.01)
        this.tone(90, 0.7, 'sine', { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.35 }, 0.7, 0.02)
        this.noise(0.45, 0.6, 0, 'lowpass', 500)
        break
      }
      case 'victory': {
        const fanfare: [number, number, number][] = [
          [523.25, 0,    0.18], [523.25, 0.18, 0.18], [523.25, 0.36, 0.18],
          [659.25, 0.54, 0.5 ], [783.99, 1.04, 0.3 ], [659.25, 1.34, 0.3 ],
          [1046.5, 1.64, 0.7 ],
        ]
        fanfare.forEach(([f, when, dur]) => {
          this.tone(f,     dur, 'triangle', { attack: 0.01, decay: 0.08, sustain: 0.7, release: 0.3 }, 0.62, when)
          this.tone(f / 2, dur, 'sawtooth', { attack: 0.01, decay: 0.08, sustain: 0.5, release: 0.3 }, 0.22, when)
        })
        const sparkle = [1318.5, 1568, 2093, 2637]
        sparkle.forEach((f, i) =>
          this.tone(f, 0.4, 'sine', { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.25 }, 0.24, 1.64 + i * 0.09),
        )
        this.noise(1.4, 0.35, 1.6, 'highpass', 6000)
        break
      }
      case 'bawk': {
        this.chicken(420, 0, true)
        this.chicken(520, 0.14)
        break
      }
      case 'cluck': {
        this.chicken(360)
        break
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export — the one and only SoundManager instance.
// ---------------------------------------------------------------------------
export const sound = new SoundManager()
