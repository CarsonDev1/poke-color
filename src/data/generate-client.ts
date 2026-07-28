import { STAGE_LABELS, type PipelineParams, type PipelineStage, type Rgb } from '@/core/types'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'

export const PIPELINE_TIMEOUT_MS = 60_000

export interface GenerateOutcome {
  bin: Uint8Array
  regionsJson: string
  regionCount: number
  palette: Rgb[]
  width: number
  height: number
  usedMinArea: number
}

/** phần giao diện Worker mà ta thực sự dùng — cho phép tiêm worker giả khi test */
export interface WorkerLike {
  postMessage(m: unknown): void
  terminate(): void
  onmessage: ((e: { data: GenerateResponse }) => void) | null
}

export function createGenerateWorker(): WorkerLike {
  return new Worker(new URL('../worker/generate.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

let nextRequestId = 1

/**
 * Chạy pipeline trong worker.
 *
 * Mọi đường ra (done / error / timeout / abort) đều TERMINATE worker. Nếu chỉ
 * reject promise mà để worker sống, một lần sinh thất bại sẽ tiếp tục ngốn CPU
 * và lần thử tiếp theo với ảnh nhỏ hơn vẫn đứng máy.
 */
export function generateInWorker(
  image: { data: Uint8ClampedArray; width: number; height: number },
  params: PipelineParams,
  opts: {
    onProgress?: (stage: PipelineStage, ratio: number) => void
    createWorker?: () => WorkerLike
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<GenerateOutcome> {
  const {
    onProgress,
    createWorker = createGenerateWorker,
    timeoutMs = PIPELINE_TIMEOUT_MS,
    signal,
  } = opts

  if (signal?.aborted) {
    return Promise.reject(new Error('Đã huỷ tạo puzzle'))
  }

  return new Promise<GenerateOutcome>((resolve, reject) => {
    const requestId = nextRequestId++
    const worker = createWorker()

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.terminate()
      fn()
    }

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Tạo puzzle mất quá lâu (hơn 60 giây). Hãy giảm kích thước ảnh hoặc giảm số màu rồi thử lại.',
          ),
        ),
      )
    }, timeoutMs)

    const onAbort = (): void => {
      finish(() => reject(new Error('Đã huỷ tạo puzzle')))
    }
    signal?.addEventListener('abort', onAbort)

    worker.onmessage = (e) => {
      const r = e.data
      if (!r || r.requestId !== requestId) return

      if (r.type === 'progress') {
        onProgress?.(r.stage, r.ratio)
        return
      }
      if (r.type === 'error') {
        const where = r.stage ? `Lỗi ở bước "${STAGE_LABELS[r.stage]}": ` : ''
        finish(() => reject(new Error(`${where}${r.message}`)))
        return
      }
      finish(() =>
        resolve({
          bin: r.bin,
          regionsJson: r.regionsJson,
          regionCount: r.regionCount,
          palette: r.palette,
          width: r.width,
          height: r.height,
          usedMinArea: r.usedMinArea,
        }),
      )
    }

    const req: GenerateRequest = { type: 'generate', requestId, image, params }
    worker.postMessage(req)
  })
}
