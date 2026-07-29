import { listOutbox, listPuzzles, loadPuzzleRecord } from '@/data/local-cache'
import { syncProgress } from '@/data/progress-repo'
import { listRemotePuzzles, pullPuzzle, uploadPuzzle } from '@/data/puzzle-repo'

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

export interface PullOutcome {
  /** số puzzle MỚI tải từ server về máy này */
  pulled: number
  /** số puzzle đã hợp nhất lại tiến độ */
  merged: number
}

/**
 * KÉO VỀ: tải puzzle có trên server mà máy này chưa có, và hợp nhất tiến độ của
 * những puzzle đã có.
 *
 * Đây là nửa còn thiếu của "đồng bộ". Trước đó app chỉ đẩy lên, nên mở ở browser
 * khác hay điện thoại thì IndexedDB rỗng và thư viện trống trơn dù server có đủ
 * dữ liệu — đúng thứ người dùng gặp.
 *
 * Hai việc, không phải một:
 *  - puzzle THIẾU  ⇒ `pullPuzzle` tải 3 tệp + metadata về
 *  - puzzle ĐÃ CÓ ⇒ `syncProgress` hợp nhất bitset hai chiều (OR), để "tô dở
 *    trên máy tính, tô tiếp trên điện thoại" thật sự hoạt động
 *
 * Không ném ra ngoài: mất mạng thì trả về số 0 và app vẫn chạy với dữ liệu cục bộ.
 */
export async function pullDown(userId: string): Promise<PullOutcome> {
  let pulled = 0
  let merged = 0

  try {
    const [remote, local] = await Promise.all([listRemotePuzzles(userId), listPuzzles()])
    const localIds = new Set(local.map((p) => p.id))

    for (const r of remote) {
      try {
        if (!localIds.has(r.id)) {
          if (await pullPuzzle(r, userId)) {
            pulled++
            // vừa tải xong thì kéo luôn tiến độ, nếu không người dùng thấy 0%
            // trên một bức đã tô dở ở máy khác
            await syncProgress(r.id, userId, r.regionCount)
          }
          continue
        }
        await syncProgress(r.id, userId, r.regionCount)
        merged++
      } catch {
        // một puzzle lỗi không được chặn những cái còn lại
      }
    }
  } catch {
    // không có mạng / chưa cấu hình Supabase — im lặng, dùng dữ liệu cục bộ
  }

  return { pulled, merged }
}
