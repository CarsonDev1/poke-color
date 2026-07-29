import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundBoard } from '@/audio/synth'
import { PaintEngine, type PaintResult } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { localDay } from '@/core/engine/stats'
import { bumpActivity, enqueueOutbox, loadProgress, saveProgress } from '@/data/local-cache'

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

  // Đã ỔN ĐỊNH lượt phục hồi tiến độ đã lưu (nếu có) chưa — false cho tới khi
  // effect nạp tiến độ bên dưới SETTLE (dù tìm thấy bản ghi, không tìm thấy
  // — puzzle hoàn toàn mới — hay đọc lỗi). `writeProgress` refuse ghi trong
  // lúc còn false (xem gác ở đó).
  //
  // Đây là cơ chế THAY THẾ cho `aliveRef` (đã xoá): `aliveRef` cũ ghi
  // `false` một lần lúc unmount với chú thích khẳng định "không bao giờ đặt
  // lại true — mỗi lần mount là một ref mới", nhưng điều đó SAI — StrictMode
  // (bật ở `src/main.tsx`) mô phỏng remount bằng cách unmount rồi mount lại
  // component TRÊN CÙNG một fiber, nên `useRef` không hề được tạo lại;
  // `aliveRef.current = false` của cleanup đầu tiên dính luôn cho suốt vòng
  // đời component, biến `save()` (dùng `aliveRef`) thành no-op vĩnh viễn —
  // tô cả buổi không có gì được ghi trừ khi `flush()` được gọi tường minh.
  // Xoá `aliveRef` không chỉ vì nó sai: cái hiểm hoạ nó đặt ra (một
  // continuation của `save()` chạy sau khi unmount) chưa từng được chứng
  // minh gây hại — bản thân request ghi đã gửi đi đồng bộ trước bất kỳ
  // `await` nào, một `save()` đang chạy dở vẫn cứ resolve dù component còn
  // sống hay không, và React 19 lặng lẽ bỏ qua state update trên component đã
  // unmount (không throw, không cảnh báo) — nên gác đó không ngăn được hại gì
  // thật, chỉ phá chính tính năng ghi tiến độ.
  //
  // `restoredRef` giải quyết một vấn đề KHÁC hẳn: gác ghi cho tới khi ĐỌC
  // xong, không phải theo dõi sống/chết. Đây chính là cơ chế sửa cả C-hazard
  // "flush() xoá sạch tiến độ vừa phục hồi": effect dọn dẹp của `/play` gọi
  // `flush()` ngay LÚC MOUNT dưới StrictMode (cleanup mô phỏng unmount chạy
  // trước khi effect phục hồi tiến độ — bất đồng bộ — kịp resolve); nếu
  // `flush()` cứ ghi ngay lúc đó, nó ghi đè bản ghi đã lưu bằng trạng thái
  // RỖNG của `engine` (chưa restore gì) một cách không thể đảo ngược. Gác
  // theo `restoredRef` biến lượt `flush()` sớm đó thành no-op thay vì một
  // lượt ghi phá hoại — đúng trong test lẫn production, không chỉ dưới
  // StrictMode.
  const restoredRef = useRef(false)
  /**
   * `filledCount` đã tính vào `activity` rồi. Cần mốc này để cộng phần TĂNG THÊM
   * chứ không phải tổng — và nó phải được đặt lại bằng số vùng ĐÃ TÔ sau khi
   * restore, nếu không lần tô đầu tiên sau khi mở lại puzzle sẽ cộng nhầm cả
   * tiến độ cũ vào ngày hôm nay.
   */
  const lastCountedRef = useRef(0)

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
  // đây là nơi DUY NHẤT thực hiện lượt ghi thật — `save`/`flush` giờ chỉ là
  // hai tên gọi khác nhau cho CÙNG một hành động (xem giải thích ở từng hàm).
  //
  // Gác đầu tiên trên `restoredRef.current`: từ chối ghi cho tới khi lượt
  // phục hồi tiến độ đã lưu (effect bên dưới) ỔN ĐỊNH. Đây là cơ chế sửa
  // hazard "flush() xoá sạch tiến độ vừa phục hồi" (xem giải thích đầy đủ ở
  // khai báo `restoredRef`): không có gác này, `flush()` gọi TRƯỚC khi
  // restore xong (effect dọn dẹp của `/play` chạy đúng lúc StrictMode mô
  // phỏng remount, hoặc — hiếm hơn nhưng vẫn có thật trong production — một
  // cú click "Back" ngay tức khắc sau khi mở `/play`) ghi đè bản ghi đã lưu
  // bằng trạng thái RỖNG của `engine` lúc đó (chưa kịp restore gì), xoá sạch
  // filledCount/activeSeconds thật một cách không thể đảo ngược.
  const writeProgress = useCallback(async () => {
    if (!restoredRef.current) return
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
      // Đánh dấu cần đẩy lên SAU khi ghi local thành công. Outbox khoá theo
      // [kind, puzzleId] nên tô 200 vùng vẫn chỉ để lại một việc chờ. Lỗi ở đây
      // không được làm hỏng việc tô: mất mạng/chưa đăng nhập vẫn phải chơi được.
      try {
        await enqueueOutbox('progress', puzzleId)
      } catch {
        // không sao — lần ghi tiến độ sau sẽ đánh dấu lại
      }

      // Ghi hoạt động theo NGÀY cho chuỗi ngày liên tiếp (§12). Cộng phần TĂNG
      // THÊM, không phải tổng: writeProgress chạy ở mỗi lượt tô nên cộng tổng
      // sẽ đếm mỗi vùng nhiều lần.
      try {
        const delta = engine.filledCount - lastCountedRef.current
        if (delta > 0) {
          lastCountedRef.current = engine.filledCount
          await bumpActivity(localDay(Date.now()), delta, activeSeconds.current)
        }
      } catch {
        // thống kê không quan trọng bằng tiến độ — thất bại thì bỏ qua
      }
    } catch {
      setSaveError('Không lưu được tiến độ — bộ nhớ trình duyệt có thể đã đầy.')
    }
  }, [engine, puzzleId])

  /** Bản fire-and-forget mà `paint`/`reset` gọi ở mỗi lượt tô. */
  const save = useCallback(async () => {
    await writeProgress()
  }, [writeProgress])

  /**
   * Dùng khi cần đợi ghi xong xuôi (unmount, pagehide) — cả effect dọn dẹp
   * của `/play` lẫn listener `pagehide` bên dưới đều gọi thẳng `flush()`.
   * Giống hệt `save()` (cả hai chỉ gọi `writeProgress`); tách tên riêng vẫn
   * có giá trị tài liệu hoá: gọi `flush()` nói rõ ý "muốn đợi lượt ghi CUỐI
   * hoàn tất trước khi rời màn", còn `save()` là lượt ghi fire-and-forget
   * sau mỗi lượt tô. Trước đây (thời `aliveRef`, đã xoá) hai hàm này ứng xử
   * khác nhau — `save` gác theo cờ sống, `flush` thì không, để effect dọn
   * dẹp lúc unmount không bị tự chặn — nhưng `restoredRef` ở `writeProgress`
   * là gác DUY NHẤT còn cần thiết, và nó áp dụng như nhau cho cả hai.
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
    // Một puzzle MỚI (đổi `puzzleId`) bắt đầu lượt phục hồi riêng của nó —
    // đóng lại "cửa" ghi cho tới khi lượt NÀY ổn định, đừng thừa hưởng nhầm
    // trạng thái "đã phục hồi" của puzzle trước đó.
    restoredRef.current = false
    lastCountedRef.current = 0
    void loadProgress(puzzleId)
      .then((rec) => {
        // PHẢI đặt true kể cả khi `rec` là `undefined` (puzzle hoàn toàn
        // mới, chưa từng lưu) — nếu không, `writeProgress` sẽ mãi mãi từ
        // chối ghi và puzzle mới không bao giờ lưu được gì (xem `restoredRef`).
        restoredRef.current = true
        if (!alive || !rec) return
        const restored = new PaintEngine(puzzle.regions, rec.filled)
        for (let i = 0; i < puzzle.regions.length; i++) {
          if (restored.isFilled(i)) engine.tryPaint(i, puzzle.regions[i].colorIndex)
        }
        activeSeconds.current = rec.activeSeconds
        // Mốc cho `activity`: những vùng này đã tô ở NGÀY KHÁC, không được cộng
        // lại vào hôm nay khi người dùng tô tiếp.
        lastCountedRef.current = engine.filledCount
        bump()
        // Đúng MỘT lần, sau khi restore xong — báo cho PaintCanvas vẽ lại
        // toàn bộ layer base. Xem giải thích đầy đủ tại khai báo `revision`
        // trong PaintState.
        setRevision((r) => r + 1)
      })
      .catch(() => {
        // Đọc thất bại (vd IndexedDB bị chặn) — vẫn phải mở khoá ghi: nếu
        // không, một lần đọc lỗi sẽ khoá ghi vĩnh viễn cho đúng puzzle đang
        // cần được cứu dữ liệu nhất.
        restoredRef.current = true
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
