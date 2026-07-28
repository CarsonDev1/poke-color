import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTE_STORAGE_KEY, SoundBoard } from '@/audio/synth'

interface FakeOsc {
  type: string
  frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function fakeContextFactory() {
  const oscillators: FakeOsc[] = []
  const ctx = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => {
      ctx.state = 'running'
      return Promise.resolve()
    }),
    close: vi.fn(() => {
      ctx.state = 'closed'
      return Promise.resolve()
    }),
    createOscillator: vi.fn((): FakeOsc => {
      const o: FakeOsc = {
        type: '',
        frequency: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(o)
      return o
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  }
  return { ctx, oscillators, factory: () => ctx as unknown as AudioContext }
}

beforeEach(() => {
  localStorage.clear()
})

describe('SoundBoard', () => {
  it('không tạo AudioContext trước khi unlock', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.fill(0.5)
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('unlock resume context', () => {
    const { factory, ctx } = fakeContextFactory()
    new SoundBoard(factory).unlock()
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('unlock nhiều lần chỉ tạo context một lần', () => {
    const created: number[] = []
    const { ctx } = fakeContextFactory()
    const sb = new SoundBoard(() => {
      created.push(1)
      return ctx as unknown as AudioContext
    })
    sb.unlock()
    sb.unlock()
    sb.unlock()
    expect(created).toHaveLength(1)
  })

  it('fill phát một oscillator', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.fill(0.5)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('cao độ của fill tăng theo tiến độ', () => {
    const { factory, oscillators } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.fill(0)
    sb.fill(1)
    expect(oscillators[1].frequency.value).toBeGreaterThan(oscillators[0].frequency.value)
  })

  it('reject dùng sóng vuông trầm', () => {
    const { factory, oscillators } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.reject()
    expect(oscillators[0].type).toBe('square')
    expect(oscillators[0].frequency.value).toBeLessThan(300)
  })

  it('colorDone phát 2 nốt, complete phát 5 nốt', () => {
    const a = fakeContextFactory()
    const sbA = new SoundBoard(a.factory)
    sbA.unlock()
    sbA.colorDone()
    expect(a.oscillators).toHaveLength(2)

    const b = fakeContextFactory()
    const sbB = new SoundBoard(b.factory)
    sbB.unlock()
    sbB.complete()
    expect(b.oscillators).toHaveLength(5)
  })

  it('muted thì không phát gì', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.setMuted(true)
    sb.fill(0.5)
    sb.reject()
    sb.complete()
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('mặc định BẬT tiếng', () => {
    expect(new SoundBoard(fakeContextFactory().factory).muted).toBe(false)
  })

  it('trạng thái tắt tiếng được lưu và đọc lại từ localStorage', () => {
    const { factory } = fakeContextFactory()
    new SoundBoard(factory).setMuted(true)
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe('1')
    expect(new SoundBoard(factory).muted).toBe(true)
  })

  it('I5: close() đóng AudioContext hiện tại', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()

    sb.close()

    expect(ctx.close).toHaveBeenCalledTimes(1)
  })

  it('I5: sau close(), unlock() tạo một AudioContext MỚI (không tái dùng context đã đóng)', () => {
    const created: ReturnType<typeof fakeContextFactory>['ctx'][] = []
    const factory = () => {
      const { ctx } = fakeContextFactory()
      created.push(ctx)
      return ctx as unknown as AudioContext
    }
    const sb = new SoundBoard(factory)

    sb.unlock()
    expect(created).toHaveLength(1)

    sb.close()
    // Chrome giới hạn 6 AudioContext phần cứng mỗi trang; vì đây là SPA
    // hash-router không reload giữa các puzzle, `close()` PHẢI giải phóng
    // context cũ để lần `unlock()` kế tiếp (mở puzzle tiếp theo) tạo được
    // context mới thay vì tái dùng — hoặc tệ hơn, không làm gì — context đã
    // đóng.
    sb.unlock()
    expect(created).toHaveLength(2)
    expect(created[1].resume).toHaveBeenCalled()
  })

  it('I5: close() khi chưa từng unlock() không throw', () => {
    const sb = new SoundBoard(fakeContextFactory().factory)
    expect(() => sb.close()).not.toThrow()
  })

  it('lỗi khi tạo AudioContext không làm app chết', () => {
    const sb = new SoundBoard(() => {
      throw new Error('không hỗ trợ')
    })
    expect(() => sb.unlock()).not.toThrow()
    expect(() => sb.fill(0.5)).not.toThrow()
  })
})
