import { describe, expect, it } from 'vitest'
import { buildAdjacency, longestNeighbor, longestNeighborWhere } from '@/core/regions/adjacency'
import { labelRegions } from '@/core/regions/connected-components'
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

describe('buildAdjacency', () => {
  it('hai hình chữ nhật kề nhau: độ dài biên chung = số cạnh pixel', () => {
    // 8 dòng, cắt dọc ở x=3 ⇒ biên chung dài 8
    const f = field(Array.from({ length: 8 }, () => 'aaabbb'))
    const adj = buildAdjacency(f)
    expect(adj.get(0)!.get(1)).toBe(8)
    expect(adj.get(1)!.get(0)).toBe(8)
  })

  it('vùng không kề nhau thì không có trong bảng', () => {
    const f = field([
      'abc',
      'abc',
    ])
    const adj = buildAdjacency(f)
    // a và c cách nhau bởi b
    expect(adj.get(0)!.has(2)).toBe(false)
  })

  it('chỉ tính kề 4-hướng, không tính chạm chéo', () => {
    const f = field([
      'ab',
      'ba',
    ])
    const adj = buildAdjacency(f)
    const aTopLeft = f.regionMap[0]
    const aBottomRight = f.regionMap[3]
    expect(aTopLeft).not.toBe(aBottomRight)
    expect(adj.get(aTopLeft)?.has(aBottomRight) ?? false).toBe(false)
  })

  it('không tự kề chính mình', () => {
    const f = field(['aaa', 'aaa'])
    const adj = buildAdjacency(f)
    expect(adj.get(0)?.has(0) ?? false).toBe(false)
  })
})

describe('longestNeighbor', () => {
  it('chọn láng giềng có biên chung dài nhất, không phải cái gặp trước', () => {
    // 'x' là đốm 1 pixel: kề 'a' 1 cạnh (bên trái), kề 'b' 3 cạnh (trên/dưới/phải)
    const f = field([
      'abb',
      'axb',
      'abb',
    ])
    const adj = buildAdjacency(f)
    const xId = f.regionMap[1 * 3 + 1]
    const aId = f.regionMap[0]
    const bId = f.regionMap[1]

    expect(adj.get(xId)!.get(aId)).toBe(1)
    expect(adj.get(xId)!.get(bId)).toBe(3)
    expect(longestNeighbor(adj, xId)).toBe(bId)
  })

  it('tie thì chọn id nhỏ hơn (deterministic)', () => {
    // cả hai chỉ kề nhau nên không có tie thật; kiểm tra bằng bảng dựng tay
    const manual = new Map([[9, new Map([[3, 5], [7, 5]])]])
    expect(longestNeighbor(manual, 9)).toBe(3)
  })

  it('tie thật từ buildAdjacency: láng giềng id cao hơn được chèn vào Map trước vẫn thua', () => {
    // p (id thấp) chỉ chạm x ở 2 hàng dưới (quét sau);
    // q (id cao hơn) chạm x ở hàng trên, được quét — và chèn vào Map của x — TRƯỚC p.
    // Biên chung dài bằng nhau (2 cạnh mỗi bên): nếu tie-break phụ thuộc thứ tự
    // chèn Map (vd "gặp trước thắng") thì q sẽ thắng sai; đúng ra id thấp hơn (p) phải thắng.
    const f = field([
      'pqq',
      'pxx',
      'pxx',
    ])
    const adj = buildAdjacency(f)
    const pId = f.regionMap[0]
    const qId = f.regionMap[1]
    const xId = f.regionMap[4]

    expect(pId).toBeLessThan(qId)
    expect(adj.get(xId)!.get(pId)).toBe(2)
    expect(adj.get(xId)!.get(qId)).toBe(2)
    expect(longestNeighbor(adj, xId)).toBe(pId)
  })

  it('vùng không có láng giềng → null', () => {
    const f = field(['aa', 'aa'])
    const adj = buildAdjacency(f)
    expect(longestNeighbor(adj, 0)).toBeNull()
  })
})

describe('longestNeighborWhere', () => {
  /**
   * x kề: b (biên 4, dài nhất) và a (biên 2). Nếu loại b thì phải chọn a —
   * KHÔNG phải trả null, và không phải bỏ qua điều kiện để lấy lại b.
   */
  const f = (): RegionField =>
    field([
      'aabb',
      'xxbb',
      'xxbb',
    ])

  it('không lọc gì ⇒ giống longestNeighbor', () => {
    const ff = f()
    const adj = buildAdjacency(ff)
    const xId = ff.regionMap[1 * 4]
    expect(longestNeighborWhere(adj, xId, () => true)).toBe(longestNeighbor(adj, xId))
  })

  it('loại láng giềng dài nhất ⇒ lấy cái dài thứ hai, không trả null', () => {
    const ff = f()
    const adj = buildAdjacency(ff)
    const xId = ff.regionMap[1 * 4]
    const aId = ff.regionMap[0]
    const bId = ff.regionMap[2]

    expect(longestNeighborWhere(adj, xId, (o) => o !== bId)).toBe(aId)
  })

  it('loại hết ⇒ null, để bên gọi hoãn sang lượt sau', () => {
    const ff = f()
    const adj = buildAdjacency(ff)
    const xId = ff.regionMap[1 * 4]
    expect(longestNeighborWhere(adj, xId, () => false)).toBeNull()
  })
})
