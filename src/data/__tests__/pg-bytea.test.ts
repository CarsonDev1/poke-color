import { describe, expect, it } from 'vitest'
import { Bitset } from '@/core/codec/bitset'
import { fromPgBytea, toPgBytea } from '@/data/pg-bytea'

describe('toPgBytea', () => {
  it('mảng rỗng ⇒ "\\x"', () => {
    expect(toPgBytea(new Uint8Array(0))).toBe('\\x')
  })

  it('đệm 0 cho byte nhỏ hơn 0x10 — thiếu đệm là lệch toàn bộ chuỗi', () => {
    expect(toPgBytea(new Uint8Array([1, 2, 15]))).toBe('\\x01020f')
  })

  it('byte cao 0xff không bị mất', () => {
    expect(toPgBytea(new Uint8Array([255, 0, 255]))).toBe('\\xff00ff')
  })

  it('KHÔNG bao giờ là object — đây chính là lỗi mà hàm này tồn tại để tránh', () => {
    const s = toPgBytea(new Uint8Array([1, 2]))
    expect(typeof s).toBe('string')
    // nếu ai đó gửi thẳng Uint8Array, JSON.stringify cho ra {"0":1,"1":2}
    expect(JSON.stringify(s)).not.toContain('"0"')
  })
})

describe('fromPgBytea', () => {
  it('đọc lại được chuỗi có tiền tố \\x', () => {
    expect(Array.from(fromPgBytea('\\x01020f'))).toEqual([1, 2, 15])
  })

  it('chấp nhận chuỗi KHÔNG có tiền tố', () => {
    expect(Array.from(fromPgBytea('01020f'))).toEqual([1, 2, 15])
  })

  it('chấp nhận tiền tố 0x', () => {
    expect(Array.from(fromPgBytea('0x01ff'))).toEqual([1, 255])
  })

  it('"\\x" và chuỗi rỗng ⇒ mảng rỗng (cột bytea rỗng là hợp lệ)', () => {
    expect(fromPgBytea('\\x')).toHaveLength(0)
    expect(fromPgBytea('')).toHaveLength(0)
  })

  it('hex chữ HOA cũng đọc được', () => {
    expect(Array.from(fromPgBytea('\\xFF0A'))).toEqual([255, 10])
  })

  it('số ký tự lẻ ⇒ LỖI, không âm thầm bỏ nửa byte', () => {
    expect(() => fromPgBytea('\\x012')).toThrow(/lẻ/)
  })

  it('ký tự không phải hex ⇒ LỖI, không trả NaN thành 0', () => {
    expect(() => fromPgBytea('\\xzzzz')).toThrow(/hex/)
  })
})

describe('round-trip', () => {
  it('mọi giá trị byte 0..255 đi và về nguyên vẹn', () => {
    const all = new Uint8Array(256)
    for (let i = 0; i < 256; i++) all[i] = i
    expect(Array.from(fromPgBytea(toPgBytea(all)))).toEqual(Array.from(all))
  })

  /**
   * Đây là đường đi thật của dữ liệu: bitset tiến độ → bytea → Postgres → về
   * lại bitset. Sai ở đây là mất tiến độ tô của người dùng.
   */
  it('bitset tiến độ đi qua bytea rồi về vẫn đúng từng bit và đúng số đếm', () => {
    const bs = new Bitset(100)
    for (const i of [0, 7, 8, 63, 64, 99]) bs.set(i, true)

    const back = Bitset.fromBytes(fromPgBytea(toPgBytea(bs.toBytes())), 100)

    expect(back.countOnes()).toBe(6)
    for (const i of [0, 7, 8, 63, 64, 99]) expect(back.get(i), `bit ${i}`).toBe(true)
    for (const i of [1, 6, 9, 62, 65, 98]) expect(back.get(i), `bit ${i}`).toBe(false)
  })
})
