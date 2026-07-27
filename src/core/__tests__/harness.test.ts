import { describe, expect, it } from 'vitest'

describe('bộ test', () => {
  it('chạy được và có typed arrays', () => {
    const a = new Uint32Array([1, 2, 3])
    expect(Array.from(a)).toEqual([1, 2, 3])
  })
})
