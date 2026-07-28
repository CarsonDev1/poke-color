import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { imageToScreen, type Viewport } from '@/render/viewport'

/** cỡ chữ = anchorR * scale * hệ số này, kẹp trong [MIN_FONT, MAX_FONT] */
const FONT_RATIO = 0.9
const MIN_FONT = 7
const MAX_FONT = 28

/**
 * Vẽ số lên layer riêng, trong hệ toạ độ MÀN HÌNH.
 *
 * Vẽ theo scale hiện tại (không phải scale ảnh) nên số luôn đọc được khi zoom —
 * đây chính là thứ bù cho các vùng nhỏ có hasLabel = false ở mức zoom 1.
 * Chỉ vẽ vùng trong viewport để số lượng lệnh vẽ không phụ thuộc kích thước ảnh.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
  v: Viewport,
  viewW: number,
  viewH: number,
): void {
  ctx.clearRect(0, 0, viewW, viewH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const r of puzzle.regions) {
    if (!r.hasLabel) continue
    if (engine.isFilled(r.id)) continue

    // +0.5 để canh giữa ô pixel thay vì góc trên-trái của nó
    const s = imageToScreen(v, r.anchorX + 0.5, r.anchorY + 0.5)
    if (s.x < 0 || s.y < 0 || s.x > viewW || s.y > viewH) continue

    const size = Math.min(MAX_FONT, Math.max(MIN_FONT, r.anchorR * v.scale * FONT_RATIO))
    ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`

    // đánh số từ 1 cho người dùng, không phải từ 0
    const text = String(r.colorIndex + 1)

    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = Math.max(1, size / 8)
    ctx.strokeText(text, s.x, s.y)
    ctx.fillStyle = '#4b5563'
    ctx.fillText(text, s.x, s.y)
  }
}
