import type { RegionField, RegionRuns } from '@/core/types'

/**
 * Cắt mỗi vùng thành các đoạn ngang (run) liên tục.
 * Lưu phẳng theo CSR: run của vùng i nằm ở [offsets[i], offsets[i+1]).
 *
 * Nhờ đó việc tô một vùng chỉ cần vài lệnh fillRect trên đúng các đoạn của
 * nó, thay vì quét toàn bộ regionMap mỗi lần bấm.
 *
 * Quét 2 lượt: lượt 1 đếm số run mỗi vùng để cấp mảng đúng kích thước,
 * lượt 2 điền — tránh dùng array-of-arrays rồi flatten.
 */
export function buildRegionRuns(field: RegionField): RegionRuns {
  const { regionMap, regions, width, height } = field
  const count = regions.length

  const perRegion = new Uint32Array(count)
  let totalRuns = 0

  // lượt 1: đếm
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const id = regionMap[y * width + x]
      let end = x
      while (end + 1 < width && regionMap[y * width + end + 1] === id) end++
      perRegion[id]++
      totalRuns++
      x = end + 1
    }
  }

  const offsets = new Uint32Array(count + 1)
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + perRegion[i]

  const cursor = new Uint32Array(offsets.subarray(0, count))
  const yArr = new Uint32Array(totalRuns)
  const x0Arr = new Uint32Array(totalRuns)
  const x1Arr = new Uint32Array(totalRuns)

  // lượt 2: điền
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const id = regionMap[y * width + x]
      let end = x
      while (end + 1 < width && regionMap[y * width + end + 1] === id) end++
      const at = cursor[id]++
      yArr[at] = y
      x0Arr[at] = x
      x1Arr[at] = end
      x = end + 1
    }
  }

  return { offsets, y: yArr, x0: x0Arr, x1: x1Arr }
}
