import { colorLabel } from '@/core/label-alphabet'
import type { Puzzle } from '@/core/types'
import { chaikin } from '@/core/vector/chaikin'
import { buildCrackGraph } from '@/core/vector/crack-graph'
import { buildRegionRings } from '@/core/vector/rings'
import { simplifyChain } from '@/core/vector/simplify'
import { toSvg, type LabelPos } from '@/core/vector/svg'

export interface VectorizeOptions {
  /** Douglas-Peucker, spec §7 mục 4 */
  epsilon?: number
  /** số lượt Chaikin, spec §7 mục 5 cho 1–2 */
  smoothing?: number
  fontSize?: number
}

export interface VectorizeResult {
  /** bản để tô: nét đen + số */
  outline: string
  /** bản giải: fill màu palette */
  solution: string
}

/**
 * Xâu toàn bộ §7: crack graph → simplify → chaikin → ring → SVG.
 *
 * THỨ TỰ LÀ ĐIỂM CỐT TỬ: simplify và chaikin chạy trên TỪNG CHAIN, TRƯỚC khi
 * ghép ring. Đảo lại (ghép ring rồi mới đơn giản hoá cả ring) là quay về đúng
 * cái lỗi D8 tránh — biên chung của hai vùng bị xử lý hai lần trong hai ngữ
 * cảnh khác nhau, cho ra hai chuỗi điểm lệch nhau, và in ra là kẽ trắng.
 */
export function vectorizePuzzle(puzzle: Puzzle, opts: VectorizeOptions = {}): VectorizeResult {
  const epsilon = opts.epsilon ?? 0.75
  const smoothing = opts.smoothing ?? 1

  const chains = buildCrackGraph(puzzle.regionMap, puzzle.width, puzzle.height).map((c) => {
    const simplified = simplifyChain(c.points, epsilon)
    return { ...c, points: smoothing > 0 ? chaikin(simplified, smoothing) : simplified }
  })

  const rings = buildRegionRings(chains, puzzle.regions.length)

  const labels: LabelPos[] = []
  for (const r of puzzle.regions) {
    if (!r.hasLabel) continue
    // +0.5 để canh giữa ô pixel thay vì góc trên-trái, giống render/label-layer
    labels.push({
      x: r.anchorX + 0.5,
      y: r.anchorY + 0.5,
      // dùng CHUNG colorLabel với màn chơi. Tự sinh lại nhãn ở đây là cách chắc
      // chắn để bản in và màn hình lệch nhau.
      text: colorLabel(r.colorIndex),
    })
  }

  const colorOfRegion = puzzle.regions.map((r) => r.colorIndex)
  const base = {
    width: puzzle.width,
    height: puzzle.height,
    palette: puzzle.palette,
    colorOfRegion,
    fontSize: opts.fontSize,
  }

  return {
    outline: toSvg(rings, labels, { ...base, solution: false }),
    solution: toSvg(rings, [], { ...base, solution: true }),
  }
}
