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
vi.mock('@/data/local-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/local-cache')>()
  return { ...actual, saveProgress: vi.fn(actual.saveProgress) }
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
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    await act(async () => {
      await result.current.flush()
    })

    const saved = await loadProgress('p1')
    expect(saved?.filledCount).toBe(1)
  })

  it('tự lưu sau debounce', async () => {
    vi.useFakeTimers()
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    vi.useRealTimers()

    await waitFor(async () => {
      expect((await loadProgress('p1'))?.filledCount).toBe(1)
    })
  })

  it('nạp lại tiến độ đã lưu khi mount lại', async () => {
    const p = puzzle()
    const first = renderHook(() => usePaint('p1', p, silentSound()))
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

  it('I3: lưu tiến độ thất bại (IndexedDB từ chối ghi) → saveError được set, flush KHÔNG throw', async () => {
    const p = puzzle()
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error('QuotaExceededError'))
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    // Nếu save() không tự bắt lỗi, `flush()` (await save()) sẽ reject và
    // `act(async () => await result.current.flush())` ném ra ngoài — hỏng cả
    // test thay vì cho ta assert saveError. Bản thân việc await không throw ở
    // đây đã là một phần của assertion.
    await act(async () => {
      await result.current.flush()
    })

    expect(result.current.saveError).toMatch(/không lưu được tiến độ/i)
  })

  it('I3: lưu thành công sau một lần lỗi → saveError được xoá', async () => {
    const p = puzzle()
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error('lỗi tạm thời'))
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    await act(async () => {
      await result.current.flush()
    })
    expect(result.current.saveError).not.toBeNull()

    act(() => result.current.paint(1))
    await act(async () => {
      await result.current.flush()
    })
    expect(result.current.saveError).toBeNull()
  })

  it('completedAt được ghi khi hoàn thành', async () => {
    const p = puzzle()
    const { result } = renderHook(() => usePaint('p1', p, silentSound()))
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
