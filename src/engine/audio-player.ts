// Pen sounds, web equivalent of rnote-engine audioplayer.rs. The desktop ships
// ~6MB of recorded wav files; for the single-file web build we synthesize the
// three sound families with the Web Audio API:
//   - marker: a short friction "chirp" (filtered noise burst)
//   - brush: continuous rustling (looping filtered noise), kept alive while the
//     pen moves and stopped after BRUSH_SOUND_TIMEOUT of inactivity
//   - typewriter: mechanical key clacks, plus a bell + line-feed on enter
// All methods are no-ops until enabled and lazily resume the AudioContext
// (must be triggered from a user gesture, which pen/key events are).

type KeyKind = 'enter' | 'backspace' | 'delete' | 'tab' | 'char' | 'other'

const BRUSH_SOUND_TIMEOUT_MS = 600

class PenAudioPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private whiteBuf: AudioBuffer | null = null
  private brownBuf: AudioBuffer | null = null
  private brush: { src: AudioBufferSourceNode; gain: GainNode; timer: number } | null = null

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (!AC) return null
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.45
        this.master.connect(this.ctx.destination)
        this.whiteBuf = this.makeNoise(1.0, 'white')
        this.brownBuf = this.makeNoise(2.0, 'brown')
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    } catch {
      return null
    }
  }

  private makeNoise(seconds: number, type: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    if (type === 'brown') {
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    return buf
  }

  // play_random_marker_sound
  markerSound() {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.whiteBuf
    src.playbackRate.value = 1 + Math.random() * 0.4
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1600 + Math.random() * 1800
    bp.Q.value = 1.4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.55, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 0.12)
  }

  // trigger_random_brush_sound: (re)start the looping rustle and reset the
  // inactivity timeout.
  brushSound() {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    if (!this.brush) {
      const src = ctx.createBufferSource()
      src.buffer = this.brownBuf
      src.loop = true
      src.playbackRate.value = 1.4 + Math.random() * 0.6
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2400 + Math.random() * 2200
      bp.Q.value = 0.6
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 800
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 0.05)
      src.connect(hp)
      hp.connect(bp)
      bp.connect(gain)
      gain.connect(this.master)
      src.start()
      const timer = 0 // replaced per trigger
      this.brush = { src, gain, timer }
    }
    // reset the stop timeout
    if (this.brush.timer) window.clearTimeout(this.brush.timer)
    this.brush.timer = window.setTimeout(() => this.stopBrush(), BRUSH_SOUND_TIMEOUT_MS)
  }

  private stopBrush() {
    const b = this.brush
    if (!b) return
    this.brush = null
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    b.gain.gain.cancelScheduledValues(t)
    b.gain.gain.setValueAtTime(b.gain.gain.value, t)
    b.gain.gain.linearRampToValueAtTime(0.0001, t + 0.15)
    try {
      b.src.stop(t + 0.18)
    } catch {
      /* already stopped */
    }
  }

  // play_typewriter_key_sound
  typewriterKey(kind: KeyKind) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    if (kind === 'enter') {
      this.bell(ctx)
      window.setTimeout(() => this.lineFeed(ctx), 200)
      return
    }
    if (kind === 'other') {
      this.thump(ctx)
      return
    }
    this.keyClack(ctx)
  }

  // random enumerated key sound: a bright click + resonant body "thock"
  private keyClack(ctx: AudioContext) {
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.whiteBuf
    src.playbackRate.value = 1.5 + Math.random()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0.5, t)
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    src.connect(hp)
    hp.connect(cg)
    cg.connect(this.master!)
    src.start(t)
    src.stop(t + 0.06)

    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.value = 180 + Math.random() * 160
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(0.4, t)
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    body.connect(bg)
    bg.connect(this.master!)
    body.start(t)
    body.stop(t + 0.1)
  }

  private bell(ctx: AudioContext) {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 1500 + Math.random() * 300
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.4, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    osc.connect(g)
    g.connect(this.master!)
    osc.start(t)
    osc.stop(t + 1)
  }

  private lineFeed(ctx: AudioContext) {
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.brownBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    bp.frequency.setValueAtTime(2200, t)
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.4, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master!)
    src.start(t)
    src.stop(t + 0.3)
  }

  private thump(ctx: AudioContext) {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, t)
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.45, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    osc.connect(g)
    g.connect(this.master!)
    osc.start(t)
    osc.stop(t + 0.16)
  }
}

export const penAudio = new PenAudioPlayer()
