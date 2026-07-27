import { describe, expect, it } from 'vitest'
import { quantize } from '@/core/quantize/quantize'
import { rgbToLab } from '@/core/color/srgb-lab'
import type { RgbaImage } from '@/core/types'

/** ảnh 3 dải ngang: đỏ, xanh lá, xanh dương */
function threeBands(): RgbaImage {
  const w = 9
  const h = 9
  const data = new Uint8ClampedArray(w * h * 4)
  const bands: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ]
  for (let y = 0; y < h; y++) {
    const c = bands[Math.floor(y / 3)]
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

describe('quantize', () => {
  it('palette có đúng k phần tử', () => {
    expect(quantize(threeBands(), 3).palette).toHaveLength(3)
    expect(quantize(threeBands(), 6).palette).toHaveLength(6)
  })

  it('labels có đúng width*height phần tử', () => {
    const r = quantize(threeBands(), 3)
    expect(r.labels).toHaveLength(81)
  })

  it('3 dải màu rời nhau → 3 nhãn khác nhau, mỗi dải một nhãn', () => {
    const { labels } = quantize(threeBands(), 3)
    const band = (y: number) => new Set(Array.from(labels.slice(y * 9, y * 9 + 9)))
    expect(band(1).size).toBe(1)
    expect(band(4).size).toBe(1)
    expect(band(7).size).toBe(1)
    expect(new Set([...band(1), ...band(4), ...band(7)]).size).toBe(3)
  })

  it('palette sắp tăng dần theo L, rồi a, rồi b', () => {
    const { palette } = quantize(threeBands(), 3)
    const labs = palette.map((p) => rgbToLab(p[0], p[1], p[2]))
    for (let i = 1; i < labs.length; i++) {
      const prev = labs[i - 1]
      const cur = labs[i]
      const cmp =
        prev[0] !== cur[0] ? prev[0] - cur[0]
        : prev[1] !== cur[1] ? prev[1] - cur[1]
        : prev[2] - cur[2]
      expect(cmp).toBeLessThanOrEqual(0)
    }
  })

  it('labels trỏ đúng màu palette sau khi sắp lại', () => {
    const img = threeBands()
    const { labels, palette } = quantize(img, 3)
    // pixel giữa dải đỏ phải trỏ tới màu palette gần đỏ nhất
    const idx = 1 * 9 + 4
    const chosen = palette[labels[idx]]
    expect(chosen[0]).toBeGreaterThan(chosen[1])
    expect(chosen[0]).toBeGreaterThan(chosen[2])
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const img = threeBands()
    const a = quantize(img, 5)
    const b = quantize(img, 5)
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
    expect(a.palette).toEqual(b.palette)
  })
})
