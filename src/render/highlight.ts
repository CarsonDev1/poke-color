import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { rgbCss } from '@/render/layers'
import type { Viewport } from '@/render/viewport'

const HIGHLIGHT_ALPHA = 0.28

/**
 * Tint nhẹ các vùng CHƯA tô của màu đang chọn.
 *
 * Vẽ trong hệ toạ độ ẢNH (lớp gọi đã setTransform), giống layer base.
 * Đây là trợ giúp bắt buộc phải có: nhiều vùng quá nhỏ để in số, nếu không
 * có highlight thì người chơi không có cách nào tìm ra chúng.
 */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
  colorIndex: number | null,
  _v: Viewport,
  viewW: number,
  viewH: number,
): void {
  ctx.clearRect(0, 0, viewW, viewH)
  if (colorIndex === null) return

  const { runs } = puzzle
  ctx.save()
  ctx.globalAlpha = HIGHLIGHT_ALPHA
  ctx.fillStyle = rgbCss(puzzle.palette[colorIndex])

  for (const r of puzzle.regions) {
    if (r.colorIndex !== colorIndex) continue
    if (engine.isFilled(r.id)) continue
    for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
      ctx.fillRect(runs.x0[i], runs.y[i], runs.x1[i] - runs.x0[i] + 1, 1)
    }
  }

  ctx.restore()
}
