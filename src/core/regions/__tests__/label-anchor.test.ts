import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { computeAnchors } from '@/core/regions/label-anchor'
import type { RegionField } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

describe('computeAnchors', () => {
  it('hình vuông đặc: anchor ở tâm, bán kính ≈ nửa cạnh', () => {
    const rows = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 11 }, (_, x) =>
        x >= 1 && x <= 9 && y >= 1 && y <= 9 ? 'a' : 'b',
      ).join(''),
    )
    const out = computeAnchors(field(rows), 3)
    const aId = out.regionMap[5 * 11 + 5]
    const a = out.regions[aId]

    expect(a.anchorX).toBe(5)
    expect(a.anchorY).toBe(5)
    expect(a.anchorR).toBeCloseTo(5, 0)
    expect(a.hasLabel).toBe(true)
  })

  it('BẪY CENTROID: hình chữ C — anchor phải nằm TRONG vùng', () => {
    // 'a' là hình chữ C mở về bên phải; centroid của nó rơi vào lỗ 'b'
    const rows = [
      'aaaaaaa',
      'aaaaaaa',
      'aabbbbb',
      'aabbbbb',
      'aabbbbb',
      'aaaaaaa',
      'aaaaaaa',
    ]
    const f = field(rows)
    const out = computeAnchors(f, 1)

    for (const r of out.regions) {
      const idAtAnchor = out.regionMap[r.anchorY * 7 + r.anchorX]
      expect(idAtAnchor).toBe(r.id)
    }
  })

  it('bất biến: anchor của MỌI vùng luôn nằm trong vùng đó', () => {
    const rows = [
      'aabbccdd',
      'abbccdda',
      'bbccddaa',
      'bccddaab',
      'ccddaabb',
      'cddaabbc',
    ]
    const out = computeAnchors(field(rows), 1)
    for (const r of out.regions) {
      const id = out.regionMap[r.anchorY * 8 + r.anchorX]
      expect(id).toBe(r.id)
    }
  })

  it('vùng mỏng 1px → hasLabel false', () => {
    const rows = [
      'bbbbb',
      'aaaaa',
      'bbbbb',
    ]
    const out = computeAnchors(field(rows), 7)
    const aId = out.regionMap[1 * 5 + 2]
    expect(out.regions[aId].hasLabel).toBe(false)
    expect(out.regions[aId].anchorR).toBeLessThan(7)
  })

  it('hasLabel = anchorR >= minLabelRadius', () => {
    const rows = Array.from({ length: 21 }, (_, y) =>
      Array.from({ length: 21 }, (_, x) =>
        x >= 1 && x <= 19 && y >= 1 && y <= 19 ? 'a' : 'b',
      ).join(''),
    )
    const big = computeAnchors(field(rows), 7)
    const aId = big.regionMap[10 * 21 + 10]
    expect(big.regions[aId].anchorR).toBeGreaterThanOrEqual(7)
    expect(big.regions[aId].hasLabel).toBe(true)

    const strict = computeAnchors(field(rows), 100)
    expect(strict.regions[aId].hasLabel).toBe(false)
  })

  it('deterministic và không sửa field input', () => {
    const f = field(['aab', 'abb', 'bba'])
    const before = f.regions.map((r) => ({ ...r }))
    const a = computeAnchors(f, 2)
    const b = computeAnchors(f, 2)
    expect(a.regions).toEqual(b.regions)
    expect(f.regions).toEqual(before)
  })
})
