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

// ctx dùng chung cho MỌI OffscreenCanvas được tạo ra (canvas đầy đủ lẫn canvas
// thumbnail thu nhỏ) — cần để đếm được tổng số lần drawImage across cả hai,
// phân biệt "chỉ composite xuống thumbnail" (1 lần, code cũ) với "vẽ viền rồi
// mới composite" (2 lần, sau khi sửa I-thumbnail-outline).
const ctx = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  setTransform: vi.fn(),
  scale: vi.fn(),
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
        return ctx
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' }))
      }
    },
    createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
    // `erasableSyntaxOnly` cấm cú pháp constructor parameter-property.
    ImageData: class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
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

  it('vẽ viền vùng lên thumbnail, không chỉ paintAllRegions — thiếu viền thì một puzzle CHƯA tô gì render ra hình chữ nhật trắng ngà đồng nhất, không phân biệt được với placeholder "Chưa tô" của /library', async () => {
    const p = puzzle(40, 20)
    vi.mocked(createImageBitmap).mockClear()
    ctx.drawImage.mockClear()

    await makeThumbnail(p, new PaintEngine(p.regions))

    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    // 2 lần drawImage: 1 để vẽ bitmap viền lên canvas đầy đủ, 1 để composite
    // (thu nhỏ) canvas đó vào canvas thumbnail cuối cùng
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  })
})
