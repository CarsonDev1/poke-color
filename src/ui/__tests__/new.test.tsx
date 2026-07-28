import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
import { Blob as NodeBlob } from 'node:buffer'
// jsdom trong môi trường test không có CompressionStream/DecompressionStream,
// và Blob của jsdom thiếu .stream() (dùng trong compress.ts, gọi từ save() ở
// đây) nên phải thay bằng Blob của Node — như các test data/* khác đã làm.
Object.assign(globalThis, { CompressionStream, DecompressionStream, Blob: NodeBlob })

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { resetDatabaseForTests, savePuzzle } from '@/data/local-cache'
import type { RegionMeta, Rgb } from '@/core/types'
import NewPuzzleRoute from '@/routes/new'

// `/new` không cần worker/canvas THẬT để test đường lỗi lưu (I3) — chỉ cần
// một kết quả "sinh puzzle" hợp lệ để đến được màn xem trước + nút "Lưu và
// tô". Dùng bin/regions THẬT (qua encodePuzzleBin/encodeRegions) để
// `assemblePuzzle` bên trong `generate()` không ném lỗi khi ráp.
const palette: Rgb[] = [
  [255, 0, 0],
  [0, 0, 255],
]
const regionMap = new Uint32Array([0, 1])
const regions: RegionMeta[] = [0, 1].map((colorIndex, id) => ({
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
const fakeBin = encodePuzzleBin({ width: 2, height: 1, palette, regionCount: 2, regionMap })
const fakeRegionsJson = encodeRegions(regions)

vi.mock('@/data/decode-image', () => ({
  decodeToRgba: vi.fn(async () => ({ data: new Uint8ClampedArray(2 * 1 * 4), width: 2, height: 1 })),
}))

vi.mock('@/data/generate-client', () => ({
  generateInWorker: vi.fn(
    async (
      _img: unknown,
      _params: unknown,
      opts?: { onProgress?: (stage: string, ratio: number) => void },
    ) => {
      opts?.onProgress?.('dong-goi', 1)
      return {
        bin: fakeBin,
        regionsJson: fakeRegionsJson,
        regionCount: 2,
        palette,
        width: 2,
        height: 1,
        usedMinArea: 1,
      }
    },
  ),
}))

// Mặc định uỷ nhiệm cho implementation thật; chỉ test I3 dưới đây ghi đè MỘT
// LẦN để mô phỏng `savePuzzle` từ chối (vd Safari cũ thiếu CompressionStream,
// hoặc QuotaExceededError vì lưu cả ảnh gốc tới 15 MB cộng hai blob gz).
vi.mock('@/data/local-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/local-cache')>()
  return { ...actual, savePuzzle: vi.fn(actual.savePuzzle) }
})

function pngFile(name = 'a.png', size = 100): File {
  const f = new File([new Uint8Array(size)], name, { type: 'image/png' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeAll(() => {
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
  Object.assign(globalThis, {
    createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
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

beforeEach(async () => {
  await resetDatabaseForTests()
})

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewPuzzleRoute />} />
        <Route path="/play/:id" element={<div>màn chơi</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NewPuzzleRoute', () => {
  it('I3: lưu thất bại (vd QuotaExceededError) → hiện lỗi, không rơi vào im lặng', async () => {
    vi.mocked(savePuzzle).mockRejectedValueOnce(new Error('QuotaExceededError: đã đầy bộ nhớ'))
    renderNew()

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile())
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /lưu và tô/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    const saveBtn = screen.getByRole('button', { name: /lưu và tô/i })

    await userEvent.click(saveBtn)

    // Trước khi sửa: `onClick={() => void save()}` không có catch. `save()`
    // ném ngay tại `gzip`/`savePuzzle` reject là unhandled rejection — người
    // dùng bấm "Lưu và tô" và KHÔNG có gì xảy ra, không lỗi, không điều
    // hướng, không dấu hiệu nào.
    //
    // Trang đã có SẴN một alert khác (cảnh báo chất lượt "quá thô" từ
    // checkQuality, không liên quan lỗi lưu) — phải tìm đúng alert MỚI nói về
    // lỗi lưu, không phải chỉ alert đầu tiên tìm thấy.
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((a) => /quotaexceeded/i.test(a.textContent ?? ''))).toBe(true)
    })
  })

  it('lưu thành công → điều hướng sang /play/:id', async () => {
    renderNew()

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile())
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /lưu và tô/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    const saveBtn = screen.getByRole('button', { name: /lưu và tô/i })

    await userEvent.click(saveBtn)
    await waitFor(() => expect(screen.getByText('màn chơi')).toBeTruthy())
  })
})
