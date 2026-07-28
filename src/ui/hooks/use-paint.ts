import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundBoard } from '@/audio/synth'
import { PaintEngine, type PaintResult } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { loadProgress, saveProgress } from '@/data/local-cache'

export interface PaintState {
  engine: PaintEngine
  selectedColor: number | null
  filledCount: number
  progress: number
  remaining: Uint32Array
  isComplete: boolean
  announcement: string
  /** thông báo lỗi lưu gần nhất (vd IndexedDB đầy/bị chặn); null khi lưu ổn */
  saveError: string | null
  /**
   * Tăng đúng MỘT LẦN, sau khi tiến độ đã lưu (nếu có) được nạp xong.
   *
   * `PaintEngine` mutate tại chỗ (không tạo object mới) nên `puzzle`/`engine`
   * không bao giờ đổi identity khi phục hồi tiến độ — `redrawAll` trong
   * `PaintCanvas` (phụ thuộc `[puzzle, engine]`) sẽ không chạy lại và layer
   * base tiếp tục hiện UNFILLED_COLOR cho những vùng vừa được phục hồi (C1).
   * `PaintCanvas` phải đưa `revision` vào dependency của `redrawAll` để nó vẽ
   * lại đúng MỘT lần nữa sau khi restore xong — KHÔNG được tăng ở mỗi lần tô
   * (xem `paint`), vì `redrawAll` là O(toàn bộ vùng), đúng chi phí mà tô theo
   * run tồn tại để tránh.
   */
  revision: number
}

export function usePaint(
  puzzleId: string,
  puzzle: Puzzle,
  sound: SoundBoard,
): PaintState & {
  selectColor: (i: number) => void
  /**
   * Trả `PaintResult` của `PaintEngine.tryPaint` (hoặc `undefined` nếu chưa
   * chọn màu) — đây là NGUỒN DUY NHẤT quyết định một lượt tô có hợp lệ hay
   * không (I14). `PaintCanvas` chỉ vẽ lạc quan lên canvas khi
   * `status === 'filled'`; nó không còn tự kiểm tra
   * `regions[id].colorIndex`/`engine.isFilled` — hai bản sao của đúng
   * predicate này (`tryPaint` ở trên) từng nằm rải rác ở view layer (bấm
   * chuột và bàn phím), lặng lẽ trôi dạt nếu `tryPaint` đổi luật mà view
   * không cập nhật theo.
   */
  paint: (regionId: number) => PaintResult | undefined
  reset: () => void
  flush: () => Promise<void>
} {
  const colorCount = puzzle.palette.length
  const engine = useMemo(() => new PaintEngine(puzzle.regions), [puzzle])

  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [revision, setRevision] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeSeconds = useRef(0)

  // Cờ sống của CHÍNH component gọi hook này (khác với biến `alive` cục bộ
  // trong effect nạp tiến độ bên dưới, vốn chỉ chặn MỘT lượt loadProgress cụ
  // thể) — dùng để phân biệt "component đã unmount, lượt ghi này chỉ còn là
  // continuation lạc lối" khỏi "đang cố tình flush lúc dọn dẹp/pagehide" (xem
  // `save` so với `flush` ngay dưới). `false` một lần khi unmount, không bao
  // giờ đặt lại true — mỗi lần mount là một ref mới.
  const aliveRef = useRef(true)
  useEffect(() => {
    return () => {
      aliveRef.current = false
    }
  }, [])

  const bump = useCallback(() => setTick((t) => t + 1), [])

  // `writeProgress` PHẢI tự bắt lỗi: nó được gọi fire-and-forget từ
  // `paint`/`reset` (qua `save`) lẫn được await trực tiếp từ `flush` (kể cả
  // trong effect dọn dẹp lúc unmount ở `/play`, và từ listener `pagehide` bên
  // dưới). Một rejection không bắt ở nhánh đầu là unhandled rejection âm thầm
  // (I3) — cả giờ tô mất sạch không một dấu hiệu nào; ở nhánh sau nó làm hỏng
  // effect unmount. Bắt tại đây một lần là đủ cho mọi đường gọi.
  //
  // Ghi NGAY, không debounce (I12): spec §8 "Autosave: ghi IndexedDB ngay
  // lập tức; debounce 1.5s đẩy Supabase" — debounce thuộc về đường đẩy
  // Supabase của Plan 2 (chưa xây), KHÔNG phải ghi cục bộ này. Bản ghi chỉ
  // ~100 byte (một bitset + vài số), nên ghi mỗi lần tô — kể cả kéo-tô qua
  // hàng chục vùng liên tiếp — không đáng kể so với việc mất nguyên một lượt
  // tô khi debounce chưa kịp chạy lúc đóng tab (không có unmount nào xảy ra).
  //
  // Tách riêng khỏi `save`/`flush` (thay vì để `flush` gọi thẳng `save`) vì
  // hai hàm đó cần ứng xử KHÁC nhau với `aliveRef` — xem giải thích ở từng
  // hàm — nhưng cả hai đều phải thực hiện đúng MỘT lượt ghi giống hệt nhau.
  const writeProgress = useCallback(async () => {
    const complete = engine.isComplete()
    try {
      await saveProgress({
        puzzleId,
        filled: engine.toBitset(),
        filledCount: engine.filledCount,
        activeSeconds: activeSeconds.current,
        completedAt: complete ? Date.now() : null,
        updatedAt: Date.now(),
      })
      setSaveError(null)
    } catch {
      setSaveError('Không lưu được tiến độ — bộ nhớ trình duyệt có thể đã đầy.')
    }
  }, [engine, puzzleId])

  /**
   * Bản fire-and-forget mà `paint`/`reset` gọi ở mỗi lượt tô — có gác
   * `aliveRef`: nếu lượt gọi này chỉ bắt đầu chạy SAU KHI component đã
   * unmount (vd một ref cũ còn được giữ và gọi lại — xem test dùng
   * `result.current` sau `unmount()`), nó không chạm gì tới `writeProgress`
   * (và qua đó, không mở/đụng tới kết nối IndexedDB) nữa.
   *
   * Gác này KHÔNG (và không thể) huỷ được một lượt `save()` đã bắt đầu chạy
   * TRƯỚC khi unmount xảy ra — bản thân yêu cầu ghi đã được gửi đi đồng bộ
   * ngay khi `save()` bắt đầu (trước bất kỳ `await` nào), nên tới lúc unmount
   * xảy ra thì yêu cầu đó đã nằm ngoài tầm với của bất kỳ cờ nào kiểm tra bên
   * trong hàm này. Trường hợp đó vốn dĩ vô hại: `flush()` (effect dọn dẹp của
   * `/play`, và listener `pagehide`) ghi lại đúng trạng thái CUỐI CÙNG của
   * `engine` một lần nữa ngay lúc rời màn — bất kể lượt `save()` tự phát ở
   * trên có kịp xong trước đó hay không, dữ liệu đúng vẫn luôn được đảm bảo
   * bởi chính `flush()`, không phụ thuộc lượt ghi tự phát này.
   */
  const save = useCallback(async () => {
    if (!aliveRef.current) return
    await writeProgress()
  }, [writeProgress])

  /**
   * Dùng khi cần đợi ghi xong xuôi (unmount, pagehide) — KHÔNG gác theo
   * `aliveRef`: đây là lượt ghi CỐ Ý, muốn chạy dù component đã (hoặc đang)
   * unmount — cả effect dọn dẹp của `/play` lẫn listener `pagehide` đều gọi
   * thẳng `flush()` chứ không phải `save()` chính vì lý do này. Nếu `flush`
   * cũng gác theo `aliveRef` (vd bằng cách gọi lại `save()`), effect dọn dẹp
   * lúc unmount — vốn luôn chạy SAU khi `aliveRef.current` đã thành `false`
   * — sẽ luôn bị chặn, xoá sạch tác dụng của I12 (đảm bảo tiến độ được ghi
   * lúc rời màn/đóng tab).
   */
  const flush = useCallback(async () => {
    await writeProgress()
  }, [writeProgress])

  // Đóng tab KHÔNG unmount component (không effect cleanup nào chạy) —
  // `pagehide` là tín hiệu duy nhất còn lại để flush tiến độ + activeSeconds
  // tích luỹ từ lần ghi gần nhất. Không dùng `beforeunload`/`unload`: cả hai
  // đều chặn bfcache (Chrome/Firefox không cache lại trang cho nút Back).
  useEffect(() => {
    const onPageHide = (): void => {
      void flush()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [flush])

  // nạp tiến độ đã lưu
  useEffect(() => {
    let alive = true
    void loadProgress(puzzleId).then((rec) => {
      if (!alive || !rec) return
      const restored = new PaintEngine(puzzle.regions, rec.filled)
      for (let i = 0; i < puzzle.regions.length; i++) {
        if (restored.isFilled(i)) engine.tryPaint(i, puzzle.regions[i].colorIndex)
      }
      activeSeconds.current = rec.activeSeconds
      bump()
      // Đúng MỘT lần, sau khi restore xong — báo cho PaintCanvas vẽ lại toàn
      // bộ layer base. Xem giải thích đầy đủ tại khai báo `revision` trong
      // PaintState.
      setRevision((r) => r + 1)
    })
    return () => {
      alive = false
    }
  }, [puzzleId, puzzle, engine, bump])

  // đếm thời gian hoạt động: chỉ tính khi tab đang hiện
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') activeSeconds.current += 1
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // `tick` không được đọc trong thân hàm nhưng PHẢI có trong dependency list:
  // PaintEngine mutate nội bộ (không tạo object mới), nên React không tự biết
  // remaining cần tính lại sau mỗi lần tô. bump() tăng tick để buộc useMemo
  // chạy lại; xoá tick khỏi đây sẽ làm số vùng còn lại trên thanh màu bị đứng
  // hình sau lần tô đầu tiên.
  const remaining = useMemo(
    () => engine.remainingByColor(colorCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, colorCount, tick],
  )

  const selectColor = useCallback((i: number) => setSelectedColor(i), [])

  const paint = useCallback(
    (regionId: number): PaintResult | undefined => {
      if (selectedColor === null) return undefined

      const r = engine.tryPaint(regionId, selectedColor)
      if (r.status === 'rejected') {
        sound.reject()
        return r
      }
      if (r.status === 'already') return r

      const left = engine.remainingByColor(colorCount)
      const complete = engine.isComplete()

      if (complete) sound.complete()
      else if (left[selectedColor] === 0) sound.colorDone()
      else sound.fill(engine.progress)

      // tự nhảy sang màu còn vùng gần nhất khi màu đang chọn đã xong —
      // nếu không, người chơi bấm tiếp mà không hiểu sao không ăn
      if (!complete && left[selectedColor] === 0) {
        const next = left.findIndex((n) => n > 0)
        if (next >= 0) setSelectedColor(next)
      }

      setAnnouncement(
        complete
          ? 'Đã tô xong toàn bộ tranh'
          : `Đã tô một vùng, còn ${engine.regionCount - engine.filledCount} vùng`,
      )
      bump()
      void save()
      return r
    },
    [selectedColor, engine, colorCount, sound, bump, save],
  )

  const reset = useCallback(() => {
    engine.reset()
    setSelectedColor(null)
    setAnnouncement('Đã xoá toàn bộ tiến độ')
    bump()
    void save()
  }, [engine, bump, save])

  return {
    engine,
    selectedColor,
    filledCount: engine.filledCount,
    progress: engine.progress,
    remaining,
    isComplete: engine.isComplete(),
    announcement,
    saveError,
    revision,
    selectColor,
    paint,
    reset,
    flush,
  }
}
