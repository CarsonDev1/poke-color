import type { RegionField } from '@/core/types'

/** adj.get(a).get(b) = số cạnh pixel chung giữa vùng a và b (đối xứng) */
export type Adjacency = Map<number, Map<number, number>>

function bump(adj: Adjacency, a: number, b: number): void {
  let ma = adj.get(a)
  if (!ma) {
    ma = new Map()
    adj.set(a, ma)
  }
  ma.set(b, (ma.get(b) ?? 0) + 1)
}

/**
 * Dựng bảng kề 4-hướng kèm độ dài biên chung.
 * Chỉ quét cạnh phải và cạnh dưới của mỗi pixel — đủ để phủ hết mọi cạnh
 * đúng một lần, rồi ghi cả hai chiều cho đối xứng.
 */
export function buildAdjacency(field: RegionField): Adjacency {
  const { regionMap, width, height } = field
  const adj: Adjacency = new Map()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const a = regionMap[p]

      if (x + 1 < width) {
        const b = regionMap[p + 1]
        if (a !== b) {
          bump(adj, a, b)
          bump(adj, b, a)
        }
      }
      if (y + 1 < height) {
        const b = regionMap[p + width]
        if (a !== b) {
          bump(adj, a, b)
          bump(adj, b, a)
        }
      }
    }
  }

  return adj
}

/**
 * Láng giềng có biên chung dài nhất. Tie-break theo id nhỏ hơn để kết quả
 * không phụ thuộc thứ tự chèn vào Map ⇒ deterministic.
 */
export function longestNeighbor(adj: Adjacency, id: number): number | null {
  const m = adj.get(id)
  if (!m || m.size === 0) return null

  let bestId = -1
  let bestLen = -1
  for (const [other, len] of m) {
    if (len > bestLen || (len === bestLen && other < bestId)) {
      bestLen = len
      bestId = other
    }
  }
  return bestId === -1 ? null : bestId
}
