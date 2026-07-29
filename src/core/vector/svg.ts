import type { Rgb } from '@/core/types'
import type { Pt } from '@/core/vector/crack-graph'
import type { RegionRings } from '@/core/vector/rings'

export interface LabelPos {
  x: number
  y: number
  text: string
}

export interface SvgOptions {
  width: number
  height: number
  palette: readonly Rgb[]
  /** vùng nào mang màu nào — chỉ cần cho bản giải */
  colorOfRegion: readonly number[]
  /** true = bản giải (fill màu, không stroke); false = bản để tô (stroke + số) */
  solution: boolean
  /** cỡ chữ nhãn, đơn vị user-unit của SVG */
  fontSize?: number
}

const STROKE_WIDTH = 0.6 // spec §7 mục 7

function hex(c: Rgb): string {
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`
}

/**
 * Escape cho nội dung text trong XML.
 *
 * Nhãn hiện chỉ gồm chữ-số nên chưa cần, nhưng để trần thì một ngày nào đó tiêu
 * đề puzzle do người dùng nhập sẽ được nhét vào SVG và một dấu `&` làm cả file
 * không parse được.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** làm tròn 2 chữ số để file nhỏ lại; 0.01px không ai thấy được khi in */
function n(v: number): string {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

function ringToPath(ring: Pt[]): string {
  if (ring.length === 0) return ''
  let d = `M${n(ring[0].x)} ${n(ring[0].y)}`
  for (let i = 1; i < ring.length - 1; i++) {
    d += `L${n(ring[i].x)} ${n(ring[i].y)}`
  }
  // ring khép kín: dùng Z thay vì lặp lại điểm đầu — ngắn hơn và cho renderer
  // nối mối đúng cách (miter join), lặp điểm sẽ để lại đầu nét hơi tù
  return `${d}Z`
}

export function toSvg(rings: RegionRings[], labels: LabelPos[], o: SvgOptions): string {
  const fontSize = o.fontSize ?? 3
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o.width} ${o.height}" width="${o.width}" height="${o.height}">`,
  ]

  if (o.solution) {
    // nền trắng để in ra không bị trong suốt thành đen trên một số máy in
    parts.push(`<rect width="${o.width}" height="${o.height}" fill="#fff"/>`)
  }

  for (const r of rings) {
    if (r.rings.length === 0) continue
    const d = r.rings.map(ringToPath).join('')

    if (o.solution) {
      const ci = o.colorOfRegion[r.regionId] ?? 0
      const col = o.palette[ci] ?? ([255, 255, 255] as unknown as Rgb)
      // evenodd: vùng có lỗ thì subpath trong bị khoét ra, và không cần quan
      // tâm chiều xoay của ring
      parts.push(`<path d="${d}" fill="${hex(col)}" fill-rule="evenodd"/>`)
    } else {
      parts.push(
        `<path d="${d}" fill="none" stroke="#000" stroke-width="${STROKE_WIDTH}" fill-rule="evenodd"/>`,
      )
    }
  }

  if (!o.solution) {
    parts.push(
      `<g font-family="sans-serif" font-size="${fontSize}" text-anchor="middle" fill="#4b5563">`,
    )
    for (const l of labels) {
      // dominant-baseline central để số nằm giữa vùng theo chiều dọc; thiếu nó
      // thì baseline nằm ở chân chữ và số bị lệch lên trên
      parts.push(
        `<text x="${n(l.x)}" y="${n(l.y)}" dominant-baseline="central">${esc(l.text)}</text>`,
      )
    }
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('')
}
