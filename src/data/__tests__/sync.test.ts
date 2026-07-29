import { describe, expect, it } from 'vitest'
import { Bitset } from '@/core/codec/bitset'
import type { ProgressRecord } from '@/data/local-cache'
import { mergeProgress } from '@/data/sync'

function rec(bits: number[], over: Partial<ProgressRecord> = {}): ProgressRecord {
  const b = new Bitset(10)
  for (const i of bits) b.set(i, true)
  return {
    puzzleId: 'p1',
    filled: b.toBytes(),
    filledCount: b.countOnes(),
    activeSeconds: 0,
    completedAt: null,
    updatedAt: 0,
    ...over,
  }
}

describe('mergeProgress', () => {
  it('OR hai tập vùng rời nhau — không mất bên nào', () => {
    const out = mergeProgress(rec([1, 2]), rec([3]), 10)
    const bs = Bitset.fromBytes(out.filled, 10)
    expect(bs.get(1)).toBe(true)
    expect(bs.get(2)).toBe(true)
    expect(bs.get(3)).toBe(true)
  })

  it('filledCount ĐẾM LẠI, không lấy max — đây là chỗ dễ sai nhất', () => {
    // A tô 2 vùng, B tô 1 vùng KHÁC ⇒ đúng là 3; max(2,1) = 2 là SAI
    const out = mergeProgress(rec([1, 2]), rec([3]), 10)
    expect(out.filledCount).toBe(3)
  })

  it('vùng trùng nhau không bị đếm hai lần', () => {
    const out = mergeProgress(rec([1, 2]), rec([2, 3]), 10)
    expect(out.filledCount).toBe(3)
  })

  it('activeSeconds lấy max, KHÔNG cộng dồn (hai thiết bị chạy song song)', () => {
    const out = mergeProgress(
      rec([1], { activeSeconds: 100 }),
      rec([2], { activeSeconds: 60 }),
      10,
    )
    expect(out.activeSeconds).toBe(100)
  })

  it('completedAt lấy MIN khác null — lần hoàn thành đầu tiên mới là mốc thật', () => {
    const out = mergeProgress(
      rec([1], { completedAt: 5000 }),
      rec([2], { completedAt: 3000 }),
      10,
    )
    expect(out.completedAt).toBe(3000)
  })

  it('một bên null thì lấy bên kia', () => {
    expect(
      mergeProgress(rec([1], { completedAt: null }), rec([2], { completedAt: 7 }), 10).completedAt,
    ).toBe(7)
    expect(
      mergeProgress(rec([1], { completedAt: 7 }), rec([2], { completedAt: null }), 10).completedAt,
    ).toBe(7)
  })

  it('cả hai null thì vẫn null', () => {
    expect(mergeProgress(rec([1]), rec([2]), 10).completedAt).toBeNull()
  })

  it('updatedAt lấy max', () => {
    expect(
      mergeProgress(rec([1], { updatedAt: 9 }), rec([2], { updatedAt: 4 }), 10).updatedAt,
    ).toBe(9)
  })

  it('GIAO HOÁN: merge(a,b) === merge(b,a) — thứ tự đẩy/kéo không được đổi kết quả', () => {
    const a = rec([1, 4], { activeSeconds: 10, completedAt: 500, updatedAt: 3 })
    const b = rec([4, 7], { activeSeconds: 80, completedAt: 200, updatedAt: 9 })
    expect(mergeProgress(a, b, 10)).toEqual(mergeProgress(b, a, 10))
  })

  it('LUỸ ĐẲNG: merge(a,a) === a — replay outbox nhiều lần không đổi gì', () => {
    const a = rec([1, 4], { activeSeconds: 10, completedAt: 500, updatedAt: 3 })
    expect(mergeProgress(a, a, 10)).toEqual(a)
  })

  it('KẾT HỢP: merge(merge(a,b),c) === merge(a,merge(b,c))', () => {
    const a = rec([1], { activeSeconds: 5, updatedAt: 1 })
    const b = rec([4], { activeSeconds: 50, completedAt: 900, updatedAt: 2 })
    const c = rec([7], { activeSeconds: 20, completedAt: 300, updatedAt: 3 })
    expect(mergeProgress(mergeProgress(a, b, 10), c, 10)).toEqual(
      mergeProgress(a, mergeProgress(b, c, 10), 10),
    )
  })

  it('khác puzzleId ⇒ lỗi, không âm thầm trộn tiến độ của hai puzzle', () => {
    expect(() => mergeProgress(rec([1]), rec([2], { puzzleId: 'p2' }), 10)).toThrow(/p1|p2/)
  })

  it('không sửa tại chỗ hai bản gốc — caller còn dùng chúng', () => {
    const a = rec([1])
    const b = rec([3])
    const beforeA = new Uint8Array(a.filled)
    const beforeB = new Uint8Array(b.filled)
    mergeProgress(a, b, 10)
    expect(a.filled).toEqual(beforeA)
    expect(b.filled).toEqual(beforeB)
  })

  it('regionCount lẻ (không chia hết 8): bit rác byte cuối không bị đếm', () => {
    // 10 vùng ⇒ 2 byte, 6 bit cuối là rác. Bật bit 9 (bit cao nhất hợp lệ).
    const a = rec([9])
    const b = rec([0])
    const out = mergeProgress(a, b, 10)
    expect(out.filledCount).toBe(2)
  })
})
