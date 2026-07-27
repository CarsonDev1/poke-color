import { describe, expect, it } from 'vitest'
import { PaintEngine } from '@/core/engine/paint-engine'
import type { RegionMeta } from '@/core/types'

function regions(colorIndexes: number[]): RegionMeta[] {
  return colorIndexes.map((colorIndex, id) => ({
    id,
    colorIndex,
    area: 10,
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    anchorX: 0,
    anchorY: 0,
    anchorR: 3,
    hasLabel: true,
  }))
}

describe('PaintEngine', () => {
  it('khởi tạo: chưa tô gì', () => {
    const e = new PaintEngine(regions([0, 1, 2]))
    expect(e.regionCount).toBe(3)
    expect(e.filledCount).toBe(0)
    expect(e.progress).toBe(0)
    expect(e.isComplete()).toBe(false)
  })

  it('tô đúng màu → filled, tiến độ tăng', () => {
    const e = new PaintEngine(regions([0, 1]))
    expect(e.tryPaint(0, 0)).toEqual({ status: 'filled' })
    expect(e.isFilled(0)).toBe(true)
    expect(e.filledCount).toBe(1)
    expect(e.progress).toBe(0.5)
  })

  it('tô sai màu → rejected, KHÔNG đổi state, trả kèm màu đúng', () => {
    const e = new PaintEngine(regions([0, 7]))
    expect(e.tryPaint(1, 3)).toEqual({ status: 'rejected', expected: 7 })
    expect(e.isFilled(1)).toBe(false)
    expect(e.filledCount).toBe(0)
  })

  it('tô lại vùng đã tô → already, idempotent', () => {
    const e = new PaintEngine(regions([5]))
    expect(e.tryPaint(0, 5)).toEqual({ status: 'filled' })
    expect(e.tryPaint(0, 5)).toEqual({ status: 'already' })
    expect(e.filledCount).toBe(1)
  })

  it('tô sai lên vùng đã tô vẫn trả already, không rejected', () => {
    const e = new PaintEngine(regions([5]))
    e.tryPaint(0, 5)
    expect(e.tryPaint(0, 2)).toEqual({ status: 'already' })
  })

  it('isComplete khi tô hết', () => {
    const e = new PaintEngine(regions([0, 1]))
    e.tryPaint(0, 0)
    expect(e.isComplete()).toBe(false)
    e.tryPaint(1, 1)
    expect(e.isComplete()).toBe(true)
    expect(e.progress).toBe(1)
  })

  it('remainingByColor đếm đúng số vùng chưa tô mỗi màu', () => {
    const e = new PaintEngine(regions([0, 0, 1, 2, 2, 2]))
    expect(Array.from(e.remainingByColor(3))).toEqual([2, 1, 3])

    e.tryPaint(0, 0)
    e.tryPaint(3, 2)
    expect(Array.from(e.remainingByColor(3))).toEqual([1, 1, 2])
  })

  it('remainingByColor có đúng colorCount phần tử kể cả màu không dùng', () => {
    const e = new PaintEngine(regions([0, 0]))
    expect(Array.from(e.remainingByColor(4))).toEqual([2, 0, 0, 0])
  })

  it('isColorComplete', () => {
    const e = new PaintEngine(regions([0, 1, 1]))
    expect(e.isColorComplete(0, 2)).toBe(false)
    e.tryPaint(0, 0)
    expect(e.isColorComplete(0, 2)).toBe(true)
    expect(e.isColorComplete(1, 2)).toBe(false)
  })

  it('reset xoá hết tiến độ', () => {
    const e = new PaintEngine(regions([0, 1]))
    e.tryPaint(0, 0)
    e.tryPaint(1, 1)
    e.reset()
    expect(e.filledCount).toBe(0)
    expect(e.isFilled(0)).toBe(false)
  })

  it('toBitset / khởi tạo lại từ bitset giữ nguyên tiến độ', () => {
    const rs = regions([0, 1, 2, 3])
    const e = new PaintEngine(rs)
    e.tryPaint(1, 1)
    e.tryPaint(3, 3)

    const restored = new PaintEngine(rs, e.toBitset())
    expect(restored.filledCount).toBe(2)
    expect(restored.isFilled(1)).toBe(true)
    expect(restored.isFilled(3)).toBe(true)
    expect(restored.isFilled(0)).toBe(false)
  })

  it('regionId ngoài phạm vi → báo lỗi', () => {
    const e = new PaintEngine(regions([0]))
    expect(() => e.tryPaint(1, 0)).toThrow(/ngoài phạm vi/i)
    expect(() => e.isFilled(-1)).toThrow(/ngoài phạm vi/i)
  })

  it('không có vùng nào → isComplete true, progress 1', () => {
    const e = new PaintEngine([])
    expect(e.isComplete()).toBe(true)
    expect(e.progress).toBe(1)
  })
})
