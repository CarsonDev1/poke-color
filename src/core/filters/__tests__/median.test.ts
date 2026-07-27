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

  it('KHÔNG BAO GIỜ bịa màu: mọi màu output đều tồn tại trong ảnh input', () => {
    // 4 góc 4 màu + nhiễu xác định — cùng dạng với fixture của pipeline
    const w = 32
    const h = 32
    const colors: [number, number, number][] = [
      [220, 30, 30],
      [30, 200, 60],
      [40, 70, 220],
      [240, 230, 40],
    ]
    const img = solid(w, h, [0, 0, 0])
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1)
        const c = colors[q]
        const n = ((x * 7 + y * 13) % 5) - 2
        const i = (y * w + x) * 4
        img.data[i] = c[0] + n
        img.data[i + 1] = c[1] + n
        img.data[i + 2] = c[2] + n
      }
    }

    const inputColors = new Set<string>()
    for (let i = 0; i < w * h; i++) {
      inputColors.add(`${img.data[i * 4]},${img.data[i * 4 + 1]},${img.data[i * 4 + 2]}`)
    }

    const out = median3x3(img, 2)

    const invented: string[] = []
    for (let i = 0; i < w * h; i++) {
      const key = `${out.data[i * 4]},${out.data[i * 4 + 1]},${out.data[i * 4 + 2]}`
      if (!inputColors.has(key)) invented.push(key)
    }

    expect(invented).toEqual([])
  })

  it('vẫn khử được pixel nhiễu đơn lẻ sau khi snap', () => {
    const img = solid(5, 5, [10, 20, 30])
    const c = (2 * 5 + 2) * 4
    img.data[c] = 250
    img.data[c + 1] = 250
    img.data[c + 2] = 250

    const out = median3x3(img, 1)
    expect(px(out, 2, 2)).toEqual([10, 20, 30])
  })
})
