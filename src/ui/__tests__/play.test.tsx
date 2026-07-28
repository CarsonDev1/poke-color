import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
import { Blob as NodeBlob } from 'node:buffer'
// jsdom trong môi trường test không có CompressionStream/DecompressionStream,
// và Blob của jsdom thiếu .stream() (dùng trong compress.ts, gọi từ savePuzzle
// ở beforeEach) nên phải thay bằng Blob của Node — như Task 21/22 đã làm.
// Import đổi tên (không phải `Blob`) để không đè lên kiểu DOM `Blob` toàn cục —
// nếu không, `new Blob(...)` trong file này sẽ nhận kiểu `import("buffer").Blob`,
// xung đột với các API DOM (`Blob` là tham số/kiểu trả về) và làm typecheck vỡ.
Object.assign(globalThis, { CompressionStream, DecompressionStream, Blob: NodeBlob })

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import { resetDatabaseForTests, savePuzzle, loadProgress } from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'
import PlayRoute from '@/routes/play'

const palette: Rgb[] = [
  [255, 0, 0],
  [0, 0, 255],
]
const regionMap = new Uint32Array([0, 1, 2, 3])
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

// ctx được share cho MỌI canvas (base/overlay/label, kể cả canvas được tạo lại
// sau khi PaintCanvas remount) — nhờ vậy đếm số lần gọi drawImage/fillRect
// trước và sau một hành động cho biết layer có được vẽ lại hay không.
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

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  // jsdom không cài đặt Pointer Capture; PaintCanvas gọi setPointerCapture khi
  // pointerdown để giữ drag sống khi con trỏ rời khỏi phần tử — cần cho pan và
  // kéo-tô thật trong browser, nên KHÔNG bỏ lời gọi này khỏi component, chỉ
  // stub ở đây (xem Task 27's paint-canvas.test.tsx, cùng lý do).
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
    AudioContext: class {
      state = 'running'
      currentTime = 0
      destination = {}
      resume() {
        return Promise.resolve()
      }
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
      }
    },
  })
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
})

beforeEach(async () => {
  await resetDatabaseForTests()
  await savePuzzle(
    {
      id: 'p1',
      title: 'Tranh thử',
      createdAt: 1,
      width: 4,
      height: 1,
      colorCount: 2,
      regionCount: 4,
      palette,
      params: DEFAULT_PARAMS,
      usedMinArea: 1,
    },
    await gzip(encodePuzzleBin({ width: 4, height: 1, palette, regionCount: 4, regionMap })),
    await gzip(new TextEncoder().encode(encodeRegions(regions))),
    new Blob([new Uint8Array([1])], { type: 'image/png' }),
  )
})

function renderPlay() {
  return render(
    <MemoryRouter initialEntries={['/play/p1']}>
      <Routes>
        <Route path="/play/:id" element={<PlayRoute />} />
        <Route path="/library" element={<div>thư viện</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayRoute', () => {
  it('nạp puzzle và hiện tên, tiến độ, palette', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    expect(screen.getByRole('radiogroup', { name: /bảng màu/i })).toBeTruthy()
    expect(screen.getByText(/0\s*\/\s*4/)).toBeTruthy()
  })

  it('có vùng aria-live cho thông báo tiến độ', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toBeTruthy()
  })

  it('phím số 1 chọn màu 1', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.keyboard('1')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /màu 1/i }).getAttribute('aria-checked')).toBe('true'),
    )
  })

  it('bấm nút màu rồi tô bằng bàn phím → tiến độ tăng', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByText(/1\s*\/\s*4/)).toBeTruthy())
  })

  it('nút "Xem ảnh gốc" mặc định KHÔNG hiện ảnh', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    expect(screen.queryByAltText(/ảnh gốc/i)).toBeNull()
    expect(screen.getByRole('button', { name: /xem ảnh gốc/i })).toBeTruthy()
  })

  it('bấm "Xem ảnh gốc" thì hiện ảnh', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xem ảnh gốc/i }))
    await waitFor(() => expect(screen.getByAltText(/ảnh gốc/i)).toBeTruthy())
  })

  it('nút tắt tiếng đổi trạng thái', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    const btn = screen.getByRole('button', { name: /tắt tiếng|bật tiếng/i })
    const before = btn.textContent
    await userEvent.click(btn)
    await waitFor(() => expect(screen.getByRole('button', { name: /tắt tiếng|bật tiếng/i }).textContent).not.toBe(before))
  })

  it('"Tô lại từ đầu" cần xác nhận rồi mới xoá, và vẽ lại canvas từ đầu', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByText(/1\s*\/\s*4/)).toBeTruthy())

    // `drawImage` trên layer base chỉ được gọi từ hiệu ứng vẽ lại toàn bộ
    // (`redrawAll` trong PaintCanvas, cho bitmap viền) — hiệu ứng đó chỉ chạy
    // lại khi PaintCanvas MOUNT (mount ban đầu, hoặc remount qua đổi `key`).
    // Việc tô một vùng ở trên KHÔNG gọi drawImage lần nữa (chỉ fillRect trực
    // tiếp trên canvas hiện có), nên đếm số lần gọi drawImage ngay trước khi
    // reset cho ta một baseline ổn định để so sánh sau khi xác nhận reset.
    const drawImageCallsBeforeReset = ctx.drawImage.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: /tô lại từ đầu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^xoá tiến độ$/i }))
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*4/)).toBeTruthy())

    // Nếu PaintCanvas không được remount (chỉ dựa vào tick/filledCount như
    // trước khi sửa), layer base giữ nguyên canvas cũ và `redrawAll` không
    // chạy lại ⇒ drawImage không tăng, và bức tranh "tô lại" nhìn vẫn còn
    // màu cũ dù số đếm đã về 0. Chờ đợi (`waitFor`) vì `createImageBitmap`
    // trong `redrawAll` là async.
    await waitFor(() =>
      expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(drawImageCallsBeforeReset),
    )
  })

  it('id không tồn tại → hiện lỗi, không crash', async () => {
    render(
      <MemoryRouter initialEntries={['/play/khong-co']}>
        <Routes>
          <Route path="/play/:id" element={<PlayRoute />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/không tìm thấy/i))
  })

  it('tô xong hết → hiện banner hoàn thành', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    surface.focus()
    // vùng 0 và 2 là màu 1; vùng 1 và 3 là màu 2
    await userEvent.keyboard('{Enter}{ArrowRight}{ArrowRight}{Enter}')
    await userEvent.click(screen.getByRole('radio', { name: /màu 2/i }))
    surface.focus()
    await userEvent.keyboard('{ArrowLeft}{Enter}{ArrowRight}{ArrowRight}{Enter}')

    await waitFor(() => expect(screen.getByRole('dialog', { name: /hoàn thành/i })).toBeTruthy())
  })

  it('lưu tiến độ khi unmount', async () => {
    const { unmount } = renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')

    unmount()
    await waitFor(async () => expect((await loadProgress('p1'))?.filledCount).toBe(1))
  })
})
