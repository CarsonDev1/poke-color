import type { Chain, Pt } from '@/core/vector/crack-graph'

export interface RegionRings {
  regionId: number
  /** mỗi ring khép kín: điểm đầu === điểm cuối */
  rings: Pt[][]
}

/**
 * Ghép các chain quanh mỗi vùng thành ring khép kín.
 *
 * ĐÂY là chỗ tính chất "không hở kẽ" thành hiện thực: hàm này KHÔNG sinh điểm
 * mới nào. Nó chỉ nối lại đúng những chuỗi điểm đã có trong `chains`. Vì mỗi
 * biên chung chỉ có MỘT chain, hai vùng kề nhau chắc chắn dùng chuỗi điểm y hệt
 * — theo cấu trúc, không phải nhờ khéo tay.
 *
 * Gọi hàm này SAU khi đã simplify/chaikin từng chain. Làm ngược lại (ghép ring
 * rồi mới đơn giản hoá cả ring) là quay về đúng cái lỗi mà D8 tránh: biên chung
 * bị xử lý hai lần theo hai ngữ cảnh khác nhau.
 *
 * Vùng có lỗ ⇒ nhiều ring; xuất SVG với `fill-rule="evenodd"` nên không cần
 * quan tâm chiều xoay.
 */
export function buildRegionRings(chains: Chain[], regionCount: number): RegionRings[] {
  // vùng → các chain giáp nó. Quét theo chỉ số tăng dần ⇒ deterministic.
  const byRegion = new Map<number, number[]>()
  for (let i = 0; i < chains.length; i++) {
    for (const r of [chains[i].regionA, chains[i].regionB]) {
      if (r < 0) continue // ngoài ảnh, không phải một vùng
      const list = byRegion.get(r)
      if (list) list.push(i)
      else byRegion.set(r, [i])
    }
  }

  const out: RegionRings[] = []

  for (let regionId = 0; regionId < regionCount; regionId++) {
    const own = byRegion.get(regionId)
    if (!own || own.length === 0) {
      out.push({ regionId, rings: [] })
      continue
    }

    // đỉnh → các chain (của vùng này) chạm vào đỉnh đó
    const atVertex = new Map<number, number[]>()
    const push = (v: number, ci: number): void => {
      const l = atVertex.get(v)
      if (l) l.push(ci)
      else atVertex.set(v, [ci])
    }
    for (const ci of own) {
      push(chains[ci].startVertex, ci)
      if (chains[ci].endVertex !== chains[ci].startVertex) {
        push(chains[ci].endVertex, ci)
      }
    }

    const used = new Set<number>()
    const rings: Pt[][] = []

    for (const seed of own) {
      if (used.has(seed)) continue

      const first = chains[seed]
      used.add(seed)

      // chain tự khép kín ⇒ đã là một ring
      if (first.startVertex === first.endVertex) {
        rings.push(first.points.slice())
        continue
      }

      const ring: Pt[] = first.points.slice()
      const startV = first.startVertex
      let endV = first.endVertex

      // nối tiếp tới khi quay về đỉnh bắt đầu
      for (;;) {
        if (endV === startV) break
        const candidates = atVertex.get(endV)
        if (!candidates) break

        const nextIdx = candidates.find((ci) => !used.has(ci))
        if (nextIdx === undefined) break

        used.add(nextIdx)
        const next = chains[nextIdx]

        if (next.startVertex === endV) {
          // đi thuận: bỏ điểm đầu vì nó trùng điểm cuối hiện tại
          for (let i = 1; i < next.points.length; i++) ring.push(next.points[i])
          endV = next.endVertex
        } else {
          // đi ngược
          for (let i = next.points.length - 2; i >= 0; i--) ring.push(next.points[i])
          endV = next.startVertex
        }
      }

      // Khép lại tường minh. Nếu vòng không đóng được (topology lạ) thì vẫn nối
      // về điểm đầu: thà một ring hơi lệch còn hơn một path hở làm SVG loang màu
      // ra toàn trang khi fill.
      const a = ring[0]
      const b = ring[ring.length - 1]
      if (a.x !== b.x || a.y !== b.y) ring.push({ x: a.x, y: a.y })

      rings.push(ring)
    }

    out.push({ regionId, rings })
  }

  return out
}
