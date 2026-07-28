import type { RgbaImage } from '@/core/types'

/**
 * Decode ảnh thành RGBA, ghép alpha lên nền TRẮNG.
 *
 * Ghép nền trắng là bắt buộc, không phải tuỳ chọn: ảnh PNG nền trong suốt mà
 * để nguyên alpha thì Stage 2 sẽ gom màu dựa trên RGB rác ở vùng trong suốt,
 * ra palette sai. Nền trắng cũng đúng với ý đồ sản phẩm — nền là một vùng
 * phải tô, không phải chỗ trống.
 *
 * Dùng OffscreenCanvas khi có (chạy được cả trong worker); fallback sang
 * canvas thường cho Safari cũ.
 */
export async function decodeToRgba(blob: Blob): Promise<RgbaImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('Không đọc được ảnh: file có thể bị lỗi hoặc định dạng không hỗ trợ')
  }

  const { width, height } = bitmap
  if (width === 0 || height === 0) {
    bitmap.close()
    throw new Error('Ảnh có kích thước 0')
  }

  const ctx = createContext(width, height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, width, height)
  return { data: imageData.data, width, height }
}

function createContext(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height)
    const ctx = c.getContext('2d')
    if (ctx) return ctx
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Browser không hỗ trợ canvas 2D')
  return ctx
}
