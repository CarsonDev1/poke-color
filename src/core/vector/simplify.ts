import type { Pt } from '@/core/vector/crack-graph'

/** khoảng cách bình phương từ p tới đoạn ab */
function distSqToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    const px = p.x - a.x
    const py = p.y - a.y
    return px * px + py * py
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  const ex = p.x - cx
  const ey = p.y - cy
  return ex * ex + ey * ey
}

/**
 * Douglas-Peucker, GIỮ NGUYÊN hai đầu.
 *
 * Giữ hai đầu là điều kiện để hai vùng kề nhau vẫn khớp nhau tại node sau khi
 * đơn giản hoá — mất nó là hở kẽ ngay tại các điểm nối.
 *
 * Không đệ quy: chain quanh một vùng lớn có thể dài hàng nghìn điểm và đệ quy
 * sâu sẽ tràn stack ngay trong worker.
 */
export function simplifyChain(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3 || epsilon <= 0) return points.slice()

  const epsSq = epsilon * epsilon
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!
    if (hi - lo < 2) continue

    let worst = -1
    let worstD = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = distSqToSegment(points[i], points[lo], points[hi])
      // `>` chứ không `>=` ⇒ tie về chỉ số nhỏ hơn, deterministic
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }

    if (worstD > epsSq && worst > 0) {
      keep[worst] = 1
      stack.push([lo, worst], [worst, hi])
    }
  }

  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}
