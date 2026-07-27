import { describe, expect, it } from 'vitest'
import { bilateral } from '@/core/filters/bilateral'
import type { RgbaImage } from '@/core/types'

function make(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

describe('bilateral', () => {
  it('không đổi vùng hoàn toàn phẳng', () => {
    const img = make(8, 8, () => [100, 110, 120])
    const out = bilateral(img, 1)
    expect(px(out, 4, 4)).toEqual([100, 110, 120])
  })

  it('giữ độ tương phản của cạnh mạnh', () => {
    // nửa trái đen, nửa phải trắng
    const img = make(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255]))
    const out = bilateral(img, 2)
    const left = px(out, 6, 8)[0]
    const right = px(out, 9, 8)[0]
    // giữ được > 90% tương phản gốc
    expect(right - left).toBeGreaterThan(255 * 0.9)
  })

  it('làm phẳng gradient thoải: độ lệch giữa 2 pixel kề giảm', () => {
    // gradient dốc 1 đơn vị mỗi pixel theo x
    const img = make(32, 8, (x) => [x * 4, x * 4, x * 4])
    const out = bilateral(img, 3, 3, 25)

    let before = 0
    let after = 0
    for (let x = 8; x < 24; x++) {
      before += Math.abs(px(img, x + 1, 4)[0] - px(img, x, 4)[0])
      after += Math.abs(px(out, x + 1, 4)[0] - px(out, x, 4)[0])
    }
    expect(after).toBeLessThan(before)
  })

  it('không sửa ảnh input', () => {
    const img = make(6, 6, (x, y) => [x * 10, y * 10, 50])
    const before = Array.from(img.data)
    bilateral(img, 2)
    expect(Array.from(img.data)).toEqual(before)
  })

  it('passes = 0 trả bản sao y nguyên', () => {
    const img = make(4, 4, (x) => [x, x, x])
    const out = bilateral(img, 0)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })

  it('deterministic', () => {
    const img = make(20, 20, (x, y) => [(x * 7 + y * 3) % 256, (x * 11) % 256, (y * 13) % 256])
    const a = bilateral(img, 2)
    const b = bilateral(img, 2)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})
