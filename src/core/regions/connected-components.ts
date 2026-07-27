import type { RegionField, RegionMeta } from '@/core/types'

const UNASSIGNED = 0xffffffff

/**
 * Stage 3 — gán nhãn thành phần liên thông 4-hướng trên mảng colorIndex.
 *
 * Dùng stack tường minh (Uint32Array cấp sẵn bằng số pixel) thay vì đệ quy:
 * một vùng nền có thể chứa hàng trăm nghìn pixel và đệ quy sẽ tràn call stack.
 */
export function labelRegions(
  labels: Uint8Array,
  width: number,
  height: number,
): RegionField {
  const n = width * height
  const regionMap = new Uint32Array(n).fill(UNASSIGNED)
  const regions: RegionMeta[] = []
  const stack = new Uint32Array(n)

  for (let seed = 0; seed < n; seed++) {
    if (regionMap[seed] !== UNASSIGNED) continue

    const id = regions.length
    const colorIndex = labels[seed]

    let area = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1

    let top = 0
    stack[top++] = seed
    regionMap[seed] = id

    while (top > 0) {
      const p = stack[--top]
      const x = p % width
      const y = (p - x) / width

      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // 4-hướng: trái, phải, trên, dưới
      if (x > 0) {
        const q = p - 1
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (x + 1 < width) {
        const q = p + 1
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (y > 0) {
        const q = p - width
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (y + 1 < height) {
        const q = p + width
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
    }

    regions.push({
      id,
      colorIndex,
      area,
      minX,
      minY,
      maxX,
      maxY,
      anchorX: -1,
      anchorY: -1,
      anchorR: -1,
      hasLabel: false,
    })
  }

  return { regionMap, regions, width, height }
}
