import { describe, expect, it, vi } from 'vitest'
import { generateInWorker, type WorkerLike } from '@/data/generate-client'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'
import { DEFAULT_PARAMS, type PipelineStage } from '@/core/types'

const image = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }
const params = { ...DEFAULT_PARAMS, k: 3, minArea: 2 }

/**
 * Worker giả: phát trước một chuỗi response khi nhận postMessage.
 *
 * `nextRequestId` trong generate-client.ts không reset giữa các lần gọi (đúng
 * như spec — id không bao giờ được lặp lại hay về 0), nên trong cùng file test
 * này mỗi `it` gọi `generateInWorker` sẽ nhận một requestId thực khác nhau
 * (1, 2, 3, ...), không phải luôn luôn là 1. Vì vậy response nào viết sẵn với
 * `requestId: 1` (nghĩa là "response tương ứng với request thật") phải được
 * thay bằng requestId thật lấy từ chính request vừa gửi tới — giống hệt cách
 * worker thật (`handleGenerate`) luôn echo lại `req.requestId` nó nhận được.
 * Response nào cố tình viết requestId khác (vd 999, để test bị bỏ qua) thì
 * giữ nguyên, không thay.
 */
function scriptedWorker(script: GenerateResponse[], delayed = false) {
  const w: WorkerLike & { terminate: ReturnType<typeof vi.fn<() => void>> } = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: (m) => {
      if (delayed) return
      const realId = (m as GenerateRequest).requestId
      for (const r of script) {
        w.onmessage?.({ data: r.requestId === 1 ? { ...r, requestId: realId } : r })
      }
    },
  }
  return w
}

const done: GenerateResponse = {
  type: 'done',
  requestId: 1,
  bin: new Uint8Array([1, 2, 3]),
  regionsJson: '[]',
  regionCount: 0,
  palette: [[1, 2, 3]],
  width: 4,
  height: 4,
  usedMinArea: 7,
}

describe('generateInWorker', () => {
  it('trả về kết quả khi worker báo done', async () => {
    const w = scriptedWorker([done])
    const out = await generateInWorker(image, params, { createWorker: () => w })

    expect(out.regionCount).toBe(0)
    expect(out.usedMinArea).toBe(7)
    expect(Array.from(out.bin)).toEqual([1, 2, 3])
  })

  it('gọi onProgress cho từng message progress', async () => {
    const seen: [PipelineStage, number][] = []
    const w = scriptedWorker([
      { type: 'progress', requestId: 1, stage: 'chuan-hoa', ratio: 0 },
      { type: 'progress', requestId: 1, stage: 'quantize', ratio: 1 },
      done,
    ])

    await generateInWorker(image, params, {
      createWorker: () => w,
      onProgress: (stage, ratio) => seen.push([stage, ratio]),
    })

    expect(seen).toEqual([
      ['chuan-hoa', 0],
      ['quantize', 1],
    ])
  })

  it('terminate worker sau khi xong', async () => {
    const w = scriptedWorker([done])
    await generateInWorker(image, params, { createWorker: () => w })
    expect(w.terminate).toHaveBeenCalled()
  })

  it('worker báo error → reject kèm tên stage tiếng Việt', async () => {
    const w = scriptedWorker([
      {
        type: 'error',
        requestId: 1,
        stage: 'gop-vung-vun',
        message: 'vỡ rồi',
      },
    ])

    await expect(generateInWorker(image, params, { createWorker: () => w })).rejects.toThrow(
      /Gộp vùng vụn.*vỡ rồi/,
    )
    expect(w.terminate).toHaveBeenCalled()
  })

  it('error không có stage → thông báo không nhắc stage', async () => {
    const w = scriptedWorker([
      { type: 'error', requestId: 1, stage: null, message: 'ảnh rỗng' },
    ])
    await expect(generateInWorker(image, params, { createWorker: () => w })).rejects.toThrow(
      /ảnh rỗng/,
    )
  })

  it('quá timeout → reject, TERMINATE worker, gợi ý giảm kích thước', async () => {
    vi.useFakeTimers()
    const w = scriptedWorker([], true)

    const p = generateInWorker(image, params, { createWorker: () => w, timeoutMs: 1000 })
    const assertion = expect(p).rejects.toThrow(/quá lâu|giảm/i)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion

    expect(w.terminate).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('abort qua signal → reject và terminate', async () => {
    const w = scriptedWorker([], true)
    const ac = new AbortController()

    const p = generateInWorker(image, params, {
      createWorker: () => w,
      signal: ac.signal,
    })
    ac.abort()

    await expect(p).rejects.toThrow(/huỷ/i)
    expect(w.terminate).toHaveBeenCalled()
  })

  it('signal đã abort từ trước → reject ngay, không tạo worker', async () => {
    const create = vi.fn(() => scriptedWorker([done]))
    const ac = new AbortController()
    ac.abort()

    await expect(
      generateInWorker(image, params, { createWorker: create, signal: ac.signal }),
    ).rejects.toThrow(/huỷ/i)
    expect(create).not.toHaveBeenCalled()
  })

  it('I2: worker onerror (vd redeploy khiến chunk 404, worker chết trước khi gửi message nào) → reject NGAY, terminate, không đợi hết 60 giây', async () => {
    const w = scriptedWorker([], true) // delayed: postMessage không tự gọi onmessage
    const p = generateInWorker(image, params, { createWorker: () => w, timeoutMs: 60_000 })

    // Trước khi sửa: WorkerLike không có onerror, generateInWorker không gắn
    // gì vào worker.onerror thật — nó vẫn `null`, sự kiện error của Worker
    // thật (chunk 404, OOM kill) rơi vào hư không, và người dùng phải đợi hết
    // 60 giây để đọc "mất quá lâu... giảm kích thước ảnh" — sai và vô dụng.
    w.onerror?.(new Event('error') as unknown as never)

    await expect(p).rejects.toThrow(/sự cố|worker/i)
    expect(w.terminate).toHaveBeenCalled()
  })

  it('I2: worker onerror sau khi đã thấy progress → thông báo nêu đúng stage cuối cùng', async () => {
    const w = scriptedWorker(
      [{ type: 'progress', requestId: 1, stage: 'tach-vung', ratio: 0.5 }],
      false,
    )
    const p = generateInWorker(image, params, { createWorker: () => w })
    w.onerror?.(new Event('error') as unknown as never)

    await expect(p).rejects.toThrow(/tách vùng/i)
  })

  it('I2: worker onmessageerror (message không deserialize được) → reject, terminate', async () => {
    const w = scriptedWorker([], true)
    const p = generateInWorker(image, params, { createWorker: () => w })
    w.onmessageerror?.(new Event('messageerror') as unknown as never)

    await expect(p).rejects.toThrow(/sự cố|worker/i)
    expect(w.terminate).toHaveBeenCalled()
  })

  it('bỏ qua message có requestId khác', async () => {
    const w = scriptedWorker([
      { ...done, requestId: 999, usedMinArea: 111 },
      done,
    ])
    const out = await generateInWorker(image, params, { createWorker: () => w })
    expect(out.usedMinArea).toBe(7)
  })
})
