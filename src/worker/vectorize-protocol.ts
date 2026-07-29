import { decodePuzzleBin, decodeRegions, assemblePuzzle } from '@/core/codec/puzzle-format'
import { vectorizePuzzle, type VectorizeOptions } from '@/core/vector/vectorize'

export interface VectorizeRequest {
  type: 'vectorize'
  requestId: number
  /** puzzle.bin đã giải nén (KHÔNG phải .gz) */
  bin: Uint8Array
  /** regions.json đã giải nén */
  regionsJson: string
  options: VectorizeOptions
}

export type VectorizeResponse =
  | { type: 'done'; requestId: number; outline: string; solution: string }
  | { type: 'error'; requestId: number; message: string }

/**
 * Toàn bộ logic worker, tách khỏi `self` để test được không cần Worker thật —
 * cùng khuôn với `handleGenerate`.
 *
 * Không bao giờ throw ra ngoài: mọi lỗi thành message `error`. Worker throw thì
 * `onmessage` không bao giờ được gọi và UI treo ở "đang tính…" tới hết timeout.
 */
export function handleVectorize(
  req: VectorizeRequest,
  post: (r: VectorizeResponse) => void,
): void {
  try {
    const bin = decodePuzzleBin(req.bin)
    const regions = decodeRegions(req.regionsJson)
    const puzzle = assemblePuzzle(bin, regions)
    const { outline, solution } = vectorizePuzzle(puzzle, req.options)
    post({ type: 'done', requestId: req.requestId, outline, solution })
  } catch (err) {
    post({
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
