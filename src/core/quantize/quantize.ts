import { labToRgb, rgbaToLabArray, rgbToLab } from '@/core/color/srgb-lab'
import { kmeansLab } from '@/core/quantize/kmeans'
import type { QuantizeResult, Rgb, RgbaImage } from '@/core/types'

function compareLab(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

/**
 * Stage 2 — gom ảnh về k màu.
 * Palette được sắp ổn định theo (L, a, b) tăng dần và labels được ánh xạ lại
 * theo thứ tự mới, nên colorIndex có nghĩa (số nhỏ = màu tối) và ổn định
 * giữa các lần chạy.
 */
export function quantize(img: RgbaImage, k: number): QuantizeResult {
  const lab = rgbaToLabArray(img.data)
  const { labels, centroids } = kmeansLab(lab, k)

  const rgbPalette: Rgb[] = []
  for (let c = 0; c < k; c++) {
    rgbPalette.push(
      labToRgb(centroids[c * 3], centroids[c * 3 + 1], centroids[c * 3 + 2]),
    )
  }

  // sắp theo Lab của màu RGB đã kẹp gamut, để thứ tự khớp đúng cái test kiểm
  const order = rgbPalette
    .map((rgb, i) => ({ i, lab: rgbToLab(rgb[0], rgb[1], rgb[2]) }))
    .sort((p, q) => compareLab(p.lab, q.lab) || p.i - q.i)

  const remap = new Uint8Array(k)
  order.forEach((o, newIndex) => {
    remap[o.i] = newIndex
  })

  const outLabels = new Uint8Array(labels.length)
  for (let i = 0; i < labels.length; i++) outLabels[i] = remap[labels[i]]

  return {
    labels: outLabels,
    palette: order.map((o) => rgbPalette[o.i]),
  }
}
