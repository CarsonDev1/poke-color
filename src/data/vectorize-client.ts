import type { VectorizeOptions } from '@/core/vector/vectorize'
import type { VectorizeRequest, VectorizeResponse } from '@/worker/vectorize-protocol'

export const VECTORIZE_TIMEOUT_MS = 120_000

/** phần giao diện Worker thực sự dùng — cho phép tiêm worker giả khi test */
export interface VectorizeWorkerLike {
  postMessage(m: unknown): void
  terminate(): void
  onmessage: ((e: { data: VectorizeResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
  onmessageerror: ((e: unknown) => void) | null
}

export interface VectorizeOutcome {
  outline: string
  solution: string
}

function createVectorizeWorker(): VectorizeWorkerLike {
  return new Worker(new URL('../worker/vectorize.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as VectorizeWorkerLike
}

let nextRequestId = 1

/**
 * Vector hoá trong worker.
 *
 * Mọi đường ra (done / error / timeout / abort) đều TERMINATE worker — cùng lý
 * do như `generateInWorker`: để worker sống sau một lần thất bại thì nó tiếp tục
 * ngốn CPU và lần thử sau vẫn đứng máy.
 */
export function vectorizeInWorker(
  bin: Uint8Array,
  regionsJson: string,
  options: VectorizeOptions = {},
  opts: {
    createWorker?: () => VectorizeWorkerLike
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<VectorizeOutcome> {
  const {
    createWorker = createVectorizeWorker,
    timeoutMs = VECTORIZE_TIMEOUT_MS,
    signal,
  } = opts

  if (signal?.aborted) return Promise.reject(new Error('Đã huỷ vector hoá'))

  return new Promise<VectorizeOutcome>((resolve, reject) => {
    const requestId = nextRequestId++
    const worker = createWorker()

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

    const onCrash = (): void => {
      finish(() =>
        reject(
          new Error(
            'Worker vector hoá gặp sự cố (có thể do vừa triển khai lại ứng dụng, hoặc hết bộ nhớ). Hãy tải lại trang và thử lại.',
          ),
        ),
      )
    }
    worker.onerror = onCrash
    worker.onmessageerror = onCrash

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Vector hoá mất quá lâu (hơn ${Math.round(timeoutMs / 1000)} giây). Tranh này có thể quá nhiều vùng để in.`,
          ),
        ),
      )
    }, timeoutMs)

    const onAbort = (): void => {
      finish(() => reject(new Error('Đã huỷ vector hoá')))
    }
    signal?.addEventListener('abort', onAbort)

    worker.onmessage = (e) => {
      const r = e.data
      // Bỏ qua message của request KHÁC. Không lọc thì một worker giả (hoặc một
      // request cũ chưa terminate xong) sẽ resolve sai promise.
      if (!r || r.requestId !== requestId) return
      if (r.type === 'done') {
        finish(() => resolve({ outline: r.outline, solution: r.solution }))
      } else if (r.type === 'error') {
        finish(() => reject(new Error(r.message)))
      }
    }

    const req: VectorizeRequest = {
      type: 'vectorize',
      requestId,
      bin,
      regionsJson,
      options,
    }
    worker.postMessage(req)
  })
}
