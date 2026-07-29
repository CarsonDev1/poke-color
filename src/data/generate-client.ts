import { STAGE_LABELS, type PipelineParams, type PipelineStage, type Rgb } from '@/core/types'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'

/**
 * 180s, không phải 60s. Đo được ở maxDim 2000 / k 30: median3x3 ×2 tốn 7.7s và
 * quantize k=30 tốn 9.1s — 96% tổng chi phí — cho ra ~20s trên máy dev. Điện
 * thoại tầm trung chậm 3× là vượt 60s, và người dùng sẽ nhận thông báo
 * "ảnh quá lớn" sai sự thật cho một ảnh hoàn toàn hợp lệ.
 */
export const PIPELINE_TIMEOUT_MS = 180_000

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
  /**
   * Worker crash (chunk hashed 404 sau redeploy, OOM kill, lỗi cú pháp trong
   * worker...) không bao giờ gọi `onmessage` — không gắn `onerror` thì sự
   * kiện này rơi vào hư không và người dùng phải đợi hết trọn timeout để
   * đọc "mất quá lâu... giảm kích thước ảnh", sai và vô dụng (spec §17 yêu
   * cầu báo đúng stage khi worker gặp sự cố).
   */
  onerror: ((e: unknown) => void) | null
  /** message nhận được nhưng không deserialize được — hiếm nhưng cùng một lớp lỗi với onerror */
  onmessageerror: ((e: unknown) => void) | null
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
    // Nhãn thông báo lỗi worker crash bằng stage progress GẦN NHẤT đã thấy —
    // không có message 'error' riêng (worker chết im lặng) nên đây là manh
    // mối duy nhất còn lại về việc nó đang làm gì.
    let lastStage: PipelineStage | null = null

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      fn()
    }

    const onWorkerCrash = (): void => {
      const where = lastStage ? `Lỗi ở bước "${STAGE_LABELS[lastStage]}": ` : ''
      finish(() =>
        reject(
          new Error(
            `${where}Worker sinh puzzle gặp sự cố (có thể do vừa triển khai lại ứng dụng, hoặc hết bộ nhớ). Hãy tải lại trang và thử lại.`,
          ),
        ),
      )
    }
    worker.onerror = onWorkerCrash
    worker.onmessageerror = onWorkerCrash

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Tạo puzzle mất quá lâu (hơn ${Math.round(timeoutMs / 1000)} giây). Hãy giảm kích thước ảnh hoặc giảm số màu rồi thử lại.`,
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
        lastStage = r.stage
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
