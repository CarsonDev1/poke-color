import { describe, expect, it } from 'vitest'
import { chamferDistance } from '@/core/regions/distance-transform'

function maskFromRows(rows: string[]): { mask: Uint8Array; w: number; h: number } {
  const h = rows.length
  const w = rows[0].length
  const mask = new Uint8Array(w * h)
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) mask[y * w + x] = row[x] === '#' ? 1 : 0
  })
  return { mask, w, h }
}

describe('chamferDistance', () => {
  it('pixel ngoài vùng có khoảng cách 0', () => {
    const { mask, w, h } = maskFromRows(['.#.', '.#.'])
    const d = chamferDistance(mask, w, h)
    expect(d[0]).toBe(0)
    expect(d[2]).toBe(0)
  })

  it('pixel sát biên có khoảng cách 1', () => {
    const { mask, w, h } = maskFromRows([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ])
    const d = chamferDistance(mask, w, h)
    expect(d[1 * 5 + 1]).toBeCloseTo(1, 5)
  })

  it('tâm hình vuông 5×5 có khoảng cách 3', () => {
    const rows = [
      '.......',
      '.#####.',
      '.#####.',
      '.#####.',
      '.#####.',
      '.#####.',
      '.......',
    ]
    const { mask, w, h } = maskFromRows(rows)
    const d = chamferDistance(mask, w, h)
    expect(d[3 * 7 + 3]).toBeCloseTo(3, 5)
  })

  it('biên ảnh cũng tính là biên vùng', () => {
    // vùng chiếm trọn ảnh 3×3 ⇒ tâm cách biên hữu hạn, không phải vô cực.
    // Biên ảnh được coi như có một lớp nền ảo ngay ngoài khung (quy ước
    // `at()` trả 0 khi ra ngoài ảnh), nên về hình học đây tương đương hệt
    // fixture 5×5 của test "tâm hình vuông" ở trên nhưng với n=3: khoảng
    // cách tâm = (n+1)/2 = 2 — pixel biên của hình vuông cách tâm 1 bước,
    // và cách nền ảo thêm 1 bước nữa. Test gốc trong brief kỳ vọng 1, điều
    // này sai — nó phá công thức (n+1)/2 mà chính test "tâm hình vuông 5×5"
    // (kỳ vọng 3 cho n=5) đã xác lập. Xem task-11-report.md để biết chi tiết.
    const { mask, w, h } = maskFromRows(['###', '###', '###'])
    const d = chamferDistance(mask, w, h)
    expect(d[1 * 3 + 1]).toBeCloseTo(2, 5)
  })

  it('đường 1px dày có khoảng cách tối đa 1', () => {
    const { mask, w, h } = maskFromRows([
      '.....',
      '#####',
      '.....',
    ])
    const d = chamferDistance(mask, w, h)
    let max = 0
    for (const v of d) max = Math.max(max, v)
    expect(max).toBeCloseTo(1, 5)
  })
})
