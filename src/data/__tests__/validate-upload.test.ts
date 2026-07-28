import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, validateUpload } from '@/data/validate-upload'

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'anh.png',
  type: 'image/png',
  size: 1024,
  ...over,
})

describe('validateUpload', () => {
  it('PNG/JPEG/WebP hợp lệ → null', () => {
    expect(validateUpload(file({ type: 'image/png' }))).toBeNull()
    expect(validateUpload(file({ name: 'a.jpg', type: 'image/jpeg' }))).toBeNull()
    expect(validateUpload(file({ name: 'a.webp', type: 'image/webp' }))).toBeNull()
  })

  it('quá 15 MB → qua-lon, thông báo có nêu giới hạn', () => {
    const e = validateUpload(file({ size: MAX_UPLOAD_BYTES + 1 }))
    expect(e?.code).toBe('qua-lon')
    expect(e?.message).toMatch(/15/)
  })

  it('đúng 15 MB thì vẫn nhận', () => {
    expect(validateUpload(file({ size: MAX_UPLOAD_BYTES }))).toBeNull()
  })

  it('không phải ảnh → khong-phai-anh', () => {
    expect(validateUpload(file({ name: 'a.pdf', type: 'application/pdf' }))?.code).toBe(
      'khong-phai-anh',
    )
  })

  it('HEIC theo MIME → heic-khong-ho-tro, thông báo gợi ý chuyển sang JPG/PNG', () => {
    const e = validateUpload(file({ name: 'a.heic', type: 'image/heic' }))
    expect(e?.code).toBe('heic-khong-ho-tro')
    expect(e?.message).toMatch(/JPG|PNG/i)
  })

  it('HEIC khi type RỖNG vẫn bị bắt qua đuôi file', () => {
    expect(validateUpload(file({ name: 'IMG_0042.HEIC', type: '' }))?.code).toBe(
      'heic-khong-ho-tro',
    )
    expect(validateUpload(file({ name: 'x.heif', type: '' }))?.code).toBe(
      'heic-khong-ho-tro',
    )
  })

  it('kiểm tra HEIC TRƯỚC kiểm tra kích thước để thông báo hữu ích hơn', () => {
    const e = validateUpload(file({ name: 'a.heic', type: '', size: MAX_UPLOAD_BYTES * 2 }))
    expect(e?.code).toBe('heic-khong-ho-tro')
  })

  it('SVG bị từ chối (không rasterize được ổn định)', () => {
    expect(validateUpload(file({ name: 'a.svg', type: 'image/svg+xml' }))?.code).toBe(
      'khong-phai-anh',
    )
  })

  it('file rỗng → khong-phai-anh', () => {
    expect(validateUpload(file({ size: 0 }))?.code).toBe('khong-phai-anh')
  })
})
