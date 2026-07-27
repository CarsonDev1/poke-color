import { describe, expect, it } from 'vitest'
import { Bitset } from '@/core/codec/bitset'

describe('Bitset', () => {
  it('mặc định toàn bộ bit là 0', () => {
    const b = new Bitset(20)
    expect(b.bitLength).toBe(20)
    expect(b.countOnes()).toBe(0)
    expect(b.get(0)).toBe(false)
    expect(b.get(19)).toBe(false)
  })

  it('set rồi get đúng, kể cả qua biên byte', () => {
    const b = new Bitset(20)
    for (const i of [0, 7, 8, 15, 16, 19]) b.set(i, true)
    for (const i of [0, 7, 8, 15, 16, 19]) expect(b.get(i)).toBe(true)
    for (const i of [1, 6, 9, 14, 17, 18]) expect(b.get(i)).toBe(false)
    expect(b.countOnes()).toBe(6)
  })

  it('set false xoá bit', () => {
    const b = new Bitset(8)
    b.set(3, true)
    expect(b.countOnes()).toBe(1)
    b.set(3, false)
    expect(b.countOnes()).toBe(0)
  })

  it('set cùng bit hai lần không làm countOnes tăng gấp đôi', () => {
    const b = new Bitset(8)
    b.set(2, true)
    b.set(2, true)
    expect(b.countOnes()).toBe(1)
  })

  it('or hợp nhất hai bên, không mất bit nào', () => {
    const a = new Bitset(10)
    const b = new Bitset(10)
    a.set(1, true)
    a.set(5, true)
    b.set(5, true)
    b.set(9, true)

    a.or(b)
    expect(a.get(1)).toBe(true)
    expect(a.get(5)).toBe(true)
    expect(a.get(9)).toBe(true)
    expect(a.countOnes()).toBe(3)
  })

  it('or với độ dài khác nhau thì báo lỗi', () => {
    expect(() => new Bitset(8).or(new Bitset(9))).toThrow(/độ dài/i)
  })

  it('toBytes / fromBytes đi vòng đúng', () => {
    const a = new Bitset(21)
    for (const i of [0, 3, 8, 20]) a.set(i, true)
    const back = Bitset.fromBytes(a.toBytes(), 21)
    expect(back.bitLength).toBe(21)
    expect(back.countOnes()).toBe(4)
    for (const i of [0, 3, 8, 20]) expect(back.get(i)).toBe(true)
  })

  it('toBytes có đúng ceil(bitLength/8) byte', () => {
    expect(new Bitset(1).toBytes()).toHaveLength(1)
    expect(new Bitset(8).toBytes()).toHaveLength(1)
    expect(new Bitset(9).toBytes()).toHaveLength(2)
    expect(new Bitset(800).toBytes()).toHaveLength(100)
  })

  it('toBytes trả bản sao, sửa nó không ảnh hưởng bitset', () => {
    const b = new Bitset(8)
    b.set(0, true)
    const bytes = b.toBytes()
    bytes[0] = 0
    expect(b.get(0)).toBe(true)
  })

  it('clear xoá hết', () => {
    const b = new Bitset(16)
    b.set(1, true)
    b.set(15, true)
    b.clear()
    expect(b.countOnes()).toBe(0)
  })

  it('get/set ngoài phạm vi thì báo lỗi', () => {
    const b = new Bitset(8)
    expect(() => b.get(8)).toThrow(/ngoài phạm vi/i)
    expect(() => b.set(-1, true)).toThrow(/ngoài phạm vi/i)
  })

  it('fromBytes với buffer quá ngắn thì báo lỗi', () => {
    expect(() => Bitset.fromBytes(new Uint8Array(1), 20)).toThrow(/quá ngắn/i)
  })
})
