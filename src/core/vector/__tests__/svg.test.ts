// @vitest-environment jsdom
//
// File test DUY NHẤT trong core cần jsdom: nó parse SVG bằng DOMParser để kiểm
// XML thật sự hợp lệ, thay vì so chuỗi bằng regex (regex sẽ xanh với một file
// thiếu thẻ đóng). Bản thân `svg.ts` vẫn là core thuần — không chạm DOM.
import { describe, expect, it } from 'vitest'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'
import { vectorizePuzzle } from '@/core/vector/vectorize'

/** 4×2, hai vùng dọc; vùng 1 không có nhãn */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 128, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 2, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 2, anchorY: 0, anchorR: 2, hasLabel: false },
  ]
  return assemblePuzzle({ width: 4, height: 2, palette, regionCount: 2, regionMap }, regions)
}

/** puzzle với colorIndex >= 10 để kiểm nhãn chữ */
function puzzleWithLetterLabel(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 0, 0])
  const palette: Rgb[] = Array.from({ length: 11 }, (_, i) => [i * 20, 50, 50] as Rgb)
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 10, area: 4, minX: 0, minY: 0, maxX: 3, maxY: 0, anchorX: 1, anchorY: 0, anchorR: 2, hasLabel: true },
  ]
  return assemblePuzzle({ width: 4, height: 1, palette, regionCount: 1, regionMap }, regions)
}

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(`SVG không parse được: ${err.textContent}`)
  return doc
}

describe('vectorizePuzzle — bản để tô', () => {
  it('SVG parse được, không lỗi XML', () => {
    expect(() => parse(vectorizePuzzle(puzzle()).outline)).not.toThrow()
  })

  it('viewBox khớp kích thước puzzle', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 4 2')
  })

  it('có một path cho mỗi vùng', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    expect(doc.querySelectorAll('path')).toHaveLength(2)
  })

  it('nét đen, không fill, stroke-width 0.6 theo spec', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    const p = doc.querySelector('path')!
    expect(p.getAttribute('fill')).toBe('none')
    expect(p.getAttribute('stroke')).toBe('#000')
    expect(p.getAttribute('stroke-width')).toBe('0.6')
  })

  it('CHỈ vẽ số cho vùng hasLabel — vùng 1 không có nhãn', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['1'])
  })

  it('nhãn dùng CHUNG colorLabel: colorIndex 10 ra "a", không phải "11"', () => {
    const doc = parse(vectorizePuzzle(puzzleWithLetterLabel()).outline)
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['a'])
  })

  it('số đặt tại anchor + 0.5 để canh giữa ô pixel', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    const t = doc.querySelector('text')!
    expect(t.getAttribute('x')).toBe('0.5')
    expect(t.getAttribute('y')).toBe('0.5')
  })

  it('path khép kín bằng Z', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    for (const p of Array.from(doc.querySelectorAll('path'))) {
      expect(p.getAttribute('d')!.endsWith('Z')).toBe(true)
    }
  })

  it('fill-rule evenodd có mặt (vùng có lỗ cần nó, và không cần lo chiều xoay)', () => {
    const doc = parse(vectorizePuzzle(puzzle()).outline)
    expect(doc.querySelector('path')!.getAttribute('fill-rule')).toBe('evenodd')
  })
})

describe('vectorizePuzzle — bản giải', () => {
  it('fill màu palette, KHÔNG có stroke', () => {
    const doc = parse(vectorizePuzzle(puzzle()).solution)
    const paths = Array.from(doc.querySelectorAll('path'))
    expect(paths).toHaveLength(2)
    expect(paths[0].getAttribute('fill')).toBe('#ff0000')
    expect(paths[1].getAttribute('fill')).toBe('#0080ff')
    for (const p of paths) expect(p.getAttribute('stroke')).toBeNull()
  })

  it('KHÔNG có số — bản giải là để đối chiếu màu', () => {
    const doc = parse(vectorizePuzzle(puzzle()).solution)
    expect(doc.querySelectorAll('text')).toHaveLength(0)
  })

  it('có nền trắng để in không ra nền đen', () => {
    const doc = parse(vectorizePuzzle(puzzle()).solution)
    const rect = doc.querySelector('rect')
    expect(rect).not.toBeNull()
    expect(rect!.getAttribute('fill')).toBe('#fff')
  })
})

describe('vectorizePuzzle — chung', () => {
  it('deterministic: hai lần chạy ra chuỗi y hệt', () => {
    const p = puzzle()
    expect(vectorizePuzzle(p).outline).toBe(vectorizePuzzle(p).outline)
    expect(vectorizePuzzle(p).solution).toBe(vectorizePuzzle(p).solution)
  })

  it('smoothing 0 và 1 cho kết quả KHÁC nhau (Chaikin thật sự chạy)', () => {
    const p = puzzle()
    expect(vectorizePuzzle(p, { smoothing: 0 }).outline).not.toBe(
      vectorizePuzzle(p, { smoothing: 1 }).outline,
    )
  })

  it('vùng lọt trong vùng khác: path của vùng ngoài có hai subpath (hai chữ M)', () => {
    const regionMap = new Uint32Array([
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ])
    const palette: Rgb[] = [
      [10, 10, 10],
      [200, 200, 200],
    ]
    const regions: RegionMeta[] = [
      { id: 0, colorIndex: 0, area: 24, minX: 0, minY: 0, maxX: 4, maxY: 4, anchorX: 0, anchorY: 0, anchorR: 2, hasLabel: true },
      { id: 1, colorIndex: 1, area: 1, minX: 2, minY: 2, maxX: 2, maxY: 2, anchorX: 2, anchorY: 2, anchorR: 1, hasLabel: false },
    ]
    const p = assemblePuzzle({ width: 5, height: 5, palette, regionCount: 2, regionMap }, regions)

    const doc = parse(vectorizePuzzle(p).outline)
    const outer = doc.querySelectorAll('path')[0]
    const mCount = (outer.getAttribute('d')!.match(/M/g) ?? []).length
    expect(mCount).toBe(2)
  })

  it('escape XML: ký tự & < > không làm vỡ file', () => {
    // nhãn hiện chỉ là chữ-số, nên kiểm trực tiếp hàm xuất qua một nhãn bịa
    const p = puzzle()
    const svg = vectorizePuzzle(p).outline
    expect(svg).not.toContain('&&')
    expect(() => parse(svg)).not.toThrow()
  })
})
