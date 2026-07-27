/** sRGB 0..255 */
export type Rgb = readonly [number, number, number]
/** CIE Lab, L 0..100, a/b khoảng -128..127 */
export type Lab = readonly [number, number, number]

/** Ảnh RGBA phẳng, độ dài = width*height*4 */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Kết quả Stage 2 */
export interface QuantizeResult {
  /** độ dài width*height, giá trị 0..palette.length-1 */
  labels: Uint8Array
  /** đã sắp ổn định theo L, rồi a, rồi b tăng dần */
  palette: Rgb[]
}

export interface RegionMeta {
  id: number
  colorIndex: number
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** chỗ đặt số; -1 khi chưa tính (Stage 5 sẽ điền) */
  anchorX: number
  anchorY: number
  /** bán kính nội tiếp tại anchor, px */
  anchorR: number
  /** false ⇒ vùng quá nhỏ, không in số */
  hasLabel: boolean
}

/** Trường vùng: bản đồ pixel → id vùng, kèm metadata */
export interface RegionField {
  /** độ dài width*height, giá trị 0..regions.length-1 */
  regionMap: Uint32Array
  regions: RegionMeta[]
  width: number
  height: number
}

/** Pixel-run mỗi vùng, lưu phẳng để tô nhanh không cần quét cả ảnh */
export interface RegionRuns {
  /** độ dài regionCount+1; run của vùng i là [offsets[i], offsets[i+1]) */
  offsets: Uint32Array
  y: Uint32Array
  x0: Uint32Array
  /** bao gồm cả x1 (inclusive) */
  x1: Uint32Array
}

export interface PipelineParams {
  maxDim: number
  k: number
  /** 'auto' ⇒ dò bằng bisection để số vùng ≈ targetRegions */
  minArea: number | 'auto'
  targetRegions: number
  /** số lượt bilateral, 0..3 */
  smoothing: number
  mergeDeltaE: number
  minLabelRadius: number
}

export const DEFAULT_PARAMS: PipelineParams = {
  maxDim: 1400,
  k: 12,
  minArea: 'auto',
  targetRegions: 500,
  smoothing: 2,
  mergeDeltaE: 6,
  minLabelRadius: 7,
}

export type PresetName = 'de' | 'vua' | 'kho'

export const PRESETS: Record<PresetName, Pick<PipelineParams, 'k' | 'targetRegions'>> = {
  de: { k: 8, targetRegions: 200 },
  vua: { k: 12, targetRegions: 500 },
  kho: { k: 16, targetRegions: 1000 },
}

/** Puzzle hoàn chỉnh, đủ để chơi */
export interface Puzzle {
  width: number
  height: number
  palette: Rgb[]
  regionMap: Uint32Array
  regions: RegionMeta[]
  runs: RegionRuns
  /** mask viền 1px, độ dài width*height, giá trị 0 hoặc 255 */
  outline: Uint8Array
}

export type PipelineStage =
  | 'chuan-hoa'
  | 'lam-phang'
  | 'quantize'
  | 'tach-vung'
  | 'gop-vung-vun'
  | 'dat-so'
  | 've-vien'
  | 'dong-goi'

export const STAGE_LABELS: Record<PipelineStage, string> = {
  'chuan-hoa': 'Chuẩn hoá ảnh',
  'lam-phang': 'Làm phẳng',
  quantize: 'Gom màu',
  'tach-vung': 'Tách vùng',
  'gop-vung-vun': 'Gộp vùng vụn',
  'dat-so': 'Đặt số',
  've-vien': 'Vẽ viền',
  'dong-goi': 'Đóng gói',
}

export interface StageProgress {
  stage: PipelineStage
  /** 0..1 trong nội bộ stage, hoặc 1 khi stage xong */
  ratio: number
}

export type ProgressFn = (p: StageProgress) => void
