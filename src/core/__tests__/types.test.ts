import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, PRESETS, STAGE_LABELS } from '@/core/types'

describe('hằng số mặc định', () => {
  it('khớp giá trị trong spec', () => {
    expect(DEFAULT_PARAMS).toEqual({
      maxDim: 1400,
      k: 12,
      minArea: 'auto',
      targetRegions: 500,
      smoothing: 2,
      mergeDeltaE: 6,
      minLabelRadius: 7,
    })
  })

  it('có đúng 3 preset khớp spec', () => {
    expect(PRESETS).toEqual({
      de: { k: 8, targetRegions: 200 },
      vua: { k: 12, targetRegions: 500 },
      kho: { k: 16, targetRegions: 1000 },
    })
  })

  it('có nhãn tiếng Việt cho đủ 8 stage', () => {
    expect(Object.keys(STAGE_LABELS)).toHaveLength(8)
  })
})
