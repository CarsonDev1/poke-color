export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const HEIC_EXT = /\.(heic|heif)$/i

export interface UploadError {
  code: 'qua-lon' | 'khong-phai-anh' | 'heic-khong-ho-tro'
  message: string
}

/**
 * Kiểm tra trước khi nhận file. Trả null nếu hợp lệ.
 *
 * HEIC được kiểm TRƯỚC mọi thứ khác và kiểm theo cả đuôi file: trên máy Apple,
 * `file.type` của HEIC thường là chuỗi RỖNG, nên nếu chỉ dựa vào MIME thì
 * người dùng sẽ nhận lỗi "decode thất bại" vô nghĩa thay vì câu hướng dẫn đúng.
 */
export function validateUpload(file: {
  name: string
  type: string
  size: number
}): UploadError | null {
  if (file.type === 'image/heic' || file.type === 'image/heif' || HEIC_EXT.test(file.name)) {
    return {
      code: 'heic-khong-ho-tro',
      message: 'Browser không đọc được ảnh HEIC. Hãy chuyển sang JPG hoặc PNG rồi thử lại.',
    }
  }

  if (file.size <= 0 || !ACCEPTED_MIME.has(file.type)) {
    return {
      code: 'khong-phai-anh',
      message: 'Chỉ nhận ảnh PNG, JPG hoặc WebP.',
    }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      code: 'qua-lon',
      message: `Ảnh vượt 15 MB (${(file.size / 1024 / 1024).toFixed(1)} MB). Hãy giảm kích thước rồi thử lại.`,
    }
  }

  return null
}
