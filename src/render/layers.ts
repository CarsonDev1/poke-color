import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle, Rgb } from '@/core/types'

/** trắng ngà cho vùng chưa tô — dịu mắt hơn trắng tinh khi tô lâu */
export const UNFILLED_COLOR = '#fdfdfb'

export function rgbCss(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * Vẽ một vùng trong hệ toạ độ ẢNH.
 * Dùng pixel-run nên mỗi vùng chỉ tốn vài fillRect thay vì quét cả regionMap —
 * đây là lý do kéo-tô qua 50 vùng vẫn mượt.
 */
export function paintRegion(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  regionId: number,
  color: string,
): void {
  if (!Number.isInteger(regionId) || regionId < 0 || regionId >= puzzle.regions.length) {
    throw new Error(
      `Id vùng ${regionId} ngoài phạm vi 0..${puzzle.regions.length - 1}`,
    )
  }

  const { runs } = puzzle
  ctx.fillStyle = color
  for (let i = runs.offsets[regionId]; i < runs.offsets[regionId + 1]; i++) {
    ctx.fillRect(runs.x0[i], runs.y[i], runs.x1[i] - runs.x0[i] + 1, 1)
  }
}

/** Vẽ lại toàn bộ layer base từ trạng thái engine. Dùng khi load và khi reset. */
export function paintAllRegions(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
): void {
  for (const r of puzzle.regions) {
    const color = engine.isFilled(r.id)
      ? rgbCss(puzzle.palette[r.colorIndex])
      : UNFILLED_COLOR
    paintRegion(ctx, puzzle, r.id, color)
  }
}

/**
 * Mask viền → ImageData đen/trong suốt.
 * Lớp gọi nên `createImageBitmap` một lần rồi dùng lại mọi frame; đây là dữ
 * liệu tĩnh, không đổi trong suốt phiên tô.
 */
export function buildOutlineImageData(puzzle: Puzzle): ImageData {
  const { width, height, outline } = puzzle
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < outline.length; i++) {
    if (outline[i]) data[i * 4 + 3] = 255 // RGB để 0 = đen
  }
  return new ImageData(data, width, height)
}
