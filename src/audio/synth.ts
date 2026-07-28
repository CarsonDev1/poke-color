export const MUTE_STORAGE_KEY = 'pokemon-color:muted'

interface Note {
  freq: number
  start: number
  dur: number
  type: OscillatorType
  gain: number
}

/**
 * Toàn bộ âm thanh tổng hợp bằng oscillator — không có file asset nào, nên
 * không phải tải gì và phát tức thì.
 *
 * AudioContext được tạo LAZY trong unlock(): browser chặn audio trước user
 * gesture, tạo sớm sẽ ra context suspended và mọi âm im lặng.
 */
export class SoundBoard {
  private readonly factory: () => AudioContext
  private ctx: AudioContext | null = null
  private failed = false
  private mutedFlag: boolean

  constructor(factory: () => AudioContext = () => new AudioContext()) {
    this.factory = factory
    this.mutedFlag = readMuted()
  }

  get muted(): boolean {
    return this.mutedFlag
  }

  setMuted(v: boolean): void {
    this.mutedFlag = v
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, v ? '1' : '0')
    } catch {
      // localStorage bị chặn (chế độ riêng tư) — không phải lỗi đáng dừng app
    }
  }

  /** Gọi trong handler pointerdown ĐẦU TIÊN. An toàn khi gọi nhiều lần. */
  unlock(): void {
    const ctx = this.ensure()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx
    try {
      this.ctx = this.factory()
    } catch {
      this.failed = true
    }
    return this.ctx
  }

  private play(notes: Note[]): void {
    if (this.mutedFlag) return
    const ctx = this.ctx
    if (!ctx) return

    const t0 = ctx.currentTime
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = n.type
      osc.frequency.value = n.freq
      osc.frequency.setValueAtTime(n.freq, t0 + n.start)

      gain.gain.setValueAtTime(0.0001, t0 + n.start)
      gain.gain.linearRampToValueAtTime(n.gain, t0 + n.start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.start + n.dur)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0 + n.start)
      osc.stop(t0 + n.start + n.dur + 0.02)
    }
  }

  /** blip ngắn, cao độ tăng dần theo tiến độ ⇒ càng gần xong càng cao */
  fill(progress: number): void {
    const p = Math.min(1, Math.max(0, progress))
    this.play([
      { freq: 440 + p * 500, start: 0, dur: 0.07, type: 'sine', gain: 0.12 },
    ])
  }

  reject(): void {
    this.play([{ freq: 130, start: 0, dur: 0.11, type: 'square', gain: 0.07 }])
  }

  colorDone(): void {
    this.play([
      { freq: 660, start: 0, dur: 0.1, type: 'sine', gain: 0.13 },
      { freq: 880, start: 0.1, dur: 0.14, type: 'sine', gain: 0.13 },
    ])
  }

  complete(): void {
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    this.play(
      seq.map((freq, i) => ({
        freq,
        start: i * 0.12,
        dur: i === seq.length - 1 ? 0.5 : 0.16,
        type: 'triangle' as OscillatorType,
        gain: 0.14,
      })),
    )
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
