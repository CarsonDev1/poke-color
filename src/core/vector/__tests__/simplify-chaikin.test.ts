import { describe, expect, it } from 'vitest'
import { chaikin } from '@/core/vector/chaikin'
import type { Pt } from '@/core/vector/crack-graph'
import { simplifyChain } from '@/core/vector/simplify'

const pt = (x: number, y: number): Pt => ({ x, y })

describe('simplifyChain', () => {
  it('đường thẳng 10 điểm ⇒ còn đúng 2', () => {
    const line = Array.from({ length: 10 }, (_, i) => pt(i, 0))
    expect(simplifyChain(line, 0.75)).toEqual([pt(0, 0), pt(9, 0)])
  })

  it('zigzag ±1px bị làm phẳng đáng kể', () => {
    const zig = Array.from({ length: 21 }, (_, i) => pt(i, i % 2 === 0 ? 0 : 1))
    const out = simplifyChain(zig, 0.75)
    expect(out.length).toBeLessThan(zig.length)
  })

  /** Mất hai đầu là hở kẽ ngay tại điểm nối giữa các chain. */
  it('hai đầu KHÔNG BAO GIỜ bị bỏ, kể cả epsilon rất lớn', () => {
    const pts = [pt(0, 0), pt(3, 9), pt(6, 1), pt(9, 7)]
    const out = simplifyChain(pts, 1000)
    expect(out[0]).toEqual(pt(0, 0))
    expect(out[out.length - 1]).toEqual(pt(9, 7))
    expect(out).toHaveLength(2)
  })

  it('epsilon = 0 ⇒ trả nguyên, không đơn giản hoá gì', () => {
    const pts = [pt(0, 0), pt(1, 1), pt(2, 0)]
    expect(simplifyChain(pts, 0)).toEqual(pts)
  })

  it('ít hơn 3 điểm ⇒ trả nguyên', () => {
    expect(simplifyChain([pt(0, 0), pt(1, 1)], 0.75)).toHaveLength(2)
    expect(simplifyChain([pt(0, 0)], 0.75)).toHaveLength(1)
  })

  it('điểm lệch xa hơn epsilon thì được GIỮ (không làm phẳng quá tay)', () => {
    const pts = [pt(0, 0), pt(5, 5), pt(10, 0)]
    const out = simplifyChain(pts, 0.75)
    expect(out).toHaveLength(3)
  })

  it('chain khép kín vẫn khép kín sau khi đơn giản hoá', () => {
    const ring = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4), pt(0, 0)]
    const out = simplifyChain(ring, 0.75)
    expect(out[0]).toEqual(out[out.length - 1])
  })

  it('không sửa mảng đầu vào', () => {
    const pts = [pt(0, 0), pt(1, 5), pt(2, 0)]
    const before = JSON.stringify(pts)
    simplifyChain(pts, 0.75)
    expect(JSON.stringify(pts)).toBe(before)
  })

  it('deterministic', () => {
    const pts = Array.from({ length: 50 }, (_, i) => pt(i, (i * 7) % 5))
    expect(simplifyChain(pts, 0.75)).toEqual(simplifyChain(pts, 0.75))
  })

  it('chain dài 5000 điểm không tràn stack (không đệ quy)', () => {
    const long = Array.from({ length: 5000 }, (_, i) => pt(i, i % 2))
    expect(() => simplifyChain(long, 0.75)).not.toThrow()
  })
})

describe('chaikin', () => {
  it('iterations = 0 ⇒ trả nguyên', () => {
    const pts = [pt(0, 0), pt(1, 1), pt(2, 0)]
    expect(chaikin(pts, 0)).toEqual(pts)
  })

  it('ít hơn 3 điểm ⇒ trả nguyên', () => {
    expect(chaikin([pt(0, 0), pt(1, 1)], 2)).toHaveLength(2)
  })

  it('chain hở: hai đầu bất biến', () => {
    const pts = [pt(0, 0), pt(5, 5), pt(10, 0)]
    const out = chaikin(pts, 2)
    expect(out[0]).toEqual(pt(0, 0))
    expect(out[out.length - 1]).toEqual(pt(10, 0))
  })

  it('một lượt trên 3 điểm cho 4 điểm giữa cộng 2 đầu', () => {
    const out = chaikin([pt(0, 0), pt(4, 0), pt(4, 4)], 1)
    expect(out).toHaveLength(6)
  })

  it('làm mềm thật: điểm giữa bị kéo về phía trong góc', () => {
    const out = chaikin([pt(0, 0), pt(10, 0), pt(10, 10)], 1)
    // không còn điểm nào trùng đúng góc nhọn (10, 0)
    expect(out.some((p) => p.x === 10 && p.y === 0)).toBe(false)
  })

  /** Chaikin là nội suy nên điểm mới phải nằm trong bao của đầu vào. */
  it('không "phình" ra ngoài hộp bao của đầu vào', () => {
    const pts = [pt(0, 0), pt(10, 3), pt(4, 9), pt(1, 2)]
    const out = chaikin(pts, 2)
    const minX = Math.min(...pts.map((p) => p.x))
    const maxX = Math.max(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y))
    const maxY = Math.max(...pts.map((p) => p.y))
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(minX)
      expect(p.x).toBeLessThanOrEqual(maxX)
      expect(p.y).toBeGreaterThanOrEqual(minY)
      expect(p.y).toBeLessThanOrEqual(maxY)
    }
  })

  /**
   * Chain khép kín phải được làm mềm ĐỀU cả vòng. Nếu ghim hai đầu như chain hở
   * thì đúng chỗ nối còn lại một góc nhọn duy nhất — rất lộ trên bản in.
   */
  it('chain khép kín: vẫn khép kín, và KHÔNG còn góc vuông ban đầu', () => {
    const ring = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4), pt(0, 0)]
    const out = chaikin(ring, 2)
    expect(out[0]).toEqual(out[out.length - 1])
    for (const corner of [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)]) {
      expect(
        out.some((p) => p.x === corner.x && p.y === corner.y),
        `góc ${corner.x},${corner.y} chưa được làm mềm`,
      ).toBe(false)
    }
  })

  it('deterministic', () => {
    const pts = [pt(0, 0), pt(3, 7), pt(9, 2)]
    expect(chaikin(pts, 2)).toEqual(chaikin(pts, 2))
  })

  it('không sửa mảng đầu vào', () => {
    const pts = [pt(0, 0), pt(3, 7), pt(9, 2)]
    const before = JSON.stringify(pts)
    chaikin(pts, 2)
    expect(JSON.stringify(pts)).toBe(before)
  })
})
