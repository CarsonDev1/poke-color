import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PaintEngine } from '@/core/engine/paint-engine'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import {
  buildOutlineImageData,
  paintAllRegions,
  paintRegion,
  rgbCss,
  UNFILLED_COLOR,
} from '@/render/layers'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

// jsdom only exposes a real `ImageData` when the native `canvas` package is
// installed, which it is not here. Stub a minimal one so
// `buildOutlineImageData`'s `new ImageData(...)` call doesn't throw
// "ImageData is not defined" — the implementation still constructs a real
// ImageData in the browser, this stub only fills the test-environment gap.
beforeAll(() => {
  Object.assign(globalThis, {
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

/** 4×2: vùng 0 = cột 0-1, vùng 1 = cột 2-3 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: true },
  ]
  return assemblePuzzle({ width: 4, height: 2, palette, regionCount: 2, regionMap }, regions)
}

function fakeCtx() {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D & { fillRect: ReturnType<typeof vi.fn> }
}

describe('rgbCss', () => {
  it('đổi Rgb thành chuỗi CSS', () => {
    expect(rgbCss([1, 2, 3])).toBe('rgb(1,2,3)')
  })
})

describe('paintRegion', () => {
  it('vẽ đúng một fillRect cho mỗi run của vùng', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 0, 'rgb(255,0,0)')

    // vùng 0 có 2 run (một mỗi dòng)
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 2, 1)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 2, 1)
  })

  it('không vẽ pixel nào của vùng khác', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 1, 'rgb(0,0,255)')
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenCalledWith(2, 0, 2, 1)
    expect(ctx.fillRect).toHaveBeenCalledWith(2, 1, 2, 1)
  })

  it('đặt fillStyle theo màu truyền vào', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 0, 'rgb(9,9,9)')
    expect(ctx.fillStyle).toBe('rgb(9,9,9)')
  })

  it('id vùng không hợp lệ → báo lỗi', () => {
    expect(() => paintRegion(fakeCtx(), puzzle(), 5, '#000')).toThrow(/ngoài phạm vi/i)
  })
})

describe('paintAllRegions', () => {
  it('vùng chưa tô dùng UNFILLED_COLOR, vùng đã tô dùng màu palette', () => {
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(1, 1)

    const styles: string[] = []
    const ctx = {
      set fillStyle(v: string) {
        styles.push(v)
      },
      get fillStyle() {
        return styles[styles.length - 1] ?? ''
      },
      fillRect: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    paintAllRegions(ctx, p, e)

    expect(styles).toContain(UNFILLED_COLOR)
    expect(styles).toContain('rgb(0,0,255)')
    expect(styles).not.toContain('rgb(255,0,0)')
  })

  it('vẽ mọi run của mọi vùng', () => {
    const p = puzzle()
    const ctx = fakeCtx()
    paintAllRegions(ctx, p, new PaintEngine(p.regions))
    expect(ctx.fillRect).toHaveBeenCalledTimes(4)
  })
})

describe('buildOutlineImageData', () => {
  it('pixel biên là đen đục, còn lại trong suốt', () => {
    const p = puzzle()
    const img = buildOutlineImageData(p)

    expect(img.width).toBe(4)
    expect(img.height).toBe(2)

    // pixel (1,0) là biên
    const b = (0 * 4 + 1) * 4
    expect(img.data[b]).toBe(0)
    expect(img.data[b + 3]).toBe(255)

    // pixel (0,0) không phải biên
    const n = 0
    expect(img.data[n + 3]).toBe(0)
  })
})
