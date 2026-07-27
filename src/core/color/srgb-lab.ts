import type { Lab, Rgb } from '@/core/types'

// Điểm trắng D65
const XN = 95.047
const YN = 100.0
const ZN = 108.883

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, Math.round(s * 255)))
}

function fLab(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function fLabInv(t: number): number {
  const t3 = t * t * t
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = srgbToLinear(r) * 100
  const gl = srgbToLinear(g) * 100
  const bl = srgbToLinear(b) * 100

  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / XN
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / YN
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / ZN

  const fx = fLab(x)
  const fy = fLab(y)
  const fz = fLab(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb(L: number, a: number, bb: number): Rgb {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - bb / 200

  const x = (fLabInv(fx) * XN) / 100
  const y = (fLabInv(fy) * YN) / 100
  const z = (fLabInv(fz) * ZN) / 100

  const rl = x * 3.2406 + y * -1.5372 + z * -0.4986
  const gl = x * -0.9689 + y * 1.8758 + z * 0.0415
  const bl = x * 0.0557 + y * -0.204 + z * 1.057

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)]
}

/** Chuyển cả ảnh RGBA sang Lab phẳng [L,a,b, L,a,b, ...]. Bỏ qua alpha. */
export function rgbaToLabArray(data: Uint8ClampedArray): Float32Array {
  const n = data.length / 4
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [L, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = b
  }
  return out
}
