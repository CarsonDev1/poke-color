import { deltaE76 } from '@/core/color/delta-e'
import { rgbToLab } from '@/core/color/srgb-lab'
import { buildAdjacency, longestNeighbor } from '@/core/regions/adjacency'
import type { RegionField, RegionMeta, Rgb } from '@/core/types'

const MAX_PASSES = 8

/** union-find với nén đường đi; đại diện luôn là id nhỏ nhất ⇒ deterministic */
class DisjointSet {
  private parent: Uint32Array

  constructor(n: number) {
    this.parent = new Uint32Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }

  find(x: number): number {
    let root = x
    while (this.parent[root] !== root) root = this.parent[root]
    while (this.parent[x] !== root) {
      const next = this.parent[x]
      this.parent[x] = root
      x = next
    }
    return root
  }

  /** hợp nhất, giữ id nhỏ hơn làm đại diện */
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (ra < rb) this.parent[rb] = ra
    else this.parent[ra] = rb
  }
}

/**
 * Áp union-find lên regionMap và dựng lại metadata, nén id liên tục.
 * `colorOf` quyết định colorIndex của vùng mới: lấy của vùng gốc có diện
 * tích lớn nhất trong nhóm (vùng nhỏ bị hấp thụ nên phải nhận màu của cái to).
 */
function rebuild(
  field: RegionField,
  ds: DisjointSet,
): RegionField {
  const { regionMap, regions, width, height } = field

  // với mỗi nhóm, tìm vùng gốc có area lớn nhất để lấy colorIndex
  const bestArea = new Map<number, { area: number; colorIndex: number; id: number }>()
  for (const r of regions) {
    const root = ds.find(r.id)
    const cur = bestArea.get(root)
    if (
      !cur ||
      r.area > cur.area ||
      (r.area === cur.area && r.id < cur.id)
    ) {
      bestArea.set(root, { area: r.area, colorIndex: r.colorIndex, id: r.id })
    }
  }

  // nén id theo thứ tự root tăng dần ⇒ deterministic
  const roots = Array.from(bestArea.keys()).sort((a, b) => a - b)
  const newId = new Map<number, number>()
  roots.forEach((root, i) => newId.set(root, i))

  const outMap = new Uint32Array(regionMap.length)
  const outRegions: RegionMeta[] = roots.map((root, i) => ({
    id: i,
    colorIndex: bestArea.get(root)!.colorIndex,
    area: 0,
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
    anchorX: -1,
    anchorY: -1,
    anchorR: -1,
    hasLabel: false,
  }))

  for (let p = 0; p < regionMap.length; p++) {
    const id = newId.get(ds.find(regionMap[p]))!
    outMap[p] = id
    const r = outRegions[id]
    const x = p % width
    const y = (p - x) / width
    r.area++
    if (x < r.minX) r.minX = x
    if (x > r.maxX) r.maxX = x
    if (y < r.minY) r.minY = y
    if (y > r.maxY) r.maxY = y
  }

  return { regionMap: outMap, regions: outRegions, width, height }
}

/**
 * Stage 4 — gộp vùng vụn.
 *
 * 1. Tối đa 8 lượt: gộp mọi vùng area < minArea vào láng giềng chung biên
 *    dài nhất. Mỗi lượt dựng lại field vì việc gộp thay đổi cả diện tích
 *    lẫn quan hệ kề.
 * 2. Force-merge: nếu vẫn còn vùng nhỏ (vùng nhỏ chỉ kề vùng nhỏ), tiếp tục
 *    gộp bất kể ngưỡng tới khi không còn vùng nhỏ nào có láng giềng.
 * 3. Gộp cặp kề nhau có deltaE76 giữa hai màu palette < mergeDeltaE.
 */
export function mergeSmallRegions(
  field: RegionField,
  palette: readonly Rgb[],
  minArea: number,
  mergeDeltaE: number,
): RegionField {
  let cur: RegionField = {
    regionMap: new Uint32Array(field.regionMap),
    regions: field.regions.map((r) => ({ ...r })),
    width: field.width,
    height: field.height,
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const small = cur.regions
      .filter((r) => r.area < minArea)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (small.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    let merged = false
    for (const r of small) {
      const target = longestNeighbor(adj, r.id)
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
    }
    if (!merged) break
    cur = rebuild(cur, ds)
  }

  // force-merge cho phần còn sót
  for (;;) {
    const small = cur.regions
      .filter((r) => r.area < minArea)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (small.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    let merged = false
    for (const r of small) {
      const target = longestNeighbor(adj, r.id)
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
      break // gộp một cái mỗi vòng để tránh gộp chuỗi khó đoán
    }
    if (!merged) break
    cur = rebuild(cur, ds)
  }

  // gộp theo màu quá gần nhau
  if (mergeDeltaE > 0) {
    const labs = palette.map((p) => rgbToLab(p[0], p[1], p[2]))
    for (;;) {
      const adj = buildAdjacency(cur)
      const ds = new DisjointSet(cur.regions.length)
      let merged = false

      // duyệt theo id tăng dần ⇒ deterministic
      for (const r of cur.regions) {
        const m = adj.get(r.id)
        if (!m) continue
        const others = Array.from(m.keys()).sort((a, b) => a - b)
        for (const other of others) {
          if (other <= r.id) continue
          const ca = cur.regions[r.id].colorIndex
          const cb = cur.regions[other].colorIndex
          if (ca === cb) continue
          if (!labs[ca] || !labs[cb]) continue
          if (deltaE76(labs[ca], labs[cb]) < mergeDeltaE) {
            ds.union(r.id, other)
            merged = true
          }
        }
      }

      if (!merged) break
      cur = rebuild(cur, ds)
    }
  }

  return cur
}
