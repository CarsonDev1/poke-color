import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { SoundBoard } from '@/audio/synth'
import { loadProgress, resetDatabaseForTests, saveProgress } from '@/data/local-cache'
import { usePaint } from '@/ui/hooks/use-paint'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

// Mặc định uỷ nhiệm cho implementation THẬT (ghi vào fake-indexeddb) — mọi
// test hiện có tiếp tục chạy với hành vi lưu thật. Chỉ những test I3 dưới đây
// mới ghi đè một lần bằng `mockRejectedValueOnce` để mô phỏng IndexedDB từ
// chối ghi (vd QuotaExceededError khi bộ nhớ trình duyệt đầy).
//
// `loadProgress` cũng được bọc (uỷ nhiệm y hệt bản thật) để `waitForRestore`
// bên dưới lấy lại được ĐÚNG promise mà effect phục hồi tiến độ của
// `usePaint` đã await — xem giải thích tại `waitForRestore`.
vi.mock('@/data/local-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/local-cache')>()
  return { ...actual, saveProgress: vi.fn(actual.saveProgress), loadProgress: vi.fn(actual.loadProgress) }
})

/** 6×1: 3 vùng, màu 0, 1, 1 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 2, minX: 0, minY: 0, maxX: 1, maxY: 0, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 2, minX: 2, minY: 0, maxX: 3, maxY: 0, anchorX: 2, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 2, colorIndex: 1, area: 2, minX: 4, minY: 0, maxX: 5, maxY: 0, anchorX: 4, anchorY: 0, anchorR: 1, hasLabel: true },
  ]
  return assemblePuzzle({ width: 6, height: 1, palette, regionCount: 3, regionMap }, regions)
}

function silentSound(): SoundBoard {
  const sb = new SoundBoard(() => {
    throw new Error('không có audio trong test')
  })
  return sb
}

/**
 * Đợi lượt phục hồi tiến độ (effect nạp tiến độ đã lưu trong `usePaint`) ổn
 * định — tức `restoredRef` của hook đã chuyển thành `true` — TRƯỚC KHI test
 * gọi `paint`/`flush`. Cần thiết từ khi `writeProgress` gác ghi theo
 * `restoredRef` (sửa hazard "flush() xoá sạch tiến độ vừa phục hồi", xem
 * `use-paint.ts`): `renderHook` rồi `act(() => paint(0))` ngay lập tức (như
 * mọi test ở đây từng làm) chạy TRƯỚC KHI `loadProgress` (bất đồng bộ) của
 * effect restore kịp resolve, nên `save()` bên trong `paint()` bị gác thành
 * no-op — đúng như production, chỉ khác là production luôn có đủ thời gian
 * phản ứng của người dùng để lượt đọc đó resolve trước khi ai kịp tô.
 *
 * Lấy lại ĐÚNG cái promise mà effect restore đã `await` (qua
 * `vi.mocked(loadProgress).mock.results`, có được vì `loadProgress` đã được
 * bọc ở `vi.mock` phía trên) rồi tự `await` promise đó — không gọi
 * `loadProgress` một lần MỚI. Vì đặc tả ECMAScript đảm bảo các phản ứng
 * `.then()` gắn vào CÙNG một promise chạy theo đúng thứ tự đã gắn, và effect
 * restore gắn `.then()` của nó lúc mount (trước khi test này có cơ hội chạy
 * gì), `await` lại cùng promise ở đây đảm bảo phản ứng đó (đặt
 * `restoredRef.current = true`) đã chạy xong trước khi hàm này trả về.
 */
async function waitForRestore(): Promise<void> {
  const results = vi.mocked(loadProgress).mock.results
  const last = results[results.length - 1]
  if (!last) return
  await act(async () => {
    await last.value.catch(() => {
      // Effect restore tự bắt lỗi này (catch riêng) và vẫn mở khoá
      // `restoredRef` — không có gì để test này làm thêm.
    })
  })
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

// LƯU Ý: `puzzle()` phải được gọi MỘT LẦN và giữ trong biến `p`, rồi truyền
// cùng một tham chiếu vào usePaint ở mọi render. `renderHook(() =>
// usePaint('p1', puzzle(), ...))` gọi lại `puzzle()` mỗi lần callback chạy —
// tức là mỗi lần TestComponent re-render (mọi setState bên trong hook đều
// re-render nó) — nên đối số `puzzle` có tham chiếu MỚI ở mỗi render. Vì
// `engine` trong hook được `useMemo` khoá theo tham chiếu `puzzle`, nó sẽ bị
// tạo lại (rỗng) ngay sau lần act() thứ hai trở đi, xoá sạch tiến độ vừa tô.
// Đã xác nhận bằng thực nghiệm: giữ nguyên `puzzle()` gọi trực tiếp làm 5/14
// test fail (filledCount luôn về 0); hoist ra biến `p` thì pass. Đây là lỗi ở
// cách dựng fixture test, không phải ở hook — trong ứng dụng thật, `puzzle`
// truyền vào usePaint là giá trị đã tải một lần và giữ ổn định qua các lần
// render, không bị dựng lại mỗi render như factory function ở đây.
describe('usePaint', () => {
  it('khởi tạo với tiến độ 0 và chưa chọn màu', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    expect(result.current.filledCount).toBe(0)
    expect(result.current.progress).toBe(0)
    expect(result.current.selectedColor).toBeNull()
  })

  it('chưa chọn màu thì paint không làm gì', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.paint(0))
    expect(result.current.filledCount).toBe(0)
  })

  it('chọn màu đúng rồi tô → tiến độ tăng', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    expect(result.current.filledCount).toBe(1)
  })

  it('tô sai màu → không đổi tiến độ', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(1))
    expect(result.current.filledCount).toBe(0)
  })

  it('remaining đếm đúng số vùng còn lại mỗi màu', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    expect(Array.from(result.current.remaining)).toEqual([1, 2])

    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    expect(Array.from(result.current.remaining)).toEqual([1, 1])
  })

  it('TỰ CHỌN màu tiếp theo khi màu đang chọn đã tô xong', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    // màu 0 đã hết vùng ⇒ phải tự nhảy sang màu 1
    expect(result.current.selectedColor).toBe(1)
  })

  it('không tự đổi màu khi màu đang chọn vẫn còn vùng', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    expect(result.current.selectedColor).toBe(1)
  })

  it('isComplete khi tô hết', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    act(() => result.current.paint(2))
    expect(result.current.isComplete).toBe(true)
    expect(result.current.progress).toBe(1)
  })

  it('announcement nêu số vùng còn lại', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    expect(result.current.announcement).toMatch(/2/)
  })

  it('reset xoá tiến độ', () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.reset())
    expect(result.current.filledCount).toBe(0)
  })

  it('flush ghi tiến độ xuống IndexedDB', async () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    await act(async () => {
      await result.current.flush()
    })

    const saved = await loadProgress('p1')
    expect(saved?.filledCount).toBe(1)
  })

  it('I12: tô một vùng → lưu IndexedDB NGAY, không phải chờ debounce (debounce chỉ dành cho đẩy Supabase ở Plan 2, không phải ghi cục bộ — spec §8)', async () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    // KHÔNG advance timer nào, KHÔNG gọi flush() — nếu ghi cục bộ còn bị
    // debounce 1.5s che chắn, waitFor mặc định (1000ms) sẽ timeout trước khi
    // bản ghi xuất hiện.
    await waitFor(async () => {
      expect((await loadProgress('p1'))?.filledCount).toBe(1)
    })
  })

  it('I12: sự kiện pagehide flush tiến độ — đóng tab không unmount nên effect dọn dẹp không chạy', async () => {
    vi.useFakeTimers()
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    // Đúng 1000ms — đủ để `activeSeconds` tăng một tick (setInterval mốc
    // 1000ms), nhưng KHÔNG advance thêm gì nữa: test này cô lập vai trò của
    // listener `pagehide`, không phải hiệu ứng phụ của ghi tức thì ở trên.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    vi.useRealTimers()

    const saved = await loadProgress('p1')
    expect(saved?.filledCount).toBe(1)
    expect(saved?.activeSeconds).toBeGreaterThanOrEqual(1)
  })

  it('nạp lại tiến độ đã lưu khi mount lại', async () => {
    const p = puzzle()
    const first = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => first.result.current.selectColor(0))
    act(() => first.result.current.paint(0))
    await act(async () => {
      await first.result.current.flush()
    })
    first.unmount()

    const again = renderHook(() => usePaint('p1', p, silentSound()))
    await waitFor(() => {
      expect(again.result.current.filledCount).toBe(1)
    })
  })

  it('I3: lưu tiến độ thất bại (IndexedDB từ chối ghi) → saveError được set, không throw', async () => {
    const p = puzzle()
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error('QuotaExceededError'))
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => result.current.selectColor(0))
    // Từ I12: `paint()` tự gọi `save()` NGAY (fire-and-forget), không còn
    // cần `flush()` tường minh để kích hoạt lượt ghi — `waitFor` đợi
    // microtask bên trong `save()` chạy xong.
    act(() => result.current.paint(0))

    await waitFor(() => expect(result.current.saveError).toMatch(/không lưu được tiến độ/i))
  })

  it('I3: lưu thành công sau một lần lỗi → saveError được xoá', async () => {
    const p = puzzle()
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error('lỗi tạm thời'))
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    await waitFor(() => expect(result.current.saveError).not.toBeNull())

    // Lượt tô kế tiếp tự gọi save() lại — lần này không bị mock từ chối nữa.
    act(() => result.current.paint(1))
    await waitFor(() => expect(result.current.saveError).toBeNull())
  })

  it('completedAt được ghi khi hoàn thành', async () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    await waitForRestore()
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    act(() => result.current.paint(2))
    await act(async () => {
      await result.current.flush()
    })

    expect((await loadProgress('p1'))?.completedAt).toBeGreaterThan(0)
  })
})
