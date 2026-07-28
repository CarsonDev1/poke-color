import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { buildOutlineImageData, paintAllRegions } from '@/render/layers'

export const THUMBNAIL_MAX_PX = 320

export function thumbnailSize(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(w, h))
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  }
}

/**
 * Render trạng thái tô hiện tại thành WebP nhỏ để `/library` hiện được ngay.
 *
 * Gọi khi RỜI màn chơi, không phải khi mở thư viện: tải puzzle.bin của 20
 * puzzle rồi decode lúc mở thư viện sẽ treo màn hình vài giây (spec §16).
 */
export async function makeThumbnail(puzzle: Puzzle, engine: PaintEngine): Promise<Blob> {
  const full = new OffscreenCanvas(puzzle.width, puzzle.height)
  const fctx = full.getContext('2d')
  if (!fctx) throw new Error('Không tạo được canvas cho thumbnail')
  paintAllRegions(fctx as unknown as CanvasRenderingContext2D, puzzle, engine)

  // Viền vùng — giống `redrawAll` trong PaintCanvas. Thiếu bước này, một
  // puzzle CHƯA tô gì render ra một hình chữ nhật UNFILLED_COLOR đồng nhất,
  // không phân biệt được với placeholder "Chưa tô" của /library — tức mọi
  // puzzle mới đều trông "trống" trên chính màn hình chủ của app cho tới khi
  // người dùng đã tô kha khá.
  const outlineBmp = await createImageBitmap(buildOutlineImageData(puzzle))
  ;(fctx as unknown as CanvasRenderingContext2D).drawImage(outlineBmp as unknown as CanvasImageSource, 0, 0)
  outlineBmp.close()

  const { w, h } = thumbnailSize(puzzle.width, puzzle.height)
  const small = new OffscreenCanvas(w, h)
  const sctx = small.getContext('2d')
  if (!sctx) throw new Error('Không tạo được canvas cho thumbnail')
  sctx.drawImage(full as unknown as CanvasImageSource, 0, 0, w, h)

  return small.convertToBlob({ type: 'image/webp', quality: 0.8 })
}
