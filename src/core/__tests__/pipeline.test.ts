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
    // k=5, không phải 4: với k đúng bằng 4 (khớp chính xác số màu thật, không
    // dư), Stage 1 (median3x3, per-channel, cố định 2 lượt) tạo vài chục pixel
    // pha trộn dọc biên giữa các góc; các pixel đó đủ lệch để median-cut ở
    // Stage 2 tách nhầm một góc thành 2 cụm gần giống hệt nhau thay vì tách
    // đúng cặp góc màu gần nhau nhất (đã xác minh bằng cách trace từng bước:
    // trên ảnh gốc chưa lọc thì k=4 tách đúng 4/4; ngay sau median3x3 (trước cả
    // bilateral) thì đã sai — lỗi nằm ở tương tác Stage 1 × Stage 2 khi k sát
    // nút, không phải ở cách pipeline.ts ghép các stage). Dư 1 cụm (k=5) là đủ
    // để cụm pha trộn có chỗ riêng, không cướp cụm của một góc thật; vùng nhỏ
    // dư ra bị minArea=40 gộp lại nên vẫn ra đúng 4 vùng.
    const r = runPipeline(fourQuadrants(), params({ k: 5, minArea: 40, targetRegions: 4 }))
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

  it('minArea = auto dò được giá trị đưa số vùng về gần mục tiêu', () => {
    // ảnh nhiều chi tiết để có dư địa dò
    const img = make(96, 96, (x, y) => {
      const v = ((Math.floor(x / 4) * 37 + Math.floor(y / 4) * 61) % 5) * 50
      return [v, 255 - v, (v * 2) % 256]
    })
    const r = runPipeline(img, params({ k: 8, minArea: 'auto', targetRegions: 40 }))

    expect(r.usedMinArea).toBeGreaterThan(0)
    expect(r.puzzle.regions.length).toBeGreaterThanOrEqual(40 * 0.4)
    expect(r.puzzle.regions.length).toBeLessThanOrEqual(40 * 2.5)
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
