import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { buildOutline } from '@/core/regions/outline'
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

describe('buildOutline', () => {
  it('một vùng duy nhất → không có viền', () => {
    const o = buildOutline(field(['aaa', 'aaa']))
    expect(Array.from(o)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('cắt dọc: cột ngay trước ranh giới được đánh dấu', () => {
    const f = field(['aab', 'aab'])
    const o = buildOutline(f)
    // pixel (1,0) và (1,1) khác vùng với pixel bên phải ⇒ là biên
    expect(o[0 * 3 + 1]).toBe(255)
    expect(o[1 * 3 + 1]).toBe(255)
    // pixel (0,0) giống pixel phải và pixel dưới ⇒ không phải biên
    expect(o[0]).toBe(0)
  })

  it('cắt ngang: dòng ngay trên ranh giới được đánh dấu', () => {
    const f = field(['aa', 'bb'])
    const o = buildOutline(f)
    expect(o[0]).toBe(255)
    expect(o[1]).toBe(255)
    expect(o[2]).toBe(0)
    expect(o[3]).toBe(0)
  })

  it('chỉ có giá trị 0 hoặc 255', () => {
    const o = buildOutline(field(['abc', 'cab', 'bca']))
    for (const v of o) expect([0, 255]).toContain(v)
  })

  it('số pixel biên đúng như đếm tay', () => {
    // 4×2, cắt dọc tại x=2 ⇒ cột x=1 của cả 2 dòng là biên
    const o = buildOutline(field(['aabb', 'aabb']))
    const count = Array.from(o).filter((v) => v === 255).length
    expect(count).toBe(2)
  })
})
