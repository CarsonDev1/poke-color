import { describe, expect, it } from 'vitest'
import { resizeToMaxDim, runPipeline } from '@/core/pipeline'
import { DEFAULT_PARAMS, type PipelineParams, type PipelineStage, type RgbaImage } from '@/core/types'

function make(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

/** 4 góc 4 màu rời nhau rõ rệt + chút noise để bắt buộc phải làm phẳng */
function fourQuadrants(size = 64): RgbaImage {
  const colors: [number, number, number][] = [
    [220, 30, 30],
    [30, 200, 60],
    [40, 70, 220],
    [240, 230, 40],
  ]
  return make(size, size, (x, y) => {
    const q = (y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1)
    const c = colors[q]
    // noise xác định (không dùng random) để giữ test deterministic
    const n = ((x * 7 + y * 13) % 5) - 2
    return [c[0] + n, c[1] + n, c[2] + n]
  })
}

/**
 * Ảnh có kích thước vùng trải rộng: cạnh khối chạy vòng qua 2,3,5,8,13 px
 * theo cả hai trục (diện tích khối 4..169 px², gấp ~42 lần), màu mỗi khối
 * chọn bằng hash tất định (không Math.random) của chỉ số khối trong palette
 * 8 màu tách biệt rõ. Mục đích: khiến đường cong số-vùng theo minArea mịn
 * dần đều thay vì nhảy bậc thô như fixture khối-đều-4x4 cũ — đây mới là ca
 * bisection được thiết kế để xử lý (gần với ảnh chụp thật hơn).
 */
function variedBlocks(size = 128): RgbaImage {
  const sizes = [2, 3, 5, 8, 13]
  const colors: [number, number, number][] = [
    [220, 30, 30],
    [30, 200, 60],
    [40, 70, 220],
    [240, 230, 40],
    [200, 40, 200],
    [40, 200, 200],
    [230, 130, 20],
    [140, 90, 40],
  ]

  const blockIndexAt = (n: number): number[] => {
    const idx = new Array<number>(n)
    let pos = 0
    let block = 0
    while (pos < n) {
      const len = sizes[block % sizes.length]
      for (let i = 0; i < len && pos < n; i++, pos++) idx[pos] = block
      block++
    }
    return idx
  }
  const xBlock = blockIndexAt(size)
  const yBlock = blockIndexAt(size)

  return make(size, size, (x, y) => {
    const bx = xBlock[x]
    const by = yBlock[y]
    // hash tất định (hằng số nhân số nguyên tố lớn) — không Math.random
    const h = (bx * 2654435761 + by * 2246822519) >>> 0
    return colors[h % colors.length]
  })
}

const params = (over: Partial<PipelineParams> = {}): PipelineParams => ({
  ...DEFAULT_PARAMS,
  ...over,
})

describe('resizeToMaxDim', () => {
  it('không đổi khi ảnh đã nhỏ hơn maxDim', () => {
    const img = make(50, 30, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(50)
    expect(out.height).toBe(30)
  })

  it('thu nhỏ theo cạnh dài, giữ tỉ lệ', () => {
    const img = make(400, 200, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(100)
    expect(out.height).toBe(50)
  })

  it('thu nhỏ theo cạnh dài khi ảnh dọc', () => {
    const img = make(200, 400, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(50)
    expect(out.height).toBe(100)
  })

  it('giữ màu của vùng phẳng khi thu nhỏ', () => {
    const img = make(40, 40, () => [10, 120, 250])
    const out = resizeToMaxDim(img, 20)
    const i = (10 * 20 + 10) * 4
    expect(out.data[i]).toBeCloseTo(10, -1)
    expect(out.data[i + 1]).toBeCloseTo(120, -1)
    expect(out.data[i + 2]).toBeCloseTo(250, -1)
  })

  it('không bao giờ ra kích thước 0', () => {
    const img = make(1000, 3, () => [0, 0, 0])
    const out = resizeToMaxDim(img, 10)
    expect(out.width).toBe(10)
    expect(out.height).toBeGreaterThanOrEqual(1)
  })
})

describe('runPipeline', () => {
  it('ảnh 4 góc 4 màu → khoảng 4 vùng', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 40, targetRegions: 4 }))
    expect(r.puzzle.regions.length).toBeGreaterThanOrEqual(4)
    expect(r.puzzle.regions.length).toBeLessThanOrEqual(8)
  })

  it('DETERMINISTIC: chạy 2 lần ra byte y hệt', () => {
    const img = fourQuadrants()
    const p = params({ k: 6, minArea: 30 })
    const a = runPipeline(img, p)
    const b = runPipeline(img, p)

    expect(Array.from(a.puzzle.regionMap)).toEqual(Array.from(b.puzzle.regionMap))
    expect(a.puzzle.regions).toEqual(b.puzzle.regions)
    expect(a.puzzle.palette).toEqual(b.puzzle.palette)
    expect(Array.from(a.puzzle.outline)).toEqual(Array.from(b.puzzle.outline))
    expect(a.usedMinArea).toBe(b.usedMinArea)
  })

  it('phát progress cho đủ 8 stage, đúng thứ tự', () => {
    const seen: PipelineStage[] = []
    runPipeline(fourQuadrants(), params({ k: 4, minArea: 40 }), (p) => {
      if (seen[seen.length - 1] !== p.stage) seen.push(p.stage)
    })
    expect(seen).toEqual([
      'chuan-hoa',
      'lam-phang',
      'quantize',
      'tach-vung',
      'gop-vung-vun',
      'dat-so',
      've-vien',
      'dong-goi',
    ])
  })

  it('minArea auto hội tụ về gần targetRegions trong sai số ±25% (fixture vùng đa kích cỡ)', () => {
    // Fixture cũ (khối 4x4 đều tăm tắp, 5 màu) cho đường cong số-vùng theo
    // minArea là một cầu thang thô (nhảy thẳng 788 → 9 quanh target=40), nên
    // một khoảng tuyệt đối quanh target là không thể thoả dù bisection chạy
    // đúng: gần như MỌI usedMinArea > 1 đều thoả assertion tương đối yếu hơn,
    // nên bài test trước không phân biệt được "bisection hội tụ tốt" với
    // "bisection chạy tệ nhưng còn hơn không chạy". `variedBlocks` khắc phục
    // gốc rễ: diện tích khối trải rộng 4..169 px² khiến đường cong mịn dần
    // đều. Đo thực nghiệm (k=8, nhiều targetRegions khác nhau) xác nhận:
    //   target=30 → count=27  (err=3,  10.0%)
    //   target=40 → count=45  (err=5,  12.5%)
    //   target=45 → count=45  (err=0,   0.0%)
    //   target=50 → count=45  (err=5,  10.0%)
    //   target=65 → count=77  (err=12, 18.5%)
    //   target=87 → count=85  (err=2,   2.3%)
    //   target=100 → count=87 (err=13, 13.0%)
    //   target=150 → count=129(err=21, 14.0%)
    // Sai số tệ nhất đo được là 18.5% (target=65) — luôn nằm trong ±25%, đúng
    // bằng TARGET_TOLERANCE mà bisectMinArea tự đặt ra cho chính nó. Giữ
    // targetRegions=40 (không đổi so với kế hoạch gốc) vì fixture mới đạt
    // err=5 (12.5%) tại đó — hội tụ tốt, không phải một cú trùng hợp err=0.
    const img = variedBlocks()
    const targetRegions = 40
    const r = runPipeline(img, params({ k: 8, minArea: 'auto', targetRegions }))

    expect(r.usedMinArea).toBeGreaterThan(1)
    expect(Math.abs(r.puzzle.regions.length - targetRegions)).toBeLessThanOrEqual(targetRegions * 0.25)
  })

  it('minArea số cụ thể thì dùng đúng số đó, không dò', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 55 }))
    expect(r.usedMinArea).toBe(55)
  })

  it('bất biến: mọi vùng có area >= usedMinArea (trừ khi chỉ còn 1 vùng)', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 50 }))
    if (r.puzzle.regions.length > 1) {
      for (const region of r.puzzle.regions) {
        expect(region.area).toBeGreaterThanOrEqual(50)
      }
    }
  })

  it('bất biến: anchor của mọi vùng nằm trong vùng đó', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    const { regionMap, width, regions } = r.puzzle
    for (const region of regions) {
      expect(regionMap[region.anchorY * width + region.anchorX]).toBe(region.id)
    }
  })

  it('bất biến: tổng diện tích vùng = width*height', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    const total = r.puzzle.regions.reduce((s, x) => s + x.area, 0)
    expect(total).toBe(r.puzzle.width * r.puzzle.height)
  })

  it('bất biến: mọi colorIndex nằm trong [0, palette.length)', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    for (const region of r.puzzle.regions) {
      expect(region.colorIndex).toBeGreaterThanOrEqual(0)
      expect(region.colorIndex).toBeLessThan(r.puzzle.palette.length)
    }
  })

  it('bin trả về encode/decode được và khớp puzzle', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 40 }))
    expect(r.bin.width).toBe(r.puzzle.width)
    expect(r.bin.regionCount).toBe(r.puzzle.regions.length)
    expect(Array.from(r.bin.regionMap)).toEqual(Array.from(r.puzzle.regionMap))
  })

  it('tôn trọng maxDim: ảnh lớn được thu nhỏ trước khi xử lý', () => {
    const img = make(300, 150, (x) => (x < 150 ? [255, 0, 0] : [0, 0, 255]))
    const r = runPipeline(img, params({ k: 3, minArea: 20, maxDim: 60 }))
    expect(r.puzzle.width).toBe(60)
    expect(r.puzzle.height).toBe(30)
  })
})
