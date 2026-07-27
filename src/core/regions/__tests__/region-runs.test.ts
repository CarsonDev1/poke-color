import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { buildRegionRuns } from '@/core/regions/region-runs'
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

describe('buildRegionRuns', () => {
  it('offsets có regionCount+1 phần tử, bắt đầu 0', () => {
    const f = field(['aab', 'aab'])
    const runs = buildRegionRuns(f)
    expect(runs.offsets).toHaveLength(f.regions.length + 1)
    expect(runs.offsets[0]).toBe(0)
  })

  it('hình chữ nhật 2×2 → 2 run, mỗi dòng một run', () => {
    const f = field(['aab', 'aab'])
    const runs = buildRegionRuns(f)
    const aId = f.regionMap[0]
    const start = runs.offsets[aId]
    const end = runs.offsets[aId + 1]
    expect(end - start).toBe(2)
    expect(runs.y[start]).toBe(0)
    expect(runs.x0[start]).toBe(0)
    expect(runs.x1[start]).toBe(1)
    expect(runs.y[start + 1]).toBe(1)
  })

  it('hai cụm cùng màu bị ngắt là HAI vùng, mỗi vùng một run', () => {
    // 'a' xuất hiện ở x=0 và x=2 trên dòng 0, bị 'b' chen giữa
    const f = field(['aba'])
    const runs = buildRegionRuns(f)
    // hai cụm 'a' là hai VÙNG khác nhau (4-hướng, không liền nhau)
    expect(f.regions).toHaveLength(3)
    for (const r of f.regions) {
      expect(runs.offsets[r.id + 1] - runs.offsets[r.id]).toBe(1)
    }
  })

  it('một vùng hình vành khuyên (bao quanh lỗ) → dòng giữa có 2 run cho cùng 1 vùng', () => {
    // 'a' tạo thành vành khuyên bao quanh 'b' ở giữa — vẫn LIỀN một vùng
    // (nối qua dòng trên và dòng dưới), nhưng dòng giữa bị 'b' chen ngang
    // nên chính vùng 'a' đó có 2 run trên cùng dòng y=1.
    const f = field(['aaa', 'aba', 'aaa'])
    const aId = f.regionMap[0]
    const bId = f.regionMap[1 * 3 + 1]
    expect(aId).not.toBe(bId)
    expect(f.regions).toHaveLength(2) // vành khuyên liền một vùng + lỗ ở giữa

    const runs = buildRegionRuns(f)
    const start = runs.offsets[aId]
    const end = runs.offsets[aId + 1]
    expect(end - start).toBe(4) // dòng 0, dòng 1 (x2 run), dòng 2

    const middleRowRuns: Array<{ x0: number; x1: number }> = []
    for (let i = start; i < end; i++) {
      if (runs.y[i] === 1) middleRowRuns.push({ x0: runs.x0[i], x1: runs.x1[i] })
    }
    expect(middleRowRuns).toHaveLength(2)
    expect(middleRowRuns[0]).toEqual({ x0: 0, x1: 0 })
    expect(middleRowRuns[1]).toEqual({ x0: 2, x1: 2 })
  })

  it('bất biến: run phủ đúng và đủ pixel của mỗi vùng', () => {
    const f = field([
      'aabbcc',
      'abbcca',
      'bbccaa',
      'bccaab',
    ])
    const runs = buildRegionRuns(f)

    const painted = new Int32Array(f.width * f.height).fill(-1)
    for (const r of f.regions) {
      for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
        for (let x = runs.x0[i]; x <= runs.x1[i]; x++) {
          const p = runs.y[i] * f.width + x
          expect(painted[p]).toBe(-1) // không run nào phủ trùng
          painted[p] = r.id
        }
      }
    }
    expect(Array.from(painted)).toEqual(Array.from(f.regionMap))
  })

  it('bất biến: tổng độ dài run của một vùng = area của vùng đó', () => {
    const f = field([
      'aabbcc',
      'abbcca',
      'bbccaa',
    ])
    const runs = buildRegionRuns(f)
    for (const r of f.regions) {
      let sum = 0
      for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
        sum += runs.x1[i] - runs.x0[i] + 1
      }
      expect(sum).toBe(r.area)
    }
  })

  it('run của mỗi vùng sắp theo y tăng dần rồi x0 tăng dần', () => {
    const f = field([
      'aaaa',
      'abba',
      'aaaa',
    ])
    const runs = buildRegionRuns(f)
    const aId = f.regionMap[0]
    let prevY = -1
    let prevX0 = -1
    for (let i = runs.offsets[aId]; i < runs.offsets[aId + 1]; i++) {
      if (runs.y[i] === prevY) expect(runs.x0[i]).toBeGreaterThan(prevX0)
      else expect(runs.y[i]).toBeGreaterThan(prevY)
      prevY = runs.y[i]
      prevX0 = runs.x0[i]
    }
  })
})
