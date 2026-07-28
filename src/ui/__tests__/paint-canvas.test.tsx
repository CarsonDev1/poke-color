import { describe, expect, it, vi, beforeAll } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine, type PaintResult } from '@/core/engine/paint-engine'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

// Ghi lại `fillStyle` TẠI THỜI ĐIỂM gọi fillRect (không phải giá trị cuối
// cùng của ctx, vốn bị các lần vẽ sau ghi đè) — cần để test I14 phân biệt
// được canvas có tô lạc quan (optimistic paint) bằng màu palette hay không.
const fillRectCalls: { fillStyle: string }[] = []
// Số lần strokeRect được gọi (không quan tâm tham số) — dùng để xác nhận
// hiệu ứng vẽ lại labels/focus-ring THỰC SỰ chạy lại khi focusRegion đổi
// (I7), phân biệt với việc chỉ có state đổi mà không có gì được vẽ.
let strokeRectCallCount = 0

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
    fillRect: vi.fn(() => {
      fillRectCalls.push({ fillStyle: String(ctx.fillStyle) })
    }),
    strokeRect: vi.fn(() => {
      strokeRectCallCount++
    }),
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

// Chỉ `selectedColor`, `height` và `width` từng bị ghi đè trong các test dưới
// đây. Giữ `over` hẹp đúng bằng đó thay vì `Partial<toàn bộ props>`: nếu
// `onPaintRegion`/`onFirstPointer` cũng nằm trong kiểu có thể ghi đè,
// TypeScript suy ra kiểu hợp nhất `Mock | (regionId: number) => void` cho
// hai trường đó (vì phía `over` là optional), và union ấy mất thuộc tính
// `.mock` mà các assertion bên dưới cần — `erasableSyntaxOnly` không bắt lỗi
// này nhưng `tsc --noEmit` thì có.
function setup(over: Partial<Pick<Parameters<typeof PaintCanvas>[0], 'selectedColor' | 'height' | 'width'>> = {}) {
  const p = puzzle()
  const props = {
    puzzle: p,
    engine: new PaintEngine(p.regions),
    selectedColor: 0 as number | null,
    onPaintRegion: vi.fn<(regionId: number) => PaintResult | undefined>(),
    onFirstPointer: vi.fn<() => void>(),
    width: 400,
    height: 100,
    revision: 0,
    ...over,
  }
  render(<PaintCanvas {...props} />)
  return props
}

/** layer `base` luôn là canvas đầu tiên trong DOM (thứ tự base → overlay → labels) */
function baseCanvas(surface: HTMLElement): HTMLElement {
  return surface.querySelectorAll('canvas')[0] as HTMLElement
}

/** đọc lại `translate(txpx, typx) scale(s)` mà component đặt trên layer base/overlay */
function parseTransform(el: HTMLElement): { tx: number; ty: number; scale: number } {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(el.style.transform)
  if (!m) throw new Error(`không đọc được transform: "${el.style.transform}"`)
  return { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) }
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

  it('I14: cha trả status "rejected" → canvas KHÔNG tô lạc quan (không tự phán bằng regions[id].colorIndex/engine.isFilled)', async () => {
    const props = setup()
    props.onPaintRegion.mockReturnValue({ status: 'rejected', expected: 1 } as PaintResult)
    fillRectCalls.length = 0
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    // fit: ảnh 4×1 trong khung 400×100 ⇒ scale 100; điểm (150,50) trúng vùng 1
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })

    // selectedColor mặc định = 0 (đỏ, palette[0]) — nếu view vẫn tự phán theo
    // predicate cũ (`regions[1].colorIndex === selectedColor`, ở đây SAI vì
    // vùng 1 màu 1) thì đằng nào cũng không tô; test này phải phân biệt được
    // với trường hợp cha nói "filled" (dưới đây) chứ không phải trùng hợp
    // false vì hai lý do khác nhau — xem test kế tiếp.
    expect(fillRectCalls.some((c) => c.fillStyle === 'rgb(255,0,0)')).toBe(false)
  })

  it('I14: cha trả status "filled" → canvas tô lạc quan bằng đúng màu đang chọn', async () => {
    const props = setup()
    props.onPaintRegion.mockReturnValue({ status: 'filled' } as PaintResult)
    fillRectCalls.length = 0
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })

    // Cha (usePaint.paint) là nơi DUY NHẤT quyết định filled/rejected/already
    // (qua PaintEngine.tryPaint) — ở đây selectedColor=0 (đỏ) trong khi vùng 1
    // thực ra là màu 1: nếu view còn tự kiểm tra `regions[id].colorIndex`
    // (predicate cũ), nó sẽ từ chối vẽ dù cha đã nói "filled", và test này sẽ
    // fail. Test khẳng định view giờ CHỈ tin vào PaintResult của cha.
    expect(fillRectCalls.some((c) => c.fillStyle === 'rgb(255,0,0)')).toBe(true)
  })

  it('chưa chọn màu thì không tô', async () => {
    const props = setup({ selectedColor: null })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })

  // Các test zoom/pan dưới đây dùng khung 8×4 thay vì 400×100 của các test
  // trên. Lý do: ảnh 4×1 khớp (fit) vào khung 400×100 cho scale = 100, đã
  // VƯỢT QUÁ MAX_SCALE (24) — nghĩa là bất cứ thao tác zoom nào từ đó
  // (dù zoom in hay out) đều bị kẹp thẳng xuống 24, hai hướng cho cùng một
  // kết quả, không thể phân biệt được. Tệ hơn, ở mọi scale hợp lệ (≤ 24) ảnh
  // 4×1 vẫn nhỏ hơn khung 400×100 trên cả hai chiều, nên `clampPan` luôn canh
  // giữa và mọi phép pan đều bị ghi đè về (0,0) — không có gì để pan tới.
  // Khung 8×4 (cùng ảnh 4×1) cho scale fit = 2, nằm gọn trong [0.2, 24], và ở
  // scale cao hơn ảnh vượt khung theo chiều ngang nên pan thật sự có tác dụng.
  it('phím + tăng scale, phím - giảm scale, phím f trả về đúng scale fit', () => {
    setup({ width: 8, height: 4 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    const base = baseCanvas(surface)

    // fit: ảnh 4×1 trong khung 8×4 ⇒ scale = min(8/4, 4/1) = 2
    expect(parseTransform(base).scale).toBeCloseTo(2, 5)

    fireEvent.keyDown(surface, { key: '-' }) // 2 × 0.8 = 1.6
    expect(parseTransform(base).scale).toBeCloseTo(1.6, 5)

    fireEvent.keyDown(surface, { key: '+' }) // 1.6 × 1.25 = 2
    fireEvent.keyDown(surface, { key: '+' }) // 2 × 1.25 = 2.5
    expect(parseTransform(base).scale).toBeCloseTo(2.5, 5)

    fireEvent.keyDown(surface, { key: 'f' }) // fit lại đúng scale ban đầu (2 ≠ 2.5 nên phân biệt được)
    expect(parseTransform(base).scale).toBeCloseTo(2, 5)
  })

  it('cuộn chuột (deltaY âm) tăng scale', () => {
    setup({ width: 8, height: 4 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    const base = baseCanvas(surface)

    const before = parseTransform(base).scale // fit = 2
    fireEvent.wheel(surface, { deltaY: -100, clientX: 4, clientY: 2 })
    const after = parseTransform(base).scale

    // onWheel: deltaY < 0 ⇒ factor 1.15 ⇒ 2 × 1.15 = 2.3 (chưa chạm MAX_SCALE)
    expect(after).toBeCloseTo(2.3, 5)
    expect(after).toBeGreaterThan(before)
  })

  it('cuộn chuột phóng to tại một điểm vẫn giữ đúng vùng nằm dưới điểm đó', async () => {
    const props = setup({ width: 8, height: 4 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    // fit: scale 2, tx 0, ty 1 (canh giữa dọc: (4 - 1×2)/2 = 1).
    // Vùng 3 (colorIndex 1) trải image-x [3,4); điểm GIỮA vùng là ảnh (3.5, 0.5)
    // ⇒ màn hình (0 + 3.5×2, 1 + 0.5×2) = (7, 2).
    await userEvent.pointer({ target: surface, coords: { clientX: 7, clientY: 2 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).toHaveBeenCalledWith(3)
    props.onPaintRegion.mockClear()

    // zoomAbout giữ điểm ẢNH dưới con trỏ (7,2) cố định khi zoom quanh đúng
    // điểm đó — nên bấm lại đúng (7,2) sau khi zoom phải trúng lại vùng 3.
    fireEvent.wheel(surface, { deltaY: -100, clientX: 7, clientY: 2 })
    await userEvent.pointer({ target: surface, coords: { clientX: 7, clientY: 2 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).toHaveBeenCalledWith(3)
  })

  it('kéo chuột giữa: pan (transform đổi) chứ không tô', () => {
    const props = setup({ width: 8, height: 4 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    const base = baseCanvas(surface)

    // Zoom quanh tâm (4,2) trước để ảnh vượt khung theo chiều ngang, có chỗ để pan:
    // scale 2 → 2.5 (2×1.25); tx: px=(4-0)/2=2 ⇒ tx' = 0 + 2×(2-2.5) = -1
    // (clampPan giữ nguyên vì rộng ảnh 10 > khung 8, -1 nằm trong [-2, 0]).
    fireEvent.keyDown(surface, { key: '+' })
    const before = parseTransform(base)
    expect(before.tx).toBeCloseTo(-1, 5)
    props.onPaintRegion.mockClear()

    fireEvent.pointerDown(surface, { button: 1, clientX: 4, clientY: 2, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 3, clientY: 2, pointerId: 1 })
    fireEvent.pointerUp(surface, { pointerId: 1 })

    const after = parseTransform(base)
    // panBy dịch tx thêm (3-4) = -1 ⇒ -1 + (-1) = -2, vẫn trong [-2,0] nên clampPan giữ nguyên
    expect(after.tx).toBeCloseTo(-2, 5)
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })

  it('giữ Space rồi kéo chuột: pan (transform đổi) chứ không tô; auto-repeat của Space lúc đang pan không tô lại', () => {
    const props = setup({ width: 8, height: 4 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    const base = baseCanvas(surface)

    // Cùng phép zoom-quanh-tâm như test kéo chuột giữa ở trên: tx trước khi pan = -1
    fireEvent.keyDown(surface, { key: '+' })
    const before = parseTransform(base)
    expect(before.tx).toBeCloseTo(-1, 5)

    // Một lần bấm Space đơn lẻ (chưa pan) vẫn tô vùng đang focus như cũ — hành
    // vi này KHÔNG đổi (xem test "Space cũng tô vùng đang focus"). Ta chỉ
    // quan tâm những gì xảy ra TỪ lúc bắt đầu kéo, nên xoá lịch sử gọi ở đây.
    fireEvent.keyDown(surface, { key: ' ' })
    props.onPaintRegion.mockClear()

    fireEvent.pointerDown(surface, { button: 0, clientX: 4, clientY: 2, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 3, clientY: 2, pointerId: 1 })

    const after = parseTransform(base)
    expect(after.tx).toBeCloseTo(-2, 5) // giống hệt phép tính ở test kéo chuột giữa
    expect(props.onPaintRegion).not.toHaveBeenCalled() // đang pan: kéo chuột không tô

    // OS phát lại (auto-repeat) sự kiện keydown Space liên tục suốt lúc giữ
    // phím — case ' ' trong onKeyDown phải bỏ qua nhánh tô khi đang pan
    // (dragMode === 'pan') hoặc khi đây là sự kiện lặp lại (e.repeat).
    fireEvent.keyDown(surface, { key: ' ', repeat: true })
    expect(props.onPaintRegion).not.toHaveBeenCalled()

    fireEvent.pointerUp(surface, { pointerId: 1 })
  })

  it('I7: phím mũi tên đổi focusRegion → viền vùng mới thực sự được vẽ lại (strokeRect chạy lại, không chỉ state đổi)', async () => {
    setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    strokeRectCallCount = 0

    // Trước khi sửa: hiệu ứng vẽ overlay/labels chỉ phụ thuộc [puzzle, engine,
    // selectedColor, view, width, height, engine.filledCount] — không có
    // focusRegion, nên ArrowRight (chỉ đổi focusRegion) không kích hoạt vẽ lại
    // gì cả; con trỏ bàn phím tồn tại trong state nhưng vô hình trên màn hình.
    await userEvent.keyboard('{ArrowRight}')

    expect(strokeRectCallCount).toBeGreaterThan(0)
  })

  it('I7: mũi tên di chuyển focus → gọi onFocusRegionChange với id vùng mới (để /play announce qua aria-live)', async () => {
    const p = puzzle()
    const onFocusRegionChange = vi.fn()
    render(
      <PaintCanvas
        puzzle={p}
        engine={new PaintEngine(p.regions)}
        selectedColor={0}
        onPaintRegion={vi.fn()}
        onFirstPointer={vi.fn()}
        width={400}
        height={100}
        revision={0}
        onFocusRegionChange={onFocusRegionChange}
      />,
    )
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    // Lần gọi lúc mount (focusRegion mặc định = 0) không phải điều test này
    // quan tâm — chỉ quan tâm lần gọi do người dùng di chuyển con trỏ.
    onFocusRegionChange.mockClear()

    await userEvent.keyboard('{ArrowRight}')

    expect(onFocusRegionChange).toHaveBeenCalledWith(1)
  })
})
