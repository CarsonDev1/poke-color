/**
 * Ngưỡng theo spec §22, KHÔNG phải §17. Bản gốc đặt 2000 vì cho rằng vùng vụn
 * là lỗi; trang sách tham chiếu chứng minh ngược lại — 4500 vùng là MỤC TIÊU.
 * Để 2000 thì mọi puzzle sinh ở mặc định đều bị app tự tố là lỗi.
 */
export const MAX_GOOD_REGIONS = 8000
export const MIN_GOOD_REGIONS = 20

export type QualityVerdict =
  | { level: 'ok' }
  | { level: 'qua-vun' | 'qua-tho'; message: string; hint: string }

/**
 * Đánh giá kết quả sinh puzzle.
 * Gợi ý phải nói rõ kéo slider nào theo hướng nào — chỉ báo "quá vụn" thì
 * người dùng không biết phải làm gì tiếp.
 */
export function checkQuality(regionCount: number): QualityVerdict {
  if (regionCount > MAX_GOOD_REGIONS) {
    return {
      level: 'qua-vun',
      message: `Ảnh này ra ${regionCount} vùng — quá vụn để tô.`,
      hint: 'Hãy kéo "độ chi tiết" xuống, hoặc giảm "số màu", rồi bấm Sinh lại.',
    }
  }
  if (regionCount < MIN_GOOD_REGIONS) {
    return {
      level: 'qua-tho',
      message: `Ảnh này chỉ ra ${regionCount} vùng — quá thô, tô xong rất nhanh.`,
      hint: 'Hãy kéo "độ chi tiết" lên, hoặc tăng "số màu", rồi bấm Sinh lại.',
    }
  }
  return { level: 'ok' }
}
