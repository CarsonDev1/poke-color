import { buildAdjacency, longestNeighborWhere } from '@/core/regions/adjacency'
import type { RegionField, RegionMeta } from '@/core/types'

export type EditOp =
  | { kind: 'merge'; a: number; b: number }
  | { kind: 'color'; region: number; colorIndex: number }
  | { kind: 'mergeSmall'; minArea: number }

/**
 * Vùng đã bị hấp thụ có `area === 0`. KHÔNG nén lại id ở đây, có chủ đích:
 * `edits` log tham chiếu vùng theo id, nên nén id giữa các thao tác sẽ làm
 * thao tác thứ hai trỏ sang một vùng khác hẳn. Nén chỉ xảy ra lúc lưu
 * (`compactField`).
 */
export function isDead(r: RegionMeta): boolean {
  return r.area === 0
}

function cloneField(f: RegionField): RegionField {
  return {
    regionMap: new Uint32Array(f.regionMap),
    regions: f.regions.map((r) => ({ ...r })),
    width: f.width,
    height: f.height,
  }
}

/** gộp b vào a tại chỗ; KHÔNG kiểm tra kề nhau (bên gọi lo) */
function absorb(f: RegionField, a: number, b: number): void {
  const ra = f.regions[a]
  const rb = f.regions[b]
  for (let i = 0; i < f.regionMap.length; i++) {
    if (f.regionMap[i] === b) f.regionMap[i] = a
  }
  ra.area += rb.area
  ra.minX = Math.min(ra.minX, rb.minX)
  ra.minY = Math.min(ra.minY, rb.minY)
  ra.maxX = Math.max(ra.maxX, rb.maxX)
  ra.maxY = Math.max(ra.maxY, rb.maxY)
  // b chết: area 0 và bbox rỗng
  rb.area = 0
  rb.minX = f.width
  rb.minY = f.height
  rb.maxX = -1
  rb.maxY = -1
  // anchor của a không còn đúng; recompute sẽ tính lại
  ra.anchorR = -1
  ra.hasLabel = false
}

function areAdjacent(f: RegionField, a: number, b: number): boolean {
  const adj = buildAdjacency(f)
  return (adj.get(a)?.get(b) ?? 0) > 0
}

/**
 * Áp MỘT thao tác, trả field MỚI (không sửa đầu vào).
 *
 * Ném lỗi tiếng Việt khi thao tác không hợp lệ — không âm thầm bỏ qua: người
 * dùng bấm "gộp" mà không có gì xảy ra và không có lời giải thích là tệ hơn một
 * thông báo lỗi.
 */
export function applyOp(field: RegionField, op: EditOp): RegionField {
  const f = cloneField(field)

  if (op.kind === 'merge') {
    const { a, b } = op
    if (a === b) throw new Error('Không thể gộp một vùng với chính nó.')
    if (!f.regions[a] || !f.regions[b]) {
      throw new Error(`Vùng không tồn tại: ${!f.regions[a] ? a : b}`)
    }
    if (isDead(f.regions[a]) || isDead(f.regions[b])) {
      throw new Error('Vùng đã bị gộp trước đó, không thể gộp lại.')
    }
    // Kiểm KỀ NHAU là bắt buộc (spec §18): gộp hai vùng rời nhau tạo ra một
    // "vùng" gồm hai mảnh không nối, và người tô sẽ thấy một số ở nơi này lại
    // phải tô cả một mảng ở nơi khác.
    if (!areAdjacent(f, a, b)) {
      throw new Error(`Vùng ${a} và ${b} không kề nhau nên không gộp được.`)
    }
    absorb(f, a, b)
    return f
  }

  if (op.kind === 'color') {
    const r = f.regions[op.region]
    if (!r) throw new Error(`Vùng không tồn tại: ${op.region}`)
    if (isDead(r)) throw new Error('Vùng đã bị gộp, không thể đổi màu.')
    if (op.colorIndex < 0) throw new Error('Chỉ số màu không hợp lệ.')
    r.colorIndex = op.colorIndex
    return f
  }

  // mergeSmall: gộp loạt mọi vùng nhỏ hơn ngưỡng vào láng giềng biên dài nhất
  const adj = buildAdjacency(f)
  const small = f.regions
    .filter((r) => !isDead(r) && r.area < op.minArea)
    .sort((a, b) => a.area - b.area || a.id - b.id)

  const touched = new Set<number>()
  for (const r of small) {
    if (touched.has(r.id)) continue
    // Chỉ gộp vào vùng chưa tham gia lượt này ⇒ đường gộp dài tối đa 2, không
    // nối chuỗi. Cùng kỹ thuật đã dùng ở mergeSmallRegions.
    const target = longestNeighborWhere(
      adj,
      r.id,
      (o) => !touched.has(o) && !isDead(f.regions[o]) && o !== r.id,
    )
    if (target === null) continue
    absorb(f, target, r.id)
    touched.add(r.id)
    touched.add(target)
  }
  return f
}

/**
 * Áp cả một chuỗi thao tác từ field GỐC.
 *
 * Undo/redo được làm bằng cách chạy lại từ gốc với ít thao tác hơn, chứ không
 * phải bằng cách nghịch đảo từng thao tác. Nghịch đảo `mergeSmall` là bất khả
 * (không biết nó đã gộp những gì mà không lưu thêm state), còn chạy lại thì
 * bảo đảm `regionMap` trở về byte-identical — đúng yêu cầu spec §18.
 */
export function applyOps(base: RegionField, ops: readonly EditOp[]): RegionField {
  let cur = base
  for (const op of ops) cur = applyOp(cur, op)
  return cur
}

/**
 * Nén id liên tục, bỏ các vùng đã chết. Chỉ gọi khi LƯU — gọi giữa các thao tác
 * sẽ làm `edits` log trỏ sai vùng.
 */
export function compactField(field: RegionField): RegionField {
  const alive = field.regions.filter((r) => !isDead(r))
  const newId = new Map<number, number>()
  alive.forEach((r, i) => newId.set(r.id, i))

  const regionMap = new Uint32Array(field.regionMap.length)
  for (let i = 0; i < regionMap.length; i++) {
    regionMap[i] = newId.get(field.regionMap[i]) ?? 0
  }

  const regions: RegionMeta[] = alive.map((r, i) => ({ ...r, id: i }))
  return { regionMap, regions, width: field.width, height: field.height }
}
