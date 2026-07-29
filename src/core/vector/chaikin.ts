import type { Pt } from '@/core/vector/crack-graph'

/**
 * Chaikin subdivision — làm mềm nét cho giống vẽ tay (spec §7 mục 5).
 *
 * GIỮ NGUYÊN hai đầu, cùng lý do như `simplifyChain`: hai vùng kề nhau phải còn
 * khớp nhau tại node. Mỗi lượt thay mỗi đoạn bằng hai điểm ở ¼ và ¾.
 *
 * Chain KHÉP KÍN (điểm đầu trùng điểm cuối) được xử lý riêng: nếu ghim hai đầu
 * như chain hở thì chỗ nối sẽ còn một góc nhọn duy nhất không được làm mềm, rất
 * lộ trên bản in.
 */
export function chaikin(points: Pt[], iterations: number): Pt[] {
  if (iterations <= 0 || points.length < 3) return points.slice()

  const closed =
    points.length > 2 &&
    points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y

  let cur = points.slice()
  for (let it = 0; it < iterations; it++) {
    cur = closed ? oneClosed(cur) : oneOpen(cur)
  }
  return cur
}

function oneOpen(p: Pt[]): Pt[] {
  const out: Pt[] = [p[0]]
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]
    const b = p[i + 1]
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
  }
  out.push(p[p.length - 1])
  return out
}

function oneClosed(p: Pt[]): Pt[] {
  // bỏ điểm cuối trùng lặp, xử lý như vòng, rồi khép lại
  const ring = p.slice(0, -1)
  const out: Pt[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
  }
  out.push({ x: out[0].x, y: out[0].y })
  return out
}
