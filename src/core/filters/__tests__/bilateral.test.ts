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

  it('làm phẳng gradient thoải có nhiễu: độ lệch giữa 2 pixel kề giảm mạnh', () => {
    // Một gradient TUYỆT ĐỐI (không nhiễu) là điểm bất động của kernel này khi
    // đo trong vùng nội bộ (không chạm biên): trung bình có trọng số đối xứng
    // của một hàm tuyến tính tại điểm x luôn bằng chính giá trị tại x, nên
    // phép đo "độ lệch kề nhau giảm" không đo được gì trên gradient thuần —
    // đây là lỗ hổng của test cũ. Ảnh ở đây là gradient dốc 2/px CỘNG nhiễu
    // xác định (không random): hệ số nhân của x (3) nguyên tố cùng nhau với
    // modulus (11) nên phần dư đi qua nhiều giá trị khác nhau theo x, và biên
    // độ nhiễu (tối đa ±5) đủ lớn hơn độ dốc (2) để tạo ra đảo chiều thật giữa
    // các pixel kề nhau — nếu không có đảo chiều, tổng lệch tuyệt đối kề nhau
    // chỉ đo hiệu số đầu-cuối (bất biến với mọi làm mượt), không đo được nhiễu.
    const img = make(64, 16, (x, y) => {
      const v = 2 * x + (((x * 3 + y * 5) % 11) - 5)
      return [v, v, v]
    })
    const out = bilateral(img, 1)

    // Đo tại hàng giữa (y=8), trong vùng x∈[16,47) — cách cả hai biên ảnh
    // hơn bán kính kernel (radius=6) nên phép làm mượt ở đây thuần là hiệu
    // ứng nội bộ, không lẫn hiệu ứng cắt biên.
    let before = 0
    let after = 0
    for (let x = 16; x < 47; x++) {
      before += Math.abs(px(img, x + 1, 8)[0] - px(img, x, 8)[0])
      after += Math.abs(px(out, x + 1, 8)[0] - px(out, x, 8)[0])
    }
    // Đo thực tế: before=163, after=62 (còn ~38%, tức giảm ~62%).
    // Ngưỡng dưới đây (giảm còn dưới 50%) có biên an toàn rộng so với số đo.
    expect(after).toBeLessThan(before * 0.5)
  })

  it('thành phần màu là thứ giữ cạnh: sigmaColor rất lớn thì cạnh bị nhoè', () => {
    // sigmaColor cực lớn làm gauss(khác biệt màu) ≈ 1 với mọi khác biệt, tức
    // suy biến bilateral thành Gaussian không gian thuần (blur) — đúng lỗi mà
    // kế hoạch cảnh báo. Test này khoá cả hai đầu: mặc định giữ cạnh, còn khi
    // suy biến thành blur thì cạnh phải sập.
    const img = make(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255]))

    const outDefault = bilateral(img, 2)
    const leftDefault = px(outDefault, 6, 8)[0]
    const rightDefault = px(outDefault, 9, 8)[0]
    expect(rightDefault - leftDefault).toBeGreaterThan(255 * 0.9)

    const outBlur = bilateral(img, 2, 3, 100000)
    const leftBlur = px(outBlur, 6, 8)[0]
    const rightBlur = px(outBlur, 9, 8)[0]
    // Đo thực tế: contrast còn lại ~29.4% (75/255) khi sigmaColor=100000 —
    // sập rõ rệt so với ngưỡng 90%. Ngưỡng dưới đây có biên an toàn rộng.
    expect(rightBlur - leftBlur).toBeLessThan(255 * 0.5)
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
