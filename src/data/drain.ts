import { listOutbox, loadPuzzleRecord } from '@/data/local-cache'
import { syncProgress } from '@/data/progress-repo'
import { uploadPuzzle } from '@/data/puzzle-repo'

/**
 * File riêng, KHÔNG nhập vào `sync.ts`, để tránh vòng import: `progress-repo`
 * đã import `sync.ts` cho `mergeProgress`, nên nếu `sync.ts` import lại
 * `progress-repo` thì thành vòng.
 */

export interface DrainOutcome {
  /** số việc đẩy xong */
  done: number
  /** số việc còn lại (thất bại, sẽ thử lại lần sau) */
  remaining: number
}

/**
 * Đẩy hết việc đang chờ lên Supabase.
 *
 * Puzzle đi TRƯỚC progress: `progress.puzzle_id` có khoá ngoại tới `puzzles`,
 * nên đẩy tiến độ của một puzzle chưa tồn tại trên server sẽ lỗi khoá ngoại và
 * mãi không bao giờ thành công.
 *
 * Việc nào lỗi thì để nguyên trong outbox — repo tự quyết định dequeue hay
 * không, ở đây chỉ đếm.
 */
export async function drainOutbox(userId: string): Promise<DrainOutcome> {
  const items = await listOutbox()
  if (items.length === 0) return { done: 0, remaining: 0 }

  // 'puzzle' trước 'progress'
  const ordered = [...items].sort((a, b) => {
    if (a.kind === b.kind) return a.queuedAt - b.queuedAt
    return a.kind === 'puzzle' ? -1 : 1
  })

  let done = 0
  for (const item of ordered) {
    try {
      if (item.kind === 'puzzle') {
        const r = await uploadPuzzle(item.puzzleId, userId)
        if (r.ok) done++
      } else {
        const rec = await loadPuzzleRecord(item.puzzleId)
        // Không biết regionCount thì không dựng lại bitset được. Puzzle đã bị
        // xoá cục bộ mà outbox còn sót — bỏ qua, `deletePuzzle` đã lo dọn nên
        // đây chỉ là lưới an toàn.
        if (!rec) continue
        await syncProgress(item.puzzleId, userId, rec.regionCount)
        done++
      }
    } catch {
      // giữ trong outbox, thử lại lần sau
    }
  }

  const left = await listOutbox()
  return { done, remaining: left.length }
}
