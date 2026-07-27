import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'

/** dựng labels từ chuỗi ký tự cho dễ đọc; mỗi ký tự là một colorIndex */
function fromRows(rows: string[]): { labels: Uint8Array; width: number; height: number } {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    expect(row.length).toBe(width)
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return { labels, width, height }
}

describe('labelRegions', () => {
  it('3 khối phẳng → 3 vùng, diện tích và bbox chính xác', () => {
    const { labels, width, height } = fromRows([
      'aaabbb',
      'aaabbb',
      'cccccc',
      'cccccc',
    ])
    const f = labelRegions(labels, width, height)

    expect(f.regions).toHaveLength(3)
    expect(f.regions.map((r) => r.area).sort((a, b) => a - b)).toEqual([6, 6, 12])

    const byArea = [...f.regions].sort((a, b) => b.area - a.area)
    expect(byArea[0]).toMatchObject({ area: 12, minX: 0, maxX: 5, minY: 2, maxY: 3 })
  })

  it('id vùng liên tục từ 0', () => {
    const { labels, width, height } = fromRows(['ab', 'ba'])
    const f = labelRegions(labels, width, height)
    expect(f.regions.map((r) => r.id)).toEqual([0, 1, 2, 3])
  })

  it('4-hướng: hai khối chỉ chạm nhau ở góc là HAI vùng', () => {
    const { labels, width, height } = fromRows([
      'aab',
      'aab',
      'bba',
      'bba',
    ])
    const f = labelRegions(labels, width, height)
    // 'a' xuất hiện ở góc trên-trái và góc dưới-phải, chỉ chạm chéo
    const aRegions = f.regions.filter((r) => r.colorIndex === 0)
    expect(aRegions).toHaveLength(2)
  })

  it('colorIndex của vùng khớp label gốc', () => {
    const labels = new Uint8Array([0, 0, 5, 5])
    const f = labelRegions(labels, 4, 1)
    expect(f.regions.map((r) => r.colorIndex)).toEqual([0, 5])
  })

  it('bất biến: mọi pixel thuộc đúng 1 vùng và tổng diện tích = w*h', () => {
    const { labels, width, height } = fromRows([
      'aabbcc',
      'aabbcc',
      'ddaacc',
      'ddaabb',
    ])
    const f = labelRegions(labels, width, height)

    expect(f.regionMap).toHaveLength(width * height)
    const total = f.regions.reduce((s, r) => s + r.area, 0)
    expect(total).toBe(width * height)

    const counted = new Uint32Array(f.regions.length)
    for (const id of f.regionMap) counted[id]++
    expect(Array.from(counted)).toEqual(f.regions.map((r) => r.area))
  })

  it('vùng nền lớn không tràn stack', () => {
    const w = 600
    const h = 600
    const labels = new Uint8Array(w * h) // toàn bộ cùng màu
    const f = labelRegions(labels, w, h)
    expect(f.regions).toHaveLength(1)
    expect(f.regions[0].area).toBe(w * h)
  })

  it('anchor chưa tính ⇒ -1 và hasLabel false', () => {
    const f = labelRegions(new Uint8Array([0]), 1, 1)
    expect(f.regions[0]).toMatchObject({ anchorX: -1, anchorY: -1, anchorR: -1, hasLabel: false })
  })
})
