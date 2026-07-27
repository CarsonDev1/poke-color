import { describe, expect, it } from 'vitest'
import { deltaE76 } from '@/core/color/delta-e'

describe('deltaE76', () => {
  it('màu giống nhau → 0', () => {
    expect(deltaE76([50, 10, -20], [50, 10, -20])).toBe(0)
  })

  it('là khoảng cách Euclid trong Lab', () => {
    expect(deltaE76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 6)
  })

  it('đối xứng', () => {
    const a = [30, -12, 44] as const
    const b = [61, 8, -3] as const
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10)
  })
})
