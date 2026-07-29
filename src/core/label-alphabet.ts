/**
 * Bảng nhãn màu, sao chép nguyên quy ước legend của sách tham chiếu:
 * `1 2 3 4 5 6 7 8 9 0` rồi `a b c d e f h k l m n p r s t u v x y z`.
 *
 * CỐ TÌNH bỏ `g i j o q w`. Khi in nhỏ trong một vùng vài chục pixel,
 * `g` lẫn với `9`, `i` với `1`, `o` với `0`, `q` với `9`, `j` với `i`,
 * và `w` đọc thành `vv`. Đừng "hoàn thiện" bảng bằng cách thêm lại chúng.
 *
 * Số 0 nằm ở vị trí thứ 10 (không phải đầu) vì người dùng đếm màu từ 1;
 * `colorLabel(0) === '1'`.
 */
export const LABEL_ALPHABET = '1234567890abcdefhklmnprstuvxyz'

/** Trần số màu mà bảng nhãn phủ được. `k` trong PipelineParams không được vượt. */
export const MAX_LABELLED_COLORS = LABEL_ALPHABET.length

/**
 * Nhãn hiển thị cho một `colorIndex` (0-based nội bộ).
 *
 * PHẢI là nguồn duy nhất sinh nhãn. Nhãn in trên tranh (`drawLabels`) mà lệch
 * nhãn trên nút palette (`PaletteBar`) hay lệch thông báo aria-live là lỗi
 * không type checker nào bắt được và người dùng gặp ngay lần đầu dùng.
 */
export function colorLabel(colorIndex: number): string {
  if (
    !Number.isInteger(colorIndex) ||
    colorIndex < 0 ||
    colorIndex >= LABEL_ALPHABET.length
  ) {
    throw new Error(
      `colorIndex ${colorIndex} ngoài phạm vi bảng nhãn 0..${LABEL_ALPHABET.length - 1}`,
    )
  }
  return LABEL_ALPHABET[colorIndex]
}
