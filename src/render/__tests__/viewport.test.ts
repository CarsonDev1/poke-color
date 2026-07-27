import { describe, expect, it } from 'vitest'
import {
  clampPan,
  fitViewport,
  hitTestRegion,
  imageToScreen,
  panBy,
  screenToImage,
  zoomAbout,
} from '@/render/viewport'

describe('fitViewport', () => {
  it('ảnh rộng hơn khung: vừa theo chiều ngang và canh giữa dọc', () => {
    const v = fitViewport(200, 100, 100, 100)
    expect(v.scale).toBeCloseTo(0.5, 6)
    expect(v.tx).toBeCloseTo(0, 6)
    expect(v.ty).toBeCloseTo(25, 6)
  })

  it('ảnh cao hơn khung: vừa theo chiều dọc và canh giữa ngang', () => {
    const v = fitViewport(100, 200, 100, 100)
    expect(v.scale).toBeCloseTo(0.5, 6)
    expect(v.tx).toBeCloseTo(25, 6)
    expect(v.ty).toBeCloseTo(0, 6)
  })

  it('ảnh nhỏ hơn khung vẫn được phóng lên cho vừa', () => {
    const v = fitViewport(50, 50, 100, 100)
    expect(v.scale).toBeCloseTo(2, 6)
  })
})

describe('screenToImage / imageToScreen', () => {
  it('đi vòng khớp nhau', () => {
    const v = { scale: 2.5, tx: 13, ty: -7 }
    const s = imageToScreen(v, 40, 60)
    const back = screenToImage(v, s.x, s.y)
    expect(back).toEqual({ x: 40, y: 60 })
  })

  it('screenToImage làm tròn xuống về pixel nguyên', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(screenToImage(v, 25, 39)).toEqual({ x: 2, y: 3 })
  })

  it('xử lý đúng toạ độ âm', () => {
    const v = { scale: 1, tx: 100, ty: 100 }
    expect(screenToImage(v, 50, 50)).toEqual({ x: -50, y: -50 })
  })
})

describe('zoomAbout', () => {
  it('GIỮ BẤT ĐỘNG điểm dưới con trỏ', () => {
    const v = { scale: 1, tx: 0, ty: 0 }
    const cursor = { x: 137, y: 84 }
    const before = screenToImage(v, cursor.x, cursor.y)

    const z = zoomAbout(v, cursor.x, cursor.y, 2.3, 0.1, 40)
    const after = screenToImage(z, cursor.x, cursor.y)

    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  it('giữ bất động qua nhiều lần zoom liên tiếp', () => {
    let v = { scale: 1, tx: 0, ty: 0 }
    const cx = 200
    const cy = 150
    const target = screenToImage(v, cx, cy)
    for (const f of [1.2, 1.2, 1.2, 0.8, 1.5]) {
      v = zoomAbout(v, cx, cy, f, 0.1, 40)
    }
    expect(screenToImage(v, cx, cy)).toEqual(target)
  })

  it('kẹp scale trong [minScale, maxScale]', () => {
    expect(zoomAbout({ scale: 1, tx: 0, ty: 0 }, 0, 0, 1000, 0.5, 8).scale).toBe(8)
    expect(zoomAbout({ scale: 1, tx: 0, ty: 0 }, 0, 0, 0.0001, 0.5, 8).scale).toBe(0.5)
  })

  it('scale đã ở giới hạn thì không dịch chuyển nữa', () => {
    const at = { scale: 8, tx: 33, ty: 44 }
    expect(zoomAbout(at, 100, 100, 2, 0.5, 8)).toEqual(at)
  })
})

describe('panBy / clampPan', () => {
  it('panBy dịch đúng lượng', () => {
    expect(panBy({ scale: 2, tx: 10, ty: 20 }, -5, 7)).toEqual({ scale: 2, tx: 5, ty: 27 })
  })

  it('clampPan: ảnh lớn hơn khung thì không cho lộ khoảng trắng', () => {
    // ảnh 200×200 ở scale 1 trong khung 100×100
    const v = clampPan({ scale: 1, tx: 50, ty: 50 }, 200, 200, 100, 100)
    expect(v.tx).toBeLessThanOrEqual(0)
    expect(v.ty).toBeLessThanOrEqual(0)
    expect(v.tx).toBeGreaterThanOrEqual(100 - 200)
    expect(v.ty).toBeGreaterThanOrEqual(100 - 200)
  })

  it('clampPan: ảnh nhỏ hơn khung thì canh giữa', () => {
    const v = clampPan({ scale: 0.25, tx: -999, ty: 999 }, 200, 200, 100, 100)
    expect(v.tx).toBeCloseTo(25, 6)
    expect(v.ty).toBeCloseTo(25, 6)
  })
})

describe('hitTestRegion', () => {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2, 3, 3])

  it('trả về id vùng tại điểm bấm', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 5)).toBe(0)
    expect(hitTestRegion(v, regionMap, 4, 2, 25, 5)).toBe(1)
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 15)).toBe(2)
    expect(hitTestRegion(v, regionMap, 4, 2, 35, 15)).toBe(3)
  })

  it('bấm ngoài ảnh → null', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(hitTestRegion(v, regionMap, 4, 2, -5, 5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 5, -5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 45, 5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 25)).toBeNull()
  })

  it('hoạt động đúng khi đã pan và zoom', () => {
    const v = { scale: 4, tx: -6, ty: 3 }
    // pixel ảnh (2,0) → screen x = 2*4-6 = 2 .. 6, y = 3 .. 7
    expect(hitTestRegion(v, regionMap, 4, 2, 3, 4)).toBe(1)
  })
})
