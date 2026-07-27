import type { RgbaImage } from '@/core/types'

/**
 * Bilateral filter trên RGB.
 * Trọng số = gauss(khoảng cách không gian) * gauss(khác biệt màu).
 * Bán kính = ceil(2*sigmaSpace) — quá 2σ thì trọng số không còn đáng kể.
 *
 * Chạy trên RGB (không phải Lab) là có chủ ý: sigmaColor 25 được hiệu chỉnh
 * theo thang 0..255, và đây là bước tiền xử lý nên không cần đúng cảm nhận
 * màu như Stage 2.
 */
export function bilateral(
  img: RgbaImage,
  passes: number,
  sigmaSpace = 3,
  sigmaColor = 25,
): RgbaImage {
  const { width: w, height: h } = img
  let src = new Uint8ClampedArray(img.data)
  if (passes <= 0) return { data: src, width: w, height: h }

  const radius = Math.max(1, Math.ceil(sigmaSpace * 2))
  const size = radius * 2 + 1

  // bảng trọng số không gian, tính trước
  const spatial = new Float32Array(size * size)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatial[(dy + radius) * size + (dx + radius)] =
        Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace))
    }
  }

  // bảng trọng số màu theo bình phương khác biệt, tính trước cho 0..255 —
  // diff là khoảng cách Chebyshev giữa hai kênh 0..255 nên không bao giờ vượt 255
  const colorLut = new Float32Array(256)
  for (let d = 0; d < colorLut.length; d++) {
    colorLut[d] = Math.exp(-(d * d) / (2 * sigmaColor * sigmaColor))
  }

  for (let p = 0; p < passes; p++) {
    const dst = new Uint8ClampedArray(src.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ci = (y * w + x) * 4
        const cr = src[ci]
        const cg = src[ci + 1]
        const cb = src[ci + 2]

        let sr = 0
        let sg = 0
        let sb = 0
        let sw = 0

        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue

            const ni = (yy * w + xx) * 4
            const nr = src[ni]
            const ng = src[ni + 1]
            const nb = src[ni + 2]

            // khác biệt màu dùng khoảng cách Chebyshev để tra LUT 1 chiều
            const diff = Math.max(
              Math.abs(nr - cr),
              Math.abs(ng - cg),
              Math.abs(nb - cb),
            )

            const wgt =
              spatial[(dy + radius) * size + (dx + radius)] * colorLut[diff]

            sr += nr * wgt
            sg += ng * wgt
            sb += nb * wgt
            sw += wgt
          }
        }

        dst[ci] = Math.round(sr / sw)
        dst[ci + 1] = Math.round(sg / sw)
        dst[ci + 2] = Math.round(sb / sw)
        dst[ci + 3] = src[ci + 3]
      }
    }
    src = dst
  }

  return { data: src, width: w, height: h }
}
