import { describe, expect, it, vi } from 'vitest'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { drawFocusRing, drawLabels } from '@/render/label-layer'
import { drawHighlight } from '@/render/highlight'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 6×2: 3 vùng dọc; vùng giữa hasLabel = false */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2])
  const palette: Rgb[] = [
    [10, 10, 10],
    [20, 20, 20],
    [30, 30, 30],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 4, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 2, anchorY: 0, anchorR: 1, hasLabel: false },
    { id: 2, colorIndex: 2, area: 4, minX: 4, minY: 0, maxX: 5, maxY: 1, anchorX: 4, anchorY: 0, anchorR: 4, hasLabel: true },
  ]
  return assemblePuzzle({ width: 6, height: 2, palette, regionCount: 3, regionMap }, regions)
}

function fakeCtx() {
  return {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillText: vi.fn(),
    strokeText: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    fillText: ReturnType<typeof vi.fn>
    fillRect: ReturnType<typeof vi.fn>
    strokeRect: ReturnType<typeof vi.fn>
    clearRect: ReturnType<typeof vi.fn>
  }
}

const V = { scale: 10, tx: 0, ty: 0 }

describe('drawLabels', () => {
  it('vẽ số cho vùng chưa tô có hasLabel', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)

    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    // colorIndex 0 và 2 ⇒ hiển thị 1 và 3 (đánh số từ 1 cho người dùng)
    expect(drawn).toContain('1')
    expect(drawn).toContain('3')
  })

  it('KHÔNG vẽ số cho vùng hasLabel = false', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)
    expect(ctx.fillText.mock.calls.map((c) => c[0])).not.toContain('2')
  })

  it('KHÔNG vẽ số cho vùng đã tô', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(0, 0)

    drawLabels(ctx, p, e, V, 100, 100)
    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    expect(drawn).not.toContain('1')
    expect(drawn).toContain('3')
  })

  it('chỉ vẽ vùng nằm trong viewport', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    // khung chỉ rộng 25px ⇒ vùng 2 (anchor x=4 ⇒ screen 40) nằm ngoài
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 25, 100)
    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    expect(drawn).toContain('1')
    expect(drawn).not.toContain('3')
  })

  it('vẽ ở toạ độ màn hình, không phải toạ độ ảnh', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), { scale: 10, tx: 5, ty: 7 }, 200, 200)

    const call = ctx.fillText.mock.calls.find((c) => c[0] === '1')
    expect(call).toBeDefined()
    // anchor ảnh (0,0) → screen (5,7); +0.5*scale để canh giữa pixel
    expect(call![1]).toBeCloseTo(10, 5)
    expect(call![2]).toBeCloseTo(12, 5)
  })

  it('cỡ chữ tăng theo scale', () => {
    const p = puzzle()
    const small = fakeCtx()
    const big = fakeCtx()
    drawLabels(small, p, new PaintEngine(p.regions), { scale: 2, tx: 0, ty: 0 }, 500, 500)
    const fontSmall = small.font
    drawLabels(big, p, new PaintEngine(p.regions), { scale: 20, tx: 0, ty: 0 }, 500, 500)
    const fontBig = big.font

    const num = (f: string): number => Number(f.match(/(\d+(\.\d+)?)px/)![1])
    expect(num(fontBig)).toBeGreaterThan(num(fontSmall))
  })

  it('xoá canvas trước khi vẽ', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 100)
  })
})

describe('drawFocusRing (I7 — con trỏ vùng bàn phím phải hiện ra được vẽ, không chỉ tồn tại trong state)', () => {
  it('viền vùng đang focus bằng ĐÚNG MỘT strokeRect (bounding box) — KHÔNG phải một lần mỗi run', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    // vùng 0: 2 run (một mỗi hàng của khối 2×2). Trước khi sửa: code stroke
    // MỘT rect MỖI RUN, cao 1×scale px màn hình, viền 3px chồng lấp giữa các
    // run liền kề khiến cả vùng bị tô đặc màu xanh — bắt lỗi này bằng cách
    // khẳng định chỉ có ĐÚNG MỘT lần gọi strokeRect cho một vùng nhiều run.
    drawFocusRing(ctx, p, 0, V, 100, 100, true)
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1)
  })

  it('chỉ viền đúng vùng đang focus, không viền vùng khác', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawFocusRing(ctx, p, 2, V, 100, 100, true)
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1)
  })

  it('id vùng ngoài phạm vi (vd -1 khi puzzle rỗng) → không vẽ gì, không throw', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    expect(() => drawFocusRing(ctx, p, 99, V, 100, 100, true)).not.toThrow()
    expect(ctx.strokeRect).not.toHaveBeenCalled()
  })

  it('vẽ ở toạ độ màn hình (theo viewport), không phải toạ độ ảnh thô — dùng bounding box (minX/minY..maxX+1/maxY+1) của cả vùng, không phải một run riêng lẻ', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawFocusRing(ctx, p, 0, { scale: 10, tx: 5, ty: 7 }, 200, 200, true)
    // vùng 0: bbox ảnh x=[0,2) y=[0,2) (khối 2×2) ⇒ màn hình x=[5,25), y=[7,27)
    expect(ctx.strokeRect).toHaveBeenCalledWith(5, 7, 20, 20)
  })

  it('KHÔNG vẽ gì khi bề mặt tương tác chưa có DOM focus thật — người dùng chuột/chạm không bao giờ nên thấy viền này', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    // Trước khi sửa: hàm không nhận tham số focused nào cả, luôn vẽ bất kể
    // canvas có đang được Tab tới hay không — focusRegion mặc định là 0 nên
    // ngay khi canvas xuất hiện, vùng 0 (thường là nền, vùng lớn nhất) đã bị
    // tô đặc màu xanh dù chưa ai bấm Tab.
    drawFocusRing(ctx, p, 0, V, 100, 100, false)
    expect(ctx.strokeRect).not.toHaveBeenCalled()
  })
})

describe('drawHighlight', () => {
  it('chỉ tint vùng chưa tô của màu đang chọn', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawHighlight(ctx, p, new PaintEngine(p.regions), 2, V, 200, 200)

    // vùng 2 có 2 run ⇒ 2 fillRect
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  })

  it('không tint gì khi màu đó đã tô xong', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(2, 2)

    drawHighlight(ctx, p, e, 2, V, 200, 200)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('colorIndex null → không vẽ gì, chỉ xoá', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawHighlight(ctx, p, new PaintEngine(p.regions), null, V, 200, 200)
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})
