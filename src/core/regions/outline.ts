import type { RegionField } from '@/core/types'

/**
 * Stage 6 — mask viền 1px.
 * Pixel là biên nếu id vùng của nó khác pixel bên phải hoặc pixel bên dưới.
 * Quy ước "phải/dưới" (không phải cả 4 phía) cho nét mảnh đều 1px, không bị
 * dày lên 2px ở mỗi ranh giới.
 */
export function buildOutline(field: RegionField): Uint8Array {
  const { regionMap, width, height } = field
  const out = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const id = regionMap[p]
      const diffRight = x + 1 < width && regionMap[p + 1] !== id
      const diffDown = y + 1 < height && regionMap[p + width] !== id
      if (diffRight || diffDown) out[p] = 255
    }
  }

  return out
}
