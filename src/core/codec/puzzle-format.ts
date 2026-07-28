import { decodeRowRle, encodeRowRle } from '@/core/codec/rle'
import { buildOutline } from '@/core/regions/outline'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 'PKL1' — Pokemon coLor v1 */
const MAGIC = 0x504b4c31
const VERSION = 1
const HEADER_BYTES = 24

export interface PuzzleBin {
  width: number
  height: number
  palette: Rgb[]
  regionCount: number
  regionMap: Uint32Array
}

/**
 * Bố cục (little-endian tường minh qua DataView, nên không có vấn đề căn lề):
 *   0   u32  magic
 *   4   u16  version
 *   6   u16  paletteLength
 *   8   u32  width
 *   12  u32  height
 *   16  u32  regionCount
 *   20  u32  rleLength (số phần tử u32, = 2 × số run)
 *   24   ..  palette, 3 byte mỗi màu
 *   ..   ..  RLE payload, rleLength × u32
 */
export function encodePuzzleBin(bin: PuzzleBin): Uint8Array {
  const rle = encodeRowRle(bin.regionMap, bin.width, bin.height)
  const total = HEADER_BYTES + bin.palette.length * 3 + rle.length * 4

  const bytes = new Uint8Array(total)
  const dv = new DataView(bytes.buffer)

  dv.setUint32(0, MAGIC, true)
  dv.setUint16(4, VERSION, true)
  dv.setUint16(6, bin.palette.length, true)
  dv.setUint32(8, bin.width, true)
  dv.setUint32(12, bin.height, true)
  dv.setUint32(16, bin.regionCount, true)
  dv.setUint32(20, rle.length, true)

  let o = HEADER_BYTES
  for (const c of bin.palette) {
    bytes[o++] = c[0]
    bytes[o++] = c[1]
    bytes[o++] = c[2]
  }
  for (let i = 0; i < rle.length; i++) {
    dv.setUint32(o, rle[i], true)
    o += 4
  }

  return bytes
}

export function decodePuzzleBin(bytes: Uint8Array): PuzzleBin {
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`Buffer quá nhỏ: ${bytes.length} byte, header cần ${HEADER_BYTES}`)
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('Đây không phải file puzzle hợp lệ (magic không đúng)')
  }
  const version = dv.getUint16(4, true)
  if (version !== VERSION) {
    throw new Error(`Không hỗ trợ file puzzle version ${version}, cần version ${VERSION}`)
  }

  const paletteLength = dv.getUint16(6, true)
  const width = dv.getUint32(8, true)
  const height = dv.getUint32(12, true)
  const regionCount = dv.getUint32(16, true)
  const rleLength = dv.getUint32(20, true)

  const expected = HEADER_BYTES + paletteLength * 3 + rleLength * 4
  if (bytes.length < expected) {
    throw new Error(
      `File puzzle bị cắt ngắn: có ${bytes.length} byte, cần ${expected}`,
    )
  }

  let o = HEADER_BYTES
  const palette: Rgb[] = []
  for (let i = 0; i < paletteLength; i++) {
    palette.push([bytes[o], bytes[o + 1], bytes[o + 2]])
    o += 3
  }

  const rle = new Uint32Array(rleLength)
  for (let i = 0; i < rleLength; i++) {
    rle[i] = dv.getUint32(o, true)
    o += 4
  }

  const regionMap = decodeRowRle(rle, width, height)
  return { width, height, palette, regionCount, regionMap }
}

const REGION_KEYS = [
  'id',
  'colorIndex',
  'area',
  'minX',
  'minY',
  'maxX',
  'maxY',
  'anchorX',
  'anchorY',
  'anchorR',
  'hasLabel',
] as const

export function encodeRegions(regions: RegionMeta[]): string {
  return JSON.stringify(regions)
}

export function decodeRegions(json: string): RegionMeta[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) {
    throw new Error('Dữ liệu vùng phải là mảng')
  }
  parsed.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) {
      throw new Error(`Dữ liệu vùng ${i} không phải object`)
    }
    for (const key of REGION_KEYS) {
      if (!(key in (r as Record<string, unknown>))) {
        throw new Error(`Dữ liệu vùng ${i} thiếu trường "${key}"`)
      }
    }
  })
  return parsed as RegionMeta[]
}

/**
 * Ghép bin + regions thành Puzzle chơi được.
 * `outline` và `runs` KHÔNG được lưu trong file — derive tại đây trong một
 * lượt quét O(n), rẻ hơn nhiều so với việc phình file lên mấy lần.
 */
export function assemblePuzzle(bin: PuzzleBin, regions: RegionMeta[]): Puzzle {
  if (regions.length !== bin.regionCount) {
    throw new Error(
      `Số vùng không khớp: header ghi ${bin.regionCount}, dữ liệu có ${regions.length}`,
    )
  }
  regions.forEach((r, i) => {
    if (r.id !== i) {
      throw new Error(`Id vùng phải liên tục từ 0: vùng thứ ${i} có id ${r.id}`)
    }
    // Không kiểm tra ở đây thì `regionsJson.gz` ghi lệch với palette (vd sinh
    // ra từ một palette khác số màu) sẽ lọt qua tới tận lúc render: rgbCss
    // trong layers.ts đọc palette[colorIndex] === undefined, và
    // `rgb(${undefined},${undefined},${undefined})` ném TypeError bên trong
    // một hiệu ứng vẽ — React unmount cả cây, ra trang trắng không một dòng
    // thông báo (app không có error boundary nào).
    if (r.colorIndex < 0 || r.colorIndex >= bin.palette.length) {
      throw new Error(
        `Vùng ${r.id} có colorIndex ${r.colorIndex} ngoài phạm vi palette (0..${bin.palette.length - 1}, palette có ${bin.palette.length} màu)`,
      )
    }
  })

  const field = {
    regionMap: bin.regionMap,
    regions,
    width: bin.width,
    height: bin.height,
  }

  return {
    width: bin.width,
    height: bin.height,
    palette: bin.palette,
    regionMap: bin.regionMap,
    regions,
    runs: buildRegionRuns(field),
    outline: buildOutline(field),
  }
}
