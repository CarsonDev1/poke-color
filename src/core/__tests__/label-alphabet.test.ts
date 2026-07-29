import { describe, expect, it } from 'vitest'
import { colorLabel, LABEL_ALPHABET, MAX_LABELLED_COLORS } from '@/core/label-alphabet'

describe('LABEL_ALPHABET', () => {
  it('có đúng 30 ký tự', () => {
    expect(LABEL_ALPHABET).toHaveLength(30)
    expect(MAX_LABELLED_COLORS).toBe(30)
  })

  it('bắt đầu bằng 1..9 rồi 0, khớp legend trang sách', () => {
    expect(LABEL_ALPHABET.slice(0, 10)).toBe('1234567890')
  })

  it('phần chữ bỏ đúng g i j o q w', () => {
    const letters = LABEL_ALPHABET.slice(10)
    expect(letters).toBe('abcdefhklmnprstuvxyz')
    for (const skipped of ['g', 'i', 'j', 'o', 'q', 'w']) {
      expect(letters).not.toContain(skipped)
    }
  })

  it('không có ký tự trùng', () => {
    expect(new Set(LABEL_ALPHABET).size).toBe(LABEL_ALPHABET.length)
  })
})

describe('colorLabel', () => {
  it('colorIndex 0 ra "1" — người dùng đếm từ 1, nội bộ đếm từ 0', () => {
    expect(colorLabel(0)).toBe('1')
  })

  it('colorIndex 9 ra "0", khớp quy ước legend', () => {
    expect(colorLabel(9)).toBe('0')
  })

  it('colorIndex 10 ra "a" — bắt đầu phần chữ', () => {
    expect(colorLabel(10)).toBe('a')
  })

  it('colorIndex 29 ra "z" — ký tự cuối', () => {
    expect(colorLabel(29)).toBe('z')
  })

  it('phủ toàn dải 0..29 không trùng, không rỗng', () => {
    const labels = Array.from({ length: 30 }, (_, i) => colorLabel(i))
    expect(new Set(labels).size).toBe(30)
    for (const l of labels) expect(l).toHaveLength(1)
  })

  it('ngoài phạm vi thì báo lỗi kèm số, không trả rỗng', () => {
    expect(() => colorLabel(30)).toThrow(/30/)
    expect(() => colorLabel(-1)).toThrow(/-1/)
    expect(() => colorLabel(1.5)).toThrow(/1\.5/)
  })
})
