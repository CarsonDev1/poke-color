import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type WheelEvent } from 'react'
import type { PaintEngine } from '@/core/engine/paint-engine'
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
}: {
  puzzle: Puzzle
  engine: PaintEngine
  selectedColor: number | null
  onPaintRegion: (regionId: number) => void
  onFirstPointer: () => void
  width: number
  height: number
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
  }, [puzzle, engine])

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

  /** tô một vùng: cập nhật canvas ngay rồi báo lên trên */
  const tryPaintAt = (sx: number, sy: number): void => {
    if (selectedColor === null) return
    const id = hitTestRegion(view, puzzle.regionMap, puzzle.width, puzzle.height, sx, sy)
    if (id === null || id === lastRegion.current) return
    lastRegion.current = id

    if (puzzle.regions[id].colorIndex === selectedColor && !engine.isFilled(id)) {
      const ctx = baseRef.current?.getContext('2d')
      if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
    }
    onPaintRegion(id)
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
        if (selectedColor !== null) {
          lastRegion.current = null
          const id = focusRegion
          if (puzzle.regions[id].colorIndex === selectedColor && !engine.isFilled(id)) {
            const ctx = baseRef.current?.getContext('2d')
            if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
          }
          onPaintRegion(id)
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
