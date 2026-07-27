import { bilateral } from '@/core/filters/bilateral'
import { median3x3 } from '@/core/filters/median'
import { quantize } from '@/core/quantize/quantize'
import { labelRegions } from '@/core/regions/connected-components'
import { computeAnchors } from '@/core/regions/label-anchor'
import { mergeSmallRegions } from '@/core/regions/merge-small'
import { buildOutline } from '@/core/regions/outline'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { PuzzleBin } from '@/core/codec/puzzle-format'
import type {
  PipelineParams,
  ProgressFn,
  Puzzle,
  RegionField,
  Rgb,
  RgbaImage,
} from '@/core/types'

const BISECTION_MAX_ITERS = 6
const TARGET_TOLERANCE = 0.25

export interface PipelineResult {
  puzzle: Puzzle
  bin: PuzzleBin
  /** giá trị minArea thực sự đã dùng (sau bisection nếu params là 'auto') */
  usedMinArea: number
}

/**
 * Stage 0 — thu nhỏ về maxDim bằng lấy trung bình vùng (box filter).
 * Không dùng lấy mẫu điểm gần nhất: nó giữ lại noise và tạo răng cưa, làm
 * Stage 3 ra vùng vụn dọc theo mọi cạnh chéo.
 */
export function resizeToMaxDim(img: RgbaImage, maxDim: number): RgbaImage {
  const longest = Math.max(img.width, img.height)
  if (longest <= maxDim) {
    return {
      data: new Uint8ClampedArray(img.data),
      width: img.width,
      height: img.height,
    }
  }

  const scale = maxDim / longest
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const out = new Uint8ClampedArray(w * h * 4)

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w))

      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4
          r += img.data[i]
          g += img.data[i + 1]
          b += img.data[i + 2]
          n++
        }
      }

      const o = (y * w + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = 255
    }
  }

  return { data: out, width: w, height: h }
}

/** Stage 3 + 4 gói lại — đây là phần bisection lặp lại */
function segmentAndMerge(
  labels: Uint8Array,
  width: number,
  height: number,
  palette: readonly Rgb[],
  minArea: number,
  mergeDeltaE: number,
): RegionField {
  const raw = labelRegions(labels, width, height)
  return mergeSmallRegions(raw, palette, minArea, mergeDeltaE)
}

/**
 * Dò minArea bằng bisection để số vùng ≈ targetRegions.
 * CHỈ chạy lại Stage 3→4 từ `labels` đã có — Stage 0–2 là phần đắt nhất và
 * không phụ thuộc minArea, chạy lại là vứt thời gian.
 */
function bisectMinArea(
  labels: Uint8Array,
  width: number,
  height: number,
  palette: readonly Rgb[],
  targetRegions: number,
  mergeDeltaE: number,
): { field: RegionField; minArea: number } {
  let lo = 1
  let hi = Math.max(2, Math.floor((width * height) / Math.max(1, targetRegions)) * 4)

  let best = segmentAndMerge(labels, width, height, palette, lo, mergeDeltaE)
  let bestMinArea = lo
  let bestErr = Math.abs(best.regions.length - targetRegions)

  for (let iter = 0; iter < BISECTION_MAX_ITERS; iter++) {
    const mid = Math.max(1, Math.floor((lo + hi) / 2))
    const field = segmentAndMerge(labels, width, height, palette, mid, mergeDeltaE)
    const count = field.regions.length
    const err = Math.abs(count - targetRegions)

    if (err < bestErr) {
      best = field
      bestMinArea = mid
      bestErr = err
    }

    if (bestErr <= targetRegions * TARGET_TOLERANCE) break

    // minArea lớn hơn ⇒ ít vùng hơn (đơn điệu)
    if (count > targetRegions) lo = mid + 1
    else hi = Math.max(lo, mid - 1)
    if (lo >= hi) break
  }

  return { field: best, minArea: bestMinArea }
}

/**
 * Xâu Stage 0→7. Nhận RGBA đã decode (decode cần DOM nên nằm ở src/data).
 * Toàn bộ deterministic: không PRNG, không thời gian, không thứ tự Map bấp bênh.
 */
export function runPipeline(
  img: RgbaImage,
  params: PipelineParams,
  onProgress?: ProgressFn,
): PipelineResult {
  const emit = (stage: Parameters<ProgressFn>[0]['stage'], ratio = 1): void => {
    onProgress?.({ stage, ratio })
  }

  // Stage 0
  emit('chuan-hoa', 0)
  const resized = resizeToMaxDim(img, params.maxDim)
  emit('chuan-hoa')

  // Stage 1
  emit('lam-phang', 0)
  const denoised = median3x3(resized, 2)
  const flattened = bilateral(denoised, params.smoothing)
  emit('lam-phang')

  // Stage 2
  emit('quantize', 0)
  const { labels, palette } = quantize(flattened, params.k)
  emit('quantize')

  // Stage 3 + 4 (có thể lặp nếu minArea = 'auto')
  emit('tach-vung', 0)
  let field: RegionField
  let usedMinArea: number
  if (params.minArea === 'auto') {
    emit('tach-vung')
    emit('gop-vung-vun', 0)
    const r = bisectMinArea(
      labels,
      flattened.width,
      flattened.height,
      palette,
      params.targetRegions,
      params.mergeDeltaE,
    )
    field = r.field
    usedMinArea = r.minArea
  } else {
    emit('tach-vung')
    emit('gop-vung-vun', 0)
    usedMinArea = params.minArea
    field = segmentAndMerge(
      labels,
      flattened.width,
      flattened.height,
      palette,
      usedMinArea,
      params.mergeDeltaE,
    )
  }
  emit('gop-vung-vun')

  // Stage 5
  emit('dat-so', 0)
  const withAnchors = computeAnchors(field, params.minLabelRadius)
  emit('dat-so')

  // Stage 6
  emit('ve-vien', 0)
  const outline = buildOutline(withAnchors)
  emit('ve-vien')

  // Stage 7
  emit('dong-goi', 0)
  const runs = buildRegionRuns(withAnchors)
  const puzzle: Puzzle = {
    width: withAnchors.width,
    height: withAnchors.height,
    palette,
    regionMap: withAnchors.regionMap,
    regions: withAnchors.regions,
    runs,
    outline,
  }
  const bin: PuzzleBin = {
    width: puzzle.width,
    height: puzzle.height,
    palette,
    regionCount: puzzle.regions.length,
    regionMap: puzzle.regionMap,
  }
  emit('dong-goi')

  return { puzzle, bin, usedMinArea }
}
