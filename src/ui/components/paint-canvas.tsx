import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type WheelEvent } from 'react'
import type { PaintEngine, PaintResult } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { buildOutlineImageData, paintAllRegions, paintRegion, rgbCss, UNFILLED_COLOR } from '@/render/layers'
import { drawHighlight } from '@/render/highlight'
import { drawFocusRing, drawLabels } from '@/render/label-layer'
import { clampPan, fitViewport, hitTestRegion, panBy, zoomAbout, type Viewport } from '@/render/viewport'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 24

export function PaintCanvas({
  puzzle,
  engine,
  selectedColor,
  onPaintRegion,
  onFirstPointer,
  onFocusRegionChange,
  width,
  height,
  revision,
  tool = 'paint',
  onScaleChange,
}: {
  puzzle: Puzzle
  engine: PaintEngine
  selectedColor: number | null
  /**
   * Trả `PaintResult` của lượt tô (I14) — `PaintCanvas` chỉ vẽ lạc quan lên
   * canvas khi `status === 'filled'`, KHÔNG tự phán bằng
   * `regions[id].colorIndex`/`engine.isFilled`: `PaintEngine.tryPaint` (được
   * gọi bên trong `onPaintRegion`) là nơi DUY NHẤT quyết định một lượt tô có
   * hợp lệ hay không.
   */
  onPaintRegion: (regionId: number) => PaintResult | undefined
  onFirstPointer: () => void
  /**
   * Báo lên cha mỗi khi "con trỏ" vùng của bàn phím (`focusRegion`) đổi, để
   * `/play` announce qua `aria-live` (I7) — id vùng theo thứ tự raster-scan,
   * không theo vị trí thị giác, nên không có cách nào khác để người dùng biết
   * con trỏ đang ở đâu ngoài việc nghe hoặc nhìn viền vẽ trên canvas labels.
   */
  onFocusRegionChange?: (regionId: number) => void
  width: number
  height: number
  /**
   * Tăng đúng một lần sau khi `usePaint` phục hồi tiến độ đã lưu xong (xem
   * `PaintState.revision`). `puzzle`/`engine` không đổi identity khi restore
   * (PaintEngine mutate tại chỗ), nên phải có tín hiệu RIÊNG này trong
   * dependency của `redrawAll` để layer base vẽ lại đúng trạng thái đã phục
   * hồi (sửa C1) — không dùng `engine.filledCount`/`tick` vì những giá trị đó
   * đổi ở MỌI lần tô, sẽ kéo `redrawAll` (O(toàn bộ vùng)) chạy lại mỗi cú tô.
   */
  revision: number
  /**
   * Công cụ đang chọn. `'pan'` cho phép kéo bằng MỘT ngón/một cú kéo chuột.
   *
   * Trước đây pan chỉ có ở chuột giữa hoặc giữ Space — trên màn hình cảm ứng
   * không có cả hai, nên zoom vào rồi là KHÔNG THỂ di chuyển tranh. Đó là lỗi
   * chặn hẳn việc dùng trên điện thoại/tablet.
   */
  tool?: 'paint' | 'pan'
  /** báo lên cha khi người dùng pinch/zoom, để hiện mức zoom */
  onScaleChange?: (scale: number) => void
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<Viewport>(() =>
    fitViewport(puzzle.width, puzzle.height, width, height),
  )
  const [focusRegion, setFocusRegion] = useState(0)
  // DOM focus THẬT của bề mặt tương tác — không phải "có tồn tại focusRegion
  // hay không". `drawFocusRing` chỉ được vẽ khi giá trị này true (I7 fix):
  // người dùng chuột/chạm chưa từng Tab vào canvas không nên thấy viền con
  // trỏ bàn phím ngay khi canvas xuất hiện (focusRegion mặc định là 0).
  const [hasFocus, setHasFocus] = useState(false)
  const dragMode = useRef<'none' | 'paint' | 'pan' | 'pinch'>('none')
  const lastRegion = useRef<number | null>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const spaceHeld = useRef(false)
  const firstPointerDone = useRef(false)
  /**
   * Mọi ngón/con trỏ đang chạm, theo pointerId.
   *
   * Cần theo dõi TẤT CẢ để nhận ra cử chỉ hai ngón: một ngón là tô, hai ngón là
   * kéo + pinch zoom. Đây là cách chuẩn trên cảm ứng và là thứ người dùng thử
   * đầu tiên khi muốn di chuyển tranh.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** khoảng cách giữa hai ngón ở frame trước, để tính hệ số pinch */
  const lastPinchDist = useRef(0)

  const redrawAll = useCallback(() => {
    const ctx = baseRef.current?.getContext('2d')
    if (!ctx) return
    paintAllRegions(ctx, puzzle, engine)
    void createImageBitmap(buildOutlineImageData(puzzle)).then((bmp) => {
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
    })
    // `revision` không được đọc trong thân hàm nhưng PHẢI có trong dependency
    // list: xem giải thích tại khai báo prop `revision` phía trên (C1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, engine, revision])

  useEffect(redrawAll, [redrawAll])

  useEffect(() => {
    setView(fitViewport(puzzle.width, puzzle.height, width, height))
  }, [puzzle.width, puzzle.height, width, height])

  // highlight vẽ lại khi màu chọn, viewport, hay tiến độ đổi — KHÔNG phụ
  // thuộc `hasFocus`/`focusRegion`: tách riêng khỏi effect số+viền con trỏ
  // bên dưới để Tab/click vào canvas (chỉ đổi `hasFocus`, không đổi gì ở đây)
  // không kéo theo một lượt tô lại highlight thừa (từng làm lộ `fillRect` giả
  // dương trong test I14 khi gộp chung một effect).
  useEffect(() => {
    const octx = overlayRef.current?.getContext('2d')
    if (octx) drawHighlight(octx, puzzle, engine, selectedColor, view, puzzle.width, puzzle.height)
  }, [puzzle, engine, selectedColor, view, puzzle.width, puzzle.height, engine.filledCount])

  // số + viền con trỏ bàn phím vẽ lại khi viewport, tiến độ, vùng đang focus,
  // hay DOM focus của bề mặt tương tác đổi. `focusRegion` PHẢI có trong
  // dependency list (I7): thiếu nó, ArrowRight/Left/Up/Down (chỉ đổi
  // focusRegion, không đổi gì khác trong danh sách này) sẽ không kích hoạt vẽ
  // lại — con trỏ tồn tại trong state nhưng vô hình trên màn hình. `hasFocus`
  // cũng PHẢI có mặt: viền chỉ được vẽ khi bề mặt thật sự có DOM focus, nên
  // Tab vào/rời canvas (đổi `hasFocus`, không đổi gì khác) cũng phải vẽ lại
  // để hiện/ẩn viền đúng lúc.
  useEffect(() => {
    const lctx = labelRef.current?.getContext('2d')
    if (lctx) {
      drawLabels(lctx, puzzle, engine, view, width, height)
      drawFocusRing(lctx, puzzle, focusRegion, view, width, height, hasFocus)
    }
  }, [puzzle, engine, view, width, height, engine.filledCount, focusRegion, hasFocus])

  // Báo lên cha để announce qua aria-live (I7) — tách khỏi effect vẽ ở trên
  // vì đây là side effect khác hẳn (gọi callback ra ngoài component, không vẽ
  // gì), dù cùng phụ thuộc `focusRegion`.
  //
  // Chỉ gọi khi `focusRegion` THẬT SỰ đổi so với lần trước, không phải mỗi
  // khi effect chạy: `focusRegion` mặc định là 0 và effect này luôn chạy ít
  // nhất một lần lúc mount dù không ai bấm gì — không gác gì thì `/play`
  // announce "Vùng 0, màu 1" lên aria-live ngay khi canvas xuất hiện, trên
  // một con trỏ người dùng chưa từng di chuyển.
  //
  // Cố ý dùng ref lưu GIÁ TRỊ lần trước (không phải một cờ boolean "đã chạy
  // lần đầu chưa"), vì StrictMode mô phỏng mount bằng unmount-rồi-mount-lại
  // TRÊN CÙNG fiber (`useRef` không được tạo lại) mà KHÔNG đổi `focusRegion`:
  // một cờ boolean đặt lại `true` ở lần chạy đầu và không có cleanup nào đặt
  // lại `false` sẽ khiến lượt effect mô phỏng remount thứ hai của StrictMode
  // (focusRegion vẫn là 0, không đổi) đọc cờ là "đã qua lần đầu", lại gọi
  // callback một lần nữa với vùng 0 — đúng lỗi này lặp lại dưới vỏ khác. So
  // sánh với giá trị lần trước tránh được: `lastRegionRef.current` sau lần
  // chạy đầu đã là 0, nên lượt mô phỏng remount (focusRegion vẫn 0) thấy
  // "không đổi" và không gọi lại, trong khi một đổi vùng thật (bàn phím) luôn
  // có giá trị mới khác giá trị đã lưu nên vẫn gọi callback bình thường.
  const lastRegionRef = useRef<number | null>(null)
  useEffect(() => {
    if (lastRegionRef.current !== null && lastRegionRef.current !== focusRegion) {
      onFocusRegionChange?.(focusRegion)
    }
    lastRegionRef.current = focusRegion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRegion])

  const localPoint = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** tô một vùng: báo lên cha (nguồn quyết định duy nhất), rồi cập nhật canvas nếu cha nói đã tô */
  const tryPaintAt = (sx: number, sy: number): void => {
    if (selectedColor === null) return
    const id = hitTestRegion(view, puzzle.regionMap, puzzle.width, puzzle.height, sx, sy)
    if (id === null || id === lastRegion.current) return
    lastRegion.current = id

    const result = onPaintRegion(id)
    if (result?.status === 'filled') {
      const ctx = baseRef.current?.getContext('2d')
      if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
    }
  }

  /** tâm và khoảng cách của hai ngón đầu tiên */
  const pinchInfo = (): { cx: number; cy: number; dist: number } | null => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return null
    const [a, b] = pts
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!firstPointerDone.current) {
      firstPointerDone.current = true
      onFirstPointer()
    }
    surfaceRef.current?.focus()
    e.currentTarget.setPointerCapture(e.pointerId)

    const p = localPoint(e)
    pointers.current.set(e.pointerId, p)
    lastPoint.current = p

    // Ngón thứ HAI chạm xuống ⇒ chuyển sang pinch, và HOÀN TÁC ý định tô: người
    // dùng đặt hai ngón để phóng/kéo, không phải để tô. Không có nhánh này thì
    // ngón đầu đã kích hoạt `paint` và họ tô nhầm một vệt mỗi lần muốn zoom.
    if (pointers.current.size >= 2) {
      dragMode.current = 'pinch'
      lastRegion.current = null
      lastPinchDist.current = pinchInfo()?.dist ?? 0
      return
    }

    // Một con trỏ: chuột giữa, giữ Space, hoặc đang ở công cụ Kéo ⇒ pan.
    if (e.button === 1 || spaceHeld.current || tool === 'pan') {
      dragMode.current = 'pan'
      return
    }
    dragMode.current = 'paint'
    lastRegion.current = null
    tryPaintAt(p.x, p.y)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = localPoint(e)
    const prev = pointers.current.get(e.pointerId)
    pointers.current.set(e.pointerId, p)

    if (dragMode.current === 'pinch') {
      const info = pinchInfo()
      if (info && lastPinchDist.current > 0) {
        // zoom quanh TÂM hai ngón, không phải tâm khung: đó là điều khiến pinch
        // có cảm giác đúng — chỗ đang giữ thì đứng yên dưới ngón tay
        const factor = info.dist / lastPinchDist.current
        let next = zoomAbout(view, info.cx, info.cy, factor, MIN_SCALE, MAX_SCALE)
        // hai ngón dịch đi ⇒ kéo tranh theo
        if (prev) {
          next = panBy(next, (p.x - prev.x) / 2, (p.y - prev.y) / 2)
        }
        setView(clampPan(next, puzzle.width, puzzle.height, width, height))
        lastPinchDist.current = info.dist
        onScaleChange?.(next.scale)
      }
      lastPoint.current = p
      return
    }

    if (dragMode.current === 'paint') {
      tryPaintAt(p.x, p.y)
    } else if (dragMode.current === 'pan' && lastPoint.current) {
      const moved = panBy(view, p.x - lastPoint.current.x, p.y - lastPoint.current.y)
      setView(clampPan(moved, puzzle.width, puzzle.height, width, height))
    }
    lastPoint.current = p
  }

  const endDrag = (e?: PointerEvent<HTMLDivElement>): void => {
    if (e) pointers.current.delete(e.pointerId)
    else pointers.current.clear()

    // Nhấc MỘT ngón khi đang pinch: không quay về 'paint', vì ngón còn lại vẫn
    // đang trên màn hình và sẽ vẽ một vệt ngoài ý muốn. Đợi nhấc hết.
    if (pointers.current.size > 0) {
      lastPinchDist.current = 0
      lastPoint.current = null
      return
    }

    dragMode.current = 'none'
    lastRegion.current = null
    lastPoint.current = null
    lastPinchDist.current = 0
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const p = localPoint(e)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const zoomed = zoomAbout(view, p.x, p.y, factor, MIN_SCALE, MAX_SCALE)
    setView(clampPan(zoomed, puzzle.width, puzzle.height, width, height))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const n = puzzle.regions.length
    if (e.key === ' ' && dragMode.current === 'none') spaceHeld.current = true

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        setFocusRegion((i) => Math.min(n - 1, i + 1))
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        setFocusRegion((i) => Math.max(0, i - 1))
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        // Đang pan (Space giữ + kéo, hoặc chuột giữa) thì bỏ qua nhánh tô: nếu
        // không, phím giữ (auto-repeat của OS) sẽ phát lại keydown liên tục
        // suốt lúc kéo và gọi onPaintRegion hết lần này đến lần khác. Hai điều
        // kiện tách biệt: `dragMode.current === 'pan'` chặn trường hợp một
        // phím KHÔNG lặp lại tới trong lúc đang pan; `e.repeat` chặn trường
        // hợp giữ phím khi CHƯA pan (giữ Enter/Space đứng yên cũng không nên
        // tô lặp lại mỗi tick auto-repeat).
        if (dragMode.current === 'pan' || e.repeat) return
        if (selectedColor !== null) {
          lastRegion.current = null
          const id = focusRegion
          const result = onPaintRegion(id)
          if (result?.status === 'filled') {
            const ctx = baseRef.current?.getContext('2d')
            if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
          }
        }
        return
      case '+':
      case '=':
        e.preventDefault()
        setView((v) => clampPan(zoomAbout(v, width / 2, height / 2, 1.25, MIN_SCALE, MAX_SCALE), puzzle.width, puzzle.height, width, height))
        return
      case '-':
        e.preventDefault()
        setView((v) => clampPan(zoomAbout(v, width / 2, height / 2, 0.8, MIN_SCALE, MAX_SCALE), puzzle.width, puzzle.height, width, height))
        return
      case 'f':
        e.preventDefault()
        setView(fitViewport(puzzle.width, puzzle.height, width, height))
        return
      default:
        return
    }
  }

  const cssTransform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`

  return (
    <div
      ref={surfaceRef}
      role="application"
      aria-label="Tranh tô màu"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === ' ') spaceHeld.current = false
      }}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        // hoà vào nền tối của app; nền xám sáng cũ tạo một khối chói quanh tranh
        background: 'oklch(0.2 0.035 275)',
        touchAction: 'none',
        outlineOffset: 2,
        // Con trỏ nói rõ đang ở công cụ nào — không có tín hiệu này thì người
        // dùng không biết cú kéo tiếp theo sẽ tô hay sẽ di chuyển tranh.
        cursor: tool === 'pan' ? 'grab' : 'crosshair',
      }}
    >
      {/*
        `base`/`overlay` kích thước ẢNH, dịch/co bằng CSS transform: zoom hay
        pan chỉ đổi transform, không vẽ lại bitmap — rẻ, mượt ở mọi mức zoom.
        `labels` kích thước MÀN HÌNH và vẽ lại theo scale hiện tại, vì số phải
        luôn cùng cỡ chữ đọc được dù ảnh phóng to hay thu nhỏ bao nhiêu.
      */}
      <canvas
        ref={baseRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cssTransform,
          imageRendering: 'pixelated',
          background: UNFILLED_COLOR,
        }}
      />
      <canvas
        ref={overlayRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cssTransform,
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={labelRef}
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
