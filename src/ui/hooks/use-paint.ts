import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundBoard } from '@/audio/synth'
import { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { loadProgress, saveProgress } from '@/data/local-cache'

export const AUTOSAVE_DEBOUNCE_MS = 1500

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
  paint: (regionId: number) => void
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bump = useCallback(() => setTick((t) => t + 1), [])

  // `save` PHẢI tự bắt lỗi: nó được gọi cả từ `scheduleSave` (fire-and-forget
  // qua setTimeout, không ai await) lẫn từ `flush` (await trực tiếp, kể cả
  // trong effect dọn dẹp lúc unmount ở `/play`). Một rejection không bắt ở
  // nhánh đầu là unhandled rejection âm thầm (I3) — cả giờ tô mất sạch không
  // một dấu hiệu nào; ở nhánh sau nó làm hỏng effect unmount. Bắt tại đây một
  // lần là đủ cho cả hai đường gọi.
  const save = useCallback(async () => {
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

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS)
  }, [save])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    await save()
  }, [save])

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

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
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
    (regionId: number) => {
      if (selectedColor === null) return

      const r = engine.tryPaint(regionId, selectedColor)
      if (r.status === 'rejected') {
        sound.reject()
        return
      }
      if (r.status === 'already') return

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
      scheduleSave()
    },
    [selectedColor, engine, colorCount, sound, bump, scheduleSave],
  )

  const reset = useCallback(() => {
    engine.reset()
    setSelectedColor(null)
    setAnnouncement('Đã xoá toàn bộ tiến độ')
    bump()
    scheduleSave()
  }, [engine, bump, scheduleSave])

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
