const D_ORTHO = 1
const D_DIAG = Math.SQRT2

/**
 * Chamfer distance transform 2 lượt (thuận + nghịch).
 * Trả về khoảng cách từ mỗi pixel trong mask tới pixel ngoài mask gần nhất.
 * Pixel ngoài mask = 0.
 *
 * Biên ảnh được coi như nằm ngoài mask: vùng chiếm trọn ảnh vẫn có khoảng
 * cách hữu hạn, nhờ vậy anchorR luôn phản ánh "còn bao nhiêu chỗ để ghi số".
 */
export function chamferDistance(
  mask: Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const d = new Float32Array(w * h)
  const INF = Number.MAX_SAFE_INTEGER

  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0

  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0 // ngoài ảnh = ngoài vùng
    return d[y * w + x]
  }

  // lượt thuận: trên→dưới, trái→phải
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      v = Math.min(v, at(x - 1, y) + D_ORTHO)
      v = Math.min(v, at(x, y - 1) + D_ORTHO)
      v = Math.min(v, at(x - 1, y - 1) + D_DIAG)
      v = Math.min(v, at(x + 1, y - 1) + D_DIAG)
      d[i] = v
    }
  }

  // lượt nghịch: dưới→trên, phải→trái
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      v = Math.min(v, at(x + 1, y) + D_ORTHO)
      v = Math.min(v, at(x, y + 1) + D_ORTHO)
      v = Math.min(v, at(x + 1, y + 1) + D_DIAG)
      v = Math.min(v, at(x - 1, y + 1) + D_DIAG)
      d[i] = v
    }
  }

  return d
}
