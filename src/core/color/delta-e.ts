import type { Lab } from '@/core/types'

/**
 * CIE76 — khoảng cách Euclid trong Lab.
 * Đủ cho việc gom màu ở Stage 2 và ngưỡng mergeDeltaE ở Stage 4;
 * không cần CIEDE2000 vì ta so sánh các màu palette cách nhau khá xa.
 */
export function deltaE76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}
