import { beforeAll, describe, expect, it, vi } from 'vitest'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { makeThumbnail, THUMBNAIL_MAX_PX, thumbnailSize } from '@/ui/make-thumbnail'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

function puzzle(w: number, h: number): Puzzle {
  const regionMap = new Uint32Array(w * h)
  const palette: Rgb[] = [[1, 2, 3]]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: w * h, minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: false },
  ]
  return assemblePuzzle({ width: w, height: h, palette, regionCount: 1, regionMap }, regions)
}

beforeAll(() => {
  Object.assign(globalThis, {
    // `erasableSyntaxOnly` cấm cú pháp constructor parameter-property (public
    // width/height ngay trong tham số) — phải khai trường rồi gán tay.
    OffscreenCanvas: class {
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() {
        return {
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          setTransform: vi.fn(),
          scale: vi.fn(),
        }
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' }))
      }
    },
  })
})

describe('thumbnailSize', () => {
  it('cạnh dài về đúng THUMBNAIL_MAX_PX, giữ tỉ lệ', () => {
    expect(thumbnailSize(1400, 700)).toEqual({ w: THUMBNAIL_MAX_PX, h: THUMBNAIL_MAX_PX / 2 })
    expect(thumbnailSize(700, 1400)).toEqual({ w: THUMBNAIL_MAX_PX / 2, h: THUMBNAIL_MAX_PX })
  })

  it('ảnh nhỏ hơn thì không phóng lên', () => {
    expect(thumbnailSize(100, 50)).toEqual({ w: 100, h: 50 })
  })

  it('không bao giờ ra 0', () => {
    const s = thumbnailSize(1000, 2)
    expect(s.h).toBeGreaterThanOrEqual(1)
  })
})

describe('makeThumbnail', () => {
  it('trả về Blob webp', async () => {
    const p = puzzle(40, 20)
    const blob = await makeThumbnail(p, new PaintEngine(p.regions))
    expect(blob.type).toBe('image/webp')
  })
})
