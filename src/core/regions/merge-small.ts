import { deltaE76 } from '@/core/color/delta-e'
import { rgbToLab } from '@/core/color/srgb-lab'
import { buildAdjacency, longestNeighbor, longestNeighborWhere } from '@/core/regions/adjacency'
import { computeAnchors } from '@/core/regions/label-anchor'
import type { RegionField, RegionMeta, Rgb } from '@/core/types'

const MAX_PASSES = 8
const MAX_THIN_PASSES = 3

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
 * Stage 4b — gộp những vùng vẫn KHÔNG ĐẶT ĐƯỢC NHÃN sau Stage 4.
 *
 * `minThickness` của `mergeSmallRegions` là điều kiện CẦN chứ không ĐỦ: vành
 * khuyên hay hình chữ C có bbox rất to mà bán kính trong vẫn ~1. Chỉ có
 * distance transform thật mới bắt được, nên vòng này gọi `computeAnchors`.
 *
 * Đặt NGOÀI vòng bisection có chủ đích: đo được 420ms mỗi lượt, mà bisection
 * chạy 20 vòng ⇒ 34s nếu nhúng vào trong. Ngoài vòng thì tổng cộng ~1.3s.
 *
 * Trả về field ĐÃ tính anchor để pipeline không phải gọi computeAnchors lần nữa.
 */
export function mergeUnlabellable(
  field: RegionField,
  minLabelRadius: number,
  maxPasses = MAX_THIN_PASSES,
): RegionField {
  let cur = computeAnchors(field, minLabelRadius)

  for (let pass = 0; pass < maxPasses; pass++) {
    const bad = cur.regions
      .filter((r) => !r.hasLabel)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (bad.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    const badIds = new Set(bad.map((r) => r.id))
    let merged = false
    for (const r of bad) {
      // cùng lý do như trong mergeSmallRegions: gộp vào một vùng cũng không có
      // nhãn sẽ nối chuỗi và đổ sập vùng lớn
      const target = longestNeighborWhere(adj, r.id, (o) => !badIds.has(o))
      // vùng duy nhất còn lại không có láng giềng ⇒ đành để không nhãn, thà
      // vậy hơn là xoá nội dung ảnh
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
    }

    if (!merged) {
      // Không vùng nào có đích "có nhãn" — cả ảnh toàn vùng không nhãn và chúng
      // chỉ kề nhau. Hoãn nữa là hoãn vĩnh viễn, nên ghép thành từng CẶP RỜI
      // NHAU: mỗi vùng tham gia đúng một lần nên đường gộp dài tối đa 2, không
      // thể nối chuỗi.
      const touched = new Set<number>()
      for (const r of bad) {
        if (touched.has(r.id)) continue
        const t = longestNeighborWhere(adj, r.id, (o) => !touched.has(o))
        if (t === null) continue
        ds.union(r.id, t)
        touched.add(r.id)
        touched.add(t)
        merged = true
      }
    }
    if (!merged) break

    cur = computeAnchors(rebuild(cur, ds), minLabelRadius)
  }

  return cur
}

/**
 * Stage 4 — gộp vùng vụn.
 *
 * 1. Tối đa 8 lượt: gộp mọi vùng "không dùng được" vào láng giềng chung biên
 *    dài nhất. Mỗi lượt dựng lại field vì việc gộp thay đổi cả diện tích
 *    lẫn quan hệ kề.
 * 2. Force-merge: nếu vẫn còn sót (vùng nhỏ chỉ kề vùng nhỏ), tiếp tục gộp
 *    bất kể ngưỡng tới khi không còn vùng nào có láng giềng.
 * 3. Gộp cặp kề nhau có deltaE76 giữa hai màu palette < mergeDeltaE.
 *
 * `minThickness` (mặc định 0 ⇒ tắt) loại vùng MỎNG, không chỉ vùng NHỎ. Đo cho
 * thấy `minArea` một mình để lọt 86% vùng không có nhãn: sliver 1×40px có area
 * 40 nên sống sót mọi minArea, nhưng không chứa nổi một ký tự, không hiện được
 * màu đã tô, và không bấm được trên điện thoại. Đây là điều kiện CẦN và rẻ —
 * vùng chứa được đường tròn bán kính r thì cả hai chiều bbox phải ≥ 2r — dùng
 * area/bbox đã tính sẵn trong `rebuild`, không gọi distance transform.
 * Điều kiện ĐỦ cần bán kính trong thật: xem `mergeUnlabellable`.
 */
export function mergeSmallRegions(
  field: RegionField,
  palette: readonly Rgb[],
  minArea: number,
  mergeDeltaE: number,
  minThickness = 0,
): RegionField {
  let cur: RegionField = {
    regionMap: new Uint32Array(field.regionMap),
    regions: field.regions.map((r) => ({ ...r })),
    width: field.width,
    height: field.height,
  }

  // MỘT predicate cho cả ba vòng dưới. Trước đây mỗi vòng tự viết lại
  // `r.area < minArea`; để chúng lệch nhau là cách chắc chắn sinh vòng lặp
  // vô tận (vòng 1 gộp cái mà vòng 2 coi là đã ổn, và ngược lại).
  const unusable = (r: RegionMeta): boolean =>
    r.area < minArea ||
    Math.min(r.maxX - r.minX + 1, r.maxY - r.minY + 1) < minThickness

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const small = cur.regions
      .filter(unusable)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (small.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    const smallIds = new Set(small.map((r) => r.id))
    let merged = false
    for (const r of small) {
      // CHỈ gộp vào vùng dùng được. Gộp vào một vùng cũng-không-dùng-được làm
      // union-find nối chuỗi A→B→C ngay trong một lượt và đổ sập cả vùng lớn
      // thành một mảng — đo được 7282 vùng tụt còn 672 khi không có điều kiện
      // này. Không có đích hợp lệ thì HOÃN sang lượt sau: lúc đó các vùng khác
      // đã dày lên và trở thành đích hợp lệ. Vòng force-merge dưới là lưới an
      // toàn cho phần vẫn còn sót.
      const target = longestNeighborWhere(adj, r.id, (o) => !smallIds.has(o))
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
    }

    if (!merged) {
      // mọi vùng đều không dùng được và chỉ kề nhau — ghép thành từng CẶP RỜI
      // NHAU, mỗi vùng tham gia đúng một lần ⇒ đường gộp dài tối đa 2
      const touched = new Set<number>()
      for (const r of small) {
        if (touched.has(r.id)) continue
        const t = longestNeighborWhere(adj, r.id, (o) => !touched.has(o))
        if (t === null) continue
        ds.union(r.id, t)
        touched.add(r.id)
        touched.add(t)
        merged = true
      }
    }
    if (!merged) break
    cur = rebuild(cur, ds)
  }

  // force-merge cho phần còn sót
  for (;;) {
    const small = cur.regions
      .filter(unusable)
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
