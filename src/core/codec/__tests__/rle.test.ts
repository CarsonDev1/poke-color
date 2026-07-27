import { describe, expect, it } from 'vitest'
import { decodeRowRle, encodeRowRle } from '@/core/codec/rle'

describe('encodeRowRle / decodeRowRle', () => {
  it('vùng phẳng nén cực mạnh', () => {
    const map = new Uint32Array(100).fill(7)
    const rle = encodeRowRle(map, 10, 10)
    // 10 dòng × 1 run × 2 số = 20
    expect(rle).toHaveLength(20)
    expect(rle[0]).toBe(10)
    expect(rle[1]).toBe(7)
  })

  it('đi vòng về đúng dữ liệu gốc', () => {
    const w = 7
    const h = 5
    const map = new Uint32Array(w * h)
    for (let i = 0; i < map.length; i++) map[i] = (i * 3) % 4
    const back = decodeRowRle(encodeRowRle(map, w, h), w, h)
    expect(Array.from(back)).toEqual(Array.from(map))
  })

  it('run không vắt qua biên dòng', () => {
    // toàn bộ cùng giá trị, 2 dòng ⇒ phải ra 2 run chứ không phải 1
    const map = new Uint32Array(6).fill(1)
    const rle = encodeRowRle(map, 3, 2)
    expect(rle).toHaveLength(4)
    expect(Array.from(rle)).toEqual([3, 1, 3, 1])
  })

  it('xử lý id vùng lớn (vượt 16 bit)', () => {
    const map = new Uint32Array([70000, 70000, 999999])
    const back = decodeRowRle(encodeRowRle(map, 3, 1), 3, 1)
    expect(Array.from(back)).toEqual([70000, 70000, 999999])
  })

  it('mỗi pixel một giá trị khác nhau: kích thước = 2*n', () => {
    const map = new Uint32Array([1, 2, 3, 4])
    expect(encodeRowRle(map, 4, 1)).toHaveLength(8)
  })

  it('decode với dữ liệu không khớp kích thước thì báo lỗi', () => {
    const rle = new Uint32Array([2, 5])
    expect(() => decodeRowRle(rle, 3, 1)).toThrow(/không khớp/i)
  })

  it('đi vòng trên dữ liệu lớn', () => {
    const w = 200
    const h = 150
    const map = new Uint32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        map[y * w + x] = Math.floor(x / 20) + Math.floor(y / 15) * 10
      }
    }
    const back = decodeRowRle(encodeRowRle(map, w, h), w, h)
    expect(Array.from(back)).toEqual(Array.from(map))
  })
})
