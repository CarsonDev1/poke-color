import { describe, expect, it } from 'vitest'
import { median3x3 } from '@/core/filters/median'
import type { RgbaImage } from '@/core/types'

function solid(w: number, h: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { data, width: w, height: h }
}

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

describe('median3x3', () => {
  it('xoá pixel nhiễu đơn lẻ trong vùng phẳng', () => {
    const img = solid(5, 5, [10, 20, 30])
    const c = (2 * 5 + 2) * 4
    img.data[c] = 250
    img.data[c + 1] = 250
    img.data[c + 2] = 250

    const out = median3x3(img, 1)
    expect(px(out, 2, 2)).toEqual([10, 20, 30])
  })

  it('không đổi vùng hoàn toàn phẳng', () => {
    const img = solid(4, 4, [77, 88, 99])
    const out = median3x3(img, 2)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
  })

  it('giữ cạnh dọc sắc nét', () => {
    const img = solid(6, 6, [0, 0, 0])
    for (let y = 0; y < 6; y++) {
      for (let x = 3; x < 6; x++) {
        const i = (y * 6 + x) * 4
        img.data[i] = 255
        img.data[i + 1] = 255
        img.data[i + 2] = 255
      }
    }
    const out = median3x3(img, 1)
    expect(px(out, 2, 3)).toEqual([0, 0, 0])
    expect(px(out, 3, 3)).toEqual([255, 255, 255])
  })

  it('không sửa ảnh input', () => {
    const img = solid(4, 4, [5, 5, 5])
    img.data[0] = 200
    const before = Array.from(img.data)
    median3x3(img, 1)
    expect(Array.from(img.data)).toEqual(before)
  })

  it('passes = 0 trả về bản sao y nguyên', () => {
    const img = solid(3, 3, [1, 2, 3])
    img.data[4] = 199
    const out = median3x3(img, 0)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })
})
