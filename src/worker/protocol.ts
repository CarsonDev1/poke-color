import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { runPipeline } from '@/core/pipeline'
import type { PipelineParams, PipelineStage, Rgb } from '@/core/types'

export interface GenerateRequest {
  type: 'generate'
  requestId: number
  image: { data: Uint8ClampedArray; width: number; height: number }
  params: PipelineParams
}

export type GenerateResponse =
  | { type: 'progress'; requestId: number; stage: PipelineStage; ratio: number }
  | {
      type: 'done'
      requestId: number
      bin: Uint8Array
      regionsJson: string
      regionCount: number
      palette: Rgb[]
      width: number
      height: number
      usedMinArea: number
    }
  | {
      type: 'error'
      requestId: number
      /** stage đang chạy khi lỗi xảy ra; null nếu lỗi trước khi vào stage nào */
      stage: PipelineStage | null
      message: string
    }

/**
 * Toàn bộ logic của worker, tách khỏi `self` để test được không cần Worker thật.
 *
 * Không bao giờ throw ra ngoài: mọi lỗi được gói thành message `error` kèm tên
 * stage đang chạy, vì UI cần hiển thị "vỡ ở bước Gộp vùng vụn" chứ không phải
 * một stack trace vô nghĩa (spec §17).
 */
export function handleGenerate(
  req: GenerateRequest,
  post: (r: GenerateResponse) => void,
): void {
  const requestId = req?.requestId ?? 0
  let currentStage: PipelineStage | null = null

  try {
    if (req?.type !== 'generate') {
      throw new Error(`Không hiểu loại message "${String(req?.type)}"`)
    }
    const { image, params } = req
    if (!image || image.width <= 0 || image.height <= 0 || image.data.length === 0) {
      throw new Error('Ảnh rỗng hoặc kích thước không hợp lệ')
    }
    if (image.data.length !== image.width * image.height * 4) {
      throw new Error(
        `Kích thước dữ liệu ảnh không khớp: có ${image.data.length} byte, cần ${image.width * image.height * 4}`,
      )
    }
    if (params.k < 2) {
      throw new Error(`Số màu phải >= 2, đang là ${params.k}`)
    }

    const result = runPipeline(image, params, (p) => {
      currentStage = p.stage
      post({ type: 'progress', requestId, stage: p.stage, ratio: p.ratio })
    })

    post({
      type: 'done',
      requestId,
      bin: encodePuzzleBin(result.bin),
      regionsJson: encodeRegions(result.puzzle.regions),
      regionCount: result.puzzle.regions.length,
      palette: result.puzzle.palette,
      width: result.puzzle.width,
      height: result.puzzle.height,
      usedMinArea: result.usedMinArea,
    })
  } catch (err) {
    post({
      type: 'error',
      requestId,
      stage: currentStage,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
