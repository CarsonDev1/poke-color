import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
import { Blob as NodeBlob } from 'node:buffer'
// jsdom trong môi trường test không có CompressionStream/DecompressionStream,
// và Blob của jsdom thiếu .stream() (dùng trong compress.ts) nên phải thay
// bằng Blob của Node — như compress.test.ts (Task 21) đã làm. Chỉ cần cho
// test, browser thật có sẵn cả ba. Import đổi tên (không phải `Blob`) để
// không đè lên kiểu DOM `Blob` toàn cục — nếu không, `new Blob(...)` trong
// file này sẽ nhận kiểu `import("buffer").Blob`, xung đột với tham số
// `Blob` (kiểu DOM) của các hàm trong local-cache.ts.
Object.assign(globalThis, { CompressionStream, DecompressionStream, Blob: NodeBlob })

import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import {
  deletePuzzle,
  listPuzzles,
  loadOriginal,
  loadProgress,
  loadPuzzle,
  loadThumbnail,
  newPuzzleId,
  resetDatabaseForTests,
  saveProgress,
  savePuzzle,
  saveThumbnail,
  type PuzzleRecord,
} from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'

const palette: Rgb[] = [
  [10, 20, 30],
  [200, 100, 50],
]

const regions: RegionMeta[] = [
  { id: 0, colorIndex: 0, area: 6, minX: 0, minY: 0, maxX: 1, maxY: 2, anchorX: 0, anchorY: 1, anchorR: 1, hasLabel: true },
  { id: 1, colorIndex: 1, area: 6, minX: 2, minY: 0, maxX: 3, maxY: 2, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: false },
]

const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1])

function record(id: string, over: Partial<PuzzleRecord> = {}): PuzzleRecord {
  return {
    id,
    title: 'Tranh thử',
    createdAt: 1000,
    width: 4,
    height: 3,
    colorCount: 2,
    regionCount: 2,
    palette,
    params: DEFAULT_PARAMS,
    usedMinArea: 12,
    ...over,
  }
}

async function blobs() {
  const bin = encodePuzzleBin({ width: 4, height: 3, palette, regionCount: 2, regionMap })
  return {
    binGz: await gzip(bin),
    regionsGz: await gzip(new TextEncoder().encode(encodeRegions(regions))),
    original: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  }
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

describe('newPuzzleId', () => {
  it('sinh id khác nhau mỗi lần', () => {
    expect(newPuzzleId()).not.toBe(newPuzzleId())
  })

  // `crypto.randomUUID` chỉ tồn tại trong secure context (HTTPS hoặc
  // localhost). Quy trình chính là `npm run dev -- --host` rồi mở
  // `http://192.168.x.x:5173` trên tablet — KHÔNG phải secure context — nên
  // `newPuzzleId` phải tự dựng UUID v4 từ `crypto.getRandomValues` (luôn có,
  // kể cả context không an toàn) khi `randomUUID` vắng mặt.
  it('crypto.randomUUID vắng mặt (context không an toàn) → vẫn sinh UUID v4 hợp lệ', () => {
    const original = crypto.randomUUID
    // `randomUUID` kế thừa từ prototype của `Crypto`, nên `delete
    // crypto.randomUUID` là no-op (không phải own property) — phải GHI ĐÈ
    // bằng gán giá trị `undefined` để thực sự che khuất nó, mô phỏng đúng
    // môi trường không secure (HTTP qua LAN) nơi `randomUUID` không tồn tại.
    // @ts-expect-error mô phỏng môi trường không secure: randomUUID không tồn tại
    crypto.randomUUID = undefined
    try {
      const id = newPuzzleId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(newPuzzleId()).not.toBe(id)
    } finally {
      crypto.randomUUID = original
    }
  })
})

describe('savePuzzle / listPuzzles / loadPuzzle', () => {
  it('lưu rồi đọc lại được metadata', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const list = await listPuzzles()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'p1', title: 'Tranh thử', regionCount: 2 })
    expect(list[0].palette).toEqual(palette)
  })

  it('listPuzzles trả mới nhất trước', async () => {
    const b = await blobs()
    await savePuzzle(record('cu', { createdAt: 100 }), b.binGz, b.regionsGz, b.original)
    await savePuzzle(record('moi', { createdAt: 900 }), b.binGz, b.regionsGz, b.original)

    expect((await listPuzzles()).map((p) => p.id)).toEqual(['moi', 'cu'])
  })

  it('loadPuzzle giải nén và dựng lại Puzzle chơi được', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const p = await loadPuzzle('p1')
    expect(p.width).toBe(4)
    expect(p.height).toBe(3)
    expect(p.regions).toHaveLength(2)
    expect(Array.from(p.regionMap)).toEqual(Array.from(regionMap))
    // outline và runs được derive lại, không lưu trong file
    expect(p.outline).toHaveLength(12)
    expect(p.runs.offsets).toHaveLength(3)
  })

  it('loadPuzzle với id không tồn tại → báo lỗi', async () => {
    await expect(loadPuzzle('khong-co')).rejects.toThrow(/không tìm thấy/i)
  })

  it('loadOriginal trả đúng blob đã lưu', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const got = await loadOriginal('p1')
    expect(got).toBeDefined()
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('saveProgress / loadProgress', () => {
  it('lưu rồi đọc lại đúng bitset', async () => {
    await saveProgress({
      puzzleId: 'p1',
      filled: new Uint8Array([0b00000010]),
      filledCount: 1,
      activeSeconds: 42,
      completedAt: null,
      updatedAt: 5,
    })

    const got = await loadProgress('p1')
    expect(got?.filledCount).toBe(1)
    expect(got?.activeSeconds).toBe(42)
    expect(Array.from(got!.filled)).toEqual([2])
  })

  it('ghi lại thì thay thế bản cũ, không tạo bản trùng', async () => {
    const base = {
      puzzleId: 'p1',
      filled: new Uint8Array([1]),
      filledCount: 1,
      activeSeconds: 1,
      completedAt: null,
      updatedAt: 1,
    }
    await saveProgress(base)
    await saveProgress({ ...base, filledCount: 2, updatedAt: 2 })

    expect((await loadProgress('p1'))?.filledCount).toBe(2)
  })

  it('chưa có tiến độ → undefined', async () => {
    expect(await loadProgress('chua-co')).toBeUndefined()
  })
})

describe('thumbnail', () => {
  it('lưu rồi đọc lại được', async () => {
    await saveThumbnail('p1', new Blob([new Uint8Array([9, 9])], { type: 'image/webp' }))
    const got = await loadThumbnail('p1')
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(new Uint8Array([9, 9]))
  })

  it('chưa có → undefined', async () => {
    expect(await loadThumbnail('p1')).toBeUndefined()
  })
})

describe('deletePuzzle', () => {
  it('xoá sạch metadata, blob, tiến độ và thumbnail', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)
    await saveProgress({
      puzzleId: 'p1',
      filled: new Uint8Array([1]),
      filledCount: 1,
      activeSeconds: 0,
      completedAt: null,
      updatedAt: 0,
    })
    await saveThumbnail('p1', new Blob([new Uint8Array([1])]))

    await deletePuzzle('p1')

    expect(await listPuzzles()).toHaveLength(0)
    expect(await loadProgress('p1')).toBeUndefined()
    expect(await loadThumbnail('p1')).toBeUndefined()
    expect(await loadOriginal('p1')).toBeUndefined()
    await expect(loadPuzzle('p1')).rejects.toThrow()
  })

  it('xoá id không tồn tại không báo lỗi', async () => {
    await expect(deletePuzzle('khong-co')).resolves.toBeUndefined()
  })

  it('không ảnh hưởng puzzle khác', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)
    await savePuzzle(record('p2'), b.binGz, b.regionsGz, b.original)

    await deletePuzzle('p1')
    expect((await listPuzzles()).map((p) => p.id)).toEqual(['p2'])
  })
})
