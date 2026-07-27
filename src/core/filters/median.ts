import type { RgbaImage } from '@/core/types'

/** median của 9 phần tử bằng mạng sắp xếp cục bộ — nhanh hơn sort() */
function median9(v: number[]): number {
  v.sort((a, b) => a - b)
  return v[4]
}

/**
 * Median 3×3 từng kênh, biên kẹp (clamp) toạ độ.
 * Alpha giữ nguyên vì Stage 0 đã ghép alpha lên nền trắng.
 */
export function median3x3(img: RgbaImage, passes: number): RgbaImage {
  const { width: w, height: h } = img
  let src = new Uint8ClampedArray(img.data)

  for (let p = 0; p < passes; p++) {
    const dst = new Uint8ClampedArray(src)
    const buf: number[] = new Array(9)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy))
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx))
              buf[n++] = src[(yy * w + xx) * 4 + c]
            }
          }
          dst[(y * w + x) * 4 + c] = median9(buf)
        }
      }
    }
    src = dst
  }

  return { data: src, width: w, height: h }
}
