/** screenX = imageX * scale + tx ; screenY = imageY * scale + ty */
export interface Viewport {
  scale: number
  tx: number
  ty: number
}

export function fitViewport(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): Viewport {
  const scale = Math.min(viewW / imgW, viewH / imgH)
  return {
    scale,
    tx: (viewW - imgW * scale) / 2,
    ty: (viewH - imgH * scale) / 2,
  }
}

export function imageToScreen(
  v: Viewport,
  ix: number,
  iy: number,
): { x: number; y: number } {
  return { x: ix * v.scale + v.tx, y: iy * v.scale + v.ty }
}

/** Trả về toạ độ PIXEL NGUYÊN (làm tròn xuống), dùng trực tiếp để tra regionMap. */
export function screenToImage(
  v: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: Math.floor((sx - v.tx) / v.scale),
    y: Math.floor((sy - v.ty) / v.scale),
  }
}

/**
 * Zoom quanh một điểm màn hình, GIỮ BẤT ĐỘNG điểm ảnh đang nằm dưới điểm đó.
 *
 * Suy ra: gọi p là toạ độ ảnh dưới con trỏ, ta cần
 *   p*s0 + t0 = p*s1 + t1  ⇒  t1 = t0 + p*(s0 - s1)
 * với p = (sx - t0)/s0.
 */
export function zoomAbout(
  v: Viewport,
  sx: number,
  sy: number,
  factor: number,
  minScale: number,
  maxScale: number,
): Viewport {
  const next = Math.min(maxScale, Math.max(minScale, v.scale * factor))
  if (next === v.scale) return v

  const px = (sx - v.tx) / v.scale
  const py = (sy - v.ty) / v.scale

  return {
    scale: next,
    tx: v.tx + px * (v.scale - next),
    ty: v.ty + py * (v.scale - next),
  }
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }
}

/**
 * Giữ ảnh không trượt ra ngoài khung.
 * Chiều nào ảnh nhỏ hơn khung thì canh giữa; chiều nào lớn hơn thì chặn để
 * không lộ khoảng trắng ở hai đầu.
 */
export function clampPan(
  v: Viewport,
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): Viewport {
  const w = imgW * v.scale
  const h = imgH * v.scale

  const tx = w <= viewW ? (viewW - w) / 2 : Math.min(0, Math.max(viewW - w, v.tx))
  const ty = h <= viewH ? (viewH - h) / 2 : Math.min(0, Math.max(viewH - h, v.ty))

  return { scale: v.scale, tx, ty }
}

/**
 * Điểm màn hình → id vùng. O(1): một phép biến đổi nghịch + một lần tra mảng.
 * Trả null khi bấm ra ngoài ảnh.
 */
export function hitTestRegion(
  v: Viewport,
  regionMap: Uint32Array,
  imgW: number,
  imgH: number,
  sx: number,
  sy: number,
): number | null {
  const { x, y } = screenToImage(v, sx, sy)
  if (x < 0 || y < 0 || x >= imgW || y >= imgH) return null
  return regionMap[y * imgW + x]
}
