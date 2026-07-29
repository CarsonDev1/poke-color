import { describe, expect, it } from 'vitest'
import { checkQuality, MAX_GOOD_REGIONS, MIN_GOOD_REGIONS } from '@/ui/quality-check'

describe('checkQuality', () => {
  it('trong khoảng hợp lý → ok', () => {
    expect(checkQuality(500).level).toBe('ok')
    expect(checkQuality(MIN_GOOD_REGIONS).level).toBe('ok')
    expect(checkQuality(MAX_GOOD_REGIONS).level).toBe('ok')
  })

  it('quá nhiều vùng → qua-vun, gợi ý giảm chi tiết', () => {
    const v = checkQuality(MAX_GOOD_REGIONS + 1)
    expect(v.level).toBe('qua-vun')
    if (v.level === 'qua-vun') {
      expect(v.message).toMatch(String(MAX_GOOD_REGIONS + 1))
      expect(v.hint).toMatch(/độ chi tiết|số màu/i)
    }
  })

  it('quá ít vùng → qua-tho, gợi ý tăng chi tiết', () => {
    const v = checkQuality(MIN_GOOD_REGIONS - 1)
    expect(v.level).toBe('qua-tho')
    if (v.level === 'qua-tho') {
      expect(v.hint).toMatch(/độ chi tiết|số màu/i)
    }
  })

  it('ngưỡng khớp spec §22', () => {
    expect(MAX_GOOD_REGIONS).toBe(8000)
    expect(MIN_GOOD_REGIONS).toBe(20)
  })

  // Test tuyệt đối, không qua hằng số: ngưỡng cũ 2000 nằm DƯỚI mặc định 4500,
  // nên nếu ai hạ ngưỡng lại thì mọi puzzle sinh ở mặc định sẽ bị app tự tố là
  // lỗi. Ba test trên dùng MAX_GOOD_REGIONS symbolic nên không bắt được việc đó.
  it('4500 vùng — đúng mặc định mới — là ok, không cảnh báo', () => {
    expect(checkQuality(4500).level).toBe('ok')
  })
})
