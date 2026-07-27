import { chamferDistance } from '@/core/regions/distance-transform'
import type { RegionField, RegionMeta } from '@/core/types'

/**
 * Stage 5 — tìm chỗ đặt số cho từng vùng.
 *
 * Dùng "pole of inaccessibility" (điểm xa biên nhất) thay vì centroid: centroid
 * của vùng hình chữ C hay vành khuyên nằm NGOÀI vùng, sẽ in số lên vùng khác.
 *
 * Chỉ chạy distance transform trên bbox của từng vùng (cộng viền 1px) để
 * không phải quét cả ảnh cho mỗi vùng — với ~500 vùng thì đây là khác biệt
 * giữa vài chục ms và vài chục giây.
 */
export function computeAnchors(
  field: RegionField,
  minLabelRadius: number,
): RegionField {
  const { regionMap, regions, width, height } = field
  const out: RegionMeta[] = regions.map((r) => ({ ...r }))

  for (const r of out) {
    // bbox nới ra 1px mỗi phía để biên vùng luôn nằm trong mask cục bộ
    const x0 = Math.max(0, r.minX - 1)
    const y0 = Math.max(0, r.minY - 1)
    const x1 = Math.min(width - 1, r.maxX + 1)
    const y1 = Math.min(height - 1, r.maxY + 1)
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1

    const mask = new Uint8Array(bw * bh)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (regionMap[y * width + x] === r.id) {
          mask[(y - y0) * bw + (x - x0)] = 1
        }
      }
    }

    const dist = chamferDistance(mask, bw, bh)

    let bestI = -1
    let bestD = -1
    for (let i = 0; i < dist.length; i++) {
      // `>` chứ không `>=` ⇒ tie luôn về index nhỏ hơn (deterministic)
      if (dist[i] > bestD) {
        bestD = dist[i]
        bestI = i
      }
    }

    if (bestI < 0) {
      r.anchorX = r.minX
      r.anchorY = r.minY
      r.anchorR = 0
      r.hasLabel = false
      continue
    }

    const bx = bestI % bw
    const by = (bestI - bx) / bw
    r.anchorX = x0 + bx
    r.anchorY = y0 + by
    r.anchorR = bestD
    r.hasLabel = bestD >= minLabelRadius
  }

  return { regionMap, regions: out, width, height }
}
