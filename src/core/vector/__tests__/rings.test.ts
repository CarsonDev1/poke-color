import { describe, expect, it } from 'vitest'
import { buildCrackGraph, type Chain } from '@/core/vector/crack-graph'
import { buildRegionRings } from '@/core/vector/rings'
import { simplifyChain } from '@/core/vector/simplify'

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
  return { regionMap: map, width, height, regionCount: seen.size }
}

/** đúng đường đi thật của pipeline: simplify TỪNG CHAIN rồi mới ghép ring */
function pipeline(rows: string[], epsilon = 0.75) {
  const f = field(rows)
  const chains = buildCrackGraph(f.regionMap, f.width, f.height).map((c) => ({
    ...c,
    points: simplifyChain(c.points, epsilon),
  }))
  return { f, chains, rings: buildRegionRings(chains, f.regionCount) }
}

describe('buildRegionRings', () => {
  it('mỗi vùng có ít nhất một ring', () => {
    const { f, rings } = pipeline(['abc', 'abc'])
    expect(rings).toHaveLength(f.regionCount)
    for (const r of rings) expect(r.rings.length).toBeGreaterThanOrEqual(1)
  })

  it('MỌI ring đều khép kín — điểm đầu trùng điểm cuối', () => {
    for (const rows of [
      ['abc', 'abc'],
      ['aabb', 'aabb', 'ccdd', 'ccdd'],
      ['aaaaa', 'aaaaa', 'aabaa', 'aaaaa', 'aaaaa'],
      ['ab', 'ba'],
      ['abc', 'dbe', 'fgh'],
    ]) {
      const { rings } = pipeline(rows)
      for (const r of rings) {
        for (const ring of r.rings) {
          const a = ring[0]
          const b = ring[ring.length - 1]
          expect(a, `vùng ${r.regionId} rows=${rows.join('/')}`).toEqual(b)
        }
      }
    }
  })

  /**
   * ĐÂY LÀ TEST CHỐNG HỞ KẼ mà R4 và §18 đòi.
   *
   * Hai vùng kề nhau phải dùng CHÍNH XÁC cùng chuỗi điểm cho biên chung. Nếu
   * mỗi vùng tự trace và tự đơn giản hoá thì hai chuỗi sẽ lệch nhau vài phần
   * mười pixel — mắt không thấy trên màn hình nhưng in ra là kẽ trắng.
   */
  it('hai vùng kề nhau dùng CÙNG chuỗi điểm cho biên chung', () => {
    // Biên chung phải GỒ GHỀ, không được là đường thẳng: đường thẳng thì đơn
    // giản hoá trong ngữ cảnh nào cũng cho ra đúng hai đầu, nên test sẽ xanh
    // ngay cả khi code sai. Bậc thang chéo mới phân biệt được.
    const { chains, rings } = pipeline([
      'abbbbb',
      'aabbbb',
      'aaabbb',
      'aaaabb',
      'aaaaab',
    ])

    const shared = chains.find((c) => c.regionA === 0 && c.regionB === 1)
    expect(shared).toBeDefined()

    // chuỗi điểm của biên chung, dạng chuẩn hoá không phụ thuộc hướng đi
    const norm = (pts: { x: number; y: number }[]): string => {
      const fwd = pts.map((p) => `${p.x},${p.y}`).join(' ')
      const rev = [...pts].reverse().map((p) => `${p.x},${p.y}`).join(' ')
      return fwd < rev ? fwd : rev
    }
    const sharedKey = norm(shared!.points)

    // biên chung phải xuất hiện NGUYÊN VẸN trong ring của cả hai vùng
    for (const regionId of [0, 1]) {
      const ring = rings.find((r) => r.regionId === regionId)!.rings[0]
      const seq = ring.map((p) => `${p.x},${p.y}`).join(' ')
      const fwd = shared!.points.map((p) => `${p.x},${p.y}`).join(' ')
      const rev = [...shared!.points].reverse().map((p) => `${p.x},${p.y}`).join(' ')
      expect(
        seq.includes(fwd) || seq.includes(rev),
        `vùng ${regionId} không chứa nguyên biên chung ${sharedKey}`,
      ).toBe(true)
    }
  })

  it('vùng lọt hẳn trong vùng khác ⇒ vùng ngoài có ĐÚNG 2 ring (ngoài + lỗ)', () => {
    const { rings } = pipeline(['aaaaa', 'aaaaa', 'aabaa', 'aaaaa', 'aaaaa'])
    const outer = rings.find((r) => r.regionId === 0)!
    const inner = rings.find((r) => r.regionId === 1)!
    expect(outer.rings).toHaveLength(2)
    expect(inner.rings).toHaveLength(1)
  })

  it('mỗi chain được tiêu thụ hết — không sót chain nào ngoài ring', () => {
    const { chains, rings } = pipeline(['abc', 'dbe', 'fgh'])
    // tổng số crack-đoạn trong mọi ring phải >= tổng trong mọi chain
    const chainSegs = chains.reduce((n, c) => n + c.points.length - 1, 0)
    const ringSegs = rings.reduce(
      (n, r) => n + r.rings.reduce((m, ring) => m + ring.length - 1, 0),
      0,
    )
    // chain giáp ngoài ảnh dùng 1 lần, chain giữa hai vùng dùng 2 lần
    expect(ringSegs).toBeGreaterThanOrEqual(chainSegs)
  })

  it('ring có ít nhất 4 điểm (một pixel là 4 crack + điểm khép)', () => {
    const { rings } = pipeline(['ab', 'ab'], 0)
    for (const r of rings) {
      for (const ring of r.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('vùng không có chain nào ⇒ rings rỗng, không ném', () => {
    const empty: Chain[] = []
    const out = buildRegionRings(empty, 3)
    expect(out).toHaveLength(3)
    for (const r of out) expect(r.rings).toEqual([])
  })

  it('deterministic', () => {
    const a = pipeline(['abc', 'dbe', 'fgh']).rings
    const b = pipeline(['abc', 'dbe', 'fgh']).rings
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('regionId trả về theo đúng thứ tự 0..regionCount-1', () => {
    const { rings } = pipeline(['abc', 'def'])
    expect(rings.map((r) => r.regionId)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
