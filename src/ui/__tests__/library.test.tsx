import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
import { Blob as NodeBlob } from 'node:buffer'
// jsdom trong môi trường test không có CompressionStream/DecompressionStream,
// và Blob của jsdom thiếu .stream() (dùng trong compress.ts, gọi từ savePuzzle
// ở beforeEach) nên phải thay bằng Blob của Node — như Task 21/22/28 đã làm.
// Import đổi tên (không phải `Blob`) để không đè lên kiểu DOM `Blob` toàn cục —
// nếu không, `new Blob(...)` trong file này sẽ nhận kiểu `import("buffer").Blob`,
// xung đột với các API DOM và làm typecheck vỡ.
Object.assign(globalThis, { CompressionStream, DecompressionStream, Blob: NodeBlob })

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import {
  deletePuzzle,
  listPuzzles,
  resetDatabaseForTests,
  saveProgress,
  savePuzzle,
  saveThumbnail,
} from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'
import LibraryRoute from '@/routes/library'

// Mặc định uỷ nhiệm cho implementation thật (fake-indexeddb) — chỉ các test
// I3 dưới đây ghi đè MỘT LẦN bằng `mockRejectedValueOnce` để mô phỏng
// IndexedDB từ chối (bị chặn ở chế độ duyệt riêng tư, hoặc xoá thất bại).
vi.mock('@/data/local-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/local-cache')>()
  return {
    ...actual,
    listPuzzles: vi.fn(actual.listPuzzles),
    deletePuzzle: vi.fn(actual.deletePuzzle),
  }
})

const palette: Rgb[] = [[1, 2, 3]]
const regions: RegionMeta[] = [
  { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 3, maxY: 0, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: false },
]

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:thumb'), writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
})

async function seed(id: string, title: string, createdAt: number, regionCount = 4) {
  await savePuzzle(
    {
      id,
      title,
      createdAt,
      width: 4,
      height: 1,
      colorCount: 1,
      regionCount,
      palette,
      params: DEFAULT_PARAMS,
      usedMinArea: 1,
    },
    await gzip(encodePuzzleBin({ width: 4, height: 1, palette, regionCount: 1, regionMap: new Uint32Array(4) })),
    await gzip(new TextEncoder().encode(encodeRegions(regions))),
    new Blob([new Uint8Array([1])]),
  )
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryRoute />} />
        <Route path="/new" element={<div>màn tạo mới</div>} />
        <Route path="/play/:id" element={<div>màn chơi</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LibraryRoute', () => {
  it('thư viện rỗng → gợi ý tạo tranh mới', async () => {
    renderLibrary()
    await waitFor(() => expect(screen.getByText(/chưa có tranh nào/i)).toBeTruthy())
    expect(screen.getByRole('link', { name: /tạo tranh mới/i })).toBeTruthy()
  })

  it('hiện danh sách puzzle, mới nhất trước', async () => {
    await seed('a', 'Tranh cũ', 100)
    await seed('b', 'Tranh mới', 900)
    renderLibrary()

    await waitFor(() => expect(screen.getByText('Tranh mới')).toBeTruthy())
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(['Tranh mới', 'Tranh cũ'])
  })

  it('hiện tiến độ theo phần trăm', async () => {
    await seed('a', 'Tranh', 100, 4)
    await saveProgress({
      puzzleId: 'a',
      filled: new Uint8Array([0b0000_0011]),
      filledCount: 2,
      activeSeconds: 0,
      completedAt: null,
      updatedAt: 0,
    })
    renderLibrary()
    await waitFor(() => expect(screen.getByText(/50%/)).toBeTruthy())
  })

  it('puzzle chưa có thumbnail hiện placeholder', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())
    expect(screen.getByText(/chưa tô/i)).toBeTruthy()
  })

  it('có thumbnail thì hiện ảnh', async () => {
    await seed('a', 'Tranh', 100)
    await saveThumbnail('a', new Blob([new Uint8Array([1])], { type: 'image/webp' }))
    renderLibrary()
    await waitFor(() => expect(screen.getByAltText(/Tranh/)).toBeTruthy())
  })

  it('mỗi card có link vào màn chơi', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())
    expect(screen.getByRole('link', { name: /tô tranh/i }).getAttribute('href')).toBe('/play/a')
  })

  it('xoá cần xác nhận, rồi card biến mất', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xoá/i }))
    await userEvent.click(screen.getByRole('button', { name: /^xoá tranh$/i }))

    await waitFor(() => expect(screen.queryByText('Tranh')).toBeNull())
    expect(await listPuzzles()).toHaveLength(0)
  })

  it('huỷ xác nhận thì không xoá', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xoá/i }))
    await userEvent.click(screen.getByRole('button', { name: /huỷ/i }))

    expect(screen.getByText('Tranh')).toBeTruthy()
    expect(await listPuzzles()).toHaveLength(1)
  })

  it('xoá một card thì thu hồi URL thumbnail của lượt trước, không rò rỉ', async () => {
    // Bẫy: nếu remove() gọi setCards(await reload()) mà không revoke lô URL
    // thumbnail CŨ trước khi thay bằng lô MỚI, mỗi lần xoá sẽ rò rỉ URL của
    // mọi card còn lại (chúng vẫn hiện, nhưng object URL cũ không bao giờ
    // được thu hồi cho tới khi unmount toàn màn — tức gần như không bao giờ).
    await seed('a', 'Tranh A', 100)
    await seed('b', 'Tranh B', 200)
    await saveThumbnail('a', new Blob([new Uint8Array([1])], { type: 'image/webp' }))
    await saveThumbnail('b', new Blob([new Uint8Array([2])], { type: 'image/webp' }))
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh B')).toBeTruthy())

    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>
    revoke.mockClear()

    // Xoá "Tranh B" — card đầu tiên (mới nhất trước).
    await userEvent.click(screen.getAllByRole('button', { name: /xoá/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^xoá tranh$/i }))

    await waitFor(() => expect(screen.queryByText('Tranh B')).toBeNull())
    expect(screen.getByText('Tranh A')).toBeTruthy()

    // Lô URL cũ (2 URL, cho cả A lẫn B) phải được thu hồi ngay khi lô mới
    // (1 URL, chỉ cho A) được lắp vào — không phải chỉ lúc unmount.
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it('I3: mở thư viện thất bại (IndexedDB bị chặn) → hiện lỗi kèm link tạo tranh mới, không kẹt ở "Đang tải…" mãi mãi', async () => {
    vi.mocked(listPuzzles).mockRejectedValueOnce(new Error('IndexedDB bị chặn'))
    renderLibrary()

    // Trước khi sửa: `void reload().then(...)` không có `.catch`, promise
    // reject rơi vào unhandled rejection, `cards` không bao giờ được set →
    // màn đứng mãi ở "Đang tải…", và CTA header chỉ hiện khi `cards.length >
    // 0` nên người dùng không còn lối thoát nào.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('link', { name: /tạo tranh mới/i })).toBeTruthy()
  })

  it('I3: xoá thất bại → hiện lỗi, card KHÔNG biến mất khỏi danh sách', async () => {
    await seed('a', 'Tranh', 100)
    vi.mocked(deletePuzzle).mockRejectedValueOnce(new Error('xoá lỗi'))
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xoá/i }))
    await userEvent.click(screen.getByRole('button', { name: /^xoá tranh$/i }))

    // Trước khi sửa: `onClick={() => void remove(askDelete)}` không có catch;
    // `deletePuzzle` reject là unhandled rejection và hộp thoại xác nhận đứng
    // yên không phản hồi gì, không có dấu hiệu nào cho người dùng biết.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Tranh')).toBeTruthy()
    expect(await listPuzzles()).toHaveLength(1)
  })
})
