interface Box {
  /** index pixel (không phải offset trong mảng phẳng) */
  idx: Uint32Array
  /** kênh nào có biên độ lớn nhất: 0=L, 1=a, 2=b */
  axis: number
  spread: number
}

function boxOf(lab: Float32Array, idx: Uint32Array): Box {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < idx.length; i++) {
    const p = idx[i] * 3
    for (let c = 0; c < 3; c++) {
      const v = lab[p + c]
      if (v < min[c]) min[c] = v
      if (v > max[c]) max[c] = v
    }
  }
  let axis = 0
  let spread = -1
  for (let c = 0; c < 3; c++) {
    const s = max[c] - min[c]
    if (s > spread) {
      spread = s
      axis = c
    }
  }
  return { idx, axis, spread }
}

/**
 * Tìm vị trí cắt gần `mid` nhất mà không rơi vào giữa một dải pixel có cùng
 * giá trị trên trục `axis`. Cắt ngay giữa các giá trị bằng nhau là vô nghĩa:
 * cả hai hộp con vẫn chứa cùng giá trị đó, không tách được màu nào — và nếu
 * dải đó chính là toàn bộ một cụm màu (nhiều pixel trùng y hệt), cắt đôi nó
 * sẽ làm mất khả năng cô lập cụm màu đó ở các bước sau (đã kiểm chứng: 3 cụm
 * màu kích thước bằng nhau đặt dọc theo trục biên độ lớn nhất khiến trung vị
 * theo số lượng luôn rơi đúng vào giữa cụm ở giữa). Khi có nhiều ranh giới
 * cách `mid` bằng nhau, chọn ranh giới nhỏ hơn để giữ tính deterministic.
 */
function nearestValueBoundary(order: number[], lab: Float32Array, axis: number, mid: number): number {
  let best = -1
  let bestDist = Infinity
  for (let j = 1; j < order.length; j++) {
    if (lab[order[j - 1] * 3 + axis] === lab[order[j] * 3 + axis]) continue
    const dist = Math.abs(j - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = j
    }
  }
  return best
}

/**
 * Median cut trong Lab. Lặp: chọn hộp có biên độ lớn nhất, cắt tại trung vị
 * của kênh rộng nhất, tới khi có k hộp. Centroid = trung bình mỗi hộp.
 *
 * Hoàn toàn deterministic: không PRNG, không phụ thuộc thứ tự Map/Set.
 * Khi hết hộp cắt được (ít màu riêng biệt hơn k), nhân bản centroid cuối
 * để vẫn trả đủ k — Stage 2 sẽ để k-means hợp nhất các centroid trùng.
 */
export function medianCut(lab: Float32Array, k: number): Float32Array {
  const n = lab.length / 3
  const all = new Uint32Array(n)
  for (let i = 0; i < n; i++) all[i] = i

  let boxes: Box[] = [boxOf(lab, all)]

  while (boxes.length < k) {
    // chọn hộp biên độ lớn nhất còn cắt được; so sánh có tie-break theo
    // chỉ số để deterministic
    let best = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].idx.length < 2 || boxes[i].spread <= 0) continue
      if (best === -1 || boxes[i].spread > boxes[best].spread) best = i
    }
    if (best === -1) break

    const box = boxes[best]
    const axis = box.axis
    const sorted = Array.from(box.idx).sort((p, q) => {
      const d = lab[p * 3 + axis] - lab[q * 3 + axis]
      return d !== 0 ? d : p - q
    })
    const mid0 = sorted.length >> 1
    const boundary = nearestValueBoundary(sorted, lab, axis, mid0)
    // `spread > 0` (điều kiện chọn `best` ở trên) đảm bảo có ít nhất một
    // ranh giới giá trị trong khoảng [1, sorted.length - 1], nên `boundary`
    // không bao giờ là -1 ở đây; `mid0` chỉ là lưới an toàn về mặt lý thuyết.
    const mid = boundary === -1 ? mid0 : boundary
    const left = new Uint32Array(sorted.slice(0, mid))
    const right = new Uint32Array(sorted.slice(mid))

    boxes.splice(best, 1, boxOf(lab, left), boxOf(lab, right))
  }

  const out = new Float32Array(k * 3)
  for (let i = 0; i < k; i++) {
    const box = boxes[Math.min(i, boxes.length - 1)]
    let sL = 0
    let sa = 0
    let sb = 0
    for (let j = 0; j < box.idx.length; j++) {
      const p = box.idx[j] * 3
      sL += lab[p]
      sa += lab[p + 1]
      sb += lab[p + 2]
    }
    const m = box.idx.length || 1
    out[i * 3] = sL / m
    out[i * 3 + 1] = sa / m
    out[i * 3 + 2] = sb / m
  }
  return out
}
