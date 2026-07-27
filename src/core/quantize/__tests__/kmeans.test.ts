import { describe, expect, it } from 'vitest'
import { kmeansLab } from '@/core/quantize/kmeans'

/** 3 cụm rời nhau rõ rệt trong Lab */
function threeClusters(): Float32Array {
  const pts: number[] = []
  const centers = [
    [20, 0, 0],
    [50, 60, 40],
    [90, -40, 70],
  ]
  for (const c of centers) {
    for (let i = 0; i < 30; i++) {
      pts.push(c[0] + (i % 3) * 0.1, c[1] + (i % 2) * 0.1, c[2] + (i % 5) * 0.1)
    }
  }
  return new Float32Array(pts)
}

describe('kmeansLab', () => {
  it('gán đúng 3 cụm rời nhau', () => {
    const { labels, centroids } = kmeansLab(threeClusters(), 3)
    expect(centroids).toHaveLength(9)
    expect(labels).toHaveLength(90)

    // 30 điểm đầu cùng một nhãn, 30 tiếp theo nhãn khác, v.v.
    const g1 = new Set(Array.from(labels.slice(0, 30)))
    const g2 = new Set(Array.from(labels.slice(30, 60)))
    const g3 = new Set(Array.from(labels.slice(60, 90)))
    expect(g1.size).toBe(1)
    expect(g2.size).toBe(1)
    expect(g3.size).toBe(1)
    expect(new Set([...g1, ...g2, ...g3]).size).toBe(3)
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const lab = threeClusters()
    const a = kmeansLab(lab, 4)
    const b = kmeansLab(lab, 4)
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
    expect(Array.from(a.centroids)).toEqual(Array.from(b.centroids))
  })

  it('mọi nhãn nằm trong [0, k)', () => {
    const { labels } = kmeansLab(threeClusters(), 5)
    for (const l of labels) {
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThan(5)
    }
  })

  it('không vượt maxIters', () => {
    // chỉ kiểm tra là hàm dừng và không treo với maxIters nhỏ
    const { labels } = kmeansLab(threeClusters(), 3, 1)
    expect(labels).toHaveLength(90)
  })
})
