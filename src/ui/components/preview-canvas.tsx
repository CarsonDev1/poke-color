import { useEffect, useRef } from 'react'
import { PaintEngine } from '@/core/engine/paint-engine'
import { buildOutlineImageData, paintAllRegions } from '@/render/layers'
import { drawLabels } from '@/render/label-layer'
import { fitViewport } from '@/render/viewport'
import type { Puzzle } from '@/core/types'

/**
 * Xem trước puzzle ở trạng thái CHƯA tô gì: line-art trắng + viền đen + số.
 * Đây đúng là thứ người dùng sẽ thấy khi bắt đầu tô, nên nhìn preview là
 * biết ngay puzzle có tô được hay không.
 */
export function PreviewCanvas({ puzzle, maxWidth }: { puzzle: Puzzle; maxWidth: number }) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLCanvasElement>(null)

  const scale = Math.min(1, maxWidth / puzzle.width)
  const viewW = Math.round(puzzle.width * scale)
  const viewH = Math.round(puzzle.height * scale)

  useEffect(() => {
    const base = baseRef.current
    const labels = labelRef.current
    if (!base || !labels) return

    const bctx = base.getContext('2d')
    const lctx = labels.getContext('2d')
    if (!bctx || !lctx) return

    const engine = new PaintEngine(puzzle.regions)
    paintAllRegions(bctx, puzzle, engine)

    void createImageBitmap(buildOutlineImageData(puzzle)).then((bmp) => {
      bctx.drawImage(bmp, 0, 0)
      bmp.close()
    })

    drawLabels(lctx, puzzle, engine, fitViewport(puzzle.width, puzzle.height, viewW, viewH), viewW, viewH)
  }, [puzzle, viewW, viewH])

  return (
    <div style={{ position: 'relative', width: viewW, height: viewH }}>
      <canvas
        ref={baseRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{ position: 'absolute', inset: 0, width: viewW, height: viewH }}
      />
      <canvas
        ref={labelRef}
        width={viewW}
        height={viewH}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
