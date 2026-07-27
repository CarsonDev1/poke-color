import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { mergeSmallRegions } from '@/core/regions/merge-small'
import type { RegionField, Rgb } from '@/core/types'

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

/** palette cách xa nhau để deltaE không kích hoạt gộp ngoài ý muốn */
const FAR: Rgb[] = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
]

describe('mergeSmallRegions', () => {
  it('đốm 1 pixel bị hấp thụ vào láng giềng biên dài nhất', () => {
    const f = field([
      'abb',
      'axb',
      'abb',
    ])
    const bId = f.regionMap[1] // vùng 'b'
    const bColor = f.regions[bId].colorIndex

    const out = mergeSmallRegions(f, FAR, 2, 0)

    // pixel giữa giờ mang màu của 'b'
    const centerRegion = out.regions[out.regionMap[1 * 3 + 1]]
    expect(centerRegion.colorIndex).toBe(bColor)
  })

  it('bất biến: sau khi gộp không còn vùng nào nhỏ hơn minArea', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
      'ccccdddd',
      'ccpcddqd',
      'ccccdddd',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    for (const r of out.regions) {
      expect(r.area).toBeGreaterThanOrEqual(4)
    }
  })

  it('bất biến: tổng diện tích được bảo toàn', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    const total = out.regions.reduce((s, r) => s + r.area, 0)
    expect(total).toBe(8 * 3)
  })

  it('bất biến: id được nén liên tục 0..n-1 và regionMap chỉ chứa id hợp lệ', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)

    expect(out.regions.map((r) => r.id)).toEqual(out.regions.map((_, i) => i))
    for (const id of out.regionMap) {
      expect(id).toBeLessThan(out.regions.length)
    }

    const counted = new Uint32Array(out.regions.length)
    for (const id of out.regionMap) counted[id]++
    expect(Array.from(counted)).toEqual(out.regions.map((r) => r.area))
  })

  it('vùng đủ lớn không bị gộp', () => {
    const f = field([
      'aaaabbbb',
      'aaaabbbb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    expect(out.regions).toHaveLength(2)
  })

  it('gộp cặp kề nhau khi màu quá gần theo deltaE', () => {
    const near: Rgb[] = [
      [100, 100, 100],
      [102, 101, 100], // gần như trùng
      [0, 200, 0],
    ]
    const f = field([
      'aabbcc',
      'aabbcc',
      'aabbcc',
    ])
    const out = mergeSmallRegions(f, near, 1, 6)
    // 'a' và 'b' nhập lại thành 1 ⇒ còn 2 vùng
    expect(out.regions).toHaveLength(2)
  })

  it('không gộp theo màu khi mergeDeltaE = 0', () => {
    const near: Rgb[] = [
      [100, 100, 100],
      [102, 101, 100],
      [0, 200, 0],
    ]
    const f = field([
      'aabbcc',
      'aabbcc',
      'aabbcc',
    ])
    const out = mergeSmallRegions(f, near, 1, 0)
    expect(out.regions).toHaveLength(3)
  })

  it('force-merge: vùng nhỏ chỉ kề vùng nhỏ vẫn được xử lý', () => {
    // toàn bộ ảnh là các đốm nhỏ xen kẽ, minArea rất lớn
    const f = field([
      'ababab',
      'bababa',
      'ababab',
    ])
    const out = mergeSmallRegions(f, FAR, 100, 0)
    // không thể còn nhiều vùng nhỏ; kết thúc bằng 1 vùng duy nhất
    expect(out.regions).toHaveLength(1)
    expect(out.regions[0].area).toBe(18)
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
      'ccccdddd',
    ])
    const a = mergeSmallRegions(f, FAR, 4, 0)
    const b = mergeSmallRegions(f, FAR, 4, 0)
    expect(Array.from(a.regionMap)).toEqual(Array.from(b.regionMap))
    expect(a.regions).toEqual(b.regions)
  })

  it('không sửa field input', () => {
    const f = field(['aaxa', 'aaaa'])
    const before = Array.from(f.regionMap)
    mergeSmallRegions(f, FAR, 3, 0)
    expect(Array.from(f.regionMap)).toEqual(before)
  })
})
