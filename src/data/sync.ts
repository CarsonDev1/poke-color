import { Bitset } from '@/core/codec/bitset'
import type { ProgressRecord } from '@/data/local-cache'

/**
 * Hợp nhất tiến độ CÙNG một puzzle từ hai nguồn (local vs remote, hoặc hai
 * thiết bị tô song song).
 *
 * Ba tính chất được test trực tiếp, và cả ba đều cần thiết:
 * - **giao hoán**: đẩy-rồi-kéo hay kéo-rồi-đẩy đều cho cùng kết quả
 * - **luỹ đẳng**: replay outbox nhiều lần không làm sai lệch gì
 * - **kết hợp**: gộp ba thiết bị theo thứ tự nào cũng vậy
 *
 * Không sửa tại chỗ hai bản gốc — caller vẫn còn dùng chúng.
 */
export function mergeProgress(
  a: ProgressRecord,
  b: ProgressRecord,
  regionCount: number,
): ProgressRecord {
  if (a.puzzleId !== b.puzzleId) {
    throw new Error(
      `Không thể hợp nhất tiến độ của hai puzzle khác nhau: ${a.puzzleId} vs ${b.puzzleId}`,
    )
  }

  // fromBytes tạo bitset MỚI nên `or` tại chỗ không chạm vào a.filled/b.filled.
  // Truyền regionCount chứ không phải filled.length * 8: byte cuối có bit rác,
  // và Bitset.fromBytes dựa vào bitLength để xoá chúng trước khi đếm.
  const merged = Bitset.fromBytes(a.filled, regionCount)
  merged.or(Bitset.fromBytes(b.filled, regionCount))

  return {
    puzzleId: a.puzzleId,
    filled: merged.toBytes(),
    // ĐẾM LẠI từ bitset đã OR. `max(a,b)` sai: A tô {1,2}, B tô {3} ⇒ max = 2
    // trong khi đúng là 3.
    filledCount: merged.countOnes(),
    // max, KHÔNG cộng: hai thiết bị có thể chạy song song nên cộng là đếm trùng
    activeSeconds: Math.max(a.activeSeconds, b.activeSeconds),
    completedAt: minNonNull(a.completedAt, b.completedAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  }
}

/** Lần hoàn thành ĐẦU TIÊN mới là mốc thật. */
function minNonNull(x: number | null, y: number | null): number | null {
  if (x === null) return y
  if (y === null) return x
  return Math.min(x, y)
}
