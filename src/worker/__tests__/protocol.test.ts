import { describe, expect, it } from 'vitest'
import { handleGenerate } from '@/worker/protocol'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'
import { DEFAULT_PARAMS } from '@/core/types'

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  const w = 32
  const h = 32
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const left = x < w / 2
      data[i] = left ? 220 : 20
      data[i + 1] = left ? 30 : 30
      data[i + 2] = left ? 30 : 220
      data[i + 3] = 255
    }
  }
  return {
    type: 'generate',
    requestId: 1,
    image: { data, width: w, height: h },
    params: { ...DEFAULT_PARAMS, k: 3, minArea: 20 },
    ...over,
  }
}

describe('handleGenerate', () => {
  it('phát progress rồi done, đúng requestId', () => {
    const posted: GenerateResponse[] = []
    handleGenerate(request(), (r) => posted.push(r))

    expect(posted.every((p) => p.requestId === 1)).toBe(true)
    expect(posted.filter((p) => p.type === 'progress').length).toBeGreaterThan(0)
    expect(posted[posted.length - 1].type).toBe('done')
  })

  it('done chứa bin, regionsJson và metadata khớp nhau', () => {
    const posted: GenerateResponse[] = []
    handleGenerate(request(), (r) => posted.push(r))

    const done = posted[posted.length - 1]
    if (done.type !== 'done') throw new Error('mong đợi done')

    expect(done.bin.byteLength).toBeGreaterThan(24)
    expect(done.width).toBe(32)
    expect(done.height).toBe(32)
    expect(done.palette).toHaveLength(3)
    expect(done.regionCount).toBeGreaterThan(0)

    const regions = JSON.parse(done.regionsJson)
    expect(regions).toHaveLength(done.regionCount)
    expect(done.usedMinArea).toBe(20)
  })

  it('progress phát đủ 8 stage', () => {
    const stages = new Set<string>()
    handleGenerate(request(), (r) => {
      if (r.type === 'progress') stages.add(r.stage)
    })
    expect(stages.size).toBe(8)
  })

  it('ảnh rỗng → error kèm thông báo, không throw ra ngoài', () => {
    const posted: GenerateResponse[] = []
    const bad = request({
      image: { data: new Uint8ClampedArray(0), width: 0, height: 0 },
    })

    expect(() => handleGenerate(bad, (r) => posted.push(r))).not.toThrow()
    const last = posted[posted.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') {
      expect(last.message).toMatch(/kích thước|rỗng/i)
    }
  })

  it('error kèm tên stage đang chạy', () => {
    const posted: GenerateResponse[] = []
    // k = 0 làm quantize vỡ; stage lúc đó phải là 'quantize' hoặc trước đó
    const bad = request({ params: { ...DEFAULT_PARAMS, k: 0, minArea: 10 } })
    handleGenerate(bad, (r) => posted.push(r))

    const last = posted[posted.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') {
      expect(last.stage).not.toBeUndefined()
    }
  })

  it('kiểu message lạ → error, không crash', () => {
    const posted: GenerateResponse[] = []
    handleGenerate({ ...request(), type: 'khong-biet' } as never, (r) => posted.push(r))
    expect(posted[posted.length - 1].type).toBe('error')
  })

  it('deterministic: hai lần chạy cho bin giống byte-for-byte', () => {
    const run = (): Uint8Array => {
      const posted: GenerateResponse[] = []
      handleGenerate(request(), (r) => posted.push(r))
      const done = posted[posted.length - 1]
      if (done.type !== 'done') throw new Error('mong đợi done')
      return done.bin
    }
    expect(Array.from(run())).toEqual(Array.from(run()))
  })
})
