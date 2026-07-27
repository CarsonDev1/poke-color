import type { RgbaImage } from '@/core/types'

/** median của 9 phần tử bằng mạng sắp xếp cục bộ — nhanh hơn sort() */
function median9(v: number[]): number {
  v.sort((a, b) => a - b)
  return v[4]
}

/**
 * Median 3×3 từng kênh, biên kẹp (clamp) toạ độ.
 * Alpha giữ nguyên vì Stage 0 đã ghép alpha lên nền trắng.
 */
export function median3x3(img: RgbaImage, passes: number): RgbaImage {
  const { width: w, height: h } = img
  let src = new Uint8ClampedArray(img.data)

  for (let p = 0; p < passes; p++) {
    const dst = new Uint8ClampedArray(src)
    const buf: number[] = new Array(9)
    // Cửa sổ 3x3 màu gốc (từ src của lượt này), thu song song với buf để có
    // thể snap median về màu thật gần nhất sau khi tính xong cả 3 kênh.
    const winR: number[] = new Array(9)
    const winG: number[] = new Array(9)
    const winB: number[] = new Array(9)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        let mr = 0
        let mg = 0
        let mb = 0
        for (let c = 0; c < 3; c++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy))
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx))
              const s = (yy * w + xx) * 4
              const v = src[s + c]
              buf[n] = v
              if (c === 0) winR[n] = v
              else if (c === 1) winG[n] = v
              else winB[n] = v
              n++
            }
          }
          const m = median9(buf)
          if (c === 0) mr = m
          else if (c === 1) mg = m
          else mb = m
        }

        // Median từng kênh có thể sinh ra màu KHÔNG tồn tại trong ảnh (marginal median):
        // kênh đỏ lấy từ pixel này, kênh lục lấy từ pixel kia. Ở biên hai vùng màu, màu
        // bịa đó có thể thắng hẳn một cluster k-means ở Stage 2 và làm hai màu thật bị
        // nhập thành một vùng màu pha — đã đo được trên ảnh 4 màu với k=4.
        // Cách chặn: snap về màu GỐC gần nhất trong 9 pixel của cửa sổ. Chỉ 9 phép tính
        // khoảng cách mỗi pixel, rẻ hơn nhiều so với vector median thật (36 phép).
        let bestIdx = 0
        let bestDist = Infinity
        for (let k = 0; k < 9; k++) {
          const dr = winR[k] - mr
          const dg = winG[k] - mg
          const db = winB[k] - mb
          const d = dr * dr + dg * dg + db * db
          // `<` chứ không `<=` ⇒ tie luôn về chỉ số cửa sổ nhỏ hơn (deterministic)
          if (d < bestDist) {
            bestDist = d
            bestIdx = k
          }
        }
        dst[o] = winR[bestIdx]
        dst[o + 1] = winG[bestIdx]
        dst[o + 2] = winB[bestIdx]
      }
    }
    src = dst
  }

  return { data: src, width: w, height: h }
}
