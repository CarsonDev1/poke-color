import { describe, expect, it } from 'vitest'
import { applyOp, applyOps, compactField, isDead, type EditOp } from '@/core/editor/edit-ops'
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

const alive = (f: RegionField): number => f.regions.filter((r) => !isDead(r)).length

describe('merge', () => {
  it('gộp hai vùng KỀ nhau: b bị hấp thụ, area cộng dồn', () => {
    const f = field(['ab'])
    const a = f.regionMap[0]
    const b = f.regionMap[1]
    const out = applyOp(f, { kind: 'merge', a, b })

    expect(alive(out)).toBe(1)
    expect(out.regions[a].area).toBe(2)
    expect(isDead(out.regions[b])).toBe(true)
    // mọi pixel giờ thuộc a
    expect(Array.from(out.regionMap)).toEqual([a, a])
  })

  it('b nhận colorIndex của a (a hấp thụ b, không phải ngược lại)', () => {
    const f = field(['ab'])
    const a = f.regionMap[0]
    const b = f.regionMap[1]
    f.regions[a].colorIndex = 3
    f.regions[b].colorIndex = 7
    const out = applyOp(f, { kind: 'merge', a, b })
    expect(out.regions[a].colorIndex).toBe(3)
  })

  it('bbox của a mở rộng để bao cả b', () => {
    const f = field(['aab', 'aab'])
    const a = f.regionMap[0]
    const b = f.regionMap[2]
    const out = applyOp(f, { kind: 'merge', a, b })
    expect(out.regions[a].minX).toBe(0)
    expect(out.regions[a].maxX).toBe(2)
  })

  /** Yêu cầu tường minh của spec §18. */
  it('gộp hai vùng KHÔNG kề ⇒ BỊ TỪ CHỐI kèm lời giải thích', () => {
    const f = field(['aba'])
    // hai vùng 'a' bị 'b' chia đôi ⇒ là hai component riêng, không kề nhau
    const left = f.regionMap[0]
    const right = f.regionMap[2]
    expect(left).not.toBe(right)
    expect(() => applyOp(f, { kind: 'merge', a: left, b: right })).toThrow(/không kề nhau/)
  })

  it('gộp vùng với chính nó ⇒ từ chối', () => {
    const f = field(['ab'])
    expect(() => applyOp(f, { kind: 'merge', a: 0, b: 0 })).toThrow(/chính nó/)
  })

  it('gộp vùng không tồn tại ⇒ từ chối', () => {
    const f = field(['ab'])
    expect(() => applyOp(f, { kind: 'merge', a: 0, b: 99 })).toThrow(/không tồn tại/)
  })

  it('gộp vùng đã chết ⇒ từ chối, không âm thầm bỏ qua', () => {
    const f = field(['abc'])
    const once = applyOp(f, { kind: 'merge', a: 0, b: 1 })
    expect(() => applyOp(once, { kind: 'merge', a: 1, b: 2 })).toThrow(/đã bị gộp/)
  })

  it('KHÔNG sửa field đầu vào', () => {
    const f = field(['ab'])
    const before = Array.from(f.regionMap)
    applyOp(f, { kind: 'merge', a: f.regionMap[0], b: f.regionMap[1] })
    expect(Array.from(f.regionMap)).toEqual(before)
  })
})

describe('color', () => {
  it('đổi colorIndex của một vùng', () => {
    const f = field(['ab'])
    const out = applyOp(f, { kind: 'color', region: 0, colorIndex: 5 })
    expect(out.regions[0].colorIndex).toBe(5)
  })

  it('không đổi vùng khác', () => {
    const f = field(['ab'])
    const before = f.regions[1].colorIndex
    const out = applyOp(f, { kind: 'color', region: 0, colorIndex: 5 })
    expect(out.regions[1].colorIndex).toBe(before)
  })

  it('vùng không tồn tại ⇒ từ chối', () => {
    const f = field(['ab'])
    expect(() => applyOp(f, { kind: 'color', region: 99, colorIndex: 1 })).toThrow(/không tồn tại/)
  })

  it('colorIndex âm ⇒ từ chối', () => {
    const f = field(['ab'])
    expect(() => applyOp(f, { kind: 'color', region: 0, colorIndex: -1 })).toThrow(/không hợp lệ/)
  })
})

describe('mergeSmall', () => {
  it('gộp mọi vùng nhỏ hơn ngưỡng', () => {
    const f = field(['aaaab', 'aaaac'])
    const before = alive(f)
    const out = applyOp(f, { kind: 'mergeSmall', minArea: 2 })
    expect(alive(out)).toBeLessThan(before)
  })

  it('vùng đủ lớn KHÔNG bị gộp', () => {
    const f = field(['aabb', 'aabb'])
    const out = applyOp(f, { kind: 'mergeSmall', minArea: 2 })
    expect(alive(out)).toBe(2)
  })

  it('ngưỡng 0 ⇒ không gộp gì', () => {
    const f = field(['abc'])
    const out = applyOp(f, { kind: 'mergeSmall', minArea: 0 })
    expect(alive(out)).toBe(alive(f))
  })

  it('không nối chuỗi: tổng area được bảo toàn', () => {
    const f = field(['abcde', 'abcde'])
    const totalBefore = f.regions.reduce((n, r) => n + r.area, 0)
    const out = applyOp(f, { kind: 'mergeSmall', minArea: 3 })
    const totalAfter = out.regions.reduce((n, r) => n + r.area, 0)
    expect(totalAfter).toBe(totalBefore)
  })
})

describe('applyOps + undo (chạy lại từ gốc)', () => {
  /**
   * Yêu cầu tường minh của spec §18: "gộp rồi undo → regionMap trở về
   * byte-identical". Đạt được bằng cách CHẠY LẠI từ gốc với ít thao tác hơn,
   * không phải bằng nghịch đảo từng thao tác — nghịch đảo `mergeSmall` là bất
   * khả vì không biết nó đã gộp những gì.
   */
  it('gộp rồi undo ⇒ regionMap BYTE-IDENTICAL với gốc', () => {
    const base = field(['abc', 'abc'])
    const ops: EditOp[] = [{ kind: 'merge', a: 0, b: 1 }]

    const after = applyOps(base, ops)
    expect(Array.from(after.regionMap)).not.toEqual(Array.from(base.regionMap))

    const undone = applyOps(base, ops.slice(0, 0))
    expect(Array.from(undone.regionMap)).toEqual(Array.from(base.regionMap))
    expect(undone.regions.map((r) => r.area)).toEqual(base.regions.map((r) => r.area))
  })

  it('undo một trong ba thao tác cho đúng trạng thái sau hai thao tác', () => {
    const base = field(['abcd', 'abcd'])
    const ops: EditOp[] = [
      { kind: 'merge', a: 0, b: 1 },
      { kind: 'color', region: 2, colorIndex: 9 },
      { kind: 'merge', a: 2, b: 3 },
    ]
    const twoOps = applyOps(base, ops.slice(0, 2))
    const threeThenUndo = applyOps(base, ops.slice(0, 2))
    expect(Array.from(threeThenUndo.regionMap)).toEqual(Array.from(twoOps.regionMap))
  })

  it('id vùng KHÔNG bị nén giữa các thao tác — op sau vẫn trỏ đúng vùng', () => {
    const base = field(['abcd'])
    // gộp 0+1 rồi đổi màu vùng 3. Nếu id bị nén sau lần gộp, "3" sẽ trỏ sai.
    const out = applyOps(base, [
      { kind: 'merge', a: 0, b: 1 },
      { kind: 'color', region: 3, colorIndex: 7 },
    ])
    expect(out.regions[3].colorIndex).toBe(7)
  })

  it('deterministic: cùng ops cho cùng kết quả', () => {
    const base = field(['abcd', 'abcd'])
    const ops: EditOp[] = [{ kind: 'mergeSmall', minArea: 3 }]
    expect(JSON.stringify(applyOps(base, ops))).toBe(JSON.stringify(applyOps(base, ops)))
  })
})

describe('compactField', () => {
  it('bỏ vùng chết và nén id liên tục 0..n-1', () => {
    const f = applyOp(field(['abc']), { kind: 'merge', a: 0, b: 1 })
    const c = compactField(f)
    expect(c.regions.map((r) => r.id)).toEqual([0, 1])
    expect(c.regions.every((r) => !isDead(r))).toBe(true)
  })

  it('regionMap trỏ đúng id mới', () => {
    const f = applyOp(field(['abc']), { kind: 'merge', a: 0, b: 1 })
    const c = compactField(f)
    for (const v of Array.from(c.regionMap)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(c.regions.length)
    }
  })

  it('tổng area được bảo toàn qua nén', () => {
    const f = applyOp(field(['abcd', 'abcd']), { kind: 'mergeSmall', minArea: 3 })
    const before = f.regions.reduce((n, r) => n + r.area, 0)
    const c = compactField(f)
    expect(c.regions.reduce((n, r) => n + r.area, 0)).toBe(before)
  })

  it('không có vùng chết ⇒ giữ nguyên số vùng', () => {
    const f = field(['abc'])
    expect(compactField(f).regions).toHaveLength(f.regions.length)
  })
})
