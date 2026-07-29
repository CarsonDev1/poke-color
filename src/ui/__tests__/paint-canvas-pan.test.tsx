import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'
import { PaintCanvas } from '@/ui/components/paint-canvas'

/** 4×2, hai vùng dọc */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 2, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 2, anchorY: 0, anchorR: 2, hasLabel: true },
  ]
  return assemblePuzzle({ width: 4, height: 2, palette, regionCount: 2, regionMap }, regions)
}

function setup(tool: 'paint' | 'pan', onPaintRegion = vi.fn()) {
  const p = puzzle()
  render(
    <PaintCanvas
      puzzle={p}
      engine={new PaintEngine(p.regions)}
      selectedColor={0}
      onPaintRegion={onPaintRegion}
      onFirstPointer={vi.fn()}
      width={200}
      height={100}
      revision={0}
      tool={tool}
    />,
  )
  const surface = screen.getByRole('application', { name: /tranh tô màu/i })
  // jsdom không có setPointerCapture
  ;(surface as HTMLElement & { setPointerCapture: () => void }).setPointerCapture = () => {}
  return { surface, onPaintRegion }
}

/** một pointer event có pointerId — mặc định của fireEvent là undefined */
function ptr(surface: Element, type: 'pointerDown' | 'pointerMove' | 'pointerUp', init: Record<string, unknown>) {
  fireEvent[type](surface, { pointerId: 1, buttons: 1, ...init })
}

describe('công cụ Tô', () => {
  it('kéo một ngón thì TÔ, không di chuyển tranh', () => {
    const { surface, onPaintRegion } = setup('paint')
    ptr(surface, 'pointerDown', { clientX: 10, clientY: 10 })
    expect(onPaintRegion).toHaveBeenCalled()
  })

  it('con trỏ là crosshair', () => {
    const { surface } = setup('paint')
    expect((surface as HTMLElement).style.cursor).toBe('crosshair')
  })
})

describe('công cụ Kéo', () => {
  /**
   * Đây là lỗi được sửa: trước đây pan CHỈ có ở chuột giữa hoặc giữ Space, nên
   * trên màn hình cảm ứng zoom vào rồi là không thể di chuyển tranh nữa.
   */
  it('kéo một ngón thì KHÔNG tô — đó là lý do công cụ này tồn tại', () => {
    const { surface, onPaintRegion } = setup('pan')
    ptr(surface, 'pointerDown', { clientX: 10, clientY: 10 })
    ptr(surface, 'pointerMove', { clientX: 60, clientY: 40 })
    ptr(surface, 'pointerUp', { clientX: 60, clientY: 40 })
    expect(onPaintRegion).not.toHaveBeenCalled()
  })

  it('con trỏ là grab để người dùng biết cú kéo tới sẽ di chuyển', () => {
    const { surface } = setup('pan')
    expect((surface as HTMLElement).style.cursor).toBe('grab')
  })
})

describe('hai ngón', () => {
  /**
   * Cử chỉ mà người dùng thử ĐẦU TIÊN khi muốn di chuyển tranh trên cảm ứng.
   * Ngón thứ hai chạm xuống phải HOÀN TÁC ý định tô của ngón đầu, nếu không mỗi
   * lần zoom là tô nhầm một vệt.
   */
  it('ngón thứ hai chạm xuống ⇒ chuyển sang pinch, ngón đầu không tô tiếp', () => {
    const { surface, onPaintRegion } = setup('paint')
    ptr(surface, 'pointerDown', { pointerId: 1, clientX: 10, clientY: 10 })
    const callsAfterFirst = onPaintRegion.mock.calls.length

    ptr(surface, 'pointerDown', { pointerId: 2, clientX: 80, clientY: 60 })
    // di chuyển cả hai ngón — không được sinh thêm lượt tô nào
    ptr(surface, 'pointerMove', { pointerId: 1, clientX: 20, clientY: 20 })
    ptr(surface, 'pointerMove', { pointerId: 2, clientX: 90, clientY: 70 })

    expect(onPaintRegion.mock.calls.length).toBe(callsAfterFirst)
  })

  /**
   * Nhấc một ngón mà quay lại chế độ tô thì ngón còn lại đang trên màn hình sẽ
   * vẽ một vệt ngoài ý muốn.
   */
  it('nhấc MỘT ngón khi đang pinch ⇒ ngón còn lại vẫn không tô', () => {
    const { surface, onPaintRegion } = setup('paint')
    ptr(surface, 'pointerDown', { pointerId: 1, clientX: 10, clientY: 10 })
    ptr(surface, 'pointerDown', { pointerId: 2, clientX: 80, clientY: 60 })
    const before = onPaintRegion.mock.calls.length

    ptr(surface, 'pointerUp', { pointerId: 2, clientX: 80, clientY: 60 })
    ptr(surface, 'pointerMove', { pointerId: 1, clientX: 40, clientY: 30 })

    expect(onPaintRegion.mock.calls.length).toBe(before)
  })

  it('nhấc HẾT ngón rồi chạm lại ⇒ tô được bình thường', () => {
    const { surface, onPaintRegion } = setup('paint')
    ptr(surface, 'pointerDown', { pointerId: 1, clientX: 10, clientY: 10 })
    ptr(surface, 'pointerDown', { pointerId: 2, clientX: 80, clientY: 60 })
    ptr(surface, 'pointerUp', { pointerId: 1, clientX: 10, clientY: 10 })
    ptr(surface, 'pointerUp', { pointerId: 2, clientX: 80, clientY: 60 })

    const before = onPaintRegion.mock.calls.length
    ptr(surface, 'pointerDown', { pointerId: 3, clientX: 30, clientY: 30 })
    expect(onPaintRegion.mock.calls.length).toBeGreaterThan(before)
  })
})
