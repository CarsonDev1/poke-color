import { describe, expect, it, vi } from 'vitest'
import { vectorizeInWorker, type VectorizeWorkerLike } from '@/data/vectorize-client'
import type { VectorizeRequest, VectorizeResponse } from '@/worker/vectorize-protocol'

/**
 * Worker giả: trả lời bằng requestId LẤY TỪ REQUEST, không hardcode.
 * Hardcode requestId là lỗi tôi đã mắc ở generate-client test trước đây —
 * `nextRequestId` tăng dần nên từ test thứ hai trở đi mọi test treo tới timeout.
 */
function fakeWorker(
  reply: (req: VectorizeRequest) => VectorizeResponse | null,
): { create: () => VectorizeWorkerLike; terminated: () => number } {
  let terminated = 0
  return {
    terminated: () => terminated,
    create: () => {
      const w: VectorizeWorkerLike = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: () => {
          terminated++
        },
        postMessage: (m: unknown) => {
          const r = reply(m as VectorizeRequest)
          if (r) setTimeout(() => w.onmessage?.({ data: r }), 0)
        },
      }
      return w
    },
  }
}

const OK = (req: VectorizeRequest): VectorizeResponse => ({
  type: 'done',
  requestId: req.requestId,
  outline: '<svg/>',
  solution: '<svg id="s"/>',
})

describe('vectorizeInWorker', () => {
  it('trả về outline và solution', async () => {
    const f = fakeWorker(OK)
    const out = await vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: f.create })
    expect(out).toEqual({ outline: '<svg/>', solution: '<svg id="s"/>' })
  })

  it('TERMINATE worker sau khi xong — để sống là nó tiếp tục ngốn CPU', async () => {
    const f = fakeWorker(OK)
    await vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: f.create })
    expect(f.terminated()).toBe(1)
  })

  it('message error ⇒ reject với message đó, và terminate', async () => {
    const f = fakeWorker((req) => ({
      type: 'error',
      requestId: req.requestId,
      message: 'bin hỏng',
    }))
    await expect(
      vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: f.create }),
    ).rejects.toThrow('bin hỏng')
    expect(f.terminated()).toBe(1)
  })

  it('worker không trả lời ⇒ timeout, reject, terminate', async () => {
    const f = fakeWorker(() => null)
    await expect(
      vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: f.create, timeoutMs: 20 }),
    ).rejects.toThrow(/quá lâu/)
    expect(f.terminated()).toBe(1)
  })

  it('signal đã abort trước khi gọi ⇒ reject ngay, không tạo worker', async () => {
    const c = new AbortController()
    c.abort()
    const create = vi.fn()
    await expect(
      vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: create, signal: c.signal }),
    ).rejects.toThrow(/huỷ/)
    expect(create).not.toHaveBeenCalled()
  })

  it('abort giữa lúc chạy ⇒ reject và terminate', async () => {
    const c = new AbortController()
    const f = fakeWorker(() => null)
    const p = vectorizeInWorker(
      new Uint8Array([1]),
      '[]',
      {},
      { createWorker: f.create, signal: c.signal },
    )
    c.abort()
    await expect(p).rejects.toThrow(/huỷ/)
    expect(f.terminated()).toBe(1)
  })

  it('worker crash (onerror) ⇒ reject có hướng dẫn, không treo im lặng', async () => {
    let w: VectorizeWorkerLike | null = null
    const create = (): VectorizeWorkerLike => {
      w = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: () => {},
        postMessage: () => setTimeout(() => w!.onerror?.({}), 0),
      }
      return w
    }
    await expect(
      vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: create }),
    ).rejects.toThrow(/tải lại trang/)
  })

  /** Message của request khác không được resolve sai promise. */
  it('bỏ qua message có requestId không khớp', async () => {
    const f = fakeWorker((req) => ({
      type: 'done',
      requestId: req.requestId + 999,
      outline: 'sai',
      solution: 'sai',
    }))
    await expect(
      vectorizeInWorker(new Uint8Array([1]), '[]', {}, { createWorker: f.create, timeoutMs: 30 }),
    ).rejects.toThrow(/quá lâu/)
  })

  it('truyền options xuống worker', async () => {
    let got: VectorizeRequest | null = null
    const f = fakeWorker((req) => {
      got = req
      return OK(req)
    })
    await vectorizeInWorker(
      new Uint8Array([1]),
      '[]',
      { epsilon: 1.5, smoothing: 2 },
      { createWorker: f.create },
    )
    expect(got!.options).toEqual({ epsilon: 1.5, smoothing: 2 })
  })
})
