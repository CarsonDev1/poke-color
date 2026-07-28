import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type WheelEvent } from 'react'
import type { PaintEngine, PaintResult } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { buildOutlineImageData, paintAllRegions, paintRegion, rgbCss, UNFILLED_COLOR } from '@/render/layers'
import { drawHighlight } from '@/render/highlight'
import { drawLabels } from '@/render/label-layer'
import { clampPan, fitViewport, hitTestRegion, panBy, zoomAbout, type Viewport } from '@/render/viewport'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 24

export function PaintCanvas({
  puzzle,
  engine,
  selectedColor,
  onPaintRegion,
  onFirstPointer,
  width,
  height,
  revision,
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
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<Viewport>(() =>
    fitViewport(puzzle.width, puzzle.height, width, height),
  )
  const [focusRegion, setFocusRegion] = useState(0)
  const dragMode = useRef<'none' | 'paint' | 'pan'>('none')
  const lastRegion = useRef<number | null>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const spaceHeld = useRef(false)
  const firstPointerDone = useRef(false)

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

  // highlight + số vẽ lại khi màu chọn, viewport, hay tiến độ đổi
  useEffect(() => {
    const octx = overlayRef.current?.getContext('2d')
    const lctx = labelRef.current?.getContext('2d')
    if (octx) drawHighlight(octx, puzzle, engine, selectedColor, view, puzzle.width, puzzle.height)
    if (lctx) drawLabels(lctx, puzzle, engine, view, width, height)
  }, [puzzle, engine, selectedColor, view, width, height, engine.filledCount])

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

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!firstPointerDone.current) {
      firstPointerDone.current = true
      onFirstPointer()
    }
    surfaceRef.current?.focus()
    e.currentTarget.setPointerCapture(e.pointerId)

    const p = localPoint(e)
    lastPoint.current = p

    // chuột giữa hoặc giữ Space ⇒ pan; còn lại ⇒ tô.
    // Tách rõ hai chế độ, nếu không thì mỗi lần muốn di chuyển tranh sẽ tô
    // nhầm cả một vệt.
    if (e.button === 1 || spaceHeld.current) {
      dragMode.current = 'pan'
      return
    }
    dragMode.current = 'paint'
    lastRegion.current = null
    tryPaintAt(p.x, p.y)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = localPoint(e)
    if (dragMode.current === 'paint') {
      tryPaintAt(p.x, p.y)
    } else if (dragMode.current === 'pan' && lastPoint.current) {
      const moved = panBy(view, p.x - lastPoint.current.x, p.y - lastPoint.current.y)
      setView(clampPan(moved, puzzle.width, puzzle.height, width, height))
    }
    lastPoint.current = p
  }

  const endDrag = (): void => {
    dragMode.current = 'none'
    lastRegion.current = null
    lastPoint.current = null
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
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: '#e2e8f0',
        touchAction: 'none',
        outlineOffset: 2,
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
