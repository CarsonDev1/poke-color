import { describe, expect, it } from 'vitest'
import { labToRgb, rgbToLab, rgbaToLabArray } from '@/core/color/srgb-lab'

describe('rgbToLab', () => {
  it('trắng → L=100, a=0, b=0', () => {
    const [L, a, b] = rgbToLab(255, 255, 255)
    expect(L).toBeCloseTo(100, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('đen → L=0', () => {
    const [L, a, b] = rgbToLab(0, 0, 0)
    expect(L).toBeCloseTo(0, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('đỏ thuần → giá trị D65 đã biết', () => {
    const [L, a, b] = rgbToLab(255, 0, 0)
    expect(L).toBeCloseTo(53.24, 1)
    expect(a).toBeCloseTo(80.09, 1)
    expect(b).toBeCloseTo(67.2, 1)
  })

  it('xanh lá thuần → giá trị D65 đã biết', () => {
    const [L, a, b] = rgbToLab(0, 255, 0)
    expect(L).toBeCloseTo(87.73, 1)
    expect(a).toBeCloseTo(-86.18, 1)
    expect(b).toBeCloseTo(83.18, 1)
  })
})

describe('labToRgb', () => {
  it('đi vòng về đúng giá trị gốc', () => {
    for (const rgb of [
      [255, 255, 255],
      [0, 0, 0],
      [255, 0, 0],
      [12, 200, 77],
      [128, 128, 128],
    ] as const) {
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2])
      const back = labToRgb(lab[0], lab[1], lab[2])
      expect(back[0]).toBeCloseTo(rgb[0], 0)
      expect(back[1]).toBeCloseTo(rgb[1], 0)
      expect(back[2]).toBeCloseTo(rgb[2], 0)
    }
  })

  it('kẹp về 0..255 khi Lab nằm ngoài gamut', () => {
    const out = labToRgb(50, 120, -120)
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})

describe('rgbaToLabArray', () => {
  it('trả về 3 kênh cho mỗi pixel, bỏ qua alpha', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255])
    const lab = rgbaToLabArray(data)
    expect(lab).toHaveLength(6)
    expect(lab[0]).toBeCloseTo(53.24, 1)
    expect(lab[3]).toBeCloseTo(0, 1)
  })
})
