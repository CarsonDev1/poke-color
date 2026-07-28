/// <reference types="node" />
import { CompressionStream, DecompressionStream } from 'node:stream/web'
import { Blob } from 'node:buffer'
// jsdom trong môi trường test không có CompressionStream/DecompressionStream,
// và Blob của jsdom thiếu .stream() (dùng trong compress.ts) nên phải thay
// bằng Blob của Node — chỉ cần cho test, browser thật có sẵn cả ba.
Object.assign(globalThis, { CompressionStream, DecompressionStream, Blob })

import { describe, expect, it } from 'vitest'
import { gunzip, gzip } from '@/data/compress'

describe('gzip / gunzip', () => {
  it('đi vòng về đúng dữ liệu gốc', async () => {
    const src = new Uint8Array([1, 2, 3, 250, 255, 0, 7])
    const back = await gunzip(await gzip(src))
    expect(Array.from(back)).toEqual(Array.from(src))
  })

  it('dữ liệu lặp lại nén nhỏ đi rõ rệt', async () => {
    const src = new Uint8Array(20_000).fill(42)
    const packed = await gzip(src)
    expect(packed.length).toBeLessThan(src.length / 10)
  })

  it('đi vòng đúng với dữ liệu lớn', async () => {
    const src = new Uint8Array(100_000)
    for (let i = 0; i < src.length; i++) src[i] = (i * 31) % 256
    const back = await gunzip(await gzip(src))
    expect(back.length).toBe(src.length)
    expect(back[0]).toBe(src[0])
    expect(back[99_999]).toBe(src[99_999])
  })

  it('mảng rỗng vẫn đi vòng được', async () => {
    expect((await gunzip(await gzip(new Uint8Array(0)))).length).toBe(0)
  })

  it('gunzip dữ liệu không phải gzip → báo lỗi', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow()
  })
})
