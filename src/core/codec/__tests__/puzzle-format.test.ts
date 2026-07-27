import { describe, expect, it } from 'vitest'
import {
  assemblePuzzle,
  decodePuzzleBin,
  decodeRegions,
  encodePuzzleBin,
  encodeRegions,
  type PuzzleBin,
} from '@/core/codec/puzzle-format'
import type { RegionMeta, Rgb } from '@/core/types'

function sampleBin(): PuzzleBin {
  // 4×3: cột 0-1 vùng 0, cột 2-3 vùng 1
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [10, 20, 30],
    [200, 100, 50],
  ]
  return { width: 4, height: 3, palette, regionCount: 2, regionMap }
}

function sampleRegions(): RegionMeta[] {
  return [
    { id: 0, colorIndex: 0, area: 6, minX: 0, minY: 0, maxX: 1, maxY: 2, anchorX: 0, anchorY: 1, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 6, minX: 2, minY: 0, maxX: 3, maxY: 2, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: false },
  ]
}

describe('encodePuzzleBin / decodePuzzleBin', () => {
  it('đi vòng về đúng dữ liệu gốc', () => {
    const bin = sampleBin()
    const back = decodePuzzleBin(encodePuzzleBin(bin))

    expect(back.width).toBe(4)
    expect(back.height).toBe(3)
    expect(back.regionCount).toBe(2)
    expect(back.palette).toEqual(bin.palette)
    expect(Array.from(back.regionMap)).toEqual(Array.from(bin.regionMap))
  })

  it('đi vòng đúng với id vùng lớn và palette 24 màu', () => {
    const palette: Rgb[] = Array.from({ length: 24 }, (_, i) => [i * 10, 255 - i * 10, i] as Rgb)
    const regionMap = new Uint32Array(60)
    for (let i = 0; i < 60; i++) regionMap[i] = i * 1000
    const bin: PuzzleBin = { width: 10, height: 6, palette, regionCount: 60000, regionMap }

    const back = decodePuzzleBin(encodePuzzleBin(bin))
    expect(back.palette).toEqual(palette)
    expect(back.regionCount).toBe(60000)
    expect(Array.from(back.regionMap)).toEqual(Array.from(regionMap))
  })

  it('magic sai → báo lỗi rõ ràng', () => {
    const bytes = encodePuzzleBin(sampleBin())
    bytes[0] = 0
    expect(() => decodePuzzleBin(bytes)).toThrow(/không phải file puzzle/i)
  })

  it('version không hỗ trợ → báo lỗi kèm số version', () => {
    const bytes = encodePuzzleBin(sampleBin())
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(4, 99, true)
    expect(() => decodePuzzleBin(bytes)).toThrow(/version 99/i)
  })

  it('buffer bị cắt ngắn → báo lỗi thay vì trả dữ liệu rác', () => {
    const bytes = encodePuzzleBin(sampleBin())
    expect(() => decodePuzzleBin(bytes.slice(0, bytes.length - 4))).toThrow(/cắt ngắn|không khớp/i)
  })

  it('buffer nhỏ hơn cả header → báo lỗi', () => {
    expect(() => decodePuzzleBin(new Uint8Array(5))).toThrow(/quá nhỏ/i)
  })

  it('deterministic — encode 2 lần ra byte y hệt', () => {
    const bin = sampleBin()
    expect(Array.from(encodePuzzleBin(bin))).toEqual(Array.from(encodePuzzleBin(bin)))
  })

  it('vùng phẳng lớn nén nhỏ hơn nhiều so với dữ liệu thô', () => {
    const w = 200
    const h = 200
    const bin: PuzzleBin = {
      width: w,
      height: h,
      palette: [[0, 0, 0]],
      regionCount: 1,
      regionMap: new Uint32Array(w * h),
    }
    const bytes = encodePuzzleBin(bin)
    expect(bytes.length).toBeLessThan(w * h * 4 * 0.05)
  })
})

describe('encodeRegions / decodeRegions', () => {
  it('đi vòng về đúng dữ liệu gốc', () => {
    const r = sampleRegions()
    expect(decodeRegions(encodeRegions(r))).toEqual(r)
  })

  it('JSON không phải mảng → báo lỗi', () => {
    expect(() => decodeRegions('{"a":1}')).toThrow(/phải là mảng/i)
  })

  it('thiếu trường bắt buộc → báo lỗi kèm chỉ số', () => {
    expect(() => decodeRegions('[{"id":0}]')).toThrow(/vùng 0/i)
  })
})

describe('assemblePuzzle', () => {
  it('dựng lại outline và runs từ regionMap', () => {
    const p = assemblePuzzle(sampleBin(), sampleRegions())

    expect(p.width).toBe(4)
    expect(p.height).toBe(3)
    expect(p.regions).toHaveLength(2)
    expect(p.outline).toHaveLength(12)
    // cột x=1 là biên vì bên phải khác vùng
    expect(p.outline[0 * 4 + 1]).toBe(255)
    expect(p.outline[0 * 4 + 0]).toBe(0)

    // vùng 0 có 3 run (một mỗi dòng)
    expect(p.runs.offsets[1] - p.runs.offsets[0]).toBe(3)
  })

  it('báo lỗi khi regionCount không khớp số phần tử regions', () => {
    const bin = sampleBin()
    expect(() => assemblePuzzle(bin, [sampleRegions()[0]])).toThrow(/không khớp/i)
  })

  it('báo lỗi khi id vùng không liên tục từ 0', () => {
    const bad = sampleRegions()
    bad[1] = { ...bad[1], id: 5 }
    expect(() => assemblePuzzle(sampleBin(), bad)).toThrow(/liên tục/i)
  })
})
