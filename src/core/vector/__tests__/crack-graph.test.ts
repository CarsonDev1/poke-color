import { describe, expect, it } from 'vitest'
import { buildCrackGraph } from '@/core/vector/crack-graph'

/** dựng regionMap từ ASCII, mỗi ký tự riêng là một vùng */
function field(rows: string[]) {
  const height = rows.length
  const width = rows[0].length
  const map = new Uint32Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      map[y * width + x] = seen.get(ch)!
    }
  })
  return { regionMap: map, width, height }
}

/** đếm số crack thật có trong field, để so với tổng độ dài chain */
function countCracks(regionMap: Uint32Array, width: number, height: number): number {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? -1 : regionMap[y * width + x]
  let n = 0
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y - 1) !== at(x, y)) n++ // crack ngang (x,y)-(x+1,y)
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      if (at(x - 1, y) !== at(x, y)) n++ // crack dọc (x,y)-(x,y+1)
    }
  }
  return n
}

describe('buildCrackGraph', () => {
  it('một vùng duy nhất ⇒ chỉ có biên với ngoài ảnh', () => {
    const f = field(['aa', 'aa'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) expect(c.regionA).toBe(-1)
  })

  it('hai vùng cạnh nhau ⇒ ĐÚNG MỘT chain cho biên chung', () => {
    const f = field(['ab', 'ab'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    const shared = chains.filter((c) => c.regionA === 0 && c.regionB === 1)
    expect(shared).toHaveLength(1)
  })

  it('mỗi chain có regionA < regionB (chuẩn hoá để so sánh được)', () => {
    const f = field(['abc', 'abc', 'abc'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      expect(c.regionA).toBeLessThan(c.regionB)
    }
  })

  it('chain ≥ 2 điểm và hai đầu khớp startVertex/endVertex', () => {
    const f = field(['ab', 'cd'])
    const W = f.width + 1
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      expect(c.points.length).toBeGreaterThanOrEqual(2)
      const p0 = c.points[0]
      const pN = c.points[c.points.length - 1]
      expect(p0.y * W + p0.x).toBe(c.startVertex)
      expect(pN.y * W + pN.x).toBe(c.endVertex)
    }
  })

  it('mọi điểm nằm trong lattice [0..w] × [0..h]', () => {
    const f = field(['abc', 'dbe', 'fgh'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      for (const p of c.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(f.width)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(f.height)
      }
    }
  })

  it('điểm liên tiếp luôn kề nhau đúng 1px — chain không được nhảy', () => {
    const f = field(['aabb', 'aabb', 'ccdd', 'ccdd'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      for (let i = 1; i < c.points.length; i++) {
        const d =
          Math.abs(c.points[i].x - c.points[i - 1].x) +
          Math.abs(c.points[i].y - c.points[i - 1].y)
        expect(d).toBe(1)
      }
    }
  })

  /**
   * Vùng lọt HẲN trong vùng khác: quanh nó không có đỉnh nào bậc ≠ 2, nên thuật
   * toán "bắt đầu từ node" sẽ bỏ sót hoàn toàn. Không xử lý ca này thì mọi
   * vùng-trong-vùng biến mất khỏi bản in mà không có lỗi nào.
   */
  it('vùng lọt hẳn trong vùng khác ⇒ vẫn sinh chain KHÉP KÍN', () => {
    const f = field(['aaaaa', 'aaaaa', 'aabaa', 'aaaaa', 'aaaaa'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    const inner = chains.filter((c) => c.regionA === 0 && c.regionB === 1)
    expect(inner).toHaveLength(1)
    expect(inner[0].startVertex).toBe(inner[0].endVertex)
    // 1 pixel ⇒ 4 crack ⇒ 5 điểm (điểm đầu lặp lại ở cuối)
    expect(inner[0].points).toHaveLength(5)
  })

  it('deterministic: chạy hai lần ra kết quả y hệt', () => {
    const f = field(['abc', 'dbe', 'fgh'])
    const a = buildCrackGraph(f.regionMap, f.width, f.height)
    const b = buildCrackGraph(f.regionMap, f.width, f.height)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  /**
   * Bất biến nền tảng: mỗi crack thuộc đúng MỘT chain, và mọi crack đều được
   * phủ. Thiếu crack ⇒ biên hở; trùng crack ⇒ nét vẽ đè lên nhau.
   */
  it('mỗi crack dùng đúng một lần, và phủ hết toàn bộ crack', () => {
    for (const rows of [
      ['abc', 'dbe', 'fgh'],
      ['aabb', 'aabb', 'ccdd', 'ccdd'],
      ['aaaaa', 'aaaaa', 'aabaa', 'aaaaa', 'aaaaa'],
      ['ab', 'ba'], // bàn cờ: đỉnh giữa có bậc 4
    ]) {
      const f = field(rows)
      const chains = buildCrackGraph(f.regionMap, f.width, f.height)
      const used = new Set<string>()
      for (const c of chains) {
        for (let i = 1; i < c.points.length; i++) {
          const a = c.points[i - 1]
          const b = c.points[i]
          const k = [a.x, a.y, b.x, b.y].join(',')
          const kr = [b.x, b.y, a.x, a.y].join(',')
          expect(used.has(k) || used.has(kr), `crack ${k} bị dùng lại`).toBe(false)
          used.add(k)
        }
      }
      expect(used.size, `rows=${rows.join('/')}`).toBe(
        countCracks(f.regionMap, f.width, f.height),
      )
    }
  })

  it('bàn cờ 2x2: đỉnh giữa bậc 4 vẫn xử lý được, không treo', () => {
    const f = field(['ab', 'ba'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) expect(c.points.length).toBeGreaterThanOrEqual(2)
  })
})
