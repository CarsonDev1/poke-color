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

const FOCUS_RING_COLOR = '#2563eb'
const FOCUS_RING_WIDTH = 3

/**
 * Viền "con trỏ" vùng hiện tại của bàn phím (spec §8: "focus ring vẽ trên
 * layer riêng"). Trước khi có hàm này, `focusRegion` chỉ tồn tại trong state
 * — Tab vào canvas rồi bấm mũi tên không có gì đổi trên màn hình lẫn vùng
 * live region, và vì id vùng theo thứ tự raster-scan (không theo vị trí thị
 * giác), người dùng không có cách nào đoán được con trỏ đang ở đâu.
 *
 * Vẽ ĐÚNG MỘT `strokeRect` — bounding box của vùng (`minX/minY/maxX/maxY` có
 * sẵn trên `RegionMeta`), không phải một rect mỗi pixel-run. Bản trước lặp
 * qua `puzzle.runs` và stroke một rect riêng cho mỗi run: mỗi run chỉ cao
 * `1 × scale` px màn hình, nên ở scale < 3 (vd `fitViewport` không kẹp scale
 * ≥ 1, và ảnh lớn hơn khung nhìn cho scale < 1 rất bình thường) viền 3px của
 * các run liền kề chồng lấp lên nhau và tô đặc cả vùng thành một khối xanh
 * — đúng lỗi mà lần sửa này khắc phục.
 *
 * Chỉ vẽ khi `focused` — bề mặt tương tác đang thật sự có DOM focus. Người
 * dùng chuột/chạm chưa từng Tab vào canvas không nên thấy viền con trỏ bàn
 * phím này; `focusRegion` mặc định là 0 nên nếu không gác điều kiện này,
 * vùng 0 luôn bị viền (nay là bbox, không còn tô đặc, nhưng vẫn là một dấu
 * hiệu thị giác không mời mà đến) ngay khi canvas xuất hiện.
 *
 * Gọi SAU `drawLabels` trên CÙNG canvas `labels` (không tự `clearRect`), vẽ
 * trong hệ toạ độ MÀN HÌNH như `drawLabels`.
 */
export function drawFocusRing(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  regionId: number,
  v: Viewport,
  viewW: number,
  viewH: number,
  focused: boolean,
): void {
  if (!focused) return
  if (!Number.isInteger(regionId) || regionId < 0 || regionId >= puzzle.regions.length) return

  const r = puzzle.regions[regionId]
  const topLeft = imageToScreen(v, r.minX, r.minY)
  const bottomRight = imageToScreen(v, r.maxX + 1, r.maxY + 1)
  if (bottomRight.x < 0 || bottomRight.y < 0 || topLeft.x > viewW || topLeft.y > viewH) return

  ctx.save()
  ctx.strokeStyle = FOCUS_RING_COLOR
  ctx.lineWidth = FOCUS_RING_WIDTH
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
  ctx.restore()
}
