import { medianCut } from '@/core/quantize/median-cut'

/**
 * k-means (Lloyd) trong Lab, khởi tạo bằng median-cut nên không cần PRNG.
 * Dừng khi không có nhãn nào đổi, hoặc hết maxIters.
 * Cụm rỗng giữ nguyên centroid cũ (không tái khởi tạo ngẫu nhiên) để
 * bảo toàn tính deterministic.
 */
export function kmeansLab(
  lab: Float32Array,
  k: number,
  maxIters = 20,
): { labels: Uint8Array; centroids: Float32Array } {
  const n = lab.length / 3
  const centroids = medianCut(lab, k)
  const labels = new Uint8Array(n)

  const sums = new Float64Array(k * 3)
  const counts = new Uint32Array(k)

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false

    for (let i = 0; i < n; i++) {
      const L = lab[i * 3]
      const a = lab[i * 3 + 1]
      const b = lab[i * 3 + 2]

      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dL = L - centroids[c * 3]
        const da = a - centroids[c * 3 + 1]
        const db = b - centroids[c * 3 + 2]
        const d = dL * dL + da * da + db * db
        // `<` chứ không `<=` ⇒ tie luôn về centroid có chỉ số nhỏ hơn
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        changed = true
      }
    }

    sums.fill(0)
    counts.fill(0)
    for (let i = 0; i < n; i++) {
      const c = labels[i]
      sums[c * 3] += lab[i * 3]
      sums[c * 3 + 1] += lab[i * 3 + 1]
      sums[c * 3 + 2] += lab[i * 3 + 2]
      counts[c]++
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue
      centroids[c * 3] = sums[c * 3] / counts[c]
      centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c]
      centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c]
    }

    if (!changed) break
  }

  return { labels, centroids }
}
