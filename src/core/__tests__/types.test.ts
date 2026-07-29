import { describe, expect, it } from 'vitest'
import { MAX_LABELLED_COLORS } from '@/core/label-alphabet'
import { DEFAULT_PARAMS, PRESETS, STAGE_LABELS } from '@/core/types'

describe('hằng số mặc định', () => {
  it('khớp giá trị trong spec §22', () => {
    expect(DEFAULT_PARAMS).toEqual({
      maxDim: 2000,
      k: 24,
      minArea: 'auto',
      targetRegions: 4500,
      smoothing: 0,
      mergeDeltaE: 6,
      minLabelRadius: 3,
    })
  })

  it('có đúng 4 preset khớp spec §22', () => {
    expect(PRESETS).toEqual({
      de: { k: 10, targetRegions: 400 },
      vua: { k: 16, targetRegions: 1200 },
      kho: { k: 24, targetRegions: 3000 },
      sach: { k: 30, targetRegions: 4500 },
    })
  })

  // Đây là thứ ngăn một `k` tương lai vượt 30 rồi làm colorLabel() throw
  // giữa lúc vẽ nhãn — lỗi sẽ nổ trong requestAnimationFrame, xa nơi gây ra.
  it('không preset nào vượt trần bảng nhãn', () => {
    for (const [name, p] of Object.entries(PRESETS)) {
      expect(p.k, `preset ${name}`).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
    }
    expect(DEFAULT_PARAMS.k).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
  })

  it('có nhãn tiếng Việt cho đủ 8 stage', () => {
    expect(Object.keys(STAGE_LABELS)).toHaveLength(8)
  })
})
