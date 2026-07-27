import { describe, expect, it } from 'vitest'
import { medianCut } from '@/core/quantize/median-cut'
import { rgbToLab } from '@/core/color/srgb-lab'

function labArrayOf(colors: [number, number, number][], repeat: number): Float32Array {
  const out = new Float32Array(colors.length * repeat * 3)
  let i = 0
  for (const c of colors) {
    const lab = rgbToLab(c[0], c[1], c[2])
    for (let r = 0; r < repeat; r++) {
      out[i++] = lab[0]
      out[i++] = lab[1]
      out[i++] = lab[2]
    }
  }
  return out
}

describe('medianCut', () => {
  it('trả về đúng k centroid', () => {
    const lab = labArrayOf([[255, 0, 0], [0, 255, 0], [0, 0, 255]], 10)
    expect(medianCut(lab, 3)).toHaveLength(9)
    expect(medianCut(lab, 5)).toHaveLength(15)
  })

  it('với 3 màu rời rạc và k=3, mỗi centroid trùng một màu', () => {
    const reds = rgbToLab(255, 0, 0)
    const greens = rgbToLab(0, 255, 0)
    const blues = rgbToLab(0, 0, 255)
    const lab = labArrayOf([[255, 0, 0], [0, 255, 0], [0, 0, 255]], 20)

    const c = medianCut(lab, 3)
    const found = [0, 1, 2].map((i) => [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]])

    for (const target of [reds, greens, blues]) {
      const near = found.some(
        (f) =>
          Math.abs(f[0] - target[0]) < 1 &&
          Math.abs(f[1] - target[1]) < 1 &&
          Math.abs(f[2] - target[2]) < 1,
      )
      expect(near).toBe(true)
    }
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const lab = new Float32Array(300)
    for (let i = 0; i < 100; i++) {
      lab[i * 3] = (i * 7) % 100
      lab[i * 3 + 1] = ((i * 13) % 200) - 100
      lab[i * 3 + 2] = ((i * 29) % 200) - 100
    }
    expect(Array.from(medianCut(lab, 8))).toEqual(Array.from(medianCut(lab, 8)))
  })

  it('k lớn hơn số màu riêng biệt vẫn trả đủ k centroid', () => {
    const lab = labArrayOf([[0, 0, 0], [255, 255, 255]], 5)
    expect(medianCut(lab, 6)).toHaveLength(18)
  })
})
