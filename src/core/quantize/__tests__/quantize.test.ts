import { describe, expect, it } from 'vitest'
import { quantize } from '@/core/quantize/quantize'
import { rgbToLab } from '@/core/color/srgb-lab'
import { deltaE76 } from '@/core/color/delta-e'
import type { Rgb, RgbaImage } from '@/core/types'

/** ảnh 3 dải ngang, mỗi dải 3 hàng, rộng 9, màu theo `colors[band]` */
function bandsOf(colors: Rgb[]): RgbaImage {
  const w = 9
  const h = 9
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const c = colors[Math.floor(y / 3)]
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

const RGB_COLORS: Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
]

/**
 * ảnh 3 dải ngang: đỏ, xanh lá, xanh dương.
 * Phép hoán vị sắp-lại (cluster gốc → chỉ số palette đã sắp) của fixture này
 * là (0)(1 2) — một involution (tự nghịch đảo): xây bảng remap xuôi
 * (`remap[old]=new`) hay lỡ xây ngược (`remap[new]=old`) đều cho ra CÙNG một
 * mảng, nên fixture này không thể tự nó phát hiện bug đảo hướng remap. Vẫn
 * giữ lại cho các khẳng định khác (độ dài, sắp xếp, determinism); riêng khẳng
 * định "labels trỏ đúng màu" phải chạy thêm trên `orangeCyanMagenta()`.
 */
function threeBands(): RgbaImage {
  return bandsOf(RGB_COLORS)
}

const OCM_COLORS: Rgb[] = [
  [255, 165, 0], // cam
  [0, 255, 255], // lục lam
  [255, 0, 255], // đỏ tươi (magenta)
]

/**
 * ảnh 3 dải ngang: cam, lục lam, đỏ tươi.
 * Đã kiểm chứng thực nghiệm: phép hoán vị sắp-lại của fixture này là
 * perm(old→new) = [2, 0, 1] — một 3-cycle thật sự, KHÔNG phải involution.
 * Với hoán vị này, remap xuôi và remap đảo hướng (`remap[newIndex]=o.i` thay
 * vì đúng `remap[o.i]=newIndex`) cho ra hai mảng labels khác nhau, nên đây là
 * fixture duy nhất trong file này có thể bắt được bug đảo hướng remap.
 */
function orangeCyanMagenta(): RgbaImage {
  return bandsOf(OCM_COLORS)
}

/** màu palette gần nhất (khoảng cách Lab, CIE76) với một màu nguồn */
function nearestPaletteColor(palette: Rgb[], source: Rgb): Rgb {
  const target = rgbToLab(source[0], source[1], source[2])
  let best = palette[0]
  let bestD = Infinity
  for (const p of palette) {
    const d = deltaE76(rgbToLab(p[0], p[1], p[2]), target)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/**
 * Với mỗi dải màu của fixture, lấy một pixel thuộc dải đó, tra
 * `palette[labels[idx]]` và khẳng định đó chính là màu palette gần nhất
 * (Lab) với màu nguồn của dải. Đây là thuộc tính thật sự cần đúng: một pixel
 * bị gán nhầm nhãn (ví dụ do remap đảo hướng) sẽ luôn trỏ tới một màu palette
 * không phải màu gần nhất — khác với kiểu test "kênh đỏ trội hơn" trước đây,
 * vốn chỉ tình cờ đúng trên fixture RGB và không phát hiện được bug đảo remap
 * (xem ghi chú permutation ở `threeBands()` phía trên).
 */
function expectLabelsPointToNearestPalette(img: RgbaImage, colors: Rgb[], k: number) {
  const { labels, palette } = quantize(img, k)
  for (let band = 0; band < colors.length; band++) {
    const idx = (band * 3 + 1) * 9 + 4 // hàng giữa của dải, cột giữa
    const chosen = palette[labels[idx]]
    const nearest = nearestPaletteColor(palette, colors[band])
    expect(chosen).toEqual(nearest)
  }
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

  it('labels trỏ đúng màu palette sau khi sắp lại (đỏ/lục/lam — involution, không tự bắt được bug đảo remap)', () => {
    expectLabelsPointToNearestPalette(threeBands(), RGB_COLORS, 3)
  })

  it('labels trỏ đúng màu palette sau khi sắp lại (cam/lục lam/đỏ tươi — 3-cycle, bắt được bug đảo remap)', () => {
    expectLabelsPointToNearestPalette(orangeCyanMagenta(), OCM_COLORS, 3)
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const img = threeBands()
    const a = quantize(img, 5)
    const b = quantize(img, 5)
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
    expect(a.palette).toEqual(b.palette)
  })
})
