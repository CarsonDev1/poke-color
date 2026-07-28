import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

beforeAll(() => {
  // jsdom không có canvas 2D thật; stub đủ để component chạy
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  // jsdom không cài đặt Pointer Capture; component gọi setPointerCapture khi
  // pointerdown để giữ drag sống khi con trỏ rời khỏi phần tử — cần cho pan
  // và kéo-tô thật, nên KHÔNG bỏ lời gọi này khỏi component, chỉ stub ở đây.
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  Object.assign(globalThis, {
    createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
    // `erasableSyntaxOnly` cấm cú pháp constructor parameter-property (public
    // data/width/height ngay trong tham số) — phải khai trường rồi gán tay.
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

/** 4×1: 4 vùng, màu 0,1,0,1 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 1, 2, 3])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [0, 1, 0, 1].map((colorIndex, id) => ({
    id,
    colorIndex,
    area: 1,
    minX: id,
    minY: 0,
    maxX: id,
    maxY: 0,
    anchorX: id,
    anchorY: 0,
    anchorR: 1,
    hasLabel: true,
  })) as RegionMeta[]
  return assemblePuzzle({ width: 4, height: 1, palette, regionCount: 4, regionMap }, regions)
}

// Chỉ `selectedColor` và `height` từng bị ghi đè trong các test dưới đây.
// Giữ `over` hẹp đúng bằng đó thay vì `Partial<toàn bộ props>`: nếu
// `onPaintRegion`/`onFirstPointer` cũng nằm trong kiểu có thể ghi đè,
// TypeScript suy ra kiểu hợp nhất `Mock | (regionId: number) => void` cho
// hai trường đó (vì phía `over` là optional), và union ấy mất thuộc tính
// `.mock` mà các assertion bên dưới cần — `erasableSyntaxOnly` không bắt lỗi
// này nhưng `tsc --noEmit` thì có.
function setup(over: Partial<Pick<Parameters<typeof PaintCanvas>[0], 'selectedColor' | 'height'>> = {}) {
  const p = puzzle()
  const props = {
    puzzle: p,
    engine: new PaintEngine(p.regions),
    selectedColor: 0 as number | null,
    onPaintRegion: vi.fn<(regionId: number) => void>(),
    onFirstPointer: vi.fn<() => void>(),
    width: 400,
    height: 100,
    ...over,
  }
  render(<PaintCanvas {...props} />)
  return props
}

describe('PaintCanvas', () => {
  it('có vùng tương tác focus được bằng bàn phím', () => {
    setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    expect(surface.getAttribute('tabindex')).toBe('0')
  })

  it('bấm vào tranh → gọi onPaintRegion với id vùng đúng', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    // fit: ảnh 4×1 trong khung 400×100 ⇒ scale 100, canh giữa dọc
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).toHaveBeenCalledWith(1)
  })

  it('lần chạm đầu tiên gọi onFirstPointer đúng một lần', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer({ target: surface, coords: { clientX: 50, clientY: 50 }, keys: '[MouseLeft]' })
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onFirstPointer).toHaveBeenCalledTimes(1)
  })

  it('bấm ra ngoài ảnh → không gọi onPaintRegion', async () => {
    const props = setup({ height: 400 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    await userEvent.pointer({ target: surface, coords: { clientX: 5, clientY: 5 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })

  it('phím mũi tên phải rồi Enter → tô vùng kế tiếp', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(props.onPaintRegion).toHaveBeenCalledWith(1)
  })

  it('mũi tên trái ở vùng đầu không đi âm', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Enter}')
    expect(props.onPaintRegion).toHaveBeenCalledWith(0)
  })

  it('Space cũng tô vùng đang focus', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}[Space]')
    expect(props.onPaintRegion).toHaveBeenCalledWith(2)
  })

  it('kéo chuột trái tô nhiều vùng liên tiếp', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer([
      { target: surface, coords: { clientX: 50, clientY: 50 }, keys: '[MouseLeft>]' },
      { target: surface, coords: { clientX: 150, clientY: 50 } },
      { target: surface, coords: { clientX: 250, clientY: 50 } },
      { target: surface, keys: '[/MouseLeft]' },
    ])

    const ids = props.onPaintRegion.mock.calls.map((c) => c[0])
    expect(ids).toEqual(expect.arrayContaining([0, 1, 2]))
  })

  it('không tô lại cùng một vùng khi rê trong lòng nó', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer([
      { target: surface, coords: { clientX: 20, clientY: 50 }, keys: '[MouseLeft>]' },
      { target: surface, coords: { clientX: 40, clientY: 50 } },
      { target: surface, coords: { clientX: 60, clientY: 50 } },
      { target: surface, keys: '[/MouseLeft]' },
    ])

    expect(props.onPaintRegion.mock.calls.filter((c) => c[0] === 0)).toHaveLength(1)
  })

  it('chưa chọn màu thì không tô', async () => {
    const props = setup({ selectedColor: null })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })
})
