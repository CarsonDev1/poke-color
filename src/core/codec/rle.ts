/**
 * RLE theo dòng cho bản đồ id vùng.
 * Đầu ra là các cặp [runLength, value] nối tiếp. Run KHÔNG vắt qua biên
 * dòng — giữ định dạng khớp với region-runs và làm việc giải mã đơn giản.
 */
export function encodeRowRle(
  map: Uint32Array,
  width: number,
  height: number,
): Uint32Array {
  const out: number[] = []
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const v = map[y * width + x]
      let len = 1
      while (x + len < width && map[y * width + x + len] === v) len++
      out.push(len, v)
      x += len
    }
  }
  return new Uint32Array(out)
}

export function decodeRowRle(
  rle: Uint32Array,
  width: number,
  height: number,
): Uint32Array {
  const map = new Uint32Array(width * height)
  let p = 0
  for (let i = 0; i < rle.length; i += 2) {
    const len = rle[i]
    const v = rle[i + 1]
    for (let j = 0; j < len; j++) {
      if (p >= map.length) {
        throw new Error('RLE không khớp kích thước ảnh: dữ liệu dài hơn width*height')
      }
      map[p++] = v
    }
  }
  if (p !== map.length) {
    throw new Error(
      `RLE không khớp kích thước ảnh: giải ra ${p} pixel, cần ${map.length}`,
    )
  }
  return map
}
