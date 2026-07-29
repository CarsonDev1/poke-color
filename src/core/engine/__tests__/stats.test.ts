import { describe, expect, it } from 'vitest'
import {
  addDays,
  currentStreak,
  formatDuration,
  localDay,
  puzzleMetrics,
  totals,
  type PuzzleStat,
} from '@/core/engine/stats'

const stat = (over: Partial<PuzzleStat> = {}): PuzzleStat => ({
  puzzleId: 'p1',
  title: 'T',
  regionCount: 100,
  filledCount: 0,
  activeSeconds: 0,
  completedAt: null,
  ...over,
})

describe('puzzleMetrics', () => {
  it('progress = filled / total', () => {
    expect(puzzleMetrics(stat({ filledCount: 25 })).progress).toBe(0.25)
  })

  it('regionCount 0 ⇒ progress 0, không NaN', () => {
    expect(puzzleMetrics(stat({ regionCount: 0 })).progress).toBe(0)
  })

  it('vùng/phút tính đúng', () => {
    expect(puzzleMetrics(stat({ filledCount: 30, activeSeconds: 60 })).regionsPerMinute).toBe(30)
  })

  /** Chia 0 cho Infinity, và UI sẽ in ra "Infinity vùng/phút". */
  it('activeSeconds 0 ⇒ vùng/phút là NULL, không phải Infinity', () => {
    expect(puzzleMetrics(stat({ filledCount: 5 })).regionsPerMinute).toBeNull()
  })

  it('done theo completedAt', () => {
    expect(puzzleMetrics(stat()).done).toBe(false)
    expect(puzzleMetrics(stat({ completedAt: 123 })).done).toBe(true)
  })
})

describe('totals', () => {
  it('cộng dồn đúng ba con số', () => {
    const t = totals([
      stat({ filledCount: 10, activeSeconds: 100, completedAt: 1 }),
      stat({ filledCount: 5, activeSeconds: 50 }),
    ])
    expect(t).toEqual({ puzzlesCompleted: 1, regionsFilled: 15, activeSeconds: 150 })
  })

  it('danh sách rỗng ⇒ toàn 0', () => {
    expect(totals([])).toEqual({ puzzlesCompleted: 0, regionsFilled: 0, activeSeconds: 0 })
  })
})

describe('addDays', () => {
  it('cộng một ngày trong tháng', () => {
    expect(addDays('2026-03-10', 1)).toBe('2026-03-11')
  })

  it('trừ một ngày qua đầu tháng', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('năm nhuận: 2024-03-01 trừ 1 ⇒ 2024-02-29', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('qua đầu năm', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('đệm 0 cho tháng và ngày một chữ số', () => {
    expect(addDays('2026-01-09', 1)).toBe('2026-01-10')
    expect(addDays('2026-01-10', -1)).toBe('2026-01-09')
  })
})

describe('currentStreak', () => {
  it('không có ngày nào ⇒ 0', () => {
    expect(currentStreak([], '2026-07-29')).toBe(0)
  })

  it('chỉ hôm nay ⇒ 1', () => {
    expect(currentStreak(['2026-07-29'], '2026-07-29')).toBe(1)
  })

  it('ba ngày liên tiếp tới hôm nay ⇒ 3', () => {
    expect(currentStreak(['2026-07-27', '2026-07-28', '2026-07-29'], '2026-07-29')).toBe(3)
  })

  /**
   * Cố tình tính "hôm qua cũng được": nếu bắt buộc phải có hôm nay thì ai mở app
   * buổi sáng cũng thấy chuỗi = 0 cho tới khi tô, và con số nhảy 0 → N trông như
   * lỗi.
   */
  it('ngày gần nhất là HÔM QUA ⇒ chuỗi vẫn còn sống', () => {
    expect(currentStreak(['2026-07-27', '2026-07-28'], '2026-07-29')).toBe(2)
  })

  it('ngày gần nhất là hôm kia ⇒ chuỗi ĐỨT, trả 0', () => {
    expect(currentStreak(['2026-07-26', '2026-07-27'], '2026-07-29')).toBe(0)
  })

  it('có khoảng trống ⇒ chỉ đếm đoạn liên tiếp cuối', () => {
    expect(
      currentStreak(['2026-07-01', '2026-07-02', '2026-07-28', '2026-07-29'], '2026-07-29'),
    ).toBe(2)
  })

  it('ngày trùng lặp không đếm hai lần', () => {
    expect(currentStreak(['2026-07-29', '2026-07-29', '2026-07-28'], '2026-07-29')).toBe(2)
  })

  it('không phụ thuộc thứ tự đầu vào', () => {
    const shuffled = ['2026-07-29', '2026-07-27', '2026-07-28']
    expect(currentStreak(shuffled, '2026-07-29')).toBe(3)
  })

  it('chuỗi vắt qua đầu tháng', () => {
    expect(currentStreak(['2026-06-30', '2026-07-01'], '2026-07-01')).toBe(2)
  })

  it('chuỗi vắt qua đầu năm', () => {
    expect(currentStreak(['2025-12-31', '2026-01-01'], '2026-01-01')).toBe(2)
  })

  it('ngày trong tương lai không làm vỡ (dữ liệu lệch giờ máy)', () => {
    expect(() => currentStreak(['2027-01-01'], '2026-07-29')).not.toThrow()
  })
})

describe('localDay', () => {
  it('trả về YYYY-MM-DD có đệm 0', () => {
    const d = new Date(2026, 0, 5, 12, 0, 0)
    expect(localDay(d.getTime())).toBe('2026-01-05')
  })

  it('khớp với addDays: hôm nay trừ 1 rồi cộng 1 về chính nó', () => {
    const today = localDay(new Date(2026, 6, 29, 10).getTime())
    expect(addDays(addDays(today, -1), 1)).toBe(today)
  })
})

describe('formatDuration', () => {
  it('dưới một phút ⇒ giây', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('phút và giây, giây đệm 0', () => {
    expect(formatDuration(65)).toBe('1m 05s')
  })

  it('giờ và phút, phút đệm 0', () => {
    expect(formatDuration(3660)).toBe('1h 01m')
  })

  it('0 ⇒ "0s"', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('số âm ⇒ "0s", không phải "-5s"', () => {
    expect(formatDuration(-5)).toBe('0s')
  })
})
