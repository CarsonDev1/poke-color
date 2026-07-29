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
  /** cạnh dài nhất sau normalize, 2000 để đủ pixel cho ~4500 vùng */
  maxDim: number
  /** số màu, 6..30 — trần là MAX_LABELLED_COLORS, xem core/label-alphabet */
  k: number
  /** 'auto' ⇒ dò bằng bisection để số vùng ≈ targetRegions */
  minArea: number | 'auto'
  /** 200..6000 */
  targetRegions: number
  /** số lượt bilateral, 0..3 */
  smoothing: number
  mergeDeltaE: number
  minLabelRadius: number
}

export const DEFAULT_PARAMS: PipelineParams = {
  maxDim: 2000,
  k: 24,
  minArea: 'auto',
  targetRegions: 4500,
  // 0 lượt bilateral, KHÔNG phải 2 (spec §22): bilateral làm phẳng gradient rất
  // tốt, và đó chính là thứ xoá texture nước/mây/cỏ tạo nên độ chi tiết ngang
  // trang sách. Median 3x3 vẫn 2 lượt — nó diệt noise JPEG mà không phá cạnh,
  // và Task 30 của Plan 1 (snap-to-window) đảm bảo nó không bịa màu.
  smoothing: 0,
  mergeDeltaE: 6,
  // 2, chọn bằng ĐO chứ không bằng cảm giác. Đây là đòn thật sự quyết định số
  // vùng, vì `minThickness = 2 * minLabelRadius` trong Stage 4:
  //   r=1 (dày 2px) => 4426 vùng, 100% có nhãn
  //   r=2 (dày 4px) => 1194 vùng, 100% có nhãn
  //   r=3 (dày 6px) =>  661 vùng,  99% có nhãn
  // r=1 đạt đúng mục tiêu 4500 nhưng bằng những sliver dày 2px: đúng SỐ LƯỢNG,
  // sai HÌNH DẠNG. Vùng trong trang sách tham chiếu nhỏ mà đều đặn, chứa vừa
  // một ký tự. r=2 đảm bảo mọi vùng hiện được số của nó.
  //
  // Số vùng thực tế phụ thuộc mạnh vào ẢNH: fixture đo là ảnh kiểu chụp, đầy
  // gradient (sóng nước chu kỳ ~7px) nên sinh nhiều vùng mỏng bị loại. Tranh vẽ
  // minh hoạ có mảng màu phẳng và cạnh sạch sẽ cho số vùng cao hơn nhiều.
  minLabelRadius: 2,
}

export type PresetName = 'de' | 'vua' | 'kho' | 'sach'

export const PRESETS: Record<PresetName, Pick<PipelineParams, 'k' | 'targetRegions'>> = {
  de: { k: 10, targetRegions: 400 },
  vua: { k: 16, targetRegions: 1200 },
  kho: { k: 24, targetRegions: 3000 },
  sach: { k: 30, targetRegions: 4500 },
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
